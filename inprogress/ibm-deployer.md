# Phase I — IBM Cloud Deployer

## Goal

Ship an IBM Cloud deployer covering IBM's VPC IaaS, Code Engine (serverless), Cloud Functions, Databases for X (managed DBs), Cloud Object Storage (COS), Cloud Internet Services (CIS — DNS+WAF+CDN), Kubernetes Service (IKS) / OpenShift on IBM Cloud, Key Protect, Secrets Manager, Activity Tracker (logs), Monitoring, Cloudant, Event Streams, MQ on Cloud, App ID, IAM, Container Registry, Watson AI services.

## Provider primer

- **Auth**: IBM Cloud IAM API key (preferred). Service ID API keys for app-level deploys. Trusted profiles for runtime workloads.
- **Regions**: MZRs (Multi-Zone Regions) — `us-south`, `us-east`, `eu-de`, `eu-gb`, `jp-tok`, `au-syd`, `ca-tor`, `br-sao`. Resources are MZR-scoped.
- **Resource groups**: like Azure resource groups + AWS accounts. Every resource lives inside one. Default = `Default`. The deployer takes `resource_group` at init.
- **SDK**: split across many packages. Foundational:
  - `ibm-cloud-sdk-core` — auth + base client + pagination
  - `@ibm-cloud/platform-services` — IAM / Resource Manager / Catalog / Tags
  - `@ibm-cloud/vpc` — VPC + IaaS
  - `ibm-cos-sdk` — Cloud Object Storage (S3-compatible)
  - `@ibm-cloud/cloudant` — Cloudant (CouchDB-ish)
  - `@ibm-cloud/event-notifications` — Notifications
  - Service-specific: `@ibm-cloud/secrets-manager`, `@ibm-cloud/code-engine`, etc.
- **Long-running ops**: most resource-creates return a job ID via Resource Controller. Poll `ResourceControllerV2.getResourceInstance(id)` until `state` is `active`.

## Block coverage matrix (27 handlers)

### P0 — must-have (12)

| Block iceType                      | IBM service                             | Handler                      | SDK package                  |
| ---------------------------------- | --------------------------------------- | ---------------------------- | ---------------------------- |
| `Compute.BackendAPI` / `Container` | Code Engine application                 | `ibm.codeengine.application` | `@ibm-cloud/code-engine`     |
| `Compute.ServerlessFunction`       | Code Engine function or Cloud Functions | `ibm.codeengine.function`    | `@ibm-cloud/code-engine`     |
| `Compute.CronJob`                  | Code Engine job + scheduler             | `ibm.codeengine.job`         | `@ibm-cloud/code-engine`     |
| `Compute.VirtualMachine`           | VPC Virtual Server Instance             | `ibm.vpc.instance`           | `@ibm-cloud/vpc`             |
| `Database.PostgreSQL`              | Databases for PostgreSQL                | `ibm.databases.postgresql`   | `ibm-cloud-sdk-core` + REST  |
| `Database.MySQL`                   | Databases for MySQL                     | `ibm.databases.mysql`        | same                         |
| `Database.MongoDB`                 | Databases for MongoDB                   | `ibm.databases.mongodb`      | same                         |
| `Database.Redis` / `Cache`         | Databases for Redis                     | `ibm.databases.redis`        | same                         |
| `Storage.Bucket`                   | Cloud Object Storage (COS) bucket       | `ibm.cos.bucket`             | `ibm-cos-sdk`                |
| `Network.VPC`                      | VPC                                     | `ibm.vpc.vpc`                | `@ibm-cloud/vpc`             |
| `Network.Subnet`                   | VPC Subnet                              | `ibm.vpc.subnet`             | `@ibm-cloud/vpc`             |
| `Security.Secret`                  | Secrets Manager Secret                  | `ibm.secretsmanager.secret`  | `@ibm-cloud/secrets-manager` |

### P1 — important (9)

| Block                       | IBM service                                                      | Handler                                                               |
| --------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Network.SecurityGroup`     | VPC Security Group                                               | `ibm.vpc.securitygroup` (`@ibm-cloud/vpc`)                            |
| `Network.LoadBalancer`      | VPC Load Balancer                                                | `ibm.vpc.loadbalancer` (`@ibm-cloud/vpc`)                             |
| `Network.CustomDomain`      | Cloud Internet Services DNS Zone                                 | `ibm.cis.zone` (`@ibm-cloud/cloudant` REST? — uses platform-services) |
| `Network.WAF`               | Cloud Internet Services WAF rules                                | `ibm.cis.wafrule`                                                     |
| `Compute.Kubernetes`        | IKS / OpenShift on IBM Cloud                                     | `ibm.containers.cluster` (REST)                                       |
| `Compute.ContainerRegistry` | IBM Cloud Container Registry                                     | `ibm.containerregistry.namespace`                                     |
| `Security.Identity`         | App ID instance                                                  | `ibm.appid.instance`                                                  |
| `Security.Certificate`      | Certificate Manager (deprecated) → Secrets Manager imported cert | `ibm.secretsmanager.importedcert`                                     |
| `Monitoring.Log`            | Activity Tracker on Cloud Logs (LogDNA)                          | `ibm.logging.instance`                                                |

### P2 — long tail (6)

| Block                            | IBM service                   | Handler                                         |
| -------------------------------- | ----------------------------- | ----------------------------------------------- |
| `Database.NoSQL`                 | Cloudant                      | `ibm.cloudant.database` (`@ibm-cloud/cloudant`) |
| `Messaging.EventStream`          | Event Streams (Kafka)         | `ibm.eventstreams.topic`                        |
| `Messaging.Queue`                | MQ on Cloud                   | `ibm.mq.queuemanager`                           |
| `Messaging.Topic`                | Event Notifications           | `ibm.eventnotifications.instance`               |
| `AI.LLMGateway` / `ModelServing` | watsonx.ai                    | `ibm.watsonx.deployment`                        |
| `Monitoring.Alert`               | IBM Cloud Monitoring (Sysdig) | `ibm.monitoring.alert`                          |

## SDK packages to install (~12 packages)

`ibm-cloud-sdk-core` + the service-specific packages above. Total ~30MB installed.

## Scaffolding (I1)

```
packages/core/src/deploy/providers/ibm/
├── ibm-deployer.ts
├── types.ts                        # IBMHandlerContext: { account_id, resource_group, region }
├── sdk-loader.ts                   # IamAuthenticator + per-service client builder
├── auth.ts                         # validate_iam_key, list_resource_groups
├── resource-controller.ts          # poll resource instance until 'active'
├── _result.ts
├── handlers/
│   ├── code-engine-application.ts
│   ├── code-engine-function.ts
│   ├── code-engine-job.ts
│   ├── vpc-instance.ts
│   ├── databases-postgresql.ts
│   ├── databases-mysql.ts
│   ├── databases-mongodb.ts
│   ├── databases-redis.ts
│   ├── cos-bucket.ts
│   ├── vpc.ts
│   ├── vpc-subnet.ts
│   ├── secrets-manager-secret.ts
│   └── ... (27 handlers total)
└── README.md
```

Dispatch: `ibm.<service>.<resource>`.

## Quirks (I4)

- **Resource Controller pattern**: most managed services (Databases, Secrets Manager, Event Streams) are provisioned via `ResourceControllerV2.createResourceInstance({ name, target, resource_group, resource_plan_id })`. Each service has a `resource_plan_id` GUID per pricing plan. The sdk-loader caches a `plan_id_lookup` map (e.g., `databases-for-postgresql:standard` → GUID).
- **COS bucket regional vs cross-region**: bucket location is independent of the COS instance region — operator chooses via `properties.location_constraint` (e.g., `us-south-standard`, `us-cross-region-standard`).
- **CIS sub-services**: DNS Zones, Page Rules, WAF rules, Load Balancers all live under a single CIS instance. The deployer auto-creates a `ice-default-cis` instance per resource group on first DNS / WAF block deploy (mirror to Azure container-apps env auto-bootstrap quirk).
- **Code Engine project**: applications, functions, and jobs all live inside a Project. Auto-create `ice-default-ce` Project on first Code Engine block deploy.
- **App ID instance vs identity provider**: a single App ID instance can host multiple tenants; the canvas Security.Identity block maps to one instance.
- **Watson AI key requirement**: every Watson API call needs an API key from the bound instance. The handler reads `properties.api_key` or auto-binds the instance to a service credential.

## Auth (I5)

`validate_iam_key(api_key): Promise<{ account_id, email }>` — exchanges the API key for an IAM token via the IAM Identity Service, returns the bound account + user metadata for the settings UI.

## SDK verification (I9)

IBM SDKs use a `<Method>Params` interface per operation, declared in `dist-types/<service>-v<version>.d.ts`:

```ts
export interface CreateResourceInstanceParams {
  name: string;
  target: string;
  resourceGroup: string;
  resourcePlanId: string;
  ...
}
```

The verifier extension:

- Resolve `<pkg>/dist-types/*.d.ts`.
- Match handler call `client.createResourceInstance({...})` → find `interface CreateResourceInstanceParams` → extract properties.
- Some IBM SDKs ship interfaces inside namespaces (e.g., `Vpc.CreateInstanceParams`); the resolver needs to walk namespaces.

## Estimated effort

P0 (12): ~12 hours + 5 hours testing + 2 hours docs.
P1 (9): ~8 hours + 3 hours testing.
P2 (6): ~6 hours + 2 hours testing.
Foundation + auth + resource-controller poller + sdk-loader: ~4 hours.
Live-test foundation: ~2 hours.
SDK verification extension: ~2 hours.

**Total: ~46 hours**. Realistic across 6–8 sessions.

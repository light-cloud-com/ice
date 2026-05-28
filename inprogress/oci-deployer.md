# Phase G — Oracle Cloud Infrastructure (OCI) Deployer

## Goal

Ship an OCI deployer covering OCI's IaaS + PaaS + managed services (Compute, OKE, Functions, Container Instances, Block/Object/File Storage, Autonomous Database, MySQL Database Service, NoSQL, Cache, VCN, Load Balancer, DNS, Streaming, Vault, IAM, OCI Generative AI, Container Registry).

## Provider primer

- **Auth**: 4 modes —
  1. Config file (~/.oci/config) + API key (private key file)
  2. Instance principal (when running on an OCI VM)
  3. Resource principal (for OCI Functions / Container Instances)
  4. Session token (oci session authenticate)
- **Regions**: identifiers like `us-ashburn-1`, `us-phoenix-1`, `eu-frankfurt-1`. Some services are global (IAM, DNS), most regional.
- **Compartments**: every resource lives inside a compartment (logical isolation). The deployer takes `compartment_id` as a required init arg.
- **SDK**: `oci-sdk` umbrella — actually split across ~80 npm packages by service (e.g., `oci-core`, `oci-database`, `oci-objectstorage`, `oci-loadbalancer`, `oci-functions`). Each package exports a `<Service>Client` class.
- **Long-running ops**: most APIs return a `WorkRequest` ID; client polls `WorkRequestClient.getWorkRequest(id)` until `Status` is `SUCCEEDED` / `FAILED`. A polling helper is needed in `oci/sdk-loader.ts`.

## Block coverage matrix (31 handlers)

### P0 — must-have (14)

| Block iceType                      | OCI service                     | Handler                           | SDK package              |
| ---------------------------------- | ------------------------------- | --------------------------------- | ------------------------ |
| `Compute.BackendAPI` / `Container` | Compute VM                      | `oci.core.instance`               | `oci-core`               |
| `Compute.Container` (serverless)   | Container Instances             | `oci.containerinstance.instance`  | `oci-containerinstances` |
| `Compute.ServerlessFunction`       | OCI Functions                   | `oci.functions.function`          | `oci-functions`          |
| `Compute.CronJob`                  | Resource Scheduler              | `oci.resourcescheduler.schedule`  | `oci-resourcescheduler`  |
| `Database.PostgreSQL`              | OCI Database with PostgreSQL    | `oci.psql.dbsystem`               | `oci-psql`               |
| `Database.MySQL`                   | MySQL HeatWave Database Service | `oci.mysql.dbsystem`              | `oci-mysql`              |
| `Database.Autonomous` (Oracle)     | Autonomous Database             | `oci.database.autonomousdatabase` | `oci-database`           |
| `Database.NoSQL`                   | NoSQL Database                  | `oci.nosql.table`                 | `oci-nosql`              |
| `Database.Redis` / `Cache`         | OCI Cache (Redis)               | `oci.redis.cluster`               | `oci-redis`              |
| `Storage.Bucket`                   | Object Storage bucket           | `oci.objectstorage.bucket`        | `oci-objectstorage`      |
| `Network.VPC`                      | VCN                             | `oci.core.vcn`                    | `oci-core`               |
| `Network.Subnet`                   | Subnet                          | `oci.core.subnet`                 | `oci-core`               |
| `Network.SecurityGroup`            | NetworkSecurityGroup            | `oci.core.networksecuritygroup`   | `oci-core`               |
| `Security.Secret`                  | Vault Secret                    | `oci.vault.secret`                | `oci-vault`              |

### P1 — important (10)

| Block                       | OCI service                  | Handler                                                       |
| --------------------------- | ---------------------------- | ------------------------------------------------------------- |
| `Network.LoadBalancer`      | Load Balancer Service        | `oci.loadbalancer.loadbalancer` (`oci-loadbalancer`)          |
| `Network.CustomDomain`      | OCI DNS Zone                 | `oci.dns.zone` (`oci-dns`)                                    |
| `Network.Gateway`           | API Gateway                  | `oci.apigateway.gateway` (`oci-apigateway`)                   |
| `Network.PrivateNetwork`    | Private Endpoint             | `oci.core.privateaccessgateway` (`oci-core`)                  |
| `Compute.Kubernetes`        | OKE                          | `oci.containerengine.cluster` (`oci-containerengine`)         |
| `Compute.ContainerRegistry` | OCI Container Registry       | `oci.artifacts.repository` (`oci-artifacts`)                  |
| `Security.Identity`         | IAM Identity Domains / Users | `oci.identitydomains.user` (`oci-identitydomains`)            |
| `Security.Certificate`      | Certificate Service          | `oci.certificates.certificate` (`oci-certificatesmanagement`) |
| `Security.WAF`              | OCI Web Application Firewall | `oci.waf.policy` (`oci-waf`)                                  |
| `Monitoring.Log`            | Logging Service              | `oci.logging.loggroup` + `oci.logging.log` (`oci-logging`)    |

### P2 — long tail (7)

| Block                     | OCI service                      | Handler                                               |
| ------------------------- | -------------------------------- | ----------------------------------------------------- |
| `Messaging.Queue`         | OCI Queue                        | `oci.queue.queue` (`oci-queue`)                       |
| `Messaging.EventStream`   | Streaming Service                | `oci.streaming.stream` (`oci-streaming`)              |
| `Messaging.Topic`         | Notifications                    | `oci.ons.topic` (`oci-ons`)                           |
| `Analytics.DataWarehouse` | Analytics Cloud                  | `oci.analytics.instance` (`oci-analytics`)            |
| `Monitoring.Alert`        | Monitoring Alarm                 | `oci.monitoring.alarm` (`oci-monitoring`)             |
| `AI.LLMGateway`           | Generative AI Inference Endpoint | `oci.generativeai.endpoint` (`oci-generativeai`)      |
| `AI.ModelServing`         | Data Science Model Deployment    | `oci.datascience.modeldeployment` (`oci-datascience`) |

## SDK packages to install (~18 packages)

`oci-common` (auth + types) + one package per service prefix above. Total ~80MB installed.

## Scaffolding (G1)

```
packages/core/src/deploy/providers/oci/
├── oci-deployer.ts
├── types.ts                        # OCIHandlerContext with compartment_id
├── sdk-loader.ts                   # creates ConfigFileAuthenticationDetailsProvider
├── auth.ts                         # validate_oci_config, list_compartments
├── compartment.ts                  # ensure_compartment helper
├── work-request.ts                 # poll work-request until SUCCEEDED
├── _result.ts
├── handlers/
│   ├── compute-instance.ts
│   ├── container-instance.ts
│   ├── functions.ts
│   ├── psql.ts
│   ├── ... (31 handlers)
└── README.md
```

Dispatch: `oci.<service>.<resource>`.

## Quirks (G4)

- **Work requests**: every async op returns `opc-work-request-id`. Implement `oci/work-request.ts` to poll until terminal. Most handlers' `beginXxx` calls need a `pollWorkRequest(wrId)` step before returning.
- **Compartment OCIDs**: every create takes `compartmentId`. Handler default = `ctx.compartment_id`; per-block override via `properties.compartment_id`.
- **Object Storage namespace**: bucket APIs need `namespaceName` (tenancy-wide). The sdk-loader caches the namespace from `ObjectStorageClient.getNamespace()` on init.
- **Autonomous DB password requirement**: 12–30 chars, includes upper/lower/digit/special, no admin/user names. Handler validates and surfaces a clear error (mirrors AWS RDS / Azure Flex contract).
- **DNS zones**: OCI distinguishes primary vs secondary; canvas blocks always create primary.
- **Authentication detail providers**: config-file, instance-principal, resource-principal. The sdk-loader picks based on env (`OCI_AUTH_MODE=instance-principal` for in-OCI deploys, default to config file at `~/.oci/config`).

## Auth (G5)

`validate_oci_credentials({ config_path, profile, compartment_id }): Promise<boolean>` — runs `IdentityClient.listAvailabilityDomains` as the connectivity probe.

## SDK verification (G9)

OCI SDKs declare request types in `node_modules/oci-<svc>/lib/request/<op>-request.d.ts` with shapes like:

```ts
export interface CreateBucketRequest {
  namespaceName: string;
  createBucketDetails: model.CreateBucketDetails;
  opcClientRequestId?: string;
  opcRetryToken?: string;
}
```

The verifier extension:

- Glob `lib/request/*.d.ts` per SDK package.
- Match request name → extract top-level property names.
- For nested `model.<X>` types, follow to `lib/model/<x>.d.ts` and extract.

## Estimated effort

P0 (14): ~14 hours + 6 hours testing + 2 hours docs.
P1 (10): ~9 hours + 4 hours testing.
P2 (7): ~6 hours + 2 hours testing.
Foundation + auth + work-request helper + sdk-loader: ~5 hours.
Live-test foundation: ~2 hours.
SDK verification extension: ~2 hours.

**Total: ~52 hours**. Realistic across 7–9 sessions.

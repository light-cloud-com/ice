# Blocks Reference

ICE's canvas is built from **concept blocks** - provider-neutral building blocks like _Static Site_, _Scalable Backend_, _Postgres_, _Message Queue_. Each concept resolves, at deploy time, to a specific cloud primitive depending on the selected provider (Cloud Run on GCP, ECS on AWS, App Service on Azure).

This page enumerates the concept palette and points at where each concept is defined, validated, and implemented.

## Where things live

```
packages/blocks/src/
├── common/concepts/       The 28-concept palette (provider-neutral)
│   ├── api-gateway/
│   ├── custom-domain/
│   ├── email-service/
│   ├── env-config/
│   ├── event-stream/
│   ├── github-repo/
│   ├── llm-gateway/
│   ├── message-queue/
│   ├── mongodb/
│   ├── mysql/
│   ├── object-storage/
│   ├── observability/
│   ├── postgres/
│   ├── private-ai-service/
│   ├── private-network/
│   ├── public-traffic/
│   ├── redis-cache/
│   ├── scalable-backend/
│   ├── scheduled-task/
│   ├── secret-store/
│   ├── serverless-function/
│   ├── ssr-site/
│   ├── static-site/
│   ├── vector-db/
│   ├── worker/
│   └── … and a couple more
├── aws/                   Provider-specific variants (when a concept maps differently per AWS service)
├── azure/                 Same for Azure
├── gcp/                   Same for GCP
└── requirements/          What a concept requires from connected blocks
```

Each concept folder contains:

- `index.ts` - the concept's definition (id, label, category, default properties, edges it legally accepts).
- `blueprint.ts` - a template "blueprint" shown when the concept is first dropped on a canvas.
- `info.ts` - long-form description (what it is, why you'd use it, what it maps to per provider).

## The canvas palette

The palette (left sidebar in the UI) groups concepts by category:

| Category      | Example concepts                                                     |
| ------------- | -------------------------------------------------------------------- |
| Compute       | Scalable Backend, Worker, Serverless Function, SSR Site, Static Site |
| Data          | Postgres, MySQL, MongoDB, Redis Cache, Object Storage, Vector DB     |
| Messaging     | Message Queue, Event Stream                                          |
| AI            | LLM Gateway, Private AI Service, Vector DB                           |
| Networking    | Public Traffic, Private Network, API Gateway, Custom Domain          |
| Observability | Observability                                                        |
| Security      | Secret Store, Env Config                                             |
| Integration   | GitHub Repo, Email Service, Scheduled Task                           |

Some concepts planned for the palette are deferred (authentication, analytics data warehouse, search). See [ROADMAP.md](../ROADMAP.md) for status.

## Block × provider coverage matrix

Which palette block lands on which provider, derived from the handler set in `packages/core/src/deploy/providers/<cloud>/handlers/` intersected with the per-(category × provider) flag in [`PROVIDER_FLAGS`](../packages/constants/src/feature-flags.ts). A ✓ means the deployer maps that block to a first-party primitive on that provider; a — means no first-party handler (the block is hidden from the palette when that provider is selected).

| Block                           | aws | gcp | azure | k8s | alibaba | oci | digitalocean | ibm |
| ------------------------------- | :-: | :-: | :---: | :-: | :-----: | :-: | :----------: | :-: |
| Compute · Static Site           |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  —  |
| Compute · SSR Site              |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  —  |
| Compute · Container             |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| Compute · Serverless Function   |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| Compute · Worker                |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| Compute · Cron Job              |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      —       |  ✓  |
| Database · Postgres             |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| Database · MySQL                |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| Database · MongoDB              |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| Cache · Redis                   |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| Storage · Object Bucket         |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| Messaging · Queue               |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      —       |  ✓  |
| Messaging · Event Stream        |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      —       |  ✓  |
| Messaging · Email               |  ✓  |  ✓  |   ✓   |  —  |    —    |  —  |      —       |  —  |
| Network · API Gateway           |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      —       |  —  |
| Network · Custom Domain         |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  —  |
| Network · Private Network       |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| Security · Secret               |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| AI · Vector DB                  |  ✓  |  ✓  |   ✓   |  —  |    ✓    |  —  |      —       |  —  |
| AI · LLM Gateway                |  ✓  |  ✓  |   ✓   |  —  |    ✓    |  ✓  |      —       |  ✓  |
| AI · Private AI Service         |  ✓  |  ✓  |   ✓   |  —  |    ✓    |  ✓  |      —       |  ✓  |
| Monitoring · Log                |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      —       |  ✓  |
| Source · Repository (build)     |  ✓  |  ✓  |   ✓   |  —  |    ✓    |  —  |      —       |  —  |
| Config · Environment            |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| Util · Reroute                  |  ✓  |  ✓  |   ✓   |  ✓  |    ✓    |  ✓  |      ✓       |  ✓  |
| **Coverage** (out of 25 blocks) | 25  | 25  |  25   | 20  |   24    | 22  |      15      | 18  |

### Per-provider primitive mapping (the ✓ cells, spelt out)

| Concept             | GCP                     | AWS                   | Azure                         | Alibaba          | OCI                           | DigitalOcean  | IBM                   | Kubernetes          |
| ------------------- | ----------------------- | --------------------- | ----------------------------- | ---------------- | ----------------------------- | ------------- | --------------------- | ------------------- |
| Static Site         | Cloud Storage + CDN     | S3 + CloudFront       | Storage Account + CDN         | OSS + CDN        | Object Storage                | Spaces + CDN  | —                     | Ingress + Service   |
| SSR Site            | Cloud Run               | Amplify Hosting       | Static Web Apps / App Service | SAE / FC         | Container Instance + API GW   | App Platform  | —                     | Deployment          |
| Container           | Cloud Run               | ECS Fargate           | Container Apps / Web App      | SAE / ECI        | Container Instance / OKE      | App Platform  | Code Engine           | Deployment          |
| Serverless Function | Cloud Functions         | Lambda                | Functions                     | Function Compute | Functions                     | Functions     | Code Engine fn        | Knative Service     |
| Worker              | Cloud Run Jobs          | ECS (worker)          | Container Apps                | SAE              | Container Instance            | App Platform  | Code Engine app       | Deployment          |
| Cron Job            | Cloud Scheduler         | EventBridge           | Logic Apps recurrence         | EventBridge      | Resource Scheduler            | —             | Code Engine job       | CronJob             |
| Postgres            | Cloud SQL (Postgres)    | RDS (Postgres)        | Database for PostgreSQL       | RDS Postgres     | PostgreSQL DB System          | Managed DB    | Databases / Db2       | StatefulSet         |
| MySQL               | Cloud SQL (MySQL)       | RDS (MySQL)           | Database for MySQL            | RDS MySQL        | MySQL HeatWave                | Managed DB    | Databases             | StatefulSet         |
| MongoDB             | Firestore (doc store)   | DocumentDB            | Cosmos DB (Mongo API)         | DDS              | NoSQL                         | Managed DB    | Databases             | StatefulSet         |
| Redis               | Memorystore             | ElastiCache           | Cache for Redis               | ApsaraDB Redis   | Redis Cluster                 | Managed DB    | Databases             | StatefulSet         |
| Object Storage      | Cloud Storage           | S3                    | Blob Storage                  | OSS              | Object Storage                | Spaces        | Cloud Object Storage  | PVC                 |
| Message Queue       | Pub/Sub                 | SQS                   | Service Bus                   | MNS              | Queue                         | —             | MQ                    | StatefulSet (RMQ)   |
| Event Stream        | Pub/Sub                 | Kinesis               | Event Hubs                    | AMQP / MNS Topic | Streaming                     | —             | Event Streams (Kafka) | StatefulSet (Kafka) |
| Email               | SendGrid integration    | SES                   | Communication Services        | —                | —                             | —             | —                     | —                   |
| API Gateway         | API Gateway             | API Gateway           | APIM                          | API Gateway      | API Gateway                   | —             | —                     | Ingress             |
| Custom Domain       | Cloud DNS + mapping     | Route 53              | DNS Zone                      | AliDNS           | DNS Zone                      | Domain record | —                     | Ingress             |
| Private Network     | VPC                     | VPC                   | VNet                          | VPC + VSwitch    | VCN                           | VPC           | VPC                   | Namespace + NetPol  |
| Secret              | Secret Manager          | Secrets Manager       | Key Vault                     | KMS Secret       | Vault Secret                  | App env vars  | Secrets Manager       | Secret              |
| Vector DB           | Vertex AI Vector Search | OpenSearch Serverless | Cognitive Search (vector)     | OpenSearch       | —                             | —             | —                     | —                   |
| LLM Gateway         | Vertex AI endpoints     | Bedrock               | Azure OpenAI                  | PAI-EAS          | Generative AI endpoint        | —             | watsonx               | —                   |
| Private AI Service  | Vertex AI custom        | SageMaker             | Azure ML                      | PAI workspace    | Data Science model deployment | —             | watsonx deployment    | —                   |
| Log                 | Cloud Logging           | CloudWatch Logs       | Log Analytics                 | SLS              | Logging                       | —             | Log Analysis          | Prometheus Rule     |
| Source Repository   | Cloud Build             | CodeBuild             | ACR Tasks                     | CR Build Task    | —                             | —             | —                     | —                   |

GCP is stable. AWS + Azure are experimental with real-cloud deploys observed for their enabled categories. Alibaba, OCI, DigitalOcean, IBM, and Kubernetes are in **preview** — handler + extractor + L4 SDK-input verifier shipped, but per-handler deploy gates are still pending. See [provider-status.md](provider-status.md) for the readiness matrix.

## Requirements and validation

Concepts advertise _requirements_ - "to be useful, a Scalable Backend needs either a GitHub Repo or an Object Storage for code, plus a Public Traffic upstream." Requirements live in `packages/blocks/src/requirements/` and are enforced by the canvas validator (`packages/core/src/validation/`).

When a requirement is unmet, the block shows a badge; hovering the badge explains what's missing. The validator prevents deploys on unmet hard requirements and warns on soft ones.

## Adding a new concept

The typical shape of a new concept PR:

1. `packages/blocks/src/common/concepts/<name>/index.ts` - define id, label, default properties, category.
2. `packages/blocks/src/common/concepts/<name>/blueprint.ts` - the drop-to-canvas initial state.
3. `packages/blocks/src/common/concepts/<name>/info.ts` - description.
4. `packages/core/src/resources/high-level-resources.ts` - register the high-level resource and its mapping.
5. `packages/providers/<cloud>/src/handlers/<resource>.ts` - per-provider deploy/update/delete handler.
6. `packages/ui/src/features/canvas/components/nodes/<name>/` - custom node rendering (if needed).
7. Tests - usually a card-translator test + a handler test.

See `packages/blocks/src/common/concepts/static-site/` as a reference implementation - it covers every piece.

## Templates vs. blocks

A **template** is a pre-built composition of concepts with edges and default properties. Templates live in `packages/templates/` and are shown in the template gallery.

Current templates:

| Template                 | What it builds                                      |
| ------------------------ | --------------------------------------------------- |
| SaaS Starter             | Static site, backend, Postgres, auth, custom domain |
| Full-Stack               | SSR site + backend + Postgres + object storage      |
| RAG Chatbot              | Static site + LLM gateway + vector DB + backend     |
| Budget Web App           | Minimal budget-friendly web stack                   |
| Backend API              | Scalable backend + Postgres + observability         |
| Microservices            | Multiple backends + event stream + shared DB        |
| Serverless API           | API gateway + serverless functions + DB             |
| Event-Driven Serverless  | Event stream + multiple serverless functions        |
| Secure API               | Backend with locked-down networking and secrets     |
| AI/ML                    | LLM + vector DB + model endpoints                   |
| EU Compliance            | Same as SaaS Starter but region-locked              |
| SaaS Multi-Tenant        | Tenant-isolated SaaS shape                          |
| SaaS Analytics Dashboard | Dashboard + data pipeline                           |

Templates are just compositions - every block they produce is one you could drop individually. Nothing magic.

## Entry points worth reading

- [`packages/blocks/src/common/concepts/static-site/index.ts`](../packages/blocks/src/common/concepts/static-site/index.ts) - simplest concept.
- [`packages/blocks/src/common/concepts/scalable-backend/index.ts`](../packages/blocks/src/common/concepts/scalable-backend/index.ts) - a more complex one.
- [`packages/core/src/resources/high-level-resources.ts`](../packages/core/src/resources/high-level-resources.ts) - concept-to-cloud mapping.
- [`packages/core/src/validation/`](../packages/core/src/validation) - canvas-level validation rules.
- [`packages/templates/src/`](../packages/templates/src) - template compositions.

## See also

- [deploying-to-gcp.md](deploying-to-gcp.md) - concepts in action.
- [core-engine.md](core-engine.md) - the graph model concepts translate into.
- [frontend.md](frontend.md) - how concepts are rendered on the canvas.

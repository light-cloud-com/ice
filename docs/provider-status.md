# Provider Status

Where each provider sits today. The source of truth is `PROVIDER_READINESS` in `packages/constants/src/providers.ts` - when those values change, this page should change with them.

## Status definitions

| Status           | Meaning                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **stable**       | Full plan / apply / destroy lifecycle. Importer works. Real-world deploys land.                                                                                                                          |
| **experimental** | Major primitives work end-to-end. Real-cloud deploys observed for the enabled categories. Not at feature parity with stable. Production use at your own risk.                                            |
| **preview**      | Deployer + extractors + L4 SDK command-input verification shipped. Per-handler real-cloud deploy gate not yet observed; categories stay gated until a developer runs the live test on their own account. |
| **design-only**  | Blocks render on the canvas, but the deployer is a stub. Useful for diagrams; nothing gets created in the cloud.                                                                                         |

## Current matrix (v0.1)

The **Handlers** column counts cloud primitives wired through the provider's `HANDLER_REGISTRY` (everything in `packages/core/src/deploy/providers/<p>/handlers/`). The **Blocks** column counts how many of the 25 user-facing palette blocks land on a first-party primitive for that provider — derived from the per-(category × provider) flag in `PROVIDER_FLAGS` and verified by the per-block matrix in [blocks-reference.md](blocks-reference.md). Handlers measure _deployer surface_, blocks measure _canvas surface_.

| Provider          | Status       | Handlers | Blocks | What works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------ | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GCP**           | stable       | 38       | 25/25  | Cloud Run (services + jobs), Cloud Functions, GKE, Cloud SQL, Firestore, Memorystore Redis, Cloud Storage, Pub/Sub, Cloud Scheduler, Vertex AI, Discovery Engine, BigQuery, Secret Manager, Identity Platform, API Gateway, Load Balancer, Domain Mapping, Cloud Logging. Full importer via Cloud Asset Inventory.                                                                                                                                                                                                                                                                                                                                                               |
| **AWS**           | experimental | 38       | 25/25  | S3, Lambda (auto-build from `Source.Repository`), ECS, EC2, RDS, DynamoDB, ElastiCache, DocDB, CloudFront, API Gateway, ELBv2, SQS / SNS, EventBridge, Amazon MQ (RabbitMQ branch), Cognito, OpenSearch, OpenSearch Serverless, Bedrock, SageMaker, Redshift, CloudWatch Logs, Secrets Manager, WAFv2, ACM, Route53, VPC + Subnet + SecurityGroup + VPC Endpoint, Amplify Hosting, CodeBuild. Staged rollout via feature flags. See [`packages/core/src/deploy/providers/aws/README.md`](../packages/core/src/deploy/providers/aws/README.md). Importer not implemented.                                                                                                         |
| **Azure**         | experimental | 38       | 25/25  | Compute (VM, Web App, Functions, Container Apps, Static Web Apps, AKS, ACR), Database (Postgres Flex, MySQL Flex, Cosmos SQL + Mongo, Redis Cache, SQL Server), Storage (Blob), Messaging (Service Bus + AMQP / RabbitMQ branch, Event Hubs, Event Grid, Logic Apps), Network (VNet, Subnet, NSG, Private Endpoint, DNS Zone, App Gateway, Front Door, APIM, WAF), Observability (Log Analytics, App Insights), Security (Key Vault, Entra B2C), AI / Analytics (Cognitive Search, Azure OpenAI, Azure ML, Synapse, Data Explorer). See [`packages/core/src/deploy/providers/azure/README.md`](../packages/core/src/deploy/providers/azure/README.md). Importer not implemented. |
| **Alibaba Cloud** | preview      | 34       | 24/25  | ECS, Container Service (ACK), Function Compute, SAE, ECI, RDS (MySQL / PostgreSQL), PolarDB, ApsaraDB for Redis, MongoDB (DDS), OSS, SLB, VPC + VSwitch + SecurityGroup, NAT Gateway, Log Service (SLS), MNS / RocketMQ / AMQP, CDN, Container Registry + CR Build, Cloud Monitor, KMS, Secret Manager, RAM, PAI-EAS, PAI Workspace, OpenSearch (vector), MaxCompute. Single excluded block: Email. Live tests + cleanup-orphans under `e2e/alibaba-deployment-tests/`.                                                                                                                                                                                                          |
| **Oracle Cloud**  | preview      | 33       | 22/25  | Compute, Container Instance, OKE, Functions, Resource Scheduler, Autonomous DB, MySQL HeatWave, PostgreSQL, NoSQL, Redis, Object / Block / File Storage, VCN + Subnet + NSG, LBaaS, DNS, API Gateway, Queue, Streaming, Notifications (ONS), Generative AI endpoint, Data Science Model Deployment, Logging, Monitoring, Vault, Bastion, OCIR, WAF. Excluded blocks: Email, Vector DB, Source Repository (no first-party CodeBuild-equivalent). L4 SDK-input verifier extended for OCI signed-request shapes.                                                                                                                                                                    |
| **Kubernetes**    | preview      | 19       | 20/25  | Deployment, StatefulSet, DaemonSet, Job, CronJob, Knative Service (CRD), Service, Ingress, ConfigMap, Secret, PersistentVolumeClaim, Namespace, ServiceAccount, NetworkPolicy, HorizontalPodAutoscaler, PodDisruptionBudget, PrometheusRule, cert-manager Certificate. In-cluster + kubeconfig auth supported. Excluded blocks: Email, AI.\* (no first-party AI service), Source Repository.                                                                                                                                                                                                                                                                                     |
| **IBM Cloud**     | preview      | 14       | 18/25  | VPC, VPC Instance, Code Engine (application / function / job), IKS / OpenShift, Cloudant, Db2, Databases (Postgres / MySQL / Mongo / Redis), Cloud Object Storage, Event Streams (Kafka), MQ, Container Registry, Key Protect, Secrets Manager, watsonx, Activity Tracker, Log Analysis, Monitoring. Excluded blocks: Frontend (Static / SSR Site), Email, API Gateway, Custom Domain, Vector DB, Source Repository (no first-party Node SDK for those service families).                                                                                                                                                                                                        |
| **DigitalOcean**  | preview      | 19       | 15/25  | Droplets, DOKS, App Platform, Functions (namespace + function), Managed DBs (Postgres / MySQL / Redis / MongoDB), Spaces, Volumes, Snapshots, VPC, Load Balancer, Floating IP, Firewall, DNS, DOCR, Monitoring alerts, App env vars. Excluded blocks: Scheduler, Messaging.Queue / EventStream / Email, API Gateway, AI.\*, Monitoring.Log, Source Repository (no first-party services for those categories). Union-type SDK shapes resolved in the L4 verifier.                                                                                                                                                                                                                 |

## What "experimental" looks like in practice

For an AWS deploy of a canvas:

- Blocks in the enabled categories (Storage / Messaging / Cache / Monitoring / Security / Source / Config) plan and apply normally — S3, SQS, SNS, ElastiCache, Secrets Manager, CloudWatch Logs.
- Blocks in gated categories are hidden from the palette when the project's provider is AWS (Compute, Frontend, Scheduler, Network, Database, AI, Analytics). Their handlers exist but aren't exposed yet — flip a category in `PROVIDER_FLAGS.aws.categories` once its unblocker lands.
- RDS / DocDB / Redshift refuse to create without a `master_user_password`. Wire a `Security.Secret` or set the property explicitly.
- CloudFront / Cognito / DocDB / Redshift are create-only today — no update path.
- Lambda auto-build needs local `git` / `npm` / `zip` on the deploy host.

This is the same loop you'd hit on Azure for anything past VM / Storage / Web App.

## What "preview" looks like in practice

For Alibaba / OCI / DigitalOcean / IBM / Kubernetes:

- A full handler + extractor + HANDLER_REGISTRY entry exists for every block listed above.
- The L4 SDK command-input verifier (`scripts/verify-sdk-commands.mjs`) confirms each handler's create / update / delete bodies are shaped like the SDK expects — catching PascalCase / camelCase drift, path-param vs body-param mistakes, and missing required fields before a real call is made.
- A developer-run live test exists per handler under `packages/core/src/deploy/providers/__tests__/live/<provider>-<service>.live.test.ts`. Run `pnpm test:live:<provider> <service>` with the provider's credentials exported and it performs a create + delete round-trip against your own account, logging the run to `e2e/<provider>-deployment-tests/runs/<runId>.jsonl`.
- The matching feature-flag category in `PROVIDER_FLAGS.<provider>.categories` stays `false` until at least one successful round-trip has been observed (the [cardinal rule](../inprogress/README.md)).
- Until that gate ticks: the block renders on canvas under the provider, but the deploy step refuses with a "deploy gate not yet ticked" error.

## What "design-only" looks like in practice

No provider currently sits at design-only — the eight providers tracked here all ship at least a preview deployer. The state is preserved in `PROVIDER_READINESS` for future additions: blocks render but the deployer is absent, so attempting to deploy fails at provider selection rather than mid-plan.

## Roadmap

In rough order:

1. Per-handler deploy gates for the preview tier — Alibaba, OCI, DigitalOcean, IBM, Kubernetes — flipping category feature flags as each leg goes green.
2. AWS + Azure deploy-gate completion for the remaining gated categories (Compute / Network / Database / AI / Analytics for AWS; the per-handler Azure live tests).
3. AWS importer (`Import → From AWS`).
4. Azure importer.
5. Importers for the preview tier (in `PROVIDER_READINESS` order).
6. Cost estimation parity (AWS / Azure / preview-tier cost tables are sparser than GCP).

Help wanted on any of the above - pick one and open a draft PR.

## See also

- [deploying-to-gcp.md](deploying-to-gcp.md) - canonical end-to-end tutorial.
- [deploying-to-aws.md](deploying-to-aws.md) - AWS-specific notes.
- [deploying-to-azure.md](deploying-to-azure.md) - Azure-specific notes.
- [deploying-to-kubernetes.md](deploying-to-kubernetes.md) - Kubernetes-specific notes.
- [testing.md](testing.md) - unit, integration, SDK verifiers, live tests.
- [ROADMAP.md](../ROADMAP.md) - broader project direction.
- [`packages/core/src/deploy/providers/`](../packages/core/src/deploy/providers/) - deployer source.
- [`packages/constants/src/providers.ts`](../packages/constants/src/providers.ts) - `PROVIDER_READINESS` truth-source.

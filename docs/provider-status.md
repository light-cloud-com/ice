# Provider Status

Where each provider sits today. The source of truth is `PROVIDER_READINESS` in `packages/constants/src/providers.ts` - when those values change, this page should change with them.

## Status definitions

| Status           | Meaning                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| **stable**       | Full plan / apply / destroy lifecycle. Importer works. Real-world deploys land.                                  |
| **experimental** | Major primitives work end-to-end. Not at feature parity with stable. Production use at your own risk.            |
| **design-only**  | Blocks render on the canvas, but the deployer is a stub. Useful for diagrams; nothing gets created in the cloud. |

## Current matrix (v0.1)

| Provider          | Status       | What works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GCP**           | stable       | 20+ handlers: Cloud Run (services + jobs), Cloud Functions, GKE, Cloud SQL, Firestore, Memorystore Redis, Cloud Storage, Pub/Sub, Cloud Scheduler, Vertex AI, Discovery Engine, BigQuery, Secret Manager, Identity Platform, API Gateway, Load Balancer, Domain Mapping, Cloud Logging. Full importer via Cloud Asset Inventory.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **AWS**           | experimental | 17 handlers + 20 extractors: S3 (account-id suffix), Lambda (auto-build from `Source.Repository`), ECS (auto-cluster + task role), RDS (provisioning poll), DynamoDB, ElastiCache, DocDB, CloudFront (us-east-1 ACM cert), API Gateway, ELBv2, SQS/SNS (FIFO suffix), EventBridge, Cognito, OpenSearch, Bedrock, SageMaker, Redshift, CloudWatch Logs, Secrets Manager. Staged rollout via feature flags — Storage / Messaging / Cache / Monitoring / Security / Source / Config categories are on; Compute / Frontend / Scheduler / Network / Database / AI / Analytics are gated until concrete unblockers ship (VPC blocks for ECS, ACM cert validation flow, update paths). See [`packages/core/src/deploy/providers/aws/README.md`](../packages/core/src/deploy/providers/aws/README.md) for the per-category state. Importer not implemented. |
| **Azure**         | experimental | 35+ handlers across compute (VM, Web App, Functions, Container Apps, Static Web Apps, AKS, ACR), database (Postgres Flex, MySQL Flex, Cosmos SQL+Mongo, Redis Cache), storage (Blob), messaging (Service Bus, Event Hubs, Event Grid, Logic Apps), network (VNet, Subnet, NSG, Private Endpoint, DNS Zone, App Gateway, Front Door, APIM, WAF), observability (Log Analytics, App Insights), security (Key Vault, Entra B2C), AI/analytics (Cognitive Search, Azure OpenAI, Azure ML, Synapse, Data Explorer). See [`packages/core/src/deploy/providers/azure/README.md`](../packages/core/src/deploy/providers/azure/README.md). Importer not implemented. Live-cloud deploy gate is per-handler — most handlers ship behind the `azure.enabled` feature flag until verified on a real subscription.                                               |
| **Kubernetes**    | design-only  | 13 blocks render on canvas. Deployer is not wired.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Alibaba Cloud** | design-only  | Blocks render. Deployer is the next item after AWS/Azure parity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Oracle Cloud**  | design-only  | Block stubs. No deployer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **DigitalOcean**  | design-only  | Block stubs. No deployer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## What "experimental" looks like in practice

For an AWS deploy of a canvas:

- Blocks in the enabled categories (Storage / Messaging / Cache / Monitoring / Security / Source / Config) plan and apply normally — S3, SQS, SNS, ElastiCache, Secrets Manager, CloudWatch Logs.
- Blocks in gated categories are hidden from the palette when the project's provider is AWS (Compute, Frontend, Scheduler, Network, Database, AI, Analytics). Their handlers exist but aren't exposed yet — flip a category in `PROVIDER_FLAGS.aws.categories` once its unblocker lands.
- RDS / DocDB / Redshift refuse to create without a `master_user_password`. Wire a `Security.Secret` or set the property explicitly.
- CloudFront / Cognito / DocDB / Redshift are create-only today — no update path.
- Lambda auto-build needs local `git` / `npm` / `zip` on the deploy host.

This is the same loop you'd hit on Azure for anything past VM / Storage / Web App.

## What "design-only" looks like in practice

For Kubernetes / Alibaba / OCI / DigitalOcean:

- Blocks appear in the palette (so you can sketch architectures targeting them).
- Connecting a cloud credential of that flavour is **not** in the Add Provider list.
- Attempting to deploy will fail at provider selection rather than mid-plan.

If you need any of these to actually deploy, the path is: contribute a `ProviderDeployer` implementation under `packages/core/src/deploy/providers/`. See [contributing.md](contributing.md).

## Roadmap

In rough order:

1. AWS parity with GCP for the top-20 handler set (compute, storage, databases, queues, basic networking, secrets, observability).
2. Azure parity, in lockstep with AWS.
3. AWS importer (`Import → From AWS`).
4. Azure importer.
5. Kubernetes deployer (likely via the in-cluster operator pattern rather than direct API calls).
6. Cost estimation parity (the AWS/Azure cost tables are sparser than GCP).

Help wanted on any of the above - pick one and open a draft PR.

## See also

- [deploying-to-gcp.md](deploying-to-gcp.md) - canonical end-to-end tutorial.
- [deploying-to-aws.md](deploying-to-aws.md) - AWS-specific notes.
- [deploying-to-azure.md](deploying-to-azure.md) - Azure-specific notes.
- [ROADMAP.md](../ROADMAP.md) - broader project direction.
- [`packages/core/src/deploy/providers/`](../packages/core/src/deploy/providers/) - deployer source.
- [`packages/constants/src/providers.ts`](../packages/constants/src/providers.ts) - `PROVIDER_READINESS` truth-source.

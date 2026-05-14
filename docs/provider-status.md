# Provider Status

Where each provider sits today. The source of truth is `PROVIDER_READINESS` in `packages/constants/src/providers.ts` - when those values change, this page should change with them.

## Status definitions

| Status | Meaning |
|---|---|
| **stable** | Full plan / apply / destroy lifecycle. Importer works. Real-world deploys land. |
| **experimental** | Major primitives work end-to-end. Not at feature parity with stable. Production use at your own risk. |
| **design-only** | Blocks render on the canvas, but the deployer is a stub. Useful for diagrams; nothing gets created in the cloud. |

## Current matrix (v0.1)

| Provider | Status | What works |
|---|---|---|
| **GCP** | stable | 20+ handlers: Cloud Run (services + jobs), Cloud Functions, GKE, Cloud SQL, Firestore, Memorystore Redis, Cloud Storage, Pub/Sub, Cloud Scheduler, Vertex AI, Discovery Engine, BigQuery, Secret Manager, Identity Platform, API Gateway, Load Balancer, Domain Mapping, Cloud Logging. Full importer via Cloud Asset Inventory. |
| **AWS** | experimental | EC2 instance, S3 bucket, Lambda function. Importer not implemented. No auto-enable for required services. Most other resource categories surface as "unsupported on AWS" in the plan modal. |
| **Azure** | experimental | Virtual Machine, Storage Account, Web App. Importer not implemented. Most other resource categories surface as "unsupported on Azure". |
| **Kubernetes** | design-only | 13 blocks render on canvas. Deployer is not wired. |
| **Alibaba Cloud** | design-only | Blocks render. Deployer is the next item after AWS/Azure parity. |
| **Oracle Cloud** | design-only | Block stubs. No deployer. |
| **DigitalOcean** | design-only | Block stubs. No deployer. |

## What "experimental" looks like in practice

For an AWS deploy of a canvas that uses Static Site + Custom Domain:

- The plan modal will show creates for `aws.s3.bucket` and `aws.lambda.function` if those blocks are present.
- Anything outside the supported set (e.g., `aws.rds.instance`, `aws.cloudfront.distribution`, networking constructs) will surface in the plan as **unsupported** rather than create.
- Apply runs only against the supported types. Partial-success result with an explicit "this block has no AWS handler yet" log line.

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

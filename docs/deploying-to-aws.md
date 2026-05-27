# Deploying to AWS

ICE's AWS provider is **experimental**. Major primitives (compute, storage, databases, queues) work end-to-end, but the provider is not at feature parity with GCP. Treat AWS deploys as preview-quality until that note is removed.

For the most polished, fully-supported flow, see [deploying-to-gcp.md](deploying-to-gcp.md). The user journey is the same - only the connection step and the per-resource handler set differ.

## Prerequisites

- An **AWS account** you can admin.
- An **IAM user or role** with programmatic access (Access Key ID + Secret Access Key, or assume-role credentials).
- Permissions covering the resource categories you intend to deploy. The simplest start is `AdministratorAccess`; tighten later per service.

## Connect AWS in ICE

1. Open ICE (`pnpm dev:all`, [http://localhost:5173](http://localhost:5173)).
2. Top-right: **Settings → Providers → Add Amazon Web Services**.
3. Paste an Access Key ID + Secret Access Key, or an STS session. ICE encrypts these (AES-256-GCM) before writing to the DB using `CREDENTIAL_ENCRYPTION_KEY`.
4. Pick the default region.

A read-only validation pass runs against `sts:GetCallerIdentity` to confirm the credentials work before you can deploy.

## Build a canvas, plan, apply

Same flow as [deploying-to-gcp.md](deploying-to-gcp.md) - drag blocks, connect them, click **Deploy**, review the plan, click **Apply**. The deploy event log streams real AWS API responses.

## What works today

20+ service handlers + extractors live in [`packages/core/src/deploy/providers/aws/`](../packages/core/src/deploy/providers/aws/). The categories exposed to the palette / plan modal are gated by feature flags — see the **Rollout state** table in [`providers/aws/README.md`](../packages/core/src/deploy/providers/aws/README.md) for the per-category truth source. Currently on by default: Storage (S3), Messaging (SQS, SNS, EventBridge), Cache (ElastiCache), Monitoring (CloudWatch Logs), Security (Secrets Manager), Source, and Config. Network primitives (VPC / Subnet / SecurityGroup), Compute (ECS / Lambda / EC2), Frontend (CloudFront / Amplify Hosting), Scheduler (EventBridge schedule), Database (RDS / DynamoDB / DocDB / Redshift), AI (Bedrock / SageMaker / OpenSearch Serverless vector), and Analytics (OpenSearch / Redshift) all ship handlers — they flip on as each category's deploy-gate row turns green in the rollout table.

A7 also added: Amplify Hosting (`Compute.SSRSite`), Amazon MQ (`Messaging.RabbitMQ`), WAFv2 (`Security.WAF`), VPC Endpoint (`Network.PrivateNetwork`), CodeBuild (`Source.Build`), ECS Worker (`Compute.Worker`).

For the source-of-truth provider matrix across all clouds, see [provider-status.md](provider-status.md).

## AWS-specific quirks

The deployer handles several AWS-specific gotchas silently. The full list lives in [`providers/aws/README.md`](../packages/core/src/deploy/providers/aws/README.md); highlights:

- **S3 bucket names** get a `-{accountId}` suffix because S3 names are globally unique.
- **CloudFront ACM certs** are pinned to `us-east-1` regardless of deploy region. CloudFront now consumes a canvas-wired `Security.Certificate` ARN when present, falling back to auto-provisioning only when no cert is connected.
- **ECS auto-provisions** a default cluster + task execution role on first deploy. With A1 wiring, canvas `Network.VPC` / `Subnet` / `SecurityGroup` blocks now flow through to ECS / ELBv2 / RDS / ElastiCache.
- **RDS / DocDB / Redshift** refuse to ship without a `master_user_password` — wire a `Security.Secret` or set the property explicitly.
- **RDS provisioning** takes 5–10 minutes; the handler polls `DescribeDBInstances` and reports progress via `ctx.on_step`.
- **Lambda auto-build** clones a connected `Source.Repository`, runs `npm install`, zips, and uploads to `ice-bootstrap-{accountId}-{region}`. When local `git` / `npm` / `zip` aren't available the handler falls back to AWS CodeBuild automatically.
- **SQS / SNS FIFO** queues + topics get the required `.fifo` suffix automatically.
- **CloudFront / Cognito / DocDB / Redshift / EC2** all support update paths now: UpdateDistribution (via GetDistributionConfig + ETag), UpdateUserPool, ModifyDBCluster, ModifyCluster, ModifyVolume (EBS resize).

## Known gaps vs. GCP

- No importer (`Import → From AWS`) — manual canvas only.
- Tests use mocked AWS SDKs only — live deploy gates require a developer-run pass.
- Cost estimate parity is sparser than GCP.

If you hit a gap that matters to you, please file a feature request — AWS parity is high-priority on the [ROADMAP](../ROADMAP.md) and contributions are welcome (see [contributing.md](contributing.md)).

## See also

- [deploying-to-gcp.md](deploying-to-gcp.md) — the canonical end-to-end tutorial.
- [architecture/README.md](architecture/README.md) — how plan / apply work.
- [`providers/aws/README.md`](../packages/core/src/deploy/providers/aws/README.md) — operator notes covering every AWS quirk and the rollout-state table.
- [`packages/core/src/deploy/providers/aws/handlers/`](../packages/core/src/deploy/providers/aws/handlers/) — per-service handler source.

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

17 service handlers + 20 extractors live in [`packages/core/src/deploy/providers/aws/`](../packages/core/src/deploy/providers/aws/). The categories exposed to the palette / plan modal are gated by feature flags — see the **Rollout state** table in [`providers/aws/README.md`](../packages/core/src/deploy/providers/aws/README.md) for the per-category truth source. Today: Storage (S3), Messaging (SQS, SNS, EventBridge), Cache (ElastiCache), Monitoring (CloudWatch Logs), Security (Secrets Manager), Source, and Config are on. Compute (ECS), Frontend, Scheduler, Network, Database (RDS / DynamoDB / DocDB), AI, and Analytics are gated until their concrete unblockers ship.

For the source-of-truth provider matrix across all clouds, see [provider-status.md](provider-status.md).

## AWS-specific quirks

The deployer handles several AWS-specific gotchas silently. The full list lives in [`providers/aws/README.md`](../packages/core/src/deploy/providers/aws/README.md); highlights:

- **S3 bucket names** get a `-{accountId}` suffix because S3 names are globally unique.
- **CloudFront ACM certs** are pinned to `us-east-1` regardless of deploy region.
- **ECS auto-provisions** a default cluster + task execution role on first deploy. Subnets and security groups are still operator-supplied today; canvas VPC blocks for AWS are deferred.
- **RDS / DocDB / Redshift** refuse to ship without a `master_user_password` — wire a `Security.Secret` or set the property explicitly.
- **RDS provisioning** takes 5–10 minutes; the handler polls `DescribeDBInstances` and reports progress via `ctx.on_step`.
- **Lambda auto-build** clones a connected `Source.Repository`, runs `npm install`, zips, and uploads to `ice-bootstrap-{accountId}-{region}` — needs local `git` / `npm` / `zip` on the deploy host. AWS CodeBuild integration is deferred.
- **SQS / SNS FIFO** queues + topics get the required `.fifo` suffix automatically.

## Known gaps vs. GCP

- No importer (`Import → From AWS`) — manual canvas only.
- VPC-aware canvas blocks for ECS subnets/security groups not yet wired.
- Update paths for CloudFront / Cognito / DocDB / Redshift are create-only.
- Tests use mocked AWS SDKs only — no LocalStack integration tests yet.
- Cost estimate parity is sparser than GCP.

If you hit a gap that matters to you, please file a feature request — AWS parity is high-priority on the [ROADMAP](../ROADMAP.md) and contributions are welcome (see [contributing.md](contributing.md)).

## See also

- [deploying-to-gcp.md](deploying-to-gcp.md) — the canonical end-to-end tutorial.
- [architecture/README.md](architecture/README.md) — how plan / apply work.
- [`providers/aws/README.md`](../packages/core/src/deploy/providers/aws/README.md) — operator notes covering every AWS quirk and the rollout-state table.
- [`packages/core/src/deploy/providers/aws/handlers/`](../packages/core/src/deploy/providers/aws/handlers/) — per-service handler source.

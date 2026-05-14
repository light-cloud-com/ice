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

The block categories listed in the provider matrix (`docs/provider-status.md` - to be added) are the source of truth. As of this release, the AWS handler set covers compute, storage, basic networking, and managed databases. Anything outside that set will either no-op or surface an "unsupported on AWS" error in the plan modal.

## Known gaps vs. GCP

- No live cost estimate parity for several AWS-specific services.
- The importer (`Import → From AWS`) is not implemented yet.
- Some block types render on the canvas but have no AWS handler - they'll show a yellow "no provider for AWS" pip during plan.

If you hit a gap that matters to you, please file a feature request - AWS parity is high-priority on the [ROADMAP](../ROADMAP.md) and contributions are welcome (see [contributing.md](contributing.md)).

## See also

- [deploying-to-gcp.md](deploying-to-gcp.md) - the canonical end-to-end tutorial.
- [architecture.md](architecture.md) - how plan / apply work.
- [`packages/providers/aws/src/handlers/`](../packages/providers/aws/src/handlers/) - per-service handler source.

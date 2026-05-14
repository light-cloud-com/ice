# Deploying to Azure

ICE's Azure provider is **experimental**. Major primitives (compute, storage, databases) work end-to-end, but the provider is not at feature parity with GCP. Treat Azure deploys as preview-quality until that note is removed.

For the most polished, fully-supported flow, see [deploying-to-gcp.md](deploying-to-gcp.md). The user journey is the same - only the connection step and the per-resource handler set differ.

## Prerequisites

- An **Azure subscription** you can admin.
- A **service principal** (`az ad sp create-for-rbac …`) with `Contributor` (or finer-grained) role on the subscription or a specific resource group.
- The service principal's `tenantId`, `clientId`, and `clientSecret`.

## Connect Azure in ICE

1. Open ICE (`pnpm dev:all`, [http://localhost:5173](http://localhost:5173)).
2. Top-right: **Settings → Providers → Add Microsoft Azure**.
3. Enter the tenant ID, client ID, client secret, and target subscription ID. ICE encrypts these (AES-256-GCM) before writing to the DB using `CREDENTIAL_ENCRYPTION_KEY`.
4. Pick the default region.

A read-only validation pass runs against the Azure Resource Manager API to confirm the credentials work and the subscription is reachable before you can deploy.

## Build a canvas, plan, apply

Same flow as [deploying-to-gcp.md](deploying-to-gcp.md) - drag blocks, connect them, click **Deploy**, review the plan, click **Apply**. The deploy event log streams real Azure API responses.

## What works today

The block categories listed in the provider matrix (`docs/provider-status.md` - to be added) are the source of truth. As of this release, the Azure handler set covers compute, storage, and basic managed databases. Anything outside that set will either no-op or surface an "unsupported on Azure" error in the plan modal.

## Known gaps vs. GCP

- No live cost estimate parity for several Azure-specific services.
- The importer (`Import → From Azure`) is not implemented yet.
- Some block types render on the canvas but have no Azure handler - they'll show a yellow "no provider for Azure" pip during plan.

If you hit a gap that matters to you, please file a feature request - Azure parity is high-priority on the [ROADMAP](../ROADMAP.md) and contributions are welcome (see [contributing.md](contributing.md)).

## See also

- [deploying-to-gcp.md](deploying-to-gcp.md) - the canonical end-to-end tutorial.
- [architecture.md](architecture.md) - how plan / apply work.
- [`packages/providers/azure/src/handlers/`](../packages/providers/azure/src/handlers/) - per-service handler source.

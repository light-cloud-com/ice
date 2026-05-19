# Deploying to GCP

This is the happy-path tutorial for deploying a real application to Google Cloud Platform using ICE. It assumes you have ICE running locally (see [getting-started.md](getting-started.md)) and a Google account with access to a project where you can create resources.

GCP is the most mature cloud provider in ICE today. AWS and Azure also work for many resource types but are not yet on feature parity; see [ROADMAP.md](../ROADMAP.md).

## Prerequisites

- A **GCP project** you can admin.
- **Billing enabled** on that project. Most of the services ICE deploys (Cloud Run, Cloud SQL, Pub/Sub, BigQuery, Vertex AI) require a billing account attached - even at zero usage, the project has to be in "billing on" state.
- **gcloud CLI** installed locally is helpful but not required.

Expected first-deploy cost: near zero for a minimal canvas that stays within free tiers. A full Static Site + Custom Domain canvas costs cents/month. Running services (Cloud Run, Cloud SQL) cost real money - the canvas shows estimates before you deploy.

## Step 1 - Create a service account

ICE authenticates to GCP as a service account. You need one with enough permissions to create the resources in your canvas. For full lifecycle management across the 20 supported services, grant these roles on the project:

- **Project IAM Admin** (`roles/resourcemanager.projectIamAdmin`)
- **Editor** (`roles/editor`) - broad, but simplest to start. Narrow later.
- **Service Account User** (`roles/iam.serviceAccountUser`)

To narrow the permissions, the specific roles that cover ICE's current GCP handlers are: Cloud Run Admin, Cloud SQL Admin, Storage Admin, Pub/Sub Admin, Firestore Admin, BigQuery Admin, Vertex AI Admin, Artifact Registry Admin, Secret Manager Admin, and Service Usage Consumer. Grant only what your canvas needs.

In the GCP Console:

1. **IAM & Admin → Service Accounts → Create Service Account**.
2. Give it a name (e.g. `ice-deployer`).
3. Grant the roles above.
4. Under **Keys**, create a new **JSON** key. Save the file somewhere safe - ICE will read it but never store it on disk unencrypted.

**Do not commit the key file to git.** ICE's `.gitignore` covers patterns like `*service-account*.json` and `*-sa-key*.json`; respect them.

## Step 2 - Connect GCP in ICE

1. Open ICE (`pnpm dev:all`, [http://localhost:5173](http://localhost:5173)).
2. Top-right: **Settings → Providers**.
3. Click **Add Google Cloud**.
4. Paste the JSON key file's contents. ICE encrypts it (AES-256-GCM) before writing to the DB. The encryption key lives in `CREDENTIAL_ENCRYPTION_KEY` in your `.env`.
5. Select the project ID from the drop-down (populated from the JSON).

ICE runs a read-only validation pass (`validate_gcp_credentials` in `packages/core/src/deploy/providers/gcp/auth.ts`). If it fails, the error tells you which role is missing.

## Step 3 - Build a canvas

For your first deploy, keep it minimal. A good starting shape:

- **Static Site** block - your frontend (GitHub repo that builds into a static bundle).
- **Custom Domain** block - the DNS name you want to point at it.
- An edge from Static Site to Custom Domain.

On GCP, this canvas maps to:

- One **Cloud Storage** bucket (static assets).
- One **Cloud Run** deployment for the origin, or direct CDN-mapped storage, depending on block configuration.
- One **Cloud Load Balancer** with a managed SSL certificate.
- One **DNS record** mapping your domain to the load balancer.

All of that is translated from "two blocks and an edge" by `translate_card_to_graph` (see [core-engine.md](core-engine.md)).

For bigger shapes, try one of the built-in templates - **Templates → Gallery** in the toolbar. The SaaS Starter, Budget Web App, and Full-Stack templates are good early targets.

## Step 4 - Plan

Click **Deploy** in the toolbar. ICE runs a **plan** - a read-only pass that:

1. Validates the canvas (types, required properties, edge legality).
2. Translates cards → graph.
3. Diffs the graph against whatever's currently running in GCP (or against the last applied state).
4. Produces a list: `CREATE`, `UPDATE`, `DELETE`, `NO_OP` per resource.

The plan is displayed in a modal. Review it carefully - especially any `DELETE` operations on a first deploy (should be zero; a non-zero count means the state store thinks it deployed something it shouldn't have).

The plan also shows an **estimated cost per month** based on the block configurations. This is an estimate, not a bill.

## Step 5 - Apply

If the plan looks right, click **Apply**. The deploy engine:

1. Topologically orders the operations (networks before workloads, secrets before consumers, etc.).
2. Executes handlers one at a time, streaming progress over Socket.IO.
3. Writes the new state to the DB on success.
4. On partial failure, it stops at the failing handler and returns an error plus the state so far. You can retry; the next plan will only act on what's still pending.

On the canvas, each block shows a live status pip: pending, running, success, error. Clicking a block surfaces its per-resource log.

## Step 6 - Verify

Once apply completes:

- **GCP Console**: navigate to the services you deployed and confirm they exist.
- **ICE canvas**: the blocks show "deployed" with relevant outputs (URLs, IPs, connection strings).
- **Custom domain**: DNS may take a few minutes to propagate and the managed SSL certificate can take up to an hour on first provision. The block status reflects this.

## Step 7 - Iterate

Change a block property and click Deploy again. ICE runs a new plan, shows only what changed, and applies incrementally. This is the normal dev loop.

## Destroy

To tear everything down:

1. In the canvas, right-click any empty space → **Destroy environment**.
2. Review the plan (all resources marked `DELETE`).
3. Confirm.

Destroy respects the same topological ordering in reverse: dependents before dependencies.

## Importing existing infrastructure

If you already have infra in GCP and want to see it on a canvas, use **Import → From GCP**. ICE walks the GCP project via Cloud Asset Inventory and produces a read-only canvas with what it finds. You can then save it as a project and start making changes. See `packages/core/src/importers/gcp/` for the implementation and supported resource kinds.

## CI/CD

Canvas blocks can be wired to a GitHub repo so that `git push` to a branch triggers a deploy. Configure this under a project's **Pipelines** tab. Webhooks land at `services/deploy/src/routes/webhooks.ts` and are HMAC-verified against your repo's secret.

## Supported GCP services

| Category | Services |
|---|---|
| Compute | Cloud Run (services + jobs), Cloud Functions, GKE |
| Database | Cloud SQL (PostgreSQL, MySQL), Firestore, Memorystore Redis |
| Storage | Cloud Storage |
| Messaging | Pub/Sub, Cloud Scheduler |
| AI/ML | Vertex AI endpoints, Vector Search, ML models |
| Analytics | BigQuery, Discovery Engine |
| Security | Secret Manager, Identity Platform |
| Networking | API Gateway, Load Balancer, Domain Mapping |
| Observability | Cloud Logging |

All of these support create, update, and delete with real-time progress streaming. Anything not on this list is either AWS-specific (see `packages/providers/aws/`) or not yet implemented.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "API not enabled: `cloudrun.googleapis.com`" | The GCP service hasn't been enabled on the project | Click the "Enable API" link in the error, or run `gcloud services enable cloudrun.googleapis.com` |
| "Permission denied: roles/…" | Service account is missing a role | Add the role in IAM & Admin → IAM |
| Plan shows `DELETE` for resources you didn't create via ICE | State store drift | Reset the environment's state under Settings → Reset, or manually import first |
| Deploy hangs at "Creating Cloud SQL instance" | Cloud SQL first-provision is 5-10 minutes | Be patient. Progress is streamed but infrequent |
| "Quota exceeded" | Your GCP project quota | Request a quota increase in GCP Console |
| Custom domain stays "pending SSL" | Managed cert provisioning | Can take up to 60 minutes first time; verify your domain's DNS points at the load balancer |

For anything not in this table, look at the deploy event log on the canvas (bottom panel) - it streams real GCP API responses.

## See also

- [architecture.md](architecture.md) - the flow this tutorial walks through.
- [core-engine.md](core-engine.md) - how translate / plan / apply actually work.
- [`packages/core/src/deploy/`](../packages/core/src/deploy/) - deploy engine source.
- [`packages/providers/gcp/src/handlers/`](../packages/providers/gcp/src/handlers/) - per-service handlers.

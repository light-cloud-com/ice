# Azure Deployer — Operator Notes

This file documents the Azure-specific quirks the deployer handles
silently, the assumptions it bakes in, and the deferred work future
commits should pick up. Read this before changing any handler or
adding a new Azure resource type.

## Rollout state

Azure is feature-flagged at the category level in
`packages/constants/src/feature-flags.ts` (`PROVIDER_FLAGS.azure`). The
top-level `enabled` flag is **off** today; per-handler deploy gates
(Phase B8 in `inprogress/`) need to be ticked against a real Azure
subscription before each category flips to `on`.

| Category   | State  | Notes                                                                                                                                                                                                 |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage    | ⛔ off | Blob Storage (Storage Account) handler shipped; awaits live-deploy gate.                                                                                                                              |
| Messaging  | ⛔ off | Service Bus, Event Hubs, Event Grid, Logic Apps handlers shipped; awaits live-deploy gate.                                                                                                            |
| Cache      | ⛔ off | Cache for Redis (Basic C0 default); awaits live-deploy gate.                                                                                                                                          |
| Monitoring | ⛔ off | Log Analytics + App Insights; awaits live-deploy gate.                                                                                                                                                |
| Security   | ⛔ off | Key Vault + WAF policy + Entra B2C; awaits live-deploy gate.                                                                                                                                          |
| Source     | ⛔ off | Provider-agnostic.                                                                                                                                                                                    |
| Config     | ⛔ off | Provider-agnostic.                                                                                                                                                                                    |
| Compute    | ⛔ off | App Service Plan, Web App, Functions, Container Apps (service + worker), Static Web Apps, Virtual Machines, AKS, ACR. Functions auto-provisions storage on first deploy via the B4 quirks pipeline.   |
| Frontend   | ⛔ off | Static Web Apps + Front Door + DNS Zone wiring. Custom domain validation flow lands in Phase D.                                                                                                       |
| Scheduler  | ⛔ off | Compute.CronJob → Logic Apps recurrence trigger (extractor projects schedule_expression automatically).                                                                                               |
| Network    | ⛔ off | VNet, Subnet, NSG, Private Endpoint, App Gateway, Front Door, WAF, APIM.                                                                                                                              |
| Database   | ⛔ off | PostgreSQL Flexible Server, MySQL Flexible Server, Cosmos DB (SQL + Mongo), Redis Cache. Password-required services refuse to create without an explicit admin password (mirrors RDS / DocDB on AWS). |
| AI         | ⛔ off | Azure OpenAI (Cognitive Services), Azure ML, Cognitive Search (also backs AI.VectorDB).                                                                                                               |
| Analytics  | ⛔ off | Synapse, Data Explorer (Kusto), Cognitive Search.                                                                                                                                                     |

Flip an `off` entry to `on` in `PROVIDER_FLAGS.azure.categories` once
the category's full handler set has a green deploy-gate row in
`inprogress/progress.md`.

## Architecture

Mirrors the AWS layout (`../aws/`):

- `azure-deployer.ts` — `ProviderDeployer` implementation; dispatches
  create/update/delete via a `HANDLER_REGISTRY` of `{ prefix, handler }`
  entries. More-specific prefixes precede less-specific ones (e.g.
  `azure.web.staticSite` before `azure.web.app`).
- `handlers/<service>.ts` — per-service handlers. Each exports a single
  `AzureResourceHandler` (`create` / `update` / `delete` triple).
- `sdk-loader.ts` — lazy-loads `@azure/arm-*` packages via
  `Function('m', 'return import(m)')` indirection so bundlers don't
  resolve optional SDK packages at build time.
- `auth.ts` — credential validation + subscription enumeration.
- `types.ts` — shared `AzureHandlerContext` and `AzureResourceHandler`
  types.

`../azure-deployer.ts` (one level up) is a back-compat shim that
re-exports `AzureDeployer` from this module so existing imports
continue to work.

## Quirks the deployer hides

### Global-uniqueness names

Storage Account, Container Registry, Static Web App, and B2C tenant
names must be globally unique across all Azure subscriptions. The
canvas appends a deterministic suffix on canvas-resolve so two users
deploying the same diagram don't collide.

### Long-running operations

Most ARM resources are async — the SDK exposes them via
`beginXxxAndWait(...)` methods that poll until provisioning settles.
Times to expect:

- Redis Cache: **15–25 minutes**.
- APIM Developer tier: **30–45 minutes**.
- AKS managed cluster: **5–10 minutes**.
- Postgres / MySQL Flexible Server: **3–5 minutes**.

The deploy event log shows the polling state; operators see a
"provisioning" pip until the SDK resolves.

### Password-required services

PostgreSQL Flex, MySQL Flex, and Synapse refuse to create without an
explicit administrator credential. Wire a `Security.Secret` block on
canvas or set the `administrator_login` + `administrator_login_password`
properties directly. This mirrors the AWS RDS / DocDB / Redshift
contract — no implicit random-password generation, ever.

### Cosmos API mode projection

The same `azure.cosmosdb.account` handler backs both `Database.CosmosDB`
(SQL API) and `Database.MongoDB` (Mongo API). The extractor reads
`iceType === 'Database.MongoDB'` and projects `kind: 'MongoDB'` +
attaches the `EnableMongo` capability; everything else routes through
the default `GlobalDocumentDB` kind.

### Container Apps managed environment auto-bootstrap

Container Apps require a parent **Managed Environment**. The handler
auto-creates `ice-default-env` in the target resource group on first
deploy (parallel to the AWS auto-cluster ECS quirk). Operators
provisioning multiple Container Apps in the same canvas share the
environment automatically.

### Logic Apps schedule sugar

`Compute.CronJob` blocks supply a `schedule_expression`; the extractor
projects that into a `Recurrence` trigger automatically so the Logic
App workflow has a valid definition shape on first deploy without the
operator hand-rolling JSON. The current default is daily recurrence —
extend the extractor for cron-syntax fidelity in Phase B4.

### Cognitive Search dual purpose

`azure.search.service` backs both `Analytics.Search` (default tier
`free`) and `AI.VectorDB` (default tier `basic` — vector workloads
need at least Basic). The extractor checks `iceType` and chooses the
right SKU.

### Resource group bootstrap

The deployer takes a `resource_groups[0]` argument at `initialize()`.
The handler trusts the caller to have created the resource group via
Terraform / Bicep / `az group create` before deploy. Auto-bootstrap on
first deploy is a Phase B4 quirk — once it ships, the handler will
detect the missing group and create it transparently.

## Extension contract

Adding a new Azure resource type:

1. Add the handler at `handlers/<service>.ts`. Use the `_result.ts`
   helpers (`ok`, `err`, `sdkMissing`) so error messages stay
   consistent with the rest of the deployer.
2. Register the SDK client in `sdk-loader.ts` if a new
   `@azure/arm-<service>` package is needed.
3. Add a `{ prefix, handler }` entry to `HANDLER_REGISTRY` in
   `azure-deployer.ts`. More-specific prefixes go first.
4. Add an extractor function in `../../extractors/azure/<file>.ts`.
5. Register the extractor in `../../extractors/dispatch.ts` —
   `PROPERTY_EXTRACTORS['azure.<service>.<kind>']`. The dispatch test
   enforces the `{provider}.{service}.{kind}` shape regex
   (`/^(gcp|aws|azure)\.[a-z0-9]+\.[a-zA-Z]+$/`) — kinds with digits
   need a different segment placement.
6. Add a mocked-SDK test under
   `packages/core/src/deploy/providers/__tests__/azure-<service>.test.ts`
   (or add an `it()` row to `azure-p1-handlers.test.ts` /
   `azure-p2-handlers.test.ts` for smoke coverage).
7. Add a live test under
   `packages/core/src/deploy/providers/__tests__/live/azure-<service>.live.test.ts`
   so the developer can run `pnpm test:live:azure <service>` against
   their own subscription. Tick the deploy-gate row in
   `inprogress/progress.md` once the round-trip succeeds.

## Cardinal rule

A handler is only "done" once a successful real-cloud deploy
round-trip is observed against a developer's own Azure subscription.
Mocked-SDK tests are necessary but not sufficient. Live tests live
under `packages/core/src/deploy/providers/__tests__/live/` and are
excluded from the default `pnpm test` run — use
`pnpm test:live:azure <service>` with valid Azure credentials in the
environment to verify.

# Phase B — Azure rebuild on the dispatcher pattern

Goal: bring Azure from a 3-handler monolith to GCP parity. Azure today is the largest gap — `enabled: false` in feature flags, no extractors, no per-service handlers, no modular layout. This phase mirrors what AWS already has.

Reference architecture: `packages/core/src/deploy/providers/aws/` for the dispatcher + sdk-loader + types + account/IAM helpers + tests. Reference handler shape: `packages/core/src/deploy/providers/gcp/handlers/pubsub.ts`.

> **Cardinal rule** ([README.md](README.md#cardinal-rule)): every handler in this phase is only "done" after a successful real-Azure deploy round-trip is observed and logged in `progress.md` → Deploy verification log. Acceptance sections below list both the code gate (tests + merge) and the deploy gate (real-cloud round-trip). Categories flip ONLY when every handler in the category has both gates ticked.

## B1 — Scaffolding refactor (no behaviour change)

Move from the single 425-line `azure-deployer.ts` to a modular directory matching AWS.

**Files to create**

- `packages/core/src/deploy/providers/azure/azure-deployer.ts` — modular dispatcher with `HANDLER_REGISTRY` (mirrors `aws/aws-deployer.ts`).
- `packages/core/src/deploy/providers/azure/types.ts` — `AzureHandlerContext`, `AzureResourceHandler` (mirror `aws/types.ts`).
- `packages/core/src/deploy/providers/azure/sdk-loader.ts` — lazy `@azure/arm-*` loading via `Function('m', 'return import(m)')`. Initialise per ARM client keyed by service short-name.
- `packages/core/src/deploy/providers/azure/auth.ts` — `validate_azure_credentials`, `list_azure_subscriptions`, `get_azure_credentials` (parallel to `gcp/auth.ts`).
- `packages/core/src/deploy/providers/azure/subscription.ts` — memoised subscription/tenant resolver (parallel to `aws/account.ts`).
- `packages/core/src/deploy/providers/azure/resource-group.ts` — `ensure_resource_group(name, location)` helper. Idempotent GetOrCreate. Defaults to `ice-{app}-rg` when canvas doesn't supply one.
- `packages/core/src/deploy/providers/azure/handlers/` — empty for now; B2 fills it.
- `packages/core/src/deploy/providers/azure/handlers/virtual-machine.ts`, `storage-account.ts`, `web-app.ts` — extract the existing 3 handlers from the monolith, no logic changes.
- `packages/core/src/deploy/providers/azure/README.md` — operator notes parallel to `aws/README.md` (rollout-state table starts mostly off).
- `packages/core/src/deploy/providers/azure/__tests__/_azure-test-harness.ts` — mirror of `_aws-test-harness.ts`.

**Files to modify**

- `packages/core/src/deploy/providers/azure-deployer.ts` — replace contents with a back-compat shim:
  ```ts
  export { AzureDeployer, create_azure_deployer } from './azure';
  export type { AzureHandlerContext, AzureResourceHandler } from './azure';
  ```
- `packages/core/src/deploy/providers/index.ts` — update import path.
- `packages/providers/azure/src/index.ts` — already re-exports from `@ice/core`; no change.

**Tests**

- Existing `azure-deployer.test.ts` should pass with no changes (shim preserves API).

**Acceptance**

- Code gate: `pnpm test packages/core --filter azure` green.
- Deploy gate: the existing VM / Storage / Web App deploy still works against a real Azure subscription post-refactor — proven by running the same canvas before and after the refactor and observing identical resource IDs. Logged in `progress.md`.
- No behavioural change visible from `packages/providers/azure/`.

**Tasks**

- [ ] Create azure/ directory + types.ts + sdk-loader.ts
- [ ] auth.ts (credential validation, list subscriptions)
- [ ] subscription.ts + resource-group.ts helpers
- [ ] Modular azure-deployer.ts with HANDLER_REGISTRY
- [ ] Migrate VM/Storage/Web handlers into per-file modules
- [ ] Back-compat shim at `azure-deployer.ts`
- [ ] Test harness file
- [ ] Existing tests green

## B2 — Per-service handlers

The largest chunk of work. ~25 handlers to reach GCP parity. Ship one PR per handler matching the GCP handler-PR shape.

Naming convention: `<azure-service>.ts` (kebab-case). Handler export: `<azure_service>_handler` (snake_case).

### P0 — must-have for `enabled: true`

| Handler              | Azure service                    | GCP analogue            | Canvas iceType                                               | Est. LOC |
| -------------------- | -------------------------------- | ----------------------- | ------------------------------------------------------------ | -------- |
| `key-vault.ts`       | Key Vault                        | secret-manager.ts (129) | `Security.Secret`, `Security.Certificate`                    | 140      |
| `service-bus.ts`     | Service Bus queue+topic          | pubsub.ts (107)         | `Messaging.ServiceBus`, `Messaging.Queue`, `Messaging.Topic` | 150      |
| `app-service.ts`     | App Service + Plan               | cloud-run.ts            | `Compute.Container` (web variant)                            | 140      |
| `container-apps.ts`  | Container Apps                   | cloud-run.ts            | `Compute.Container`, `Compute.Worker`                        | 200      |
| `functions.ts`       | Azure Functions                  | cloud-functions.ts      | `Compute.ServerlessFunction`                                 | 200      |
| `cosmosdb.ts`        | Cosmos DB SQL + Mongo APIs       | firestore.ts            | `Database.CosmosDB`, `Database.MongoDB`                      | 160      |
| `sql-database.ts`    | Azure SQL                        | cloud-sql.ts            | (template-only; no AWS-equivalent block today)               | 150      |
| `postgresql-flex.ts` | PG Flexible Server               | cloud-sql.ts            | `Database.PostgreSQL`                                        | 140      |
| `mysql-flex.ts`      | MySQL Flexible Server            | cloud-sql.ts            | `Database.MySQL`                                             | 140      |
| `redis-cache.ts`     | Azure Cache for Redis            | memorystore.ts (152)    | `Database.Redis`                                             | 130      |
| `blob-storage.ts`    | Storage Account + Blob container | cloud-storage.ts        | `Storage.Bucket`                                             | 130      |
| `log-analytics.ts`   | Log Analytics workspace          | logging.ts (118)        | `Monitoring.Log`                                             | 110      |
| `app-insights.ts`    | Application Insights             | —                       | `Monitoring.Metrics` (template-only)                         | 100      |
| `static-web-apps.ts` | Static Web Apps (static + SSR)   | firebase-hosting.ts     | `Compute.StaticSite`, `Compute.SSRSite`                      | 170      |

### P1 — network + container + APIM + WAF

| Handler               | Azure service                         | GCP analogue                                   | Canvas iceType                             | Est. LOC        |
| --------------------- | ------------------------------------- | ---------------------------------------------- | ------------------------------------------ | --------------- |
| `vnet.ts`             | Virtual Network                       | vpc.ts (134)                                   | `Network.VPC`                              | 130             |
| `subnet.ts`           | VNet Subnet                           | subnet.ts (153)                                | `Network.Subnet`                           | 150             |
| `nsg.ts`              | Network Security Group                | (no GCP equivalent — SG is via firewall rules) | `Network.SecurityGroup`                    | 130             |
| `private-endpoint.ts` | Private Endpoint                      | —                                              | `Network.PrivateNetwork`                   | 140             |
| `dns-zone.ts`         | DNS Zone                              | managed-ssl-certificate.ts                     | `Network.CustomDomain`                     | 110             |
| `aks.ts`              | AKS managed cluster                   | gke.ts (134)                                   | `Compute.K8s` (template-only)              | 200             |
| `acr.ts`              | Container Registry                    | —                                              | `Source.ContainerRegistry` (template-only) | 100             |
| `apim.ts`             | API Management                        | api-gateway.ts                                 | `Network.Gateway`                          | 220 (long poll) |
| `front-door.ts`       | Front Door + CDN                      | load-balancer.ts                               | `Network.LoadBalancer` (global path)       | 180             |
| `app-gateway.ts`      | Application Gateway                   | load-balancer.ts                               | `Network.LoadBalancer` (regional path)     | 200             |
| `azure-waf.ts`        | WAF policy (App Gateway + Front Door) | cloud-armor.ts (Cloud Armor is GCP WAF)        | `Security.WAF`                             | 130             |

### P2 — long tail

| Handler                                            | Azure service                           | GCP analogue                 | Canvas iceType                                                 | Est. LOC                |
| -------------------------------------------------- | --------------------------------------- | ---------------------------- | -------------------------------------------------------------- | ----------------------- |
| `logic-apps.ts`                                    | Logic Apps (timer trigger)              | cloud-scheduler.ts           | `Compute.CronJob`                                              | 130                     |
| `event-grid.ts`                                    | Event Grid                              | pubsub.ts (event bus path)   | (template-only; no provider-specific block)                    | 110                     |
| `event-hubs.ts`                                    | Event Hubs                              | pubsub.ts (streaming path)   | `Messaging.EventStream` (covered via block iceType resolution) | 130                     |
| `service-bus-amqp.ts` (or extend service-bus)      | Service Bus AMQP for RabbitMQ semantics | —                            | `Messaging.RabbitMQ`                                           | 60 (extractor + branch) |
| `cognitive-search.ts`                              | Cognitive Search (text)                 | discovery-engine.ts          | `Analytics.Search`                                             | 110                     |
| `ai-search-vector.ts` (or extend cognitive-search) | AI Search vector index                  | vertex-ai.ts (vector search) | `AI.VectorDB`                                                  | 90                      |
| `entra-b2c.ts`                                     | Entra External ID                       | identity-platform.ts         | `Security.Identity`                                            | 130                     |
| `azure-openai.ts`                                  | Azure OpenAI deployment                 | vertex-ai.ts (155)           | `AI.LLMGateway`                                                | 150                     |
| `azure-ml.ts`                                      | Azure ML workspace + endpoint           | vertex-ai.ts                 | `AI.ModelServing`                                              | 150                     |
| `synapse.ts`                                       | Synapse workspace                       | bigquery.ts                  | `Analytics.DataWarehouse`                                      | 180                     |
| `data-explorer.ts`                                 | Azure Data Explorer                     | bigquery.ts                  | (template-only)                                                | 150                     |

**Per-handler template**

1. Add `<service>_handler` export implementing `AzureResourceHandler` from `types.ts`.
2. Register the ARM SDK package in `sdk-loader.ts` under a stable service short-name (e.g. `'arm-keyvault'`).
3. Add `{ prefix: 'azure.<service>.<resource>', handler: <service>_handler }` to `azure-deployer.ts` HANDLER_REGISTRY. Longer prefixes first.
4. Add the corresponding extractor (B3).
5. Add per-handler test: `azure-<service>.test.ts` using the harness (code gate).
6. Add a real-Azure recipe under `e2e/azure-deployment-tests/recipes/<service>.yaml` and run it once successfully (deploy gate). See [B8](#b8--real-cloud-validation-harness).

**Tasks (one checkbox per handler)**

- P0
  - [ ] key-vault
  - [ ] service-bus
  - [ ] app-service
  - [ ] container-apps
  - [ ] functions
  - [ ] cosmosdb (SQL + Mongo APIs)
  - [ ] sql-database
  - [ ] postgresql-flex
  - [ ] mysql-flex
  - [ ] redis-cache
  - [ ] blob-storage
  - [ ] log-analytics
  - [ ] app-insights
  - [ ] static-web-apps (static + SSR)
- P1
  - [ ] vnet
  - [ ] subnet
  - [ ] nsg
  - [ ] private-endpoint
  - [ ] dns-zone
  - [ ] aks
  - [ ] acr
  - [ ] apim
  - [ ] front-door
  - [ ] app-gateway
  - [ ] azure-waf
- P2
  - [ ] logic-apps
  - [ ] event-grid
  - [ ] event-hubs
  - [ ] service-bus-amqp / RabbitMQ branch
  - [ ] cognitive-search
  - [ ] ai-search-vector
  - [ ] entra-b2c
  - [ ] azure-openai
  - [ ] azure-ml
  - [ ] synapse
  - [ ] data-explorer

## Block-to-handler coverage matrix (Azure)

After B1–B3 land, every Azure block iceType has a deployer mapping. The table is the single check for "is Azure done":

| Block file                     | iceType                    | Handler                           | Phase tag |
| ------------------------------ | -------------------------- | --------------------------------- | --------- |
| ai/llm-gateway.ts              | AI.LLMGateway              | azure-openai                      | B2 P2     |
| ai/ml-model.ts                 | AI.ModelServing            | azure-ml                          | B2 P2     |
| ai/vector-db.ts                | AI.VectorDB                | ai-search-vector                  | B2 P2     |
| analytics/data-warehouse.ts    | Analytics.DataWarehouse    | synapse                           | B2 P2     |
| analytics/search.ts            | Analytics.Search           | cognitive-search                  | B2 P2     |
| backend/scalable-backend.ts    | Compute.Container          | container-apps + app-service      | B2 P0     |
| backend/scheduled-task.ts      | Compute.CronJob            | logic-apps                        | B2 P2     |
| backend/worker.ts              | Compute.Worker             | container-apps (job mode)         | B2 P0     |
| compute/serverless-function.ts | Compute.ServerlessFunction | functions                         | B2 P0     |
| data/cosmosdb.ts               | Database.CosmosDB          | cosmosdb                          | B2 P0     |
| data/mongodb.ts                | Database.MongoDB           | cosmosdb (Mongo API)              | B2 P0     |
| data/mysql.ts                  | Database.MySQL             | mysql-flex                        | B2 P0     |
| data/postgresql.ts             | Database.PostgreSQL        | postgresql-flex                   | B2 P0     |
| data/redis-cache.ts            | Database.Redis             | redis-cache                       | B2 P0     |
| frontend/ssr-site.ts           | Compute.SSRSite            | static-web-apps                   | B2 P0     |
| frontend/static-site.ts        | Compute.StaticSite         | static-web-apps                   | B2 P0     |
| messaging/event-stream.ts      | Messaging.Topic            | service-bus (topic) or event-hubs | B2 P0/P2  |
| messaging/rabbitmq.ts          | Messaging.RabbitMQ         | service-bus-amqp                  | B2 P2     |
| messaging/service-bus.ts       | Messaging.ServiceBus       | service-bus                       | B2 P0     |
| networking/gateway.ts          | Network.Gateway            | apim                              | B2 P1     |
| networking/subnet.ts           | Network.Subnet             | subnet                            | B2 P1     |
| networking/vpc.ts              | Network.VPC                | vnet                              | B2 P1     |
| (shared)                       | Network.SecurityGroup      | nsg                               | B2 P1     |
| (shared)                       | Network.PrivateNetwork     | private-endpoint                  | B2 P1     |
| (shared)                       | Network.CustomDomain       | dns-zone                          | B2 P1     |
| (shared)                       | Network.LoadBalancer       | front-door / app-gateway          | B2 P1     |
| observability/logs.ts          | Monitoring.Log             | log-analytics                     | B2 P0     |
| security/auth.ts               | Security.Identity          | entra-b2c                         | B2 P2     |
| security/secrets.ts            | Security.Secret            | key-vault                         | B2 P0     |
| security/ssl-certificate.ts    | Security.Certificate       | key-vault (cert)                  | B2 P0     |
| security/waf.ts                | Security.WAF               | azure-waf                         | B2 P1     |
| storage/storage.ts             | Storage.Bucket             | blob-storage                      | B2 P0     |

## B3 — Extractors

Today there are zero Azure extractors. The dispatcher in `packages/core/src/deploy/extractors/dispatch.ts` has no Azure entries — meaning even with handlers in place the deploy-expansion pass fails before reaching them.

**Files to create**

- `packages/core/src/deploy/extractors/azure/ai.ts`
- `packages/core/src/deploy/extractors/azure/ancillary.ts`
- `packages/core/src/deploy/extractors/azure/compute.ts`
- `packages/core/src/deploy/extractors/azure/database.ts`
- `packages/core/src/deploy/extractors/azure/network.ts`

**Files to modify**

- `packages/core/src/deploy/extractors/dispatch.ts` — register every `azure.*` iceType against its extractor. The integrity test in `__tests__/dispatch.test.ts` regex (`/^(gcp|aws|azure)\.[a-z0-9]+\.[a-zA-Z]+$/`) already permits Azure entries.

**Per-extractor template**

- Take `data: Record<string, unknown>`, `region: string`, optional `node_id`.
- Default to safe values (mirror AWS extractors). Document defaults inline.
- Return the deploy-handler input shape.
- For Storage Blob, Cosmos DB, SQL Server: enforce required fields the same way RDS/DocDB enforce `master_user_password`.

**Tasks**

- [ ] ai.ts (azure-openai, azure-ml, ai-search-vector)
- [ ] ancillary.ts (key-vault inc. certificates, service-bus, event-grid, event-hubs, log-analytics, app-insights, acr, dns-zone)
- [ ] compute.ts (app-service, container-apps + worker variant, functions, aks, logic-apps, static-web-apps for both StaticSite + SSRSite)
- [ ] database.ts (cosmosdb SQL + Mongo, sql-database, postgresql-flex, mysql-flex, redis-cache)
- [ ] network.ts (vnet, subnet, nsg, private-endpoint, blob-storage, apim, front-door, app-gateway, azure-waf, cognitive-search, synapse, data-explorer)
- [ ] messaging.ts (service-bus-amqp / rabbitmq branch)
- [ ] All entries registered in `dispatch.ts`
- [ ] `dispatch.test.ts` parity case for Azure passes (every Azure iceType in the block registry resolves)

## B4 — Azure-specific quirks to bake in

Each is a constraint that, if missed, results in either silently-broken deploys (storage name collision) or operator confusion (no resource group). Document each in `azure/README.md` parallel to AWS quirks.

| Quirk                                   | Where                                                                                                                              | Handler                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Globally unique storage account names   | append subscription-derived 6-char hash; provider_id includes the post-suffix name                                                 | `blob-storage.ts`                                                                    |
| Cosmos DB consistency default           | extractor defaults `consistency_policy.defaultConsistencyLevel = 'Session'`                                                        | `cosmosdb.ts`                                                                        |
| Cosmos DB API mode                      | extractor projects `Database.MongoDB` → Cosmos `kind=MongoDB` with the right capabilities array                                    | `cosmosdb.ts`                                                                        |
| SQL/PG/MySQL `master_user_password`     | refuse to create with empty password (same enforcement shape as RDS)                                                               | `sql-database.ts`, `postgresql-flex.ts`, `mysql-flex.ts`                             |
| Long-running operations                 | poll `ResourceManagerClient.checkLongRunningOperationStatus`; report via `ctx.on_step`; honour `ctx.abort_signal`                  | `apim.ts`, `app-gateway.ts`, `front-door.ts`, `synapse.ts`, `aks.ts`, `azure-waf.ts` |
| Resource group auto-bootstrap           | call `ensure_resource_group` from every handler that lacks an operator-supplied group                                              | all handlers                                                                         |
| Container Apps env + Log Analytics      | auto-provision parallel to ECS auto-cluster — create `ManagedEnvironment` if absent                                                | `container-apps.ts`                                                                  |
| Container Apps worker mode              | extractor for `Compute.Worker` projects to Container Apps `Job` resource type (vs `App`)                                           | `container-apps.ts` extractor                                                        |
| App Service Plan dependency             | create ASP before Web App if not supplied                                                                                          | `app-service.ts`                                                                     |
| Key Vault secret values                 | values never written by ICE — operators populate (parallel to Secret Manager / Secrets Manager contract)                           | `key-vault.ts`                                                                       |
| Key Vault certificate provisioning      | `Security.Certificate` block creates a Key Vault certificate; App Gateway / Front Door pulls via reference URL                     | `key-vault.ts`                                                                       |
| Service Bus session-enabled queues      | the FIFO equivalent; expose `session_enabled` via extractor                                                                        | `service-bus.ts`                                                                     |
| Service Bus AMQP for RabbitMQ semantics | extractor projects `Messaging.RabbitMQ` → Service Bus with AMQP protocol enabled; document the protocol-compatibility caveat       | `service-bus.ts` extractor branch                                                    |
| Event Hubs throughput units             | extractor defaults `throughput_units=1`; auto-inflate when block exposes a `scale` knob                                            | `event-hubs.ts`                                                                      |
| Functions storage account dep           | every Function App requires a storage account — auto-provision under `ice-{app}-funcsa{hash}`                                      | `functions.ts`                                                                       |
| Static Web Apps build settings          | extractor reads connected `Source.Repository` → projects to `repositoryUrl` + `branch` + build config                              | `static-web-apps.ts` extractor                                                       |
| Static Web Apps SSR mode                | `Compute.SSRSite` extractor sets `apiLocation` + `outputLocation`; `Compute.StaticSite` only `outputLocation`                      | `static-web-apps.ts` extractor                                                       |
| ACR admin user disabled by default      | for security; expose via property only                                                                                             | `acr.ts`                                                                             |
| Private Endpoint subnet dep             | requires a canvas-driven `Network.Subnet` with `privateEndpointNetworkPolicies=Disabled`                                           | `private-endpoint.ts`                                                                |
| WAF policy SKU + association            | `Detection` vs `Prevention` mode; default `Prevention`. Associate with App Gateway listener or Front Door endpoint via canvas edge | `azure-waf.ts`                                                                       |
| MySQL Flexible Server SKU               | `Standard_B1ms` default — same cost-tier shape as PG flex                                                                          | `mysql-flex.ts`                                                                      |

**Tasks**

- [ ] Storage suffix logic
- [ ] Cosmos consistency default
- [ ] Cosmos API mode projection (`Mongo` vs SQL)
- [ ] SQL/PG/MySQL password enforcement
- [ ] Long-running op polling helper in shared `azure/long-running.ts`
- [ ] Resource group auto-bootstrap wired into every handler
- [ ] Container Apps env auto-provision
- [ ] Container Apps worker (job) extractor
- [ ] App Service Plan auto-provision
- [ ] Key Vault no-value contract for secrets
- [ ] Key Vault certificate provisioning path
- [ ] Service Bus session-enabled (FIFO) handling
- [ ] Service Bus AMQP / RabbitMQ branch
- [ ] Event Hubs throughput defaults
- [ ] Functions storage account auto-provision
- [ ] Static Web Apps build/SSR extractor projection
- [ ] Private Endpoint subnet preflight
- [ ] WAF SKU + canvas-edge association
- [ ] MySQL Flexible Server SKU defaults
- [ ] ACR security defaults
- [ ] `azure/README.md` quirks section

## B5 — Auth + credentials + tests

The desktop and gateway already accept Azure tenant/client/secret/subscription input. Make sure the deploy path uses it end-to-end.

**Files to create**

- `packages/core/src/deploy/providers/azure/auth.ts` — `validate_azure_credentials({ tenant_id, client_id, client_secret, subscription_id })` that calls `arm-resources.SubscriptionsClient.get(subscription_id)` and returns subscription metadata. Mirror of `gcp/auth.ts` validation step.
- Per-handler test files in `packages/core/src/deploy/providers/azure/__tests__/`.

**Files to modify**

- The settings UI provider-validation hook to call the new `validate_azure_credentials` (parallel to how AWS uses STS GetCallerIdentity).

**Acceptance**

- Adding an Azure provider in Settings → Providers with the right principal returns subscription metadata.
- Same flow with a bad secret returns a typed error mapped through `errors/import-errors/azure.ts`.

**Tasks**

- [ ] auth.ts with validate + list_subscriptions
- [ ] Wire validation into provider settings UI
- [ ] Per-handler test files (one per B2 handler)
- [ ] Error mapping in `errors/import-errors/azure.ts`

## B6 — Feature flag rollout

Mirror AWS's staged rollout. Don't flip everything at once — let each category turn on as its handler set + extractor set ships.

**Files to modify**

- `packages/constants/src/feature-flags.ts` — `PROVIDER_FLAGS.azure`:
  - Set `enabled: true` after B1 + P0 handlers land.
  - Flip categories incrementally:
    - `Storage` — after blob-storage
    - `Messaging` — after service-bus + event-grid
    - `Cache` — after redis-cache
    - `Monitoring` — after log-analytics + app-insights
    - `Security` — after key-vault + entra-b2c
    - `Source` — after acr
    - `Config` — provider-agnostic; flip with enabled
    - `Compute` — after app-service + container-apps + functions + aks (with vnet/subnet ready)
    - `Database` — after cosmosdb + sql-database + postgresql-flex
    - `Network` — after vnet + subnet + nsg + front-door + app-gateway + apim + dns-zone
    - `Frontend` — after app-service (static sites) + front-door + dns-zone + cert provisioning
    - `Scheduler` — after logic-apps
    - `AI` — after azure-openai + azure-ml
    - `Analytics` — after synapse + data-explorer

The integrity test in `packages/constants/src/__tests__/index.test.ts` keeps the category map exhaustive; new `CategoryId` values force a deliberate decision.

**Tasks** (one per category flip)

- [ ] enabled: true
- [ ] Storage
- [ ] Messaging
- [ ] Cache
- [ ] Monitoring
- [ ] Security
- [ ] Source
- [ ] Config
- [ ] Compute
- [ ] Database
- [ ] Network
- [ ] Frontend
- [ ] Scheduler
- [ ] AI
- [ ] Analytics

## B7 — Docs

**Files to modify/create**

- `docs/deploying-to-azure.md` — replace thin "What works today" with the full handler list. Add quirks summary linking to `azure/README.md`.
- `packages/core/src/deploy/providers/azure/README.md` — created in B1; flesh out as handlers land. Rollout-state table mirrors AWS shape.
- `docs/provider-status.md` — bump the Azure row as categories flip.
- `docs/extending-providers.md` — verify the walkthrough still matches (likely already provider-agnostic).

**Tasks**

- [ ] Rewrite `deploying-to-azure.md` "What works today"
- [ ] Flesh out `azure/README.md` quirks
- [ ] Update `docs/provider-status.md` matrix per flip

## B8 — Live-cloud deployability tests (developer tool)

The cardinal rule (see [README.md](README.md#cardinal-rule)) requires every Azure handler to be verified by a real-Azure deploy. B8 ships the **developer-run** live-test surface that proves a handler works against real Azure.

**Not CI.** These tests touch real cloud, cost real money, take real time. They're a developer self-serve tool — `pnpm test:live:azure <handler>` runs a single live test against the developer's own subscription.

### B8.1 — Foundation

Pattern mirrors AWS A6.1. Shared helpers module + per-provider factories.

**Files to create**

- Extend `packages/core/src/deploy/providers/__tests__/live/_live-helpers.ts` (created in A6.1) with `azureLive` skip-aware describe wrapper, `uniqueAzureName(prefix, maxLen)` respecting per-service name limits (Storage Account 24, Key Vault 24, Function App 60, etc.), `createAzureDeployer()` that returns an initialised `AzureDeployer` using `DefaultAzureCredential`, Azure-specific resource-group bootstrap.
- `e2e/azure-deployment-tests/README.md` — developer notes: env contract (`AZURE_SUBSCRIPTION_ID`, `AZURE_LOCATION`, credentials via `az login` or service-principal env vars), sample commands, per-handler expected cost.
- `e2e/azure-deployment-tests/runs/.gitkeep` — pre-create the JSONL output directory.
- `e2e/azure-deployment-tests/cleanup-orphans.ts` — scans for `ice:test-run-id` tag via Azure Resource Graph, deletes leaked resources older than 1 hour. Manual-run.

**Files to modify**

- `scripts/run-live-tests.mjs` (created in A6.1) — already accepts a provider arg; no change.
- `package.json` (root) — add `test:live:azure` script.

### B8.2 — Per-handler live test

Every Azure handler in the Block-to-handler coverage matrix has a `*.live.test.ts` at `packages/core/src/deploy/providers/__tests__/live/azure-<service>.live.test.ts`. Template:

```ts
azureLive('azure.<service>.<resource>', () => {
  let deployer: AzureDeployer;
  let logger: JsonlLogger;
  let rg: string;

  beforeAll(async () => {
    deployer = await createAzureDeployer();
    rg = await ensure_test_resource_group(); // ice-test-rg-<runId>
    logger = new JsonlLogger('azure-<service>');
  });
  afterAll(async () => {
    await deployer.cleanup();
    await delete_test_resource_group(rg); // sweeps everything tagged with this run id
    logger.close();
  });

  it('create + delete round-trip', async () => {
    const name = uniqueAzureName('<service>', <max-len>);
    let providerId: string | undefined;
    try {
      const r = await deployer.create('azure.<service>.<resource>', name, { resource_group: rg, location, ... }, {});
      logger.log({ kind: 'create', result: r });
      expect(r.success).toBe(true);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('azure.<service>.<resource>', name, providerId, {});
        logger.log({ kind: 'delete', result: d });
        expect(d.success).toBe(true);
      }
    }
  });

  // for handlers with update path: it('update round-trip', ...)
});
```

Each test file's header comment lists expected runtime + cost + quirks (e.g. "Cosmos DB with serverless capacity — sub-$1 per run; provisions in ~3 min").

### B8.3 — Deploy gate

Developer ergonomics:

```
az login                           # or set service-principal env vars
export AZURE_SUBSCRIPTION_ID=...
export AZURE_LOCATION=eastus

pnpm test:live:azure               # run every Azure live test
pnpm test:live:azure key-vault     # run only key-vault
pnpm test:live:azure key-vault service-bus cosmosdb   # run three
```

Without env, tests skip with a one-line banner explaining what to export. The developer who runs a live test successfully appends a row to `progress.md` → Deploy verification log; their corresponding deploy-gate checkbox flips.

### B8.4 — Cleanup contract

- Every test's `finally` block deletes its resource.
- `afterAll` deletes the entire test resource group, which sweeps any leaks from this run.
- Resources are tagged `ice:test-run-id=<runId>`.
- If a test crashes hard, `pnpm tsx e2e/azure-deployment-tests/cleanup-orphans.ts --delete` sweeps orphaned resource groups + resources from prior crashed runs.

**Tasks**

- [ ] B8.1 extend `_live-helpers.ts` with Azure helpers
- [ ] B8.1 `e2e/azure-deployment-tests/` README + cleanup-orphans
- [ ] B8.1 `test:live:azure` script
- [ ] B8.2 live test per existing handler (3 files: VM, Storage Account, Web App)
- [ ] B8.2 live test per new handler (added in the handler's PR — see B2 P0/P1/P2)
- [ ] B8.3 Developer-run docs in `e2e/azure-deployment-tests/README.md`
- [ ] B8.4 cleanup-orphans tested locally

## Cross-cutting acceptance

When Phase B is done:

- `PROVIDER_FLAGS.azure.enabled === true` and all categories on.
- 25+ handlers ship under `packages/core/src/deploy/providers/azure/handlers/`.
- `packages/core/src/deploy/extractors/azure/` covers every Azure iceType the canvas can emit.
- `azure/README.md` rollout-state table is all green.
- **Cardinal rule**: every handler row in the Block-to-handler matrix has its deploy gate ticked in `progress.md` with a JSONL entry in `e2e/azure-deployment-tests/runs/` for proof.
- Azure still listed `experimental` until Phase D — Importer (C2) ships first AND every handler has been deploy-verified at least once by a developer.

## Dependencies within Phase B

```
B1 (scaffolding)
  │
  ├─► B2 P0 handlers ──┬─► B6 enabled: true
  │                    │
  ├─► B3 extractors    │   (mandatory for B2 to actually work end-to-end)
  │                    │
  ├─► B4 quirks ───────┘   (wired into B2 handlers as they ship)
  │
  ├─► B5 auth/tests (parallel; one test PR per B2 handler)
  │
  └─► B2 P1 + P2 handlers ──► remaining B6 category flips
                                          │
                                          └─► B7 docs (final pass)
```

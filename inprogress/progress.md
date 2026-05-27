# Provider Parity — Progress Dashboard

Single-page view of every task across phases A–D. Phase docs ([aws-parity.md](aws-parity.md), [azure-rebuild.md](azure-rebuild.md), [importers-and-cost.md](importers-and-cost.md), [status-flip.md](status-flip.md)) hold the detail.

## Gating policy (cardinal rule)

A handler has TWO gates. Both must tick before the handler is "done":

- **C** — Code gate: handler + extractor + mocked-SDK tests merged; CI green.
- **D** — Deploy gate: at least one successful real-cloud round-trip (create + update if applicable + delete) observed against a real AWS account or Azure subscription, with a JSONL entry under `e2e/{aws,azure}-deployment-tests/`. See ↓ "Deploy verification log" near the bottom.

A category flag flips only when every handler in the category has both C and D ticked. The `PROVIDER_READINESS = 'stable'` flip (Phase D) requires every handler's D gate, plus 7 consecutive green nightly scheduled runs.

Legend: `□` not started · `◐` in progress · `■` done · `—` blocked · `C` = code gate · `D` = deploy gate

Last updated: 2026-05-27 (cardinal rule integrated)

## Phase A — AWS

### A1 — Network primitives (handlers)

| C   | D   | Handler        | Block source          |
| --- | --- | -------------- | --------------------- |
| □   | □   | vpc            | Network.VPC           |
| □   | □   | subnet         | Network.Subnet        |
| □   | □   | security-group | Network.SecurityGroup |

### A1 — Network primitives (wiring)

| Status | Task                                                                                         |
| ------ | -------------------------------------------------------------------------------------------- |
| □      | ECS consume canvas subnets/SGs (code + real-deploy verified)                                 |
| □      | RDS/ElastiCache/ELBv2 consume canvas subnets/SGs (code + real-deploy verified)               |
| □      | flip Compute + Network in feature flags (only after every handler in those categories has D) |

### A2 — ACM cert + DNS (handlers)

| C   | D   | Handler                          | Block source         |
| --- | --- | -------------------------------- | -------------------- |
| □   | □   | acm                              | Security.Certificate |
| □   | □   | route53                          | Network.CustomDomain |
| □   | □   | cloudfront (consume canvas cert) | (re-verify)          |

### A2 — flip

| Status | Task                                        |
| ------ | ------------------------------------------- |
| □      | flip Frontend (after handlers above have D) |

### A3 — EventBridge schedule

| C   | D   | Handler                                  |
| --- | --- | ---------------------------------------- |
| □   | □   | events-rule (schedule_expression branch) |

| Status | Task                      |
| ------ | ------------------------- |
| □      | extractor cron projection |
| □      | flip Scheduler            |

### A4 — Update paths (handlers)

| C   | D   | Handler                       | Notes                  |
| --- | --- | ----------------------------- | ---------------------- |
| □   | □   | cloudfront UpdateDistribution | propagation poll       |
| □   | □   | cognito UpdateUserPool        | password + MFA changes |
| □   | □   | docdb ModifyDBCluster         | maintenance window     |
| □   | □   | redshift ModifyCluster        | reshape long-running   |
| □   | □   | ec2 ModifyVolume              | EBS only               |

### A4 — flips

| Status | Task                                                    |
| ------ | ------------------------------------------------------- |
| □      | flip Database (after RDS + DocDB + DynamoDB all have D) |
| □      | flip AI (after SageMaker has D — mocks don't count)     |
| □      | flip Analytics (after Redshift + OpenSearch have D)     |

### A5 — CodeBuild path

| C   | D   | Handler   |
| --- | --- | --------- |
| □   | □   | codebuild |

| Status | Task                          |
| ------ | ----------------------------- |
| □      | lambda-builder fallback chain |

### A6 — Validation harness

| Status | Task                                                           |
| ------ | -------------------------------------------------------------- |
| □      | A6.1 LocalStack container in CI                                |
| □      | A6.1 LocalStack smoke test per handler                         |
| □      | A6.1 wire to PR workflow                                       |
| □      | A6.2 `e2e/aws-deployment-tests/` recipe directory              |
| □      | A6.2 runner with JSONL output                                  |
| □      | A6.2 dashboard                                                 |
| □      | A6.2 one recipe per handler (29 recipes)                       |
| □      | A6.2 scheduled CI run + dashboard auto-refresh                 |
| □      | A6.3 deploy-verification gate enforced in plan-merge checklist |

### A7 — Block-coverage completeness (handlers)

| C   | D   | Handler                                  | Block source           |
| --- | --- | ---------------------------------------- | ---------------------- |
| □   | □   | amplify-hosting                          | Compute.SSRSite        |
| □   | □   | amazon-mq                                | Messaging.RabbitMQ     |
| □   | □   | wafv2                                    | Security.WAF           |
| □   | □   | vpc-endpoint                             | Network.PrivateNetwork |
| □   | □   | opensearch-serverless                    | AI.VectorDB            |
| □   | □   | ecs (worker extractor variant)           | Compute.Worker         |
| □   | □   | dispatch reg for `aws.ec2.securityGroup` | A1 carry-over          |

## Phase B — Azure

### B1 — Scaffolding

| Status | Task                                                             |
| ------ | ---------------------------------------------------------------- |
| □      | Create `azure/` directory + types.ts + sdk-loader.ts             |
| □      | auth.ts (validate, list_subscriptions)                           |
| □      | subscription.ts + resource-group.ts helpers                      |
| □      | Modular azure-deployer.ts with HANDLER_REGISTRY                  |
| □      | Migrate VM/Storage/Web handlers into per-file modules            |
| □      | Back-compat shim at `azure-deployer.ts`                          |
| □      | Test harness (`_azure-test-harness.ts`)                          |
| □      | Existing tests green (code gate)                                 |
| □      | Real-Azure VM/Storage/Web round-trip post-refactor (deploy gate) |

### B2 — Handlers (P0)

| C   | D   | Handler                | Block source                           |
| --- | --- | ---------------------- | -------------------------------------- |
| □   | □   | key-vault              | Security.Secret + Security.Certificate |
| □   | □   | service-bus            | Messaging.ServiceBus + Queue + Topic   |
| □   | □   | app-service            | Compute.Container (web variant)        |
| □   | □   | container-apps         | Compute.Container + Compute.Worker     |
| □   | □   | functions              | Compute.ServerlessFunction             |
| □   | □   | cosmosdb (SQL + Mongo) | Database.CosmosDB + Database.MongoDB   |
| □   | □   | sql-database           | (template-only)                        |
| □   | □   | postgresql-flex        | Database.PostgreSQL                    |
| □   | □   | mysql-flex             | Database.MySQL                         |
| □   | □   | redis-cache            | Database.Redis                         |
| □   | □   | blob-storage           | Storage.Bucket                         |
| □   | □   | log-analytics          | Monitoring.Log                         |
| □   | □   | app-insights           | (template-only)                        |
| □   | □   | static-web-apps        | Compute.StaticSite + Compute.SSRSite   |

### B2 — Handlers (P1)

| C   | D   | Handler          | Block source                    |
| --- | --- | ---------------- | ------------------------------- |
| □   | □   | vnet             | Network.VPC                     |
| □   | □   | subnet           | Network.Subnet                  |
| □   | □   | nsg              | Network.SecurityGroup           |
| □   | □   | private-endpoint | Network.PrivateNetwork          |
| □   | □   | dns-zone         | Network.CustomDomain            |
| □   | □   | aks              | (template-only)                 |
| □   | □   | acr              | (template-only)                 |
| □   | □   | apim             | Network.Gateway                 |
| □   | □   | front-door       | Network.LoadBalancer (global)   |
| □   | □   | app-gateway      | Network.LoadBalancer (regional) |
| □   | □   | azure-waf        | Security.WAF                    |

### B2 — Handlers (P2)

| C   | D   | Handler                            | Block source            |
| --- | --- | ---------------------------------- | ----------------------- |
| □   | □   | logic-apps                         | Compute.CronJob         |
| □   | □   | event-grid                         | (template-only)         |
| □   | □   | event-hubs                         | Messaging.EventStream   |
| □   | □   | service-bus-amqp / RabbitMQ branch | Messaging.RabbitMQ      |
| □   | □   | cognitive-search                   | Analytics.Search        |
| □   | □   | ai-search-vector                   | AI.VectorDB             |
| □   | □   | entra-b2c                          | Security.Identity       |
| □   | □   | azure-openai                       | AI.LLMGateway           |
| □   | □   | azure-ml                           | AI.ModelServing         |
| □   | □   | synapse                            | Analytics.DataWarehouse |
| □   | □   | data-explorer                      | (template-only)         |

### B3 — Extractors

| Status | File                                    |
| ------ | --------------------------------------- |
| □      | `extractors/azure/ai.ts`                |
| □      | `extractors/azure/ancillary.ts`         |
| □      | `extractors/azure/compute.ts`           |
| □      | `extractors/azure/database.ts`          |
| □      | `extractors/azure/messaging.ts`         |
| □      | `extractors/azure/network.ts`           |
| □      | All entries registered in `dispatch.ts` |
| □      | `dispatch.test.ts` Azure parity case    |

### B4 — Quirks

| Status | Quirk                                          |
| ------ | ---------------------------------------------- |
| □      | Storage account global-uniqueness suffix       |
| □      | Cosmos consistency default = Session           |
| □      | Cosmos API mode projection (Mongo vs SQL)      |
| □      | SQL/PG/MySQL password enforcement              |
| □      | Long-running operation polling helper          |
| □      | Resource group auto-bootstrap                  |
| □      | Container Apps env auto-provision              |
| □      | Container Apps worker (job) extractor          |
| □      | App Service Plan auto-provision                |
| □      | Key Vault no-value contract for secrets        |
| □      | Key Vault certificate provisioning path        |
| □      | Service Bus session-enabled (FIFO) handling    |
| □      | Service Bus AMQP / RabbitMQ branch             |
| □      | Event Hubs throughput defaults                 |
| □      | Functions storage account auto-provision       |
| □      | Static Web Apps build/SSR extractor projection |
| □      | Private Endpoint subnet preflight              |
| □      | WAF SKU + canvas-edge association              |
| □      | MySQL Flexible Server SKU defaults             |
| □      | ACR security defaults                          |
| □      | `azure/README.md` quirks section               |

### B5 — Auth + tests

| Status | Task                                                       |
| ------ | ---------------------------------------------------------- |
| □      | auth.ts: validate_azure_credentials                        |
| □      | auth.ts: list_azure_subscriptions                          |
| □      | Wire validation into provider settings UI                  |
| □      | Per-handler test file per B2 handler (covers C gate above) |
| □      | `errors/import-errors/azure.ts` error mapping              |

### B6 — Feature flags

| Status | Flag (flips only when every handler in the category has C + D) |
| ------ | -------------------------------------------------------------- |
| □      | `azure.enabled = true`                                         |
| □      | Storage                                                        |
| □      | Messaging                                                      |
| □      | Cache                                                          |
| □      | Monitoring                                                     |
| □      | Security                                                       |
| □      | Source                                                         |
| □      | Config                                                         |
| □      | Compute                                                        |
| □      | Database                                                       |
| □      | Network                                                        |
| □      | Frontend                                                       |
| □      | Scheduler                                                      |
| □      | AI                                                             |
| □      | Analytics                                                      |

### B7 — Docs

| Status | Doc                                                     |
| ------ | ------------------------------------------------------- |
| □      | Rewrite `docs/deploying-to-azure.md` "What works today" |
| □      | Flesh out `azure/README.md` quirks                      |
| □      | Update `docs/provider-status.md` per category flip      |

### B8 — Validation harness

| Status | Task                                                           |
| ------ | -------------------------------------------------------------- |
| □      | B8.1 Azurite container in CI                                   |
| □      | B8.1 wire to PR workflow                                       |
| □      | B8.2 `e2e/azure-deployment-tests/` recipe directory            |
| □      | B8.2 shared or Azure-specific runner with JSONL output         |
| □      | B8.2 dashboard                                                 |
| □      | B8.2 one recipe per handler (29 recipes)                       |
| □      | B8.2 scheduled CI run + dashboard auto-refresh                 |
| □      | B8.3 deploy-verification gate enforced in plan-merge checklist |

## Phase C — Importers + cost

| Status | Task                                                           |
| ------ | -------------------------------------------------------------- |
| □      | C1: wire `import_aws` into desktop import wizard               |
| □      | C1: region multi-select UI                                     |
| □      | C1: credential reuse                                           |
| □      | C1: AWS zero-diff round-trip on a real account (logged)        |
| □      | C2: `importers/azure/relationships.ts`                         |
| □      | C2: type-mapper completeness vs B2                             |
| □      | C2: wire `import_azure` into desktop import wizard             |
| □      | C2: Azure region/subscription multi-select UI                  |
| □      | C2: Azure credential reuse                                     |
| □      | C2: Azure zero-diff round-trip on a real subscription (logged) |
| □      | C2: relationships test                                         |
| □      | C2: integration test                                           |
| □      | C3: AWS cost-data coverage inventory                           |
| □      | C3: Azure cost-data coverage inventory                         |
| □      | C3: populate AWS prices for Phase A categories                 |
| □      | C3: populate Azure prices for Phase B categories               |
| □      | C3: coverage regression test                                   |

## Phase D — Status flip

| Status | Task                                                     |
| ------ | -------------------------------------------------------- |
| □      | D1: `PROVIDER_READINESS.aws = 'stable'`                  |
| □      | D1: `PROVIDER_READINESS.azure = 'stable'`                |
| □      | D2: refresh `deploying-to-aws.md`                        |
| □      | D2: refresh `deploying-to-azure.md`                      |
| □      | D2: refresh `provider-status.md` matrix                  |
| □      | D2: README provider callouts                             |
| □      | D3: AWS operator notes refresh                           |
| □      | D3: Azure operator notes refresh                         |
| □      | D4: ROADMAP "Providers" section refresh                  |
| □      | D5: CHANGELOG entry                                      |
| □      | D6: 7 consecutive green scheduled runs for AWS recipes   |
| □      | D6: 7 consecutive green scheduled runs for Azure recipes |
| □      | D6: template demo deploy on real AWS account             |
| □      | D6: template demo deploy on real Azure subscription      |

## Rollup

Handlers are counted twice (C + D). Non-handler tasks count once.

| Phase           | Code gates (C) | Deploy gates (D) | Other tasks | Total   |
| --------------- | -------------- | ---------------- | ----------- | ------- |
| A1              | 3              | 3                | 3           | 9       |
| A2              | 3              | 3                | 1           | 7       |
| A3              | 1              | 1                | 2           | 4       |
| A4              | 5              | 5                | 3           | 13      |
| A5              | 1              | 1                | 1           | 3       |
| A6              | —              | —                | 9           | 9       |
| A7              | 7              | 7                | —           | 14      |
| **A total**     | **20**         | **20**           | **19**      | **59**  |
| B1              | —              | —                | 9           | 9       |
| B2 P0           | 14             | 14               | —           | 28      |
| B2 P1           | 11             | 11               | —           | 22      |
| B2 P2           | 11             | 11               | —           | 22      |
| B3              | —              | —                | 8           | 8       |
| B4              | —              | —                | 21          | 21      |
| B5              | —              | —                | 5           | 5       |
| B6              | —              | —                | 15          | 15      |
| B7              | —              | —                | 3           | 3       |
| B8              | —              | —                | 8           | 8       |
| **B total**     | **36**         | **36**           | **69**      | **141** |
| C               | —              | —                | 17          | 17      |
| D               | —              | —                | 14          | 14      |
| **Grand total** | **56**         | **56**           | **119**     | **231** |

Progress: 0 / 231.

Code-gate progress: 0 / 56.
Deploy-gate progress: 0 / 56.

Provider is "deploy-ready" (all D gates ticked) when deploy-gate progress hits 56 / 56.

## Deploy verification log

Append one row per successful real-cloud round-trip. The corresponding D checkbox flips to `■` only after a row lands here.

Required columns: date · provider · handler · recipe path · ARN/resource-id observed · JSONL run path · operator.

| Date | Provider | Handler | Recipe | Resource ID | JSONL run | Operator |
| ---- | -------- | ------- | ------ | ----------- | --------- | -------- |
| —    | —        | —       | —      | —           | —         | —        |

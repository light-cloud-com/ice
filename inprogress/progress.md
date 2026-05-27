# Provider Parity — Progress Tree

Nested checklist across phases A–D. A parent flips to 🟢 only when every child is 🟢.
Phase docs ([aws-parity.md](aws-parity.md), [azure-rebuild.md](azure-rebuild.md), [importers-and-cost.md](importers-and-cost.md), [status-flip.md](status-flip.md)) hold the detail.

## Status legend

- 🔴 not started
- 🟠 in progress / partial (some sub-leaves done, others pending)
- 🟢 done (all sub-leaves done; for handlers, both code gate AND deploy gate)

## Per-handler leaves (6 per handler)

Each handler row expands to:

- `(C) handler` — handler file + sdk-loader entry + HANDLER_REGISTRY entry
- `(C) extractor` — extractor function + dispatch.ts entry
- `(C) mocked test` — `<provider>-<service>.test.ts` using the per-provider harness
- `(C) schema` — `ice-schemas.db` has the resource type with properties matching handler input; properties panel verified
- `(D) live test` — `<provider>-<service>.live.test.ts` runs green on a developer's real account (deploy gate)
- `docs` — per-provider deploy doc + blocks-reference + provider-status + `<provider>/README.md` quirks row

C-gates are code; D-gate is real-cloud deploy. `docs` lands with the handler PR.

## Phase A — AWS

- 🟠 **A1 — Network primitives**
  - 🟠 vpc handler (Network.VPC)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🟠 subnet handler (Network.Subnet)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🟠 security-group handler (Network.SecurityGroup)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🟠 wiring: ECS consume canvas subnets/SGs (code done; real-deploy pending)
  - 🟠 wiring: ELBv2 consume canvas subnets/SGs/VPC (code done; real-deploy pending)
  - 🟠 wiring: RDS auto-bootstrap DB subnet group (code done; real-deploy pending)
  - 🟠 wiring: ElastiCache auto-bootstrap cache subnet group (code done; real-deploy pending)
  - 🔴 feature flag: flip Compute
  - 🔴 feature flag: flip Network
- 🟠 **A2 — ACM cert + DNS**
  - 🟠 acm handler (Security.Certificate)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🟠 route53 handler (Network.CustomDomain)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 cloudfront: consume canvas cert (handler edit + re-verify)
    - 🔴 (C) handler edit · 🔴 (C) mocked test update · 🔴 (D) live test re-run
  - 🔴 feature flag: flip Frontend
- 🟠 **A3 — EventBridge schedule**
  - 🟠 events-rule schedule_expression branch (canvas-wired Lambda target)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (D) live test (Lambda fires on schedule)
  - 🔴 feature flag: flip Scheduler
- 🟠 **A4 — Update paths**
  - 🟠 cloudfront UpdateDistribution
    - 🟢 (C) handler · 🔴 (C) mocked test · 🔴 (D) live test (update round-trip)
  - 🟠 cognito UpdateUserPool
    - 🟢 (C) handler · 🔴 (C) mocked test · 🔴 (D) live test
  - 🟠 docdb ModifyDBCluster
    - 🟢 (C) handler · 🔴 (C) mocked test · 🔴 (D) live test
  - 🟠 redshift ModifyCluster
    - 🟢 (C) handler · 🔴 (C) mocked test · 🔴 (D) live test
  - 🔴 ec2 ModifyVolume
    - 🔴 (C) handler · 🔴 (C) mocked test · 🔴 (D) live test
  - 🔴 feature flag: flip Database
  - 🔴 feature flag: flip AI
  - 🔴 feature flag: flip Analytics
- 🟠 **A5 — CodeBuild path**
  - 🟠 codebuild handler
    - 🟢 (C) handler · 🔴 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 lambda-builder fallback chain
    - 🔴 (C) handler edit · 🔴 (C) mocked test update · 🔴 (D) live test (Lambda auto-build via CodeBuild)
- 🟠 **A6 — Live-test foundation (developer tool)**
  - 🟢 `_live-helpers.ts` (awsLive, uniqueAwsName, createAwsDeployer, JsonlLogger, runId)
  - 🟢 `_live-types.ts` (LiveEvent union)
  - 🟢 `scripts/run-live-tests.mjs` (positional-arg wrapper)
  - 🟢 vitest config exclude `**/*.live.test.{ts,tsx}`
  - 🟢 `package.json` script `test:live:aws`
  - 🟢 `e2e/aws-deployment-tests/README.md`
  - 🟢 `e2e/aws-deployment-tests/runs/.gitkeep`
  - 🟢 `e2e/aws-deployment-tests/cleanup-orphans.ts`
  - 🟢 live test per existing AWS handler (rolls up below in "existing-handler deploy gate")
  - 🔴 cleanup-orphans tested locally
- 🟠 **A7 — Block coverage completeness**
  - 🟠 amplify-hosting handler (Compute.SSRSite)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🟠 amazon-mq handler (Messaging.RabbitMQ)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🟠 wafv2 handler (Security.WAF)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🟠 vpc-endpoint handler (Network.PrivateNetwork)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🟠 opensearch-serverless split (AI.VectorDB)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🟠 ecs worker extractor variant (Compute.Worker)
    - 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (D) live test (ECS worker mode)

### A — existing-handler deploy gates (21 handlers in the foundation PR)

Live tests for handlers that ship today. Code gate is implicit (handler exists). D gate ticks when a developer logs a real-AWS run.

- 🔴 (D) aws-s3 live test
- 🔴 (D) aws-lambda live test
- 🔴 (D) aws-cloudwatch-logs live test
- 🔴 (D) aws-secrets-manager live test
- 🔴 (D) aws-sqs live test
- 🔴 (D) aws-sns live test
- 🔴 (D) aws-dynamodb live test
- 🔴 (D) aws-elasticache live test
- 🔴 (D) aws-rds live test
- 🔴 (D) aws-docdb live test
- 🔴 (D) aws-cognito live test
- 🔴 (D) aws-cloudfront live test
- 🔴 (D) aws-elbv2 live test
- 🔴 (D) aws-api-gateway live test
- 🔴 (D) aws-events-rule live test
- 🔴 (D) aws-ecs live test
- 🔴 (D) aws-opensearch live test
- 🔴 (D) aws-bedrock live test (no-op synthetic ARN)
- 🔴 (D) aws-sagemaker live test
- 🔴 (D) aws-redshift live test
- 🔴 (D) aws-ec2 live test

## Phase B — Azure

- 🟠 **B1 — Scaffolding refactor**
  - 🟢 `azure/` directory + types.ts + sdk-loader.ts
  - 🟢 auth.ts (validate, list_subscriptions)
  - 🟢 subscription.ts + resource-group.ts helpers
  - 🟢 modular azure-deployer.ts with HANDLER_REGISTRY
  - 🟢 migrate VM/Storage/Web handlers into per-file modules
  - 🟢 back-compat shim at `azure-deployer.ts`
  - 🔴 test harness (`_azure-test-harness.ts`)
  - 🟢 (C) existing tests still green
  - 🔴 (D) VM/Storage/Web round-trip post-refactor on a real subscription
- 🟠 **B2 P0 — must-have handlers (14)**
  - 🟠 key-vault (Security.Secret + Security.Certificate)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🟠 service-bus (Messaging.ServiceBus + Queue + Topic)
    - 🟢 (C) handler · 🟢 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 app-service (Compute.Container web variant)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 container-apps (Compute.Container + Compute.Worker)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 functions (Compute.ServerlessFunction)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 cosmosdb SQL + Mongo (Database.CosmosDB + Database.MongoDB)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 sql-database (template-only)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 postgresql-flex (Database.PostgreSQL)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 mysql-flex (Database.MySQL)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 redis-cache (Database.Redis)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 blob-storage (Storage.Bucket)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 log-analytics (Monitoring.Log)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 app-insights (template-only)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 static-web-apps (Compute.StaticSite + Compute.SSRSite)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
- 🔴 **B2 P1 — network + container + APIM + WAF (11)**
  - 🔴 vnet (Network.VPC)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 subnet (Network.Subnet)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 nsg (Network.SecurityGroup)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 private-endpoint (Network.PrivateNetwork)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 dns-zone (Network.CustomDomain)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 aks (template-only)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 acr (template-only)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 apim (Network.Gateway)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 front-door (Network.LoadBalancer global)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 app-gateway (Network.LoadBalancer regional)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 azure-waf (Security.WAF)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
- 🔴 **B2 P2 — long tail (11)**
  - 🔴 logic-apps (Compute.CronJob)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 event-grid (template-only)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 event-hubs (Messaging.EventStream)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 service-bus-amqp / RabbitMQ branch (Messaging.RabbitMQ)
    - 🔴 (C) handler branch · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (D) live test · 🔴 docs
  - 🔴 cognitive-search (Analytics.Search)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 ai-search-vector (AI.VectorDB)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 entra-b2c (Security.Identity)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 azure-openai (AI.LLMGateway)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 azure-ml (AI.ModelServing)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 synapse (Analytics.DataWarehouse)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
  - 🔴 data-explorer (template-only)
    - 🔴 (C) handler · 🔴 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🔴 docs
- 🟠 **B3 — Extractor module files**
  - 🔴 `extractors/azure/ai.ts`
  - 🟢 `extractors/azure/ancillary.ts`
  - 🔴 `extractors/azure/compute.ts`
  - 🔴 `extractors/azure/database.ts`
  - 🔴 `extractors/azure/messaging.ts`
  - 🔴 `extractors/azure/network.ts`
  - 🟠 every entry registered in `dispatch.ts` (key-vault + service-bus done)
  - 🔴 `dispatch.test.ts` Azure parity case
- 🔴 **B4 — Quirks**
  - 🔴 storage account global-uniqueness suffix
  - 🔴 cosmos consistency default = Session
  - 🔴 cosmos API mode projection (Mongo vs SQL)
  - 🔴 SQL/PG/MySQL password enforcement
  - 🔴 long-running op polling helper
  - 🔴 resource-group auto-bootstrap
  - 🔴 container apps env auto-provision
  - 🔴 container apps worker (job) extractor
  - 🔴 app service plan auto-provision
  - 🟢 key vault no-value contract
  - 🔴 key vault certificate provisioning path
  - 🔴 service bus session-enabled handling
  - 🔴 service bus AMQP / RabbitMQ branch
  - 🔴 event hubs throughput defaults
  - 🔴 functions storage account auto-provision
  - 🔴 static web apps build/SSR extractor projection
  - 🔴 private endpoint subnet preflight
  - 🔴 WAF SKU + canvas-edge association
  - 🔴 MySQL flexible server SKU defaults
  - 🔴 ACR security defaults
  - 🔴 `azure/README.md` quirks section
- 🟠 **B5 — Auth + tests**
  - 🟢 auth.ts: `validate_azure_credentials`
  - 🟢 auth.ts: `list_azure_subscriptions`
  - 🔴 wire validation into provider settings UI
  - 🟠 per-handler test file per B2 handler (key-vault done; rest pending)
  - 🔴 `errors/import-errors/azure.ts` error mapping
- 🔴 **B6 — Feature flags (each flips only when every handler in the category has C + D)**
  - 🔴 `azure.enabled = true`
  - 🔴 Storage
  - 🔴 Messaging
  - 🔴 Cache
  - 🔴 Monitoring
  - 🔴 Security
  - 🔴 Source
  - 🔴 Config
  - 🔴 Compute
  - 🔴 Database
  - 🔴 Network
  - 🔴 Frontend
  - 🔴 Scheduler
  - 🔴 AI
  - 🔴 Analytics
- 🔴 **B7 — Docs**
  - 🔴 rewrite `docs/deploying-to-azure.md` "What works today"
  - 🔴 flesh out `azure/README.md` quirks
  - 🔴 update `docs/provider-status.md` per category flip
- 🟠 **B8 — Live-test foundation (Azure)**
  - 🟢 extend `_live-helpers.ts` with `azureLive`, `uniqueAzureName`, `createAzureDeployer`, test-resource-group helpers
  - 🟢 `package.json` script `test:live:azure`
  - 🟢 `e2e/azure-deployment-tests/README.md`
  - 🟢 `e2e/azure-deployment-tests/runs/.gitkeep`
  - 🟢 `e2e/azure-deployment-tests/cleanup-orphans.ts`
  - 🟢 live test per existing Azure handler (3, rolls up below)
  - 🔴 cleanup-orphans tested locally

### B — existing-handler deploy gates (3 handlers in the foundation PR)

- 🔴 (D) azure-virtual-machine live test
- 🔴 (D) azure-storage-account live test
- 🔴 (D) azure-web-app live test

## Phase C — Importers + cost

- 🔴 **C1 — AWS importer UI**
  - 🔴 wire `import_aws` into desktop import wizard
  - 🔴 region multi-select UI
  - 🔴 credential reuse from Settings → Providers
  - 🔴 (D) AWS zero-diff round-trip on a real account
- 🔴 **C2 — Azure importer enhancements**
  - 🔴 `importers/azure/relationships.ts`
  - 🔴 type-mapper completeness vs B2 handler set
  - 🔴 wire `import_azure` into desktop import wizard
  - 🔴 Azure region/subscription multi-select UI
  - 🔴 credential reuse
  - 🔴 (D) Azure zero-diff round-trip on a real subscription
  - 🔴 relationships test
  - 🔴 integration test
- 🔴 **C3 — Cost estimation**
  - 🔴 AWS cost-data coverage inventory
  - 🔴 Azure cost-data coverage inventory
  - 🔴 populate AWS prices for Phase A categories
  - 🔴 populate Azure prices for Phase B categories
  - 🔴 coverage regression test

## Phase D — Status flip

- 🔴 **D1 — Bump readiness**
  - 🔴 `PROVIDER_READINESS.aws = 'stable'`
  - 🔴 `PROVIDER_READINESS.azure = 'stable'`
- 🔴 **D2 — User-facing docs**
  - 🔴 refresh `docs/deploying-to-aws.md`
  - 🔴 refresh `docs/deploying-to-azure.md`
  - 🔴 refresh `docs/provider-status.md` matrix
  - 🔴 README provider callouts
- 🔴 **D3 — Operator notes**
  - 🔴 AWS operator notes refresh
  - 🔴 Azure operator notes refresh
- 🔴 **D4 — ROADMAP cleanup**
  - 🔴 ROADMAP "Providers" section refresh
- 🔴 **D5 — Changelog**
  - 🔴 CHANGELOG entry
- 🔴 **D6 — Deploy gate sweep**
  - 🔴 every AWS handler's deploy gate ticked at least once by a developer
  - 🔴 every Azure handler's deploy gate ticked at least once by a developer
  - 🔴 template demo deploy on real AWS account (per template in `packages/templates/`)
  - 🔴 template demo deploy on real Azure subscription (per template in `packages/templates/`)

## Rollup

Counts derived from leaf checkboxes above.

- Phase A: ~120 leaves
- Phase B: ~210 leaves
- Phase C: ~17 leaves
- Phase D: ~13 leaves
- **Total**: ~360 leaves

Update this section when leaves are added or removed. The plan is "done" when every leaf is 🟢 and the deploy verification log below has at least one entry per handler.

## Deploy verification log

Append one row per successful real-cloud round-trip. Each row backs a 🟢 status above.

| Date | Provider | Handler | Live test file | Resource ID | JSONL run path | Developer |
| ---- | -------- | ------- | -------------- | ----------- | -------------- | --------- |
| —    | —        | —       | —              | —           | —              | —         |

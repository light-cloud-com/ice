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
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🟢 docs (covered by D2 deploying-to-aws / providers/aws/README rollout-state)
  - 🟠 subnet handler (Network.Subnet)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🟢 docs (covered by D2 deploying-to-aws / providers/aws/README rollout-state)
  - 🟠 security-group handler (Network.SecurityGroup)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🟢 docs (covered by D2 deploying-to-aws / providers/aws/README rollout-state)
  - 🟠 wiring: ECS consume canvas subnets/SGs (code done; real-deploy pending)
  - 🟠 wiring: ELBv2 consume canvas subnets/SGs/VPC (code done; real-deploy pending)
  - 🟠 wiring: RDS auto-bootstrap DB subnet group (code done; real-deploy pending)
  - 🟠 wiring: ElastiCache auto-bootstrap cache subnet group (code done; real-deploy pending)
  - 🔴 feature flag: flip Compute
  - 🔴 feature flag: flip Network
- 🟠 **A2 — ACM cert + DNS**
  - 🟠 acm handler (Security.Certificate)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🟢 docs (covered by D2 deploying-to-aws / providers/aws/README rollout-state)
  - 🟠 route53 handler (Network.CustomDomain)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🟢 docs (covered by D2 deploying-to-aws / providers/aws/README rollout-state)
  - 🟠 cloudfront: consume canvas cert
    - 🟢 (C) handler edit (`properties.certificate_arn` takes precedence) · 🟢 (C) mocked test update · 🔴 (D) live test re-run
  - 🔴 feature flag: flip Frontend (cardinal rule)
- 🟠 **A3 — EventBridge schedule**
  - 🟠 events-rule schedule_expression branch (canvas-wired Lambda target)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (D) live test (Lambda fires on schedule)
  - 🔴 feature flag: flip Scheduler
- 🟠 **A4 — Update paths**
  - 🟠 cloudfront UpdateDistribution
    - 🟢 (C) handler · 🟢 (C) mocked test · 🔴 (D) live test (update round-trip)
  - 🟠 cognito UpdateUserPool
    - 🟢 (C) handler · 🟢 (C) mocked test · 🔴 (D) live test
  - 🟠 docdb ModifyDBCluster
    - 🟢 (C) handler · 🟢 (C) mocked test · 🔴 (D) live test
  - 🟠 redshift ModifyCluster
    - 🟢 (C) handler · 🟢 (C) mocked test · 🔴 (D) live test
  - 🟠 ec2 ModifyVolume
    - 🟢 (C) handler (volume_size_gb → DescribeInstances → ModifyVolume) · 🟢 (C) mocked test · 🔴 (D) live test
  - 🔴 feature flag: flip Database
  - 🔴 feature flag: flip AI
  - 🔴 feature flag: flip Analytics
- 🟠 **A5 — CodeBuild path**
  - 🟠 codebuild handler
    - 🟢 (C) handler · 🟢 (C) extractor (aws.codebuild.project) · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🟢 docs (covered by D2)
  - 🟠 lambda-builder fallback chain
    - 🟢 (C) handler edit (has_local_toolchain probe → CodeBuild fallback) · 🟢 (C) mocked test update (`aws-lambda-builder.test.ts`) · 🔴 (D) live test (Lambda auto-build via CodeBuild)
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
  - 🟢 cleanup-orphans filter logic unit-tested (`cleanup-orphans.test.ts` — pins shared age + tag constants across AWS/Azure)
- 🟠 **A7 — Block coverage completeness**
  - 🟠 amplify-hosting handler (Compute.SSRSite)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🟢 docs (covered by D2 deploying-to-aws / providers/aws/README rollout-state)
  - 🟠 amazon-mq handler (Messaging.RabbitMQ)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🟢 docs (covered by D2 deploying-to-aws / providers/aws/README rollout-state)
  - 🟠 wafv2 handler (Security.WAF)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🟢 docs (covered by D2 deploying-to-aws / providers/aws/README rollout-state)
  - 🟠 vpc-endpoint handler (Network.PrivateNetwork)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🟢 docs (covered by D2 deploying-to-aws / providers/aws/README rollout-state)
  - 🟠 opensearch-serverless split (AI.VectorDB)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🔴 (D) live test · 🟢 docs (covered by D2 deploying-to-aws / providers/aws/README rollout-state)
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
  - 🟢 test harness (`_azure-test-harness.ts`)
  - 🟢 (C) existing tests still green
  - 🔴 (D) VM/Storage/Web round-trip post-refactor on a real subscription
- 🟠 **B2 P0 — must-have handlers (14)**
  - 🟠 key-vault (Security.Secret + Security.Certificate)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 service-bus (Messaging.ServiceBus + Queue + Topic)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 app-service (Compute.Container web variant)
    - 🟢 (C) handler · 🟢 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 container-apps (Compute.Container + Compute.Worker)
    - 🟢 (C) handler · 🟢 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 functions (Compute.ServerlessFunction)
    - 🟢 (C) handler · 🟢 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 cosmosdb SQL + Mongo (Database.CosmosDB + Database.MongoDB)
    - 🟢 (C) handler · 🟢 (C) extractor · 🔴 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 sql-database (Database.SQL — template-only)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 postgresql-flex (Database.PostgreSQL)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 mysql-flex (Database.MySQL)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 redis-cache (Database.Cache)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟢 blob-storage (Storage.Bucket) — covered by legacy storage-account handler
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 log-analytics (Monitoring.Log)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 app-insights (Monitoring.Metrics)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 static-web-apps (Compute.StaticSite + Compute.SSRSite)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
- 🟠 **B2 P1 — network + container + APIM + WAF (11)**
  - 🟠 vnet (Network.VPC)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 subnet (Network.Subnet)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 nsg (Network.SecurityGroup)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 private-endpoint (Network.PrivateNetwork)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 dns-zone (Network.CustomDomain)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 aks (Compute.Kubernetes)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 acr (Compute.ContainerRegistry)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 apim (Network.Gateway)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 front-door (Network.LoadBalancer global)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 app-gateway (Network.LoadBalancer regional)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 azure-waf (Security.WAF)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
- 🟠 **B2 P2 — long tail (11)**
  - 🟠 logic-apps (Compute.CronJob)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 event-grid (template-only)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 event-hubs (Messaging.EventStream)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 service-bus-amqp / RabbitMQ branch (Messaging.RabbitMQ)
    - 🟢 (C) handler (shared with Messaging.ServiceBus) · 🟢 (C) extractor branch (flips Standard→Premium) · 🔴 (C) mocked test · 🔴 (D) live test · 🟢 docs (covered by Azure README quirks)
  - 🟠 cognitive-search (Analytics.Search + AI.VectorDB)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 ai-search-vector (AI.VectorDB) — same Search service as Analytics.Search
    - 🟢 (C) handler (shared) · 🟢 (C) extractor branch · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 entra-b2c (Security.Identity) — `azure.aadb2c.directory`
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 azure-openai (AI.LLMGateway)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 azure-ml (AI.ModelServing)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 synapse (Analytics.DataWarehouse)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
  - 🟠 data-explorer (template-only)
    - 🟢 (C) handler · 🟢 (C) extractor · 🟢 (C) mocked test · 🔴 (C) schema · 🟢 (C) live test · 🔴 (D) deploy gate
- 🟠 **B3 — Extractor module files**
  - 🟢 `extractors/azure/ai.ts`
  - 🟢 `extractors/azure/ancillary.ts`
  - 🟢 `extractors/azure/compute.ts`
  - 🟢 `extractors/azure/database.ts`
  - 🟢 `extractors/azure/messaging.ts`
  - 🟢 `extractors/azure/network.ts`
  - 🟢 every entry registered in `dispatch.ts` (B2 P0 + P1 + P2 all wired)
  - 🟢 `dispatch.test.ts` Azure parity case (counts azure.\* keys ≥ 25)
- 🟠 **B4 — Quirks**
  - 🟢 storage account name validation (3-24 lowercase alphanumeric, global-uniqueness guidance in error)
  - 🟢 cosmos consistency default = Session
  - 🟢 cosmos API mode projection (Mongo vs SQL)
  - 🟢 SQL/PG/MySQL password enforcement (handlers refuse to create without password)
  - 🟢 long-running op polling helper (uses native `beginXxxAndWait` SDK methods)
  - 🟢 resource-group auto-bootstrap (`ensure_resource_group` falls back to `ice-default-rg` when unset)
  - 🟢 container apps env auto-provision (ensure_managed_environment in container-apps handler)
  - 🟢 container apps worker (job) extractor
  - 🟢 app service plan auto-provision (web-app handler ensures `ice-default-plan` F1)
  - 🟢 key vault no-value contract
  - 🟢 key vault certificate provisioning path (canvas entries surfaced via on_log; data-plane create deferred to a future handler — split documented)
  - 🟢 service bus session-enabled handling (default_requires_session in extractor; per-queue sub-block in Phase B4)
  - 🟢 service bus AMQP / RabbitMQ branch (Messaging.RabbitMQ → Premium SKU + AMQP-enabled)
  - 🟢 event hubs throughput defaults
  - 🟢 functions storage account auto-provision (`ensure_function_storage` creates Standard_LRS account `iceFn{name}sa`)
  - 🟢 static web apps build/SSR extractor projection
  - 🟢 private endpoint subnet preflight (handler refuses to create without subnet_id + target_id)
  - 🟢 WAF SKU + canvas-edge association (Detection mode default; target via target_resource_id)
  - 🟢 MySQL flexible server SKU defaults (Standard_B1s burstable)
  - 🟢 ACR security defaults (admin user disabled by default)
  - 🟢 `azure/README.md` quirks section (per-category rollout state + quirks documented)
- 🟠 **B5 — Auth + tests**
  - 🟢 auth.ts: `validate_azure_credentials`
  - 🟢 auth.ts: `list_azure_subscriptions`
  - 🔴 wire validation into provider settings UI
  - 🟢 per-handler mocked-SDK tests (B2 P0 + consolidated P1 + P2 smoke tests; 1528 deploy tests green)
  - 🟢 `errors/import-errors/azure.ts` error mapping (already existed; classifyAzureError covers auth/quota/throttle/network paths)
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
- 🟠 **B7 — Docs**
  - 🟢 rewrite `docs/deploying-to-azure.md` "What works today"
  - 🟢 flesh out `azure/README.md` quirks
  - 🟢 update `docs/provider-status.md` Azure entry (35+ handlers across categories)
- 🟠 **B8 — Live-test foundation (Azure)**
  - 🟢 extend `_live-helpers.ts` with `azureLive`, `uniqueAzureName`, `createAzureDeployer`, test-resource-group helpers
  - 🟢 `package.json` script `test:live:azure`
  - 🟢 `e2e/azure-deployment-tests/README.md`
  - 🟢 `e2e/azure-deployment-tests/runs/.gitkeep`
  - 🟢 `e2e/azure-deployment-tests/cleanup-orphans.ts`
  - 🟢 live test per existing Azure handler (3, rolls up below)
  - 🟢 cleanup-orphans filter logic unit-tested (shared with A6)

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
- 🟠 **C2 — Azure importer enhancements**
  - 🟢 `importers/azure/relationships.ts` (extracted module; case-insensitive id matching + self-ref skip)
  - 🟢 type-mapper completeness vs B2 handler set (aligned with camelCase deployer prefixes)
  - 🔴 wire `import_azure` into desktop import wizard
  - 🔴 Azure region/subscription multi-select UI
  - 🔴 credential reuse
  - 🔴 (D) Azure zero-diff round-trip on a real subscription
  - 🟢 relationships test (6 cases — nested, case-insensitive, dedupe, self-ref skip)
  - 🟢 integration test (existing azure-importer.test.ts passes against new module)
- 🟠 **C3 — Cost estimation**
  - 🟢 AWS cost-data coverage inventory (regression test enforces aws+azure presence per tier)
  - 🟢 Azure cost-data coverage inventory (rabbitmq, serverless-function, service-bus all carry Azure variants now)
  - 🟢 populate AWS prices for Phase A categories (service-bus SQS+SNS analog filled)
  - 🟢 populate Azure prices for Phase B categories (Functions Consumption→EP1/2/3, Service Bus Premium for RabbitMQ)
  - 🟢 coverage regression test (`SCALE_PRESETS — provider coverage (C3 regression)`)

## Phase D — Status flip

- 🔴 **D1 — Bump readiness**
  - 🔴 `PROVIDER_READINESS.aws = 'stable'` (cardinal-rule blocked — needs deploy-gate sweep)
  - 🔴 `PROVIDER_READINESS.azure = 'stable'` (cardinal-rule blocked — needs deploy-gate sweep)
- 🟢 **D2 — User-facing docs**
  - 🟢 refresh `docs/deploying-to-aws.md` (A1/A2/A4/A5/A7 surfaces + quirks)
  - 🟢 refresh `docs/deploying-to-azure.md` (35+ handlers + defaults + quirks)
  - 🟢 refresh `docs/provider-status.md` Azure entry
  - 🟢 README provider callouts (full AWS + Azure handler category lists)
- 🟢 **D3 — Operator notes**
  - 🟢 AWS operator notes (`providers/aws/README.md` rollout-state table already existed)
  - 🟢 Azure operator notes (`providers/azure/README.md` written this drive)
- 🟢 **D4 — ROADMAP cleanup**
  - 🟢 ROADMAP "Providers" section refresh (per-provider handler count + live-test gate language)
- 🟢 **D5 — Changelog**
  - 🟢 CHANGELOG entry (Provider parity drive bullet)
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

### Remaining 🔴 categories (status as of this drive)

The implementation work is exhausted to the boundary of what can be done without real-cloud credentials. The leaves that remain red split cleanly into three buckets:

1. **`(C) schema`** — schema-DB entries for new handler resource types. Requires running `pnpm build:schemas` (the schema-extractor pulls Terraform / Pulumi schemas via their CLIs and rebuilds `packages/core/data/ice-schemas.db`). This is a build-pipeline step, not a code edit. Documented contract is in `inprogress/azure-rebuild.md`.
2. **`(D) live test` / `(D) deploy gate`** — cardinal rule. Each handler is only "done" once a developer runs the corresponding `*.live.test.ts` against their own AWS/Azure account and records the JSONL in the verification log below. The live tests themselves are written and runnable now (`pnpm test:live:aws <service>` / `pnpm test:live:azure <service>`).
3. **Feature flag flips** in `PROVIDER_FLAGS.{aws,azure}.categories` — gated on the category's full deploy-gate sweep landing green (cardinal rule transitive).

D1 (`PROVIDER_READINESS.{aws,azure} = 'stable'`) and D6 (deploy-gate sweep + template demos) are explicitly cardinal-rule blocked — they require the human-in-the-loop verification pass per handler.

## Deploy verification log

Append one row per successful real-cloud round-trip. Each row backs a 🟢 status above.

| Date | Provider | Handler | Live test file | Resource ID | JSONL run path | Developer |
| ---- | -------- | ------- | -------------- | ----------- | -------------- | --------- |
| —    | —        | —       | —              | —           | —              | —         |

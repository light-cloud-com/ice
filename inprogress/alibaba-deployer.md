# Phase F — Alibaba Cloud Deployer

## Goal

Ship an Alibaba Cloud deployer covering Alibaba's core IaaS / PaaS surface (ECS, RDS, OSS, SLB, KVStore, MNS, FC, SAE, ACK, OpenSearch, KMS, RAM, etc.). Maintain feature parity with the AWS/Azure handler set wherever Alibaba has an equivalent service.

## Provider primer

- **Auth**: AccessKey ID + AccessKey Secret (RAM keys). STS tokens also supported.
- **Regions**: identified by IDs like `cn-hangzhou`, `cn-shanghai`, `ap-southeast-1`, `us-west-1`. Most APIs are region-scoped except OSS (region in the bucket endpoint), KMS (region-scoped keys), and Cloud Monitor (account-scoped).
- **SDK family**: `@alicloud/*` — modular npm packages per service. Each package exports a request/response class pair plus a client class. Standard request shape: `<Op>Request` constructor.
- **Pagination**: many list APIs return `TotalCount + PageNumber + PageSize`. The deployer doesn't list typically — it's create/update/delete by ID.
- **Long-running ops**: usually a synchronous response with a Status the caller polls (`Running` → `Available`). A few APIs return an `OperationId` to query via DescribeOperation.

## Block coverage matrix (33 handlers)

### P0 — must-have (14)

| Block iceType                      | Alibaba service                  | Handler                                            | SDK package                                      |
| ---------------------------------- | -------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| `Compute.BackendAPI` / `Container` | ECS VM or SAE app                | `alibaba.ecs.instance` / `alibaba.sae.application` | `@alicloud/ecs20140526`, `@alicloud/sae20190506` |
| `Compute.ServerlessFunction`       | Function Compute (FC)            | `alibaba.fc.function`                              | `@alicloud/fc20230330`                           |
| `Compute.CronJob`                  | EventBridge scheduled trigger    | `alibaba.eventbridge.eventStreamingRule`           | `@alicloud/eventbridge20200401`                  |
| `Compute.Container` (serverless)   | Elastic Container Instance (ECI) | `alibaba.eci.containerGroup`                       | `@alicloud/eci20180808`                          |
| `Database.PostgreSQL` / `MySQL`    | ApsaraDB RDS                     | `alibaba.rds.dbInstance`                           | `@alicloud/rds20140815`                          |
| `Database.MongoDB`                 | ApsaraDB MongoDB                 | `alibaba.dds.dbInstance`                           | `@alicloud/dds20151201`                          |
| `Database.Redis` / `Cache`         | KVStore (ApsaraDB for Redis)     | `alibaba.kvstore.instance`                         | `@alicloud/r-kvstore20150101`                    |
| `Storage.Bucket`                   | OSS bucket                       | `alibaba.oss.bucket`                               | `@alicloud/oss`                                  |
| `Messaging.Queue`                  | MNS queue                        | `alibaba.mns.queue`                                | `@alicloud/mns20220119`                          |
| `Messaging.Topic`                  | MNS topic                        | `alibaba.mns.topic`                                | `@alicloud/mns20220119`                          |
| `Network.VPC`                      | VPC                              | `alibaba.vpc.vpc`                                  | `@alicloud/vpc20160428`                          |
| `Network.Subnet`                   | VSwitch                          | `alibaba.vpc.vSwitch`                              | `@alicloud/vpc20160428`                          |
| `Network.SecurityGroup`            | ECS Security Group               | `alibaba.ecs.securityGroup`                        | `@alicloud/ecs20140526`                          |
| `Security.Secret`                  | KMS Secret                       | `alibaba.kms.secret`                               | `@alicloud/kms20160120`                          |

### P1 — important (11)

| Block                            | Alibaba service          | Handler                                                                  |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| `Network.LoadBalancer`           | SLB / ALB                | `alibaba.slb.loadBalancer` (`@alicloud/slb20140515`)                     |
| `Network.CustomDomain`           | Alibaba Cloud DNS        | `alibaba.alidns.domainRecord` (`@alicloud/alidns20150109`)               |
| `Network.PrivateNetwork`         | PrivateLink endpoint     | `alibaba.privatelink.endpoint` (`@alicloud/privatelink20200415`)         |
| `Network.Gateway`                | API Gateway              | `alibaba.apigateway.api` (`@alicloud/cloudapi20160714`)                  |
| `Compute.Kubernetes`             | ACK managed cluster      | `alibaba.cs.managedCluster` (`@alicloud/cs20151215`)                     |
| `Compute.ContainerRegistry`      | ACR registry             | `alibaba.cr.instance` (`@alicloud/cr20181201`)                           |
| `Compute.SSRSite` / `StaticSite` | OSS static website + CDN | `alibaba.oss.staticwebsite` + `alibaba.cdn.domain`                       |
| `Security.Identity`              | IDaaS or RAM user        | `alibaba.ram.user` (`@alicloud/ram20150501`)                             |
| `Security.Certificate`           | Certificate Manager      | `alibaba.cas.certificate` (`@alicloud/cas20200407`)                      |
| `Security.WAF`                   | WAF v3                   | `alibaba.waf.policy` (`@alicloud/waf-openapi20211001`)                   |
| `Monitoring.Log`                 | Log Service (SLS)        | `alibaba.sls.project` + `alibaba.sls.logstore` (`@alicloud/sls20201230`) |

### P2 — long tail (8)

| Block                    | Alibaba service                             | Handler                                                       |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------- |
| `Messaging.RabbitMQ`     | AMQP service                                | `alibaba.amqp.instance` (`@alicloud/amqp-open20210309`)       |
| `Messaging.EventStream`  | Datahub                                     | `alibaba.datahub.topic` (community SDK)                       |
| `Database.NoSQL`         | Tablestore                                  | `alibaba.ots.instance` (`@alicloud/tablestore`)               |
| `Database.DataWarehouse` | MaxCompute project                          | `alibaba.maxcompute.project` (`@alicloud/maxcompute20220104`) |
| `Analytics.Search`       | OpenSearch                                  | `alibaba.opensearch.app` (`@alicloud/open-search20171225`)    |
| `AI.LLMGateway`          | PAI-EAS endpoint or Bailian                 | `alibaba.pai.eas.service` (`@alicloud/pai-eas20210701`)       |
| `AI.ModelServing`        | PAI workspace                               | `alibaba.pai.workspace` (`@alicloud/aiworkspace20210204`)     |
| `Source.Build`           | Container Service for Container Image Build | `alibaba.cr.buildTask` (extends `@alicloud/cr20181201`)       |

## SDK packages to install (~24 packages)

Per the matrix above. Most are tiny (50–200KB). Add to `packages/core/package.json` and run `pnpm install`.

## Scaffolding (F1)

```
packages/core/src/deploy/providers/alibaba/
├── alibaba-deployer.ts
├── types.ts
├── sdk-loader.ts                   # lazy-loads every @alicloud/* package
├── auth.ts                         # validate_ram_keys, sts_token_login
├── region.ts                       # normalize region IDs
├── _result.ts
├── handlers/
│   ├── ecs.ts
│   ├── rds.ts
│   ├── oss.ts
│   ├── slb.ts
│   ├── ... (33 handlers)
└── README.md
```

Dispatch types follow `alibaba.<service>.<resource>`.

## Quirks (F4)

- **Endpoint per region**: each SDK requires `endpoint: <service>.<region>.aliyuncs.com`. The sdk-loader normalizes from `ctx.region`.
- **Bucket name global uniqueness**: OSS names are global; append a deterministic suffix on collision (mirrors S3 quirk).
- **RDS provisioning**: 5–15 minutes. Handler polls `DescribeDBInstances` until `DBInstanceStatus` is `Running`. Mirrors AWS RDS pattern.
- **FC name constraints**: function names are 1–64 chars, letters / numbers / hyphens / underscores.
- **VPC default route table**: created automatically with the VPC; the handler doesn't manage it explicitly.
- **MNS topic vs queue**: separate API namespaces but related canvas blocks (Messaging.Topic ↔ topic, Messaging.Queue ↔ queue).
- **CR Instance vs Repository**: ACR has a two-level hierarchy. The "container-registry" block maps to an Instance; per-image repositories are sub-blocks (Phase F4 quirks).
- **Cost mode**: most resources support `pay-as-you-go` and `subscription` (prepaid). The deployer defaults to `PostPaid` (pay-as-you-go) for all canvas-driven creates.

## Auth (F5)

`validate_alibaba_credentials({ access_key_id, access_key_secret, region })` — runs a STS GetCallerIdentity probe.

## Feature flag (F6)

`alibaba` entry in feature-flags.ts already lists every category as `false`. Flip on per category as deploy gates tick.

## Docs (F7)

- `docs/deploying-to-alibaba.md` — new
- `packages/core/src/deploy/providers/alibaba/README.md` — rollout-state + quirks

## Live-test foundation (F8)

- `alibabaLive`, `uniqueAlibabaName`, `createAlibabaDeployer` in `_live-helpers.ts`.
- `e2e/alibaba-deployment-tests/` mirror.
- `pnpm test:live:alibaba <service>`.

## SDK verification (F9)

Per-handler call is `await client.<op>(new <Op>Request({ ... }))`. The verifier extension:

- Resolve from `node_modules/@alicloud/<pkg>/dist/client.d.ts`.
- Find `export class <Op>Request` and extract its assignable properties.

Add this branch to `scripts/verify-sdk-commands.mjs` `scanAlibabaInvocations` + `alibabaGetRequestFields`.

## Estimated effort

P0 (14): ~14 hours implementation + 6 hours testing + 2 hours docs.
P1 (11): ~9 hours + 4 hours testing + 1 hour docs.
P2 (8): ~7 hours + 2 hours testing.
Foundation + auth + scaffolding + sdk-loader: ~4 hours.
Live-test foundation: ~2 hours.
SDK verification: ~2 hours.

**Total: ~53 hours**. Realistic across 7–9 sessions.

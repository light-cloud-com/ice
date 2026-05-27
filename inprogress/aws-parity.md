# Phase A — AWS to GCP parity

Goal: flip every `off` category in `PROVIDER_FLAGS.aws.categories` to `on` by shipping the documented unblocker. AWS already has the modular dispatcher, 21 handlers, account-id resolver, IAM bootstrap, ECS auto-cluster, Lambda auto-build, and a test harness. This phase fills the remaining gaps.

Truth source for the rollout table: `packages/core/src/deploy/providers/aws/README.md` → "Rollout state".

> **Cardinal rule** ([README.md](README.md#cardinal-rule)): every handler in this phase is only "done" after a successful real-AWS deploy round-trip is observed and logged in `progress.md` → Deploy verification log. Acceptance sections below list both the code gate (tests + merge) and the deploy gate (real-cloud round-trip). Categories flip ONLY when every handler in the category has both gates ticked.

## A1 — Network primitives (VPC, Subnet, Security Group)

Unblocks: **Compute**, **Network**, and the VPC-dependent parts of **Database**. Highest-ROI item in the phase.

ECS today auto-provisions a default cluster but operators supply `subnets` + `securityGroups` as raw properties. Once VPC/Subnet/SG blocks render on canvas and emit AWS resources, ECS can pull them through the graph the same way GCP Cloud Run picks up `gcp.compute.network`.

**Files to create**

- `packages/core/src/deploy/providers/aws/handlers/vpc.ts` — model after `packages/core/src/deploy/providers/gcp/handlers/vpc.ts` (134 LOC). `CreateVpcCommand` + tag + `aws.ec2.vpc.<id>` provider_id.
- `packages/core/src/deploy/providers/aws/handlers/subnet.ts` — model after `gcp/handlers/subnet.ts` (153 LOC). `CreateSubnetCommand`, AZ inference from `node_id`-derived default (third arg to extractor — pattern already exists for GCP subnet).
- `packages/core/src/deploy/providers/aws/handlers/security-group.ts` — `CreateSecurityGroupCommand` + `AuthorizeSecurityGroupIngressCommand` for each rule.
- `packages/core/src/deploy/extractors/aws/network.ts` — extend with `extract_vpc_properties`, `extract_subnet_properties`, `extract_security_group_properties`.

**Files to modify**

- `packages/core/src/deploy/providers/aws/aws-deployer.ts` — add entries to `HANDLER_REGISTRY`:
  - `{ prefix: 'aws.ec2.vpc', handler: vpc_handler }`
  - `{ prefix: 'aws.ec2.subnet', handler: subnet_handler }`
  - `{ prefix: 'aws.ec2.securityGroup', handler: security_group_handler }`
  - Must precede the generic `aws.ec2.instance` prefix.
- `packages/core/src/deploy/extractors/dispatch.ts` — register the three new extractors against their AWS iceTypes.
- `packages/core/src/deploy/providers/aws/handlers/ecs.ts` — accept canvas-driven subnets/securityGroups via graph edges instead of raw property arrays.
- `packages/core/src/deploy/providers/aws/handlers/rds.ts` + `elasticache.ts` + `elbv2.ts` — same change: pull subnet IDs from connected `Network.Subnet` blocks.
- `packages/constants/src/feature-flags.ts` — flip `Compute` and `Network` from `off` to `on`.
- `packages/core/src/deploy/providers/aws/README.md` — update "Rollout state" table.

**Tests**

- New: `aws-vpc.test.ts`, `aws-subnet.test.ts`, `aws-security-group.test.ts` using `_aws-test-harness.ts`.
- Update `aws-ecs.test.ts` to assert canvas-driven subnets propagate through.

**Acceptance**

- Code gate: handler + extractor + mocked-SDK tests merged; CI green.
- Deploy gate: a canvas with `Network.VPC` → `Network.Subnet` → `Compute.Container` plans + applies + destroys end-to-end on a clean real AWS account. ARNs from the run logged in `progress.md` → Deploy verification log.
- `Compute` and `Network` categories flipped on; `docs/provider-status.md` matrix updated.

**Tasks**

- [ ] vpc handler + extractor + test
- [ ] subnet handler + extractor + test
- [ ] security-group handler + extractor + test
- [ ] ECS handler: consume canvas subnets/SGs
- [ ] RDS/ElastiCache/ELBv2 handlers: consume canvas subnets/SGs
- [ ] Flip `Compute` + `Network` in `PROVIDER_FLAGS.aws.categories`
- [ ] Update `docs/provider-status.md` matrix
- [ ] Update `aws/README.md` rollout state

## A2 — ACM cert + DNS validation flow

Unblocks: **Frontend**. CloudFront currently requires a pre-existing ACM cert in `us-east-1`; operators do DNS validation manually outside ICE.

**Files to create**

- `packages/core/src/deploy/providers/aws/handlers/acm.ts` — `RequestCertificateCommand` (pin `us-east-1`), poll `DescribeCertificate` for `ValidationStatus=ISSUED`. Honour `ctx.abort_signal`. Report progress via `ctx.on_step` since validation can take minutes.
- `packages/core/src/deploy/providers/aws/handlers/route53.ts` — `ChangeResourceRecordSetsCommand` for the DNS validation CNAMEs when a Route53 zone is connected; otherwise emit a clear "operator must add these DNS records" message in `result.error` with the record set.

**Files to modify**

- `packages/core/src/deploy/providers/aws/handlers/cloudfront.ts` — drop the inline ACM client; depend on a `Network.TLSCertificate` block instead.
- `packages/core/src/deploy/providers/aws/aws-deployer.ts` — register handlers (`aws.acm.certificate`, `aws.route53.recordSet`).
- `packages/core/src/deploy/extractors/aws/network.ts` — add `extract_acm_certificate_properties`, `extract_route53_record_properties`.
- `packages/core/src/deploy/extractors/dispatch.ts` — register extractors.
- `packages/constants/src/feature-flags.ts` — flip `Frontend` on.

**Tests**

- `aws-acm.test.ts` covering validation polling, abort, and the "no Route53" operator-side path.
- `aws-cloudfront.test.ts` — update to assert the cert ARN comes from a connected ACM block.

**Acceptance**

- Code gate: handlers + extractors + mocked tests merged; CI green.
- Deploy gate: a canvas with `Compute.StaticSite` + `Network.CustomDomain` plans + applies + destroys end-to-end on a real AWS account when a Route53 zone is also connected. Cert ARN + distribution ID logged.
- Deploy gate (operator-path variant): a real-account run without a Route53 zone returns the expected "add these DNS records, then re-deploy" message; the follow-up run completes once records resolve.

**Tasks**

- [ ] acm handler + extractor + test
- [ ] route53 handler + extractor + test
- [ ] CloudFront handler: consume cert from canvas
- [ ] Flip `Frontend`
- [ ] Update README rollout state + provider-status matrix

## A3 — EventBridge schedule wiring

Unblocks: **Scheduler**. `Compute.CronJob` block exists but the events-rule handler doesn't wire schedule expressions.

**Files to modify**

- `packages/core/src/deploy/providers/aws/handlers/events-rule.ts` — extend `create` to accept `schedule_expression` (cron or rate), `target_arn` (resolved from connected Lambda/SQS/SNS block), `target_input` (optional payload).
- `packages/core/src/deploy/extractors/aws/compute.ts` — extend `extract_events_rule_properties` to project cron → schedule_expression.
- `packages/constants/src/feature-flags.ts` — flip `Scheduler` on.

**Tests**

- Extend `aws-events-rule.test.ts` with schedule cases (cron-based, rate-based, target dispatch to Lambda).

**Acceptance**

- Code gate: schedule_expression branch + extractor + tests merged; CI green.
- Deploy gate: a `Compute.CronJob` → `Compute.ServerlessFunction` canvas applies on a real AWS account AND the EventBridge rule fires on schedule at least once. Lambda invocation log entry captured.

**Tasks**

- [ ] events-rule handler: schedule_expression
- [ ] extractor: cron projection
- [ ] test cases
- [ ] Flip `Scheduler`

## A4 — Update paths for create-only handlers

Unblocks the remainder of **Database**, **AI**, **Analytics**. Five handlers are create-only today (no-op on update). Each is a contained ~30–50 LOC change inside its existing handler file.

| Handler               | API to add                                | Notes                                                                          |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `cloudfront.ts`       | `UpdateDistribution`                      | ETag-aware; CloudFront propagation can take 15+ min — poll with `ctx.on_step`. |
| `cognito.ts`          | `UpdateUserPool` + `UpdateUserPoolClient` | Password policy + MFA changes only.                                            |
| `docdb.ts`            | `ModifyDBCluster`                         | Maintenance window awareness; some changes require apply-now flag.             |
| `redshift.ts`         | `ModifyCluster`                           | Node type + cluster size are reshape ops — long-running.                       |
| `ec2.ts` (EBS volume) | `ModifyVolume`                            | Volume size only; throughput optional.                                         |

**Files to modify**

- The five handler files above.
- `packages/constants/src/feature-flags.ts` — flip `Database`, `AI`, `Analytics` on once their respective handlers ship.

**Tests**

- Extend the existing per-handler test file with an update case.

**Acceptance**

- Code gate: `pnpm test packages/core` passes the new update cases.
- Deploy gate per handler: create → mutate-via-canvas → update → delete observed on a real AWS account for each of CloudFront / Cognito / DocDB / Redshift / EC2 EBS. Resource IDs and the diff applied logged.
- Categories flipped per handler readiness (Database: when RDS/DocDB updates ship AND deploy-verified; Analytics: when Redshift/OpenSearch update AND deploy-verified; AI: when SageMaker is verified against a real account, not mocks alone).

**Tasks**

- [ ] cloudfront UpdateDistribution
- [ ] cognito UpdateUserPool
- [ ] docdb ModifyDBCluster
- [ ] redshift ModifyCluster
- [ ] ec2 ModifyVolume
- [ ] Flip `Database`
- [ ] Flip `AI`
- [ ] Flip `Analytics`

## A5 — AWS CodeBuild path for Lambda

Removes the local-host requirement of `git` + `npm` + `zip` for Lambda auto-build. Today `lambda-builder.ts` shells out to local tooling.

**Files to create**

- `packages/core/src/deploy/providers/aws/handlers/codebuild.ts` — minimal `StartBuild` wrapper.

**Files to modify**

- `packages/core/src/deploy/providers/aws/handlers/lambda-builder.ts` — when CodeBuild is available, prefer it; fall back to local tooling otherwise. Operator picks via env or property.

**Tests**

- New `aws-codebuild.test.ts`; extend lambda-builder tests.

**Acceptance**

- Code gate: codebuild handler + fallback chain + tests merged; CI green.
- Deploy gate: a Lambda auto-build via CodeBuild succeeds on a real AWS account when local `git`/`npm`/`zip` are absent on the deploy host. Build log + function ARN captured.

**Tasks**

- [ ] codebuild handler
- [ ] lambda-builder fallback chain
- [ ] tests
- [ ] Update `aws/README.md` "Lambda auto-build" section

## A6 — Live-cloud deployability tests (developer tool)

The cardinal rule (see [README.md](README.md#cardinal-rule)) requires every handler to be verified by a real AWS deploy. A6 ships the **developer-run** live-test surface that proves a handler works against real AWS.

**Not CI.** These tests touch real cloud, cost real money, take real time. They're a developer self-serve tool — `pnpm test:live:aws <handler>` runs a single live test against the developer's own account.

### A6.1 — Foundation

Pattern mirrors the existing `*.int.test.ts` convention (`packages/core/src/deploy/providers/__tests__/`). New filename suffix `*.live.test.ts`, excluded from default vitest, opt-in via dedicated scripts.

**Files to create**

- `packages/core/src/deploy/providers/__tests__/live/_live-helpers.ts` — `awsLive` skip-aware describe wrapper, `uniqueAwsName(prefix, maxLen)` respecting per-service name limits (S3 63, Lambda 64, etc.), `createAwsDeployer()` that returns an initialised `AWSDeployer` with the real SDK chain, `JsonlLogger`, `runId()`.
- `packages/core/src/deploy/providers/__tests__/live/_live-types.ts` — `LiveEvent` discriminated union (run-start, create, update, delete, run-end).
- `scripts/run-live-tests.mjs` — wraps `pnpm test:live:aws s3 sqs` → vitest with substring-matched include patterns.
- `e2e/aws-deployment-tests/README.md` — developer notes: env contract, sample commands, per-handler expected cost.
- `e2e/aws-deployment-tests/runs/.gitkeep` — pre-create the JSONL output directory.
- `e2e/aws-deployment-tests/cleanup-orphans.ts` — scans for `ice:test-run-id` tag across S3/Lambda/RDS/etc., deletes leaked resources older than 1 hour. Manual-run for crash recovery.

**Files to modify**

- `vitest.config.ts` — add `**/*.live.test.{ts,tsx}` to exclude.
- `package.json` (root) — add `test:live:aws` script that exec's the wrapper.

### A6.2 — Per-handler live test

Every handler in the Block-to-handler coverage matrix has a `*.live.test.ts` at `packages/core/src/deploy/providers/__tests__/live/aws-<service>.live.test.ts`. Template:

```ts
awsLive('aws.<service>.<resource>', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-<service>');
  });
  afterAll(async () => { await deployer.cleanup(); logger.close(); });

  it('create + delete round-trip', async () => {
    const name = uniqueAwsName('<service>', <max-len>);
    let providerId: string | undefined;
    try {
      const r = await deployer.create('aws.<service>.<resource>', name, <minimal-props>, {});
      logger.log({ kind: 'create', result: r });
      expect(r.success).toBe(true);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.<service>.<resource>', name, providerId, {});
        logger.log({ kind: 'delete', result: d });
        expect(d.success).toBe(true);
      }
    }
  });

  // for handlers with update path: it('update round-trip', ...)
});
```

Each test file's header comment lists expected runtime + cost + quirks (e.g. "RDS needs `master_user_password`; test injects a random one").

### A6.3 — Deploy gate

Developer ergonomics:

```
export AWS_REGION=us-east-1
# AWS credentials via standard SDK chain (AWS_PROFILE, AWS_ACCESS_KEY_ID/SECRET, SSO, etc.)

pnpm test:live:aws          # run every AWS live test
pnpm test:live:aws s3       # run only S3
pnpm test:live:aws s3 sqs dynamodb   # run three
```

Without env, tests skip with a one-line banner explaining what to export. The developer who runs a live test successfully appends a row to `progress.md` → Deploy verification log; their corresponding deploy-gate checkbox flips.

### A6.4 — Cleanup contract

- Every test's `finally` block deletes its resource.
- `afterAll` calls `deployer.cleanup()`.
- Every resource is tagged `ice:test-run-id=<runId>`.
- If a test crashes hard, `pnpm tsx e2e/aws-deployment-tests/cleanup-orphans.ts --delete` sweeps leaks.

**Tasks**

- [ ] A6.1 `_live-helpers.ts` + `_live-types.ts` + runner script
- [ ] A6.1 vitest config + package.json scripts
- [ ] A6.1 `e2e/aws-deployment-tests/` README + cleanup-orphans
- [ ] A6.2 live test per existing handler (21 files: see Block-to-handler matrix)
- [ ] A6.2 live test per new handler (added in the handler's PR — see A1–A7)
- [ ] A6.3 Developer-run docs in `e2e/aws-deployment-tests/README.md`
- [ ] A6.4 cleanup-orphans tested locally

## A7 — Complete block coverage

Every iceType in `packages/blocks/src/aws/**/*.ts` must round-trip through a working handler. The 21 existing handlers cover most blocks; the items below are the gaps revealed by cross-referencing the block registry against `HANDLER_REGISTRY`.

### A7.1 — `Compute.SSRSite` → Amplify Hosting

Block: `packages/blocks/src/aws/frontend/ssr-site.ts`. Today the iceType has no deployer mapping.

**Files to create**

- `packages/core/src/deploy/providers/aws/handlers/amplify-hosting.ts` — `CreateApp` + `CreateBranch` + `StartDeployment`. Wire `Source.Repository` and build settings parallel to Lambda auto-build. Model after `gcp/handlers/firebase-hosting.ts`.
- `packages/core/src/deploy/extractors/aws/network.ts` — extend with `extract_amplify_app_properties`.

**Files to modify**

- `aws-deployer.ts` — register `{ prefix: 'aws.amplify.app', handler: amplify_hosting_handler }`.
- `extractors/dispatch.ts` — register `aws.amplify.app`.

**Tests** `aws-amplify.test.ts`.

### A7.2 — `Messaging.RabbitMQ` → Amazon MQ

Block: `packages/blocks/src/aws/messaging/rabbitmq.ts`.

**Files to create**

- `packages/core/src/deploy/providers/aws/handlers/amazon-mq.ts` — `CreateBroker` for RabbitMQ engine. Poll `DescribeBroker` for `RUNNING`. Honour `ctx.abort_signal`; brokers take 5–10 min.
- `packages/core/src/deploy/extractors/aws/ancillary.ts` — extend with `extract_amazon_mq_broker_properties`.

**Files to modify**

- `aws-deployer.ts` — register `{ prefix: 'aws.mq.broker', handler: amazon_mq_handler }`.
- `extractors/dispatch.ts` — register `aws.mq.broker`.

**Tests** `aws-amazon-mq.test.ts`.

### A7.3 — `Security.WAF` → WAFv2

Block: `packages/blocks/src/aws/security/waf.ts`. The block already has `behavior: 'singleton'` — one WAF web ACL per canvas attached to ALB / CloudFront / API Gateway.

**Files to create**

- `packages/core/src/deploy/providers/aws/handlers/wafv2.ts` — `CreateWebACL` + `AssociateWebACL` to a target (ALB / API Gateway). For CloudFront, use the `CLOUDFRONT` scope (pinned to `us-east-1`, same constraint as ACM cert in A2).
- `packages/core/src/deploy/extractors/aws/network.ts` — extend with `extract_wafv2_web_acl_properties`.

**Files to modify**

- `aws-deployer.ts` — register `{ prefix: 'aws.wafv2.webAcl', handler: wafv2_handler }`.
- `extractors/dispatch.ts` — register `aws.wafv2.webAcl`.

**Tests** `aws-wafv2.test.ts`.

### A7.4 — `Network.PrivateNetwork` → PrivateLink + VPC Endpoint

Block: shared `Network.PrivateNetwork` iceType. AWS implementation = VPC Endpoint (interface or gateway) plus optional PrivateLink service.

**Files to create**

- `packages/core/src/deploy/providers/aws/handlers/vpc-endpoint.ts` — `CreateVpcEndpoint` for the requested service name; attach to canvas-driven subnets + SGs from A1.
- `packages/core/src/deploy/extractors/aws/network.ts` — extend with `extract_vpc_endpoint_properties`.

**Files to modify**

- `aws-deployer.ts` — register `{ prefix: 'aws.ec2.vpcEndpoint', handler: vpc_endpoint_handler }`.
- `extractors/dispatch.ts` — register `aws.ec2.vpcEndpoint`.

**Tests** `aws-vpc-endpoint.test.ts`.

### A7.5 — `AI.VectorDB` → OpenSearch Serverless vector engine

Block: `packages/blocks/src/aws/ai/vector-db.ts`. Today the existing OpenSearch handler creates only managed-cluster domains. Vector DB needs Serverless collections with the `VECTORSEARCH` type.

**Files to modify**

- `packages/core/src/deploy/providers/aws/handlers/opensearch.ts` — branch on a `mode: 'vector'` flag; call `CreateCollection` on the Serverless API instead of `CreateDomain`. Different ARN shape, different update semantics — handle both in one file or split into a sibling `opensearch-serverless.ts`. Recommendation: split — `opensearch.ts` stays cluster-only, new `opensearch-serverless.ts` for `AI.VectorDB`.
- `extractors/aws/ai.ts` — extend with `extract_opensearch_serverless_collection_properties`; register against `aws.opensearchserverless.collection`.

**Files to create (if splitting)**

- `packages/core/src/deploy/providers/aws/handlers/opensearch-serverless.ts`.

**Tests** `aws-opensearch-serverless.test.ts`.

### A7.6 — `Compute.Worker` extractor variant

Block: `packages/blocks/src/aws/backend/worker.ts`. The ECS handler already covers worker-mode tasks; the gap is purely in the extractor (no service load balancer, longer idle timeout, optional spot launch).

**Files to modify**

- `packages/core/src/deploy/extractors/aws/compute.ts` — add `extract_ecs_worker_properties` distinct from `extract_ecs_service_properties`. Project to the existing ECS handler with `service_type: 'worker'`.
- `aws-deployer.ts` — no new entry; the ECS handler reads `service_type` and dispatches internally.
- `extractors/dispatch.ts` — register `aws.ecs.worker` against the new extractor.

**Tests** extend `aws-ecs.test.ts` with the worker case.

### A7.7 — `Network.SecurityGroup` extractor entry

Already covered by A1 handler work, but make sure `extractors/dispatch.ts` registers `aws.ec2.securityGroup` against the new extractor from A1. Listed here so the rollup totals match block count.

**Tasks**

- [ ] A7.1 amplify-hosting handler + extractor + test
- [ ] A7.2 amazon-mq handler + extractor + test
- [ ] A7.3 wafv2 handler + extractor + test
- [ ] A7.4 vpc-endpoint handler + extractor + test
- [ ] A7.5 opensearch-serverless split + extractor + test
- [ ] A7.6 ECS worker extractor variant
- [ ] A7.7 confirm `aws.ec2.securityGroup` in dispatch table

## Block-to-handler coverage matrix (AWS)

After A1–A7 land, every AWS block iceType has a deployer mapping. The table is the single check for "are we done with parity":

| Block file                     | iceType                    | Handler                        | Phase                   |
| ------------------------------ | -------------------------- | ------------------------------ | ----------------------- |
| ai/llm-gateway.ts              | AI.LLMGateway              | bedrock                        | existing                |
| ai/ml-model.ts                 | AI.ModelServing            | sagemaker                      | existing                |
| ai/vector-db.ts                | AI.VectorDB                | opensearch-serverless          | A7.5                    |
| analytics/data-warehouse.ts    | Analytics.DataWarehouse    | redshift                       | existing (A4 update)    |
| analytics/search.ts            | Analytics.Search           | opensearch                     | existing                |
| backend/scalable-backend.ts    | Compute.Container          | ecs (A1 subnets/SGs)           | A1                      |
| backend/scheduled-task.ts      | Compute.CronJob            | events-rule                    | A3                      |
| backend/worker.ts              | Compute.Worker             | ecs (worker extractor)         | A7.6                    |
| compute/serverless-function.ts | Compute.ServerlessFunction | lambda                         | existing (A5 codebuild) |
| data/dynamodb.ts               | Database.DynamoDB          | dynamodb                       | existing                |
| data/mongodb.ts                | Database.MongoDB           | docdb                          | existing (A4 update)    |
| data/mysql.ts                  | Database.MySQL             | rds (engine=mysql)             | existing                |
| data/postgresql.ts             | Database.PostgreSQL        | rds (engine=postgres)          | existing                |
| data/redis-cache.ts            | Database.Redis             | elasticache                    | existing                |
| frontend/ssr-site.ts           | Compute.SSRSite            | amplify-hosting                | A7.1                    |
| frontend/static-site.ts        | Compute.StaticSite         | s3 + cloudfront + acm          | A2                      |
| messaging/event-stream.ts      | Messaging.Topic            | sns (block uses Topic iceType) | existing                |
| messaging/rabbitmq.ts          | Messaging.RabbitMQ         | amazon-mq                      | A7.2                    |
| messaging/sns.ts               | Messaging.SNS              | sns                            | existing                |
| messaging/sqs.ts               | Messaging.SQS              | sqs                            | existing                |
| networking/gateway.ts          | Network.Gateway            | api-gateway                    | existing                |
| networking/subnet.ts           | Network.Subnet             | subnet                         | A1                      |
| networking/vpc.ts              | Network.VPC                | vpc                            | A1                      |
| (shared)                       | Network.SecurityGroup      | security-group                 | A1                      |
| (shared)                       | Network.PrivateNetwork     | vpc-endpoint                   | A7.4                    |
| (shared)                       | Network.CustomDomain       | route53                        | A2                      |
| (shared)                       | Network.LoadBalancer       | elbv2                          | existing                |
| observability/logs.ts          | Monitoring.Log             | cloudwatch-logs                | existing                |
| security/auth.ts               | Security.Identity          | cognito                        | existing (A4 update)    |
| security/secrets.ts            | Security.Secret            | secrets-manager                | existing                |
| security/ssl-certificate.ts    | Security.Certificate       | acm                            | A2                      |
| security/waf.ts                | Security.WAF               | wafv2                          | A7.3                    |
| storage/storage.ts             | Storage.Bucket             | s3                             | existing                |

## Cross-cutting acceptance

When Phase A is done:

- `PROVIDER_FLAGS.aws.categories` is all `true`.
- `docs/provider-status.md` AWS row reads "All categories enabled" or similar.
- `packages/core/src/deploy/providers/aws/README.md` rollout-state table is all green.
- **Cardinal rule**: every handler row in the Block-to-handler matrix has its deploy gate ticked in `progress.md` with a JSONL entry in `e2e/aws-deployment-tests/` for proof.
- AWS still listed as `experimental` in `PROVIDER_READINESS` — that flip happens in Phase D after importer (C) lands and the deploy log shows N consecutive green scheduled runs across all handlers.

## Dependencies

```
A1 ── unblocks ──► A2 (cloudfront depends on acm being canvas-resolvable)
A1 ── unblocks ──► A4 (db updates rely on subnet groups from VPC blocks)
A1 ── unblocks ──► A7.4 (vpc-endpoint attaches to canvas subnets/SGs)
A3 ── independent
A5 ── independent
A6 ── parallel; can start anytime
A7.1 ── after A2 (Amplify can reuse cert/DNS pipeline)
A7.2 / A7.3 / A7.5 ── independent
A7.6 / A7.7 ── after A1
```

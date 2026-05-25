# AWS Deployer — Operator Notes

This file documents the AWS-specific quirks the deployer handles
silently, the assumptions it bakes in, and the deferred work future
commits should pick up. Read this before changing any handler or
adding a new AWS resource type.

## Rollout state

AWS is feature-flagged at the category level in
`packages/constants/src/feature-flags.ts` (`PROVIDER_FLAGS.aws`). The
top-level `enabled` flag is **on**; categories are flipped selectively
based on the deploy path's actual readiness.

| Category   | State  | Notes                                                                                                                                                                                                   |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage    | ✅ on  | S3 handler + account-id suffix                                                                                                                                                                          |
| Messaging  | ✅ on  | SQS, SNS, EventBridge — FIFO suffix handled                                                                                                                                                             |
| Cache      | ✅ on  | ElastiCache                                                                                                                                                                                             |
| Monitoring | ✅ on  | CloudWatch Logs                                                                                                                                                                                         |
| Security   | ✅ on  | Secrets Manager (Cognito stays create-only)                                                                                                                                                             |
| Source     | ✅ on  | Provider-agnostic                                                                                                                                                                                       |
| Config     | ✅ on  | Provider-agnostic                                                                                                                                                                                       |
| Compute    | ⛔ off | ECS needs canvas-driven `Network.VPC` / `Network.Subnet` / `Network.SecurityGroup` blocks before it's safe to expose. Lambda alone is solid but the category gate is all-or-nothing today.              |
| Frontend   | ⛔ off | `Compute.StaticSite` requires the S3 + CloudFront + us-east-1 ACM cert dance and operator-side DNS validation — not yet automated.                                                                      |
| Scheduler  | ⛔ off | `Compute.CronJob` → EventBridge schedule expression wiring not finished.                                                                                                                                |
| Network    | ⛔ off | ELBv2 needs VPC blocks; CloudFront is create-only and depends on the cert-validation flow.                                                                                                              |
| Database   | ⛔ off | DynamoDB-only deploys would be fine; RDS / DocDB / Redshift work for first-deploy but have no update path and RDS takes 5–10 min. Unblock by either a sub-category gate or by shipping update handlers. |
| AI         | ⛔ off | Bedrock on-demand is a no-op resource (low value); SageMaker has only mocked-SDK coverage.                                                                                                              |
| Analytics  | ⛔ off | Redshift + OpenSearch are create-only.                                                                                                                                                                  |

Flip an `off` entry to `on` in `PROVIDER_FLAGS.aws.categories` once
its unblocker lands. The integrity test in
`packages/constants/src/__tests__/index.test.ts` keeps the map
exhaustive — adding a new `CategoryId` will require a deliberate
on/off decision here.

## Architecture

Mirrors the GCP layout (`../gcp/`):

- `aws-deployer.ts` — thin dispatcher. Iterates `HANDLER_REGISTRY`
  generically; cardinal rule preserved (no hardcoded iceType branches).
- `types.ts` — `AWSHandlerContext` + `AWSResourceHandler`.
- `sdk-loader.ts` — lazy `@aws-sdk/client-*` loading with graceful
  fallthrough when a package isn't installed.
- `account.ts` — memoised STS GetCallerIdentity (used by S3 + future
  handlers that need the AWS account id).
- `iam-roles.ts` — `ensureManagedRole` helper for idempotent IAM
  bootstrap; `ensureEcsTaskExecutionRole` is the only consumer today.
- `handlers/<service>.ts` — one file per AWS service. Register an
  entry in `HANDLER_REGISTRY` to wire a new handler in.

## Quirks shipped today

### S3 bucket names get an account-id suffix

S3 bucket names are globally unique across all AWS accounts. The
handler reads the account id from STS and appends `-{accountId}` to
the translator's resource name (`ice-myapp-bucket` →
`ice-myapp-bucket-111122223333`). The provider_id ARN carries the
post-suffix name so update + delete round-trip cleanly.

### CloudFront ACM certs must live in us-east-1

CloudFront refuses ACM certs from any region but `us-east-1`. The
CloudFront handler spins up a one-shot ACM client pinned to
`us-east-1` for `RequestCertificate`, regardless of the deploy
region. Operator validates the cert (DNS records) outside ICE.

### ECS auto-provisions a default cluster + task role

`Compute.Container` on AWS works without operators touching ECS
infrastructure. On first deploy the handler:

1. Calls `ensureEcsTaskExecutionRole(region)` — creates
   `ecsTaskExecutionRole` with `AmazonECSTaskExecutionRolePolicy`
   attached, idempotent (GetRole-first, CreateRole-on-NoSuchEntity).
2. Calls `ensureDefaultCluster(client, ecs, ctx)` — creates
   `ice-default-cluster` if no `ACTIVE` cluster with that name exists.

Then `RegisterTaskDefinition` + `CreateService` run against the
default cluster. Subnets + security groups still come from
properties (operator-supplied today; canvas VPC blocks for AWS land
in a follow-up).

### RDS / DocDB / Redshift refuse to ship without a password

The extractor for each of these defaults `master_user_password` to
`''` and the handler refuses to call CreateDB\* when the field is
empty. Operators wire a `Security.Secret` block or set the property
explicitly. This is intentional: AWS APIs accept an empty password
and create an unusable instance with no warning.

### RDS provisioning is polled

RDS instances take 5–10 minutes to provision. The RDS handler runs a
20-minute `DescribeDBInstances` poll loop after `CreateDBInstance`,
reports progress via `ctx.on_step`, and honours `ctx.abort_signal`
so a user-cancel actually stops the wait.

### Lambda auto-build from Source.Repository

When a `Compute.ServerlessFunction` has a connected `Source.Repository`
AND no explicit S3 ref:

1. `git clone --depth 1 --branch <branch>` the repo to a tmpdir.
2. `npm install --omit=dev` (skipped if no `package.json`).
3. `zip -qr function.zip .`.
4. Upload to `ice-bootstrap-{accountId}-{region}` (CreateBucket if
   absent).
5. Stamp `s3_bucket` + `s3_key` onto `properties` and continue with
   the normal CreateFunction path.

Local-only — assumes `git` + `npm` + `zip` are on the deploy host.
AWS CodeBuild integration is deferred; the failure message is
explicit so operators know to install the local tools.

### Bedrock on-demand is a no-op resource

`AI.LLMGateway` defaults to Bedrock on-demand (no provisioned
throughput). The handler short-circuits create with a synthetic ARN
and no SDK call. Operators set `model_units > 0` to actually
provision throughput.

### Secrets Manager values are never written

Parallel to the GCP Secret Manager contract: ICE creates the
`Secret` resource only. Values are populated by operators via the
AWS console / CLI / IaC. The schema-declared deploy-expansion pass
emits one Secret per binding row.

### SQS + SNS FIFO `.fifo` suffix

AWS requires FIFO queues + topics to end in `.fifo`. The handlers
append it when the extractor sets `fifo: true`.

## SDK packages

All `@aws-sdk/client-*` packages are loaded via `load_aws_sdk`
through the `Function('m', 'return import(m)')` indirection so a
missing package fails gracefully with a friendly "install …"
message instead of a bundler error. Mark every SDK package as an
optional peer dependency so installs stay small for users on other
providers.

## Test harness

`__tests__/_aws-test-harness.ts` exports a Function-constructor
stub + a generic `makeSdkMock` factory. Per-handler tests
(`aws-<service>.test.ts`) use them to mock SDK clients without
adding to the giant `aws-deployer.test.ts` file. New handlers
follow the same shape.

## Future work

- VPC-aware canvas for AWS (Network.VPC / Network.Subnet blocks
  drive ECS service `subnets` + `securityGroups`).
- AWS CodeBuild path for Lambda auto-build (no local `git`/`npm`/
  `zip` requirement).
- Update paths for CloudFront / Cognito / DocDB / Redshift / EC2 EBS
  (current handlers are create-only / no-op on update).
- LocalStack integration tests for end-to-end SDK contract checks.

# AWS deployment tests — live-cloud, developer-run

Real-AWS round-trip tests for every handler in `packages/core/src/deploy/providers/aws/handlers/`. Each test creates a resource, asserts the deployer's `provider_id` shape, then deletes it. The pass/fail is the cardinal-rule deploy gate for the handler.

**Not CI.** These tests touch real AWS, cost real money, take real time. They run on a developer's own account, on demand. No scheduled job. No PR gate.

## Setup (one-time)

1. Pick a sandbox AWS account dedicated to ICE testing.
2. Grant your IAM principal enough permission to create + delete the resources the handler touches. `AdministratorAccess` is the simplest start; tighten later per service.
3. Optional: set `AWS_TEST_VPC_ID`, `AWS_TEST_SUBNET_IDS`, `AWS_TEST_SECURITY_GROUP_IDS` if your handler needs them (RDS, ECS, ElastiCache, ELBv2). Otherwise the tests skip those handlers until A1 ships canvas-driven VPC blocks.

## Run

```sh
# Hand over credentials any of the standard ways the SDK already picks up:
#   - AWS_PROFILE=sandbox + ~/.aws/credentials
#   - AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (+ optional AWS_SESSION_TOKEN)
#   - SSO, instance metadata, etc.
export AWS_REGION=us-east-1

# Run every AWS live test
pnpm test:live:aws

# Run one handler
pnpm test:live:aws s3

# Run several (substring match against the .live.test.ts file path)
pnpm test:live:aws s3 sqs dynamodb

# Pass vitest flags through
pnpm test:live:aws s3 --reporter=verbose
```

Without `AWS_REGION` set, every test prints a one-line "skipped — set …" banner. Nothing runs, nothing costs.

## Output

Each run appends events to `runs/<runId>.jsonl`. One file per `pnpm test:live:aws` invocation. The `runId` includes today's date so the directory is human-scannable.

Example:

```jsonl
{"kind":"run-start","runId":"20260527-a1b2c3d4","provider":"aws","region":"us-east-1","ts":"2026-05-27T13:45:00.000Z"}
{"kind":"create","runId":"20260527-a1b2c3d4","handler":"aws-s3","result":{"resource_id":"ice-test-s3-...","success":true,"provider_id":"arn:aws:s3:::ice-test-s3-...","duration_ms":820},"ts":"..."}
{"kind":"delete","runId":"20260527-a1b2c3d4","handler":"aws-s3","result":{"resource_id":"ice-test-s3-...","success":true,"duration_ms":340},"ts":"..."}
{"kind":"run-end","runId":"20260527-a1b2c3d4","stats":{"created":1,"updated":0,"deleted":1,"failed":0},"ts":"..."}
```

Append a row to the **Deploy verification log** at the bottom of `inprogress/progress.md` referencing the run path. The corresponding `(D)` checkbox in the progress tree flips to `[x]`.

## Resource tagging + cleanup

Every resource is tagged with `ice:test-run-id=<runId>`. If a test crashes hard (Ctrl-C in the middle of a long-running RDS create, machine reboot, etc.), resources can leak. To sweep:

```sh
# Dry-run — list orphans older than 1 hour
pnpm tsx e2e/aws-deployment-tests/cleanup-orphans.ts

# Actually delete them
pnpm tsx e2e/aws-deployment-tests/cleanup-orphans.ts --delete
```

The script uses the AWS Resource Groups Tagging API to find anything tagged `ice:test-run-id=*` and deletes resources whose tag value points at a run that ended >1 hour ago.

## Expected runtime + cost (per handler)

Rough order-of-magnitude estimates for `us-east-1`. Real numbers depend on account / quotas.

| Handler             | Runtime   | Cost notes                                   |
| ------------------- | --------- | -------------------------------------------- |
| aws-s3              | < 30s     | Free (bucket lives <1 min)                   |
| aws-lambda          | < 30s     | Free tier covers easily                      |
| aws-cloudwatch-logs | < 10s     | Free                                         |
| aws-secrets-manager | < 10s     | $0.40/secret/month prorated; pennies per run |
| aws-sqs             | < 10s     | Free                                         |
| aws-sns             | < 10s     | Free                                         |
| aws-dynamodb        | < 30s     | On-demand; pennies                           |
| aws-elasticache     | 5–10 min  | cache.t3.micro ~$0.02/hr; ~$0.003 per run    |
| aws-rds             | 5–10 min  | db.t3.micro ~$0.02/hr; ~$0.003 per run       |
| aws-docdb           | 5–10 min  | t3.medium ~$0.08/hr; ~$0.01 per run          |
| aws-cognito         | < 30s     | Free under 50k MAU                           |
| aws-cloudfront      | 15–45 min | Free tier; long propagation time dominates   |
| aws-elbv2           | 1–3 min   | $0.025/hr per LB; ~$0.001 per run            |
| aws-api-gateway     | < 30s     | Free under 1M calls/mo                       |
| aws-events-rule     | < 30s     | Free                                         |
| aws-ecs             | 1–3 min   | Fargate task ~$0.04/hr; ~$0.002 per run      |
| aws-opensearch      | 5–15 min  | t3.small.search ~$0.04/hr; ~$0.01 per run    |
| aws-bedrock         | < 10s     | No-op synthetic ARN; no SDK call             |
| aws-sagemaker       | 3–8 min   | ml.t2.medium ~$0.05/hr; ~$0.01 per run       |
| aws-redshift        | 10–20 min | dc2.large ~$0.25/hr; ~$0.08 per run          |
| aws-ec2             | 1–2 min   | t3.nano ~$0.005/hr; pennies                  |

Full-suite run end-to-end on a quiet account: ~90 minutes, expected cost well under $1.

## Adding a new handler

1. Create `packages/core/src/deploy/providers/__tests__/live/aws-<service>.live.test.ts` following the template in [`_live-helpers.ts`](../../packages/core/src/deploy/providers/__tests__/live/_live-helpers.ts) header comments.
2. Add a row to this README's expected-cost table.
3. Run it once on a real account: `pnpm test:live:aws <service>`.
4. Append the run to `inprogress/progress.md` → Deploy verification log.
5. Tick the `(D)` checkbox for that handler in the progress tree.

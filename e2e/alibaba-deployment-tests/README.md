# Alibaba Cloud deployment tests — developer notes

Real-cloud tests for `alibaba.*` handlers. Outside CI; run on your own
Alibaba Cloud account. Each test does a create + delete round-trip and
records the result in `runs/<runId>.jsonl`.

## Prerequisites

- RAM AccessKey ID + Secret with the right policy for the services you
  exercise.
- An Alibaba region with the services you're testing (most are
  available in `cn-hangzhou`, `ap-southeast-1`).

## Required env

```sh
export ALIBABA_CLOUD_ACCESS_KEY_ID=...
export ALIBABA_CLOUD_ACCESS_KEY_SECRET=...
export ALIBABA_CLOUD_REGION=cn-hangzhou
```

Optional: `ALIBABA_CLOUD_SECURITY_TOKEN` for STS short-lived sessions.

## Run a single handler

```sh
pnpm test:live:alibaba oss-bucket
pnpm test:live:alibaba ecs-instance
pnpm test:live:alibaba rds-db-instance
```

The runner maps `<filter>` to `alibaba-<filter>.live.test.ts`.

## Cost considerations

- ECS instance: ~$0.01/min depending on shape
- RDS / KVStore / DDS: provisioning takes 5-15 min and incurs hourly
  charges. Test failures that leak instances are expensive — use
  `cleanup-orphans` after suspect runs
- OSS / KMS / MNS / VPC: free or negligible
- ACK / SAE / FC: per-second billing

## Cleanup

`finally` blocks delete per test. For orphans from crashes:

```sh
pnpm exec tsx e2e/alibaba-deployment-tests/cleanup-orphans.ts --dry-run
pnpm exec tsx e2e/alibaba-deployment-tests/cleanup-orphans.ts --delete
```

Filter: every resource the live tests create carries the tag
`managed-by:ice` and the `ice:test-run-id=<runId>` user tag (or
description suffix where Alibaba services don't support tags).

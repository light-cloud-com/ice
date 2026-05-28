# OCI deployment tests — developer notes

Real-cloud tests for `oci.*` handlers. Outside CI; run on your own
Oracle Cloud Infrastructure tenancy. Each test does a create + delete
round-trip and records the result in `runs/<runId>.jsonl`.

## Prerequisites

- An OCI tenancy with the right IAM policies for the services you
  exercise.
- A compartment OCID (separate from the root tenancy compartment is
  recommended — tests live there in isolation).

## Required env

```sh
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1..aaaaa...
export OCI_REGION=us-ashburn-1
```

Auth (one of):

- Default: `~/.oci/config` (set `OCI_CONFIG_FILE` + `OCI_CONFIG_PROFILE`
  to override path / profile name)
- `OCI_AUTH_MODE=instance-principal` (when running on an OCI VM with
  the dynamic group + policy)
- `OCI_AUTH_MODE=resource-principal` (when running inside an OCI
  Function or Container Instance)
- `OCI_AUTH_MODE=session-token` (after `oci session authenticate`)

## Run a single handler

```sh
pnpm test:live:oci core-instance
pnpm test:live:oci objectstorage-bucket
pnpm test:live:oci database-autonomous
```

The runner maps `<filter>` to `oci-<filter>.live.test.ts`.

## Cost considerations

- Compute instance: free-tier VM.Standard.E2.1.Micro = $0/hr; flex
  shapes ~$0.01-$0.10/hr
- Autonomous DB: free-tier ATP/ADW = $0/hr (1 OCPU + 1 TB);
  paid shapes are hourly
- MySQL HeatWave / PostgreSQL DB systems: hourly per-shape; teardown
  takes ~5 min after delete is accepted
- Object Storage: free for first 10 GB; per-GB egress

Most tests fit inside OCI free tier if you have one. Always sanity-check
the bill after any large test batch.

## Cleanup

`finally` blocks delete per test. For orphans from crashes:

```sh
pnpm exec tsx e2e/oci-deployment-tests/cleanup-orphans.ts --dry-run
pnpm exec tsx e2e/oci-deployment-tests/cleanup-orphans.ts --delete
```

Filter: every resource the live tests create carries
`freeformTags: { 'managed-by': 'ice', 'ice:test-run-id': '<runId>' }`.

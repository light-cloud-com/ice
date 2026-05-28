# IBM Cloud deployment tests — developer notes

Real-cloud tests for `ibm.*` handlers. Outside CI; run on your own
IBM Cloud account. Each test does a create + delete round-trip and
records the result in `runs/<runId>.jsonl`.

## Prerequisites

- IBM Cloud IAM API key with the right policies for the services you
  exercise. The fastest setup: create a service-id with role
  `Administrator` in your test resource group.
- A test resource group (separate from your prod resource group) —
  most managed services land here.
- An MZR region (`us-south`, `eu-de`, `jp-tok`, …).

## Required env

```sh
export IBMCLOUD_API_KEY=...
export IBMCLOUD_REGION=us-south
export IBMCLOUD_RESOURCE_GROUP_ID=<resource-group-id>
```

Optional:

```sh
export IBMCLOUD_ACCOUNT_ID=...                # needed for COS bucket
                                              # via service-instance CRN
```

## Run a single handler

```sh
pnpm test:live:ibm vpc
pnpm test:live:ibm codeengine-application
pnpm test:live:ibm databases-postgresql
```

The runner maps `<filter>` to `ibm-<filter>.live.test.ts`.

## Cost considerations

- VPC + subnet + security group: $0 / hr (control plane); only
  attached resources cost
- VPC Virtual Server Instance (`bx2-2x8`): ~$0.07/hr
- Databases for PostgreSQL (standard / 1 GB / 5 GB): ~$0.12/hr;
  provisions in 8-15 min
- Code Engine application: pay-per-request; idle = $0
- COS bucket: $0 for storage <5 GB / month; per-GB after
- IKS cluster: control plane $0/hr; worker pool ~$0.07+/hr per worker
- LogDNA / Sysdig: tiered by retention; the catalog `lite` /
  `7-days` plans = $0
- Cloudant: lite plan = $0; standard = $1/hr equivalent

## Cleanup

`finally` blocks delete per test. For orphans from crashes:

```sh
pnpm exec tsx e2e/ibm-deployment-tests/cleanup-orphans.ts --dry-run
pnpm exec tsx e2e/ibm-deployment-tests/cleanup-orphans.ts --delete
```

Filter: every resource the live tests create carries a tag prefix
`managed-by:ice` (visible via `ibmcloud resource search 'tags:managed-by:ice'`).

## Handlers without first-party SDK packages

These services don't have public-npm `@ibm-cloud/*` SDK packages at
the time of writing:

- `ibm.cis.zone` / `ibm.cis.wafrule` (Cloud Internet Services — REST
  via `@ibm-cloud/networking-services` not yet published)
- `ibm.eventnotifications.instance`
- `ibm.eventstreams.topic`
- `ibm.mq.queuemanager`
- `ibm.monitoring.alert`
- `ibm.watsonx.deployment`

All seven land via the Resource Controller factory in
`packages/core/src/deploy/providers/ibm/handlers/resource-instance.ts`
— which IS published via `@ibm-cloud/platform-services`. The live tests
exercise the RC layer (resource instance create + delete); post-create
service-specific config (DNS records, IKS worker pools, Kafka topics,
…) is operator-driven and out of scope.

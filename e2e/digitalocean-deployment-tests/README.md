# DigitalOcean deployment tests — developer notes

Real-cloud tests for `digitalocean.*` handlers. Outside CI; run on
your own DigitalOcean account. Each test does a create + delete
round-trip and records the result in `runs/<runId>.jsonl`.

## Prerequisites

- A DigitalOcean Personal Access Token with the right scopes (most
  tests need `read` + `write` across droplets, databases, registry,
  vpc, kubernetes, monitoring).
- A DO datacenter region — `nyc3` and `sfo3` are good defaults.

## Required env

```sh
export DIGITALOCEAN_TOKEN=dop_v1_...
export DIGITALOCEAN_REGION=nyc3
```

For Spaces (S3-compatible object storage) tests:

```sh
export DO_SPACES_ACCESS_KEY=...
export DO_SPACES_SECRET_KEY=...
```

## Run a single handler

```sh
pnpm test:live:digitalocean droplet
pnpm test:live:digitalocean databases-cluster
pnpm test:live:digitalocean kubernetes-cluster
```

The runner maps `<filter>` to `do-<filter>.live.test.ts`.

## Cost considerations

- Droplet (`s-1vcpu-1gb`): $0.007/hr
- DB cluster (`db-s-1vcpu-1gb`): $0.022/hr; takes 5-10 min to
  provision
- DOKS cluster: control plane $0/hr; node pool $0.007+/hr per node
- Load balancer: $0.014/hr per LB
- Spaces: $5/mo flat ($0.007/hr equivalent)
- DOCR (basic tier): $0/hr (free)

Most resources are billed per-second after the first minute. Crashed
tests leaving a Droplet for an hour still cost cents — but a DOKS
cluster left for a day is $1+. Run `cleanup-orphans` after suspect
runs.

## Cleanup

`finally` blocks delete per test. For orphans from crashes:

```sh
pnpm exec tsx e2e/digitalocean-deployment-tests/cleanup-orphans.ts --dry-run
pnpm exec tsx e2e/digitalocean-deployment-tests/cleanup-orphans.ts --delete
```

Filter: every resource the live tests create carries the tag
`managed-by:ice` (DO tags are global; the run-id is appended as a
second tag).

## Handlers without SDK support

Three DO services don't have first-party `dots-wrapper` API methods at
3.x:

- `digitalocean.functions.namespace` + `digitalocean.functions.function`
  (DO Functions / serverless — uses `doctl serverless` via shell, not
  the SDK)
- `digitalocean.monitoring.alertpolicy` (uses DO REST directly via
  axios; not in dots-wrapper)

The live tests skip these handlers with a friendly banner. When DO
ships first-party SDK support, drop the skip + remove the banner.

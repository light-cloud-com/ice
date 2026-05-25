# Connections → cloud infra

How a line drawn between two blocks on the canvas becomes real cloud
resources, IAM bindings, and network policy. Worked examples on GCP at
the end.

## The mental model

A canvas edge is **not** a cloud resource. The cloud sees only resources
plus IAM plus network policy — there is no "edge" object in any cloud
SDK. So every line you draw must collapse into some mix of three things
on the endpoint nodes:

1. **Property propagation** — env vars, URLs, connection strings, etc.
   written onto a block's properties because of the connection.
2. **IAM binding** — the source node's identity gets a role on the
   target's resource (and vice versa).
3. **Network policy** — firewall / ingress allow-list entries, VPC
   peering, custom domain routes.

Which of the three an edge produces is decided by its
`connectionCategory` (`traffic` | `config` | `source` | …) plus the
roles of the two endpoint blocks (`backend`, `database`, `storage`,
`secrets`, `repo`, …). Roles come from a single table in
`@ice/constants/block-classifiers.ts` so the connection-rules predicates
and the propagation predicates can never drift apart on what "is a
database" means.

## The pipeline

```
canvas edge          (drawn in the UI)
  ↓
connection rules     packages/types/connection-rules
                     Shape check: is this combo legal at all?
  ↓
propagation rules    packages/core/src/compute/propagation-rules.ts
                     Mutate node data based on the edge.
  ↓
type-maps            packages/core/src/deploy/type-maps.ts
                     iceType → provider resource type (per cloud).
  ↓
extractors           packages/core/src/deploy/extractors/*
                     Block properties → provider resource properties.
  ↓
handlers             packages/core/src/deploy/providers/<cloud>/handlers/*
                     Resource properties → cloud SDK call.
```

Each layer is schema-driven; per-provider behaviour lives in
per-provider files only. The cardinal rule: no hardcoded `iceType ===`
branches in cross-cutting code. See
[refactoring-patterns.md](../refactoring-patterns.md) for the rationale.

### Layer 1 — connection rules

`packages/types/connection-rules` holds the **legality** table: which
(source iceType, target iceType) pairs are even valid edges. It runs in
the UI as you drag a connection — incompatible combos are rejected
before the edge can land. Predicates here use `hasBlockRole` so
`isDatabase(t)` works the same way on both sides of the layer split.

### Layer 2 — propagation rules

`packages/core/src/compute/propagation-rules.ts` is a declarative array.
Each `PropagationRule` says: "when source role × target role match
this pattern AND this edge has these data fields, write these derived
properties onto the receiving node."

There are two flavours:

- **Per-edge rules** (`PROPAGATION_RULES`) — fire on a single edge,
  compute a property patch for the source or target depending on
  `direction`. E.g. `Backend → DataStore: connection string
propagation` writes `envVarName: 'BUCKET_NAME'` onto the edge so
  downstream the backend knows what env var to read.
- **Aggregate rules** (`AGGREGATE_RULES`) — fire on a node, scan all
  inbound or outbound edges, compute a property patch from the
  collection. E.g. `DataStore: derive allowedClients from inbound
traffic edges` populates the bucket's `allowedClients` array, which
  the handler turns into an IAM policy binding.

These run live in the UI (so the properties panel reacts as soon as
you draw an edge) and again pre-deploy (so the translator sees the
fully-propagated graph).

### Layer 3 — type-maps

`packages/core/src/deploy/type-maps.ts` is the provider-specific
collapse: a single `Record<iceType, providerResourceType>` per cloud.
`Compute.BackendAPI` becomes `gcp.run.service` on GCP,
`aws.ecs.service` on AWS, `azure.containerapps.app` on Azure. One iceType
can map to different resources per provider because the schema-driven
extractor dispatch sits behind it.

Some iceTypes deliberately compile differently on different clouds —
`Compute.StaticSite` → `gcp.firebase.hosting` on GCP (bypasses the
public-bucket org policy) but → `aws.s3.bucket` + CloudFront on AWS.
That's documented inline in `type-maps.ts`.

### Layer 4 — extractors

`packages/core/src/deploy/extractors/*` transform a canvas block's
**user-facing properties** (`data.schedule = 'daily'`,
`data.bucket_name = 'photos'`) into the **provider resource
properties** the handler expects (`schedule: '0 0 * * *'`,
`bucket_name: 'ice-photos-abc123'`). One extractor per provider
resource type. The dispatcher (`extractors/dispatch.ts`) routes by the
type-map output, not by iceType.

### Layer 5 — handlers

`packages/core/src/deploy/providers/<cloud>/handlers/*` make the actual
SDK call. Handlers are dumb — they assume the extractor has already
filled every required property correctly, so the only branching is
between create / update / delete. See
[`providers/aws/README.md`](../../packages/core/src/deploy/providers/aws/README.md)
and [deploying-to-gcp.md](../deploying-to-gcp.md) for the per-provider
quirks each layer handles.

## Worked example 1 — `Storage.Bucket` connected to `Compute.BackendAPI` (GCP)

You drag a Backend onto the canvas, drop a Storage Bucket next to it,
draw an edge Backend → Bucket. Here's what each layer does.

**Type-map** (`type-maps.ts:31,39`):

- `Compute.BackendAPI` → `gcp.run.service`
- `Storage.Bucket` → `gcp.storage.bucket`

**Propagation fires twice as you draw the edge:**

1. `Backend → DataStore: connection string propagation`
   (`propagation-rules.ts:166`) — `hasBlockRole('storage')` matches the
   bucket, so the rule resolves `envVarName: 'BUCKET_NAME'` from
   `DEFAULT_ENV_VARS['Storage.Bucket']` (in `@ice/constants/derived`)
   and stamps it onto the **edge data**.
2. `DataStore: derive allowedClients from inbound traffic edges`
   (`propagation-rules.ts:218`) — runs on the bucket node, looks at
   every inbound `traffic` edge, writes
   `allowedClients: [{ nodeId, iceType, label }]` onto the bucket. This
   array is what the IAM-binding pass reads.
3. `Service: derive allowedTargets from outbound traffic edges`
   (`propagation-rules.ts:263`) — the symmetric view on the backend, so
   it knows what it's allowed to reach.

**Extractors then run:**

- `extract_cloud_run_properties` for the backend — picks up
  `injectedEnvVars: { BUCKET_NAME: <bucket-name> }` (resolved from the
  edge's `envVarName` plus the target bucket's name) and merges it into
  the Cloud Run service's `env` array.
- `extract_storage_bucket_properties` for the bucket — passes through
  bucket name, location, uniform-access-level, plus the
  `allowedClients` from the aggregate rule.

**Handlers call GCP:**

- The Cloud Run handler creates a `google.cloud.run.v2.Service` with
  `env: [{ name: 'BUCKET_NAME', value: 'ice-myapp-photos' }]`.
- The Cloud Storage handler creates a private
  `google.cloud.storage.Bucket` (no `allUsers` binding — that's
  reserved for `Compute.StaticSite`; see
  [`cloud-storage/public-access-granter.ts`](../../packages/core/src/deploy/providers/gcp/handlers/cloud-storage/public-access-granter.ts)).
- After both exist, an IAM pass grants the Cloud Run service's
  identity `roles/storage.objectUser` on the bucket. The bucket-side
  `allowedClients` is the input list.

**Cloud-side result of one canvas edge:**

- ✅ env var injection on the Cloud Run service
- ✅ IAM policy binding on the bucket
- ❌ no "edge resource" — none exists in GCP

## Worked example 2 — `Compute.CronJob` connected to `Compute.BackendAPI` (GCP)

You drop a Cron block, set schedule to `daily`, draw an edge Cron →
Backend.

**Type-map** (`type-maps.ts:31,33`):

- `Compute.CronJob` → `gcp.cloudscheduler.job`
- `Compute.BackendAPI` → `gcp.run.service`

**Propagation:** a translator pass reads the cron's outbound edge to
the Backend and writes the Backend's URL onto `cron.data.targetUri`.
Because cron is a job-like trigger (not a data store), it doesn't
participate in the `Backend → DataStore` rule — its outbound edge is
the propagation source.

**Extractor** (`extractors/compute.ts:135`,
`extract_cloud_scheduler_properties`) turns `data.schedule = 'daily'`
into a real cron expression `'0 0 * * *'` via a built-in map, then
emits:

```ts
{
  region,
  schedule: '0 0 * * *',
  timezone: 'UTC',
  target_type: 'http',
  target_uri: <backend-cloud-run-url>,
  labels: {},
}
```

**Handler** (`gcp/handlers/cloud-scheduler.ts:62`) calls
`projects.locations.jobs.create` with:

```ts
httpTarget: { uri: properties.target_uri, httpMethod: 'POST', ... }
```

If the Cloud Run service is private (not public-traffic), the IAM pass
grants the scheduler's service account `roles/run.invoker` on the
service. That binding is applied by
[`gcp/handlers/cloud-run/iam.ts:19`](../../packages/core/src/deploy/providers/gcp/handlers/cloud-run/iam.ts).

**Cloud-side result of one canvas edge:**

- ✅ a `google.cloud.scheduler.v1.Job` that POSTs the backend URL on
  schedule
- ✅ optional `run.invoker` IAM binding scoped to the scheduler's SA
- ❌ no "edge resource"

## Why this layering matters

- **Property propagation runs both live (UI) and pre-deploy.** Drawing
  an edge updates the properties panel before you save — same rules,
  same code. The deploy never sees an unpropagated graph.
- **Layers can be swapped per provider without touching the others.**
  AWS and Azure plug in by registering their own type-maps,
  extractors, and handlers; the propagation rules and connection rules
  are provider-agnostic because they only read roles (`backend`,
  `database`, …) from the shared classifier table.
- **No edges in the cloud.** If your debugging instinct is "find the
  connection in the cloud console" — stop. Look at the env vars on the
  consumer, the IAM bindings on the producer, and the firewall rules
  on the network.

## See also

- [core-engine.md](core-engine.md) — graph engine, plan/apply scheduler,
  state store.
- [extending-providers.md](../extending-providers.md) — adding a new
  provider goes through these same layers.
- [blocks-reference.md](../blocks-reference.md) — every iceType and the
  roles it carries.
- [`packages/core/src/compute/propagation-rules.ts`](../../packages/core/src/compute/propagation-rules.ts) — the full rules table.
- [`packages/core/src/deploy/type-maps.ts`](../../packages/core/src/deploy/type-maps.ts) — every iceType → provider resource mapping.

# Phase 1 — Stable Resource Identity

**Effort:** 2–3 engineer-days
**Dependencies:** Phase 0
**Issues addressed:** P1-1 through P1-6, indirectly enables Phase 2 (P2-*), Phase 4 (P4-*), Phase 7 (P7-*)

## Overview

This is the keystone of the whole plan. Until resource identity is stable across deploys, none of the "update instead of recreate" or "drift detection" features can work correctly, and the canvas block can't reliably show status for a specific resource.

## Why it matters

The current naming scheme `sanitize_name(\`${label}-${node.id.slice(-6)}\`)` has two independent problems:

1. **Label leakage.** The user renames a block and the resource name changes. The diff engine thinks the old name is no longer desired, the new name is brand-new, and you get a destroy-recreate cycle instead of an update.
2. **Node-id fragility.** Six characters of a UUID isn't a reliable handle. Collisions happen, the resource→node lookup is fuzzy, and canvas reorganizations (cut/paste, drag to new group) can regenerate node IDs.

The fix is to stop deriving resource names from anything the user can change, and instead persist an explicit `node_id → resource_name` mapping that survives label edits, canvas moves, and UI refactors.

We also fix the `'failed' vs 'partial'` status bug here because it's the second half of why the update path never fires — even with stable names, if the last deploy was marked `failed`, the current-graph reconstruction query returns nothing and the diff engine sees no baseline.

## Steps

### Step 1.1 — Create the `DeployedResourceMapping` Prisma model

**Closes:** P1-6 (data model for stable identity)
**File:** `packages/db/prisma/schema.prisma`

Add a new model:

```prisma
model DeployedResourceMapping {
  id            String   @id @default(cuid())
  card_id       String
  node_id       String   // canvas node UUID
  environment   String
  resource_type String   // e.g., 'gcp.storage.bucket'
  resource_name String   // the actual name used in GCP
  provider_id   String?  // set after first successful deploy
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  @@unique([card_id, node_id, environment])
  @@index([card_id, environment])
  @@map("deployed_resource_mapping")
}
```

The unique constraint on `(card_id, node_id, environment)` is load-bearing: one node can have one resource per environment, but the same node can exist across dev/staging/prod simultaneously.

Run `pnpm db:migrate` to generate the migration. Name it `add_deployed_resource_mapping`.

**Acceptance:**
- Migration applies cleanly on a fresh database
- Migration applies cleanly on a populated dev database (no data loss)
- `prisma generate` produces the new types

### Step 1.2 — Add a service helper for mapping lookup and upsert

**Closes:** P1-6
**File:** New `services/deploy/src/services/resource-mapping.service.ts`

```ts
import prisma from '@ice/db';

export async function getResourceMap(
  cardId: string,
  environment: string,
): Promise<Map<string, { name: string; type: string; provider_id?: string }>> {
  const rows = await prisma.deployedResourceMapping.findMany({
    where: { card_id: cardId, environment },
  });
  const m = new Map();
  for (const r of rows) {
    m.set(r.node_id, {
      name: r.resource_name,
      type: r.resource_type,
      provider_id: r.provider_id ?? undefined,
    });
  }
  return m;
}

export async function upsertResourceMapping(args: {
  cardId: string;
  nodeId: string;
  environment: string;
  resourceType: string;
  resourceName: string;
  providerId?: string;
}) { /* upsert on the unique key */ }

export async function removeResourceMapping(args: {
  cardId: string;
  nodeId: string;
  environment: string;
}) { /* delete */ }

export async function removeAllMappingsForCard(cardId: string, environment?: string) {
  /* used on destroy */
}
```

**Acceptance:**
- Unit test: upsert twice with same (card, node, env), second call updates instead of duplicating
- Unit test: `getResourceMap` returns empty map for unknown card
- Unit test: remove deletes the exact row

### Step 1.3 — Extend `translate_card_to_graph` to accept an existing name map

**Closes:** P1-1, P1-2
**File:** `packages/core/src/deploy/card-translator.ts`

Change the signature:

```ts
export interface CardTranslationInput {
  nodes: CardNodeInput[];
  edges: CardEdgeInput[];
  provider: DeployProvider;
  projectName: string;
  environment: EnvironmentType;
  gcpProject?: string;
  region: string;
  /** node_id → existing resource name for nodes already deployed. */
  existing_names?: Map<string, string>;
}
```

Inside the translator's node loop, before generating a name:

```ts
const existing = existing_names?.get(node.id);
const name = existing ?? generate_stable_name(gcp_type, node.id);
```

Where `generate_stable_name` is a new helper:

```ts
function generate_stable_name(resource_type: string, node_id: string): string {
  // e.g. resource_type = 'gcp.storage.bucket' → 'bucket'
  const type_slug = resource_type.split('.').pop() || 'resource';
  // First 10 chars of SHA-256(node_id) — stable, short, collision-resistant
  const hash = crypto.createHash('sha256').update(node_id).digest('hex').slice(0, 10);
  return sanitize_name(`ice-${type_slug}-${hash}`);
}
```

The `ice-` prefix is deliberate — it makes ICE-deployed resources findable in the GCP console by name pattern, which is useful before Phase 7 adds real label-based discovery.

**Important:** if a node has an existing name from the map, use it as-is. Do not re-sanitize, do not re-hash — the whole point is stability.

**Acceptance:**
- Translator returns the persisted name for nodes in the map, even if the node's `data.label` was changed
- Translator generates a new hash-based name for novel nodes
- Two translations of the same node produce the same name (determinism test)
- Renaming a block on the canvas then re-planning does NOT change the resource name
- Add unit tests for the three cases above

### Step 1.4 — Load and pass the mapping in `planDeployment` and `applyDeployment`

**Closes:** P1-1, P1-2
**File:** `services/deploy/src/services/deploy.service.ts`

In both `planDeployment` and `applyDeployment`, before calling `translate_card_to_graph`:

```ts
const existing_names = await getResourceMap(cardId, options.environment || 'development');
const nameByNodeId = new Map<string, string>();
for (const [nodeId, info] of existing_names) {
  nameByNodeId.set(nodeId, info.name);
}

const translation = translate_card_to_graph({
  // ...existing args
  existing_names: nameByNodeId,
});
```

**Acceptance:**
- Plan output for an unchanged canvas matches the previous plan byte-for-byte
- Plan output after a label rename does not include the rename in the creates list
- Plan output for a new block includes exactly the new block in creates

### Step 1.5 — Upsert mappings on successful resource creation

**Closes:** P1-6
**File:** `services/deploy/src/services/deploy.service.ts`

After `deploy_graph` returns, iterate `result.resources` and upsert into the mapping table for every `success: true` resource that has a known `source_node_id` (from the lookup we already fixed):

```ts
if (result.resources?.length > 0) {
  for (const res of result.resources) {
    const source_node_id = findSourceNodeId(res);
    if (source_node_id && res.success) {
      await upsertResourceMapping({
        cardId,
        nodeId: source_node_id,
        environment: options.environment || 'development',
        resourceType: res.type,
        resourceName: res.name,
        providerId: res.provider_id,
      });
    }
  }
}
```

On destroy, remove mappings for deleted resources:

```ts
await removeResourceMapping({ cardId, nodeId: source_node_id, environment });
```

**Acceptance:**
- After a successful deploy, `DeployedResourceMapping` has one row per deployed resource
- After a destroy, the corresponding rows are gone
- After a partial deploy, only successful resources are mapped

### Step 1.6 — Fix partial-success status

**Closes:** P1-3, P1-4
**File:** `services/deploy/src/services/deploy.service.ts`

Change the status write at the end of `applyDeployment`:

```ts
const hasAnySuccess = result.resources?.some((r: any) => r.success);
const status: 'success' | 'partial' | 'failed' =
  result.success ? 'success' : hasAnySuccess ? 'partial' : 'failed';

await prisma.canvasDeployment.update({
  where: { id: deployment.id },
  data: {
    status,
    results: result as any,
    duration_ms: durationMs,
    error: errorMsg,
  },
});
```

And change the baseline-loading query:

```ts
const lastDeploy = await prisma.canvasDeployment.findFirst({
  where: {
    card_id: cardId,
    environment: options.environment || 'development',
    status: { in: ['success', 'partial'] },
  },
  orderBy: { created_at: 'desc' },
});
```

Also filter by environment — currently missing. A dev deploy should not influence a prod diff.

The `CanvasDeployment.status` string field accepts any value, so no schema change needed. Phase 6 will enforce the state machine properly.

**Acceptance:**
- A deploy where one resource fails is stored as `'partial'`, not `'failed'`
- The next deploy finds the partial row and uses it as the baseline
- A deploy where every resource fails is stored as `'failed'`
- A dev deploy does not affect a subsequent prod deploy's baseline

### Step 1.7 — Standard labels on every GCP resource

**Closes:** P1-5
**Files:** Every file in `packages/core/src/deploy/providers/gcp/handlers/`

Add a helper:

```ts
// packages/core/src/deploy/providers/gcp/standard-labels.ts
export function standardLabels(
  ctx: { card_id?: string; environment?: string; project_name?: string },
  userLabels?: Record<string, string>,
): Record<string, string> {
  return {
    ...(ctx.card_id && { 'ice-card-id': ctx.card_id }),
    ...(ctx.environment && { 'ice-environment': ctx.environment }),
    ...(ctx.project_name && { 'ice-project': sanitize_label_value(ctx.project_name) }),
    'ice-managed': 'true',
    ...userLabels,
  };
}
```

Thread `card_id`, `environment`, and `project_name` through `GCPHandlerContext` so every handler has access to them. In each handler's `create` method, replace `labels: properties.labels || {}` with `labels: standardLabels(ctx, properties.labels as Record<string, string>)`.

GCP label values have constraints (lowercase, dashes only, max 63 chars, no periods). The `sanitize_label_value` helper enforces them. Some resource types (e.g., `gcp.compute.globalForwardingRule`) don't support labels directly — skip label application for those but add a `TODO` to store the metadata elsewhere.

**Acceptance:**
- Every supported resource type in `handlers/` applies standard labels on create
- Querying GCP: `gcloud compute instances list --filter="labels.ice-managed=true"` returns only ICE-deployed resources
- Pre-existing user labels are preserved alongside the standard ones

### Step 1.8 — Lazy migration for existing deployments

**Closes:** P1-6 (migration path)
**File:** `services/deploy/src/services/deploy.service.ts`

On the first plan or apply for a card after this phase ships, if `DeployedResourceMapping` is empty for that card but there's a prior successful `canvasDeployment`, seed the mapping from the stored `results.resources`:

```ts
async function seedMappingsFromHistory(cardId: string, environment: string) {
  const existing = await prisma.deployedResourceMapping.count({
    where: { card_id: cardId, environment },
  });
  if (existing > 0) return;

  const lastDeploy = await prisma.canvasDeployment.findFirst({
    where: { card_id: cardId, environment, status: { in: ['success', 'partial'] } },
    orderBy: { created_at: 'desc' },
  });
  if (!lastDeploy?.results) return;

  const resources = ((lastDeploy.results as any).resources || []) as any[];
  for (const r of resources) {
    if (r.success && r.source_node_id && r.name) {
      await upsertResourceMapping({
        cardId,
        nodeId: r.source_node_id,
        environment,
        resourceType: r.type,
        resourceName: r.name,
        providerId: r.provider_id,
      });
    }
  }
}
```

Call `seedMappingsFromHistory` at the top of `planDeployment` and `applyDeployment` before loading the mapping. It's a no-op after the first call per card.

**Why lazy and not a full migration script:** existing stored `results` don't always have `source_node_id` (we only started setting it properly recently). A lazy seed skips un-mappable rows and picks up fresh mappings on the next successful deploy, which is the right behavior.

**Acceptance:**
- First plan on an already-deployed card seeds the mapping table
- Subsequent plans do not re-seed
- Cards with no history produce an empty mapping (not an error)

### Step 1.9 — Add environment to the mapping lookup path

**Closes:** P1-3, P1-4 (completing the environment-aware logic)
**File:** `services/deploy/src/services/deploy.service.ts`

Ensure every read and write of the mapping table includes `environment`. This is the key that prevents dev and prod from stepping on each other. Phase 6 adds the database-level unique constraint; this step ensures the application layer respects it even before the schema change lands.

**Acceptance:**
- Deploy same card to dev, then to prod. Two rows exist in `DeployedResourceMapping` per node (one per env).
- Rename a block, redeploy to dev. Dev mapping updates, prod mapping unchanged.
- Plan for prod doesn't see dev's resource names.

### Step 1.10 — Update the deploy result type to include `environment`

**Closes:** Supports P1-3, P1-4, and sets up Phase 4 / 7
**File:** `packages/core/src/deploy/types.ts`, `services/deploy/src/services/deploy.service.ts`

Add `environment: string` to the `DeployResult` type and ensure it's populated everywhere we write to the database or emit to sockets. Downstream consumers (properties panel history, drift detection, requirements framework) all need environment tagging.

**Acceptance:**
- `DeployResult` interface includes `environment`
- All code paths that construct a `DeployResult` populate it
- TypeScript compiles cleanly with no `as any` casts around environment

## Cross-cutting acceptance

Run this end-to-end scenario manually:

1. Clean database, clean GCP project.
2. Deploy a static site card named "My Site" with 2 resources to `environment=development`. Both succeed.
3. Verify `DeployedResourceMapping` has 2 rows, each with the card id and `environment=development`.
4. Rename the block from "My Site" to "Marketing Site" on the canvas.
5. Click Plan. The plan preview should show `creates: 0, updates: 0, deletes: 0` — no changes.
6. Click Apply anyway. Deploy succeeds with no GCP API calls (diff engine produces empty plan).
7. Verify GCP still has exactly 2 resources with the original names.
8. Deploy the same card to `environment=production`. Verify 2 more rows in the mapping table.
9. Add a new block to the canvas, deploy to dev. Verify the new resource is added, the old two are not touched, and only the dev environment is affected.
10. Simulate a partial failure (e.g., modify a property to something invalid). Verify the deployment is stored as `'partial'`, not `'failed'`, and the next deploy uses it as a baseline.

## Risks

**Risk 1: Existing users have in-flight deployments that don't have `source_node_id` in their stored results.** Mitigation: lazy seeding (Step 1.8) handles this gracefully. Worst case, the first post-upgrade deploy does a destroy-recreate for one or two resources. Document this as expected in the release notes.

**Risk 2: The hash-based name is too cryptic for debugging.** Mitigation: prefix with a resource type slug and the `ice-` brand (`ice-bucket-a3f7c2b9e1`). Users can at least tell what type of resource it is at a glance. For deeper debugging, the `ice-card-id` label lets them filter in the GCP console.

**Risk 3: Node IDs aren't actually stable across canvas operations.** Need to audit `packages/ui/src/store/slices/cards-slice.ts` and confirm that cut/paste, drag, and load operations preserve node IDs. If they don't, Phase 1 has a hidden hole — we'd be saving stable names by hash of an unstable input. This audit is a prerequisite substep of Step 1.3.

**Risk 4: Label application on resource types that don't support labels.** GCP forwarding rules and a few other types don't accept labels. For now, skip label application for those types with a TODO. A proper fix lives in Phase 1.5 (metadata stored in ICE's own DB, not GCP labels) if that turns out to matter.

## Post-mortem

_To be filled in after Phase 1 ships._

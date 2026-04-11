# Phase 7 — Real Drift Detection

**Effort:** 3–4 engineer-days
**Dependencies:** Phase 1 (standard labels for querying), Phase 2 (block UI for drift visualization)
**Issues addressed:** P7-1 through P7-6

## Overview

Phase 7 replaces the current `checkDrift` — which lies by comparing canvas state against ICE's own stored results — with a real drift detector that queries GCP directly for each managed resource and compares actual state to desired state.

This is the one phase that can be postponed without breaking other phases, but it's also the phase where the current behavior is most actively misleading to users. Schedule it after the core phases land but before the drift feature is promoted anywhere in the UI.

## Why the current state is wrong

Today, `checkDrift` in `services/deploy/src/services/deploy.service.ts:908-1002` loads the last successful deployment's stored `results` and compares them against the current canvas. If someone deletes a bucket in the GCP console, `checkDrift` still reports `in_sync` because the stored record still shows it as deployed.

The name "drift detection" implies we catch drift between the stored desired state and the real cloud state. The current implementation catches drift between two snapshots ICE itself wrote. It's self-referential.

## Steps

### Step 7.1 — Define the describe interface

**Closes:** P7-1 (infrastructure)
**File:** New `packages/core/src/deploy/providers/gcp/describe.ts`, extensions to `packages/core/src/deploy/providers/gcp/types.ts`

Add a `describe` method to the handler interface:

```ts
export interface GCPResourceHandler {
  create(...): Promise<ResourceDeployResult>;
  update(...): Promise<ResourceDeployResult>;
  delete(...): Promise<ResourceDeployResult>;
  describe?(name: string, providerId: string, ctx: GCPHandlerContext): Promise<ResourceDescribeResult>;
}

export interface ResourceDescribeResult {
  exists: boolean;
  /** Raw GCP resource JSON */
  raw?: unknown;
  /** Normalized properties comparable with the desired graph */
  properties?: Record<string, unknown>;
  error?: string;
}
```

**Acceptance:**
- Interface added, handlers that don't implement it are flagged as "drift not supported"

### Step 7.2 — Implement describe for each handler

**Closes:** P7-1
**Files:** Every file in `packages/core/src/deploy/providers/gcp/handlers/`

For each resource type, implement `describe`:

- `storage-bucket.ts` → `GET /storage/v1/b/{bucket}`
- `cloud-run.ts` → `GET /v2/projects/{p}/locations/{r}/services/{n}`
- `cloud-sql.ts` → `GET /sql/v1beta4/projects/{p}/instances/{n}`
- `compute-load-balancer.ts` → `GET` forwarding rule + its backing resources
- Every other handler type

Each describe returns the raw GCP resource plus a normalized property bag that matches the shape the create method consumes. Normalization is important — GCP returns more fields than we set, so we need to project down to the fields we actually manage.

A 404 from GCP means the resource was deleted externally. Return `{ exists: false }`.

**Acceptance:**
- Unit test per handler: describe on an existing resource returns normalized properties
- Describe on a deleted resource returns `{ exists: false }`
- Describe on a permission error throws with a clear message

### Step 7.3 — New drift service

**Closes:** P7-1, P7-2
**File:** New `services/deploy/src/services/drift.service.ts` (or replace the existing `checkDrift`)

```ts
export async function checkDrift(args: {
  cardId: string;
  environment: string;
  orgId: string;
  canvasNodes: CanvasNode[];
}): Promise<DriftReport> {
  // 1. Load the resource mapping (Phase 1)
  const mapping = await getResourceMap(cardId, environment);
  // 2. For each mapped resource, describe it in GCP
  const descriptions = await Promise.all(
    [...mapping.entries()].map(async ([nodeId, info]) => {
      const handler = getHandler(info.type);
      if (!handler?.describe) return { nodeId, status: 'unsupported' };
      try {
        const desc = await handler.describe(info.name, info.provider_id || info.name, ctx);
        return { nodeId, info, desc };
      } catch (err) {
        return { nodeId, info, error: err };
      }
    })
  );
  // 3. Translate the canvas to get desired state
  const desired = translate_card_to_graph({ ... });
  // 4. Compare each mapped node: desired vs actual
  const drifts: NodeDrift[] = [];
  for (const entry of descriptions) {
    if (entry.desc?.exists === false) {
      drifts.push({ nodeId: entry.nodeId, status: 'missing', changes: [] });
      continue;
    }
    // Find corresponding desired node
    const desiredNode = desired.deployables.find(d => d.node_id === entry.nodeId);
    if (!desiredNode) {
      drifts.push({ nodeId: entry.nodeId, status: 'extra', changes: [] });
      continue;
    }
    // Compare properties
    const changes = diffProperties(desiredNode.properties, entry.desc.properties);
    drifts.push({
      nodeId: entry.nodeId,
      status: changes.length > 0 ? 'drifted' : 'in_sync',
      changes,
    });
  }
  // 5. Find canvas nodes with no mapping (new, never-deployed)
  for (const node of canvasNodes) {
    if (!mapping.has(node.id)) {
      drifts.push({ nodeId: node.id, status: 'new', changes: [] });
    }
  }
  return { drifts, checkedAt: new Date().toISOString() };
}
```

**Acceptance:**
- Drift detects resources deleted in GCP console
- Drift detects property changes made outside ICE
- Drift detects new canvas nodes not yet deployed
- Drift returns consistent results for unchanged state

### Step 7.4 — Canvas block drift visualization

**Closes:** P7-4
**Files:** Canvas block renderer, `packages/ui/src/store/slices/cards-slice.ts`

Add drift status to node data (reuse the `deploy_status` field from Phase 2 with the `'drifted'` value, plus a separate `drift_details`):

```ts
interface NodeData {
  // ...from Phase 2
  deploy_status?: 'idle' | 'planning' | 'deploying' | 'active' | 'error' | 'drifted' | 'destroying';
  drift_details?: {
    kind: 'drifted' | 'missing' | 'extra';
    changes: Array<{ path: string; desired: unknown; actual: unknown }>;
    detectedAt: string;
  };
}
```

Block renders an amber warning triangle when drifted. Click to see the drift details in the properties panel.

**Acceptance:**
- Drifted blocks show warning indicator
- Click reveals property-level drift details
- Resolving drift (accepting or resetting) clears the indicator

### Step 7.5 — Drift UI in properties panel

**Closes:** P7-3, P7-5
**File:** `packages/ui/src/features/deploy/components/properties-panel.tsx:183-287`

Refine the existing drift panel:

- Show when drift was last detected (timestamp)
- List each drifted property with a diff view (before/after)
- "Accept drift" button: update canvas node data to match actual GCP state
- "Reset drift" button: re-apply canvas state to GCP (triggers a targeted update)
- "Refresh drift" button: re-run the check immediately

**Acceptance:**
- Property-level drift rendered clearly
- Accept action updates node data to match GCP
- Reset action triggers a deploy to push canvas state to GCP
- Refresh reruns the check on demand

### Step 7.6 — Automatic drift refresh on panel open

**Closes:** P7-3
**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx` or `properties-panel.tsx`

When the deploy panel or properties panel opens for a deployed card, trigger a drift check in the background. Show a subtle loading state while it runs. Cache the result for 5 minutes to avoid hammering GCP on rapid panel open/close.

**Acceptance:**
- Opening the panel after external changes shows drift within a few seconds
- Repeatedly opening the panel uses cached results
- Manual refresh bypasses cache

### Step 7.7 — Scale property comparison across resource types

**Closes:** P7-6
**File:** New `packages/core/src/deploy/drift-comparator.ts`

The current ad-hoc comparison doesn't scale. Build a comparator that handles:

- Path-based diffs (`storage_class`, `labels.environment`, `backend.services[0].weight`)
- Type coercion (GCP returns strings for numbers sometimes)
- Ignore lists (fields that ICE doesn't manage, like `created_time`)
- Resource-type-specific normalization

Register a comparator per resource type:

```ts
interface DriftComparator {
  normalize: (raw: unknown) => Record<string, unknown>;
  ignore: string[];  // property paths to skip
  compare: (desired: any, actual: any) => DriftChange[];
}
```

Default comparator handles 80% of cases. Resource-specific overrides for buckets, Cloud Run, and SQL where normalization is tricky.

**Acceptance:**
- Unit tests for each resource type's comparator
- Ignored fields don't show as drift
- Type coercion doesn't produce false positives

### Step 7.8 — Background drift polling (optional)

**Closes:** P7-3
**File:** New `services/deploy/src/services/drift-poller.ts`

Optional: add a background poller that checks drift for all deployed cards on a slow interval (e.g., once per hour). Results stored in the database, surfaced in the UI when the user opens a card.

This is the nice-to-have. It can be behind a feature flag initially and turned on for early users.

**Acceptance:**
- Poller respects rate limits
- Results persist to DB
- UI shows "last drift check: X minutes ago" without forcing a new check

## Cross-cutting acceptance

1. Deploy a static site. Verify drift check shows `in_sync`.
2. Manually delete the bucket in the GCP console. Open the card, check drift: shows `missing`. Block has warning indicator.
3. Manually change the bucket's storage class in GCP. Check drift: shows `drifted` with the property change. Block has warning.
4. Click "Accept drift" on the storage class change. Canvas updates to match GCP. Drift cleared.
5. Click "Reset drift" instead. Deploy triggered, GCP updated to match canvas. Drift cleared.
6. Manually recreate the bucket in the GCP console with the same name. Drift shows `in_sync` again.

## Risks

**Risk 1: Describe calls multiply API quota usage.** Mitigation: parallel calls with a concurrency limit, caching, and the optional background poll is disabled by default.

**Risk 2: Property normalization has edge cases.** Mitigation: start with coarse comparison, refine per resource type as users report false positives. Unit test coverage is load-bearing.

**Risk 3: Drift check is slow for large cards.** Mitigation: parallel execution, cache, and display partial results as they come in rather than waiting for everything.

**Risk 4: Labels from Phase 1 may not exist on pre-Phase-1 resources.** Mitigation: use the resource mapping table as primary lookup, not labels. Labels are a secondary discovery mechanism for Phase 7 Step 7.9 (not in scope here).

## Post-mortem — initial landing

Shipped:
- `ResourceDescribeResult` type and optional `describe` on the `GCPResourceHandler` interface (types.ts).
- `describe` implementation for `cloud_storage_handler` and `cloud_run_handler` as proof of concept — projects each resource to the subset of fields ICE manages for comparison.
- `GCPDeployer.describe(type, name, providerId)` delegator that returns `{ exists, properties, supported }`.
- `checkDrift` rewritten in `deploy.service.ts` to: load the stable resource mapping, spin up a real deployer with the user's credentials, call `describe` per resource, compare against canvas desired state, and report `in_sync` / `drifted` / `missing` / `extra` / `unknown` per node. Gracefully falls back to stored-state comparison if the deployer can't initialize.
- `/drift-check` route now accepts `environment` and `orgId` so drift queries are environment-scoped and can authenticate against GCP.

Deferred to an incremental follow-up:
- `describe` implementations for the other handlers (SQL, GKE, Pub/Sub, Firestore, etc.) — they're additive and can be landed one at a time as users hit them. Until they have describes, their drift status shows as `unknown` which is correct and honest.
- Real-time polling / background drift checks (Step 7.8) — optional and out of critical path.
- Canvas block drift visualization beyond the existing `deploy_status: 'drifted'` color — the wire is there but a dedicated drift detail UI belongs to a follow-up UX pass.
- Property diff normalization tables per resource type (Step 7.7) — the current `JSON.stringify` comparison catches obvious drift; the refinement comes when users report false positives.

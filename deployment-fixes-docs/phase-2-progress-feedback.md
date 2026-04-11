# Phase 2 — Progress Visibility & Block Feedback

**Effort:** 2–3 engineer-days
**Dependencies:** Phase 1 (needs stable resource identity for per-node status attribution)
**Issues addressed:** P2-1 through P2-9 (see [inventory](./00-inventory.md#phase-2--progress-visibility--block-feedback))

## Overview

This phase closes the three user-reported UI blind spots: the progress bar jumps 0 → 100, the canvas blocks don't reflect deploy state or outputs, and the projects panel gives no hint that a deploy is running. It also adds background completion notifications so users can close the panel without losing awareness.

Everything in Phase 2 is downstream of Phase 1. Without stable resource identity, per-block status updates misattribute to the wrong node after a rename, and the projects panel can't reliably tell which card is deploying.

## Why the current state is bad

The backend emits a single `progress` socket event per resource: once when it starts (optional), once when it finishes. A 2-resource template ticks 0 → 99 → 100 with a one-minute silent gap in between where a GCP forwarding rule is quietly chaining four sub-operations. The user thinks the system has hung.

On the canvas side, the deploy panel dispatches `updateCardNodeData({ status: 'active' })` when a resource succeeds, but nothing reads `data.deploy_status` and nothing renders it on the block. Outputs land on the node data but are never surfaced visually. There's no GCP console deep-link. The projects panel is a flat list that doesn't know what the deploy slice is doing.

## Steps

### Step 2.1 — Extend the progress event schema to carry sub-steps

**Closes:** P2-1, P2-9
**Files:** `packages/core/src/deploy/types.ts`, `packages/shared/src/events.ts` (or wherever `emitDeployProgress` lives)

Change the progress event payload:

```ts
interface DeployProgressEvent {
  type: 'progress';
  /** Resource name as it appears in the graph */
  resource: string;
  /** What action is happening (create/update/delete) */
  action: 'create' | 'update' | 'delete';
  /** Coarse status — one event per transition */
  status: 'started' | 'step' | 'completed' | 'failed';
  /** Overall deploy progress 0-100 */
  progress: number;
  /** Optional sub-step info for long-running resources */
  step?: {
    /** Short label: 'creating backend service', 'waiting for provisioning', etc. */
    label: string;
    /** 1-indexed */
    index: number;
    total: number;
  };
  /** Optional source canvas node id */
  source_node_id?: string;
  /** Optional message for the log */
  message?: string;
}
```

The `source_node_id` field is how the UI routes this event to the right block. Phase 1 ensures this is populated reliably.

**Acceptance:**
- TypeScript shape updated, all producers and consumers compile
- Old single-field callsites still work (backwards compatible via optional fields)

### Step 2.2 — Emit `started` events for every resource

**Closes:** P2-1
**File:** `services/deploy/src/services/deploy.service.ts:332-343` and `packages/core/src/deploy/deploy-engine.ts`

Before each resource's handler is invoked, emit a `started` progress event. Currently the engine only emits on completion; change it to emit at both ends.

The overall progress calculation should become:

```
progress = ((completed + 0.5 * inFlight) / total) * 100
```

So a 2-resource deploy shows 25% when one is in flight, 50% when one is done and one is in flight, 75% when one is done and the second has started its final step, 100% when both are done. It's not scientific but it's a much better vibe than 0-then-99.

**Acceptance:**
- Deploy a 2-resource template. Progress bar shows intermediate values, not just 0 and 100.
- Log shows `started` and `completed` events for each resource.

### Step 2.3 — Emit sub-step events from multi-step handlers

**Closes:** P2-5
**File:** `packages/core/src/deploy/providers/gcp/handlers/load-balancer.ts` (primary target), then extend to other multi-step handlers

The load balancer handler currently chains 4 sub-operations (`backendService`, `urlMap`, `targetProxy`, `forwardingRule`). After each one, call a helper that emits a `step` event:

```ts
const ctxEmit = (label: string, index: number, total: number) => {
  ctx.on_progress?.(name, 'create', 'step', {
    step: { label, index, total },
  });
};

// Step 1
ctxEmit('creating backend service', 1, 4);
const backendOp = await ctx.rest_client.post(...);
// Step 2
ctxEmit('creating url map', 2, 4);
const urlMapOp = await ctx.rest_client.post(...);
// ...
```

Apply the same pattern to:
- `handlers/cloud-sql.ts` (instance create, db create, user create)
- `handlers/cloud-run.ts` (image push if applicable, service create, revision wait)
- `handlers/gke.ts` if it exists (cluster create, node pool create)

Not every handler needs sub-steps — single-API-call handlers like `handlers/storage-bucket.ts` are fine with just `started`/`completed`.

**Acceptance:**
- Deploy a static site template (load balancer + bucket). Log shows `step` events for the 4 LB sub-operations.
- Progress bar shows fractional progress during the LB creation.

### Step 2.4 — Frontend: render sub-step info in the progress section

**Closes:** P2-1
**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx:531-547`

Replace the single-line progress display with a two-line version:

```
Deploying resources... (1 / 2)      37%
└─ ice-bucket-a3f7c2b9e1: creating backend service (2/4)
[████████░░░░░░░░░░░░░░░░] 37%
```

The top line shows the overall resource progress. The detail line shows which resource is in flight and what sub-step it's on. When the resource moves to `completed`, the detail line clears briefly and then the next resource's detail takes over.

Extend `setDeployProgress` in `deploy-slice.ts` to accept the sub-step payload:

```ts
setDeployProgress(state, action: PayloadAction<{
  progress: number;
  resource: string;
  message: string;
  step?: { label: string; index: number; total: number };
}>) {
  state.progress = action.payload.progress;
  state.currentResource = action.payload.resource;
  state.currentStep = action.payload.step;
  state.logs.push(action.payload.message);
}
```

**Acceptance:**
- During a load balancer deploy, user sees the current sub-step transition through the 4 LB operations
- Progress bar moves smoothly, not in a single jump
- Completing a resource clears the current detail line before the next resource starts

### Step 2.5 — Add `deploy_status` to canvas node data

**Closes:** P2-2
**Files:** `packages/ui/src/store/slices/cards-slice.ts`, canvas block renderer component (locate under `packages/ui/src/features/canvas/`)

Add to node data:

```ts
interface NodeData {
  // existing fields
  deploy_status?: 'idle' | 'planning' | 'deploying' | 'active' | 'error' | 'drifted' | 'destroying';
  deploy_progress?: { step_label?: string; step_index?: number; step_total?: number };
  deploy_error?: string;
  deploy_outputs?: Record<string, unknown>;
  provider_id?: string;
  last_deployed_at?: string;
}
```

The deploy panel event handler that currently dispatches `updateCardNodeData({ provider_id, status: 'active' })` should become:

```ts
if (event.type === 'progress' && event.source_node_id) {
  if (event.status === 'started') {
    dispatch(updateCardNodeData({
      nodeId: event.source_node_id,
      data: {
        deploy_status: 'deploying',
        deploy_progress: event.step ? {
          step_label: event.step.label,
          step_index: event.step.index,
          step_total: event.step.total,
        } : undefined,
      },
    }));
  } else if (event.status === 'completed') {
    dispatch(updateCardNodeData({ /* status: 'active' + outputs */ }));
  } else if (event.status === 'failed') {
    dispatch(updateCardNodeData({ /* status: 'error' + error message */ }));
  }
}
```

**Acceptance:**
- Node data contains the new fields after a deploy
- Redux devtools shows the status transitions per node
- Data persists on the node until the next deploy or manual reset

### Step 2.6 — Render status badge on canvas blocks

**Closes:** P2-2
**File:** Canvas block renderer component

Add a small status indicator in the top-right corner of every resource block:

| Status | Color | Icon | Tooltip |
|---|---|---|---|
| `idle` | gray | dot | Not deployed |
| `planning` | blue | spinner | Planning |
| `deploying` | blue | spinner | `{step.label}` if available, else "Deploying" |
| `active` | green | check | "Deployed" + last_deployed_at |
| `error` | red | x | `{deploy_error}` |
| `drifted` | amber | triangle | "Drift detected" (filled in by Phase 7) |
| `destroying` | orange | spinner | "Destroying" |

Status colors should match the existing `StatusBadge` component in `deploy-panel.tsx:674-717` so the two surfaces stay visually consistent.

**Acceptance:**
- Dragging a resource block shows its current status
- Deploying updates the status live
- Clicking the status shows a tooltip with details
- Color scheme is consistent with deploy panel

### Step 2.7 — Render outputs pill under block label

**Closes:** P2-3, P2-8
**Files:** Canvas block renderer, new `packages/ui/src/features/deploy/output-extractors.ts`

Create a primary-output extractor:

```ts
// Returns { label, value, url? } for the most important output of this resource type.
export function primaryOutput(
  resourceType: string,
  outputs: Record<string, unknown> | undefined,
  providerId: string | undefined,
): { label: string; value: string; url?: string } | null {
  if (!outputs && !providerId) return null;
  switch (resourceType) {
    case 'gcp.storage.bucket':
      return {
        label: 'URL',
        value: `gs://${outputs?.name || providerId}`,
        url: `https://console.cloud.google.com/storage/browser/${outputs?.name || providerId}`,
      };
    case 'gcp.run.service':
      return outputs?.url ? { label: 'URL', value: outputs.url as string, url: outputs.url as string } : null;
    case 'gcp.compute.globalForwardingRule':
      return outputs?.ip_address ? { label: 'IP', value: outputs.ip_address as string } : null;
    // ... etc
  }
  return null;
}
```

Render this as a small pill under the block label when `deploy_status === 'active'`:

```
[block icon] Static Site — Production
             └ URL: https://storage.../my-bucket ↗
```

Clicking the pill copies to clipboard; clicking the `↗` arrow opens the GCP console URL in a new tab.

**Acceptance:**
- Static site block shows `gs://...` URL after deploy
- Cloud Run block shows HTTPS URL after deploy
- Click to copy works
- Click arrow opens GCP console in new tab
- Unsupported resource types show no pill (not broken ones)

### Step 2.8 — GCP console deep-link helper

**Closes:** P2-4
**File:** New `packages/ui/src/features/deploy/gcp-console-links.ts`

```ts
export function gcpConsoleUrl(
  resourceType: string,
  providerId: string,
  project: string,
): string | null {
  switch (resourceType) {
    case 'gcp.storage.bucket':
      return `https://console.cloud.google.com/storage/browser/${encodeURIComponent(providerId)}?project=${project}`;
    case 'gcp.run.service':
      return `https://console.cloud.google.com/run/detail/${providerId}?project=${project}`;
    // ... extend per type
  }
  return null;
}
```

Used by the outputs pill and also by a new "Open in GCP Console" menu item when right-clicking a deployed block.

**Acceptance:**
- Every type with a handler has a console URL mapping
- URLs open to the correct resource page
- Unknown types return null gracefully

### Step 2.9 — Projects panel deploy indicator

**Closes:** P2-6
**Files:** `packages/ui/src/features/projects/` panel component, reuses Phase 5's per-card deploy state

For this phase, build a minimal version of the multi-tenant deploy state (Phase 5 hardens it): a Redux `deploysByCardId: Record<string, { status: DeployStatus; progress: number }>` map. On every progress/completion event, write into that map keyed by card id.

In the projects panel list item:

```tsx
function ProjectListItem({ project }: { project: Project }) {
  const deploys = useSelector((s: RootState) => s.deploy.deploysByCardId);
  const inFlight = project.cards
    .filter(c => deploys[c.id]?.status === 'deploying' || deploys[c.id]?.status === 'planning')
    .length;
  return (
    <div>
      <span>{project.name}</span>
      {inFlight > 0 && <Spinner /> /* "deploying X cards" */}
    </div>
  );
}
```

**Acceptance:**
- Start a deploy on card A. Projects panel shows spinner next to the parent project.
- Start a second deploy on card B in a different project. Both projects show spinners.
- Deploys complete → spinners go away.

### Step 2.10 — Background completion notification

**Closes:** P2-7
**Files:** New `packages/ui/src/features/deploy/completion-notifier.ts`, hook into the global app shell

When a deploy that the user initiated transitions to `success` / `failed` / `partial`, show a toast:

```
✓ Static Site — Production deployed in 1m 47s
  View details →
```

Clicking the toast opens the deploy panel for that card.

For long deploys (> 2 minutes), also request Browser Notification permission the first time and fire a system notification when done:

```ts
if (deploymentDurationMs > 120_000 && 'Notification' in window) {
  if (Notification.permission === 'granted') {
    new Notification(`Deploy finished: ${cardName}`, {
      body: `${resourceCount} resources deployed in ${formatDuration(durationMs)}`,
    });
  }
}
```

Add a tab-title indicator: while a deploy is running, prefix the document title with `(Deploying) `. Clear on completion.

**Acceptance:**
- Close the deploy panel mid-deploy, get a toast when it finishes
- System notification fires for deploys > 2 min (if permission granted)
- Tab title shows `(Deploying)` prefix

## Cross-cutting acceptance

1. Deploy a static site card to dev. Watch progress bar move smoothly from 0 to 100%. Watch block status transition idle → deploying → active. See URL pill appear. Click pill to copy. Click arrow to open GCP console.
2. Start same deploy, close the panel, navigate to projects view. See spinner on the card's project. Wait for completion, see toast + system notification.
3. Deploy a load balancer template. During LB creation, progress bar shows fractional progress; detail line shows sub-steps (creating backend service → creating url map → creating target proxy → creating forwarding rule).
4. Rename a block, redeploy (with Phase 1 installed). Block correctly attributes the status to the renamed block, not to a fresh one.

## Risks

**Risk 1: Sub-step events double-emit or emit out of order.** Mitigation: structured logging at the emit site + at the UI consumer. Add a development-only assertion that `step.index <= step.total` and monotonically increases within a resource.

**Risk 2: Browser Notification API is not supported or denied.** Mitigation: feature-detect and silently fall back to the in-app toast. Never block on notification permission.

**Risk 3: Canvas block rendering becomes expensive if every progress event triggers a re-render.** Mitigation: memoize the block component on `deploy_status` + `deploy_progress.step_index` + `provider_id`. Throttle the step event dispatch on the backend side to one per second max.

**Risk 4: Attribution mismatch if Phase 1 hasn't fully landed.** Mitigation: Phase 2 must not ship before Phase 1. Document this in the PR description.

## Post-mortem

_To be filled in after Phase 2 ships._

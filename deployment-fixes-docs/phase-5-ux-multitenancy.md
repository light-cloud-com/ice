# Phase 5 — Deploy UX & Multi-tenancy

**Effort:** 2–3 engineer-days
**Dependencies:** Phase 2 (uses block status for projects indicator), Phase 4 (reuses requirement signals)
**Issues addressed:** P5-1 through P5-13

## Overview

Phase 5 hardens the deploy slice from single-panel to multi-card, adds cancellation, replaces the browser `confirm()` modal, adds a proper history surface, and closes the "retry failed only" UX gap. Most of this is frontend work that refines what Phases 2–4 establish.

## Steps

### Step 5.1 — Multi-tenant deploy state

**Closes:** P5-1, P5-10
**File:** `packages/ui/src/store/slices/deploy-slice.ts`

Restructure the slice from a single active deploy to a keyed map:

```ts
interface DeployState {
  // Global settings (persist across cards)
  defaults: { provider, gcpProject, region, environment };
  // Per-card deploy instances
  byCardId: Record<string, DeployInstanceState>;
  // Which card is currently being viewed in the deploy panel
  activeCardId?: string;
}

interface DeployInstanceState {
  status: DeployStatus;
  plan: DeployPlan | null;
  progress: number;
  currentResource: string;
  currentStep?: { label: string; index: number; total: number };
  logs: string[];
  results: DeployResourceResult[];
  error: string | null;
  deployedResources: DeployedResource[];
  history: DeployRecord[];
  environment: string;  // per-card environment memory
  // ...
}
```

Add selectors:
- `selectActiveDeploy(state)` → returns `state.byCardId[state.activeCardId] ?? emptyDeploy`
- `selectDeployForCard(cardId)` → returns `state.byCardId[cardId]`
- `selectAnyDeploying(state)` → returns `Object.keys(state.byCardId).filter(id => state.byCardId[id].status === 'deploying')`

Existing deploy panel code mostly reads through `selectActiveDeploy` — point it at the new selector and the single-panel code keeps working.

**Acceptance:**
- Two cards can have independent deploy states simultaneously
- Switching cards preserves each card's environment selection
- Selectors are memoized (no performance regression)

### Step 5.2 — Per-card environment memory

**Closes:** P5-10
**File:** `packages/ui/src/store/slices/deploy-slice.ts`

Move environment, region, and gcpProject from global state into the per-card `DeployInstanceState`. Initialize from user defaults the first time a card is opened, but let per-card overrides stick.

Persist per-card settings to localStorage (keyed by card id) so they survive page reloads.

**Acceptance:**
- Set card A to production, card B to development. Switch between them and settings stick.
- Reload the app — per-card settings restored.

### Step 5.3 — Deploy cancellation

**Closes:** P5-2
**Files:** `services/deploy/src/services/deploy.service.ts`, new `/api/canvas/deploy/cancel/:cardId` route, `packages/ui/src/features/deploy/components/deploy-panel.tsx`

Backend: track an `AbortController` per in-flight deploy (keyed by card id, reuses Phase 0's lock map). The cancel endpoint aborts the controller. Inside `deploy_graph`, check the signal between each resource:

```ts
for (const node of sortedNodes) {
  if (signal.aborted) {
    // Mark remaining as 'cancelled', write partial results, break
    break;
  }
  // ... deploy node
}
```

We can't cancel mid-resource safely (a half-created Cloud SQL instance is worse than a done one). Cancelling between resources is good enough.

Frontend: replace the disabled "Reset" button with a "Stop" button that's only enabled during `deploying`. On click, POST to the cancel endpoint, show a "cancelling..." state, wait for the deploy to wind down.

**Acceptance:**
- Click Stop during a 3-resource deploy after resource 1 completes. Resources 2 and 3 are not attempted. Deploy status = 'cancelled', results show resource 1 as successful.
- Cancel on an already-completed deploy is a no-op.
- Backend lock is released correctly after cancellation.

### Step 5.4 — In-app destroy confirmation modal

**Closes:** P5-3
**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx:623-644`

Replace the browser `confirm()` with an in-panel modal listing the resources to be destroyed:

```
┌─ Destroy deployment? ─────────────────┐
│ This will permanently delete:         │
│                                       │
│ • ice-bucket-a3f7c2b9e1               │
│   gcp.storage.bucket                  │
│ • ice-forwardingrule-b4e8d3f1a2       │
│   gcp.compute.globalForwardingRule    │
│                                       │
│ ⚠ This cannot be undone.              │
│                                       │
│ Type the card name to confirm:        │
│ [                                   ] │
│                                       │
│ [Cancel]   [Destroy]                  │
└───────────────────────────────────────┘
```

Requires typing the card name to enable the Destroy button. This is deliberately high-friction for destructive actions.

**Acceptance:**
- Destroy button opens modal, not browser confirm
- Modal lists every resource by name and type
- Destroy button disabled until card name is typed correctly
- Escape / Cancel closes without destroying

### Step 5.5 — Deploy button disabled tooltip

**Closes:** P5-4
**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx:596-602`

When the Deploy button is disabled, hover shows a tooltip explaining why. Sources of disable:

- No GCP project selected → "Select a GCP project to continue"
- No resources on canvas → "Add at least one resource block to deploy"
- Deploy in progress → "Deploy in progress, stop it first"
- Plan in progress → "Waiting for plan to finish"
- Preflight errors present → "Fix preflight errors first (see above)"

The button's `title` attribute is the minimum; a proper hover tooltip component is nicer.

**Acceptance:**
- Every disable reason has a clear tooltip
- Hovering the disabled button shows the reason
- Plan button has same treatment

### Step 5.6 — "Reset" rename

**Closes:** P5-5
**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx:560-566`, i18n strings

Rename the button to "Clear" or "Dismiss" and scope it to clearing the current panel view (plan, logs, results) without touching the canvas or the backend. Also add a confirmation if there's an unsaved plan the user is about to lose.

**Acceptance:**
- Button label reflects what it actually does
- Clearing with no unsaved state: instant
- Clearing with a plan ready: confirmation

### Step 5.7 — Deploy history view

**Closes:** P5-6, P5-7, P5-8
**Files:** `packages/ui/src/features/deploy/components/deploy-panel.tsx`, new `deploy-history-panel.tsx`

Add a "History" tab to the deploy panel. Lists past deploys for the current card pulled from the backend (`/api/canvas/deploy/history/:cardId`), not just Redux.

Each row shows:
- Timestamp
- Action type (create / update / destroy / rollback)
- Environment
- Status (success / partial / failed)
- Duration
- Resource count summary ("3 created, 1 updated, 2 deleted")

Click a row to expand: shows the full resource list with statuses and the plan that was applied. Also a "Roll back to this" action (wiring to existing `rollbackDeployment`).

**Acceptance:**
- History tab shows all deploys for the current card
- Create/update/destroy/rollback distinguished
- Expanding a row shows resource details
- Rollback action works

### Step 5.8 — Retry-failed-only

**Closes:** P5-9
**Files:** `services/deploy/src/services/deploy.service.ts`, `packages/ui/src/features/deploy/components/deploy-panel.tsx`

After a partial failure, the user sees a "Retry failed resources" button in the results section. Clicking it calls a new `/api/canvas/deploy/retry-failed` endpoint that:

1. Loads the last deployment record for the card
2. Filters `results.resources` to the ones that failed
3. Finds their `source_node_id`s
4. Builds a sub-plan containing only those nodes and their dependencies
5. Runs apply on the sub-plan

Because Phase 1 gives us stable names, the retry won't duplicate already-successful resources.

**Acceptance:**
- Simulate a 3-resource deploy where resource 2 fails
- Click "Retry failed resources"
- Only resource 2 is re-attempted; resources 1 and 3 are untouched
- On retry success, the overall deployment status updates to `success`

### Step 5.9 — Destroy partial-failure UX

**Closes:** P5-13
**Files:** `services/deploy/src/services/deploy.service.ts`, `packages/ui/src/features/deploy/components/deploy-panel.tsx`

Change destroy to track per-resource status and return a structured result:

```ts
{
  success: false,  // true only if all deletes succeeded
  resources: [
    { name, type, success: true },
    { name, type, success: false, error: '...' },
  ],
  summary: { total, deleted, failed },
}
```

UI: show the partial result clearly ("Destroyed 3 of 4 resources") with a list of failures. Add a "Retry destroy" action that re-runs destroy only on the still-present resources.

Also: destroy with `continue_on_error: true` (we already do this) but now the UI clearly communicates what happened.

**Acceptance:**
- 3 of 4 destroys succeed, 1 fails. UI shows "Destroyed 3/4, 1 failed" with the failure reason.
- Retry destroy only targets the remaining resource.
- After all resources are destroyed, the card shows as idle.

### Step 5.10 — Project list caching

**Closes:** P5-12
**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx:751-771`

Cache `getApi().provider.getProjects(provider)` results in Redux with a 5-minute TTL. Refresh on explicit user action (refresh button in the dropdown).

**Acceptance:**
- First provider selection fetches projects
- Re-opening the panel within 5 minutes uses cached list
- Manual refresh clears the cache

### Step 5.11 — "Save without deploy" affordance

**Closes:** P5-11
**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx`

Add an explicit "Save Plan" button that persists the current plan to `canvasDeployment.plan` with status `'saved'` (new status value) without applying. Useful for drafting architectures across sessions.

Saved plans show in the history view. The user can apply them later via a "Apply saved plan" action.

Alternative simpler version: canvas state is already persisted to the card. The "save without deploy" friction point is really about preserving the preflight-validated plan, not the canvas itself. So scope this down to "persist the planned translation" without needing a new status.

**Acceptance:**
- Save Plan stores the plan without hitting GCP
- Saved plan shows in history
- Later, can apply it directly

## Cross-cutting acceptance

1. Open two cards in different projects. Deploy card A. While it's running, open card B and start a plan for it. Both show in respective projects' indicators. Cancel card A — card B unaffected.
2. Destroy card A via the new modal. Confirm the card name is required. Observe resources deleted in reverse order.
3. On a partial deploy, click Retry Failed. Only failed resources are re-attempted.
4. Switch between cards, verify environments are remembered per card.
5. Close the browser, reopen, verify per-card state persists where expected.

## Risks

**Risk 1: Multi-tenant state refactor touches many files.** Mitigation: introduce selectors first, point existing code at them, then change the underlying shape. This minimizes the diff surface.

**Risk 2: Cancellation mid-deploy leaves partial state.** Mitigation: only cancel between resources, clearly mark cancelled deploys as `'cancelled'` (new status), surface the partial success in the UI.

**Risk 3: Destroy partial failure retry runs into missing mappings.** Mitigation: the mapping is updated transactionally with each successful delete; Phase 1's mapping table is the source of truth.

## Post-mortem — initial landing

Shipped:
- Deploy cancellation end-to-end: `cancelDeploy()` in `deploy-locks.ts`, `requestDeployCancel()` public wrapper in `deploy.service.ts`, `POST /api/canvas/deploy/cancel` route, and a Stop button in the deploy panel footer that appears only during `status === 'deploying'`.
- The lock helper `acquireDeployLock` now returns `{ release, signal }` so the deploy body can check the signal between resources.
- Disabled-button tooltips on Plan and Deploy buttons (Step 5.5) — every disable path has a human-readable reason.
- In-panel destroy confirmation modal (`DestroyConfirmModal`) that lists every resource and requires typing the card name to unlock the red button. Replaces the old `window.confirm()` and is keyboard-accessible (Esc cancels).

Deferred to a follow-up UX pass:
- Multi-tenant deploy state refactor (Step 5.1). The existing single-card state still works for the current flow; moving to per-card state is a Redux shape change that touches a lot of selectors and is better done alongside the projects panel indicator (also deferred).
- Retry-failed-only (Step 5.8). Needs a dedicated backend endpoint that filters a sub-plan from the last results; stable resource identity from Phase 1 makes this safe to build when the user asks for it.
- Deploy history view in the deploy panel (Steps 5.7–5.8).
- Project list caching (Step 5.10) and per-card environment memory (Step 5.2). Both are Redux shape changes best done with the multi-tenant refactor.

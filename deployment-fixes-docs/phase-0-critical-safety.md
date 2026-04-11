# Phase 0 — Critical Safety & Concurrency

**Effort:** 1–2 engineer-days
**Dependencies:** None. Must land before any other phase.
**Issues addressed:** P0-1 through P0-9 (see [inventory](./00-inventory.md#phase-0--critical-safety--concurrency))

## Overview

Phase 0 closes the four scariest classes of bug in the current deploy system: credential leakage, cross-deploy credential pollution, silent state corruption, and orphaned resources. None of it adds features — all of it prevents things that can legitimately cause production incidents or leak service account keys.

Ship this before anything else. Everything in Phases 1–7 assumes this is done.

## Why this is load-bearing

The current code does three independently-dangerous things at once:

1. It writes service account keys to `/tmp/ice-sa-*.json` with default file permissions (0o666), making them world-readable on any host with multiple processes.
2. It sets `process.env.GOOGLE_APPLICATION_CREDENTIALS` as a global, which means two concurrent deploys — even from the same user — can silently swap each other's credentials and deploy resources into the wrong project.
3. It has no per-card deploy lock, no cancellation, no SIGTERM cleanup, and no watchdog for stuck records. Any crash between "started deploying" and "finished" leaves the system in an unrecoverable state.

Until Phase 0 is done, everything the user is asking for is being built on a rotten foundation.

## Steps

### Step 0.1 — Restrict temp credential file permissions to 0o600

**Closes:** P0-1
**File:** `services/deploy/src/services/deploy.service.ts`

At every place that writes a temp SA key (three locations: `applyDeployment` around line 235, `destroyDeployment` around line 610, `rollbackDeployment` around line 800), change the write to use restrictive permissions.

**Before:**
```ts
fsAsync.writeFileSync(tmpPath, typeof key === 'string' ? key : JSON.stringify(parsed));
```

**After:**
```ts
fsAsync.writeFileSync(tmpPath, typeof key === 'string' ? key : JSON.stringify(parsed), { mode: 0o600 });
```

Also replace `path.join(os.tmpdir(), 'ice-sa-...')` with `fs.mkdtempSync(path.join(os.tmpdir(), 'ice-deploy-'))` so each deploy gets its own directory with mode 0o700, and the key file lives inside it. The directory approach makes cleanup simpler and prevents cross-deploy directory enumeration.

**Acceptance:**
- `stat /tmp/ice-deploy-*/sa.json` shows `0600`
- `stat /tmp/ice-deploy-*` shows `0700`
- Existing behavior preserved: deploy still succeeds with valid key

### Step 0.2 — Stop using `process.env.GOOGLE_APPLICATION_CREDENTIALS` as a global

**Closes:** P0-2
**Files:** `services/deploy/src/services/deploy.service.ts`, any GCP SDK client construction in handlers

The root problem is that two concurrent deploys share process.env. Fix by scoping credentials to the auth client passed through the deploy context, not the environment.

1. In `applyDeployment` / `destroyDeployment` / `rollbackDeployment`: construct the `GoogleAuth` client from the parsed key directly (we already do this). Do NOT set `process.env.GOOGLE_APPLICATION_CREDENTIALS` anywhere.
2. Audit every GCP SDK client instantiation under `packages/core/src/deploy/providers/gcp/` and ensure each accepts an `authClient` parameter. For any that currently rely on ADC (Application Default Credentials), wire them to receive the scoped client from `ctx.rest_client` or `ctx.auth_client`.
3. If any handler legitimately cannot be fixed to receive the client (legacy SDK path), wrap it with a mutex so only one deploy can hold the env var at a time — but this should be an exception, not the rule.

**Acceptance:**
- Run two deploys in parallel (different cards, different GCP projects). Log the env var at start and end of each. The env var should never be set to a real path.
- All existing deploys still authenticate successfully.
- Remove the lines that currently touch `process.env.GOOGLE_APPLICATION_CREDENTIALS` — grep should return zero matches in deploy.service.ts when done.

### Step 0.3 — Per-card deploy lock

**Closes:** P0-3
**Files:** `services/deploy/src/services/deploy.service.ts`, new `services/deploy/src/services/deploy-locks.ts`

Introduce an in-memory `Map<cardId, Promise<void>>` that tracks in-flight deploys. Before starting a new deploy, check the map:

- If there's already a promise for this card, reject the new request with `{ success: false, error: 'Deploy already in progress', code: 'DEPLOY_IN_FLIGHT' }`.
- Otherwise register the promise, run the deploy, and clear the entry in a `finally`.

In-memory is fine for now because ICE runs as a single gateway process. If we ever scale horizontally, the lock should move to Redis with a TTL.

Also apply the same lock to `destroyDeployment` — two destroys of the same card racing each other is just as bad as two deploys.

Apply a separate lock for plan (short-lived, doesn't touch cloud state).

**Acceptance:**
- Click Deploy twice quickly on the same card. Second call returns a `DEPLOY_IN_FLIGHT` error immediately, does not queue.
- Two different cards can still deploy in parallel.
- Lock is released if the deploy throws, times out, or succeeds.

### Step 0.4 — Dependency-ordered destroy

**Closes:** P0-4
**File:** `services/deploy/src/services/deploy.service.ts:638-665`

The destroy loop currently iterates `results.resources` in whatever order they were stored. Replace with topological order derived from the stored plan or from handler-declared dependencies.

Option A (simpler): reverse the create order from `results.resources`. This works as long as the stored order respects dependencies, which the current `deploy_graph` already guarantees via Kahn's sort.

Option B (robust): rebuild the graph from `deployment.results.resources`, run the topological sort again, reverse it, and delete in that order.

Use Option A for now — it's ~3 lines. Add a TODO for Option B if we ever store results out of order.

```ts
const resources = ((results.resources as any[]) || []).slice().reverse();
```

And continue to use `continue_on_error: true`, but track failures for the final result shape so partial destroys can be retried.

**Acceptance:**
- Deploy a load balancer stack (backend service + url map + target proxy + forwarding rule), then destroy. Verify GCP logs show deletions in reverse order: forwarding rule first, backend service last.
- Introduce a mock handler that requires reverse dep order (e.g., child references parent). Destroy succeeds where it previously left orphans.

### Step 0.5 — SIGTERM / SIGINT credential cleanup

**Closes:** P0-5
**File:** `services/deploy/src/services/deploy.service.ts`, new bootstrap hook in the gateway

The `finally` block only runs on normal completion or caught exceptions. Signal-driven shutdown bypasses it entirely.

Register process signal handlers on gateway startup:

```ts
const tempDirsInUse = new Set<string>();
export function registerTempDir(dir: string) { tempDirsInUse.add(dir); }
export function releaseTempDir(dir: string) { tempDirsInUse.delete(dir); }

function cleanupOnExit() {
  for (const dir of tempDirsInUse) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

process.on('SIGTERM', () => { cleanupOnExit(); process.exit(0); });
process.on('SIGINT', () => { cleanupOnExit(); process.exit(0); });
process.on('uncaughtException', (err) => { cleanupOnExit(); console.error(err); process.exit(1); });
```

Each deploy calls `registerTempDir(tmpPath)` when it creates the temp dir and `releaseTempDir(tmpPath)` in its own `finally`. On signal, the global cleanup deletes anything still registered.

**Acceptance:**
- Start a deploy, SIGTERM the gateway mid-deploy, check `/tmp` — no `ice-deploy-*` directories remain.
- Normal deploys still clean up via the per-deploy `finally`.

### Step 0.6 — Stuck-deploy watchdog

**Closes:** P0-6
**File:** `services/deploy/src/services/cron.service.ts`

The cron service already sweeps stuck `DeployJob` rows after 30 minutes. Add a parallel sweeper for `canvasDeployment`:

```ts
cron.schedule('*/5 * * * *', async () => {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const result = await prisma.canvasDeployment.updateMany({
    where: {
      status: 'deploying',
      created_at: { lt: thirtyMinAgo },
    },
    data: {
      status: 'failed',
      error: 'Deploy exceeded 30 minute watchdog timeout — gateway may have crashed',
    },
  });
  if (result.count > 0) {
    console.warn(`[watchdog] marked ${result.count} stuck deployments as failed`);
  }
});
```

30 minutes is long enough for legitimate long deploys (Cloud SQL, GKE). If a specific resource type routinely exceeds 30 minutes, bump the threshold for that resource type after Phase 3 ships.

**Acceptance:**
- Insert a fake `canvasDeployment` row with `status: 'deploying'` and `created_at: 35 min ago`. Wait for next cron tick. Row is updated to `status: 'failed'`.
- Normal in-flight deploys are not touched.

### Step 0.7 — Topological sort cycle detection

**Closes:** P0-7
**File:** `packages/core/src/deploy/deploy-engine.ts:231-290`

Kahn's algorithm silently drops nodes that remain with `in_degree > 0`. Add a post-sort assertion:

```ts
if (sorted.length !== nodes.size) {
  const stranded = [...nodes.keys()].filter(k => !sorted.find(s => s.name === k));
  throw new Error(
    `Cycle detected in deployment graph. Stranded nodes: ${stranded.join(', ')}. ` +
    `Review canvas edges to break the cycle.`
  );
}
```

Make the error propagate up through `deploy_graph` and into the API response as a `PLAN_CYCLE_DETECTED` error code. In the UI (not this phase), this becomes a preflight warning.

**Acceptance:**
- Construct a two-node graph where A depends on B and B depends on A. Call `deploy_graph`. Receives an error naming both nodes.
- Linear graphs still deploy successfully.

### Step 0.8 — Standardized operation timeout wrapper

**Closes:** P0-8 (partial — full retry work is in Phase 3)
**Files:** New `packages/core/src/deploy/providers/gcp/wait-for-op.ts`, updates to handlers

Replace each handler's bespoke `wait_for_compute_op` with a single helper that takes:

- `operation_name`
- `max_wait_ms` (default: 15 minutes for compute, overridable per-call)
- `poll_interval_ms` (default: 3s)
- `on_progress?: (elapsed_ms: number) => void` — optional callback for Phase 2

Handlers that currently have hardcoded 120s timeouts get bumped to 15 minutes, because 120s is the wrong default for real GCP ops. Cloud SQL keeps its 15 min. A future Phase 3 step will add per-resource-type retry policies on top.

For non-compute APIs (Run, Storage, etc.), expose equivalent helpers.

**Acceptance:**
- Delete the duplicate `wait_for_compute_op` functions across handler files; only one remains.
- Deploy a resource that takes 3 minutes — no spurious timeout.
- Deploy a long SQL instance — still succeeds.

### Step 0.9 — Minor: zero SA key string after use

**Closes:** P0-9
**File:** `services/deploy/src/services/deploy.service.ts:240-267`

Defense in depth only. After parsing and writing the key, null the local reference:

```ts
// After writing and before JSON stringify of parsed is done being used
const parsed = typeof key === 'string' ? JSON.parse(key) : key;
// ...use parsed...
// When done:
for (const k of Object.keys(parsed)) parsed[k] = undefined;
key = null as any;
```

Won't help against a memory dump during the critical window, but at least doesn't keep the string alive until GC.

**Acceptance:**
- Code review confirms no reference retained after use.
- Deploy behavior unchanged.

## Cross-cutting acceptance

After all steps land, run this scripted test:

1. Start gateway with `LOG_LEVEL=debug`.
2. Kick off two concurrent deploys on different cards to different GCP projects. Observe no credential swap, both succeed, both clean up their temp dirs.
3. Kick off two rapid deploys on the same card. Second returns `DEPLOY_IN_FLIGHT`.
4. Deploy then immediately destroy a load balancer stack. Verify reverse-order deletion and no orphans.
5. SIGTERM gateway mid-deploy, restart, check `/tmp` is clean.
6. Insert a stuck deploy row manually, wait for watchdog cron, confirm it transitions to failed.
7. Construct a cyclic canvas, click Plan — error surfaces with named nodes.

## Risks

**Risk 1: Removing `process.env.GOOGLE_APPLICATION_CREDENTIALS` breaks a handler that silently depends on ADC.** Mitigation: grep the entire `packages/core` tree for `GoogleAuth`, `ADC`, `applicationDefault`, and `getApplicationDefault`. Any hits that don't accept an explicit client are candidates for breakage. The audit is part of Step 0.2.

**Risk 2: The per-card lock might reject legitimate concurrent operations.** Mitigation: scope the lock key to `{cardId}:{operation}` so Plan and Apply on the same card don't collide with each other. Only Apply-Apply and Destroy-Destroy should collide.

**Risk 3: The watchdog marks a legitimate long deploy as failed.** Mitigation: 30 minutes is well above the P99 deploy time in the current codebase. When Phase 3 ships per-resource retry and longer timeouts, revisit the watchdog threshold.

**Risk 4: Signal handlers might interfere with existing process lifecycle.** Mitigation: check if the gateway already registers SIGTERM. If so, chain cleanup into the existing handler rather than replacing it. Use `process.once` not `process.on` to avoid accumulating handlers across hot reloads in dev.

## Post-mortem

_To be filled in after Phase 0 ships. Document what took longer than expected, what needed to be scoped differently, and anything that should be propagated back to Phase 1 or later phases._

# Decisions log

Append-only log of architectural and process decisions for the multi-agent ICE workflow.

**Rules**

- New decisions: append a dated entry. Never edit past entries.
- Supersede an old decision by adding a new entry that references it under "Related".
- The only allowed edit to a past entry elsewhere in `.claude/state/` is appending a `_Promoted to: /docs/<path>_` line on a learning that's been promoted. That rule does not apply to entries in this file — `decisions.md` entries are never edited.

---

## 2026-04-27 — Adopt persistent state system

**Context.** The multi-agent ICE workflow (planner, implementer, critic, ux-tester) needs cross-session memory. Without it, each agent starts cold and re-derives the same conclusions, the orchestrator can't see what's in flight, and post-mortem learnings vanish at the end of a session.

**Decision.** Adopt a three-file markdown state system under `.claude/state/`:

- `decisions.md` — append-only log of architectural and process choices.
- `progress.md` — living document, owned exclusively by the orchestrator (main session).
- `learnings.md` — append-only log of non-obvious gotchas and patterns.

State files live in `.claude/state/` (agent-managed operational state) and are cross-linked from `/docs/agents.md` (human entry point). Stabilized learnings — cited 3+ times or generalizing beyond one unit — get promoted into `/docs` as proper documentation, and the original learning entry is annotated with a `_Promoted to:_` back-reference.

**Alternatives considered.**

- *Single `state.json`.* Rejected. Markdown reads well in diffs, tolerates partial writes, and surfaces in `git blame`. JSON encourages whole-file overwrites; we want append-only.
- *Per-agent memory frontmatter inside each `.claude/agents/*.md`.* Rejected. Couples state to the agent definition (so editing an agent's role would churn its memory), prevents cross-agent reads (the critic should see what the implementer learned), and fragments the orchestrator's view.
- *State in `/docs/state/`.* Rejected. `/docs` is human-authored documentation that ships with the repo; mixing agent-managed operational state into it muddies that contract. We cross-link from `/docs/agents.md` instead of co-locating.

**Consequences.**

- Every agent reads `decisions.md` and `learnings.md` before acting (see learning `read-state-first`).
- The orchestrator owns `progress.md` exclusively. Subagents never write to it.
- Quarterly compaction: cluster duplicates in `learnings.md`, archive the prior version to `.claude/state/archive/learnings-YYYY-Qn.md`.
- Stabilized learnings get promoted to `/docs`; the original entry gets a `_Promoted to:_` line appended (the only legal post-hoc edit).

**Related.** [`/docs/agents.md`](../../docs/agents.md)

---

## 2026-04-28 — Parallel deploy scheduler with per-node live status

**Context.** The deploy apply phase walks the topologically-sorted plan node-by-node sequentially (`packages/core/src/deploy/deploy-engine.ts:67-169`). The `parallelism: 10` field in `DeployOptions` is set in `DEFAULT_OPTIONS` but never read anywhere in the engine — sequential is the only path. Cloud SQL takes 10+ minutes per instance and Memorystore Redis 3-5 minutes; a 12-node fan-out card serializes into 30+ minutes when 15 minutes is achievable with parallelism. The UI's only progress signal is a single percentage that resets per resource, giving observers the impression that progress is going backwards. Per-handler milestone reporting exists for exactly one handler (`load-balancer.ts` via `ctx.on_step`) but the contract isn't used elsewhere.

**Decision.** Replace the sequential apply walk with a bounded worker-pool scheduler over the per-node DAG.

1. **Pool size default 6**, configurable. Per-handler caps for quota-sensitive resource types: `gcp.sql.* = 1`, `gcp.redis.* = 1` (Cloud SQL has a 1-create-per-project-per-minute soft quota and IP-range allocation that fails when two creates race; same for Memorystore Redis).
2. **Failure isolation:** a node failing cancels only its descendants; siblings and unrelated branches continue. The existing `continue_on_error: true` callsite default is preserved.
3. **Per-node lifecycle events** (`queued | applying | succeeded | failed | skipped | cancelled-due-to-dep`) emitted over the existing `deploy:<cardId>` Socket.IO room as `node_status` / `node_progress` events.
4. **No backwards-compat window for the legacy `type: 'progress'` aggregate.** Cut cleanly. ICE is pre-1.0; no external listeners depend on it. The new node-status stream replaces it; the rollup ("X of N succeeded, K in flight, F failed") is computed client-side from `nodesById`.
5. **Frontend rendering:** deploy panel renders one row per node with simultaneous `applying` indicators; canvas overlay reflects each block's individual state. Redux state extends `deploy-slice` with a `nodesById` map keyed by canvas node id.
6. **Stable correlation by canvas node id**, sourced from `translation.deployables`, replacing the fragile `findSourceNodeId` name-suffix-stripping in the service layer.

The apply-engine in `packages/core/src/apply/` (which has plan-execution-layer batching via `Promise.all`) is **not** adopted as-is because it waits for the slowest node in each layer before starting the next — a work-stealing pool over the DAG is strictly better. The two engines (`deploy-engine.ts` for parallel deploy, `apply-engine.ts` for the older plan/apply path) coexist; reconciliation is a separate refactor.

**Alternatives considered.**

- *Adopt `apply-engine.ts`'s execution-layer batching.* Rejected. Layer-batched `Promise.all` waits for the slowest node in layer N before starting layer N+1, even when a fast node in N+1 has only one dep already finished. Work-stealing over the DAG is strictly better.
- *New socket room `deploy:<deployId>`.* Rejected. The existing `deploy:<cardId>` is what the canvas hydration is shaped around (per-card lifecycle, per-card snapshot in `deploy-locks.ts`). The deployId is unknown to clients before the HTTP roundtrip.
- *Keep emitting legacy `type: 'progress'` for one release.* Rejected per user direction. ICE is pre-1.0; no external clients to protect; cleaner cut.
- *Single global concurrency limit, no per-handler caps.* Rejected. GCP quotas (Cloud SQL 1/min, Memorystore IP-range races) make >1 concurrent unsafe for those resource types specifically.
- *Fail-fast on first error.* Rejected per user direction (failure isolates per branch). The partial-success rollup gives users the actionable diff: which resources succeeded, which failed.

**Consequences.**

- The deploy path returns identical `DeployResult` shapes (no API break for callers); only timing and event surface change.
- The misleading per-resource progress percentage is gone — replaced by an honest "X of N terminal" rollup. Implicitly fixes the long-standing UI wart where the bar bounces 59% → 0% → 0% as the engine moves between resources.
- Future adopt-vs-already-exists work slots into the per-handler `create()` wrapper without touching the scheduler. The `applying` event fires at scheduler dispatch time, not handler call time, so a future adopt-detection wrapper can emit a `node.progress` like "checking for existing resource" before the actual create.
- Per-handler caps for SQL and Redis mean a card with 3 SQL instances still serializes those three creations (correct given GCP behavior). Documented as a knob in `/docs/core-engine.md`.
- Cancellation behavior (existing `abort_signal`): in-flight nodes finish naturally; not-yet-applying nodes flip to `cancelled-due-to-dep`.
- Two engines coexist; reconciliation is a separate refactor.

**Related.** Plan units pdl-1 through pdl-9. [`packages/core/src/deploy/deploy-engine.ts`](../../packages/core/src/deploy/deploy-engine.ts) (current sequential apply, primary refactor target). [`packages/core/src/apply/apply-engine.ts`](../../packages/core/src/apply/apply-engine.ts) (reference, not adopted). [`packages/core/src/deploy/providers/gcp/types.ts`](../../packages/core/src/deploy/providers/gcp/types.ts) (`GCPHandlerContext.on_step` — existing milestone hook to be used by all slow handlers in pdl-3). Adopt-resource (issue #4) — out of scope, hooks reserved.

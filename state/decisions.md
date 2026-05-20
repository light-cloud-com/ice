# Decisions log

Append-only log of architectural and process decisions for the multi-agent ICE workflow.

**Rules**

- New decisions: append a dated entry. Never edit past entries.
- Supersede an old decision by adding a new entry that references it under "Related".
- The only allowed edit to a past entry elsewhere in `state/` is appending a `_Promoted to: /docs/<path>_` line on a learning that's been promoted. That rule does not apply to entries in this file — `decisions.md` entries are never edited.

(Note: state directory moved from `.claude/state/` to `state/` on 2026-04-29 — see the dated entry below for context. Past entries' prose mentions of `.claude/state/` are historical and stay verbatim per append-only.)

---

## 2026-04-27 — Adopt persistent state system

**Context.** The multi-agent ICE workflow (planner, implementer, critic, ux-tester) needs cross-session memory. Without it, each agent starts cold and re-derives the same conclusions, the orchestrator can't see what's in flight, and post-mortem learnings vanish at the end of a session.

**Decision.** Adopt a three-file markdown state system under `.claude/state/`:

- `decisions.md` — append-only log of architectural and process choices.
- `progress.md` — living document, owned exclusively by the orchestrator (main session).
- `learnings.md` — append-only log of non-obvious gotchas and patterns.

State files live in `.claude/state/` (agent-managed operational state) and are cross-linked from `/docs/refactoring-patterns.md` (human entry point). Stabilized learnings — cited 3+ times or generalizing beyond one unit — get promoted into `/docs` as proper documentation, and the original learning entry is annotated with a `_Promoted to:_` back-reference.

**Alternatives considered.**

- _Single `state.json`._ Rejected. Markdown reads well in diffs, tolerates partial writes, and surfaces in `git blame`. JSON encourages whole-file overwrites; we want append-only.
- _Per-agent memory frontmatter inside each `.claude/agents/_.md`.\* Rejected. Couples state to the agent definition (so editing an agent's role would churn its memory), prevents cross-agent reads (the critic should see what the implementer learned), and fragments the orchestrator's view.
- _State in `/docs/state/`._ Rejected. `/docs` is human-authored documentation that ships with the repo; mixing agent-managed operational state into it muddies that contract. We cross-link from `/docs/refactoring-patterns.md` instead of co-locating.

**Consequences.**

- Every agent reads `decisions.md` and `learnings.md` before acting (see learning `read-state-first`).
- The orchestrator owns `progress.md` exclusively. Subagents never write to it.
- Quarterly compaction: cluster duplicates in `learnings.md`, archive the prior version to `.claude/state/archive/learnings-YYYY-Qn.md`.
- Stabilized learnings get promoted to `/docs`; the original entry gets a `_Promoted to:_` line appended (the only legal post-hoc edit).

**Related.** `state/learnings.md` (compacted patterns archive)

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

- _Adopt `apply-engine.ts`'s execution-layer batching._ Rejected. Layer-batched `Promise.all` waits for the slowest node in layer N before starting layer N+1, even when a fast node in N+1 has only one dep already finished. Work-stealing over the DAG is strictly better.
- _New socket room `deploy:<deployId>`._ Rejected. The existing `deploy:<cardId>` is what the canvas hydration is shaped around (per-card lifecycle, per-card snapshot in `deploy-locks.ts`). The deployId is unknown to clients before the HTTP roundtrip.
- _Keep emitting legacy `type: 'progress'` for one release._ Rejected per user direction. ICE is pre-1.0; no external clients to protect; cleaner cut.
- _Single global concurrency limit, no per-handler caps._ Rejected. GCP quotas (Cloud SQL 1/min, Memorystore IP-range races) make >1 concurrent unsafe for those resource types specifically.
- _Fail-fast on first error._ Rejected per user direction (failure isolates per branch). The partial-success rollup gives users the actionable diff: which resources succeeded, which failed.

**Consequences.**

- The deploy path returns identical `DeployResult` shapes (no API break for callers); only timing and event surface change.
- The misleading per-resource progress percentage is gone — replaced by an honest "X of N terminal" rollup. Implicitly fixes the long-standing UI wart where the bar bounces 59% → 0% → 0% as the engine moves between resources.
- Future adopt-vs-already-exists work slots into the per-handler `create()` wrapper without touching the scheduler. The `applying` event fires at scheduler dispatch time, not handler call time, so a future adopt-detection wrapper can emit a `node.progress` like "checking for existing resource" before the actual create.
- Per-handler caps for SQL and Redis mean a card with 3 SQL instances still serializes those three creations (correct given GCP behavior). Documented as a knob in `/docs/architecture/core-engine.md`.
- Cancellation behavior (existing `abort_signal`): in-flight nodes finish naturally; not-yet-applying nodes flip to `cancelled-due-to-dep`.
- Two engines coexist; reconciliation is a separate refactor.

**Related.** Plan units pdl-1 through pdl-9. [`packages/core/src/deploy/deploy-engine.ts`](../../packages/core/src/deploy/deploy-engine.ts) (current sequential apply, primary refactor target). [`packages/core/src/apply/apply-engine.ts`](../../packages/core/src/apply/apply-engine.ts) (reference, not adopted). [`packages/core/src/deploy/providers/gcp/types.ts`](../../packages/core/src/deploy/providers/gcp/types.ts) (`GCPHandlerContext.on_step` — existing milestone hook to be used by all slow handlers in pdl-3). Adopt-resource (issue #4) — out of scope, hooks reserved.

---

## 2026-04-29 — Refactor initiative: monster-file decomposition with three new agents

**Context.** The ICE codebase has ~30 source files over 500 LOC and four over 2000 LOC (`properties-panel.tsx` 3268, `svg-canvas.tsx` 3234, `deploy.service.ts` 2843, `deploy-panel.tsx` 2229), with another six in the 1000–1600 LOC band. Coverage tooling is installed only in `packages/core` and there is no threshold enforcement at the workspace level. Refactoring at this scale via the existing four-agent loop alone risks duplicate utilities and uneven test coverage as code is moved across packages.

**Decision.** Extend the existing `planner / implementer / critic / ux-tester` loop with three additive agents and two new state files:

- **decomposer** — analyzes one large file, produces a semantic split blueprint (utils / hooks / components / subcomponents). Does not edit code.
- **util-broker** — owns `.claude/state/shared-modules.md`, validates each blueprint against existing exports across the workspace, flags duplicates before they land.
- **test-author** — brings each extracted module to ≥90% statement + ≥90% branch coverage; documents structural exceptions in `learnings.md`.
- New state file **`.claude/state/refactor-targets.md`** (orchestrator-owned, living document) — per-file queue with current LOC, current coverage, units open/done, shim-drop status.
- New state file **`.claude/state/shared-modules.md`** (util-broker-owned, append-only) — exported-module registry.

Workflow per file: orchestrator picks target → decomposer drafts blueprint → util-broker validates against registry → planner orders units leaves-first → for each unit (implementer extracts behind a re-export shim → test-author hits coverage → critic verifies public-API equivalence + coverage delta ≥ 0). The **ux-tester step is intentionally skipped from the per-unit refactor cadence** — behavior preservation is enforced by the tests + critic API-equivalence check, and headed-browser cycles are too slow for the cadence. The orchestrator may dispatch a one-off ux-tester smoke if the critic flags behavior risk on a particular unit. Each file ends with an explicit shim-drop unit.

**Alternatives considered.**

- _Replace the existing four agents with refactor-specialised ones._ Rejected. The current loop already works for the parallel-deploy initiative; replacing it would lose the planner / critic / ux-tester convention. Additive is strictly safer.
- _Single "refactorer" agent that does decomposition, extraction, and tests in one pass._ Rejected. Too much surface area per agent; the tight feedback loop between decomposer and util-broker is what kills duplicate utils, and merging them would lose that.
- _Coverage threshold ratchet to 90/80 across the whole repo on day one._ Rejected. Disruptive; some packages don't even have a coverage tool installed yet. Per-package baseline-on-touch with a global gate that forbids regression is the staged version.
- _ux-tester runs per refactor unit._ Rejected per orchestrator direction (2026-04-29). Headed-browser cycles are too slow for per-unit cadence and refactor units do not change behavior. The general UI-testing rule still applies for behavior changes.

**Consequences.**

- Phase 0 (coverage tooling at root + initial registry seed) is a hard prerequisite before any refactor unit dispatches.
- Re-export shims live at the original path until a file's final shim-drop unit; this keeps each commit's blast radius small but adds a discipline cost (shims must be tracked).
- `progress.md` In flight list grows by one initiative; per-file progress goes into `refactor-targets.md` so `progress.md` stays scannable.
- `learnings.md` will accumulate coverage-exception entries for modules that legitimately can't hit 90%.
- ux-tester smoke runs become exception-driven for refactor work — the critic must explicitly call for one when behavior risk is suspected.

**Related.** [`/CLAUDE.md`](../../CLAUDE.md), [`state/refactor-targets.md`](refactor-targets.md), [`state/shared-modules.md`](shared-modules.md), [`.claude/agents/decomposer.md`](../.claude/agents/decomposer.md), [`.claude/agents/util-broker.md`](../.claude/agents/util-broker.md), [`.claude/agents/test-author.md`](../.claude/agents/test-author.md).

---

## 2026-04-29 — Move state directory from `.claude/state/` to `state/`

**Context.** Operating Claude Code on this repo with default permission settings, every write under `.claude/` triggers an interactive permission prompt. The state files (`decisions.md`, `learnings.md`, `progress.md`, `refactor-targets.md`, `shared-modules.md`, `blueprints/*`, `archive/*`) are touched on every refactor unit — append a learning, update progress, etc. — so the prompts compound into significant friction during long refactor runs.

**Decision.** Move the operational state directory from `.claude/state/` to `state/` at the project root. The agent definitions stay in `.claude/agents/` because that path is how Claude Code's harness discovers subagents — moving them would break agent dispatch. CLAUDE.md, `docs/agents.md`, and every agent definition file get bulk-updated to reference the new path.

**Alternatives considered.**

- _Keep state under `.claude/state/` and add a permission allowlist for it._ Rejected. Allowlists work per-tool but require ongoing maintenance (every new state file under the tree needs the entry refreshed); moving the directory once is structurally cleaner.
- _Move state to `docs/state/`._ Rejected. `docs/` is human-authored documentation that ships with the repo; mixing agent-managed operational state into it muddies that contract (same reasoning as the original 2026-04-27 decision).
- _Move state to `.claude-state/` (sibling of `.claude/`)._ Rejected. The leading dot would still imply hidden / tooling-managed; explicit `state/` at the root makes the directory's purpose obvious in `ls`.

**Consequences.**

- All references in CLAUDE.md, `docs/agents.md`, and `.claude/agents/*.md` updated to `state/`.
- Past entries in `decisions.md` and `learnings.md` (append-only) keep their historical `.claude/state/` prose mentions verbatim — those describe the path at the time of writing. The meta-rules section at the top of `decisions.md` is updated since it's normative meta-text, not an entry.
- `git mv` preserves blame on the moved files.
- The agent .md files themselves stay in `.claude/agents/` for harness discovery; only `state/` was moved.

**Related.** Supersedes the path choice in the [`2026-04-27 — Adopt persistent state system`](#2026-04-27--adopt-persistent-state-system) decision.

---

## 2026-05-02 — Merge `refactoring` branch as a single PR

**Context.** The `refactoring` branch carries 509 commits ahead of `main`: the parallel-deploy initiative (pdl-1..10), the workspace-wide LOC discipline initiative (Phase 1 / 2 / 3 / Final round, 73 files refactored, ~7,500 new tests added, 4 latent bugs fixed). Branch is internally coherent — every commit ships with tests; the orchestrator pattern (planner / implementer / critic / ux-tester) and the per-unit cadence enforced behavior preservation throughout. ICE is pre-1.0; no external API stability obligations gate the cut.

**Decision.** Merge the `refactoring` branch into `main` as **one squash-or-merge PR**, not split per phase.

Rationale:

- The two initiatives (parallel-deploy + LOC discipline) are interleaved in the commit graph; phase-PR splits would require cherry-picking and lose accurate `git blame`.
- Each refactor unit was already gated by a critic pass + test deltas; per-unit reviewability already exists in the commit messages and per-unit blueprints (`state/blueprints/rf-*.md`).
- A single merge preserves chronological order in `main`'s history and is the cheapest path to closing the long-running branch.
- Pre-1.0 status means no semver / changelog burden tied to the cut shape.
- No active feature work depends on a phase-by-phase cut; the deferred follow-ups (current In flight) layer cleanly on top of `main` post-merge.

**Alternatives considered.**

- _Split into Phase-1 / Phase-2 / Phase-3 / Final-round / bugfixes PRs._ Rejected. The refactor units were dispatched by file, not by phase boundary; many commits touch utilities shared across phase boundaries. Splitting would require synthetic boundaries and lose the per-unit shim-drop sequencing. Review burden is the same total but more painful when interleaved.
- _Merge straight to `main` without a PR._ Rejected. Even though ICE is pre-1.0, the volume warrants a PR record for `main` history searchability — title + body capture the high-level summary that 509 individual commit messages don't.
- _Keep cooking on `refactoring` and merge at end of Q2-2026._ Rejected. The branch is a closed initiative, not work-in-progress; further commits would be the deferred follow-ups (current In flight) and those are independent enough to ship as their own PRs after the merge.
- _Merge commit vs squash._ No preference recorded — let the human PR reviewer pick. A merge commit preserves the per-unit history (richer `git log`); a squash collapses 509 → 1 (cleaner mainline graph). Both are acceptable.

**Consequences.**

- After merge, the deferred follow-ups (pdl-11, rollupPercentage extraction, nodesById warm-seed, dead snapshot fields, data.status fallback, 3 cross-package dedups) ship as their own PRs against the new `main`.
- `state/refactor-targets.md` becomes historical reference — the queue is empty other than the 4 documented data-leaf exceptions.
- `state/learnings.md` Q2-2026 quarterly compaction (separate work) lands either on `refactoring` pre-merge or on `main` post-merge — both are fine, no ordering constraint.
- The pre-commit hook auto-bumps `package.json` version on every commit, so the cut version on `main` will be wherever the bump lands. Not load-bearing.

**Related.** [`state/progress.md`](progress.md) (Archive entries for both initiatives), `state/learnings.md` (the playbook distilled from the LOC initiative; doc-form deprecated).

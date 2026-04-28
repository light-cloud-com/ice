# Progress

Living document. **Owned exclusively by the orchestrator (main session).** Subagents do not write to this file.

## In flight

### Parallel deploy scheduler (pdl-* units) — pdl-1 + pdl-2 landed

The deploy engine is being refactored from sequential apply to a parallel work-stealing scheduler with live per-node statuses. Architectural decisions are in `decisions.md` under **"2026-04-28 — Parallel deploy scheduler with per-node live status"**. The full unit-by-unit plan was produced by the planner agent in conversation; the decisions entry captures the load-bearing choices.

**Status:**

- ✅ **pdl-1 consolidate scheduler** — `packages/core/src/deploy/scheduler.ts` + tests. Pool size 6 default; per-handler caps `gcp.sql.*=1`, `gcp.redis.*=1`. Failure isolates to descendants. New `NodeStatusEvent` / `NodeProgressEvent` types + callbacks on `DeployOptions`. 17 new tests; 331 in `packages/`. Commit `c60bd1b`.
- ✅ **pdl-2 per-node event types** — `packages/types/src/deploy-events.ts` (locked contract: discriminated union + `DEPLOY_EVENT_CHANNEL`) + 5 typed wire helpers in `packages/shared/src/socket/service.ts` (`emitDeployNodeStatus` / `emitDeployNodeProgress` / `emitDeployComplete` / `emitDeployLog` / `emitDeployRequirementVerified`). Legacy `emitDeployProgress` removed cleanly. New test suite at `packages/shared/src/__tests__/socket-deploy-events.test.ts` (8 tests; total 15 in `@ice/shared`). `pnpm --filter @ice/shared typecheck` and `@ice/types` typecheck both green; `@ice/service-deploy` typecheck red on exactly 4 import-resolution errors as designed (the 70+ internal callsites are masked by the local `function emitDeployProgress` shadow at `services/deploy/src/services/deploy.service.ts:98` — they'll surface for pdl-4 once the import is migrated). Critic verdict: APPROVE WITH NITS, all nits deferred to pdl-4/pdl-7. New learning anchor `socket-service-module-scoped-io-needs-vi-resetmodules-per-test`.
- ⏸️ **pdl-3 GCP handler milestones** — not started. Wires `ctx.on_step` calls into cloud-sql, memorystore, cloud-run, cloud-functions, api-gateway, gke (specific labels per planner). Refactors `cloud-build-helper.ts` to accept an `on_step` parameter. Independent of pdl-2; safe to run in parallel with pdl-4 / pdl-7.
- ⏸️ **pdl-4 service-layer wiring** — not started. Depends on pdl-1 + pdl-2. Translates scheduler's graph node id → canvas node id via `deployables[]` (replaces the fragile `findSourceNodeId` name-suffix-stripping). Migrates the four `@ice/service-deploy` typecheck errors plus the masked 70+ callsites in `deploy.service.ts` (the local `emitDeployProgress` shadow at line 98 is the natural rewrite point — it should dispatch by event type into the new typed helpers). Also touches `requirement-poller.service.ts:166`, `queue.service.ts:249/260/272`, and the dangling `rollback.test.ts:30` mock.
- ⏸️ **pdl-5 deploy panel rewrite** — not started. Depends on pdl-4 + pdl-7.
- ⏸️ **pdl-6 per-block canvas overlay** — not started. Depends on pdl-4. Mostly cosmetic — the `data.deploy_status` plumbing is already in place.
- ⏸️ **pdl-7 Redux nodesById state** — not started. Depends on pdl-2. ⚠️ **Sequence pdl-4 and pdl-7 close together** — between them, the backend will be emitting `deploy:event` while the frontend's `socket.on('deploy:progress', ...)` listener at `packages/ui/src/shared/api/http-api-adapter.ts:539-544` is still wired to the legacy channel name. Every event silently dropped during that window — the deploy panel becomes a black hole. (Critic flag from pdl-2 review.)
- ⏸️ **pdl-8 tests** — not started. Depends on pdl-1+3+4+7.
- ⏸️ **pdl-9 docs** — not started. Depends on pdl-8.

**To resume:**

1. Read `.claude/state/decisions.md` 2026-04-28 entry for the architectural envelope (pool size, per-handler caps, failure isolation, Socket.IO room reuse, no backwards-compat).
2. Read `.claude/state/learnings.md`. Anchors `scheduler-ready-list-must-reserve-per-handler-cap`, `scheduler-resource-name-vs-graph-node-id-vs-canvas-node-id`, and the new `socket-service-module-scoped-io-needs-vi-resetmodules-per-test` are the critical context. The id-namespace one is load-bearing for pdl-4.
3. Dispatch order: **pdl-3 and pdl-4 in parallel** (pdl-3 is independent; pdl-4 has the typecheck-driven punch list ready). Then pdl-7 (Redux state) — schedule it close to pdl-4 to close the channel-name window. Then pdl-5 + pdl-6 in parallel (both depend on pdl-4 ± pdl-7). Then pdl-8 tests. Then pdl-9 docs.
4. Commit after every unit — earlier in this work, an editor (WebStorm) was wiping uncommitted changes (`git reset --hard HEAD` ran 5+ times during a single session). Commit aggressively.

## Done this week

- **2026-04-27 LT-1 through LT-9** — Consolidated `Monitoring.Terminal` into `Monitoring.Log`; built the live Cloud Logging stream backend (filter resolver + log-stream service + routes + Socket.IO room) and frontend (`logs-slice` + `useLogStream` hook + properties section + canvas placeholder). 365+ tests added. Real-deploy verification deferred behind the parallel-deploy work because the deploy engine was too fragile for clean iteration. See `decisions.md` 2026-04-27 entry.
- **2026-04-28 pdl-1** — Parallel scheduler in deploy engine. Commit `c60bd1b`.
- **2026-04-28 pdl-2** — Per-node deploy event types (`packages/types/src/deploy-events.ts`) + 5 typed wire emitters in `@ice/shared` socket service; legacy `emitDeployProgress` removed. 8 new tests. Critic APPROVE WITH NITS (deferred to pdl-4/pdl-7).

## Blocked

_(no blockers)_

## Archive

_(prior weeks not yet swept)_

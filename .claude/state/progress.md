# Progress

Living document. **Owned exclusively by the orchestrator (main session).** Subagents do not write to this file.

## In flight

### Parallel deploy scheduler (pdl-* units) — pdl-1 + pdl-2 landed

The deploy engine is being refactored from sequential apply to a parallel work-stealing scheduler with live per-node statuses. Architectural decisions are in `decisions.md` under **"2026-04-28 — Parallel deploy scheduler with per-node live status"**. The full unit-by-unit plan was produced by the planner agent in conversation; the decisions entry captures the load-bearing choices.

**Status:**

- ✅ **pdl-1 consolidate scheduler** — `packages/core/src/deploy/scheduler.ts` + tests. Pool size 6 default; per-handler caps `gcp.sql.*=1`, `gcp.redis.*=1`. Failure isolates to descendants. New `NodeStatusEvent` / `NodeProgressEvent` types + callbacks on `DeployOptions`. 17 new tests; 331 in `packages/`. Commit `c60bd1b`.
- ✅ **pdl-2 per-node event types** — `packages/types/src/deploy-events.ts` (locked contract: discriminated union + `DEPLOY_EVENT_CHANNEL`) + 5 typed wire helpers in `packages/shared/src/socket/service.ts` (`emitDeployNodeStatus` / `emitDeployNodeProgress` / `emitDeployComplete` / `emitDeployLog` / `emitDeployRequirementVerified`). Legacy `emitDeployProgress` removed cleanly. New test suite at `packages/shared/src/__tests__/socket-deploy-events.test.ts` (8 tests; total 15 in `@ice/shared`). `pnpm --filter @ice/shared typecheck` and `@ice/types` typecheck both green; `@ice/service-deploy` typecheck red on exactly 4 import-resolution errors as designed (the 70+ internal callsites are masked by the local `function emitDeployProgress` shadow at `services/deploy/src/services/deploy.service.ts:98` — they'll surface for pdl-4 once the import is migrated). Critic verdict: APPROVE WITH NITS, all nits deferred to pdl-4/pdl-7. New learning anchor `socket-service-module-scoped-io-needs-vi-resetmodules-per-test`.
- ✅ **pdl-3 GCP handler milestones** — `ctx.on_step` wired into cloud-sql (2 steps), memorystore (2), cloud-run service+job (4), cloud-functions (2), api-gateway (1 or 3 with openapi_spec), gke (2). `cloud-build-helper.ts` now takes a `reportStep(index, label)` callback; cloud-run pins all build sub-states to outer index 2 so the bar holds while labels refresh. 12 new tests in `__tests__/on-step-milestones.test.ts`. Critic APPROVE WITH NITS — only deferred follow-ups (update-path milestones, action='create' bridge hardcode in gcp-deployer.ts:184). New learning anchor `cloud-build-helper-substep-shares-outer-index`.
- ✅ **pdl-4 service-layer wiring** — local `emitDeployProgress` shadow replaced with typed `emitDeployEvent` dispatcher; `graphIdToCanvasId` translation map built from `translation.deployables[]`; scheduler's `on_node_status` / `on_node_progress` callbacks wired with translation; legacy `on_progress` aggregate dropped clean. 50 callsites migrated in `deploy.service.ts`, 3 in `queue.service.ts`, 1 in `requirement-poller.service.ts`; `rollback.test.ts` mock updated. Single-counter seq via `nextDeploySeq(cardId)` + per-emit allocation. 19 new tests in `deploy-event-translation.test.ts`. Critic returned REQUEST CHANGES on two blockers (contract widening for `DeployRequirementVerifiedEvent` to add `node_id`/`environment`/`details`; seq-scheme JSDoc discrimination) plus N1 (`@ice/core` `types` field repointed at source, local mirror dropped) and N3/N4 (auto-cleanup retry path now wires `on_node_progress` and snapshot mirror). All blockers + N1+N3+N4 fixed by orchestrator before commit; deferred N5 (log-level uniformity) to a follow-up. New learning anchors: `seq-allocation-must-be-shared-between-wire-and-log`, `graph-id-vs-canvas-id-translation-is-service-layer-job`, `stale-core-dist-blocks-cross-package-type-imports`, `point-types-at-source-not-dist-in-workspace-packages` (supersedes the previous), `requirement-verified-needs-full-tenancy-key-on-the-wire`, `seq-schemes-on-shared-channel-need-jsdoc-discrimination`.
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
- **2026-04-28 pdl-3** — `ctx.on_step` wired into 6 GCP handlers + cloud-build-helper signature change. 12 new tests. Critic APPROVE WITH NITS (deferred update-path follow-ups).
- **2026-04-28 pdl-4** — Service-layer migrated to the new typed wire contract. Graph→canvas id translation lives at the deploy-service boundary. `DeployRequirementVerifiedEvent` widened in pdl-2's contract to carry `node_id`/`environment`/`details`. 19 new tests; total 79 in `@ice/service-deploy`. All four typechecks green.

## Blocked

_(no blockers)_

## Archive

_(prior weeks not yet swept)_

# Progress

Living document. **Owned exclusively by the orchestrator (main session).** Subagents do not write to this file.

## In flight

_(none)_

## Done this week

- **2026-05-02 — Parallel-deploy + dedup follow-ups (carry-over from pdl + rf-0c) — COMPLETE.** Six deferred items from the parallel-deploy initiative and the LOC-discipline initiative landed in one batch:
  - ✅ **pdl-11** canvas-block-default-provider — `useCanvasDrop` reads `state.deploy.provider` and threads it into both `getBlueprint` / `expandBlueprint` (when palette didn't pin one) and into `newNodeData.provider` for resource drops. Group drops are unchanged. logBlueprint still records the _palette_ provider (analytics tracks user intent). 21 → 23 tests in `use-canvas-drop.test.tsx`. Commit `b062b6c`.
  - ✅ **rollupPercentage extraction** — `deriveRollupPercentage(rollup)` extracted next to `deriveRollup` in `store/slices/deploy/derive.ts`; three identical inline copies (deploy-in-flight-panel, deploy-banner, status-bar) collapsed to a single import. 14 → 19 tests in `derive.test.ts` (+5 cases: empty / full / cap-at-99 boundary / rounding / defensive zero-total). Commit `6e637e9`.
  - ✅ **Phase 2 `nodesById` warm-seed** — `useDeploySubscription` Phase 2 now dispatches synthetic `node_status` (and `node_progress` when step descriptor present) events for each node in `snapshot.nodeStatuses`, with seq=0 so any live event with seq>0 dedup-wins. New `overlayToWireStatus` helper inverts `mapWireStatusToOverlay` (returns null for non-wire overlay strings). 14 → 17 tests in `use-deploy-subscription.test.ts` (+3 inverse-map cases). Commit `47ffecd`.
  - ✅ **DeployProgressSnapshot dead fields** — dropped `progress` / `currentResource` / `currentStep` from the interface (deploy-locks.ts), the `startDeploySnapshot` / `finishDeploySnapshot` writers, the `scheduler-callbacks.ts` writes (totals.completed.count bump preserved), the `canvas-deploy.ts` /current/:cardId fallback, and the now-orphan `updateDeploySnapshot` helper. 32 → 30 tests in `scheduler-callbacks.test.ts` (caps-99 + only-currentResource cases dropped — they tested the dead-field semantics specifically). Commit `63fb76b`.
  - ✅ **Drop `data.status` legacy fallback** — per learning `one-status-source-deploy-status`. Reader fallback at `compact-node/index.tsx:81` removed; writer-side sweep removed `status: 'active'` seeds across `packages/blocks/src/{aws,azure,gcp}/security/waf.ts`, `expand-blueprint.ts`, `expand-template.ts`, `use-canvas-drop.ts`, `cards/reducers/undo-redo-group.ts`. Drift-checker writes (`use-drift-check.ts`) re-routed to `deploy_status`. 8261 unit tests passing. Commit `5bef36f`.
  - ✅ **rf-0c cross-package dedup** — (a) `mapStatusToOverlay` + `overlayToWireStatus` hoisted to `@ice/types` next to `DeployNodeStatus`; service-side and UI-side modules re-export to preserve imports. New `DeployOverlayStatus` type. (b) Network-container set unified via `@ice/constants:NETWORK_CONTAINER_TYPES` — both `isContainer` predicates (`@ice/types/connection-rules/predicates.ts` and `@ice/core/validation/classifiers.ts`) now read from the canonical list, so a new container type flips both predicates in lockstep. The wider classifier-predicate dedup is deferred — `@ice/core` deliberately does not depend on `@ice/types`, and crossing that boundary is a larger architectural change than rf-0c warrants. Commits `6e053af`, `e40cdcc`.
- **2026-05-02 — Concepts palette: Auth + Data Warehouse + Search shipped.** Three blocks originally deferred from the 23-block cut on 2026-04-14 are now built. New `auth` high-level resource added to `core/src/resources/high-level-resources/categories/security.ts` (Cognito / Firebase Auth / Entra ID); `data-warehouse` and `search-engine` resources already existed in `database.ts`. Three concept blueprints + info content + family registrations under `packages/blocks/src/common/concepts/{auth,data-warehouse,search-engine}/`. Palette grows 25 → 28; new "Analytics" group between Data and Messaging in `CONCEPT_BLUEPRINTS`. SaaS-key path (Clerk/Auth0 in Secret Store) and library path (NextAuth/Lucia + Postgres) still work — the new Auth block is for users who explicitly want managed identity. 8261 unit tests passing; 0 typecheck regressions. Commits `614bd80`, `7d291ff`.
- **2026-05-02 — Quarterly compaction of `learnings.md` (Q2-2026).** 204 → 113 anchors (-44%); 1676 → 780 lines (-53%). Pre-compaction snapshot archived to `state/archive/learnings-2026-Q2.md`. All 25 must-preserve anchors retained verbatim (24 `_Promoted to: /docs/refactoring-patterns.md_` + the `read-state-first` anchor cited from `decisions.md` and `CLAUDE.md`). All `_Promoted to:_` and `_Fixed:_` trailers preserved. Representative cluster merges: `ux-log-terminal-pitfalls` (5 sub-anchors), `ux-deploy-real-cloud-pitfalls` (3), `pdl-7-wire-contract-trims-downstream-ui` (3), `pdl-10-destroy-snapshot-and-dedup-traps` (3), `inline-classification-duplications-are-not-actually-duplicates` (4 rf-canv siblings), `test-helper-defaults-traps-coalesce-and-spread` (3), `brief-numerics-are-approximate-source-is-canonical` (3 brief-vs-source variants). Commits `8ef2e25`, `763457a`.
- **2026-05-02 — Merge story decision for the refactoring branch.** Decision recorded in `decisions.md` (2026-05-02 entry): merge as a single PR rather than splitting per phase. 511 commits ahead of `main`, ~1,724 files touched, +251,866 / −50,621 LOC. PR body prepared at `/tmp/refactoring-pr-body.md` for use after `gh auth login -h github.com`. Pre-PR sanity: typecheck clean across all 22 packages except for the documented 25 TS2834 baseline errors in `packages/core` barrel files (pre-existing); 1 typecheck error in `apply-pipeline-helpers.test.ts` fixed inline (cast `source_node_id` reads on the inline result fixture). Commits `78bbd83`, `7e7b7b0`.
- **2026-05-02 — Housekeeping pass on `progress.md`.** Reduced 322 → 216 lines. The In flight section's pdl-1..10 status block + 7 rf-\* per-file refactor subsections (all complete) moved verbatim under Archive so anchor and commit references stayed searchable. Commit `c2c7b2f`.
- **2026-04-27 LT-1 through LT-9** — Consolidated `Monitoring.Terminal` into `Monitoring.Log`; built the live Cloud Logging stream backend (filter resolver + log-stream service + routes + Socket.IO room) and frontend (`logs-slice` + `useLogStream` hook + properties section + canvas placeholder). 365+ tests added. Real-deploy verification deferred behind the parallel-deploy work because the deploy engine was too fragile for clean iteration. See `decisions.md` 2026-04-27 entry.
- **2026-04-28 pdl-1** — Parallel scheduler in deploy engine. Commit `c60bd1b`.
- **2026-04-28 pdl-2** — Per-node deploy event types (`packages/types/src/deploy-events.ts`) + 5 typed wire emitters in `@ice/shared` socket service; legacy `emitDeployProgress` removed. 8 new tests. Critic APPROVE WITH NITS (deferred to pdl-4/pdl-7).
- **2026-04-28 pdl-3** — `ctx.on_step` wired into 6 GCP handlers + cloud-build-helper signature change. 12 new tests. Critic APPROVE WITH NITS (deferred update-path follow-ups).
- **2026-04-28 pdl-4** — Service-layer migrated to the new typed wire contract. Graph→canvas id translation lives at the deploy-service boundary. `DeployRequirementVerifiedEvent` widened in pdl-2's contract to carry `node_id`/`environment`/`details`. 19 new tests; total 79 in `@ice/service-deploy`. All four typechecks green.

- **2026-04-27 LT-1 through LT-9** — Consolidated `Monitoring.Terminal` into `Monitoring.Log`; built the live Cloud Logging stream backend (filter resolver + log-stream service + routes + Socket.IO room) and frontend (`logs-slice` + `useLogStream` hook + properties section + canvas placeholder). 365+ tests added. Real-deploy verification deferred behind the parallel-deploy work because the deploy engine was too fragile for clean iteration. See `decisions.md` 2026-04-27 entry.
- **2026-04-28 pdl-1** — Parallel scheduler in deploy engine. Commit `c60bd1b`.
- **2026-04-28 pdl-2** — Per-node deploy event types (`packages/types/src/deploy-events.ts`) + 5 typed wire emitters in `@ice/shared` socket service; legacy `emitDeployProgress` removed. 8 new tests. Critic APPROVE WITH NITS (deferred to pdl-4/pdl-7).
- **2026-04-28 pdl-3** — `ctx.on_step` wired into 6 GCP handlers + cloud-build-helper signature change. 12 new tests. Critic APPROVE WITH NITS (deferred update-path follow-ups).
- **2026-04-28 pdl-4** — Service-layer migrated to the new typed wire contract. Graph→canvas id translation lives at the deploy-service boundary. `DeployRequirementVerifiedEvent` widened in pdl-2's contract to carry `node_id`/`environment`/`details`. 19 new tests; total 79 in `@ice/service-deploy`. All four typechecks green.
- **2026-04-28 pdl-7** — Frontend Redux `nodesById` state + channel name flipped to `DEPLOY_EVENT_CHANNEL`. The deploy-panel black-hole window from pdl-4 is closed. 38 new tests; 306 total in `@ice/ui` + `@ice/service-deploy`. All five typechecks green.
- **2026-04-28 pdl-6** — Canvas overlay badges for queued/skipped/cancelled wire states. 8 new tests. Mostly cosmetic; no critic dispatch.
- **2026-04-28 pdl-5** — Deploy panel rewrite. Per-node live list from `nodesById`, action-aware destroy labels, honest progress rollup. Legacy `progress`/`currentResource`/`currentStep` fields dropped. 9 new tests; 244 total in `@ice/ui`.
- **2026-04-28 pdl-8 + pdl-9** — Cross-unit seq-roundtrip test (wire ↔ persistent log) + `/docs/architecture/core-engine.md` and `/docs/architecture/frontend.md` updates for the parallel scheduler architecture. 477 tests passing across the monorepo.
- **2026-04-28 pdl-10** — Destroy parity. Both destroy paths now emit `node_status` events with `action: 'delete'`; frontend slice now action-aware-dedups so destroy events land in `nodesById`. Closes the smoke-test regression `ux-destroy-action-bypasses-node-status-wire`. 487 tests passing (+10 net).

## Blocked

_(no blockers)_

## Archive

### 2026-04-28 → 2026-04-29 — Parallel deploy scheduler initiative — COMPLETE through pdl-10

The deploy engine was refactored from sequential apply to a parallel work-stealing scheduler with live per-node statuses. Architectural decisions are in `decisions.md` under **"2026-04-28 — Parallel deploy scheduler with per-node live status"**.

**Status (all complete):**

- ✅ **pdl-1 consolidate scheduler** — `packages/core/src/deploy/scheduler.ts` + tests. Pool size 6 default; per-handler caps `gcp.sql.*=1`, `gcp.redis.*=1`. Failure isolates to descendants. New `NodeStatusEvent` / `NodeProgressEvent` types + callbacks on `DeployOptions`. 17 new tests; 331 in `packages/`. Commit `c60bd1b`.
- ✅ **pdl-2 per-node event types** — `packages/types/src/deploy-events.ts` (locked contract: discriminated union + `DEPLOY_EVENT_CHANNEL`) + 5 typed wire helpers in `packages/shared/src/socket/service.ts`. Legacy `emitDeployProgress` removed cleanly. 8 tests. Commit included channel-constant test learning anchor `socket-service-module-scoped-io-needs-vi-resetmodules-per-test`.
- ✅ **pdl-3 GCP handler milestones** — `ctx.on_step` wired into cloud-sql (2), memorystore (2), cloud-run service+job (4), cloud-functions (2), api-gateway (1 or 3 with openapi_spec), gke (2). `cloud-build-helper.ts` now takes `reportStep(index, label)`; cloud-run pins all build sub-states to outer index 2 so the bar holds while labels refresh. 12 tests. Learning anchor `cloud-build-helper-substep-shares-outer-index`.
- ✅ **pdl-4 service-layer wiring** — local `emitDeployProgress` shadow replaced with typed `emitDeployEvent` dispatcher; `graphIdToCanvasId` translation map built from `translation.deployables[]`; scheduler callbacks wired with translation; legacy `on_progress` aggregate dropped. 50 callsites migrated in `deploy.service.ts`, 3 in `queue.service.ts`, 1 in `requirement-poller.service.ts`. Single-counter seq via `nextDeploySeq(cardId)` + per-emit allocation. 19 tests. Learning anchors: `seq-allocation-must-be-shared-between-wire-and-log`, `graph-id-vs-canvas-id-translation-is-service-layer-job`, `point-types-at-source-not-dist-in-workspace-packages`, `requirement-verified-needs-full-tenancy-key-on-the-wire`, `seq-schemes-on-shared-channel-need-jsdoc-discrimination`.
- ✅ **pdl-5 deploy panel rewrite** — Per-node live list driven by `nodesById` from pdl-7, with simultaneous-applying indicators and an honest `terminal/total` rollup that fixes the long-standing bouncing-bar bug. `currentResource`/`progress`/`currentStep` removed from `DeployState`. New `deriveRollup` and `orderNodesForPanel` helpers. svg-canvas banner + status-bar pill rewired via `shallowEqual` selectors. 9 tests. Learning anchors: `react-memo-on-rollup-component-instead-of-shallowequal-on-selector`, `destroy-status-also-emits-node-events`, `ux-row-labels-need-action-aware-substitution`. Deferred: rollupPercentage extraction (#2/#4) and Phase 2 nodesById warm-seed (#7) — both now in current In flight.
- ✅ **pdl-6 per-block canvas overlay** — `getDeployBadge` extracted to `compact-node/helpers.ts` covering all 6 wire overlay strings. New badges for `queued` / `skipped` / `cancelled`; `skipped`/`cancelled` blocks render at `opacity: 0.6`. 8 tests.
- ✅ **pdl-7 Redux nodesById state** — `deploy-slice` extended with `nodesById: Record<string, NodeDeployState>`; three new typed reducers with seq-based dedup. Frontend listener flipped to `DEPLOY_EVENT_CHANNEL`. API method renamed `onDeployProgress → onDeployEvent`. Hook's `applyDeployEvent` rewritten as `switch (event.type)` over typed `DeployEvent` union. 38 tests across 3 new test files; 227 → 306 total. Learning anchors: `frontend-channel-flip-needs-eager-init-callsite-sweep`, `test-the-channel-name-constant-not-the-string`, `complete-event-without-results-needs-post-complete-fetch`, `deploy-overlay-mapping-must-match-status-colors-keyset`, `complete-event-must-thread-error-message`.
- ✅ **pdl-8 tests** — gap-fill from critic findings: seq-roundtrip integration test in `deploy-event-translation.test.ts` asserting every wire-emit seq lands on the persistent log row with the same value.
- ✅ **pdl-9 docs** — `/docs/architecture/core-engine.md` Apply paragraph rewritten to describe the parallel scheduler + per-handler caps + failure isolation; new "Live event wire contract" section documents the `DeployEvent` discriminated union and the three id namespaces. `/docs/architecture/frontend.md` deploy-slice description updated.
- ✅ **pdl-10 destroy parity** — `destroyDeployment` and `destroyAllForCard` emit `node_status` events with `action: 'delete'`. Built per-resource canvas-node-id correlation from `res.source_node_id` (destroyDeployment) and `prisma.deployedResourceMapping` rows + historical fallback (destroyAllForCard). Both paths now open + close `startDeploySnapshot`/`finishDeploySnapshot` so `nextDeploySeq` allocates contiguous integers. Action-aware dedup + reset on `queued`-after-terminal added to slice. Snapshot lifecycle wrap with try/catch + defensive prisma update. 10 net new tests; 487 total.

**UX smoke test (2026-04-28).** ux-tester drove the parallel-deploy work end-to-end against `lc-ice` (pre-flight clean after orchestrator deleted leaked `ice-full-sta-prod-bucket-3bf3f9d3`). Canvas: 3× `Storage.Bucket` blocks. Result:

- ✅ Headline bouncing-bar bug GONE. Bar moved 0% → 67% → 100% monotonically over an 8.2s deploy. Per-node list rendered with QUEUED → DEPLOY → LIVE pills. 1-in-flight + 2-done observed at one tick; the two completed buckets clocked 2.4s and 2.6s — proof of pdl-1's parallel pool actually running concurrent applies.
- ✅ Wire contract behaves correctly on apply path. `state.deploy.nodesById` populates from `'deploy:event'` channel; canvas badge agrees with deploy panel row for the same node; post-success summary shows `outputs` / `provider_id` / URLs.
- ✅ No legacy `'deploy:progress'` listener anywhere; `state.deploy.nodesById` exists; idle panel renders correctly.
- ❌ Destroy bypassed the node_status wire — addressed by pdl-10.

**Deferred follow-ups from this initiative (now in current In flight):** pdl-11 canvas-block-default-provider, rollupPercentage extraction, Phase 2 nodesById warm-seed, DeployProgressSnapshot dead fields, drop `data.status` legacy fallback.

### 2026-04-29 → 2026-05-02 — Workspace-wide LOC discipline initiative — COMPLETE

Multi-day effort to bring every actionable source file in the monorepo within the 200-500 LOC range. ~470 commits, ~7,500 new tests, 73 files refactored, 4 latent bugs fixed.

**Phase 1 — 5 monster files (>2000 LOC each)**:

- `services/deploy/src/services/deploy.service.ts` (2843 → 1572 → eventually 107 in final round)
- `packages/ui/src/features/properties/components/properties-panel.tsx` (3268 → 94)
- `packages/ui/src/features/canvas/components/svg-canvas.tsx` (3234 → 909 → eventually 453)
- `packages/ui/src/features/deploy/components/deploy-panel.tsx` (2229 → 262)
- `packages/core/src/deploy/card-translator.ts` (1585 → 401)

**Phase 2 cohorts** (1000-2000 LOC files):

- 5 files via various patterns (cards-slice, firebase-hosting, parser, lexer, deploy-slice, cloud-storage)
- 12 UI components via rf-pdpl section pattern
- 12 code-heavy files (sqlite-state-store, auto-layout, scheduler, mutable-graph, ai.service, pulumi-exporter, operation-executor, pipeline.service, log-stream.service, etc.)
- 3 data-heavy splits (scale-presets, cloud-blocks, dev-accent-picker themes)
- 3 tail files (connection-rules, ast, http-api-adapter)

**Phase 3** — 18 files in 500-600 LOC band, 6 cohorts (rf-fbh handlers, rf-pdpl sections, rf-deploy method-grouping, importers, rf-pulumi/rf-parse, mixed). Eliminated all "slightly over" files.

**Final round** — 8 documented exceptions decomposed (excluding generated `resource-types.ts` per user instruction). Reduced 12,754 → 1,082 orchestrator LOC across remaining files.

**Bug fixes** (2026-05-02):

- `bugfix-1` — graph-nodes-keyed-by-type-colon-name (5 callsites switched to `graph.get_node_by_name`)
- `bugfix-2` — `get_base_db_path` lazy `require.resolve`
- `bugfix-3` — `get_critical_path` distance propagation
- `bugfix-4` — `detectJsFramework` pnpm-lock detection

**Documentation**:

- `/docs/refactoring-patterns.md` — 6 proven decomposition patterns + test patterns + gotchas, distilled from the initiative
- 24 stabilized learnings promoted from `state/learnings.md` to the new doc

**Final state of the codebase**:

- Every actionable file within 200-500 LOC band.
- 4 documented data-leaf exceptions remain (high-level-resources category files, all carrying SIZE EXCEPTION headers).
- 1 generated file excluded per user instruction (`resource-types.ts`).
- 0 known latent bugs.
- 162 fine-grained learning anchors retained in `state/learnings.md` for future reference.

The codebase decomposition initiative is complete. Future contributors have:

- A documented set of patterns to follow (`/docs/refactoring-patterns.md`).
- A clean LOC discipline across the workspace.
- ~7,500 tests covering every extracted module.
- A concrete audit trail in `refactor-targets.md` of every file touched.

#### Per-file detail trail (rf-\* refactor initiative)

Detailed unit-by-unit history. Preserved verbatim because individual learning anchors and commit hashes are referenced from `learnings.md`, `decisions.md`, and `/docs/refactoring-patterns.md`. The `blueprints/rf-*.md` files capture the architecture per series; this section captures the unit-by-unit narration.

**rf-deploy — `deploy.service.ts` (2843 → 1572 → eventually 107 in final round)**

- ✅ **rf-deploy-1** `utils/deploy-event-formatter.ts` — `describeEventForLog` + `mapStatusToOverlay`. 13 tests, 100% / 100%. Commit `7669b9c`.
- ✅ **rf-deploy-2** `utils/deploy-outcome.ts` — `computeCompleteTotals` + `deriveCompleteOutcome` + `computeDeploySummary`. 29 tests. Commit `2d8ded8`.
- ✅ **rf-deploy-3** `utils/find-source-node-id.ts` — `buildResourceNameMaps` + `makeFindSourceNodeId`. 20 tests. Commit `c10b0df`. Learning `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`.
- ✅ **rf-deploy-4** `utils/project-context.ts` — `resolveProjectContext`. 6 tests. Commit `59afd32`.
- ✅ **rf-deploy-5** `services/deployer-factory.ts` — `createDeployer` + `getCoreEngine`. 6 tests. Commit `dd95e8f`. Learning `core-const-lifetime-varies-per-callsite-when-extracting-deployer-factory`.
- ✅ **rf-deploy-6** `services/gcp-api-enabler.ts` — `ICE_TYPE_API_MAP` + `BASE_APIS` + `enableGcpApi` + `autoEnableGCPApis`. 20 tests. Commit `70674e4`. Learning `vi-fn-default-type-rejects-typed-callback-parameter`.
- ✅ **rf-deploy-7** `services/snapshot-persister.ts` — `installSnapshotPersister` + `flushSnapshotNow`. 10 tests. Commit `6556ae4`.
- ✅ **rf-deploy-8** `services/deploy-lock-wrapper.ts` — `acquireWriteLock` (3 callsites deduped). 6 tests. Commit `e52ebbf`. Learning `vi-mock-factory-hoist-blocks-top-level-class-references`.
- ✅ **rf-deploy-9** `services/deploy-event-dispatcher.ts` — `emitDeployEvent` + `emitLog` + `emitDestroyNodeStatus`. 19 tests. Commit `d92630e`.
- ✅ **rf-deploy-10** `services/baseline-graph.ts` — `buildBaselineGraph`. 11 tests. Commit `ecd31c1`. Learning `emit-log-gate-must-mirror-original-truthiness-not-count`.
- ✅ **rf-deploy-11** `services/destroy-targets.ts` — `collectDestroyAllTargets` + `orderTargetsForDelete` + `resolveDestroyAllProject`. 27 tests. Commit `7cf988d`.
- ✅ **rf-deploy-12** `services/scheduler-callbacks.ts` — `makeSchedulerCallbacks`. 32 tests. Commit `a4f287b`.
- ✅ **rf-deploy-13** `services/destroy-runner.ts` — `attemptDestroy` + `emitDestroyLifecycle`. 21 tests. Commit `dbc7313`. Learning `inline-catches-can-have-inconsistent-error-message-derivations`.
- ✅ **rf-deploy-14** `services/quota-retry.ts` — `retryAfterQuotaCleanup` + `hasQuotaFailure`. 26 tests. Commit `1fa9198`.
- ✅ **rf-deploy-15** `services/canvas-overlay.ts` — `getNodeDeploymentOverlay`. 36 tests. Commit `9b37da3`.
- ✅ **rf-deploy-16** `services/drift.service.ts` — `checkDrift`. 23 tests. Commit `982d3b2`.
- ✅ **rf-deploy-17** cleanup — 7 re-exports dropped, 2 imports trimmed, drift test migrated. 392 tests passing in service-deploy. Commit `1e43f7e`. Learning `reexport-audit-distinguish-namespace-imports-from-named-imports`.

**rf-props — `properties-panel.tsx` (3268 → 94)**

26-unit blueprint at [`blueprints/rf-props.md`](blueprints/rf-props.md). 5 leaf utils → fields bundle + 4 hooks → 14 section subcomponents → orchestrator + 1 cross-file dedup. Behavior-risk flags: custom-domain-panel rendered twice (rf-props-15), dynamic imports with shifting relative paths (rf-props-20), setState-during-render fallback (rf-props-24a/b).

- ✅ **rf-props-1..5** utils — `queue-spec` / `normalize-subdomain` / `edge-warnings` / `format-age` / `deploy-history-format`. Commits `5629b1b` / `88d383f` / `d356718` / `47a91f8` / `093bda5`.
- ✅ **rf-props-6** `components/fields/index.tsx` — Section + 8 input components. Commit `112b8d9`. Learning `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`.
- ✅ **rf-props-7** `hooks/use-resource-map.ts` — `useResourceMap` + `usePropertyIssues`. Commit `28bacc2`. Learning `extract-pure-builders-when-testing-redux-or-effect-hooks-in-node-env`.
- ✅ **rf-props-8** `hooks/use-drift-check.ts`. Commit `206ca4d`. Learning `capture-ref-after-render-unlocks-100pct-on-callback-returning-hooks`.
- ✅ **rf-props-9** `components/fields/render-property-field.tsx` — orchestrator + canonical home for resource-def types. **312 LOC removed.** Commit `12507f5`. Learning `mocked-component-data-attrs-invisible-to-direct-fc-walker`.
- ✅ **rf-props-10..14** sections — `drift` / `group-color-picker` / `connection-card` / `env-vars-editor` / `scaling+domain`. Commits `ca54041` / `b11e275` / `dbd6dc7` / `efa8340` / `7748b32`. Learnings `react-ssr-comment-markers-split-adjacent-text-substrings`, `collect-text-helper-joins-adjacent-jsx-children-with-a-separator`, `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`.
- ✅ **rf-props-15** `sections/custom-domain-panel.tsx` — BEHAVIOR-RISK; both callsites preserved byte-identical. Commit `b1fd1e0`. Learning `test-prop-shape-when-extraction-preserves-an-unused-prop`.
- ✅ **rf-props-16** `sections/private-network-panel.tsx`. Commit `4648712`. Learning `tree-walker-must-invoke-file-private-fcs-when-extracted-component-keeps-an-inner-helper`.
- ✅ **rf-props-17** `sections/repo-deploy-list.tsx`. Commit `29c4731`. Learnings `use-state-mock-with-mutable-ref-unlocks-direct-fc-toggle-state-tests`, `dynamic-import-of-api-adapter-needs-a-direct-vi-mock-on-the-target-module`.
- ✅ **rf-props-18..19** `service-source-section` / `deploy-history`. Commits `6645227` / `9efc48b`. Learnings `jsx-html-entities-render-as-the-actual-unicode-character-not-the-escape-sequence`, `queued-ref-dispatch-extends-the-mutable-ref-usestate-mock-to-multi-state-fcs`.
- ✅ **rf-props-20** `sections/pipeline-section.tsx` — BEHAVIOR-RISK dynamic-import paths. Commit `3d781f5`. Learning `dynamic-import-with-default-destructure-needs-the-mock-to-expose-default`.
- ✅ **rf-props-21** `sections/source-repository-section.tsx`. Commit `6cc2dae`. Learnings `use-memo-must-be-mocked-too-when-the-extracted-component-uses-it`, `nullish-coalesce-default-in-test-helper-silently-clobbers-explicit-null-overrides`.
- ✅ **rf-props-22** `sections/edge-properties-section.tsx`. Commit `ed2193c`. Learning `render-helper-must-not-call-mockreturnvalue-after-test-overrides`.
- ✅ **rf-props-23** `sections/project-overview.tsx`. Commit `00caaa2`.
- ✅ **rf-props-24** `sections/node-properties-section.tsx`. Commit `6dfd890`.
- ✅ **rf-props-26** cost-utils dedup — BEHAVIOR-CHANGE. Local `parseCostRange` / `formatCost` replaced with imports from canonical `packages/ui/src/features/cost/utils/cost-calculator.ts`. 19 tests at canonical home + 3 behavior-delta tests in consumer. 1464 unit tests passing. Learning `canonical-home-dedup-of-local-copies-is-a-behavior-change-when-the-canonical-is-stricter`.

**rf-canv — `svg-canvas.tsx` (3234 → 909, then 570 → 453 in final round)**

28-unit blueprint at [`blueprints/rf-canv.md`](blueprints/rf-canv.md). 8 utils + 14 hooks + 8 subcomponents + 1 dispatch registry. Behavior risks pinned with tests: predicate broadening (rf-canv-2/6), wrapper key reconciliation (rf-canv-10), dispatch-factory innerKey shape (rf-canv-12), edgeStyle real type (rf-canv-15), RTK frozen-state test pattern (rf-canv-19). Key commits `7d2f1e6` (rf-canv-1) through `ec17722` (cleanup) and `fac4fb7` (rf-canv-28+29).

**rf-pdpl — `deploy-panel.tsx` (2229 → 262)**

24-unit blueprint at [`blueprints/rf-pdpl.md`](blueprints/rf-pdpl.md). 5 leaf utils → 8 leaf subcomponents → 3 composing → 3 hooks (Redux + side-effects) → orchestrator. 12 behavior-risk flags including: useDeployEffects 4-effect bundle, retry-after-auth re-dispatch ordering, React.memo boundary on DeployNodeRow, startDestroying-before-await ordering, classifyDeployError single-regex preservation, ✓/✗ glyphs, createPortal+Esc listener owned by destroy-confirm modal.

- ✅ **rf-pdpl-1..5** utils — `provider-regions` / `open-external-url` / `dns-records` / `results-summary-text` / `error-classification`. Commits `382b13c` / `f540531` / `090cf3d` / `d7828e5` / `545ba78`. Learning `regex-i-flag-applies-to-character-classes-not-just-the-literal`.
- ✅ **rf-pdpl-6..13** subcomponents — `status-badge` / `plan-preview` / `auth-banner` / `deployed-resources-list` / `log-panel` / `dns-records-section` / `destroy-confirm-modal` / `deploy-node-row`. Commits `ca5610b` / `95ca71d` / `510c3fa` / `7e4c2e3` / `a4cd9b0` / `b66becb`+`deaa096` / `8d4b0b5` / `2e01211`. Learnings `collecttext-regex-sweep-fails-because-join-erases-key-boundaries`, `react-element-ref-is-not-on-the-public-reactelement-type`, `defensive-or-fallback-after-pre-filter-is-an-unreachable-branch-95-pct-ceiling`, `react-namespace-hook-access-requires-patching-default-export-too`, `stubbing-window-and-keyboardevent-for-node-env-keydown-listener-tests`, `react-memo-wrapper-must-be-unwrapped-via-dot-type-for-direct-fc-tree-walker`.
- ✅ **rf-pdpl-14..16** composing — `deploy-in-flight-panel` / `results-summary` / `quota-error-banner`. Commits `5277103` / `69e7f0e` / `2c9943b`. Learnings `vi-mock-paths-resolve-relative-to-test-file-not-source-file`, `lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates`, `lucide-react-aliased-icons-displayname-tracks-target-not-binding`.
- ✅ **rf-pdpl-17..19** banners + section + controls — `api-error-banner` / `config-section` / `deploy-controls`. Commits `24b1617` / `e1a3bea` / `6b3f6ae`. Learning `prop-capturing-mock-fc-needs-drain-and-reset-for-tree-walker-tests`.
- ✅ **rf-pdpl-20..22** hooks — `use-deploy-actions` / `use-deploy-effects` / `use-destroy-action`. Commits `0192cf5` / `f3a760c` / `969a6c4`. Learnings `redux-toolkit-unknown-action-payload-needs-double-cast-via-unknown`, `fingerprint-multi-useEffect-by-deps-array-shape-when-bundled-in-one-hook`, `vitest-spyon-return-type-on-console-needs-loose-shape-cast-for-mock-calls-iteration`.
- ✅ **rf-pdpl-23+24** orchestrator + housekeeping. RISK #12 (`gcpNodes` alias) deferred per blueprint as a follow-up rename.

**rf-ctrans — `card-translator.ts` (1585 → 401)**

12-unit blueprint at [`blueprints/rf-ctrans.md`](blueprints/rf-ctrans.md). 2 utils → 5 type-maps/extractors/dispatch → 3 passes → orchestrator. 9 behavior-risks pinned including: generate_stable_name hash seed (RISK #1), map_edge_relationship default branch, REDIS_SIZE_MAP tier strings, extract_subnet_properties hash-CIDR, Pass 1.4 unconditional overwrite, Pass 1.45 subdomain priority, Pass 1.5 forwarding-rule triple-mutation + BackendEntry post-push.

- ✅ **rf-ctrans-1** `utils/name-utils.ts`. Commit `bc4a55b`. Learning `pnpm-filter-core-test-with-path-arg-needs-root-relative-not-package-relative`.
- ✅ **rf-ctrans-2** `utils/stable-name.ts`. Commit `28dd0e5`.
- ✅ **rf-ctrans-3** `type-maps.ts`. Commit `dd33334`. Learning `brief-vs-source-default-branch-discrepancy-on-get-type-map`.
- ✅ **rf-ctrans-4** `edge-classifier.ts`. Commit `1872670`.
- ✅ **rf-ctrans-5..8** extractors — `compute` / `database` / `network` / `ancillary`. Commits `56302cc` / `62c5d93` / `80f90d1` / `a5d9f58`.
- ✅ **rf-ctrans-9** `extractors/dispatch.ts`. Commit `3b4e35e`.
- ✅ **rf-ctrans-10** `passes/pass-1-4-repo-wiring.ts`. Commit `2f2c252`. Learning `graph-nodes-keyed-by-type-colon-name-not-bare-name` (latent bug, fixed in bugfix-1).
- ✅ **rf-ctrans-11** `passes/pass-1-45-domain-propagation.ts`. Commit `a5f9228`. Learnings `if-routeid-branch-no-fallthrough`, `stash-discards-untracked-files`.
- ✅ **rf-ctrans-12** `passes/pass-1-5-endpoint-wiring.ts`. Commit `3a6b088`. Learning `test-fixture-nodeid-mapping-cascades-into-synthetic-names`.
- ✅ **rf-ctrans-13** orchestrator absorbed into housekeeping.

**rf-cards — `cards-slice.ts` (1195 → 162)**

16-unit blueprint at [`blueprints/rf-cards.md`](blueprints/rf-cards.md). 5 utils → 9 reducer groups → orchestrator. 11 behavior-risks: Immer two-field atomicity, two-pass position update, applyEdgeRoutes ordering, \_lastSnapshotAction module-level coalescing, cascadeContainerReflow eslint-disable, clearCardDeployOverlay 24-field completeness, ingestion-path migration parity, groupSelectedNodes Z-order, scaleLayoutForZoom intentional `scaleX/Y = 1`, JSON deep-clone, non-memoized inline selectors.

- ✅ **rf-cards-1..3** utils — `types` / `migration` / `edge-routes`. Commits `4659ec2` / `47c0953` / `7f9173b`. Learnings `brief-import-list-may-include-transitively-referenced-types`, `jsdoc-comment-block-closes-on-asterisk-slash`, `stacked-jsdocs-precede-only-the-immediate-next-decl`.
- ✅ **rf-cards-4..5** helpers — `persistence` / `snapshot`. Commits `bec0639` / `fe79306`. Learning `reset-module-let-via-synthetic-call-not-vi-resetModules`.
- ✅ **rf-cards-6..14** reducer groups — `card-lifecycle` / `node-edge-add` / `node-position` / `node-data` / `node-delete-merge` / `import` / `auto-organize` / `scale-blueprint` / `undo-redo-group`. Commits `68bd112` / `e948336` / `3c7d72d` / `d4d7224` / `4863356` / `dcd57a8` / `4ff90d5` / `dc9295b` / `ff39d4b`+`6a9a95a`. Learnings `brief-numerics-are-approximate-source-is-canonical`, `relative-import-depth-must-be-recounted-when-moving-deeper`, `delete-vs-undefined-test-must-use-in-operator-not-strict-equality`, `vi-mock-with-mutable-result-needs-let-not-mockReturnValue`, `immer-revoked-proxy-from-spy-args-needs-deep-clone`, `hard-coded-constant-risk-pin-needs-call-with-meaningful-input`, `reducer-bails-after-prologue-side-effect-is-still-observable`.

**rf-fbh — `firebase-hosting.ts` (1140 → 422)**

11-unit blueprint at [`blueprints/rf-fbh.md`](blueprints/rf-fbh.md). 3 utils + 2 transport/site + 4 workflow modules + orchestrator. 14 behavior-risks: placeholder HTML verbatim with U+2713 glyph, tar parser block alignment + octal sizes, REST `validateStatus: () => true`, Firebase project 409/400 dual-meaning, GitHub fetch auth bypass, SHA256 over GZIPPED payload, 5-step version publish sequence, four DNS response shapes, project-scoped custom-domain path, three-tier domain registration fallback.

- ✅ **rf-fbh-1..3** utils — `result-helpers` / `site-utils` / `tar-parser`. Commits `bd050e7` / `55d9a5f` / `ddeee52`. Learnings `prior-unit-may-leave-future-proofing-import-that-fails-lint-now`, `git-stash-pop-conflicts-with-tsconfig-tsbuildinfo`.
- ✅ **rf-fbh-4..5** transport+provisioning — `rest-client` / `site-provisioner`. Commits `5fb42a9` / `4687242`. Learning `vi-hoisted-and-vi-mock-blocks-must-not-split-import-groups`.
- ✅ **rf-fbh-6..9** workflow — `github-downloader` / `version-publisher` / `dns-extractor` / `domain-registrar`. Commits `2a39fe8`+`1998b83`+`12387f4` / `05854b9` / `56f9d0d`+`69deb91` / `38e3d22`. Learnings `absence-of-headers-must-be-asserted-via-init-equality-not-property-check`, `fixture-hashes-must-be-derived-from-mock-transform-output-not-guessed`, `or-chain-default-fallback-needs-its-own-test-for-100pct-branch-coverage`.
- ✅ **rf-fbh-10+11** orchestrator + housekeeping absorbed.

**rf-parse — `parser.ts` (1061 → 184)**

8-unit blueprint at [`blueprints/rf-parse.md`](blueprints/rf-parse.md). Approach B chosen: standalone functions taking `ParserState` interface; `Parser` class becomes constructor + delegation shell. 14 behavior-risks pinned including: ps_consume no-advance, synchronize two exits, type-identifier silent dot-skip, create_span name collision, parse_equality operator ternary, parse_postfix error-but-continue, 10-level precedence chain order, parse_primary pre-advance snapshot, **parse_for_expression key/value identity** (highest-risk), parse_reference path undefined, parse_block zero-label nested, unknown-attribute discard advances cursor, output_block emits both error AND null literal, import_statement non-`"as"` silent discard.

- ✅ **rf-parse-1** `parser-state.ts` — `ParserState` interface + 9 ps\_\* navigation helpers. 31 tests. 147 callsites replaced. Commit `92778f7`. Learning `sed-greedy-dot-star-eats-chained-calls-on-one-line`.
- ✅ **rf-parse-2** `parser-literals.ts` — 6 helpers. 23 tests. 67 callsites. Commit `2f7a3f7`. Learning `sed-empty-arg-substitution-glues-state-to-next-token`.
- ✅ **rf-parse-3+4** `parser-binary-exprs.ts` + `parser-primary.ts` — combined atomically due to circular import resolved at function-call time. 94 tests. Commit `667df94`. Learning `bootstrap-fnarg-vs-direct-import-for-circular-grammar-pair`.
- ✅ **rf-parse-5+6** `parser-block-body.ts` + `parser-statements.ts` — 4 block parsers + 5 statement parsers. 31 tests. Commit `2ee35e5`. Learning `co-locate-mutually-recursive-helpers-to-skip-cycle-bootstrap`.
- ✅ **rf-parse-7+8** orchestrator absorbed into housekeeping. Class is dispatch shell: constructor + `parse()` + `parse_program()` + `parse_statement()`.

**Phase 1 / 2 / 3 / Final-round detail trail.** Per-file LOC deltas, commits, and learning anchors are tracked in `state/refactor-targets.md` (the per-file scoreboard) and the individual `state/blueprints/rf-*.md` files. `git log` per series gives unit-by-unit detail.

### 2026-04-29 — refactor agents and state scaffolds

- ✅ **rf-0a agent + state scaffolds** — `.claude/agents/{decomposer,util-broker,test-author}.md` and `state/{refactor-targets,shared-modules}.md` written. Decisions entry appended.
- ✅ **rf-0b coverage tooling (root only)** — `@vitest/coverage-v8 4.1.5` installed at root; root `vitest.config.ts` configured with v8 provider, json-summary + html reporters; `pnpm test:coverage` script wired. CI gate deferred.
- ✅ **rf-0c registry seed** — util-broker indexed 198 entries to `state/shared-modules.md`. Three cross-package duplicates flagged: (1) iceType classifier set across `@ice/types` / `@ice/core` / `@ice/ui`; (2) `mapStatusToOverlay` (server) vs `mapWireStatusToOverlay` (UI); (3) `isContainer` (`@ice/types`) vs `is_container_type` (`@ice/core`). All three now in current In flight.

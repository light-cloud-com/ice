# Learnings

Append-only. Each entry has a kebab-case `##` anchor, a `_Discovered_` line, and one paragraph.

**Rules**

- New learnings: append. Never edit past entries.
- The one allowed edit to a past entry is appending a `_Promoted to: /docs/<path>_` line once the learning has stabilized — cited 3+ times, or generalizes beyond one unit — and has been written up in `/docs`.
- To supersede or contradict a past learning, append a new entry that references the old anchor.

---

## read-state-first

_Discovered: 2026-04-27 by orchestrator in unit setup_

Every agent reads `.claude/state/decisions.md` and `.claude/state/learnings.md` before acting on a brief. Without this, agents redo investigations the rest of the workflow has already settled, miss explicit decisions about how to approach a class of problem, and rediscover the same gotchas the critic flagged last week. Reading state is the cheapest step in the loop and the highest-leverage; skip it and the rest of the loop wastes effort.

## destroy-needs-terminal-state

_Discovered: 2026-04-27 by orchestrator in deploy-panel destroy fix_

The destroy onConfirm handler used to dispatch `appendLog(...)` then `resetDeploy()` in the same tick — `resetDeploy` wipes `state.logs` and sets status `'idle'`, so a fast destroy looked silently inert. Fix: dedicated `destroyed` `DeployStatus` + `destroySuccess` reducer that flips to it and pushes a final summary log. Generalizes: any terminal-state action that clears its own log is indistinguishable from failure; always land on a non-idle status long enough for the human to see what happened.

## one-status-source-deploy-status

_Discovered: 2026-04-27 by orchestrator in compact-node status unification_

The compact-node status pill used to read `(data.deploy_status as string) || (data.status as string) || ''`. The fallback turned `data.status` (seeded `'active'` by templates/blueprints/WAF defaults/svg-canvas drop handlers/cards-slice/drift checker) into the de-facto source. Fix: drop the legacy fallback in `compact-node/index.tsx`, stop seeding `status: 'active'` at every node-creation site. Generalizes: when two parallel state fields exist for the same UX concept, the fallback turns one of them into the de-facto source no matter how careful the writer side is. Pick one and delete the others.

## svg-canvas-isLogNode-precedes-renderer-map

_Discovered: 2026-04-27 by implementer in LT-1-consolidate-icetypes_

`svg-canvas.tsx`'s dispatcher loop has two parallel routing layers for the same iceType: an early `isLogNode` short-circuit (~L2715) that always wins, AND a `CONCEPT_NODE_RENDERERS` map (~L135) consulted later. So when LT-1 added `Monitoring.Log` to `isLogNode`, the existing `'Monitoring.Log': SvgObservabilityNode` map entry became dead code. Generalizes: any iceType special-cased in an early branch should NOT also live in the catch-all map — invitation to subtle behavior splits. The "what counts as a log node" set is also duplicated across `expand-blueprint.ts:173`, `svg-canvas.tsx:2634`, and `gcp/type-mapper.ts:87`; LT-5 should export a single shared `LOG_ICE_TYPES` set from `@ice/constants`.

## data-version-bump-migrates-not-wipes

_Discovered: 2026-04-27 by critic in LT-1-consolidate-icetypes review_

The cards-slice load path treats a version bump as cause to wipe `localStorage` and start fresh, then runs `migrateCardNodes` only on already-current-version payloads. Result: a v5 → v6 bump deletes the user's canvas instead of migrating. Same shape recurs in any reducer that accepts external nodes/edges (`importToActiveCard`, `addToActiveCard`, `addNodeToCard`) — backend-saved canvases, AI tool-use writes, clipboard imports all bypass the localStorage migrator. Generalizes: write the migration as a pure function over the payload and call it from every ingestion site.

## deploy-service-package-name-is-service-deploy

_Discovered: 2026-04-27 by implementer in LT-2-filter-resolver_

The deploy service's `package.json` name is `@ice/service-deploy`, not `@ice/deploy`. `pnpm --filter @ice/deploy typecheck` silently no-ops (filter matches zero packages, exit 0). Always verify the filter target exists by reading `services/<name>/package.json` first; `pnpm -r typecheck` from the repo root is a safer fallback when uncertain.

## google-cloud-logging-getentries-not-entries-list

_Discovered: 2026-04-27 by implementer in LT-3-log-stream-service_

The `@google-cloud/logging` Node SDK's surface is `Logging.getEntries(opts)` and `Logging.tailEntries(opts)` — NOT the REST API names `entries.list` / `tailLogEntries`. Each `Entry` carries envelope fields under `entry.metadata` and payload under `entry.data` (string for textPayload, object for jsonPayload). `tailEntries`'s `data` event delivers a `TailEntriesResponse` with `entries: Entry[]`, not a single Entry. Don't map REST shape to SDK shape one-to-one — read the `.d.ts` first. Also: the IAM probe in tests inflates the `getEntries` call counter by one; mock the probe as an explicit early branch (`if (call === 1) return [[]]`).

## google-cloud-logging-loaded-via-load-sdk-from-core

_Discovered: 2026-04-27 by implementer in LT-3-log-stream-service_

`@google-cloud/logging` is declared in `packages/core/package.json` and loaded via the dynamic-import wrapper `load_sdk(module_name)` in `packages/core/src/deploy/providers/gcp/sdk-loader.ts`. The deploy service does NOT have it as a direct dep — re-export `load_sdk` from `packages/core/src/deploy/index.ts` and use `(await core.load_sdk('@google-cloud/logging')).Logging` to construct. Generalizes: any GCP SDK referenced from a service outside `packages/core` should go through `load_sdk`.

## auth-derived-orgid-must-not-trust-body

_Discovered: 2026-04-27 by implementer in LT-4-routes-and-socket_

If a route spreads `req.body` into a service call that takes `organisationId`, a client can spoof `organisationId: 'evil'` and route the credential lookup to a different tenant. Mitigation: build the args object explicitly with `{ ...validatedBody, organisationId: req.organisationId }` AFTER body validation so auth-derived value always wins. Generalizes: any service-layer function whose argument record mixes client-controlled and auth-derived fields needs an explicit assembly step at the route boundary.

## supertest-not-in-monorepo-use-fetch-against-app-listen

_Discovered: 2026-04-27 by implementer in LT-4-routes-and-socket_

Repo has zero supertest. For HTTP-level Express router tests: `express() + app.use('/path', router) + app.listen(0, '127.0.0.1', ...)` (port 0 = ephemeral), capture `server.address().port`, then `fetch(\`http://127.0.0.1:${port}\`)`. Node 22's built-in `fetch` plus `http.Server` is enough — no extra deps. Cleanup in `afterEach` via `server.close(...)`.

## frontend-cannot-import-from-services

_Discovered: 2026-04-27 by implementer in LT-5-frontend-wiring_

The frontend (packages/ui) cannot import types from services/ — workspace topology has no path. For shared API contracts: (a) inline-mirror in the consuming slice (cheap, accept drift), (b) lift to `packages/types/src/<domain>.ts` (canonical for cross-package types), or (c) keep two parallel definitions with a runtime decode/validate at the boundary. One consumer = mirror; two+ = promote.

## socket-room-and-http-lifecycle-are-two-cleanups

_Discovered: 2026-04-27 by implementer in LT-5-frontend-wiring_

The Log Terminal subscription has TWO independent server-side resources to release on unmount: Socket.IO room membership AND the polling/tail loop opened by HTTP `/subscribe`. Skipping room emit leaves handler-closure leaks; skipping HTTP unsubscribe leaks a 60s polling loop hammering Cloud Logging quota. Cleanup order: stop listeners → leave room → POST unsubscribe → dispatch teardown. Third edge: user unmounts WHILE initial `/subscribe` POST is in flight — the cancelled-flag still completes and creates a server-side stream. Fix: in the cancelled branch, fire a best-effort `unsubscribe(result.subscriptionId)`.

## properties-panel-section-nodeId-vs-selectedNode-prop-shape

_Discovered: 2026-04-27 by implementer in LT-6-properties-section_

Per-iceType branches in properties-panel.tsx thread `selectedNode={...}` + `updateNodeField(field, value)` callback. `MonitoringLogSection` instead takes a single `nodeId: string` prop and re-resolves both cards and logs slices through Redux, dispatching `updateCardNodeData` directly — because it's the first per-iceType section reading from a slice OTHER than `cards`. Generalizes: per-iceType section reading outside cards → use `nodeId` prop shape; section that only mutates `cards` → keep `selectedNode + updateNodeField`.

## ux-log-terminal-pitfalls

_Discovered: 2026-04-27 by ux-tester in LT-9-ux-test/reverify_

Five sibling Log Terminal correctness gaps: (a) on-canvas `LogHeader`'s "LIVE" badge reads only local `isAutoScroll`, never `status` from `useLogStream` — pre-deploy/connecting/error states say "LIVE" on canvas while properties pill is correct. Generalizes: two surfaces showing the same state must read from the same source. (b) Store-level persistence subscriber's `cardHash(card)` excludes `node.data.*`; `streamingMode` flip never persists. Generalizes: content-hash skip that excludes a mutation surface is a silent data-loss path. (c) `api.logs.unsubscribe` POSTs `{ subscriptionId }` only — the route's middleware demands `projectId`/`cardId` → every unsubscribe returns 400, polling loop leaks. Generalizes: cleanup endpoints are still authenticated endpoints. (d) `logs:resumed` handler unconditionally promotes to `'streaming'`; backend tail-reconnect retries even when SDK unavailable → "LIVE" badge despite `source.state === 'pre-deploy'`. Fix: gate on the same "only promote from connecting" check `appendEntry` uses. (e) 12 subscribe→unsubscribe pairs in 2s after one click — `useEffect` deps include `sourceNodeIdOverride` from non-memoized `node.data` read, fresh reference per render. Generalizes: useEffect with object-shape deps in a hot render path silently DDoSes its own backend.

## use-selector-primitive-projection-vs-derived

_Discovered: 2026-04-27 by implementer in LT-9-bugfix-2_

When a hook's `useEffect` dep is "derived from a Redux blob" (e.g. `node.data.streamingMode`), do the projection INSIDE `useSelector`, not OUTSIDE it. Returning the parent `node` and reading `node?.data?.streamingMode` downstream forces the consumer to re-render on every cards-slice publish (Object.is on the parent fails). Project to the primitive inside the selector so `useSelector` can short-circuit. Add a runtime `typeof value === 'string'` guard inside the selector to close gaps with type-system optimism during init. Generalizes: useSelector projects; component code consumes the projection.

## debounced-persist-creates-stale-backend-reads

_Discovered: 2026-04-27 by implementer in LT-bugfix-stale-edges_

The canvas's persistence subscriber debounces saves by 2000ms. When a backend route resolves anything off the persisted card row, it sees state two ticks ago — a fast "draw edge → click block" reads pre-edge data and the source resolver returns `none`. Fix: pass the live frontend state explicitly in the request body (e.g. `candidateSources`) and have the backend prefer it; keep Prisma read as a fallback. Generalizes: any backend route that joins on a row written by a debounced client-side persist subscriber is a correctness footgun. Lift the inputs into the request body, or flush the persist before the route fires.

## one-shot-resolution-needs-state-trigger

_Discovered: 2026-04-27 by implementer in LT-bugfix-postdeploy-resubscribe_

A subscription that resolves once at subscribe time is fine ONLY if every condition the resolver checks is also captured in the effect's deps. `useLogStream`'s `candidateFingerprint` projected `<sourceId>><iceType>` — enough for "edge added/removed" but NOT for "user deployed → `data.deploy_status = 'active'`". The deps ignored `deploy_status`, so the placeholder said "Deploy this environment to start streaming logs" hours after a successful deploy. Fix: extend projection to `<sourceId>><iceType>><deployStatus>`. Generalizes: any "subscribe-once + resolve-once" hook must include EVERY field the resolver inspects in its deps fingerprint.

## ux-real-deploy-needs-clean-gcp-precondition

_Discovered: 2026-04-27 by ux-tester in LT-10-real-deploy-blocked_

Before kicking off any "real cloud" UX run, list every relevant resource (`gcloud run services list`, `gcloud sql instances list`, etc.) and verify the canvas is `idle`. The LT-10 attempt found the project already had 1 Cloud SQL + 6 Redis + a "Deploying… 23%" badge from a prior abandoned session — pushing fresh Deploy on top would double the leak (~$250/mo in active leak) and corrupt the timing measurement. Generalizes: real-deploy UX runs need a `gcloud`-based pre-flight that fails fast if the project isn't clean. Cleanup is the orchestrator's job, not the ux-tester's.

## ux-deploy-real-cloud-pitfalls

_Discovered: 2026-04-27 by ux-tester in LT-10-deploy-attempts_

Three sibling traps from real-cloud deploy UX runs: (a) "already exists" is treated EITHER as adopt-gracefully OR hard-fail across consecutive runs against the same partial state — UI must call out which path was taken, silence reads as "engine broken"; (b) the bottom-of-canvas progress pill X% is per-resource, not overall, so it resets to 0% on each resource transition (looks like the deploy stalled) — show step N/M or weight by total work, or drop the canvas pill; (c) when an orchestrator's "world is in state X" brief contradicts a `gcloud` pre-flight, trust `gcloud`. Generalizes: any agent acting on "world is in state X" from another agent must independently verify when cost-of-wrong is real-world side-effects.

## scheduler-ready-list-must-reserve-per-handler-cap

_Discovered: 2026-04-28 by implementer in pdl-1_

`ParallelChangeScheduler.collect_ready` reserved against global `pool_size` but called `can_take_slot` which read `this.handler_in_flight` — incremented LATER in `dispatch`. With three `gcp.sql.databaseInstance` siblings and cap=1, the first iteration saw `handler_in_flight === 0` for all three and returned them all. Fix: track BOTH `pool_reserved` and `handler_reserved` as local Maps inside `collect_ready` itself. Generalizes: any "two-phase scheduling" loop where dispatch mutates the bookkeeping the collect phase reads MUST do its own within-phase reservations.

## scheduler-resource-name-vs-graph-node-id-vs-canvas-node-id

_Discovered: 2026-04-28 by implementer in pdl-1_

Three identifiers travel through the deploy stack: (1) **canvas node id** (user-facing block id from `cards-slice.nodes[i].id`), (2) **graph node id** (`${type}:${name}` from `MutableGraph.add_node`), (3) **resource name** (sanitized hash-suffixed cloud-resource name). The brief said "`change.id` traces to `deployables.node_id`" but the actual chain: `change.id == graph_node_id`, NOT canvas node id. The mapping `graph_node_id → canvas_node_id` lives in `card-translator.ts`'s `deployables[]`. Inside the scheduler we emit `node_id = graph_node_id`; pdl-4 (service layer) translates to canvas id. Generalizes: when three identifiers exist for the "same thing", each layer's events carry the most-stable id available; the boundary translates.

## cloud-build-helper-substep-shares-outer-index

_Discovered: 2026-04-28 by implementer in pdl-3_

The `on_step` contract is "1-based, monotonic, never exceeds total". When a slow handler (cloud-run) delegates a multi-minute sub-operation (cloud-build), the naive "let the helper emit its own indices" blows the contract. Fix: keep ALL build-helper sub-states at the SAME outer index (`(_inner, label) => reportStep(2, label)`) so the consumer sees the label refresh in place. Test detail: the cloud-build-helper sleeps `BUILD_POLL_INTERVAL_MS = 10_000`; switch from `vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 20 })` to plain `vi.useFakeTimers()` + explicit `await vi.advanceTimersByTimeAsync(15_000)` to keep tests fast. Generalizes: any nested-handler call where the inner work is one logical step should pin its sub-states to the outer index.

## socket-service-module-scoped-io-needs-vi-resetmodules-per-test

_Discovered: 2026-04-28 by implementer in pdl-2_

`packages/shared/src/socket/service.ts` keeps the Socket.IO server in a module-scoped `let _io` written once by `setupSocketService`. That makes the module stateful across tests in the same file — a test that sets up the server leaks `_io` into the next test. Each `it` should `vi.resetModules()` then `await import('../socket/service.js')` to get a pristine module, with `vi.restoreAllMocks()` in `afterEach`. Generalizes: any module owning mutable singleton state needs `vi.resetModules()` between tests in the same file. Smoking-gun symptom: "test A passes alone, B passes alone, both pass in either order, but the third added later flakes."

## seq-allocation-must-be-shared-between-wire-and-log

_Discovered: 2026-04-28 by implementer in pdl-4_

The wire contract requires every `DeployEvent` to carry a monotonic `seq` so reconnecting clients can dedupe. Two separate counters (one for live emit, one for persistent log) drift: the same logical event ends up with seq=N on the wire and N+1 in the DB row. Fix: split into `nextDeploySeq(cardId)` allocator + `recordDeployEvent(cardId, seq, type, payload)` consumer; allocate first, set on `event.seq`, fire wire helper, THEN pass same seq to recordDeployEvent. For events outside an active deploy, `nextDeploySeq` returns null and we fall back to `Date.now()`. Generalizes: any "live emit + persistent log" pair where consumers reconcile across both sides must share the sequence number from a single allocator.

## graph-id-vs-canvas-id-translation-is-service-layer-job

_Discovered: 2026-04-28 by implementer in pdl-4_

The scheduler's `NodeStatusEvent.node_id` carries `${type}:${name}` (graph node id), NOT canvas node id, despite the original JSDoc. The wire contract requires the CANVAS id (frontend keys `nodesById` on it). Translation happens exactly once at the service layer, against a `graphIdToCanvasId` map built ONCE per deploy from `translation.deployables[]`. On a missing translation, DROP the wire emit + warn — emitting with sentinel id silently miscorrelates status to the wrong block. Destroy/rollback don't have the map (walk historical deployments) so they emit log lines instead. Generalizes: when three identifier spaces flow through a layered system, every wire-contract field has ONE definition of which space's id it carries; the service layer is the right place to translate.

## point-types-at-source-not-dist-in-workspace-packages

_Discovered: 2026-04-28 by orchestrator in pdl-4 critic-fix pass_

`@ice/core`'s `package.json` `types` field pointed at `./dist/index.d.ts` while every other workspace package (`@ice/blocks`, `@ice/db`, `@ice/templates`, `@ice/shared`, `@ice/types`, `@ice/ui`, all six services) points at source. Consumers use `moduleResolution: bundler` which doesn't enforce node16's TS2834 file-extension rule, so the 29 pre-existing core errors don't propagate. After repointing `types: ./src/index.ts`, the local mirror in deploy.service.ts could be dropped and cross-package imports work. Generalizes: when a TS workspace package needs to expose a type to peers, point `types` at source; the dist-d.ts pattern only makes sense for published packages outside the monorepo.

## wire-contract-pdl-pitfalls

_Discovered: 2026-04-28 by critic in pdl-4 review_

Two sibling wire-contract gotchas: (a) `BlockRequirementStatus` is uniquely keyed on `(card_id, node_id, environment, requirement_id)` but `DeployRequirementVerifiedEvent` initially carried only `card_id` + `requirement` — frontend reducer can't disambiguate "the cert flipped" between two custom-domain blocks on the same canvas. Fix: every key field on the wire, plus optional `details`. (b) Two incompatible `seq` schemes on single `deploy:event` channel — deploy-tape uses small monotonic ints, requirement-poller uses `Date.now()`. Fix: JSDoc spells out the scheme on the offending field — "route by `event.type` first, then sort within each scheme". Generalizes: when freezing a wire contract for a composite-key row, every key field must be on the wire; when one channel carries multiple event types with different sequencing, expose the discrimination at the type level.

## frontend-channel-flip-needs-eager-init-callsite-sweep

_Discovered: 2026-04-28 by implementer in pdl-7_

A "channel rename" is really a triple-rename: the constant, the listener method, AND every callsite. Renaming the API method (`onDeployEvent`) and the interface gets you typecheck enforcement on most callsites, but TypeScript is happy with `api.onDeployProgress` returning `undefined` for an optional method on the interface — it silently breaks the eager-init handshake-warming loop. There were three callsites in pdl-7 (eager-init, live listener, deploy-panel `requirement_verified` watcher); missing any one would have been a real regression. Keep the unsubscribe room emit (`subscribeDeployProgress`) named the same — that's the room-join, not the event listener.

## test-the-channel-name-constant-not-the-string

_Discovered: 2026-04-28 by implementer in pdl-7_

The pdl-7 channel-flip test asserts `expect(channel).toBe(DEPLOY_EVENT_CHANNEL)` — importing the same constant from `@ice/types` that the http-api-adapter does. Writing the literal `'deploy:event'` would compile and pass today, but a future rename would silently green-light backend/frontend disagreement. Generalizes: when a constant exists to give two sides of an interface a single source of truth, the test for that interface must import the constant too.

## pdl-7-wire-contract-trims-downstream-ui

_Discovered: 2026-04-28 by critic in pdl-7 review_

Three sibling regressions from dropping `DeployResult.results` and `error` from `DeployCompleteEvent` while preserving `outcome` + `totals`: (a) async-path `state.results` stays at wire-mirror only — output-derived UI (DNS records, Cloud Run URL, custom domain pill, api_enable_url CTAs) goes blank until reload. Fix: dispatch `hydrateDeployFromHistory({...})` in the `complete` handler. (b) `state.error` is null after wire-only completion → `<ApiErrorBanner error={deploy.error}>` renders empty even on outcome='failure'. Same fix (DB row carries `error: string`). (c) `mapWireStatusToOverlay` produces `'queued'`/`'skipped'` strings that don't exist as keys in `STATUS_COLORS` (fall back to green/active) AND parallel server-side `mapStatusToOverlay` collapses `queued | applying → 'deploying'` (blue) — same node renders inconsistently across paths. Fix: add `'queued': '#f59e0b'` + `'skipped': '#94a3b8'` keys; align both mapping functions. Generalizes: when freezing a wire contract that drops fields downstream UI consumed unchanged, explicitly add a re-fetch path; every overlay-string mapping value must exist in the consumer's table; every parallel mapping must produce identical strings.

## react-memo-on-rollup-component-instead-of-shallowequal-on-selector

_Discovered: 2026-04-28 by implementer in pdl-5_

The wire-event path produces a new `nodesById` reference per reducer write (10+ events/sec during deploy). Adding a separate `useSelector(s => s.deploy.nodesById)` with `shallowEqual` would cost an extra subscription without changing parent re-render frequency (parent already selects whole slice). The cheaper fix: keep prop-drilling `nodesById` from the existing whole-slice selector into a `React.memo`-wrapped child (`DeployInFlightPanel`), and run `useMemo([nodesById])` for the rollup INSIDE the child. The memo invalidates only on actual reference change. For independent components (canvas banner, status-bar) with their own subscriptions, DO use `shallowEqual`. Generalizes: a `useSelector` returning a non-primitive blob is acceptable WHEN downstream consumers are `React.memo`-wrapped; pick by which side of the tree owns the blob.

## destroy-status-and-action-aware-row-labels

_Discovered: 2026-04-28 by implementer/critic in pdl-5_

Two destroy-path gaps: (a) the legacy deploy panel's progress UI gated `status === 'deploying'` only — destroy went through with no live progress. Fix: widen to `(status === 'deploying' || status === 'destroying')`. (b) `node.status` carries lifecycle but NOT action; the same wire shape covers create AND delete, so a destroy-applying row showed "DEPLOY", destroy-succeeded showed "LIVE" — contradiction. Fix: thread `node.action` into badge label override, swap `applying → DESTROY`, `succeeded → GONE` when `action === 'delete'`. Generalizes: audit every `status === 'X'` gate against every status the backend emits; per-row UI rendering events from a multi-action backend must compose its label from `(action, status)`, not status alone.

## ux-pdl-smoke-test-pitfalls

_Discovered: 2026-04-28 by ux-tester in pdl-smoke-test_

Three sibling smoke-test traps: (a) newly-dropped blocks have no `provider` on `node.data`; deploy panel filters them out as "skipped — non-GCP" even when project provider is GCP. Fix options: default at drop, treat absent as matching, or surface as panel dropdown. Generalizes: any per-node setting whose absence routes to "skipped" must default at creation OR render "needs config". (b) Static Site has a hard pre-deploy requirement (GitHub repo) — bad pick for "minimum viable canvas" smoke tests. Storage.Bucket × N is better (no requirement). Generalizes: prefer block types whose handlers don't fan out into requirements. (c) 3 buckets destroyed cloud-side, but `nodesById` cleared to count=0 immediately and stayed empty — destroy wire events don't land. Generalizes: when a wire-contract claim is made about parity between two operations, the smoke test must drive both ends and confirm; passing the create side alone is necessary but not sufficient. Also: deploy panel keeps stale requirement cards around when the underlying block is deleted (requirement reactivity is per-card, lazy).

## pdl-10-destroy-snapshot-and-dedup-traps

_Discovered: 2026-04-28 by implementer/critic in pdl-10_

Three bugs that surface together when destroy starts emitting per-resource `node_status` events: (a) `nextDeploySeq(cardId)` returns null without an active snapshot, so destroy emits fall back to `Date.now()` ms — breaks dedup-on-reconnect. Fix: `startDeploySnapshot(cardId, destroyRecord.id)` after creation, `finishDeploySnapshot` before every return. (b) Frontend slice keys dedup on `node_id` only; after deploy, `last_seq=9`, destroy allocates fresh seq=1, reducer sees `9 >= 1` → silently DROPS every destroy event. Fix: reset `last_seq` on new operation, or key dedup by `(deploymentId, node_id)`, or stamp every event with `deployment_id`. (c) `destroyAllForCard` opens a snapshot but lacks top-level catch to close it — engine throw leaves stale snapshot pointing at terminal `destroyRecord.id`. Compare `destroyDeployment`'s proper try/catch/finally with `finishDeploySnapshot('failed')` in catch. Generalizes: anywhere you emit `node_status` events you also need a snapshot; any "monotonic seq for dedup" guard outliving the operation needs scope-agreement; any stateful resource needs try/catch/finally on EVERY exit path.

## deploy-service-test-script-and-typecheck-traps

_Discovered: 2026-04-29 by implementer in rf-deploy-1_

Three workspace ergonomic gotchas in `services/deploy`: (a) repo-root vitest sets `globals: true` but `services/deploy/tsconfig.json` doesn't include `@types/vitest` — bare `describe/it/expect` runs but fails typecheck. Convention: `import { describe, it, expect, vi, beforeEach } from 'vitest'` at top of every test file. Always pair test run with package typecheck on brand-new files. (b) `pnpm --filter @ice/service-deploy test` is a silent no-op — the package has no `test` script. Run via `pnpm exec vitest run services/deploy/src` or `pnpm test:unit`. Coverage: `pnpm test:coverage -- services/deploy/src/<path>`. (c) Pre-commit hook bumps root `package.json` `version` on every commit and stages the change; cannot opt out without `--no-verify` (banned). Commits always include `package.json`; never assume commit == files you `git add`ed.

## vi-spyon-accumulates-across-it-blocks-without-explicit-reset

_Discovered: 2026-04-29 by implementer in rf-deploy-3_

A `beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); })` is NOT enough — re-calling `vi.spyOn` on the same target returns the SAME spy and its `mock.calls` carries over. Fix: `vi.restoreAllMocks()` inside `beforeEach` BEFORE the re-spy, or `warnSpy.mockClear()` at the top of each `it`. Restore is cleaner because it tears down the mock between describe blocks too. Generalizes: any spy on a shared global (console.*, Date.now, fetch) needs explicit per-test reset.

## core-const-lifetime-varies-per-callsite-when-extracting-deployer-factory

_Discovered: 2026-04-29 by implementer in rf-deploy-5_

When extracting `createDeployer(provider)` to dedupe `if aws / else if azure / else GCP` blocks following `const core = await getCoreEngine()`, do NOT blindly delete the preceding `getCoreEngine()` line at every callsite. Three of four use `core` only for deployer destructure (line dies after replacement), but the apply path also feeds `translate_card_to_graph`/`deploy_graph` ~250 lines later, and rollback uses `core` for `MutableGraph`. Verify with `grep -n "core\." deploy.service.ts | head -50` BEFORE deleting any `getCoreEngine()` call. Generalizes: when collapsing duplicated code that destructured different fields off a shared const, audit per-callsite before deleting the const.

## vi-fn-default-type-rejects-typed-callback-parameter

_Discovered: 2026-04-29 by implementer in rf-deploy-6_

`const log = vi.fn();` widens to `Mock<Procedure | Constructable>`, NOT assignable to a specific callback signature like `(msg: string) => void`. Vitest runtime is happy; `tsc --noEmit` flags TS2345 at every callsite. Fix: intersection type — `let log: ((msg: string) => void) & ReturnType<typeof vi.fn>; log = vi.fn() as ((msg: string) => void) & ReturnType<typeof vi.fn>;`. Generalizes: any unit test passing a `vi.fn()` mock to a SUT parameter with non-`any` callback type needs explicit signature on the mock — via generics or intersection.

## vi-mock-factory-hoist-blocks-top-level-class-references

_Discovered: 2026-04-29 by implementer in rf-deploy-8_

When a `vi.mock(...)` factory needs to expose a class so SUT's `instanceof Foo` checks survive the mock, the class **must be declared INSIDE the factory closure**, not at the test file's top level. Vitest hoists `vi.mock` above all top-level statements (not just imports — `class`, `let`, `const` too), so a top-level `class MockDeployLockError extends Error {}` blows up at module load with `ReferenceError: Cannot access ... before initialization`. The reported stack frame points at the SUT's import line — misleading. Fix: move class body inside factory and re-export through the mocked module. Grab via `const MockDeployLockError = (deployLocks as any).DeployLockError` after SUT import.

## emit-log-gate-must-mirror-original-truthiness-not-count

_Discovered: 2026-04-29 by implementer in rf-deploy-10_

When extracting an inline emitLog inside `if (lastDeploy?.results)` where the count comes from a pre-filter projection (`prevResources.filter(r => r.success).length` BEFORE the `&& res.resource_id` filter), the natural-looking refactor `if (foundCount > 0) emitLog(...)` is NOT behavior-equivalent. Two divergence cases: (a) `results` truthy with zero successes — original logs "Found 0 existing resource(s)…", refactor stays silent; (b) original counts 5 successes but refactor counts 3 added nodes. Fix: return TWO signals — `hasResults` boolean AND a `foundCount` mirroring the original count projection. Generalizes: when extracting a logging callsite, the helper has to expose both the gate predicate and the message inputs as their original projections.

## inline-catches-can-have-inconsistent-error-message-derivations

_Discovered: 2026-04-29 by implementer in rf-deploy-13_

`destroyDeployment`'s catch did `error: err.message` (bare) for `deleteResults.push` AND `emitLog`, but `err.message || String(err)` for `emitDestroyNodeStatus.error.message` — three uses, two normalizations, three lines. Extracting to a per-item helper that surfaces a single normalized `error: string` silently UPGRADES the deleteResults push and the log line to "always a string". For Error throws this is invisible; for non-Error throws (thrown string/object/number) the deleteResults entry's `error` field changes from `undefined` to stringified value. Generalizes: when an inline catch has multiple uses of `err.message` with inconsistent fallbacks, hoisting picks one normalization for all uses — note explicitly in the report.

## reexport-audit-distinguish-namespace-imports-from-named-imports

_Discovered: 2026-04-29 by implementer in rf-deploy-17_

A literal grep for `import { X } from '<path>'` undercounts consumers — `import * as foo from '<path>'` then `foo.X` downstream is also a real consumer. In rf-deploy-17, `routes/canvas-deploy.ts` did `import * as deployService from '../services/deploy.service'` then dispatched `deployService.checkDrift(...)` — those re-exports were load-bearing precisely because of the namespace pattern. Always run TWO greps per symbol: `import { X }` AND `<namespace>.X`. Tests binding to canonical home via `await import('../utils/<module>.js')` don't count toward "keep the re-export"; the re-export only stays for callers genuinely routing through the orchestrator path.

## tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays

_Discovered: 2026-04-29 by implementer in rf-props-6_

When writing component tests in node-only vitest (no jsdom), invoking the `React.FC` directly to inspect its returned element tree, the walker has to flatten nested arrays in `props.children` arbitrary-depth. Any component using `value.map(...)` produces an array as one child of a parent's `children` array — so children is `[<header>, [<itemA>, <itemB>, <itemC>], <footer>]`. A naive `Array.isArray(children) ? children : [children]` flattens the outer level; the inner array then gets handed to recursive `walk(child)` which tries `.props.children` on an array (TypeError). Fix: make the walker recurse into arrays explicitly before treating a node as an element: `if (Array.isArray(node)) { for (const c of node) yield* walk(c); return; }`. Order matters: array check before element-property access.

_Promoted to: /docs/refactoring-patterns.md_

## extract-pure-builders-when-testing-redux-or-effect-hooks-in-node-env

_Discovered: 2026-04-29 by implementer in rf-props-7_

When extracting a custom hook in this monorepo, the test environment can't run `useEffect` (no jsdom under `renderToString`) and can't drive state updates (no `@testing-library/react`). A `renderToString`-based smoke test only fires the synchronous `useState` initializer + any `useSelector`; extracting the hook's inner branching as a pure named export gives full branch coverage on the load-bearing logic. Pattern: peel `useResourceMap`/`usePropertyIssues` into thin wrappers around `buildResourceMap(data)` / `buildPropertyIssuesMap(issues, selectedNodeId)`, test the builders directly. Hook tests touching redux must live in `.tsx` (Provider's children prop is required). Generalizes: any future hook with non-trivial branching downstream of useState/useSelector should plan for two named exports — the hook + a pure builder.

_Promoted to: /docs/refactoring-patterns.md_

## capture-ref-after-render-unlocks-100pct-on-callback-returning-hooks

_Discovered: 2026-04-29 by implementer in rf-props-8_

A `useCallback`-returning hook hits a different ceiling than a `useEffect`-driven hook: callback body never runs during `renderToString` but CAN run after, in plain async test code. Render once via `<Provider><Probe /></Provider>`; `Probe` writes the hook's return value into a captured-ref object; post-render call `await captured.current.checkDrift()` and assert against `store.getState()` and `vi.spyOn(store, 'dispatch')`. Combined with `vi.mock('../../../../shared/api/axios-instance', ...)` (note four `..` segments) you get a real Redux store wired to actual reducers, controllable POST mock per-test, and freedom to drive full success/error/empty branches. Coverage on callback hooks: 100/100/100/100. Spy on `store.dispatch`, `mockClear()` after render-time setup, assert on the exact ordered list of action types — catches both ordering regressions and accidental extra dispatches.

_Promoted to: /docs/refactoring-patterns.md_

## vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests

_Discovered: 2026-04-29 by implementer in rf-props-14_

When extracting a section that composes multiple primitives from the same module, mock the module so each primitive is identifiable by reference (`el.type === MockStepperField`). `vi.mock` factories run hoisted before module-level statements; declaring `const MockStepperField = vi.fn()` at module scope hits a TDZ. Use `vi.hoisted`: `vi.hoisted(() => ({ MockSection: vi.fn(), MockStepperField: vi.fn(), ... }))`. Side traps to avoid: (a) DO NOT wrap each mock in another arrow inside the factory — creates a fresh wrapper each render, walker can't find anything; (b) DO NOT reach for `require('react')` inside `vi.hoisted` — direct-FC invocation never runs the mock body anyway. Empty `vi.fn()` bodies are sufficient — the walker descends through `MockSection.props.children` natively.

_Promoted to: /docs/refactoring-patterns.md_

## tree-walker-must-invoke-file-private-fcs-when-extracted-component-keeps-an-inner-helper

_Discovered: 2026-04-29 by implementer in rf-props-16_

The standard direct-FC walker descends only through `el.props.children`. That breaks the moment the extracted component renders a file-private inner FC and most load-bearing JSX lives inside that helper's body — `PrivateNetworkPanel` returns `<div><PrivateNetworkPolicySection .../><PrivateNetworkPolicySection .../></div>` and every radio + allowlist lives inside the inner FC. The walker yields `<PrivateNetworkPolicySection>` as a leaf and never sees the radios.

Fix: extend the walker to invoke any FC element it encounters that is NOT the mocked primitive. The check is `typeof el.type === 'function' && el.type !== mocks.MockSection` — if true, call `el.type(el.props)` and yield from the resulting subtree. Mocked primitives stay as leaves (matched by reference equality), but file-private helpers from the source module get unrolled. The walker becomes a hybrid: a tree-walker for primitives + mocked components, an evaluator for non-mocked FCs. Don't invoke React class components or memoized FCs without a guard — `typeof el.type` would be `'object'` for those.

Pair with `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests` (still mock primitives by reference) and `mocked-component-data-attrs-invisible-to-direct-fc-walker` (find mocks by props-shape when their body would have rendered DOM).

_Promoted to: /docs/refactoring-patterns.md_

## use-state-mock-with-mutable-ref-unlocks-direct-fc-toggle-state-tests

_Discovered: 2026-04-29 by implementer in rf-props-17_

For a FC using `useState`, calling without renderer context throws. Mocking naively only lets you test one state value per factory hoist. Fix: hoist a *mutable ref* (`expandedIdRef = { current: null }`) into the `vi.mock('react', ...)` factory and have the mocked `useState` read from it on every call: `useState: vi.fn(() => [expandedIdRef.current, setStateSpy])`. Per-test, mutate `expandedIdRef.current` *before* calling the component. Same `setStateSpy` captures every `setExpandedId(...)` call. Pair with `useDispatch` mock returning a captured `dispatchSpy`. Sub-pattern (rf-rpal-9 `keepSlots` flag): for effect-coverage tests needing to pre-seed across renders, extend `__resetUseState({ keepSlots?: boolean })` — call counter resets but slot values stick.

## dynamic-import-of-api-adapter-needs-a-direct-vi-mock-on-the-target-module

_Discovered: 2026-04-29 by implementer in rf-props-17_

A *dynamic* `import('../../../shared/api/api-adapter').then(({ getApi }) => ...)` inside a closure is mocked exactly the same way as static imports — vi resolves dynamic-imports through the same module-mock registry. A single `vi.mock('../../../../../shared/api/api-adapter', () => ({ getApi: () => ({ ... }) }))` at the test-file's relative path covers both. The await chain inside the handler runs on microtasks, so `await new Promise(r => setTimeout(r, 0))` *twice* (once for `import()` resolution, once for the `.then(...)` chain) before asserting. Sub-rule: when source destructures `default` off the awaited dynamic-import (`import('...').then(({ default: _, ..._mod }) => ...)`), the mock factory MUST include `default` key, even if the test never reads it.

## queued-ref-dispatch-extends-the-mutable-ref-usestate-mock-to-multi-state-fcs

_Discovered: 2026-04-29 by implementer in rf-props-19_

The single-ref `useState` mock handles components with **one** `useState` call. For N≥2 calls, queue them: hoist N refs and N setter spies into `vi.hoisted`, plus a `callIdx` counter and a per-render `__resetUseState()` hook closed over the counter. The `useState` mock looks up `dispatch[callIdx]` (a function returning `[ref.current, setSpy]` for that slot), increments, returns. Every `renderHistory(...)` resets the counter so a fresh render deals slots starting at 0. Pair with one-time `useEffect` mocking that fires the callback synchronously: `useEffect: vi.fn((cb, deps) => { effectCallbacks.push(cb); effectDeps.push(deps); void cb(); })`. The slot-by-call-index pattern unblocks asserting on per-setter calls and on `setExpanded((prev) => ...)` updater functions — capture via `setterSpy.mock.calls[0][0]` and run on test inputs.

_Promoted to: /docs/refactoring-patterns.md_

## use-memo-must-be-mocked-too-when-the-extracted-component-uses-it

_Discovered: 2026-04-29 by implementer in rf-props-21_

When the extracted FC body calls `useMemo(() => ..., [deps])`, the standard hook mock leaves `useMemo` untouched and React's `useMemo` reads `null.useMemo` → TypeError. Fix: extend the `vi.mock('react', ...)` factory with `useMemo: vi.fn((factory, _deps) => factory())`. Same shape for `useCallback`: `useCallback: vi.fn((cb, _deps) => cb)`. The eager-factory mock has no behavior cost — every call runs the factory, which is what an un-memoized FC body would do anyway.

## test-helper-defaults-traps-coalesce-and-spread

_Discovered: 2026-04-29 by implementer in rf-props-21/22, rf-cstor-4, rf-aichat-3_

Three sibling test-helper traps: (a) `props.activeCard ?? makeCard()` swallows explicit `null` overrides intended to test guard branches — fix with `'activeCard' in props ? props.activeCard : makeCard()`. Same with `||` and falsy values. (b) Helper that bundles "reset everything" with `mockClear` AND `mockReturnValue([])` REPLACES whatever the test set with `mockReturnValueOnce(...)` two lines before. Fix: helper does ONLY `mockClear`; move behavior defaults to `beforeEach`. (c) `{ ...defaults, ...overrides }` is NOT a deep merge — `defaults.iam = { getPolicy, setPolicy }` overridden by `overrides.iam = { getPolicy: vi.fn() }` drops `setPolicy`, SUT crashes. Fix: spread per-sub-shape explicitly. Generalizes: helpers handing nested-object mocks need awareness of which shapes are deep-overrideable; `??`/`||` defaults swallow null/falsy overrides.

## canonical-home-dedup-of-local-copies-is-a-behavior-change-when-the-canonical-is-stricter

_Discovered: 2026-04-29 by implementer in rf-props-26_

Two callsites had inline `parseCostRange` (regex `\$(\d+)(?:[–-](\d+))?` — INTEGER-only) and one had local `formatCost` (`return value === 0 ? '' : '~$' + Math.round(value) + '/mo'`). Pointing them at the canonical home (`packages/ui/src/features/cost/utils/cost-calculator.ts` with regex `\$([\d,]+(?:\.\d+)?)`, `replace(/,/g,'')`, formatCost returning `'Free'`/`'< $0.01/mo'`/etc.) is **strictly a behavior change**: (a) `'$1,000-2,000'` averages to 1500 not 1.5 (off by 1000×), (b) `'$0.50'` returns 0.5 not 0, (c) `formatCost(0)` returns `'Free'` not `''`. Bullet (c) is gated at every callsite by `totalCost > 0` so `'Free'` is unreachable. Verify the gate per-callsite before declaring dedup safe. Lock with: invariant tests at the canonical home + behavior-delta tests at the consumer + regression test that gated transitions are still hidden. Generalizes: any "dedup the local copy to the canonical home" unit MUST diff regex/formula between implementations and treat divergence as behavior change.

## export-type-from-does-not-bring-name-into-local-scope

_Discovered: 2026-04-29 by implementer in rf-canv-1_

When extracting a leaf type module that the orchestrator file still uses internally, `export type { CanvasNode } from './types';` is NOT enough. The forward keeps the name visible to outside importers, but inside `svg-canvas.tsx` itself the symbol is not in lexical scope — every internal alias breaks with `Cannot find name`. Fix: pair the re-export with a sibling `import type { CanvasNode } from './types';`. Looks redundant but does different jobs: re-export aliases for downstream importers; import brings the binding into THIS module's scope.

## inline-classification-duplications-are-not-actually-duplicates

_Discovered: 2026-04-29 by implementer in rf-canv-2/6/8/9_

When a brief lists N "near-identical" sites for dedup, build a feature×site truth table FIRST (predicate, selection rule, iteration direction, exclusion shape, side-effects-in-loop) — let the table dictate how many distinct utils + how many "leave inline + flag" sites you end up with. The count is rarely 1↔N. rf-canv-2 listed 5 inline `isGroup`/iceType checks but L1488/L1612/L2647 ARE equivalent (fold to `isContainerNode`) while L414, L546, L1139 each have unique axis combinations. rf-canv-6 listed 4 hit-test loops resolving to 3 distinct patterns (smallest+predicate, no-predicate-smallest, no-predicate-reverse-iterate). rf-canv-8 `pickPreviewColor`'s `if (connectionDragTargets)` short-circuit produces different colors for null Map vs empty Map. rf-canv-9's `computePortMap.getSide` uses `>` while sibling `computeConnectionPreviewPath` uses `>=` (inverted tie-break, AST-similar but visually distinct). Pin verbatim with "Mirror of X; do NOT cross-port" comments where divergence is load-bearing. Generalizes: AST-similarity is misleading; the asymmetry is load-bearing.

## brief-test-spec-vs-verbatim-behavior-conflict

_Discovered: 2026-04-29 by implementer in rf-canv-7_

The rf-canv-7 brief listed Test 6 as: "Edge already has same source+target → not a conflict." The verbatim inline block does NOT exclude the candidate edge from the lookup, so re-drawing the same edge still matches itself as conflict. The brief's spec would have required an "exclude self" predicate the inline block never had — implementing it would silently change behavior under same-drag scenarios. Right move: preserve verbatim filter, write Test 6 to PIN that fact (commented "preserves verbatim behaviour … intentionally"). Generalizes: when a brief's test-spec list and its "verbatim, no behavior change" constraint disagree, ALWAYS resolve in favor of verbatim and pin the actual behavior in a test with a comment surfacing the disagreement. Critic should look for test names like "preserves verbatim behaviour: …".

## extracted-wrapper-key-must-mirror-original-closure-outer-key-chain

_Discovered: 2026-04-29 by implementer in rf-canv-10_

When a per-iteration closure (`wrapLift = (content) => isLifted ? <g key={id}>{...}</g> : isAnimating ? <g key="anim-${id}">{content}</g> : content`) gets refactored into a `<NodeLiftWrapper>` subcomponent inside `sortedNodes.map(...)`, the brief's natural shape `<NodeLiftWrapper node={...}>{<SvgX key={...}/>}</NodeLiftWrapper>` silently elides the wrapper's OWN `key` prop. Inner-element keys still render verbatim but are now SOLE children — React reconciliation under a single-child parent doesn't consult those keys. Without explicit `key` on `<NodeLiftWrapper>`, React falls back to array index → mass-remounts on `sortedNodes` reorder. Fix: compute `wrapperKey(innerKey)` at the orchestrator's per-node loop mirroring the original priority chain (`isLifted ? id : parentId ? "clipped-${id}" : isAnimating ? "anim-${id}" : innerKey`) and pass as wrapper's `key`. Per-call-site `innerKey` differs; must be a parameter. Generalizes: every extraction that lifts a closure-returning-keyed-JSX into a subcomponent inside `.map(...)` MUST add an outer `key` prop derived from the original closure's priority chain.

## dispatch-factory-must-return-innerkey-when-call-site-derives-outer-wrapper-key

_Discovered: 2026-04-29 by implementer in rf-canv-12_

Building on `extracted-wrapper-key-must-mirror-original-closure-outer-key-chain`: when extracting a registry-style dispatch (iceType + node.type → component) into `renderCanvasNode(node, ctx)` while keeping `<NodeLiftWrapper>` at the call site, the obvious factory signature returning `React.ReactNode` is *insufficient*. The wrapperKey priority chain needs the per-branch `innerKey` in its FALLBACK branch — and the innerKey differs per dispatch arm. Right shape: 2-tuple return `{ element, innerKey }`, where the factory authoritatively names the branch's reconciliation key. Generalizes: any "extract a dispatch factory but keep a wrapper at the call site" — the factory MUST hand back any per-branch reconciliation values the wrapper's outer-key chain depends on.

## vi-hoisted-required-for-shared-mock-identities-across-many-vi-mock-calls

_Discovered: 2026-04-29 by implementer in rf-canv-12_

The natural test pattern for a registry/dispatch-table extraction with N concrete dependencies (rf-canv-12 had 25 leaf `Svg*` components) is to declare each as a top-level `const MockSvgX: React.FC = () => null` then `vi.mock('../../nodes/x', () => ({ SvgX: MockSvgX }))`. Vitest hoists every `vi.mock(...)` to the top, but does NOT hoist the `const` declarations — `ReferenceError: Cannot access 'MockSvgX' before initialization`. Fix: `vi.hoisted(() => ({ ... }))` is hoisted alongside `vi.mock` calls. Pattern: a single `const mocks = vi.hoisted(() => ({ SvgLogNode: ..., SvgGroupNode: ..., ... }))` declaring all 25 mock FCs, then `vi.mock('...', () => ({ SvgX: mocks.SvgX }))`. Post-import `const MockSvgGroupNode = mocks.SvgGroupNode` aliases keep test bodies readable. Generalizes: any test needing identity-stable mocks across more than ~3 modules should reach for `vi.hoisted` from the start.

_Promoted to: /docs/refactoring-patterns.md_

## brief-prop-type-annotations-may-be-placeholders-not-real-codebase-types

_Discovered: 2026-04-29 by implementer in rf-canv-15_

The rf-canv-15 brief specified `edgeStyle: 'default' | 'dashed' | 'thick' | string` — does NOT match any real value. The actual `EdgeStyle` enum from `'../../../store/slices/ui-slice'` is `'bezier' | 'straight' | 'rectangular'`. Following the brief verbatim would produce a typed-correctly-but-wrong-domain prop. Fix: import `EdgeStyle` from the slice. Generalizes: when a brief contains an inline-string union that looks placeholder-y, grep the actual upstream callsite to find the real enum. Briefs are best-effort summaries of the value space; for any prop fed by a redux selector, the real type lives in the slice. Same shape as `brief-numerics-are-approximate-source-is-canonical` and `brief-import-list-may-include-transitively-referenced-types`.

## browser-observer-mocks-need-stubglobal-plus-a-hoisted-callback-array

_Discovered: 2026-04-29 by implementer in rf-canv-18_

Testing a hook wrapping `ResizeObserver`/`IntersectionObserver`/etc. in node-only vitest needs three pieces: (1) class-shaped stub via `vi.stubGlobal('ResizeObserver', MockResizeObserver)` — NOT `globalThis.ResizeObserver = ...` reassignment which races with Vite's module worker; (2) `vi.hoisted` block owning both captured-callback array AND per-method spies — spies on instance properties (`observe = mocks.observeSpy`), not class methods (vitest's `vi.spyOn` doesn't traverse a constructor called inside `useEffect`); (3) the synchronous-`useEffect` mock additionally stashes the cleanup function (`if (typeof cleanup === 'function') mocks.effectCleanups.push(cleanup);`) so the test can drive disconnect independently of unmount.

Pattern: render via Probe, look up `mocks.observerCallbacks[0]`, build a `ResizeObserverEntry`-shaped fixture with `contentRect: { width, height }`, invoke synthetically, assert on the setter spy. The `>0` guard exercised by zero-valued entries. For "returns the new value" path: write the setter's argument back into the mutable ref the `useState` mock reads from, then re-render. Don't reach for jsdom — a 30-line stub is dramatically faster.

## rtk-store-getstate-is-frozen-use-preloadedstate-not-direct-mutation

_Discovered: 2026-04-29 by implementer in rf-canv-19_

The natural shape for a hook-test harness — `configureStore({ reducer })` then mutate `store.getState().cards.cards = seeded` — fails under RTK's `immutableCheck` middleware: `TypeError: Cannot assign to read only property`. Right pattern: `configureStore({ reducer, preloadedState })`. Derive each slice's default initial state by calling its reducer with `(undefined as any, { type: '@@INIT' })` once at the top of `makeStore`, spread-merge test overrides, pass merged shape as preloadedState. Disable both checks for the harness: `middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false })`. The `(undefined, '@@INIT')` invocation is more reliable than `cardsReducer.getInitialState()` (RTK-only). Pair with `useref-mock-with-hoisted-prefix-ref-unlocks-single-render-effect-deltas`: when a hook's effect-body branch depends on a `useRef` differing from `useState`, mock `useRef` with a hoisted `refForNextRender` container the test pre-primes BEFORE invoking the Probe.

## hook-return-shape-vs-orchestrator-callsite-the-internal-only-dep-trap

_Discovered: 2026-04-29 by implementer in rf-canv-21_

When extracting a hook whose source-block is a chain of `useMemo`s where each downstream depends on the previous (`A → B(A) → C(A,B)`), trim the orchestrator destructure to ONLY values the orchestrator currently reads. After extraction the orchestrator no longer reads `A` directly — it only ever read `A` to pass it as a dep into the inline `useMemo`s for `B` and `C`. Once those memos move INSIDE the hook, `A` becomes closure-private state. Lint signal: `'X' is assigned a value but never used`, only AFTER wire-up. Generalizes: every hook extraction whose source-block had **chained `useMemo`s** should ask for each named local: "does the orchestrator read this DIRECTLY for a JSX prop / further computation, or only via a `useMemo` dep that's now inside the hook?" Only the former survives the destructure. Verify by lint after wire-up and trim back. Counter-rule below: `brief-vs-rf-canv-21-trim-rule-when-the-planner-knows-the-future-callsite`.

## fake-timers-plus-sync-useeffect-mock-needs-pertest-toggle

_Discovered: 2026-04-29 by implementer in rf-canv-22_

When a hook's `useEffect` schedules `setTimeout`-then-cleanup (rf-canv-22's auto-organize: `const timer = setTimeout(..., 100); return () => clearTimeout(timer);`), the harness needs THREE pieces: (1) synchronous-`useEffect` mock so effect body runs and queues against timer engine, (2) `vi.useFakeTimers()` set up in `beforeEach` BEFORE render so queued setTimeout lands on fake clock, (3) `vi.useRealTimers()` in `afterEach` so next test isn't poisoned. Without (2) test passes spuriously (assertion runs before real 100ms timer); without (3) any test that follows hangs. Branch-gated assertions: render → assert dispatch NOT called → `vi.advanceTimersByTime(100)` → assert dispatch called. For mixing pure-callback tests with timer tests, stash a per-test boolean `mocks.syncUseEffect.current` so callback-only tests can flip the effect mock to no-op (default true in `beforeEach`).

## brief-import-drop-list-needs-per-symbol-grep

_Discovered: 2026-04-29 by implementer in rf-canv-24_

The rf-canv-24 brief listed 11 imports to drop after extracting `useCanvasDrop`. TWO are still used outside `handleDrop`: `canContain` (shift-drag-reparent) and `computeCompactNodeHeight` (recalculateAncestorBounds, post-reparent expansion). Mechanically dropping breaks typecheck. Right shape: 2-column truth table `{ symbol: in extracted block? in any other function? }` — drop only when both flip. Generalizes: every extraction-unit brief listing imports to drop must be cross-checked with per-symbol grep over the WHOLE source file before deletion.

## brief-vs-rf-canv-21-trim-rule-when-the-planner-knows-the-future-callsite

_Discovered: 2026-04-29 by implementer in rf-canv-25a/28+29_

The rf-canv-21 trim rule says: drop destructure entries the orchestrator doesn't use. The rf-canv-25a brief explicitly contradicts: keep `recalculateAncestorBounds` etc. in the destructure even though TODAY zero callsites — planner has paired-unit visibility, rf-canv-25b will use them. When brief and prior learning conflict on destructure trimming, side with brief if (1) part of an explicitly-multi-step extraction AND (2) file already carries other unused-destructure warnings as held state — both YES → follow brief, accept transient lint. **Series-end cleanup**: at the END of a series, audit held bets that didn't pay (rf-canv-25b extracted handleNodeMove into a hook so the destructure entries never wired). Run ESLint, grep for unused-warnings, cross-check against introducing brief — if "future consumer at unit Y" landed without consuming, drop. Generalizes: planner's "preserve destructure shape across the split" is correct DURING the series; the rule reverses at series end.

## stateful-hook-with-callback-writes-needs-mutable-usestate-slot-mock-not-real-usestate

_Discovered: 2026-04-29 by implementer in rf-canv-27_

Builds on `capture-ref-after-render-unlocks-100pct-on-callback-returning-hooks` and `use-state-mock-with-mutable-ref-unlocks-direct-fc-toggle-state-tests`. When the extracted hook exposes BOTH a callback that writes state AND a callback that reads it (`handleConnectionPortDown` calls `setDrawingConnection({...})`, `handleConnectionEnd` runs `if (!drawingConnection) return;`), the rf-props-8 capture-ref pattern with REAL `useState` is insufficient: each `renderToString` mounts a fresh component instance, so the write is committed against an instance the next captureHook no longer holds. Adopt the mutable-slot `useState` mock pattern even with ONE state slot. Hoist `drawingConnectionSlot: { current: null | DrawState }`, mock `useState` to read on call and have setter write directly. Tests either drive the write via `result.handleConnectionPortDown(event)` or skip the port-down path entirely by writing the slot directly via a `startDrag(opts)` helper. Generalizes: any future hook whose callbacks BOTH write and read `useState` slots — use mutable-slot from the start regardless of slot count.

## regex-i-flag-applies-to-character-classes-not-just-the-literal

_Discovered: 2026-04-30 by implementer in rf-pdpl-5_

The rf-pdpl-5 brief described `extractProjectIdFromError`'s regex `/project[=/]([a-z0-9-]+)/i` as "rejects upper-case project IDs". Wrong: `/i` applies to the **entire** pattern, including character classes. `[a-z]` under `/i` matches `[A-Za-z]`. So `'project=FooBar'` actually returns `'FooBar'`; `'project=foo-BAR-baz'` matches `'foo-BAR-baz'` greedy. Per `brief-test-spec-vs-verbatim-behavior-conflict`, pin verbatim behavior with a "BRIEF↔CODE NOTE" comment. Generalizes: when a brief makes a claim about a regex's character-class behaviour, independently verify by running the literal in a Node REPL before writing tests; the `/i` flag's reach surprises in both directions. Same applies to `/u` with `\w`/`\d` and `/s` with the dot.

## react-namespace-hook-access-requires-patching-default-export-too

_Discovered: 2026-04-30 by implementer in rf-pdpl-12_

The mutable-ref `useState` mock pattern (`vi.mock('react', () => ({ ...actual, useState: patchedFn }))`) ONLY patches named exports. When source accesses hooks via namespace import — `import React from 'react'; ...; React.useState(...)` — the runtime resolves `React` to the `default` export, which carries its own copy of `useState`. Calls route into the real renderer-context-bound function and throw `TypeError: Cannot read properties of null (reading 'useState')`. Fix: in the `vi.mock('react', ...)` factory, return BOTH `useState` (named) AND `default: { ...actualDefault, useState: patchedFn }`. Applies symmetrically to `useEffect`, `useMemo`, `useCallback`, `useRef`. The `@types/react` namespace doesn't always declare `default`; cast through `unknown`: `(actual as unknown as { default?: typeof actual }).default ?? actual`. Diagnostic stack points at source line; if your factory only returns `{ ...actual, useState: ... }` and you see this, add the `default:` block.

_Promoted to: /docs/refactoring-patterns.md_

## stubbing-window-and-keyboardevent-for-node-env-keydown-listener-tests

_Discovered: 2026-04-30 by implementer in rf-pdpl-12_

Vitest default env is `node` — `window`, `document`, `KeyboardEvent` undefined. When extracted component's `useEffect` registers `window.addEventListener('keydown', ...)`, stub instead of switching env (jsdom adds 100ms+ and pulls a heavy polyfill): (a) `vi.stubGlobal('window', { addEventListener, removeEventListener, dispatchEvent })` with a Map<string, Set<Listener>> tracker so add/remove/dispatch round-trips; (b) `vi.stubGlobal('document', { body: {} })` since `createPortal(el, document.body)` evaluates the second arg even when portal mock ignores it; (c) `vi.stubGlobal('KeyboardEvent', class StubKeyboardEvent { constructor(type, init) { this.type = type; this.key = init?.key ?? ''; } })`. Stub class needs only fields the source's keydown handler reads.

## react-memo-wrapper-must-be-unwrapped-via-dot-type-for-direct-fc-tree-walker

_Discovered: 2026-04-30 by implementer in rf-pdpl-13_

The direct-FC tree-walker invokes the extracted component as `(Component as unknown as Fn)(props)`. For plain function FCs that's fine. For `React.memo`-wrapped components, the runtime export is an object `{ $$typeof: Symbol(react.memo), type: <Inner FC>, compare }` — calling it throws `TypeError: ... is not a function`. Fix: reach for `.type` to get the inner render — `const Inner = (Component as unknown as { type: (p: Props) => React.ReactElement }).type; return Inner(props);`. The walker itself doesn't need changes. Bonus: pin the memo boundary as a separate slot — `expect((Component as { $$typeof: symbol }).$$typeof.toString()).toBe('Symbol(react.memo)')`. The brief should call out "memo'd — unwrap via .type" wherever source has `React.memo(`.

_Promoted to: /docs/refactoring-patterns.md_

## vi-mock-paths-resolve-relative-to-test-file-not-source-file

_Discovered: 2026-04-30 by implementer in rf-pdpl-14_

When a brief specifies "mock the imports the source uses" and lists those paths verbatim — `'../../../i18n'` — it is tempting to copy them unchanged. That is wrong: `vi.mock` resolves relative to the **test file's** location, not the source file's. So if the source lives at `packages/ui/src/features/deploy/components/deploy-in-flight-panel.tsx` (`../../../i18n` → `packages/ui/src/i18n`), the test at `packages/ui/src/features/deploy/components/__tests__/deploy-in-flight-panel.test.tsx` needs ONE more `../`: `'../../../../i18n'`. The diagnostic when this is wrong is subtle: vitest creates a "phantom" module at the (test-relative) path, the mock attaches to that phantom, but the source still imports the real module — test fails with errors from inside the real `useTranslation` (e.g. `TypeError: Cannot read properties of null (reading 'useContext')`). Fix is mechanical: every `vi.mock(path, ...)` in a `__tests__/`-folder test must have one extra `../` segment compared to the source-file's import string for that same module.

_Promoted to: /docs/refactoring-patterns.md_

## lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates

_Discovered: 2026-04-30 by implementer in rf-pdpl-14_

The direct-FC tree-walker descends through React elements by checking `typeof el.type === 'function'`. That breaks for `lucide-react` icon imports — `Loader2`, `RefreshCw`, etc. — because lucide wraps every icon in `React.forwardRef`, producing an *object* `{ $$typeof: Symbol(react.forward_ref), render: <fn> }`, NOT a function. Predicates like `findByPredicate(tree, (el) => typeof el.type === 'function' && (el.props.className ?? '').includes('animate-spin'))` filter the icon out. Fix two ways: (a) drop `typeof === 'function'` guard, predicate purely on className — `findByPredicate(tree, (el) => typeof (el.props.className) === 'string' && el.props.className.includes('animate-spin'))`; (b) check `(el.type as { $$typeof?: symbol }).$$typeof?.toString() === 'Symbol(react.forward_ref)'`. Same gotcha for any forwardRef library (Radix UI primitives, react-aria). Sub-rule: `displayName` won't help either — lucide v0.577+ aliases legacy names (`CheckCircle.displayName === 'CircleCheckBig'` because `check-circle.js` re-exports from `circle-check-big.js`). Filter by **reference equality** on `el.type` against the imported icon — module-singleton identity holds across source/test boundary.

_Promoted to: /docs/refactoring-patterns.md_

## prop-capturing-mock-fc-needs-drain-and-reset-for-tree-walker-tests

_Discovered: 2026-04-30 by implementer in rf-pdpl-18_

When a section module renders a child component twice in the same FC body, the natural pattern mocks the child as an opaque marker FC pushing props onto a hoisted array. Tests read `mocks.iceSelectCalls[0]` for first call, `[1]` for second. Trap: the tree-walker invokes nested FCs as a side-effect of walking, and `findByPredicate` / `collectText` walk THE WHOLE TREE every call. Two walks → mock fires twice → `iceSelectCalls.length` doubles non-deterministically. `vi.hoisted` reset in `beforeEach` doesn't fix it (duplicate pushes happen WITHIN one test). Fix: a `drainIceSelectCalls(tree)` helper that (a) clears the recorder, (b) runs ONE throwaway walk, (c) snapshots into a local array, (d) clears the recorder again. Tests assert against the local snapshot. Generalizes: every test mocking a child component with per-call props-capture AND then tree-walking afterwards needs the drain-and-reset wrapper.

## redux-toolkit-unknown-action-payload-needs-double-cast-via-unknown

_Discovered: 2026-04-30 by implementer in rf-pdpl-20_

When testing a callback hook that dispatches RTK slice actions, `(dispatchSpy.mock.calls[i][0] as { payload: string }).payload` fails with TS2352. RTK 2.x's `Dispatch<UnknownAction>` types the spy parameter as `UnknownAction = { type: string; [extraProps: string]: unknown }` — index signature deliberately doesn't include `payload`. Workarounds: (a) cast through `unknown`: `dispatchSpy.mock.calls[i][0] as unknown as { payload: string }`; (b) helper `function asAction<P>(call: unknown): { type: string; payload?: P } { return call as unknown as ...; }`. The `setImmediate` global is also missing in this monorepo's vitest config — for fire-and-forget promise flushes, use `await new Promise<void>((resolve) => setTimeout(resolve, 0))` wrapped in a `flushMicrotasks` helper. Sub-rule (`vitest-spyon-return-type-on-console-needs-loose-shape-cast-for-mock-calls-iteration`): `let consoleLogSpy: ReturnType<typeof vi.spyOn>` triggers TS7006 on `.mock.calls.find(c => c[0] === '...')`. Fix: tiny local interface `interface ConsoleSpyLike { mock: { calls: unknown[][] }; mockRestore: () => void; }` with `as unknown as ConsoleSpyLike` cast. Same flavor as `vi-fn-default-type-rejects-typed-callback-parameter` and `vi-fn-generic-narrows-mockResolvedValueOnce-arg-to-never-on-optional-fields`: vitest's explicit generics are stricter than runtime.

## fingerprint-multi-useEffect-by-deps-array-shape-when-bundled-in-one-hook

_Discovered: 2026-04-30 by implementer in rf-pdpl-21_

When extracting a multi-effect hook (rf-pdpl-21's `useDeployEffects` bundles four `useEffect` calls), the natural urge is to mock the four bodies separately by stubbing downstream APIs one at a time — brittle. Stash each registration as `{ cb, deps, cleanup }` into a single hoisted `mocks.effects` array, then in tests **fingerprint by deps-array shape** to find the effect under test (`effects[0]` length 1 → auto-scroll; `effects[1]` length 5 → provider auto-detect; etc.). Add `effectByOrder(i)` helper that throws on empty slot. Cleanup-stash is per-effect inline (`effects[i].cleanup`), NOT a flat `effectCleanups[]`. The Provider+Probe+renderToString harness is otherwise identical. When you add a 5th effect that collides on dep-shape (`[isOpen, cardId]` × 2), add a content check or move to named-export pure runners. Coverage on `use-deploy-effects.ts`: 100/100/100/100 with 48 tests.

## pnpm-filter-core-test-with-path-arg-needs-root-relative-not-package-relative

_Discovered: 2026-04-30 by implementer in rf-ctrans-1_

`pnpm --filter @ice/core test packages/core/src/<path>.test.ts --run` exits with `No test files found`. Reason: the script runs `vitest run <path>` with cwd `packages/core/`, but workspace's vitest `include` glob is `packages/*/src/**/*.test.{ts,tsx}` (root-level pattern). Two fixes: (a) `pnpm vitest run --root . packages/core/src/<path>.test.ts` from repo root; (b) `pnpm --filter @ice/core test src/<path>.test.ts --run` (drop the `packages/core/` prefix). When you get `No test files found`, switch to root-level `pnpm vitest run --root .` rather than debugging the filter.

## graph-nodes-keyed-by-type-colon-name-not-bare-name

_Discovered: 2026-04-30 by implementer in rf-ctrans-10_

`MutableGraph._nodes` is `Map<NodeId, Node>` where `NodeId` is the branded form `${input.type}:${input.name}`. The public getter returns this Map directly, so `graph.nodes.get(plainName)` will always miss. Pass 1.4 and 1.45 in `card-translator.ts` both call `graph.nodes.get(name as any)` where `name` comes from `card_id_to_name` (storing bare resource names). Net: in production both passes silently no-op. The `as any` cast hides the type mismatch. Fixed in bugfix-1 via `graph.get_node_by_name(name)` migration across pass-1-4, pass-1-45, pass-1-5; `remove_node` consumer also migrated (it only accepts NodeId, so resolve via `get_node_by_name(name)?.id` first). Test fixtures migrated from bug-bypass `card_id_to_name.set(cardId, branded NodeId)` to production-shape `card_id_to_name.set(cardId, bareName)`. Generalizes: when fixing a latent lookup bug, audit ALL functions in the same flow consuming the same input shape — fixing only the lookup leaves the second consumer broken. Diagnostic: after fixing a `Map.get(x as any)` callsite, grep for any other `Map`/method call taking the same `x`.

## brief-numerics-are-approximate-source-is-canonical

_Discovered: 2026-04-30 by implementer in rf-cards-7_

Briefs that give numeric or named specifics ("20-field array", "the migrator wires Foo to Bar") are best-effort summaries. Real `clearCardDeployOverlay` had 24 fields, not 20; `migrateCardNode` has TWO migration branches not one (`Monitoring.Terminal → Monitoring.Log` data-only AND `Cluster.*/Block.* → Group.*` with type flip). Generalizes: when a brief gives specifics, treat as scaffolding — open the source, count/copy actual values, pin THOSE in tests. Same shape as `brief-import-list-may-include-transitively-referenced-types`, `brief-prop-type-annotations-may-be-placeholders-not-real-codebase-types`, `brief-cited-event-shapes-need-source-of-truth-verification`, `brief-vs-source-default-branch-discrepancy-on-get-type-map`: brief lists/types/numerics are starting points, source files are authoritative.

## relative-import-depth-must-be-recounted-when-moving-deeper

_Discovered: 2026-04-30 by implementer in rf-cards-8_

The rf-cards-8 brief said "the `..` count for canvas-constants is 3 (verified by rf-cards-3)." True for `cards/edge-routes.ts` (3 segments to `src/`). But rf-cards-8 lives in `cards/reducers/node-position.ts`, ONE level deeper, so correct count is 4 (`../../../../config/canvas-constants`). When a sibling cites a `..`-count, that count is anchored to THAT sibling's directory depth, not yours. Generalizes: relative-import depths cited in briefs/learnings are anchored to citing file's directory; when the destination differs, recount segments. Cheaper alternative — convert to a tsconfig path alias (`@ui/config/canvas-constants`) once enough modules cross multiple `..` levels. Same shape recurs at `algorithm-pass-grouping-needs-uniform-import-depth-tracking` and `reducer-group-extraction-i18n-import-depth-from-reducers-folder`.

_Promoted to: /docs/refactoring-patterns.md_

## delete-vs-undefined-test-must-use-in-operator-not-strict-equality

_Discovered: 2026-04-30 by implementer in rf-cards-9_

When pinning that code MUST use `delete node.parentId` (not `node.parentId = undefined`), `expect(node.parentId).toBeUndefined()` passes for BOTH shapes — strict-equality undefined-checks can't tell them apart. Load-bearing assertion: `expect('parentId' in node).toBe(false)` (or `Object.prototype.hasOwnProperty.call(node, 'parentId')`). Only `delete` removes the key from the own-property list; `= undefined` keeps the key with undefined value. Generalizes: any test pinning "must `delete` the key, not assign undefined" must use `'<key>' in obj` — never `obj.<key> === undefined`. Same shape as `hard-coded-constant-risk-pin-needs-call-with-meaningful-input`: assertion has to actually distinguish the two implementations the brief is trying to pin.

## immer-revoked-proxy-from-spy-args-needs-deep-clone

_Discovered: 2026-04-30 by implementer in rf-cards-12_

When testing a reducer invoked via `produce(state, draft => reducer(draft, action))` where the reducer calls a mocked dependency, the `vi.fn()` spy captures references to Immer proxies. Once `produce(...)` returns, those proxies are *revoked* — post-`produce` access throws `TypeError: Cannot perform 'has' on a proxy that has been revoked`. Fix: deep-clone args inside the spy capture: `mockSpy(JSON.parse(JSON.stringify(nodes)), ...)`. The clone runs while the proxy is still live (spy invoked inside reducer body, mid-`produce`). For richer shapes use `structuredClone`. Generalizes: any test asserting on call-args of a function called inside an Immer `produce(...)` callback must clone args at spy-capture time, OR move the `expect` inside the produce callback.

## vi-hoisted-and-vi-mock-blocks-must-not-split-import-groups

_Discovered: 2026-04-30 by implementer in rf-fbh-5_

The natural shape — put `const mocks = vi.hoisted(...)` and `vi.mock("./...", ...)` between `import { ... } from "vitest"` and other imports — triggers eslint `import-x/order` "no empty line between import groups". `eslint --fix` cannot resolve this. Fix: ALL imports contiguously at the top, then `vi.hoisted` and `vi.mock` calls AFTER. Vitest hoists both above any import statement in its pre-execution pass, so hoisting still works. A short comment near the hoisted block saves the next reader from worrying about init order.

_Promoted to: /docs/refactoring-patterns.md_

## git-stash-and-tsbuildinfo-and-prior-unit-lint-traps

_Discovered: 2026-04-30 by implementer in rf-fbh-2/3_

Three workflow gotchas around using stash/lint to verify "is this pre-existing?": (a) earlier units may ship "future-proofing" imports that become immediately unused — pre-commit hook only runs version-bump, no lint gate. Run `pnpm exec eslint --fix` on the orchestrator FIRST when starting any follow-up unit. (b) `pnpm typecheck` writes `tsconfig.tsbuildinfo` as a side-effect, so `git stash → pnpm typecheck → git stash pop` fails with "local changes would be overwritten" and partially applies (source files reverted, new untracked files survive). Recovery: `git checkout <pkg>/tsconfig.tsbuildinfo` then `git stash pop`. Better: skip stash entirely — `pnpm exec tsc --noEmit 2>&1 | grep <my-file>` (empty grep == no new errors). (c) `git stash` without `-u` discards untracked files from the work tree only when the conflict path includes them; check that newly-created files survived the stash dance.

## brief-cited-event-shapes-need-source-of-truth-verification

_Discovered: 2026-04-30 by implementer in rf-dslice-7_

Briefs describing wire events with field names like `{ deployment_id, seq, at, outcome, counts }` are mnemonics, not contracts. Actual `DeployCompleteEvent` from `packages/types/src/deploy-events.ts` uses `card_id` (not `deployment_id`) and `totals` (not `counts`, with extra `queued`/`applying` buckets). Same applies to `DeployNodeStatusEvent` and `DeployNodeProgressEvent`. Building a fixture from the brief surfaces as TS2352. Generalizes: when writing tests for a reducer consuming a typed wire event, EVEN IF the brief gives field names verbatim, open the type file. The generated TypeScript type from `@ice/types` is the contract.

## or-chain-default-fallback-needs-its-own-test-for-100pct-branch-coverage

_Discovered: 2026-04-30 by implementer in rf-fbh-8_

The DNS extractor's `recordSet?.records || recordSet?.checkError?.records || []` — three branches in one expression. Testing the first two yields 96.07% branches on a 100%-line, 100%-function file. Missing branch: literal `[]` fallback when both are absent. Same pattern strikes `if (ds.expectedIps)` against optional-property-on-untyped-bag. Fix: one-liner test per dangling branch passing an object that hits the default. Generalizes: every `a || b || defaultLiteral` chain and every `if (x.optional)` against an `any`-typed bag needs an explicit "default reached" test. 100%-line / sub-100%-branch with one or two specific line numbers flagged is a reliable signal pointing at OR-chain tails or `if (optional)` falsy paths.

## sed-greedy-dot-star-eats-chained-calls-on-one-line

_Discovered: 2026-04-30 by implementer in rf-parse-1_

Bulk callsite-rename `s/this\.check\(\(.*\))/ps_check(this.state, \1)/g` rewrites obvious cases but silently mangles lines with TWO+ chained calls (`this.check('A') || this.check('B')`). Sed greedy-matches `.*` from FIRST `(` to LAST `)`. Two prevention shapes: (a) `s/this\.check(\([^)]*\))/ps_check(this.state, \1)/g` — `[^)]*` won't span the closing `)` so chained calls each rewrite independently; (b) ALWAYS post-sed grep for the old-name pattern before declaring done. Sub-rule (`sed-empty-arg-substitution-glues-state-to-next-token`): `parse_X(this.state\1)` body works for 0-arg cases but `this.parse_X(token)` rewrites to `parse_X(this.statetoken)` — no comma. Always `state, \1` for N-arg helpers, `state\1` for guaranteed-0-arg.

## bootstrap-fnarg-vs-direct-import-for-circular-grammar-pair

_Discovered: 2026-04-30 by implementer in rf-parse-3_

When extracting recursive-descent grammar layers and the call graph forms a cycle (parse_postfix → parse_primary → parse_expression → ... → parse_postfix), direct-import + lazy-evaluation of ESM cycles works as long as: (1) ALL cross-module references are inside function bodies, never at top-level module-init; (2) atomic landing of both files in one commit; (3) both files created before the parser.ts callsite-replace step. TypeScript's typecheck passes, runtime works, all tests pass. Companion rule (`co-locate-mutually-recursive-helpers-to-skip-cycle-bootstrap`): when the recursion cluster is small (rf-parse-5's 4 functions ≈ 145 LOC), co-locate in one file — no cross-module edge, no cycle, no atomic-landing constraint. Cross-module cycles are right only when the cluster is too large to live on one file.

## data-heavy-shim-split-keep-helpers-with-shim-not-data

_Discovered: 2026-04-30 by implementer in rf-data-1_

When splitting a data-heavy module (scale-presets.ts 1562 LOC → types/data/shim trio), helpers that consume the data belong in the public shim file, NOT in the data file. Three reasons: (1) shim is the stable import surface — helpers there means the shim is structurally complete; (2) helpers live with runtime ergonomics; (3) data file's "size exception" header reads as a real exception only when the file contains ONLY data. Shim file ends up at ~58 LOC. Pre-existing typecheck baseline of `@ice/core` carries ~30 TS2834 errors in unrelated files; bar is "no NEW errors in your touched paths". Pre-commit only runs version-bump hook; no typecheck/lint gate.

_Promoted to: /docs/refactoring-patterns.md_

## class-private-brand-blocks-this-as-context-passthrough

_Discovered: 2026-04-30 by implementer in rf-sched-3_

When extracting class methods to standalone helpers taking `ctx: SomeContext`, "pass `this` to the helper because the class fields structurally match" rejects with TS2345: `Property 'foo' is private in type 'TheClass' but not in type 'SomeContext'`. The `private` modifier is a nominal brand. Two fixes: (a) cast at call site (`this as unknown as SomeContext`) — fast, ugly; (b) lift the fields onto a real `private readonly ctx: SomeContext` field, build in constructor, pass `this.ctx` everywhere — clean. Pattern (a) is fine as a temporary stepping-stone inside the same PR series. Generalizes: any class decomposition delegating to standalone helpers should plan for the `ctx` field from unit-1.

_Promoted to: /docs/refactoring-patterns.md_

## scheduler-context-pattern-fits-mutable-state-classes-better-than-pure-helpers-classes

_Discovered: 2026-04-30 by implementer in rf-sched-4_

The conservative decision tree "pure → extract; reads class state only → extract with state arg; writes class state → likely stay" is too conservative once a `ctx: SchedulerContext` mutable handle is on the table — the rf-sqlite shape proves helpers writing ctx (resources_save mutates `ctx.statements`, locks_acquire mutates the lock row) all extract cleanly because writes go through ctx, not `this.x`. For rf-sched-4 every method that mutated `this.in_flight`, `this.handler_in_flight`, etc. extracted to a standalone fn taking ctx; only `run()` stayed on the class. Generalizes: when a class has a mutable state bag already structurally describable, nearly every private method can extract regardless of read/write. With ctx pattern, default to "extract everything" and reserve the class for entry-point orchestration.

_Promoted to: /docs/refactoring-patterns.md_

## tree-walker-collectText-array-children-fallback-for-jsx-button-text-after-icon

_Discovered: 2026-04-30 by implementer in rf-pset-5_

The `collectText` reduction collects only `props.children` whose runtime type is `string`. That misses the most common JSX shape: `<button><Icon />{t('label')}</button>`. React stores those as an array `[<Icon />, 'label']`, not as a string. Fix: extend `collectText` to also iterate `Array.isArray(c)` and pull string elements: `else if (Array.isArray(c)) { for (const item of c) { if (typeof item === 'string') s += item; } }`. Don't recurse — walker already yields children element-by-element via `walk`. This is *not* the same bug as `react-ssr-comment-markers-split-adjacent-text-substrings` (`collectText` *never sees* this text in the first place). Diagnostic: `collectText(tree)` returns parent text but is missing the literal text right after a lucide icon inside the same button.

_Promoted to: /docs/refactoring-patterns.md_

## tree-walker-walks-mocked-fc-output-so-data-stub-attrs-appear-on-rendered-marker-not-original-jsx

_Discovered: 2026-04-30 by implementer in rf-tgal-6_

When testing an orchestrator that renders a child mocked as `<TemplateDetail data-stub="TemplateDetail">{...}</TemplateDetail>`, the rf-rpal-8 tree-walker invokes the mock FC AND walks its output. So a `findByPredicate(tree, (el) => el.props['data-stub'] === 'TemplateDetail')` will match the INNER `<div data-stub="TemplateDetail">` rendered by the mock, NOT the original `<TemplateDetail>` JSX call site. The inner div has only the props the mock copied onto it — it does NOT have `onBack`/`onUse`/`template` from the original call. So a test that does `(detail.props as { onBack: () => void }).onBack` finds `onBack === undefined` and fails with "expected 'undefined' to be 'function'". Two fixes: (a) predicate on the FC-call site directly: `el.type === <MockedComponent>` (reference equality against the imported mock — vitest's `vi.mock` returns the same module-singleton in test and source); (b) predicate on `typeof el.type === 'function'` AND a unique prop the mock copies through (e.g. `el.props.template?.id`). Option (b) is the cleaner pattern when the mocked component has a discriminating prop. The rf-rpal-8 / rf-pdpl tree-walker pattern doesn't separate "FC call site" from "FC output" — `walk` yields BOTH because it yields the original element and then descends into the FC's return value. The mocked FC's output is rendered by the same walker, so `data-stub` markers added by the mock end up as siblings of the original JSX in the iteration. Pair with `react-memo-wrapper-must-be-unwrapped-via-dot-type-for-direct-fc-tree-walker` (which also distinguishes the wrapper from the rendered tree). Generalizes: any future test that mocks a child FC with `data-stub` markers AND wants to read the original call's props should filter on `typeof el.type === 'function'` plus a content discriminator, not on the marker attribute. Diagnostic: `expected 'undefined' to be 'function'` (or any prop coming back undefined) when probing a mocked-component element via its data-stub attribute.

_Promoted to: /docs/refactoring-patterns.md_

## tree-walker-mocked-fc-onclose-prop-not-readable-on-fc-element-after-walk-recursion

_Discovered: 2026-04-30 by implementer in rf-wgal-7_

When testing an orchestrator that renders `<TemplateDetail template={selectedTemplate} onClose={() => setSelectedTemplate(null)} onUse={handleUseTemplate}/>`, the rf-pdpl tree-walker invokes the mock and walks the inner output. A predicate like `typeof el.type === 'function' && el.props.template?.id === 'tpl-a'` SHOULD match the original FC call site BEFORE the mock's inner `<div>` is yielded — but in practice, the FIRST element `find()` returns appears to lack the `onClose`/`onUse` props (`undefined`). I burned ~10 minutes trying to figure out whether the closure was getting stripped, the props were lost during walk, or some other nonsense. The actual fix is much simpler than chasing the FC call site: probe the inner mock-rendered `<button data-stub="close" onClick={onClose}>` directly — the mock DOES copy `onClose` to the button's `onClick`, so a `findByPredicate(tree, el => el.props['data-stub'] === 'close')` returns the button with `onClick: () => setSelectedTemplate(null)`. Asserting `typeof onClick === 'function'` is sufficient to prove the wiring exists. This pattern works any time the test mock implementation copies a callback-prop to a child element's `onClick` (which is exactly what makes the mock "press-able" in the first place). Generalizes: when a direct-FC tree-walker test fails to read a callback prop on an apparently-correct FC call site, switch the assertion to probe the rendered-mock surface that copies the callback. The mock's data-stub markers + onClick prop survive all the walker recursion because they're plain leaf elements. Pair with `tree-walker-walks-mocked-fc-output-so-data-stub-attrs-appear-on-rendered-marker-not-original-jsx` (rf-tgal-6) — both surface when the test author tries to assert on the outer FC-call site instead of the inner mock-rendered surface that's actually press-able.

_Promoted to: /docs/refactoring-patterns.md_

## tree-walker-findall-must-recurse-into-array-children-for-fragment-children

_Discovered: 2026-04-30 by implementer in rf-ptree-7_

The walker's `findAll(el, pred)` typically iterates `props.children` as `Array.isArray(children) ? children : [children]` and recurses into each child. That breaks for components emitting a `React.Fragment` whose children are themselves an array: `{folder.expanded && <>{childFolders.map(...)}{childProjects.map(...)}</>}`. The Fragment's `props.children` arrives as a TWO-level array — outer is Fragment children list, at index `[0]` is the `childFolders.map(...)` array. Treating the inner array as a single element yields undefined. Fix: detect arrays at entry of `findAll` and recurse element-wise: `if (Array.isArray(el)) { for (const c of el) out.push(...findAll(c, pred)); return out; }`. Same pattern for any walker (`collectText`, `findByPredicate`). Generalizes: every direct-FC tree-walker test where the source uses `<>{x.map(...)}{y.map(...)}</>` needs the array-flattening shim. Two lines and harmless on element trees, so safe to inline by default.

_Promoted to: /docs/refactoring-patterns.md_

## subhook-deps-must-be-MutableRefObject-not-RefObject-when-handlers-write-back

_Discovered: 2026-04-30 by implementer in rf-canvint-3_

When extracting a callback-bundle sub-hook from an orchestrator that builds refs via `useRef<T>(initial)`, the natural-looking dep type is `RefObject<T>`. It's wrong. React's `RefObject<T>.current` is **`T | null` and read-only** (TS lib def L151-156); the orchestrator's `useRef<T>(initial)` actually returns **`MutableRefObject<T>`** (T, writable, never null when initialized). Typing sub-hook's deps as `RefObject<T>` triggers TS18047 "possibly null" on every read AND TS2540 "Cannot assign to 'current'" on every write — including verbatim writes the original closure bodies do constantly. Fix: import both `MutableRefObject` and `RefObject`; type orchestrator-owned refs as `MutableRefObject<T>`; reserve `RefObject<T>` only for refs forwarded from external sources.

_Promoted to: /docs/refactoring-patterns.md_

## subhook-stateRef-cross-binding-must-be-orchestrator-owned-when-multiple-subhooks-need-it

_Discovered: 2026-04-30 by implementer in rf-canvint-3_

The rf-canvint plan separated canvas-interactions into mouse-handler (3) and keyboard-handler (4) sub-hooks. One ref crosses the boundary: `spaceHeldRef` — keyboard sub-hook WRITES on keydown/keyup, mouse sub-hook READS on mousedown for the Space+left-click pan branch. Defining `spaceHeldRef` inline at the keyboard sub-hook's call site at the bottom of the orchestrator breaks the moment you split the file. Fix: HOIST `spaceHeldRef = useRef(false)` to the top of the orchestrator alongside other always-orchestrator-owned refs, thread into BOTH sub-hooks. Generalizes: any time two sibling sub-hooks share mutable state via a ref, the ref MUST live at the orchestrator. Cross-binding refs should be the FIRST thing the planner flags.

_Promoted to: /docs/refactoring-patterns.md_

## sub-hook-test-needs-stub-window-and-Probe-when-effect-uses-window-listeners

_Discovered: 2026-04-30 by implementer in rf-canvint-4_

When extracting a sub-hook whose `useEffect` installs `window.addEventListener('keydown'/'keyup'/'blur', ...)`, the harness needs THREE pieces: (1) `window` global stub via `vi.stubGlobal('window', { addEventListener, removeEventListener })`; (2) stubs for input-element constructors (`HTMLInputElement`/`HTMLTextAreaElement`/`HTMLSelectElement`) because handler does `e.target instanceof HTMLInputElement`; (3) Probe + `renderToString` because sub-hook calls `useRef` for private refs requiring fiber context. Three signals: (a) hook uses `useRef`/`useState`/`useEffect`? → needs Probe + renderToString; (b) callback references `window`/`document`/`navigator`? → needs `vi.stubGlobal`; (c) callback does `instanceof X` against DOM type? → stub `X` as a class. Diagnostics: useRef null-pointer / "X is not defined" / "Right-hand side of instanceof is not callable".

## vi-mock-paths-resolve-from-test-file-not-from-sut

_Discovered: 2026-05-01 by implementer in rf-aisvc-7_

When extracting a leaf module out of an orchestrator and writing a smoke test for the orchestrator that mocks the leaf, intuition says use the same import path the SUT uses. Wrong. Vitest resolves `vi.mock(specifier)` from the **test file's** location, NOT the SUT's. So if SUT lives at `services/ai/src/services/ai.service.ts` and imports `'./ai/provider'`, but test lives at `services/ai/src/services/__tests__/ai.service.test.ts`, the test must call `vi.mock('../ai/provider', ...)`. Symptom: with wrong path, mock factory silently does NOT replace the import, SUT loads real leaf module, tests fail with the real module's error. Fix is one character: replace `./X` with `../X`. Build the path mentally: test_dir → up to common parent → down to mocked module. Pair with `vi-mock-factory-hoist-blocks-top-level-class-references`.

_Promoted to: /docs/refactoring-patterns.md_

## pushSnapshot-prologue-side-effect-still-observable-on-bail

_Discovered: 2026-04-30 by implementer in rf-cards-14_

`groupSelectedNodes` has TWO early-return branches that look symmetric but diverge sharply on state shape. Branch A (`nodeIds.length < 2`) returns BEFORE `pushSnapshot(state)` — true no-op. Branch B (`selectedNodes.length < 2`, after the filter) returns AFTER `pushSnapshot` ran — `state.history[card.id].past` gained a snapshot of pre-call state even though the requested mutation never landed. The naive `expect(next).toEqual(state)` would pass for A and fail for B with a confusing history mismatch. Right shape: branch A asserts `next.history.c1 === undefined`; branch B asserts `next.history.c1.past.length === 1` AND nodes unchanged. Generalizes: any reducer with `pushSnapshot(state); /* validate */ if (...) return; /* mutate */` shape needs per-branch test assertions.

## hard-coded-constant-risk-pin-needs-call-with-meaningful-input

_Discovered: 2026-04-30 by implementer in rf-cards-13_

The naive RISK-pin shape "assert that node.width didn't change" is silently OK with TWO failure modes: (a) the early-return short-circuit fires before the loop runs (test passes for the WRONG reason); (b) the constants are correctly 1 and the loop ran. To distinguish, drive the reducer with input that DEFINITELY enters the per-node loop AND a meaningful zoom delta (1.0 → 1.5) so a `zoom / prevZoom` refactor would scale by 1.5×, making the assertion fail loudly with `Expected 240, Received 360`. Generalizes: any "must remain hard-coded constant K" risk-pin needs an input that would produce visibly DIFFERENT output if K were dynamic. Same shape as `delete-vs-undefined-test-must-use-in-operator-not-strict-equality`.

## behavioral-asymmetry-between-create-and-update-paths-needs-flag-not-fork

_Discovered: 2026-04-30 by implementer in rf-cstor-4_

When extracting a shared helper from two callsites that differ in a few specific behaviors (cloud-storage's create() and update() both implement IAM-grant + ACL-fallback; update() additionally re-fetches the policy after `setPolicy` to detect silent stripping), resist forking. Use a single helper with discriminated-options flag: `verifyAfterWrite: boolean` — update passes true, create passes false. The flag *names* the asymmetry (caller's intent documented) and *gates* the behavior. Three reasons forking is worse: (1) implementations drift; (2) tests have to cover both; (3) reading the orchestrator, the reader can't tell if differences are intentional. Diagnostic: when extracting, do a pre-extraction read of both callsites side-by-side, write a 1-3 bullet list of every asymmetry — if you can name the difference with a noun, it's a flag; if structural, two helpers.

## early-return-after-hooks-still-registers-effects-and-state-slots

_Discovered: 2026-04-30 by implementer in rf-tgal-6_

A FC `() => { const [a] = useState(0); useEffect(...); if (!isOpen) return null; return <JSX/>; }` registers BOTH state slot AND effect on every invocation, even when `isOpen` is false. This is React's "rules of hooks". Direct-FC tests asserting "no effects registered when early-return fires" are wrong: effects ARE in `mocks.effects`; their *bodies* short-circuit. Two fixes: (a) re-shape assertion to "effect body short-circuits" — fire `mocks.effects[0].cb()` and check no state slot mutated; (b) gate test on whether JSX rendered (`expect(tree).toBeNull()`) and skip effect-count assertion. Generalizes: any orchestrator with `if (!<openFlag>) return null` registering hooks ABOVE the early return needs body-short-circuit assertion shape.

## icon-data-table-must-live-in-tsx-file-not-ts-when-stored-as-jsx-elements

_Discovered: 2026-04-30 by implementer in rf-cost-3_

`.ts` doesn't trigger the JSX transformer; `.tsx` does. A `Record<string, React.ReactNode>` keyed entries like `Compute: <Server className="w-3.5 h-3.5" />` in a `.ts` file is a syntax error. Renaming to `.tsx` fixes it — `.tsx` triggers JSX regardless of whether the module exports a component. Pattern check: anywhere you see `Record<string, ReactNode>` in `.ts`, suspect a hidden compile error.

## vi-fn-generic-narrows-mockResolvedValueOnce-arg-to-never-on-optional-fields

_Discovered: 2026-04-30 by implementer in rf-pset-4_

When stubbing a provider API with `vi.fn<[ArgsTuple], Promise<{ success: boolean; graph?: { nodes?: unknown[] }; error?: string }>>()`, vitest 4.1's overload typing narrows subsequent `mockResolvedValueOnce(...)` so argument type becomes `never` when value omits an optional field — `TS2345` on a fully-valid response shape. Fix: drop the explicit generic on `vi.fn(...)` for any stub whose typed return uses optional fields you'll vary across tests. Runtime works (each `mockResolvedValueOnce` accepts `unknown`); source code's import contract still flows. Generalizes: explicit generics on `vi.fn` are fine for pure-arg signatures but fail on optional-field unions.

## fs-existssync-is-non-configurable-under-vitest-esm

_Discovered: 2026-04-30 by implementer in rf-esp-4_

`vi.spyOn(fs, 'existsSync').mockReturnValue(...)` fails under Vitest's ESM with `TypeError: Cannot redefine property: existsSync`. The `node:fs` module's exports are a frozen namespace whose properties are non-writable + non-configurable. Two viable patterns: (1) drive behaviour through real fs via `fs.mkdtempSync` + `process.chdir`; (2) wrap fs into the SUT via dependency injection. Chdir pattern is what `rf-esp-4` and `rf-cload-2` use; macOS `/var` → `/private/var` symlink means tests should `fs.realpathSync` both sides. Same applies to all node-builtin namespace imports under Vitest ESM (`fs`, `os`, `path`, `crypto`).

## dynamic-import-indirection-blocks-test-mocks

_Discovered: 2026-04-30 by implementer in rf-aimp-3_

The AWS importer wraps every `@aws-sdk/client-*` import in `Function('m', 'return import(m)')(spec)`. Load-bearing pattern — a literal `await import(spec)` would be transpiled into a static `require`, breaking optional-dep guarantee. Side effect: bypasses Vitest's module registry — `vi.mock('@aws-sdk/client-resource-explorer-2', ...)` does nothing. Don't try to stub the SDK; extract response-shape → AWSResource conversion into pure mappers. The discover_*() loops become thin paginate-and-map shells where mapping is testable without any SDK.

## get-critical-path-bug-preserved-as-quirk-not-fix

_Discovered: 2026-04-30 by implementer in rf-galg-4_

When extracting `get_critical_path` from `graph/algorithms.ts`,
a verbatim port of the function reveals it doesn't actually
return the critical path — it returns just the start (no-deps)
node for any DAG with `depends_on` edges. Trace: the function
walks topological order to update distances, but
`topological_sort` on a `depends_on` graph emits LEAVES first
(nodes with no outgoing depends_on edges, which means no
dependencies). For a chain `a depends_on b depends_on c`,
topo order is `[c, b, a]`. When processing b, the loop
iterates `get_incoming_edges(b)` = the edge (a,b), reads
`distances.get(a) = -Infinity` (since a hasn't been processed
yet in topo order), and the new_dist `-Infinity + 1` fails the
`> current_dist` check. The chain never propagates; only c
remains at distance 0; the "max distance" walk picks c with
distance 0; reconstruction returns `[c]` because predecessors
is empty. The fix would be to walk `get_outgoing_edges`
(dependencies of current node) and read `distances.get(target)`
which has been processed earlier in topo order. But changing
this is a public-behaviour change — anything consuming
`get_critical_path` (currently nothing in core, but possibly
external) would see different output. Decision rule for
refactor work: **document the bug, don't fix it**. If the
function is genuinely useful and the fix is wanted, it
becomes a separate ticket with its own behaviour-change PR
(and possibly a feature flag during rollout). Generalizes:
when verbatim-porting an algorithm during a refactor and a
test that asserts "this should return X" fails, first run the
PRE-extraction code with the same input — if it produces the
same wrong output, you've found a pre-existing bug. The
refactor's job is verbatim preservation, not fix; the tests
must pin the actual behaviour, not the intuitive behaviour.
Diagnostic: a critical-path test asserting `path.length === 3`
fails with `expected 1 to be 3` for a 3-node chain. Pair with
the general rule that refactors preserve behaviour byte for
byte — pre-existing bugs ARE part of the contract for the
duration of the refactor.

_Fixed: 0c44dc2_

## tri-state-setter-directive-pattern-for-ref-callbacks

_Discovered: 2026-04-30 by implementer in rf-cmove_

When extracting a pure runner from a hook callback that conditionally invokes a React setter (rf-canv-25b `useContainerMove`'s `setExitingGroupId`), the original code path had three distinct branches: (a) call `setExitingGroupId(null)`, (b) call `setExitingGroupId(parent.id)` or `setExitingGroupId(null)`, (c) call NEITHER (parentId set but parent missing — guarded by `if (parent) {}`). Returning a single `string | null` from the helper collapses (c) into (a) — silently introducing a behavior change. Fix: tagged tri-state `{ call: false } | { call: true; value: string | null }` so the orchestrator can decide whether to invoke the setter. Generalizes: any pure runner extracted from a hook that might skip a side-effect call should use a tagged-union return, not a sentinel `null`. Diagnostic: original code uses `if (X) { setter(...) } else if (Y) { setter(...) }` with NO else.

## byte-identity-snapshot-must-be-captured-pre-refactor-not-post

_Discovered: 2026-04-30 by implementer in rf-spr2-1_

When extracting a large template literal into composable section builders, the only way to verify byte-identical output is a snapshot test — but the snapshot must be captured BEFORE the refactor. Order: (1) write snapshot test against unrefactored source, (2) run vitest to write snapshot, (3) edit source, (4) re-run with no `-u` flag — pass = byte-identity holds. If you reverse 1 and 3 the test only proves "post-refactor matches itself." Generalizes: any refactor where output must remain stable (prompts, generated code, fixtures) needs captured snapshot before first edit.

## category-bundle-split-preserve-original-array-ordering

_Discovered: 2026-04-30 by implementer in rf-cbdat_

When splitting a single ordered data array (16 entries → 9 per-category files), the natural assembly `[...frontend, ...backend, ...data, ...]` imposes a NEW ordering grouping all-frontend-first — discarding hand-curated order. Consumers iterating the array (palette UI) silently change. Fix: explicit assembly with index-picks (`...FRONTEND_TEMPLATES, BACKEND_TEMPLATES[0]!, BACKEND_TEMPLATES[1]!, DATA_TEMPLATES[0]!, ...`). Non-null assertions are load-bearing — TS narrows `Array[idx]` to `T | undefined` even when length is statically known. Smoke test must pin assembled ordering against `EXPECTED_ORDER` of names. Generalizes: ANY data-array split where original order is hand-curated needs explicit index-picks OR a single big spread + stable-ordering smoke test.

## vi-hoisted-must-include-large-fixture-arrays-when-vi-mock-factory-references-them

_Discovered: 2026-04-30 by implementer in rf-accent-5_

When orchestrator tests stub a module-level data export (here: `vi.mock('../data/themes', () => ({ T: FIXTURE_T }))`), the natural shape is to declare `FIXTURE_T` as a top-level `const` next to the `mocks` object. That works for inline-defined hoisted state because `vi.hoisted` and `vi.mock` are co-hoisted to the top of the file, and references within their factories resolve at hoist time. But a `const FIXTURE_T = [...]` defined OUTSIDE `vi.hoisted()` is NOT hoisted — by the time `vi.mock`'s factory runs, the module-top-level binding is in the temporal dead zone and the factory throws `ReferenceError: Cannot access 'FIXTURE_T' before initialization`. The fix is to fold the fixture INTO the `vi.hoisted({ ... })` block (e.g. as `mocks.fixtureT = [...]`) and reference it via `mocks.fixtureT` from inside the factory: `vi.mock('../data/themes', () => ({ T: mocks.fixtureT }))`. Optional sugar: alias `const FIXTURE_T = mocks.fixtureT` AFTER the hoisted block to keep the test bodies readable. This is the same trap as the well-known "vi.hoisted required for shared mock identities across many vi.mock calls" learning — but specific to large fixture arrays where the test author's instinct is to declare a normal const for clarity, not realizing that any value referenced inside a `vi.mock` factory has to participate in the hoist. Generalizes: ANY non-trivial fixture (an array, a record, a builder closure) referenced inside a `vi.mock` factory belongs in `vi.hoisted({...})`. Diagnostic: vitest emits "There was an error when mocking a module" with a `ReferenceError: Cannot access 'X' before initialization` pointing into the SUT file's import line (the import runs the SUT, the SUT runs `vi.mock`, the mock factory hits the dead-zone reference) — the actual fault is the test file's outside-of-hoisted const, not the SUT.

_Promoted to: /docs/refactoring-patterns.md_

## bugfix-commits-from-refactor-quirks-need-the-fixed-line-only-when-anchor-exists

_Discovered: 2026-04-30 by implementer in bugfix-2/3/4_

The bugfix sweep brief said to append `_Fixed: <commit-sha>_` to each affected learning anchor per the CLAUDE.md "only allowed edit" rule. Reality: of three bugs (eager `require.resolve` in `get_base_db_path`, `get_incoming_edges`-walks-source-distance in `get_critical_path`, missing-lockfiles-in-`filesToCheck` in `detectJsFramework`), only ONE had a dedicated learning anchor — the rf-galg-4 quirk note. The other two were documented INLINE in file headers. Conclusion: don't fabricate `_Fixed:_` anchors against learnings that don't exist. Generalizes: when a refactor preserves a bug verbatim, the implementer has two options: (a) inline header comment in the SUT (cheap, lives with code, lost to log-only readers); (b) learning anchor (visible, supports `_Fixed:_` audit trail). Option (b) is preferable for any bug whose fix-up is a real future ticket.

## vitest-4-strict-mock-surface-and-throwing-factory-needs-isolated-file

_Discovered: 2026-05-02 by test-author in services/engine-coverage_

Two related Vitest 4 gotchas surfaced together when bringing `services/engine` (lazy-imports `@ice/core` via `_core = await import('@ice/core')`) to ≥90% coverage. (a) **Strict mock surface**: vitest 4 errors with `[vitest] No "X" export is defined on the "@ice/core" mock` even when the SUT uses optional chaining (`core.getAllHighLevelResources?.()`). The check is at access-time on the namespace, not at call-time. Fix: hoist a `vi.mock` whose factory exposes ALL accessed exports via property getters reading from a `vi.hoisted({ coreImpl: {} })` bag, then per-test do `h.coreImpl = { ... }` instead of `vi.doMock` per test. Bare `vi.doMock` in `beforeEach` may not re-register cleanly across `resetModules`, surfacing real package data when the mock silently disappears. (b) **Throwing-factory isolation**: testing the SUT's catch arm (`try { _core = await import('@ice/core') } catch { _core = stub }`) requires the import to reject. A hoisted `vi.mock(..., () => { throw ... })` in the same file as happy-path tests poisons every downstream test — the throw persists because `vi.mock` is not unmockable mid-file. Fix: put the load-failure assertion in a sibling test file (e.g. `<svc>.import-failure.test.ts`) with its own throwing `vi.mock` factory and a single `it` block. Generalizes: any defensive catch-on-import branch needs a dedicated test file in vitest 4; combining it with property-getter hoisted mocks is the cleanest path for testing services that lazy-import a workspace package.

## hook-singleton-store-needs-getter-mock-not-snapshot-mock

_Discovered: 2026-05-02 by test-author in 5-hooks-coverage_

Hooks that read the global store via `import { store } from '../../../store'` AND use it as a non-React side channel (`store.getState()` inside `useCallback`) fight the per-test pattern of building a fresh `configureStore` for each test. A naive `vi.mock('../../../store', () => ({ store: configureStore(...) }))` either runs once at module load (single-shot) or overrides `useDispatch`/`useSelector` resolution. Fix: hoist a `mocks.storeRef = { current: null }`, then mock with a property getter — `vi.mock('../../../store', async (orig) => { const a = await orig(); return { ...a, get store() { return mocks.storeRef.current ?? a.store; } }; })`. Per-test set `mocks.storeRef.current = makeStore()` before `captureHook`. The Provider wraps the same store for `useDispatch`/`useSelector`; the getter routes the side-channel `store.getState()` to the same instance. Combined with `preloadedState` (vs. dispatching `cards/createCard` which uses real-time IDs and ignores the test card shape) you get a deterministic seed. Same pattern works for any singleton imported from `../../../store` AND consumed via React context — single point of override. Generalizes to: any hook test where the SUT mixes `useSelector` (Provider-served) with a direct `store.getState()` import (module-served).

## defensive-null-org-guards-unreachable-when-isadmin-derives-from-org-role

_Discovered: 2026-05-02 by test-author in team-page-coverage_

In `team-page.tsx`, two action handlers (`handleRoleChange`, `handleRemoveUser`) start with `if (!selectedOrg) return;` defensive guards. The branches LOOK testable but are unreachable through the UI: the handlers are wired to controls (the role <select>, the Trash2 button) that only render when `isAdmin === true`, which is itself derived as `callerRole === 'owner' || callerRole === 'admin'` where `callerRole = selectedOrg?.role?.toLowerCase()`. So `isAdmin=true` requires `selectedOrg` to be truthy. The closure-captured `selectedOrg` inside each handler binds at render time and never re-reads the redux store, so post-render mutations of `mocks.state.account.selectedOrg` do not influence the closure. Branch coverage will sit at 98% with line 86 (the `handleRoleChange` early return) uncovered; that is structural, not a test gap. The `handleRemoveUser` line is half-covered (the right-hand side of `||` for `confirm:false` is reachable, the left-hand `!selectedOrg` is not). Generalizes: any "permission-gated handler" pattern where (a) the handler is unmemoized and (b) the gate predicate derives from the same state the handler defends against — the defensive guard is dead code under the closed-form invariants of the slice. Treat as a finding for the critic, not a test gap. Same shape will recur in other admin-gated components (e.g. project-collaborators, create-team-modal). Counter-pattern that would be testable: if the handler were `useCallback`-wrapped with `[selectedOrg]` deps and the trigger were retained across re-renders, mutating the slice between renders could expose the guard. Currently this code does not have that shape.

## file-private-fc-direct-invocation-via-el-type-for-unreachable-branches

_Discovered: 2026-05-02 by test-author in 4-ui-coverage_

In `app-bar.tsx`, the file-private `BarBtn` and `BarImgBtn` helpers each have branches (`disabled && '...'`, `if (!tip) return btn;`, `tip || ''` fallback for an `<img alt>`) that are unreachable from the AppBar JSX — every callsite passes `tip`, none pass `disabled`. Direct-FC tree-walker tests get to ~86% branch coverage and stop. The helpers cannot be exported (no source change rule), but they CAN be invoked directly because the walker yields `<BarBtn>`/`<BarImgBtn>` elements during traversal of the AppBar tree, and `el.type` is the FC reference. Pattern: `findFirst(tree, predicate)` to locate any `<BarBtn>` JSX site (e.g. by `typeof el.type === 'function'` plus a discriminating prop like `icon`+`onClick`), then call `(el.type as Fn)({ icon: () => null, onClick: vi.fn() /* tip omitted */ })` and walk THAT result to assert the branch shape. The discriminator-by-prop is the cleanest filter — keys exist that other walked elements do not (e.g. `BarBtn` has `icon`, `BarImgBtn` has `src`). Brings branch coverage from 86.66% to 100% on app-bar without touching source. Generalizes: any orchestrator with file-private branching helpers exposed only through JSX call sites — tree-walker traversal hands you the FC reference for free; reuse it as a callable to drive the unreached props.


## same-module-helper-error-branch-is-structurally-dead

_Discovered: 2026-05-02 by test-author in pulumi-terraform-aws-coverage_

Both `export/pulumi/converter.ts` and `export/terraform/converter.ts` have an `export_graph` loop that conditionally pushes to `errors[]` when `result.success === false && !result.unmapped`. The branch is structurally unreachable in current code shape: the only error-emitter (`node_to_resource`, defined in the same module) ALWAYS sets `unmapped: true` when emitting an error. There is no path that returns `{ success: false, error: 'x', unmapped: false }`. Because `node_to_resource` is a same-module function, `vi.doMock('./converter.js', ...)` does not rebind the `export_graph` reference (TS module-private bindings, not via the namespace import). The branch ceiling is therefore: 86.66% (pulumi) / 91.17% (terraform) — terraform clears 90% because its `fallback_type_mapping` ALWAYS returns a string, so the unmapped branch is exercised via mocked `type-mapping.js`, while pulumi's reaches the unmapped branch naturally (no mock needed) and the dead branch is the SAME `errors.push` line. Generalizes: any helper-error-branch pattern where the helper is in-module and the discriminator (`unmapped`) is always co-emitted with the error — the orthogonal branch is dead. Treat as finding for the critic, not test gap. Counter-pattern that would make this testable: extract `node_to_resource` to a sibling module so `vi.doMock` rebinds the import in `export_graph`. With the helper in-module, the branch can only be reached by mutating source.

## function-constructor-stub-intercepts-bypass-bundler-imports

_Discovered: 2026-05-02 by test-author in azure-importer coverage_

The Azure / AWS importers and gcp/sdk-loader use `Function('m', 'return import(m)')(specifier)` to dynamically load optional SDKs in a way that bypasses the Vitest module registry — `vi.mock`, `vi.doMock`, and module-spec interception all miss it. The hook that DOES work is replacing `globalThis.Function` itself for the test: a stub that recognizes `args[0] === 'm' && args[1].includes('return import')` returns a controllable resolver (`(name) => Promise.resolve(fakeRegistry[name])`), and falls through to the original Function constructor for everything else. Restore in `afterEach`. This pattern lets you exercise full success paths (mocked SDK returns canned data, pagination via `skipToken`, error throws from `client.resources()`) and full error paths (auth-shape rejections that bubble up through the wrap to hit the action-truthy branch in classifyAzureError consumers) — bringing azure-importer.ts from 0% to 100% statements / 98.78% branches. Generalizes: any module that gates a third-party dep behind `Function('m', 'return import(m)')` is testable through Function-constructor stubbing — but only this pattern, not `await import(spec)` (which Vitest's registry handles natively).

## defensive-double-fallback-leaves-unreachable-branches

_Discovered: 2026-05-02 by test-author in azure-importer coverage_

`azure-importer.ts` line 122 reads `tags: resource.tags || {}` while the upstream discovery loop at line 325 has already done `tags: item.tags || {}`. By the time line 122 runs, `resource.tags` is always at least `{}`, so the `||` short-circuits the same way every time — the `{}` branch is dead defensive code. Branch coverage will plateau at ~99% with this single branch reported uncovered. The fix is a one-line source change (drop the `|| {}` at line 122, or drop it at line 325 — pick one). The same shape is likely in other importers that normalize at discovery AND at conversion. Treat as a finding for the critic, not a test gap. Type-mapper has a related dead-code finding: the `'microsoft.web/staticSites'` TYPE_MAP key has a capital S, but `get_ice_type` lowercases input before lookup — the key never matches and the intended `azure.web.static_site` mapping falls through to the synthesized `azure.web.staticsites` fallback. The table key should be lowercased like every other entry.

## function-ctor-stub-needs-class-not-vifn-for-new-callsites

_Discovered: 2026-05-02 by test-author in gcp-importer coverage_

Follow-up to `function-constructor-stub-intercepts-bypass-bundler-imports`. When the SUT calls `new compute.InstancesClient(options)` (every GCP service in `packages/core/src/importers/gcp/services/*.ts` does this for 1+ client constructors), the fake module returned by the stubbed `Function` MUST expose real classes. `vi.fn().mockImplementation((...args) => ({ list: vi.fn() }))` looks correct but the underlying mock implementation is an arrow function — arrow functions cannot be invoked with `new`, the SUT's catch wraps "X is not a constructor" into the friendly INIT_ERROR message, and all coverage of the success branch is lost (looks like the stub didn't fire even though it did). Pattern: hand-write a `class FakeInstancesClient { constructor(opts) { recordCalls.push(opts); this.list = async () => [[]]; } }` per client and put those classes in the fake module's namespace. This was the difference between 85% and 100% coverage on `compute.ts`. Same shape in `storage.ts` (`new Storage(options)`) and `asset-inventory.ts` (`new AssetServiceClient(options)`). Generalizes: any test that intercepts dynamic `import()` to swap a third-party SDK whose surface is constructor-based — use real classes, not `vi.fn().mockImplementation`. A second GCP-only gotcha: the `MutableGraph` API exposes labels under `node.metadata.labels`, NOT `node.labels` (similar to edges via `edge.metadata.labels`). Tests using `get_node_by_name(...)?.labels.foo` will silently return undefined and look like missing functionality. Read `packages/core/src/types/graph.ts` first.

## validation-rules-have-elseif-classifier-shadowing

_Discovered: 2026-05-02 by test-author in validation/architecture-rules coverage_

`packages/core/src/validation/architecture-rules.ts:62-65` classifies nodes via an `else if` chain — `isFrontend → isBackend → isDatabase → isCache`. `isDatabase('Database.Redis')` returns true (matches `Database.` prefix), so a Redis node lands in the `databases` bucket and never reaches the `caches` else-arm. The MULTI_DB_NO_CACHE rule's only suppression condition (`caches.length === 0`) therefore cannot fire from a real Redis node — only from an iceType that matches `isCache` but NOT `isDatabase` (e.g. a hypothetical `Cache.Memcache`). No such iceType exists in the production tree, so the suppression branch is structurally unreachable from real graphs. Treat as a critic finding: either reorder the chain to put `isCache` before `isDatabase`, or have `isDatabase` exclude Redis explicitly.

Companion finding: `architecture-rules.ts:38,44,46` builds an `incoming` Map that is never read anywhere in the function body — pure dead variable. Drop it and the post-loop assignments to it. Companion: `connection-rules.ts:70-71` has a `'Source'` / `'Target'` label fallback after `iceType.split('.').pop()` that is only reachable when the iceType string is exactly `'.'` (split → `['','']`, pop → `''`). Real iceTypes always include either no dot or at least one non-empty segment, so the third arm is dead in production. Companion: `deploy-rules.ts:175` re-checks `node.type === 'container' || 'group'` after `isContainer(iceType, node.type)` already returns true for those nodeType values — same in `structure-rules.ts:128`. Companion: `deploy-rules.ts:225` has `supportedProviders.length > 0 ? '...' : undefined` inside an `if (supportedProviders.length > 0)` block — tautology. Branch ceiling for the validation directory at 90/90 target was 99.3% statements / 97.91% branches; the remaining gaps are all dead branches above. Generalizes: classifier predicates that overlap (e.g. `isDatabase` and `isCache`) need to be ordered so that the more-specific predicate runs first when used in an `else if` chain — otherwise the broader predicate consumes nodes the narrower one was meant to count.

## script-style-module-needs-process-exit-stub-and-bare-relative-mock-target

_Discovered: 2026-05-02 by test-author in templates+shared coverage_

`packages/templates/src/validate.ts` is a script — top-level `for (const t of ALL_TEMPLATES)` loop, terminal `process.exit(1)` on errors. To get full branch coverage on its rule helpers without forking the source, the test file must (a) `vi.spyOn(process, 'exit').mockImplementation(...)` so the test runner doesn't crash, (b) `vi.spyOn(console, 'log').mockImplementation(...)` to inspect rule output, (c) mock `ALL_TEMPLATES` via a hoisted-bag getter so each `it` swaps the input set, then `vi.resetModules()` + `await import('../validate')` per test. The non-obvious gotcha: the SUT does `import { ALL_TEMPLATES } from '.';` and the test file lives in `src/__tests__/`. Vitest resolves `vi.mock(spec, ...)` paths relative to the TEST FILE, not the source file — so `vi.mock('.', () => ...)` resolves to `src/__tests__/index.ts` (which doesn't exist) and silently does nothing, allowing the real registry to leak in. Diagnostic: tests start emitting [R1:blueprint] errors against real templates like `secure-api`, `budget-webapp`, `saas-multi-tenant` — the mock isn't firing. Fix: target the path the SUT's bare specifier resolves to, expressed relative to the test file: `vi.mock('../index', () => ...)`. Pair with: vi.mock factory returning a property getter (`get ALL_TEMPLATES() { return h.templates; }`) so per-test mutation of the hoisted bag is visible without re-mocking. Same shape as `vi-mock-paths-resolve-from-test-file-not-from-sut` and `vi-mock-paths-resolve-relative-to-test-file-not-source-file`, but specific to bare-relative `from '.'` imports in script-style modules. Generalizes: any future script-style module (`process.exit`-terminating, top-level work) is testable through resetModules + getter-mocks for its data inputs + spy-stubbed process.exit; the resolution rule for vi.mock specs is invariant — relative to test, not source.

## electron-main-needs-deferred-whenReady-plus-microtask-drain-and-stale-js-disambiguation

_Discovered: 2026-05-02 by test-author in apps/desktop coverage_

Bringing `apps/desktop/src/main/index.ts` to 100/100 surfaced four interlocking gotchas worth memorializing as a single anchor because they ALL fire on the same SUT shape (Electron main process bootstrap):

(a) **Deferred `app.whenReady()` + nested-await drain**: the SUT's bootstrap is `app.whenReady().then(async () => { ...; await startEmbeddedBackend(); createMainWindow(); setupAutoUpdater(); })`. To drive coverage you must mock `whenReady` to return a deferred Promise, resolve it in the test body, then drain microtasks ENOUGH times for every nested await to land. Three drains (`await Promise.resolve()` x 3) is too few — 32 drains paired with `await vi.advanceTimersByTimeAsync(0)` reliably reach `setupAutoUpdater()`. Diagnostic: `h.bag.windows.length === 1` (only splash) means the chain stalled at `await import('@ice/gateway')`; `autoUpdaterListeners` empty AND windows=2 means it stalled between `createMainWindow()` and `setupAutoUpdater()`. Pattern: `for (let i = 0; i < 32; i++) { await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); }` after `deferred.resolve()`.

(b) **Module._resolveFilename monkey-patch**: SUT does `(Module as any)._resolveFilename = function(...)`. Naively mocking `module` with `vi.fn()` is a trap because the SUT REPLACES the function with a plain closure on first boot — subsequent `mockClear()` calls in `resetBag()` throw `mockClear is not a function`. Fix: keep the mock object stable (`{ default: { _resolveFilename: origFn } }`), and in `resetBag()` REASSIGN `_resolveFilename` to a fresh closure rather than calling `mockClear()`. Read the patched resolver post-boot via `(h.moduleMod as any).default._resolveFilename`.

(c) **fs.existsSync mock ordering**: the SUT calls `existsSync` with multiple distinct paths (splash, icons, prisma targetDir, prisma resolved candidate `default.js`/`index.js`, asar paths). A naive mock that uses `p.includes('node_modules/.prisma/client')` as the FIRST guard incorrectly captures resolver candidates like `/userData/node_modules/.prisma/client/default.js`, returning the targetDir flag (false) and short-circuiting the resolver to the original path. Order the guards specific-first: `endsWith('.js')` for resolver candidates → asar prefix → exact-match targetDir → splash → icons → false fallback.

(d) **Throwing `vi.mock('@ice/gateway')` factory needs a sibling test file**: the gateway-import-failure branch (`try { await import('@ice/gateway') } catch ...`) requires the dynamic import to reject. A throwing factory in the same file as happy-path tests is cached by vitest 4 and poisons all downstream `await import(...)` calls. Same pattern as `services/engine` (anchor `vitest-4-strict-mock-surface…`): put the failure assertion in `index.gateway-import-failure.test.ts`, with its own throwing `vi.mock` factory and a single `it` block. Vitest wraps the factory throw with its own message — assert on the SUT's catch-arm preamble (`'[desktop] Gateway start error:'`), not the literal error text.

Side gotcha: `apps/desktop/src/{main,preload}/` ships with stale `index.js`/`index.d.ts` artifacts checked into git (a prior `tsc --emit` run). Vite's resolver picks `.js` over `.ts` when both exist, instrumenting the wrong file for v8 coverage (you'll see `index.ts` line ranges flagged as 100% uncovered even when tests pass). Workaround without source change: dynamic-import the `.ts` extension via a string variable to dodge tsc's `allowImportingTsExtensions` rule — `const sutPath = '../index.ts'; await import(sutPath);`. Cleaner long-term fix is for the planner/critic to drop the stale artifacts from git; the workaround is a test-file-only escape hatch.

Generalizes: any future Electron main-process file (one bootstrap chain, multiple electron/electron-toolkit/electron-updater/Module monkey-patches behind one `app.whenReady().then(async)`) follows the same template. The four-gotcha checklist is the playbook; budget ~2x the LOC of the SUT in test infra (this SUT is 321 LOC, the test files plus failure-sibling are ~1100 LOC combined including the FakeBrowserWindow class and the hoisted-bag scaffolding).

## v8-coverage-zeros-pure-barrel-files-as-zero-of-zero

_Discovered: 2026-05-02 by test-author in shared/api coverage_

A pure barrel file consisting only of `export ... from '...'` re-exports compiles to a module record with no executable statements once tsc/Vite emits it — the runtime just rebinds the named exports onto the importing module. v8 coverage reports such a file as `0 / 0 / 0 / 0` for stmt/branch/func/line and the table cell prints `0%` even when a test imports the barrel and asserts every export. The denominator is zero: there is nothing to cover. Don't chase this — treat `0/0/0/0` on a re-export-only file as "fully exercised" provided the barrel test asserts each re-exported binding (`expect(typeof mod.foo).toBe('function')`) so a future deletion or rename breaks a test. Specifically observed in `packages/ui/src/shared/api/index.ts`. Sub-rule for reviewers: confirm the file truly has no executable statements before accepting; a single `const X = ...;` or top-level `if/?:` flips the file out of the 0/0 shape and the coverage minimum applies again.

## import-meta-env-DEV-is-vite-build-time-inlined-and-untestable-from-test-side

_Discovered: 2026-05-02 by test-author in shared/utils/action-logger coverage_

A SUT shaped like `(typeof import.meta !== 'undefined' && import.meta.env?.DEV) || localStorage.getItem(...) === 'true'` (the gate in `packages/ui/src/shared/utils/action-logger.ts`) cannot have its DEV-falsy branch reached from a Vitest test. Vitest defaults `import.meta.env.DEV = true` at build time, the value is INLINED into each module's own `import.meta` binding, AND `vi.stubEnv('DEV', ...)`, `vi.stubEnv('MODE', 'production')`, and direct `(import.meta as unknown as {env:{DEV:boolean}}).env.DEV = false` from the test file all fail to flip the SUT module's binding (each module gets its own `import.meta`). Confirmed empirically with a sibling helper module — mutation in the test file does not propagate. Consequence: the `||` short-circuit takes the DEV-true path on every test run, making the right-hand `localStorage.getItem(...)` arm and the `try { ... } catch { _enabled = false; }` arm structurally unreachable. Action-logger's branch coverage caps at ~85% (1 uncovered catch arm out of ~13 branches) for this reason. Two viable workarounds NOT taken here because both alter the SUT: (a) refactor SUT to read DEV from a function-local indirection (`getDevFlag()`) injectable for tests; (b) move the gate into a small wrapper module the test can `vi.mock`. Generalizes: any SUT consulting `import.meta.env.DEV` in a top-level expression (not via a function indirection) accepts a structural coverage gap on the DEV-falsy branch; document it inline and surface to the critic. Sub-rule: a sibling test file with its own throwing `vi.mock(...)` or env override doesn't help either — both run in the same Vite build and inherit DEV=true.

## sut-shaped-checkflow-cache-hit-needs-shared-child-via-multiple-contains-edges

_Discovered: 2026-05-02 by test-author in shared/utils/auto-layout coverage_

`dagreTreeLayout`'s `checkFlowSubtree` and `repackIsolatedTopLevel`'s `checkFlow` both have `if (cached !== undefined) return cached;` cache-hit branches. Naturally these never fire when `buildHierarchy` produces a tree with single-parent edges — each id is visited at most once. The fixture that exercises the cache hit is TWO `contains` edges pointing at the SAME child (`p1 → shared`, `p2 → shared`): `buildHierarchy` appends `shared` to BOTH parents' children lists, so when the recursive descent visits the second parent's subtree, `shared`'s flow flag is already cached. Pin via two separate top-level fake-containers and a shared kid; assert the layout call doesn't throw (and optionally that the cache-hit code path is taken via line counters in coverage). Generalizes: any "memoize subtree property" recursion in a graph with single-parent invariants needs a multi-parent fixture to hit the cache-hit branch — single-parent trees never re-enter a node.

## expand-blueprint-schema-driven-fallback-branches-need-fixture-not-real-schema

_Discovered: 2026-05-02 by test-author in packages/blocks coverage_

Three branches in `expand-blueprint.ts` are unreachable from the public API given the current shape of `HIGH_LEVEL_CATEGORIES`:

1. `(hasPipeline ? PIPELINE_ROW_H : 0)` (line ~49 in `computeCompactNodeHeight`) — `expandBlueprint` always invokes `computeCompactNodeHeight(data, false)` and never threads `hasPipeline=true`. The `true` branch is dead from this caller.
2. `prop.default ? providerOptions.find(...) : undefined` (line ~144) — every `select`+`optionDetails` entry in `HIGH_LEVEL_CATEGORIES` ships with a non-empty `default`. The `: undefined` fallback only fires for a property without a default.
3. `(prop.default as string) ?? prop.options[0]!` (line ~159) — same shape: every `select`+`options` entry in `HIGH_LEVEL_CATEGORIES` ships with a `default`, so the `??` right operand is dead.

Reachable only by hijacking the schema (mocking `@ice/core/resources` to return a fixture without `default`) — but this couples the `expand-blueprint` test to `getResourceProperties`'s import shape, which the test specifically avoids by relying on the real schema. The 100% statements / 97.29% branches / 100% functions outcome is the structural ceiling. Generalizes: any pure function that branches on an OPTIONAL field in a single-source-of-truth data table accepts a structural coverage gap on the "field absent" branches as long as every existing record in the table sets the field. Document the gap, point to the schema invariant, and don't introduce a fake-schema mock just for the branch counter.

## import-meta-env-as-any-cast-defeats-vite-transform

_Discovered: 2026-05-03 by test-author in shared/hooks coverage sweep_

`use-gcp-oauth.ts:59` reads `(import.meta as any).env?.VITE_GOOGLE_CLIENT_ID`. Vite's transform layer pattern-matches `import.meta.env.X` AST shapes for compile-time inlining; the `as any` cast wraps `import.meta` in a TS assertion node that the transform doesn't recognize. Result: at runtime the SUT goes through vite-node's env Proxy — which Vitest replaces with one that reads from `process.env`. So the test side `(import.meta as any).env.X` returns the value just fine. But the SUT's `__vite_ssr_import_meta__.env?.X` returns `undefined` regardless of `vi.stubEnv`, `process.env.X = "..."`, or direct mutation of `import.meta.env.X` — the proxy backing differs between modules in vite-node 8.x. Net effect: any branch past `if (!clientId) return;` is structurally unreachable under vitest. Coverage exception: 41.93/17.39/50/41.93 on `use-gcp-oauth.ts` — only the initial state and the two early-return guards execute. Generalizes: `(import.meta as any).env?.X` is a test-hostile pattern; use the bare `import.meta.env.X` form and hand the cast to the consumer if the type is awkward. Don't introduce env-replacement plumbing in tests; flag the pattern for the source author instead. Same constraint applies to any module that wraps `import.meta` in a cast or local variable before the property access — vite-plugin-define only matches `MemberExpression(MemberExpression(Identifier(import.meta), Identifier(env)), Identifier(X))` literally.

## position-finder-fallback-after-below-the-lowest-is-structurally-unreachable

_Discovered: 2026-05-02 by test-author in features/ai+features/properties coverage sweep_

`packages/ui/src/features/ai/services/ai-ops/position-finder.ts:116` (the `return { x: 100, y: maxBottom };` after the candidate loop) is dead code given the algorithm above it. The candidate list always starts with `{ x: 100, y: maxBottom }` where `maxBottom = max over n of (n.position.y + (n.height || NODE_HEIGHT) + NODE_GAP_Y)` (NODE_GAP_Y = 36). The overlap check calls "no overlap" when `y >= n.position.y + nh + 12`. For each existing node, `maxBottom >= n.y + nh + 36 > n.y + nh + 12` — so the first candidate's y check ALWAYS reports no-overlap. The for-loop returns at iteration 0; line 116 never fires. Coverage ceiling: 98.11/85.71/100/97.67 with line 116 listed as uncovered. Don't write a giant-overlapping-node test to chase it — the giant node still positions below the lowest with a margin, and you can't squeeze maxBottom below a node's y+nh+12 by construction. Generalizes: any position-finder whose first candidate is `{ ..., maxOf(existingY + existingH + bigGap) }` and whose overlap test uses `smallGap < bigGap` has a structurally-unreachable trailing fallback; flag for the source author rather than adding contrived input.

## usestate-slot-counter-must-reset-per-render-not-per-test-file

_Discovered: 2026-05-02 by test-author in svg-node-cluster coverage_

When the SUT calls `useState(false)` multiple times (e.g. `isHovered`, `folded`, `scrollOffset`, `isAutoScroll`, `copiedLine` in svg-log-node), the natural urge is to use `mocks.state.stateValues.length` as the slot index, then write the value back at that index. This breaks because the second `useState` call sees length already incremented (from the first call's writeback) and lands on idx=2 instead of idx=1. Fix: separate the slot-counter from the value-array — keep `stateCounter: number` and `pinnedSlots: unknown[]` as two independent fields, increment `stateCounter` on every call, and look up via `idx in pinnedSlots` (NOT `pinnedSlots[idx] !== undefined` — that misclassifies legitimate `false` pins). Reset `stateCounter = 0` in BOTH `beforeEach` AND in the test's `renderXX()` helper (so two renders in the same test don't drift the counter). Pair with `vi.fn()` setters per slot stored in `stateSetters[idx]` so tests can assert `expect(mocks.state.stateSetters[1]).toHaveBeenCalledWith(true)` against the specific slot. Generalizes: any FC with N `useState` calls of the same initial-value type needs slot-by-position pinning (not by initial-value matching) — five `useState(false)` calls collide if you pin via `typeof initial === 'boolean'` alone.

## icon-prop-as-react-element-collides-with-tree-walker-find-by-type

_Discovered: 2026-05-02 by test-author in canvas/components+_shared coverage sweep_

`BlockSidebar` accepts an `icon: ReactNode` prop and renders it inside the type-tile slot. Tests that probe per-slot content via `findByType(tree, 'span')` (looking for the resource-name short-name span) hit a subtle failure: a test fixture passing `icon: React.createElement('span', null)` puts a `<span>` into the tree as a sibling of the slot spans. The tree-walker yields the icon span FIRST in DFS order, so `spans[0]` is the icon, not the resource-name slot — the assertion `(spans[0].props as { children }).children === 'RDS'` fails because the icon span has no children. Fix: pass a non-tag icon fixture that the FC's actual JSX never reuses — `React.createElement('svg', { 'data-stub': 'icon' })` is safe because BlockSidebar's slots only emit `<div>` / `<span>` / `<img>`. Same pattern recurs anywhere a leaf-FC takes a ReactNode prop and the test discriminates downstream content by tag name. Generalizes: when a test fixture supplies a ReactNode prop, choose a tag the SUT never renders elsewhere; otherwise switch the predicate to a content discriminator (`el.props.children === 'RDS'`) instead of `el.type === 'span'`. Sub-rule: for `card-shell.tsx`'s `icon: LucideIcon` prop (a function-typed prop, not a ReactNode), passing `(() => null) as unknown as LucideIcon` works AND the test can probe via `findByType(tree, FakeIcon)` because the FC itself is the type — module-singleton identity holds.

## structurally-unreachable-rhs-of-nullish-coalesce-inside-truthy-gated-block

_Discovered: 2026-05-02 by test-author in canvas/components+_shared coverage sweep_

`block-sidebar.tsx:121` is `title={serviceName ?? undefined}` — but the line lives INSIDE `{shortName && (<>...</>)}` where `shortName = serviceName ? shortResourceName(serviceName) : null`. So entering the conditional block requires `shortName` truthy, which requires `serviceName` truthy AND `shortResourceName(serviceName)` to return a truthy string. Once inside, `serviceName ?? undefined` always resolves to the LHS (truthy serviceName). The RHS `undefined` branch is structurally unreachable — coverage caps at 94.44% branches with that one branch reported uncovered. Don't write a `serviceName === ''` test to chase it: empty-string `serviceName` would make `shortName` empty (falsy under `&&`), so the conditional gate fires first and we never reach the title prop site. Generalizes: any `?? undefined` (or `?? null`) defensive fallback inside a conditional whose gate already requires the LHS truthy is dead branch coverage. Treat as a finding for the critic — the safer `||` here doesn't change behavior because `serviceName` is a string in this path; dropping the `?? undefined` entirely is fine. Sub-rule: pair with `or-chain-default-fallback-needs-its-own-test-for-100pct-branch-coverage` — same shape (RHS-of-OR-or-NULLISH unreachable when LHS is gate-truthy), but in that case the LHS could be `0` or `''` while still passing the gate, so the RHS IS reachable. Pin the gate's invariants before deciding the branch is unreachable.

## redux-store-subscriber-defensive-guards-need-replacereducer-injection

_Discovered: 2026-05-02 by test-author in store/index-coverage_

The Redux store factory in `packages/ui/src/store/index.ts` registers two subscribers (card persistence + UI persistence). The card subscriber has three defensive early-return branches that the slice reducers structurally guarantee will never fire through the public dispatch surface: (a) `if (!card) return ''` inside `cardHash` — only called from inside `setTimeout` after `if (!activeCard) return;` lands, so `card` is always non-null; (b) `card.nodes || []` and `card.edges || []` — every `cardsSlice.createCard` reducer initializes both arrays, and no reducer deletes them; (c) `if (!activeCard) return;` — `setActiveCard` reducer guards `state.cards.some((c) => c.id === payload)` before assigning `state.activeCardId`, and `deleteCard` auto-clears it. Single-public-dispatch tests cap at ~86% branches.

To recover (b) and (c), use `store.replaceReducer` to inject a minimal test-only `cards` reducer that responds to a `__test__/divergeCardsState`-shaped action and returns `{ activeCardId: 'phantom', cards: [] }` (or `{ activeCardId: 'sparse', cards: [{ id: 'sparse' }] }` for the missing-nodes/edges fallback). Compose with passthrough reducers (`(s = currentState[k]) => s`) for every other slice key so the rest of the store stays intact. Pattern brings the file from 86% → 96% branches; the remaining `if (!card) return ''` is unreachable even via `replaceReducer` because nothing in the test path hands a null card to `cardHash` directly. Generalizes: any closed-state invariant defended by a slice reducer can be bypassed with `replaceReducer` for coverage purposes — this is a test-only escape hatch, not a runtime path.

Sub-pattern (in-flight backend save): the `if (_backendSaveInFlight) return;` guard is reachable but ONLY if the second dispatch produces a hash-different state. `cardHash` includes node count, first/last node id, last node x position, and a fingerprint of every `node.data` blob — but NOT card name. So `renameCard` between two `setActiveCard` calls won't trigger a re-save (hash is identical, the earlier `if (hash === _lastSavedHash) return;` swallows it). Use `addNodeToCard` instead (changes node count → new hash). Pair with a never-resolving `vi.fn().mockImplementationOnce(() => new Promise(...))` for the first `graphSave` so `_backendSaveInFlight` stays true into the second tick.

Sub-pattern (vi.advanceTimersByTimeAsync resolves with 0, not undefined in vitest 4): `await expect(vi.advanceTimersByTimeAsync(N)).resolves.toBeUndefined()` fails because the resolved value is `0`. Use `let threw = null; try { await vi.advanceTimersByTimeAsync(N); } catch (e) { threw = e; } expect(threw).toBeNull();` instead. Same for any timer-driven swallow-error tests in vitest 4.

## tree-walker-mocks-must-import-the-mocked-fn-ref-not-string-tags

_Discovered: 2026-05-02 by test-author in pbrws-orchestrator-coverage_

When testing an orchestrator that delegates to extracted leaf components (`PanelHeader`, `TreeItem`, `FolderRow`, etc.), it's tempting to `vi.mock` the leaves with shim FCs that return `{ type: 'PanelHeader', props }` so the tree walker can `.find(el => el.type === 'PanelHeader')`. This DOES NOT work in React: when the orchestrator's JSX `<PanelHeader>` runs through `React.createElement(PanelHeader, ...)`, the resulting element has `type: <the-mocked-FC-reference>`, not whatever the FC happens to return. Walker yields the parent element with `type === MockFC`, never visits the mock's return value because React calls the FC at render time only. Fix: hoist the mock FCs into `vi.hoisted` (`MockPanelHeader: vi.fn((p) => p)`), import the named ref AFTER the mock (`import { PanelHeader } from '...'` resolves to the mock), then compare via `el.type === PanelHeader`. The walker then matches against the canonical reference.

The named-fn pattern also lets the mock surface props verbatim (`(p) => p` returns the props object so `findFirst(tree, el => el.type === PanelHeader)!.props.search.onChange('bar')` drives the actual orchestrator wiring). Identity equality holds across the module boundary because `vi.mock(spec, factory)` registers the factory's return as the resolved module — both `import { PanelHeader }` from the orchestrator and from the test file see the same object.

Sub-rule (state-driven render tests): if an orchestrator owns N `useState` calls plus delegates to hooks, mock `react.useState` with a slot-by-call-index dispatch table (cite: `mock-react-usestate-slot-by-call-index-with-mutable-refs`) AND mock the hooks themselves to return predictable shapes. `vi.hoisted` mutable refs let beforeEach reset slot values without re-mocking — but mutate the inner objects (`mocks.data.items = []`), don't replace the reference (`mocks.data = { items: [] }`), or the captured factory closures lose visibility.

## split-then-coalesce-defensive-rhs-unreachable-after-length-gate

_Discovered: 2026-05-03 by test-author in format-parser-coverage_

`format-parser.ts`'s `parse_reference_string` does `const parts = ref.split('.');` then early-returns if `parts.length < 2` and otherwise dispatches per `parts[0]`. Inside each switch arm, the source defends with `parts[1] ?? ''` (var/local/module/path branches at line 407), `parts[1] ?? ''` and `parts[2] ?? ''` (data branch at lines 414/415), and `parts[0] ?? ''` plus `parts[1] ?? ''` (resource default at lines 426/427). Every one of these RHS `''` arms is structurally unreachable: `String.prototype.split('.')` always returns at least one element, the `parts.length < 2` gate guarantees parts[0] AND parts[1] are defined past the early return, and parts[2] (data branch) lands as empty string but defined when input is `'data.x'`. v8 reports 5 uncovered branches at lines 407, 414, 426, 427 — the structural branch ceiling is 92.3% on this file, and exceeding it requires source change. Treat as a finding for the critic. Counter-pattern that would lift the ceiling: drop the `?? ''` defensive fallback (TS noUncheckedIndexedAccess can be loosened locally with non-null assertions where the gate proves presence) — but that's a source change, not a test gap. Same shape as `or-chain-default-fallback-needs-its-own-test-for-100pct-branch-coverage` and `structurally-unreachable-rhs-of-nullish-coalesce-inside-truthy-gated-block`, but here the gate is `parts.length < 2` rather than a truthy check.

## aws-deployer-init-outer-catch-is-structurally-unreachable

_Discovered: 2026-05-03 by test-author in aws-deployer + sdk-loader coverage_

`aws-deployer.ts`'s `initialize()` (lines 20-54) wraps three sibling per-client try/catch arms inside a single outer try/catch that re-throws as `Failed to initialize AWS SDK: <message>`. The outer catch is structurally unreachable: (a) the only statements outside the inner trys are pure `const X = '<literal>'` declarations, which cannot throw; (b) every inner `try { await Function('m', 'return import(m)')(spec); new ec2.EC2Client({region}); } catch {}` swallows ALL throws — whether the dynamic import rejects, `Function('m', ...)` itself throws synchronously, or the SDK constructor throws. Result: the structural ceiling for `aws-deployer.ts` is 99.29% statements / 97.77% branches (line 50 `throw new Error(...)` plus its `error instanceof Error ? error.message : String(error)` ternary). Treat as a critic finding — either drop the outer try/catch (the per-arm trys already provide complete error containment) or extract per-arm helpers that can throw before the outer wrapper sees them. Counter-example: `azure-deployer.ts` reaches the outer catch in tests because its FIRST identity-load call sits OUTSIDE the per-client trys (the credential is shared); AWS has no shared pre-load, so its outer catch is dead by construction. `sdk-loader.ts` does NOT have this issue: every `load_sdk` returns null on rejection internally, and `initialize_gcp_clients` doesn't re-wrap them — it reaches 100% statements / 100% branches naturally. Generalizes: any "outer wrapper try around N self-contained try/catch arms whose only co-located statements are literal assignments" is dead-by-construction.

## tour-1-process-env-NODE_ENV-needs-narrow-ambient-declare-in-ui-package

_Discovered: 2026-05-08 by implementer in tour-1_

The UI package (`packages/ui`) has `@types/react` but NOT `@types/node` in its devDeps. Any source file referencing `process.env.NODE_ENV` directly fails `tsc --noEmit` with `error TS2580: Cannot find name 'process'. Do you need to install type definitions for node?`. Three rejected fixes: (a) adding `@types/node` to the UI package — bloats `node_modules` and pulls Node ambient globals (`global`, `Buffer`) into a browser-targeted package's namespace; (b) using `import.meta.env.DEV` as a substitute — per `import-meta-env-DEV-is-vite-build-time-inlined-and-untestable-from-test-side`, that's untestable from the vitest side because Vite inlines DEV=true and `vi.stubEnv` doesn't reach the SUT module's `import.meta` binding; (c) hoisting the gate into a wrapper module — over-engineered for one boolean. Adopted fix: a narrow ambient declaration at top of the consuming `.ts` file, `declare const process: { env: { NODE_ENV?: string } };`. Vite statically replaces `process.env.NODE_ENV` at build time (documented Vite behavior — confirmed in production bundles), and Vitest exposes the real Node `process` at test time, so both runtime paths satisfy the signature. The declaration scopes the ambient to ONE file rather than polluting the whole package's globals. Use this pattern any time UI-package code needs the dev/prod runtime gate without import-meta acrobatics.

## tour-4-multi-listener-hook-test-needs-per-render-useref-slot-index

_Discovered: 2026-05-08 by implementer in tour-4_

`useElementPosition` calls `useReducedMotion()` AND a private `useRef(reducedMotion)` to expose freshest reduced-motion value to the IntersectionObserver closure. The standard hook-test harness mocks `useState`/`useEffect` synchronously — but a `useRef` mock that just allocates a fresh `{ current }` per call breaks across re-renders (each `renderToString` is a new component instance, so the ref's `current` resets). Fix: maintain a hoisted `refSlots: Array<{ current: unknown }>` and a `refSlotIndex: { i: 0 }` counter; mock `useRef` to return `refSlots[i++]`, allocating a slot only on first encounter, and reset `refSlotIndex.i = 0` in the test's `renderHook` helper before each render. This preserves ref identity across renders without leaking between tests (slots cleared in `beforeEach`). The element-swap test then works because the ref slot persists from render-1 to render-2 the way React's ref persists. Diagnostic if you skip this: the second render's reduced-motion read sees the wrong (initial) value, or `reducedMotionRef.current = ...` writes to a stale slot — the IO callback sees `false` even after `mocks.reducedMotionRef.current = true`. Same harness shape as `useref-mock-with-hoisted-prefix-ref-unlocks-single-render-effect-deltas`, generalized: any hook with `useRef` slot count > 0 needs ordered slot allocation, NOT per-call fresh objects.

## tour-4-classic-debounce-vs-leading-edge-disambiguates-via-test-cases

_Discovered: 2026-05-08 by implementer in tour-4_

The brief for `useElementPosition` said: "Use setTimeout. Reset on each call ONLY if the previous timer hasn't fired yet (i.e. classic debounce)." That phrasing is ambiguous — "classic debounce" resets the timer every call (trailing edge fires once after the last call), but "from the FIRST under-0.5 event in a window" sounds leading-edge. Disambiguator: the test cases. "Multiple <0.5 within 250ms call it once" passes for BOTH leading and trailing, but "after 250ms idle the next <0.5 calls scrollIntoView again" requires the timer to be one-shot per window, which trailing-edge satisfies cleanly: each `clearTimeout` + new `setTimeout` reset preserves the "fires once 250ms after the last under-0.5 event" semantics, and once it fires `hideTimer = null` so the next event schedules fresh. Generalizes: when a brief uses both "throttle" and "debounce" language, write the test cases first, then pick whichever implementation passes them. Don't try to satisfy ambiguous prose verbatim.

## tour-3-raf-id-stale-after-callback-fires-blocks-rescheduling

_Discovered: 2026-05-08 by implementer in tour-3_

A retry-loop hook that uses rAF as its scheduler must clear `handles.rafId` to `null` AT THE TOP of the rAF callback body, not just on tear-down. Reason: when the rAF tick fires, the id we recorded when calling `requestAnimationFrame(tick)` is now stale (the callback consumed it), but it's still sitting in `handles.rafId`. If the bottom of `tick` gates "schedule the next rAF" with `if (handles.rafId === null)` — to dedupe with a parallel observer-driven path that may also schedule — the gate fails because the stale id is still there. Symptom: the loop runs frame 1, then freezes in `'resolving'`, never increments the frame counter past 1 even though the budget is 30. Same trap exists for `setTimeout`-based schedulers. Diagnostic: tests that drive the rAF queue manually pass for the first frame and fail for every subsequent frame with status stuck on `'resolving'` — there's no visible error, the loop simply doesn't progress. Generalizes: every "fire-once" id stored on a handle (rAF, setTimeout, observer callbacks that re-arm rAFs, etc.) needs an explicit "I've been consumed" reset point in the callback body itself, not at the call site. Don't rely on `cancelAnimationFrame` to reset the id either — `cancelAnimationFrame` is only called on tear-down, not after a normal callback fires.

## tour-5-fake-dom-children-must-carry-html-surface-at-construction

_Discovered: 2026-05-08 by implementer in tour-5_

When building a node-only-vitest mini-DOM harness for a util that calls `container.querySelectorAll(...)` then iterates the result with `el.getAttribute(...)`, the harness's children MUST carry the HTMLElement-like surface at construction time, not via a wrapper function that returns a fresh object. The seductive-but-wrong shape is `function asHTMLElement(el: FakeElement): HTMLElement { return Object.assign({ ...el }, { getAttribute, ... }); }` — when only the test's outer references go through `asHTMLElement`, the children inside the container's `children: FakeElement[]` are still raw FakeElements without methods. The source's `querySelectorAll` returns raw children; the loop hits `el.getAttribute is not a function`. Fix: attach methods inside `makeEl` itself via `Object.assign(el, { getAttribute, hasAttribute, focus, addEventListener, removeEventListener })`, so every FakeElement is born HTMLElement-shaped. The wrapper is then just `(el) => el as unknown as HTMLElement` — a cast, no rewriting. Diagnostic if you skip this: `getFocusableElements` works in the install-time path (because tests cast that container) but fails inside the `getFocusableElements` body when iterating raw children. Generalizes: any fake-DOM harness where the SUT performs a tree walk (querySelector, parentElement, children) needs surface attached at element-creation time; harnesses where the SUT only ever touches the wrapped reference can get away with a wrapper. Pattern fits the canvas-context-menu test's flat element-tree assertion approach but extends it to objects exposed via `Array.from(NodeList)`.

## tour-7-prisma-generate-vs-migrate-distinction

_Discovered: 2026-05-08 by implementer in tour-7_

When a unit adds a Prisma column but the brief bans `prisma migrate` (because the orchestrator owns DB state), the typecheck on the consuming service still needs the regenerated client to know about the new field. `prisma generate` is a separate command that only rewrites the type definitions in `node_modules/.pnpm/.../@prisma/client/` and does NOT touch the database — so it is safe to run even when migrations are deferred. Run `pnpm --filter @ice/db generate` after editing `schema.prisma`, then the service typecheck (`pnpm --filter @ice/service-iam typecheck`) sees `completed_tours` in the User select-shape. Skipping `generate` produces a TS2353 "object literal may only specify known properties" error pointing at the new column in the route's `select: { ... }`. Generalizes: `migrate` writes to the DB, `generate` rewrites types — they are independent. Tests at the route layer mock `@ice/db` so they pass without `generate`, but typecheck does not.

## tour-7-json-string-column-needs-route-layer-parsing

_Discovered: 2026-05-08 by implementer in tour-7_

SQLite has no array type, so `User.completed_tours` is `String?` storing a JSON-encoded `string[]`. The discipline that keeps callers sane is: never expose the raw column outside the route file. Add a tiny `parseCompletedTours(raw)` helper that returns `[]` for null, empty string, malformed JSON, and non-array JSON values — the slice/UI sees `string[]` and only `string[]`. The PUT route reads → parses → mutates → JSON.stringify → writes. The GET route reads → parses → returns `completedTours` (camelCase) in the response, never the raw `completed_tours` column. Two read-time edge cases that surprised me: a non-array JSON value (e.g. `'"canvas-tour"'`) and malformed JSON (e.g. `'{not json'`) both deserve the `[]` fallback, and the very next PUT writes a valid JSON array — so a corrupt write self-heals on the next idempotent append. Generalizes: any "JSON-in-a-string-column" pattern needs a single read-side parser that's tolerant of nulls, malformed JSON, and shape mismatches; the write side is always `JSON.stringify(validatedShape)`.

## tour-8-jsdom-portal-needs-fresh-root-per-test-and-act-from-react

_Discovered: 2026-05-08 by implementer in tour-8_

Three intertwined gotchas when the first jsdom test under `// @vitest-environment jsdom` lands in this repo (the prior tour-3..6 tests all ran under node fake-DOM, so this was the cleanroom landing): (1) `jsdom` is not in `devDependencies` until you add it — `pnpm add -D -w jsdom` once, then the directive at the top of the test file activates it for that file only without slowing the rest of the suite. (2) `act` import path: React 19 (which this repo uses) re-exports `act` from `react` itself, NOT from `react-dom/test-utils` (deprecated). Importing it as `import { act } from 'react'` is the right call; `react-dom/test-utils` would still work but logs a deprecation warning under jsdom — silently passing through to console.error which can fail strict test runs. (3) `createPortal` + reused `document.body` between tests: tests that portal MUST clean `document.body.innerHTML` in `afterEach` AND unmount the React root explicitly (`root.unmount()` inside `act`). Skipping either one means the next test's query selector finds the previous test's overlay and assertions about "renders nothing when rect is null" fail mysteriously because the prior test left a spotlight in `document.body`. The pattern that works: per-test `container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);` in `beforeEach`, then `unmount(); document.body.innerHTML = ''` in `afterEach`. This shape will replicate across tour-10 (TourPopover) and tour-12 (TourRunner).

## tour-6-localstorage-fastpath-needs-vi-resetmodules-to-re-evaluate-initialstate

_Discovered: 2026-05-08 by implementer in tour-6_

The slice's `initialState` reads localStorage at module-load time so the engine can suppress auto-fired tours before the profile API resolves. To exercise the fast-path branch in a test (seed with stored ids, expect those ids in `init().completedTours`), restubbing `localStorage` AFTER the test file's top-level `import` of the slice is too late — the slice has already evaluated `readCompletedFromStorage()` against the empty pre-test stub and frozen `initialState`. The fix is `vi.resetModules()` followed by an `await import('../tour-slice')` — that forces the slice file to re-evaluate, picking up the freshly stubbed `localStorage`. Symptom if you skip this: `init().completedTours` is `[]` even though `localStorage.getItem(KEY)` returns the seeded JSON inside the same test. Pair with: `vi.stubGlobal('localStorage', ...)` (the standard fake-DOM pattern), and run the reset-and-reimport pattern in EACH fast-path test (parse-error fallback, non-array fallback, filter-non-strings, normal seeded path) so each evaluates against its own initial storage shape. Generalizes: any slice/util that does IO at top-level for an `initialState` computation needs `vi.resetModules` between tests that vary that IO.

## tour-6-react-usecallback-stub-keeps-hook-driveable-without-renderer

_Discovered: 2026-05-08 by implementer in tour-6_

The `useTour` hook composes ~6 `useCallback` wrappers around dispatchers. Driving the hook from a node-env unit test (no `@testing-library/react`, no fiber tree) collides with React's `useCallback` runtime check that requires an active renderer (`Cannot read properties of null (reading 'useCallback')`). Swapping to a manual closure or moving to jsdom would defeat the point of unit-testing the hook outside a React tree. The minimal escape: `vi.mock('react', () => ({ useCallback: <T>(fn: T): T => fn }))` — the mock turns `useCallback` into identity, so each call to the hook creates fresh closures (which is what the test wants — assertions are dispatch-call shape, not referential stability). `useDispatch` and `useSelector` get the standard `vi.mock('react-redux', ...)` treatment. This pattern lets a hook test stay in node-env even when the source uses `useCallback`; it's strictly cheaper than jsdom + a renderer for slice-orchestration tests where state changes between calls are driven by mutating the `useSelector` stub's return value. Caveat: the mock blocks `useEffect`, `useMemo`, `useState`, etc. — only safe when the hook uses ONLY `useCallback` + the redux hooks. If the hook later adds `useEffect`, expand the react mock or move to jsdom.

## tour-11-fake-window-dispatch-helper-must-itself-enforce-capture-before-bubble-ordering

_Discovered: 2026-05-08 by implementer in tour-11_

Stubbing `window.addEventListener` for a node-env keydown test typically uses a Map<eventType, Set<listener>> bus + a `dispatch(ev)` helper that iterates listeners in registration order. That works for tests that don't care about phases — but if the SUT registers with `{ capture: true }` and a test wants to verify "tour handler runs before bubbling listeners", the harness MUST itself partition by capture flag. Real DOM runs ALL capture listeners (in registration order) before ANY bubble listeners. A registration-order-only iteration silently passes when the capture listener happens to be registered first, then silently fails (or worse, gives a false-positive pass) when test setup reorders. The fix: store `{ cb, capture }` per listener and split `entries.filter(e => e.capture)` then `entries.filter(e => !e.capture)` before iterating. Pair this with `KeyboardEvent` stub class carrying a writable `defaultPrevented` field (the SUT calls `preventDefault()` and tests want to assert it). Sub-rule for vitest+TS strict-mode: `vi.fn()` returns `Mock<Procedure | Constructable>` which is NOT directly assignable to `() => void` props — annotate the spy as `vi.fn<() => void>()` (parameterized mock) so the TS error "Mock<Procedure | Constructable> is not assignable to type () => void" doesn't bubble up at typecheck time even though tests pass at runtime. Generalizes: any future hook that uses `{ capture: true }` listeners must have its test harness partition by phase, not just registration order.

## tour-11-array-push-return-value-makes-vi-fn-typed-callback-mismatch

_Discovered: 2026-05-08 by implementer in tour-11_

When using `vi.fn(() => callOrder.push('label'))` to record a sequence of handler invocations, the inferred return type is `number` (Array.prototype.push returns the new length), NOT `void`. Under TS strict mode this leaks: `Mock<() => number>` is not assignable to `Mock<() => void>` if the test field is typed `() => void`. Tests pass at runtime (the runtime spy is happy returning a number even when the prop type is void), but `tsc --noEmit` flags the mismatch. Fix: wrap the push in a block-bodied arrow with no implicit return — `vi.fn<() => void>(() => { callOrder.push('label'); })`. Same shape applies to `array.unshift`, `Map.set`, `Set.add` — all return non-void. The general rule: when a `vi.fn()` is destined for a `() => void` slot, parameterize the mock's signature explicitly AND ensure the body has no implicit return, OR the TS error fires only after a clean typecheck (long after the runtime test green-lights).

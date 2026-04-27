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

The destroy onConfirm handler used to dispatch `appendLog(...)` then `resetDeploy()` in the same tick. `resetDeploy` wipes `state.logs` and sets status to `'idle'`, so a fast destroy looked silently inert — "Destroy button does nothing" was a real perception bug, not a wiring issue. Fix: introduced a dedicated `destroyed` `DeployStatus` and a `destroySuccess` reducer that flips to that state and pushes a final summary log line. The UI's existing Clear button (which calls `resetDeploy`) lets the user dismiss the log when ready. Generalizes: any terminal-state action that clears its own log produces an indistinguishable-from-failure UX; always land on a non-idle status long enough for the human to see what happened.

## one-status-source-deploy-status

_Discovered: 2026-04-27 by orchestrator in compact-node status unification_

The compact-node status pill used to read `(data.deploy_status as string) || (data.status as string) || ''`. That double-source was the reason "blocks still showed Active after destroy": `clearCardDeployOverlay` correctly wipes `deploy_status`, but `data.status` was seeded `'active'` by templates, blueprints, the WAF block defaults, group/node creation in svg-canvas and cards-slice, and the drift checker — none of those reflect actual deploy state. Fix: drop the legacy fallback in `compact-node/index.tsx` so `deploy_status` is the only source, and stop seeding `status: 'active'` at every node-creation site (templates/expand-template, blocks/expand-blueprint, blocks/{aws,azure,gcp}/security/waf, svg-canvas drop handlers, cards-slice group creation). Leaves any existing card data carrying stale `data.status: 'active'` ignored at render time — no migration needed because the field is no longer read by the canvas. Generalizes: when two parallel state fields exist for the same UX concept, the fallback turns one of them into the de-facto source no matter how careful the writer side is. Pick one and delete the others.

## svg-canvas-isLogNode-precedes-renderer-map

_Discovered: 2026-04-27 by implementer in LT-1-consolidate-icetypes_

`svg-canvas.tsx`'s dispatcher loop has two parallel routing layers for the same iceType: an early `isLogNode` short-circuit (line ~2715) that hands off to `SvgLogNode` directly, AND a per-iceType `CONCEPT_NODE_RENDERERS` map (line ~135) consulted later in the `isBlock`/resource-fallback branches. The short-circuit always wins. So when LT-1 added `Monitoring.Log` to `isLogNode`, the existing `'Monitoring.Log': SvgObservabilityNode` entry in the map was instantly dead code — never reached at runtime, but visually misleading to any future reader who would assume the map drives the render. Fix: when widening the `isLogNode` check, also remove the dead map entry (and its now-unused import) so there's one source of truth for the iceType→component mapping. Generalizes: any iceType that's special-cased in an early branch of a dispatcher should NOT also live in the catch-all map for the same dispatcher — it's an invitation to subtle behavior splits later.

The iceType set that *counts as* a log node is also duplicated across at least three sites: `packages/blocks/src/expand-blueprint.ts:173` (the helper that hardcodes the canvas-emit list of "log-shaped" iceTypes), `packages/ui/src/features/canvas/components/svg-canvas.tsx:2634-2637` (the `isLogNode` dispatcher short-circuit), and `packages/core/src/importers/gcp/type-mapper.ts:87` (the importer's `Monitoring.LogGroup` mismatch). Adding a new log-shaped iceType requires touching all three. LT-5 should export a single shared `LOG_ICE_TYPES` set from `@ice/constants` and have all three sites consume it — same medicine as `one-status-source-deploy-status`: pick one source of truth and delete the parallels.

## data-version-bump-migrates-not-wipes

_Discovered: 2026-04-27 by critic in LT-1-consolidate-icetypes review_

The cards-slice load path treats a version bump as cause to wipe `localStorage` and start fresh, then runs `migrateCardNodes` only on already-current-version payloads. Result: a v5 → v6 bump deletes the user's canvas instead of migrating the iceTypes the bump was added to migrate. The migrator function exists but is unreachable on the transition it was written for. Same shape recurs anywhere a versioned-payload loader has both "version mismatch → reset" and "migrate fields" branches but routes the bumped version through reset. Additionally: any reducer that accepts a payload of nodes/edges from outside the slice (`importToActiveCard`, `addToActiveCard`, `addNodeToCard`) is its own load path and must run the same migration pipeline — version-keyed localStorage is only one ingestion route; backend-saved canvases, AI tool-use writes, and clipboard imports all bypass it. Generalizes: when bumping a persisted-data version, write the migration as a pure function over the payload and call it from every ingestion site, not just from the localStorage loader.

## deploy-service-package-name-is-service-deploy

_Discovered: 2026-04-27 by implementer in LT-2-filter-resolver_

The deploy service's `package.json` name is `@ice/service-deploy`, NOT `@ice/deploy` — every other "service" package in `services/*` follows the `@ice/service-<name>` convention (`@ice/service-credentials`, etc.) but briefs and human shorthand sometimes call it `@ice/deploy`. Running `pnpm --filter @ice/deploy typecheck` silently no-ops (filter matches zero packages, exit 0) instead of erroring, so a wrong filter LOOKS green. Always verify the filter target exists by reading `services/<name>/package.json` before trusting a typecheck pass. Generalizes: any pnpm `--filter` against a non-existent name is a silent success; `pnpm -r typecheck` from the repo root is a safer fallback when the package name is uncertain.

## google-cloud-logging-getentries-not-entries-list

_Discovered: 2026-04-27 by implementer in LT-3-log-stream-service_

The brief talked about `entries.list({...})` and `tailLogEntries({...})` per the Cloud Logging REST API names, but the `@google-cloud/logging` Node SDK's surface is `Logging.getEntries(opts)` (returns `Promise<[Entry[], ...]>`) and `Logging.tailEntries(opts)` (returns a Duplex). Each `Entry` carries envelope fields under `entry.metadata` (`timestamp`, `insertId`, `severity`, `resource`) and the payload under `entry.data` (string for textPayload, object for jsonPayload — `JSON.stringify` it). `tailEntries`'s `data` event delivers a `TailEntriesResponse` with an `entries: Entry[]` array, not a single Entry. Don't try to map the REST shape onto the SDK shape one-to-one — read the SDK's `.d.ts` first. Also: the IAM probe in tests inflates the `getEntries` call counter by one, which means a test asserting "call N is the second poll" is off by one if it doesn't account for the probe. Make the probe an explicit early branch in test mocks (`if (call === 1) return [[]]`).

## google-cloud-logging-loaded-via-load-sdk-from-core

_Discovered: 2026-04-27 by implementer in LT-3-log-stream-service_

`@google-cloud/logging` is declared in `packages/core/package.json` and loaded at runtime via the dynamic-import wrapper `load_sdk(module_name)` in `packages/core/src/deploy/providers/gcp/sdk-loader.ts`. The deploy service does NOT have it as a direct dependency — `services/deploy/node_modules/@google-cloud/` contains nothing. Trying to `import { Logging } from '@google-cloud/logging'` from the deploy service would fail at TypeScript resolution. The right path: re-export `load_sdk` from `packages/core/src/deploy/index.ts` (so `import('@ice/core')` exposes it), then `(await core.load_sdk('@google-cloud/logging')).Logging` to construct the client. Generalizes: any GCP SDK referenced from a service outside `packages/core` should go through `load_sdk`, not a direct import — keeps the SDK lazy (so missing optional deps don't break startup) and avoids each service repeating the dependency declaration.

## auth-derived-orgid-must-not-trust-body

_Discovered: 2026-04-27 by implementer in LT-4-routes-and-socket_

The LT-3 `subscribe()` signature takes `organisationId` as a required field on `SubscribeArgs`, which is fine for the service but a footgun for any HTTP route in front of it: if the route just spreads `req.body` into the call, a client can spoof `organisationId: 'evil'` in the JSON body and route the credential lookup (`providerService.getDecryptedCredentials(organisationId, 'gcp')`) to a different tenant's GCP project. The mitigation is mechanical but non-obvious: in the route, build the args object explicitly with `{ ...validatedBody, organisationId: req.organisationId }` AFTER body validation, so the auth-derived value always wins regardless of what the body carried. I added a dedicated test (case #5 in `services/deploy/src/routes/__tests__/logs.test.ts`) that POSTs `{ ...validBody, organisationId: 'evil' }` and asserts the mock receives `'org-real'`. Generalizes: any service-layer function whose argument record happens to mix client-controlled fields and auth-derived fields needs an explicit assembly step at the route boundary — never trust `...req.body` to compose the args object directly.

## supertest-not-in-monorepo-use-fetch-against-app-listen

_Discovered: 2026-04-27 by implementer in LT-4-routes-and-socket_

The deploy service has zero supertest in its package.json (and so does `@ice/shared`); the only existing route test pattern in the repo is service-level direct function calls (`services/canvas/src/__tests__/org-isolation.int.test.ts` explicitly says "to avoid external dependencies like supertest"). For HTTP-level tests of an Express router, the working pattern is: `express()` + `app.use('/path', router)` + `app.listen(0, '127.0.0.1', ...)` (port 0 = ephemeral), capture `server.address().port`, then `fetch(\`http://127.0.0.1:${port}\`)` from the test. Node 22's built-in `fetch` plus `http.Server` is enough — no extra deps. Cleanup goes in `afterEach` via `server.close(...)`. Generalizes: don't add supertest when fetch + a real listen does the same job in 5 fewer lines and one fewer dependency.

## frontend-cannot-import-from-services

_Discovered: 2026-04-27 by implementer in LT-5-frontend-wiring_

The frontend (packages/ui) cannot import types from services/ — the workspace topology has no path from `@ice/ui` to `@ice/service-deploy`, and even adding one would couple the renderer to a server-only package. For shared API contracts (request/response shapes, socket payloads), there are exactly three viable homes: (a) inline-mirror in the slice that consumes them (cheap, accept the drift risk), (b) lift to `packages/types/src/<domain>.ts` and import from both sides (canonical for cross-package types), or (c) keep two parallel definitions with a runtime decode/validate at the boundary. For LT-5 I chose (a) because the LogEntry/SourceResolution shapes only have one frontend consumer (logs-slice) and the drift would surface immediately as a runtime failure in the hook — a malformed entry from the socket would fail the `typeof entry.insertId !== 'string'` defense in `appendEntry` and quietly drop. If a third consumer appears (LT-6 properties panel? a backend-to-backend log pipe?), promote to `packages/types/src/logs.ts` and delete the mirror. Generalizes: when a service-only type needs to cross into the renderer, the choice between (a) and (b) is purely about how many consumers exist now — one consumer is mirror, two+ is promote.

## socket-room-and-http-lifecycle-are-two-cleanups

_Discovered: 2026-04-27 by implementer in LT-5-frontend-wiring_

The Log Terminal subscription has TWO independent server-side resources that must be released on unmount: the Socket.IO room membership (released by `socket.emit('unsubscribe:logs', terminalNodeId)`) AND the polling/tail loop opened by the HTTP `/subscribe` call (released by HTTP `/unsubscribe { subscriptionId }`). Skipping either leaks: skipping the room emit leaves the client receiving events for a torn-down stream (memory leak in handler closures); skipping the HTTP unsubscribe leaks a 60s polling loop hammering Cloud Logging quota. The cleanup order in the hook is: stop listeners → leave room → POST unsubscribe → dispatch teardown. There's also a third edge case: the user unmounts WHILE the initial `/subscribe` POST is still in flight. The naive `cancelled` flag isn't enough — the request still completes and creates a server-side stream that never gets closed. Fix: in the cancelled branch of the await, fire a best-effort `unsubscribe(result.subscriptionId)` to release the just-opened stream we never used. Generalizes: any hook that spans HTTP-init + socket-room needs cleanup symmetry on BOTH paths AND a path for "init returned after we already cancelled".

## properties-panel-section-nodeId-vs-selectedNode-prop-shape

_Discovered: 2026-04-27 by implementer in LT-6-properties-section_

The properties-panel.tsx per-iceType branches (`Config.Environment`, `Network.PrivateNetwork`, `Network.CustomDomain`, etc.) thread `selectedNode={...}` plus an `updateNodeField(field, value)` callback into the inline panel components, leaning on the closure's `selectedNodeId`. `MonitoringLogSection` instead takes a single `nodeId: string` prop and re-resolves both the cards slice (via `selectActiveCard`) and the logs slice (via `selectLogStream(state, nodeId)`) through Redux, dispatching `updateCardNodeData({ nodeId, data })` directly. The reason: it's the first per-iceType section that reads from a slice OTHER than `cards`, so funneling everything through `updateNodeField` (which targets the panel's selected nodeId) would couple the section to selection state instead of the explicit prop. The relevant action is `updateCardNodeData` at `packages/ui/src/store/slices/cards-slice.ts:583`, signature `({ nodeId: string; data: Record<string, unknown> })` — it shallow-merges `data` into the existing `node.data`, which is exactly what we want. Generalizes: when adding a per-iceType section that reads outside the cards slice, prefer the `nodeId` prop shape; sections that only mutate `cards` can keep the `selectedNode + updateNodeField` shape.

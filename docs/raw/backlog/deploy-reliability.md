# Deploy Reliability — Issues Preventing Successful Cloud Deploys

Audit date: 2026-04-19. Primary deploy target: GCP. Scope: block definitions, block properties, connections, parent/child containment, deploy pipeline, observability. AI/ghost/diagnosis features explicitly excluded — they just shipped and aren't on the deploy critical path.

**Status (2026-04-19):** 18/22 items shipped. RBAC-tagged items (DR-H1, DR-H2, DR-F5, DR-O4) explicitly skipped — community edition is single-user so there's no authorization boundary to enforce. See [Implementation Notes](#implementation-notes) at the bottom for what changed where.

Severity:
- **blocker** — deploy fails, can't start, or silently loses user data/state
- **friction** — deploy succeeds but user hits a confusing gap or misleading outcome
- **polish** — edge-case ergonomics, no correctness impact

Status legend on each row: ✅ shipped · ⏭️ skipped (community edition) · ⬜ open.

---

## 1. Hard blockers — fix first

| ID | Status | Severity | Title | Evidence | Impact | Fix |
|---|---|---|---|---|---|---|
| DR-H1 | ⏭️ | blocker | `/cleanup-orphans` has no RBAC guard | `services/deploy/src/routes/canvas-deploy.ts:91` — route missing `requireProjectAccess()` | Any authenticated user (including viewer) can wipe every ICE-managed GCP resource in their org. Scoped to one org but destroys all cards' infra. | Skipped — community edition is single-user, no RBAC surface to harden |
| DR-H2 | ⏭️ | blocker | `/status/:deploymentId` has no RBAC | `services/deploy/src/routes/canvas-deploy.ts:131` | Any authenticated user can read any deployment's full result, outputs, errors, and plan by iterating UUIDs. Information disclosure. | Skipped — community edition is single-user |
| DR-H3 | ✅ | blocker | Rollback baseline query ignores environment | `services/deploy/src/services/deploy.service.ts:1531` — `where: { card_id, status: 'success', id: { not: rollbackRecord.id } }` | In a multi-env project (dev + staging + prod), rolling back prod loads dev's latest success as the baseline → prod is rolled back to dev config. Silent cross-env contamination. | Added `environment: rollbackRecord.environment` to the where clause |
| DR-H4 | ✅ | blocker | OAuth token expiry mid-deploy (no refresh) | `services/deploy/src/providers/gcp/credential-resolver.ts:60-72` — token validated once at deploy start | Token TTL ~60 min by default. Cloud SQL / GKE / large Cloud Build deploys run 15-30 min; a chain of them or one slow one crosses the TTL → 403 on minute 61, deploy fails mid-stream with a cryptic auth error. | OAuth2Client constructed with `clientId`/`clientSecret` + `setCredentials({access_token, refresh_token, expiry_date})` so google-auth-library auto-refreshes mid-deploy; refreshed tokens persisted via new `updateGCPOAuthTokens()` helper in `@ice/service-credentials` |
| DR-H5 | ✅ | blocker | Deploy on empty canvas reports success | `services/deploy/src/services/deploy.service.ts:362-381` — no check that resource nodes exist before translation | User clicks Deploy on a canvas with 0 resource blocks (maybe only Group nodes) → "0 resources translated", status transitions to `planned` then `success`. User thinks deploy worked, nothing actually deployed. | Two-layer guard: pre-DB early return with `EMPTY_CANVAS` code when no non-container resource nodes exist; post-translation throw when `translation.deployable_count === 0` |

---

## 2. High-friction — deploy works, user misled

| ID | Status | Severity | Title | Evidence | Impact | Fix |
|---|---|---|---|---|---|---|
| DR-F1 | ✅ | friction | Pipeline build logs never reach the deploy panel | `services/deploy/src/services/queue.service.ts:243-258` emits `pipeline:update` scoped to nodeId; deploy panel subscribes to `deploy:progress` scoped to cardId | User deploying via `git push` sees nothing in the main deploy panel until the apply phase starts — has to click into the per-node pipeline panel to watch "cloning / installing / building". Asymmetric UX between manual and push-triggered deploys. | Queue worker mirrors every stage transition + every raw build line into `emitDeployProgress(cardId, {type:'log'})` alongside the existing pipeline events, prefixed with `[build:...]` / `[build]` so the unified feed stays legible |
| DR-F2 | ✅ | friction | Rename canvas block → deploy status orphans | `services/deploy/src/services/deploy.service.ts:811-828` — `nameToNodeId` map built from current canvas, fails when a resource was renamed since last deploy | `source_node_id` lost on the resource result → canvas block gets no `deploy_status` overlay even on success. User sees a green banner but the renamed node stays idle-looking. | `findSourceNodeId` falls back to `DeployedResourceMapping` lookup by `provider_id` (most stable), then by name, before giving up and logging a warning |
| DR-F3 | ✅ | friction | Drift per-property diffs never rendered | `services/deploy/src/services/deploy.service.ts:1859-1931` — `driftResults[].changes` has `{path, desired, actual}`, frontend only shows red dot | User sees "drifted" indicator but can't tell which property drifted or by how much — has to open dev tools and inspect Redux. | Already done — `driftByNode[nodeId].changes[]` stored in deploy-slice; rendered per-property (path, `actual → desired`) in `properties-panel.tsx:216-239` |
| DR-F4 | ✅ | friction | Partial-success deploys poison the next diff | `services/deploy/src/services/deploy.service.ts:546-578` — baseline filter `{ status: { in: ['success','partial'] } }` doesn't exclude the current failed attempt | Deploy A creates 3 resources, 1 fails → status `partial`. Retry B loads A as baseline but A's `currentGraph` only has the 2 that succeeded → B re-creates the failed one as "new" instead of "update" → potential duplicate / orphan. | Added `id: { not: deployment.id }` to the baseline where-clause so an in-flight deploy can never pick itself up as the baseline |
| DR-F5 | ⏭️ | friction | `editor` can Plan but not Apply — no pre-flight UI | `services/deploy/src/routes/canvas-deploy.ts:22` (plan = editor) vs `:32` (apply = owner) | Editor clicks "Plan" OK, then "Deploy" → 403 "Insufficient permissions" with no prior warning. Confusing in orgs with editor + owner split. | Skipped — community edition is single-user, no editor/owner split to reconcile |
| DR-F6 | ✅ | friction | Failed-resource error not surfaced on canvas node | `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts:86-98` — success path writes `deploy_outputs`; failure path sets `deploy_status:'error'` but no error text | Red dot on the node, tooltip empty. User has to scroll deploy panel logs and correlate by name to find which resource failed and why. | Progress `status:'failed'` path now sets a placeholder `deploy_error` immediately (falls back to `event.error` / `event.message` / generic text); `resource_result` path guarantees a non-empty error string. Already rendered by `compact-lod3.tsx` |
| DR-F7 | ✅ | friction | Firestore and Managed SSL Cert handlers fake `update()` | `packages/core/src/deploy/providers/gcp/handlers/firestore.ts:76-80`; `packages/core/src/deploy/providers/gcp/handlers/managed-ssl-certificate.ts:137-140` | Both return `{ success: true }` without actually mutating. User changes Firestore location or SSL cert domain list → deploy reports success, cloud state unchanged. Requires manual deletion to recover. | Both handlers diff desired vs current; when `locationId`/`type` (Firestore) or `domains` (SSL cert) changed, return `success: false` with an explanatory error that instructs the user to delete + redeploy |
| DR-F8 | ✅ | friction | Refresh mid-deploy replays from seq 0 | `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts:244` — always passes `since: 0` | Client tracks `lastSeqRef` correctly but never uses it on reconnect. Long deploys (hundreds of events) slow to reload, potential duplicate renders. | Pass `lastSeqRef.current.seq` as `since`; reset only on card switch, never on re-render |
| DR-F9 | ✅ | friction | Cancel doesn't propagate to Cloud Build subprocess | `services/deploy/src/services/deploy-locks.ts:76-87` — AbortSignal aborts the deploy loop; long-running GCP operations don't observe it | User clicks Cancel during a 30-min Cloud Build → local loop stops, job keeps running in GCP (and billing). User sees "cancelled" in UI but cloud state keeps mutating. | `abort_signal` threaded through `DeployOptions` → `GCPHandlerContext.abort_signal`. `cloud-build-helper` watches the signal, calls the Cloud Build `cancel` REST API on abort, and exits its poll loop |
| DR-F10 | ✅ | friction | Deployed URL only appears after full deploy finishes | `services/deploy/src/services/deploy.service.ts:1656-1799` — URL lives in resource outputs but there's no live "deployed to X" event | User stares at a progress bar for 10 minutes with no hint that their Cloud Run is already live at minute 3. First time they see the URL is when the whole deploy completes. | `on_progress` callback signature extended with `extra.outputs`; when a resource reaches `completed`, deploy.service emits `{type:'log', message: 'Deployed <name> → <url>'}` using `custom_domain_url ?? url ?? default_url ?? endpoint ?? domain ?? ip_address` priority |
| DR-F11 | ✅ | friction | Requirements timeout doesn't block apply when `blocking:false` | `services/deploy/src/services/requirements.service.ts:135-188` — 10 s AbortController; timed-out reqs marked `unmet`, but `canDeploy` is only blocked by `blocking:true` reqs that aren't `met/verified` | A non-blocking requirement that times out shows as "unmet" in the UI; `canDeploy: true` still → user deploys past an unverified state (e.g., DNS not yet propagated, cert not yet issued) and hits a cryptic cloud error later. | `runCheck` detects AbortError / `ctx.signal.aborted` and returns `status:'expired'` instead of `'unmet'`. Requirements UI renders `expired` with a Clock icon (sky) and "timed out" label, visually separate from the amber `unmet` state |

---

## 3. Block & property consistency gaps

| ID | Status | Severity | Title | Evidence | Impact | Fix |
|---|---|---|---|---|---|---|
| DR-B1 | ✅ | friction | AWS Scalable Backend missing `size` default | `packages/blocks/src/aws/backend/scalable-backend.ts:11-19` — no `size` in `nodeDataDefaults`; GCP/Azure have `gcp-default` / `azure-0.25-0.5` | Drop AWS backend, don't open properties, Deploy → "size required" mid-plan or cryptic AWS API error. | Added `size: '0.25-512'` (the minimum Fargate tier already enumerated in the resource schema) |
| DR-B2 | ✅ | friction | AWS SSR Site missing `image` / `repository` defaults | `packages/blocks/src/aws/frontend/ssr-site.ts:11-13` — sparse nodeDataDefaults; GCP/Azure populate them | Same failure mode as DR-B1 — deploy blows up on missing required Docker fields. | Added ECR-shaped `image` placeholder + `repository: 'myorg/ssr-app'` mirroring the GCP/Azure pattern |
| DR-B3 | ✅ | friction | GCP Static Site defaults to `domain: 'example.com'` | `packages/blocks/src/gcp/frontend/static-site.ts` | User who doesn't touch the default → Firebase Hosting tries to claim `example.com` → domain conflict error. | Default is now `domain: ''`; the translator already treats empty domain as "no custom domain" so the user opts in explicitly |
| DR-B4 | ✅ | friction | `PROPERTY_EXTRACTORS` silently returns `{ region, labels: {} }` on unmapped iceTypes | `packages/core/src/deploy/card-translator.ts:753-754` | Adding a block to the type map without a corresponding extractor → all its properties (minInstances/maxInstances/cpu/memory) silently dropped at deploy. Deploy succeeds with wrong config. | Missing extractor now pushes a warning, adds the node to `skipped[]`, logs via `console.error`, and skips the `deployables.push` so the node is not deployed at all. Matches the "refuse to deploy rather than deploy wrong config" contract |
| DR-B5 | ✅ | polish | `Network.PublicEndpoint` listed twice in `GCP_DEPLOYABLE` | `packages/core/src/validation/deploy-rules.ts:29,32` | Harmless (Set dedupes), but signals stale code; future edit could accidentally remove only one copy. | Duplicate removed |

---

## 4. Observability polish

| ID | Status | Severity | Title | Evidence | Impact | Fix |
|---|---|---|---|---|---|---|
| DR-O1 | ✅ | friction | `DeployEvent` cascades on pruning → event log orphaned silently | `packages/db/prisma/schema.prisma:279` (`onDelete: Cascade`) + `services/deploy/src/services/cron.service.ts:47-106` (90-day prune) | Opening an old deploy's event tape returns empty list with no "pruned" indicator. Blocks incident archaeology for anything older than 90 days. | Schema changed to `onDelete: NoAction` in both `schema.prisma` and `schema.sqlite.prisma`; new migration `20260419000000_deploy_event_no_cascade`. Cron adds a dedicated 180-day `DeployEvent` prune. `GET /stream/:cardId` returns `isPruned: true` when the parent deployment is gone so the UI can label it instead of rendering an empty log |
| DR-O2 | ✅ | friction | `DeployedResourceMapping` not pruned with `CanvasDeployment` | `services/deploy/src/services/cron.service.ts:47-106` | Stale mappings outlive the deployment → drift detection shows them as "extra" → user forced to run cleanup-orphans for phantom state. | Daily cron now `DELETE`s every `deployed_resource_mapping` whose `card_id` no longer exists in `canvas_card` — catches deleted-card orphans without over-pruning active mappings |
| DR-O3 | ✅ | friction | Snapshot throttle races short deploys | `services/deploy/src/services/deploy.service.ts:42-61` — 500 ms throttle; short deploys can finish before a snapshot flushes | Second tab opening right as a 400 ms deploy finishes sees no snapshot → stuck on stale "deploying" state. | Added `flushSnapshotNow(cardId)` that clears any pending throttled timer and writes the snapshot synchronously; called from `applyDeployment`'s `finally` block before `releaseLock()` |
| DR-O4 | ⏭️ | friction | `drift-check` with `viewer` role spins up a real GCP client | `services/deploy/src/routes/canvas-deploy.ts:166` | Viewer triggers live cloud queries with owner-provided credentials. Minor info-disclosure + quota impact. | Skipped — community edition is single-user |

---

## False positives — not worth chasing

- **"`isDomain()` in `packages/core/src/validation/classifiers.ts` is missing `Network.CustomDomain`"** — the regex `/Domain|DNS/i.test(t)` matches `Network.CustomDomain` as a substring, so the two classifier files diverge syntactically but behave identically. Still worth collapsing into one shared module eventually, but not a correctness bug.
- **"`isBackend` has a duplicate `Compute.` check"** — real, code-quality nit, no behavioral impact.
- **"`isQueue` regex is too broad and could match hypothetical `EventBridge`-style names"** — hypothetical; no real iceType triggers a false match today.

---

## Suggested attack order

1. **DR-H1, DR-H2, DR-H3** — security + rollback correctness, one small PR, high ROI
2. **DR-H5, DR-B4** — validation to prevent silent no-ops (empty canvas + dropped properties), one PR
3. **DR-F2, DR-F6** — per-node status + error surfacing, biggest UX win for "what actually broke?"
4. **DR-F1, DR-F10** — live log surfacing from push-to-deploy + deployed URLs in logs, one PR
5. **DR-H4, DR-F9** — token refresh + cancel propagation (more invasive, touches GCP handler layer)
6. **DR-B1, DR-B2, DR-B3** — block defaults, one sweep
7. **DR-F7** — Firestore + SSL Cert immutable-update detection
8. **DR-F3, DR-F4, DR-F5, DR-F8, DR-F11** — drift UI, baseline correctness, RBAC pre-flight, seq replay, timeout semantics
9. **DR-O1–O4, DR-B5** — observability + retention polish

---

## Implementation Notes

Landed 2026-04-19 as a single reliability sweep. Files touched (grouped by concern):

### Deploy service
- `services/deploy/src/services/deploy.service.ts` — pre-DB empty-canvas guard, post-translation `deployable_count === 0` throw, rollback environment filter, baseline self-exclusion, `findSourceNodeId` provider-id fallback using `DeployedResourceMapping`, per-resource "Deployed to X" log, `flushSnapshotNow` in `finally`, `abort_signal` wiring into `deploy_graph`
- `services/deploy/src/services/cron.service.ts` — 180-day `DeployEvent` prune + card-orphan `DeployedResourceMapping` prune
- `services/deploy/src/services/requirements.service.ts` — `expired` status on AbortError instead of generic `unmet`
- `services/deploy/src/services/queue.service.ts` — push-to-deploy build logs mirror into the unified `deploy:progress` feed
- `services/deploy/src/routes/canvas-deploy.ts` — `/stream/:cardId` returns `isPruned` flag
- `services/deploy/src/providers/gcp/credential-resolver.ts` — OAuth2Client auto-refresh + `on('tokens')` persistence hook

### Core engine
- `packages/core/src/deploy/types.ts` — `DeployOptions.abort_signal`; `on_progress.extra` extended with `outputs`/`error`/`provider_id`
- `packages/core/src/deploy/deploy-engine.ts` — passes `result.outputs` + `result.error` + `provider_id` into `on_progress`
- `packages/core/src/deploy/providers/gcp/types.ts` — `GCPHandlerContext.abort_signal`
- `packages/core/src/deploy/providers/gcp/gcp-deployer.ts` — forwards `abort_signal` into the handler context
- `packages/core/src/deploy/providers/gcp/handlers/cloud-build-helper.ts` — signal-aware sleep + remote `builds:cancel` POST on abort
- `packages/core/src/deploy/providers/gcp/handlers/firestore.ts` — refuses immutable-field changes with a recovery hint
- `packages/core/src/deploy/providers/gcp/handlers/managed-ssl-certificate.ts` — same pattern for the `domains` list
- `packages/core/src/deploy/card-translator.ts` — missing `PROPERTY_EXTRACTORS` entry becomes a warning + skip, not a silent `{region, labels: {}}` fallback
- `packages/core/src/validation/deploy-rules.ts` — dedup `Network.PublicEndpoint`

### Blocks
- `packages/blocks/src/aws/backend/scalable-backend.ts` — `size: '0.25-512'` default
- `packages/blocks/src/aws/frontend/ssr-site.ts` — ECR-shaped `image` + `repository` defaults
- `packages/blocks/src/gcp/frontend/static-site.ts` — `domain: ''` (no more `example.com`)

### UI
- `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts` — placeholder `deploy_error` on progress=failed + fallback on resource_result; stream replay uses `lastSeqRef.current.seq`
- `packages/ui/src/features/deploy/components/requirements-section.tsx` — Clock icon + "timed out" label for `status === 'expired'`

### DB
- `packages/db/prisma/schema.prisma`, `schema.sqlite.prisma` — `DeployEvent.deployment` → `onDelete: NoAction, onUpdate: NoAction`
- `packages/db/prisma/migrations/20260419000000_deploy_event_no_cascade/migration.sql` — matching DDL

### Credentials service
- `services/credentials/src/services/provider.service.ts` — new `updateGCPOAuthTokens(orgId, {access_token, token_expiry?})` helper

## Related: Cost Engine Consolidation (2026-04-19)

Separately from the deploy reliability sweep, the deploy panel's parallel cost estimator was removed. The Cost Estimation panel (`features/cost/`) is now the single source of truth for every cost number in the app.

Removed:
- `packages/ui/src/features/deploy/utils/cost-estimator.ts` — deleted (120 lines of hardcoded GCP list prices, no tier scaling, no multi-provider support)
- `costEstimates` / `totalMonthlyCost` fields from `PreDeployAnalysis`
- Cost rendering block from `predeploy-warnings.tsx`

Retained in the deploy panel: security warnings only (via `analyzePreDeploy` → `analyzeSecurityWarnings`).

**Why:** The two estimators disagreed on the same canvas — different pricing tables (hardcoded vs live API resource definitions), different filters (the old deploy one counted containers, cost panel excludes them), and only the cost panel honoured the traffic-tier slider. Rather than unify two engines that solved 80% of the same problem, we kept the one that was already producing the right numbers.

The file header in `packages/ui/src/features/deploy/utils/predeploy-analysis.ts` records this decision so a future contributor doesn't reintroduce a parallel estimator.

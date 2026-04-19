# Deploy Reliability — Issues Preventing Successful Cloud Deploys

Audit date: 2026-04-19. Primary deploy target: GCP. Scope: block definitions, block properties, connections, parent/child containment, deploy pipeline, observability. AI/ghost/diagnosis features explicitly excluded — they just shipped and aren't on the deploy critical path.

Severity:
- **blocker** — deploy fails, can't start, or silently loses user data/state
- **friction** — deploy succeeds but user hits a confusing gap or misleading outcome
- **polish** — edge-case ergonomics, no correctness impact

---

## 1. Hard blockers — fix first

| ID | Severity | Title | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| DR-H1 | blocker | `/cleanup-orphans` has no RBAC guard | `services/deploy/src/routes/canvas-deploy.ts:91` — route missing `requireProjectAccess()` | Any authenticated user (including viewer) can wipe every ICE-managed GCP resource in their org. Scoped to one org but destroys all cards' infra. | Add `requireProjectAccess('owner')` — or drop to org-role guard (`requireOrgRole('admin')`) since the operation isn't card-scoped |
| DR-H2 | blocker | `/status/:deploymentId` has no RBAC | `services/deploy/src/routes/canvas-deploy.ts:131` | Any authenticated user can read any deployment's full result, outputs, errors, and plan by iterating UUIDs. Information disclosure. | Add `requireProjectAccess('viewer')` + verify `deployment.card_id` belongs to the caller's org |
| DR-H3 | blocker | Rollback baseline query ignores environment | `services/deploy/src/services/deploy.service.ts:1531` — `where: { card_id, status: 'success', id: { not: rollbackRecord.id } }` | In a multi-env project (dev + staging + prod), rolling back prod loads dev's latest success as the baseline → prod is rolled back to dev config. Silent cross-env contamination. | Add `environment: rollbackRecord.environment` to the where clause |
| DR-H4 | blocker | OAuth token expiry mid-deploy (no refresh) | `services/deploy/src/providers/gcp/credential-resolver.ts:60-72` — token validated once at deploy start | Token TTL ~60 min by default. Cloud SQL / GKE / large Cloud Build deploys run 15-30 min; a chain of them or one slow one crosses the TTL → 403 on minute 61, deploy fails mid-stream with a cryptic auth error. | Wrap auth client with a refreshing wrapper, or poll-refresh in the deploy loop; at minimum, log warning when token age exceeds 45 min |
| DR-H5 | blocker | Deploy on empty canvas reports success | `services/deploy/src/services/deploy.service.ts:362-381` — no check that resource nodes exist before translation | User clicks Deploy on a canvas with 0 resource blocks (maybe only Group nodes) → "0 resources translated", status transitions to `planned` then `success`. User thinks deploy worked, nothing actually deployed. | Reject with 400 if `nodes.filter(n => n.type === 'resource' && !isContainer(n.data.iceType)).length === 0` |

---

## 2. High-friction — deploy works, user misled

| ID | Severity | Title | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| DR-F1 | friction | Pipeline build logs never reach the deploy panel | `services/deploy/src/services/queue.service.ts:243-258` emits `pipeline:update` scoped to nodeId; deploy panel subscribes to `deploy:progress` scoped to cardId | User deploying via `git push` sees nothing in the main deploy panel until the apply phase starts — has to click into the per-node pipeline panel to watch "cloning / installing / building". Asymmetric UX between manual and push-triggered deploys. | On push-to-deploy, queue worker also emits `deploy:progress` events with `type:'log'` so build steps show up in unified logs |
| DR-F2 | friction | Rename canvas block → deploy status orphans | `services/deploy/src/services/deploy.service.ts:811-828` — `nameToNodeId` map built from current canvas, fails when a resource was renamed since last deploy | `source_node_id` lost on the resource result → canvas block gets no `deploy_status` overlay even on success. User sees a green banner but the renamed node stays idle-looking. | Fall back to matching by `provider_id` from `DeployedResourceMapping` when name match fails; log warning when neither matches |
| DR-F3 | friction | Drift per-property diffs never rendered | `services/deploy/src/services/deploy.service.ts:1859-1931` — `driftResults[].changes` has `{path, desired, actual}`, frontend only shows red dot | User sees "drifted" indicator but can't tell which property drifted or by how much — has to open dev tools and inspect Redux. | Store `changes` in `state.driftByNode[nodeId]`, render in node tooltip or properties-panel drift section |
| DR-F4 | friction | Partial-success deploys poison the next diff | `services/deploy/src/services/deploy.service.ts:546-578` — baseline filter `{ status: { in: ['success','partial'] } }` doesn't exclude the current failed attempt | Deploy A creates 3 resources, 1 fails → status `partial`. Retry B loads A as baseline but A's `currentGraph` only has the 2 that succeeded → B re-creates the failed one as "new" instead of "update" → potential duplicate / orphan. | Exclude `deployment.id === currentDeployId` from baseline, or rebuild baseline from `DeployedResourceMapping` (more reliable) |
| DR-F5 | friction | `editor` can Plan but not Apply — no pre-flight UI | `services/deploy/src/routes/canvas-deploy.ts:22` (plan = editor) vs `:32` (apply = owner) | Editor clicks "Plan" OK, then "Deploy" → 403 "Insufficient permissions" with no prior warning. Confusing in orgs with editor + owner split. | Frontend: disable the Deploy button for non-owners with a "Ask an owner to apply this plan" tooltip; or symmetrize to `editor` for both |
| DR-F6 | friction | Failed-resource error not surfaced on canvas node | `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts:86-98` — success path writes `deploy_outputs`; failure path sets `deploy_status:'error'` but no error text | Red dot on the node, tooltip empty. User has to scroll deploy panel logs and correlate by name to find which resource failed and why. | Mirror the success path: `nodeData.deploy_error = event.result.error` on resource failure; render in the node's existing status overlay |
| DR-F7 | friction | Firestore and Managed SSL Cert handlers fake `update()` | `packages/core/src/deploy/providers/gcp/handlers/firestore.ts:76-80`; `packages/core/src/deploy/providers/gcp/handlers/managed-ssl-certificate.ts:137-140` | Both return `{ success: true }` without actually mutating. User changes Firestore location or SSL cert domain list → deploy reports success, cloud state unchanged. Requires manual deletion to recover. | Detect immutable property changes at plan time → mark as "requires replacement" (delete + create) or emit a plan warning that blocks apply |
| DR-F8 | friction | Refresh mid-deploy replays from seq 0 | `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts:244` — always passes `since: 0` | Client tracks `lastSeqRef` correctly but never uses it on reconnect. Long deploys (hundreds of events) slow to reload, potential duplicate renders. | Pass `lastSeqRef.current.seq` as the `since` parameter |
| DR-F9 | friction | Cancel doesn't propagate to Cloud Build subprocess | `services/deploy/src/services/deploy-locks.ts:76-87` — AbortSignal aborts the deploy loop; long-running GCP operations don't observe it | User clicks Cancel during a 30-min Cloud Build → local loop stops, job keeps running in GCP (and billing). User sees "cancelled" in UI but cloud state keeps mutating. | In Cloud Build helper and similar long-running ops, accept the signal from context; call the GCP cancel API when aborted |
| DR-F10 | friction | Deployed URL only appears after full deploy finishes | `services/deploy/src/services/deploy.service.ts:1656-1799` — URL lives in resource outputs but there's no live "deployed to X" event | User stares at a progress bar for 10 minutes with no hint that their Cloud Run is already live at minute 3. First time they see the URL is when the whole deploy completes. | On each resource_result for a compute block, extract `url`/`endpoint` from outputs and emit `{type:'log', message:'Deployed to: ...'}` |
| DR-F11 | friction | Requirements timeout doesn't block apply when `blocking:false` | `services/deploy/src/services/requirements.service.ts:135-188` — 10 s AbortController; timed-out reqs marked `unmet`, but `canDeploy` is only blocked by `blocking:true` reqs that aren't `met/verified` | A non-blocking requirement that times out shows as "unmet" in the UI; `canDeploy: true` still → user deploys past an unverified state (e.g., DNS not yet propagated, cert not yet issued) and hits a cryptic cloud error later. | At minimum, distinguish "timed out" from "unmet" in the UI; consider promoting timed-out critical reqs to a soft-blocking state that prompts user acknowledgement |

---

## 3. Block & property consistency gaps

| ID | Severity | Title | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| DR-B1 | friction | AWS Scalable Backend missing `size` default | `packages/blocks/src/aws/backend/scalable-backend.ts:11-19` — no `size` in `nodeDataDefaults`; GCP/Azure have `gcp-default` / `azure-0.25-0.5` | Drop AWS backend, don't open properties, Deploy → "size required" mid-plan or cryptic AWS API error. | Add `size: 'aws-0.25-0.5'` (or whatever the AWS tier tag is) |
| DR-B2 | friction | AWS SSR Site missing `image` / `repository` defaults | `packages/blocks/src/aws/frontend/ssr-site.ts:11-13` — sparse nodeDataDefaults; GCP/Azure populate them | Same failure mode as DR-B1 — deploy blows up on missing required Docker fields. | Add image + repository defaults matching the GCP/Azure pattern |
| DR-B3 | friction | GCP Static Site defaults to `domain: 'example.com'` | `packages/blocks/src/gcp/frontend/static-site.ts` | User who doesn't touch the default → Firebase Hosting tries to claim `example.com` → domain conflict error. | Use empty string or a UUID-derived placeholder; force the user to choose |
| DR-B4 | friction | `PROPERTY_EXTRACTORS` silently returns `{ region, labels: {} }` on unmapped iceTypes | `packages/core/src/deploy/card-translator.ts:753-754` | Adding a block to the type map without a corresponding extractor → all its properties (minInstances/maxInstances/cpu/memory) silently dropped at deploy. Deploy succeeds with wrong config. | Throw / warn loudly when an extractor is missing for a known iceType; consider a typed registry so TS catches it at compile time |
| DR-B5 | polish | `Network.PublicEndpoint` listed twice in `GCP_DEPLOYABLE` | `packages/core/src/validation/deploy-rules.ts:29,32` | Harmless (Set dedupes), but signals stale code; future edit could accidentally remove only one copy. | Remove the duplicate |

---

## 4. Observability polish

| ID | Severity | Title | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| DR-O1 | friction | `DeployEvent` cascades on pruning → event log orphaned silently | `packages/db/prisma/schema.prisma:279` (`onDelete: Cascade`) + `services/deploy/src/services/cron.service.ts:47-106` (90-day prune) | Opening an old deploy's event tape returns empty list with no "pruned" indicator. Blocks incident archaeology for anything older than 90 days. | Keep `DeployEvent` longer than `CanvasDeployment` (break the cascade, separate retention), or add an `is_pruned` flag surfaced in the UI |
| DR-O2 | friction | `DeployedResourceMapping` not pruned with `CanvasDeployment` | `services/deploy/src/services/cron.service.ts:47-106` | Stale mappings outlive the deployment → drift detection shows them as "extra" → user forced to run cleanup-orphans for phantom state. | Cascade the deletion or add a parallel cron cleaning mappings older than retention window |
| DR-O3 | friction | Snapshot throttle races short deploys | `services/deploy/src/services/deploy.service.ts:42-61` — 500 ms throttle; short deploys can finish before a snapshot flushes | Second tab opening right as a 400 ms deploy finishes sees no snapshot → stuck on stale "deploying" state. | Force a final flush in the `finally` block of `applyDeployment` |
| DR-O4 | friction | `drift-check` with `viewer` role spins up a real GCP client | `services/deploy/src/routes/canvas-deploy.ts:166` | Viewer triggers live cloud queries with owner-provided credentials. Minor info-disclosure + quota impact. | Require `editor` for live-state drift; add a separate viewer-safe endpoint that diffs canvas vs stored snapshot only |

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

# Issue Inventory

Every issue found during the April 2026 deep-dive, with severity, source, and the phase that addresses it.

**Severity legend:**
- **Critical** — production hazard: security, data loss, silent corruption
- **High** — users will get stuck or confused on normal workflows
- **Medium** — significant friction; the feature is usable but poor
- **Low** — polish or edge case

**Source legend:**
- `USER` — reported directly by the user during the session
- `BACKEND` — backend-robustness investigation
- `UX` — frontend UX investigation
- `DATA` — data model investigation
- `LIVE` — surfaced during live deploy testing

---

## ✓ Already fixed (before this plan)

These landed during the session and are included here so the full trail is recorded. They do not need re-doing.

| # | Issue | Source | Fix location |
|---|---|---|---|
| F1 | `TargetHttpsProxy` created without SSL cert → GCP 400 | LIVE | `packages/core/src/deploy/providers/gcp/handlers/load-balancer.ts:72-94` |
| F2 | Card translator hardcoded `protocol: 'HTTPS'` even without cert | LIVE | `packages/core/src/deploy/card-translator.ts:327-341` |
| F3 | Resource → node matching used fuzzy string contains, logged "matched node: NONE" | LIVE | `services/deploy/src/services/deploy.service.ts` (exact lookup via `translation.deployables`) |
| F4 | Plan response returned numbers for `creates`/`updates`/`deletes`, UI crashed on `.length` | LIVE | `services/deploy/src/services/deploy.service.ts`, `packages/ui/src/store/slices/deploy-slice.ts`, `packages/ui/src/features/deploy/components/deploy-panel.tsx` |
| F5 | Deploy panel stuck at 0% due to stale-closure guard | LIVE | `packages/ui/src/features/deploy/components/deploy-panel.tsx:319-344` |
| F6 | `card-translator.ts` now emits `deployables: DeployableNodeInfo[]` | LIVE | `packages/core/src/deploy/card-translator.ts:48-68` |
| F7 | E2E dashboard log box had no colors | USER | `e2e/dashboard/index.html` |
| F8 | E2E dashboard showed "4 existed" when all 4 failed to create | USER | `e2e/repos/index.ts` (tri-state status), `e2e/dashboard/server.ts`, `e2e/dashboard/index.html` |
| F9 | `pushFiles` 404 race against fresh `auto_init` repos | USER | `e2e/repos/github-repo-client.ts:83-140` (retry + default-branch resolution) |
| F10 | `ensureTestRepos` wouldn't retry push on existing-but-empty repos | USER | `e2e/repos/index.ts` (`repoIsEmpty` check) |
| F11 | `cleanupTestRepos` relied on eventually-consistent topic search | USER | `e2e/repos/github-repo-client.ts` (name-prefix scan) |
| F12 | Delete endpoint returned "Failed: Unexpected end of JSON input" on empty body | USER | `e2e/dashboard/server.ts` (defensive JSON parse) |

---

## Phase 0 — Critical Safety & Concurrency

| ID | Issue | Severity | Source | File:Line |
|---|---|---|---|---|
| P0-1 | Temp SA key files written with 0o666 — world-readable | Critical | BACKEND | `services/deploy/src/services/deploy.service.ts:235` |
| P0-2 | `process.env.GOOGLE_APPLICATION_CREDENTIALS` overwritten between concurrent deploys | Critical | BACKEND | `services/deploy/src/services/deploy.service.ts:237` |
| P0-3 | No per-card deploy lock — clicking Deploy twice spawns parallel deploys | Critical | BACKEND | `services/deploy/src/routes/canvas-deploy.ts:29-40` |
| P0-4 | `destroyDeployment` iterates in create order, violating dependency ordering | Critical | BACKEND | `services/deploy/src/services/deploy.service.ts:638` |
| P0-5 | Temp SA key files not cleaned up on SIGTERM/SIGKILL/crash | Critical | BACKEND | `services/deploy/src/services/deploy.service.ts:522-528` |
| P0-6 | `CanvasDeployment` rows stuck in `'deploying'` with no watchdog | Critical | DATA | `services/deploy/src/services/cron.service.ts:58` |
| P0-7 | Kahn's topological sort silently drops cyclic nodes with no error | High | BACKEND | `packages/core/src/deploy/deploy-engine.ts:231-290` |
| P0-8 | Handler operation timeouts inconsistent across resource types | High | BACKEND | `packages/core/src/deploy/providers/gcp/handlers/*.ts` |
| P0-9 | SA key string retained in local variables after use — minor memory hygiene | Low | BACKEND | `services/deploy/src/services/deploy.service.ts:240-256` |

---

## Phase 1 — Stable Resource Identity

| ID | Issue | Severity | Source | File:Line |
|---|---|---|---|---|
| P1-1 | Resource names include user-facing `label`, so renaming a block creates new resource | High | USER | `packages/core/src/deploy/card-translator.ts:523` |
| P1-2 | Resource names use `node.id.slice(-6)` — collision-prone and opaque | Medium | USER | `packages/core/src/deploy/card-translator.ts:523` |
| P1-3 | Partial-success deploys stored as `status: 'failed'`, poisoning update baseline | Critical | USER | `services/deploy/src/services/deploy.service.ts:432` |
| P1-4 | `currentGraph` reconstruction only reads `status: 'success'` rows | Critical | USER | `services/deploy/src/services/deploy.service.ts:279-302` |
| P1-5 | No standard labels applied to GCP resources (no `ice-card-id`, `ice-environment`) | High | BACKEND | All `packages/core/src/deploy/providers/gcp/handlers/*.ts` |
| P1-6 | No mapping table to survive label changes or node ID regeneration | High | USER | (new file needed) |

---

## Phase 2 — Progress Visibility & Block Feedback

| ID | Issue | Severity | Source | File:Line |
|---|---|---|---|---|
| P2-1 | Progress bar jumps 0 → 100 with no intermediate events | High | USER | `services/deploy/src/services/deploy.service.ts:332-343` |
| P2-2 | Canvas block doesn't render `deploy_status` | High | USER | `packages/ui/src/features/canvas/` (block renderer) |
| P2-3 | Canvas block doesn't render `provider_id`, URL, or primary outputs | High | USER | `packages/ui/src/features/canvas/` (block renderer) |
| P2-4 | No click-through to GCP console for deployed resources | Medium | USER | (new helper needed) |
| P2-5 | Multi-step resources (load balancer has 4 sub-ops) report no intermediate status | High | BACKEND | `packages/core/src/deploy/providers/gcp/handlers/load-balancer.ts:48-107` |
| P2-6 | Projects panel doesn't show which projects are deploying | High | USER | `packages/ui/src/features/projects/` |
| P2-7 | No background notification when long deploy completes | Medium | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx` |
| P2-8 | Output display limited — no DB connection strings, no load balancer IPs, no domains | Medium | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx:1176-1220` |
| P2-9 | `setDeployProgress` payload shape too narrow to carry sub-step info | Medium | USER | `packages/ui/src/store/slices/deploy-slice.ts:216-220` |

---

## Phase 3 — Plan Quality & Preflight

| ID | Issue | Severity | Source | File:Line |
|---|---|---|---|---|
| P3-1 | Plan preview shows action type and name, no property-level diffs | High | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx:847` |
| P3-2 | Plan and apply are not bound — user could review one plan and apply a different one | High | DATA | `services/deploy/src/services/deploy.service.ts` |
| P3-3 | No preflight checks beyond "is provider connected" | High | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx:276-315` |
| P3-4 | Billing account not verified — failures surface deep in deploy | High | BACKEND/LIVE | `services/deploy/src/services/deploy.service.ts:1041-1166` |
| P3-5 | SA role coverage (serviceUsageAdmin, compute.admin, etc.) not verified | High | UX | (new preflight checks needed) |
| P3-6 | Bucket name collision not checked (bucket names are globally unique) | Medium | UX | (new preflight check needed) |
| P3-7 | Region-resource compatibility not checked | Medium | UX | (new preflight check needed) |
| P3-8 | No retry on transient GCP errors (5xx, 429, DEADLINE_EXCEEDED) | High | BACKEND | `packages/core/src/deploy/providers/gcp/gcp-deployer.ts:212-237` |
| P3-9 | GCP error codes shown raw to user with no remediation text | High | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx:1052-1120` |
| P3-10 | Per-resource error messages truncated to 500px, not copyable | Medium | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx:1211` |
| P3-11 | 10-minute HTTP timeout shorter than longest GCP operations (SQL, GKE) | High | BACKEND | `services/deploy/src/routes/canvas-deploy.ts:31-32` |
| P3-12 | Empty SA keys not validated before being written to disk | Low | BACKEND | `services/deploy/src/services/deploy.service.ts:240-267` |
| P3-13 | Plan/results JSON shapes diverge between code paths, no version field | Medium | DATA | `packages/db/prisma/schema.prisma:236-237` |

---

## Phase 4 — Block Requirements Framework

| ID | Issue | Severity | Source | File:Line |
|---|---|---|---|---|
| P4-1 | No feedback when a compute block has no GitHub repo attached | High | USER | (new framework) |
| P4-2 | No feedback when an attached repo is inaccessible (GitHub App not installed) | High | USER | (new framework) |
| P4-3 | No DNS record instructions after deploying a custom domain | High | USER | (new framework) |
| P4-4 | No domain verification check for Cloud Run domain mapping | High | USER | (new framework) |
| P4-5 | No managed SSL certificate issuance status surfaced | Medium | USER | (new framework) |
| P4-6 | No block-to-block secret/URL contract (edges are visual only) | Medium | USER | (new framework) |
| P4-7 | No post-deploy verification mechanics (DNS propagation, health check) | Medium | USER | (new framework) |
| P4-8 | OAuth redirect URI registration gap for blocks using Google Sign-In | Low | USER | (new framework) |

---

## Phase 5 — Deploy UX & Multi-tenancy

| ID | Issue | Severity | Source | File:Line |
|---|---|---|---|---|
| P5-1 | Deploy state is single-panel (`deploySlice`), not per-card | High | USER | `packages/ui/src/store/slices/deploy-slice.ts` |
| P5-2 | No cancellation — user must wait out wrong deploys | High | BACKEND | `services/deploy/src/services/deploy.service.ts:117-499` |
| P5-3 | Destroy uses browser `confirm()` modal | Medium | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx:624` |
| P5-4 | No disabled-state tooltip on Deploy button | Medium | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx:596-602` |
| P5-5 | "Reset" button label is misleading | Low | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx:565` |
| P5-6 | Deploy history is Redux-only, not persisted per-session | High | UX | `packages/ui/src/store/slices/deploy-slice.ts:243-256` |
| P5-7 | History view doesn't distinguish create/update/destroy/rollback | Medium | UX | `packages/ui/src/features/deploy/components/properties-panel.tsx:2204-2262` |
| P5-8 | History has no detail view — can't click to see what was deployed | Medium | UX | same as P5-7 |
| P5-9 | No "retry failed resources only" action | High | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx:511` |
| P5-10 | No per-card environment memory — settings reset on card switch | Medium | UX | `packages/ui/src/store/slices/deploy-slice.ts` |
| P5-11 | No "save without deploy" option | Medium | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx` |
| P5-12 | Projects dropdown doesn't cache per-provider results | Low | UX | `packages/ui/src/features/deploy/components/deploy-panel.tsx:751-771` |
| P5-13 | Destroy partial failures are confusing ("success: false" but most deleted) | Medium | BACKEND/UX | `services/deploy/src/services/deploy.service.ts:641-665` |

---

## Phase 6 — Data Model Hardening

| ID | Issue | Severity | Source | File:Line |
|---|---|---|---|---|
| P6-1 | `CanvasDeployment.card_id` is bare string — no FK, no cascade | Critical | DATA | `packages/db/prisma/schema.prisma:228-249` |
| P6-2 | `CanvasDeployment` has no FK to `ProviderCredential` — credential audit gap | Medium | DATA | `packages/db/prisma/schema.prisma` |
| P6-3 | `plan` and `results` are unversioned `Json?` — breaking changes corrupt old records silently | Medium | DATA | `packages/db/prisma/schema.prisma:236-237` |
| P6-4 | Retention pruning deletes rollback targets after 50 deploys | Medium | BACKEND | `services/deploy/src/services/cron.service.ts:27-56` |
| P6-5 | No `@@unique([card_id, environment])` — allows duplicate active deploys | Medium | DATA | `packages/db/prisma/schema.prisma` |
| P6-6 | Status state machine documented in comment but not enforced | Low | DATA | `packages/db/prisma/schema.prisma:232` |
| P6-7 | `'planning'` documented but code uses `'planned'` — drift | Low | DATA | `services/deploy/src/services/deploy.service.ts:80` |
| P6-8 | No transactions around multi-step deploy lifecycle writes | High | DATA | `services/deploy/src/services/deploy.service.ts` |
| P6-9 | Deploy indexes missing for common dashboard queries | Low | DATA | `packages/db/prisma/schema.prisma:248` |

---

## Phase 7 — Real Drift Detection

| ID | Issue | Severity | Source | File:Line |
|---|---|---|---|---|
| P7-1 | `checkDrift` compares canvas against stored `results`, never queries GCP | Critical | DATA | `services/deploy/src/services/deploy.service.ts:908-1002` |
| P7-2 | Drift can't detect manual changes or deletions in the GCP console | Critical | DATA | same |
| P7-3 | Drift is manual-trigger only, no background polling or panel-open refresh | Medium | UX | `packages/ui/src/features/deploy/components/properties-panel.tsx:245-287` |
| P7-4 | Drift not visualized on canvas blocks, only in properties panel | Medium | UX | `packages/ui/src/features/canvas/` |
| P7-5 | No "accept drift" (update canvas) or "reset drift" (re-push canvas) actions | Medium | UX | (new actions needed) |
| P7-6 | Drift detection doesn't scale to multi-resource property comparison | Medium | BACKEND | `services/deploy/src/services/deploy.service.ts:973-984` |

---

## Phase 8 — Custom Domains, DNS Feedback & Managed HTTPS

| ID | Issue | Severity | Source | File:Line |
|---|---|---|---|---|
| P8-1 | No UI surfaces the Phase 4 requirements framework in the deploy panel or block properties panel | High | Phase 4 post-mortem | `packages/ui/src/features/deploy/components/deploy-panel.tsx`, `packages/ui/src/features/properties/components/properties-panel.tsx` |
| P8-2 | No Google-managed SSL certificate resource handler | High | investigation | (new handler needed) |
| P8-3 | `Security.Certificate` block is a placeholder with no deployer | Medium | investigation | `packages/blocks/src/gcp/security/ssl-certificate.ts:4-12` |
| P8-4 | No domain verification requirement (TXT record for Search Console) | High | Phase 4 deferred | (new requirement needed) |
| P8-5 | `enableHttps` / cert selection not exposed in block properties | Medium | investigation | `packages/core/src/resources/high-level-resources.ts` |
| P8-6 | Load balancer URL map points at an empty backend service — no `backendBucket` wiring | Critical | investigation | `packages/core/src/deploy/providers/gcp/handlers/load-balancer.ts:49-145` |
| P8-7 | `Network.Domain` block maps only to `gcp.run.domainMapping`; no support for load-balancer-fronted domains | Medium | investigation | `packages/core/src/deploy/card-translator.ts:130` |
| P8-8 | Static site template has `domain` as a property on the site block, not a first-class node with requirements | Medium | investigation | `packages/templates/src/quick-starts.ts:184-210` |
| P8-9 | No long-running cert issuance polling (15–60 min typical) | High | investigation | (new poller + requirement needed) |
| P8-10 | No "visit my site" URL actually works post-deploy because of P8-6 | Critical | derived | (wiring gap) |
| P8-11 | `sslMode: 'auto'` on the existing Domain block has no implementation | Medium | investigation | `packages/blocks/src/common/networking/domain.ts:11-19` |

---

## Phase 9 — Resilience, Cleanup & Provider-Agnostic Prep

| ID | Issue | Severity | Source | Status | File |
|---|---|---|---|---|---|
| P9-1 | Backend bucket quota (default 3) returns raw GCP JSON dump | High | LIVE | ✓ Shipped | `handlers/backend-bucket.ts` |
| P9-2 | Load balancer creates URL map pointing at non-existent backend bucket on upstream failure | High | LIVE | ✓ Shipped | `handlers/load-balancer.ts` |
| P9-3 | No way to clean up orphaned ICE-managed GCP resources from failed deploys | Critical | LIVE | ✓ Shipped | `services/orphan-cleanup.service.ts` (new) |
| P9-4 | Quota error banner only detects backend bucket pattern, misses IN_USE_ADDRESSES etc | Medium | LIVE | ✓ Shipped | `deploy-panel.tsx` QUOTA_PATTERN |
| P9-5 | `destroyDeployment` only walks latest success row, misses leftover resources from failed deploys | High | LIVE | ✓ Shipped | `destroyAllForCard` in `deploy.service.ts` |
| P9-6 | `destroyAllForCard` passes `credentials.project_id \|\| authClient.project_id` which is null for some creds | Critical | LIVE | ✓ Shipped | `destroyAllForCard` project resolution |
| P9-7 | Destroy button hidden when no deployed resources, preventing cleanup after failed deploys | Medium | LIVE | ✓ Shipped | `deploy-panel.tsx` button visibility |
| P9-8 | Deploy progress not visible in second browser tab (subscription scoped to deploy panel open) | High | USER | ✓ Shipped | `hooks/use-deploy-subscription.ts` (new) |
| P9-9 | Canvas shows no deploy state after reload — outputs live in Redux only, never hydrated from DB | High | USER | ✓ Shipped | `getNodeDeploymentOverlay` + `/node-outputs` route |
| P9-10 | Custom domain URL never propagates to Static Site block — only lives on forwarding rule outputs | High | USER | ✓ Shipped | Domain propagation in `getNodeDeploymentOverlay` |
| P9-11 | `autoEnableGCPApis` uses fragile string matching, misses Phase 8 iceTypes and Site Verification | High | LIVE | ✓ Shipped | `ICE_TYPE_API_MAP` in `deploy.service.ts` |
| P9-12 | Site Verification API 403 during Plan because it's called before `autoEnableGCPApis` runs | High | LIVE | ✓ Shipped | `ensureSiteVerificationApiEnabled` in `google-verification.service.ts` |
| P9-13 | Static site bucket not publicly readable, website hosting not configured, LB returns 403 | Critical | LIVE | ✓ Shipped | `handlers/cloud-storage.ts` website + IAM |
| P9-14 | Cloud Run destroy leaves Artifact Registry images accumulating indefinitely | Medium | USER | ✓ Shipped | `deleteArtifactRegistryImagesForService` in `handlers/cloud-run.ts` |
| P9-15 | Cloud Functions destroy leaves source archives + container images | Medium | USER | ✓ Shipped | `deleteFunctionsSourceArchives` + `deleteFunctionsArtifactRegistryImages` |
| P9-16 | Cloud SQL backups persist silently after instance delete — user has no notice | Low | USER | ✓ Shipped | `handlers/cloud-sql.ts` logged notice |
| P9-17 | GitHub PAT field is password-masked, users can't see paste errors | Medium | USER | ✓ Shipped | `github-connect-modal.tsx`, `e2e/dashboard/index.html` |
| P9-18 | Repo list capped at 30, errors swallowed silently, no retry UI | High | USER | ✓ Shipped | `github.service.ts` pagination + error surface |
| P9-19 | Webhook 403 throws a stack trace even though error is swallowed, misleading to user | Medium | USER | ✓ Shipped | `registerGitHubWebhook` structured result |
| P9-20 | Axios errors show generic "Request failed with status code N", swallow server response body | High | USER | ✓ Shipped | `axios-instance.ts` response interceptor |
| P9-21 | Static site template had `domain: 'mysite.com'` baked into StaticSite block, no CustomDomain + repo blocks | Medium | USER | ✓ Shipped | `quick-starts.ts` template update |
| P9-22 | `Source.Repository` emits "No gcp mapping" warning because translator doesn't treat it as UI-only | Low | LIVE | ✓ Shipped | `UI_ONLY_TYPES` in `card-translator.ts` |
| P9-23 | No explicit backend-bucket → forwarding-rule edge in translator; parallel deploy lets dependent succeed despite failed prereq | Medium | derived | ✗ Deferred | — |
| P9-24 | No "skip dependents of failed resource" option in deploy engine | Medium | derived | ✗ Deferred | `deploy-engine.ts` |
| P9-25 | `ALREADY_EXISTS` on backend service during retry not treated as success+import | Medium | LIVE | ✗ Deferred | `handlers/load-balancer.ts` |
| P9-26 | Phase 4 requirements UI not wired into block properties panel yet | Medium | Phase 4 | ✗ Deferred | `properties-panel.tsx` |
| P9-27 | No first-class tracking of compute static IP reservations — `IN_USE_ADDRESSES` quota leak | Medium | LIVE | ✗ Deferred | — |
| P9-28 | No tombstone/snapshot before destroy-all | Low | derived | ✗ Deferred | — |
| P9-29 | No preflight quota headroom check | Medium | derived | ✗ Deferred | `preflight.service.ts` |
| P9-30 | `generate_stable_name` hashes node UUID only, so recreating the same template gets new names | High | LIVE | ✗ Deferred | `card-translator.ts` — needs `(cardId, semanticRole)` hash |
| P9-31 | `destroyAllForCard` nukes every environment — no env selector in modal | Medium | derived | ✗ Deferred | `DestroyConfirmModal` |
| P9-32 | No background orphan sweeper (runs on user click only) | Low | derived | ✗ Deferred | — |
| P9-33 | Phase 8 managed-cert + backend-bucket describe() not wired into drift UI | Low | derived | ✗ Deferred | — |
| P9-34 | Site Verification API has no transient-retry wrapper for 5xx | Low | derived | ✗ Deferred | `google-verification.service.ts` |
| P9-35 | PAT field is plain text with no reveal/hide toggle or auto-clear after connect | Low | derived | ✗ Deferred | `github-connect-modal.tsx` |

### Provider-agnostic refactor targets (catalogued for future work)

| ID | What's GCP-specific | File(s) | Refactor target |
|---|---|---|---|
| T-1 | GCP handler registry — each handler hits GCP REST APIs directly | `packages/core/src/deploy/providers/gcp/handlers/*.ts`, `gcp-deployer.ts` | Type-parameterized `ResourceHandler<TContext>`; per-provider handler dirs and registries |
| T-2 | Card translator property extractors return GCP-shaped properties | `packages/core/src/deploy/card-translator.ts` | Move semantic-wiring pass into per-provider `wire_semantic_resources(graph, nodes, edges)` |
| T-3 | API auto-enable hits `serviceusage.googleapis.com` | `services/deploy/src/services/deploy.service.ts` — `ICE_TYPE_API_MAP`, `autoEnableGCPApis`, `enableGcpApi` | `ProviderDeployer.ensureApis(features[])`; AWS no-ops, Azure registers resource providers |
| T-4 | Orphan cleanup walks GCP-specific endpoints | `services/deploy/src/services/orphan-cleanup.service.ts` | Per-provider `listIceManagedResources` + `deleteResource` methods |
| T-5 | Domain verification uses Google Site Verification API (TXT record) | `services/deploy/src/services/google-verification.service.ts` | `DomainVerificationProvider` interface; AWS uses ACM CNAME, Azure uses Front Door |
| T-6 | Credential resolution is GCP-specific (`GoogleAuth`, service account JSON, `_auth_type === 'oauth'`) | `services/deploy/src/services/deploy.service.ts` — applyDeployment, destroyDeployment, destroyAllForCard, rollbackDeployment, checkDrift | `CredentialResolver` service returning `ScopedDeployAuth` |
| T-7 | Load balancer chain (backend service → URL map → target HTTPS proxy → forwarding rule + HTTP redirect rule) | `handlers/load-balancer.ts` | Per-provider LB handler; AWS uses ALB + target group + listener; Azure uses Front Door |
| T-8 | Standard labels applied as GCP labels | `card-translator.ts` — `generate_stable_name`, `sanitize_label_value` | Per-provider `applyStandardMetadata(resource, ctx)` — GCP labels, AWS tags, Azure tags, Kubernetes labels+annotations |
| T-9 | Bucket public access uses `iamConfiguration.publicAccessPrevention` + `allUsers:roles/storage.objectViewer` | `handlers/cloud-storage.ts` | Store `public_access: boolean` on node data; each provider translates. AWS uses `BucketPolicy` + `PublicAccessBlock`; Azure uses `anonymousAccess` on container |
| T-10 | Artifact Registry cleanup hits GCP AR endpoints, GCF source archives live in `gcf-v2-uploads-*` bucket | `handlers/cloud-run.ts`, `handlers/cloud-functions.ts` | `ProviderDeployer.cleanupArtifactsForResource(type, name)` — AWS ECR flow, Azure ACR flow |
| T-11 | `Network.CustomDomain` hardcoded to `gcp.compute.managedSslCertificate`, extractor returns GCP shapes | `card-translator.ts` GCP_TYPE_MAP, `extract_custom_domain_properties` | Each provider's type map declares its own mapping. The CustomDomain blueprint already supports `providers: ['gcp']` — extend to `['gcp', 'aws', 'azure']` as handlers land |
| T-12 | Phase 4 requirements inject `googleVerifier` and `certStatusChecker` capabilities | `requirements.service.ts` | Per-provider capability implementations — `awsCertificateManagerChecker`, `azureFrontDoorCertChecker`, etc. The requirement definitions themselves are provider-agnostic |
| T-13 | Deploy progress snapshot schema is generic | `deploy-locks.ts` | Already provider-agnostic — no refactor needed |
| T-14 | Route handlers accept `gcpProject` as a field name | `routes/canvas-deploy.ts` — `/cleanup-orphans`, `/destroy-all` | Rename to `providerProject` or use a `providerContext` object covering project / accountId / subscriptionId |
| T-15 | Error detection patterns match GCP-specific error strings (`"has not been used in project"`, `"PERMISSION_DENIED"`+`"googleapis.com"`, `"invalid_grant"`) | `packages/core/src/deploy/messages.ts` — `API_NOT_ENABLED_PATTERNS`, `AUTH_MISSING_PATTERNS`, `AUTH_EXPIRED_PATTERNS`, `isApiNotEnabledError` | Per-provider `ErrorClassifier` interface returning a categorical classification; each provider ships its own pattern set |
| T-16 | Environment sizing presets keyed by GCP resource types and shapes (`gcp.sql.databaseInstance: { tier: 'db-f1-micro' }`, `gcp.run.service: { min_instances, cpu, memory }`) | `packages/core/src/deploy/environment-config.ts` — `ENVIRONMENT_PRESETS` | Per-provider preset maps with provider-native keys; dev/staging/prod semantics stay universal |
| T-17 | GCP service-name catalogue and SDK message helpers (`Cloud Run`, `Cloud SQL`, `Pub/Sub`, `Vertex AI`, etc.) | `packages/core/src/deploy/providers/gcp/messages.ts` — `SERVICE_NAMES` | Each provider owns its own `messages.ts`; handlers import from local provider module only |
| T-18 | GCP SDK loader hardcodes `@google-cloud/*` package names and the `{ keyFilename, credentials, authClient }` credential shape | `packages/core/src/deploy/providers/gcp/sdk-loader.ts` — `initialize_gcp_clients`, `GcpClientAuthOptions` | Promote to `ProviderSdkLoader.loadClients(auth)`; each provider ships its own loader and client registry |
| T-19 | Hardcoded region lists, provider labels, and project field labels on the client | `packages/ui/src/features/deploy/components/deploy-panel.tsx` — `PROVIDER_REGIONS`, `PROVIDER_LABELS`, `PROVIDER_PROJECT_LABELS` (lines 62–117) | Fetch from `/providers/:id/metadata` or publish a shared provider-descriptor package consumed by both UI and backend |
| T-20 | `gcpProject` naming leaks into Redux slice, API adapter, HTTP adapter, deploy panel, and route bodies | `packages/ui/src/store/slices/deploy-slice.ts`, `packages/ui/src/shared/api/api-adapter.ts`, `packages/ui/src/shared/api/http-api-adapter.ts`, `packages/ui/src/features/deploy/components/deploy-panel.tsx`, `services/deploy/src/routes/canvas-deploy.ts` | Rename to `providerScope: { type, project?, accountId?, subscriptionId?, resourceGroup? }` across the stack |
| T-21 | `detectDominantProvider` silently defaults to `'gcp'` when no resource nodes carry a provider field | `packages/ui/src/features/deploy/components/deploy-panel.tsx` — `detectDominantProvider` (lines 120–129) | Fall back to user profile default or force explicit selection before Plan; never silently pick |

---

## Not in any phase (see deferred.md)

| Issue | Source | Reason |
|---|---|---|
| No cost estimation delta in deploy flow | UX | Feature, not a fix — defer until core is stable |
| No AI chat integration with deploy errors | UX | Feature — defer |
| No multi-environment parallel deploys | UX | Scope creep — current model is one env at a time |
| No automatic DNS provisioning via Cloudflare/Route53 | Brainstorm | Requires separate provider integrations |
| No rollback UI surface (backend exists) | UX | Feature — low demand so far |
| No keyboard shortcuts for deploy panel | UX | Polish — defer |
| No webhook CI integration for GitHub repos | Brainstorm | Feature — belongs to a GitHub integration phase |
| No environment comparison UI (dev vs. prod diff) | UX | Feature — belongs to a future environments phase |
| Memory scrubbing of SA key strings | BACKEND | Theoretical — negligible blast radius vs. other fixes |
| Tenant isolation at data layer beyond route middleware | DATA | Defensible as-is; route middleware is load-bearing already |

---

## How to read this inventory

- **IDs are stable.** `P1-3` always means "partial-success stored as failed." If you address it in code, update the inventory entry with the PR link and a `✓` prefix. Don't renumber.
- **Phase files reference these IDs.** Each step in a phase file cites the IDs it closes, so you can audit coverage.
- **Adding a new issue:** append to the appropriate phase section with the next free ID. If it doesn't fit a phase, add it to "Not in any phase" and decide whether it deserves a new phase later.

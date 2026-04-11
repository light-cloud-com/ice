# Phase 9 — Deploy Resilience, Orphan Cleanup, and Provider-Agnostic Refactor

**Status:** Partially shipped (resilience + cleanup). Provider-agnostic refactor documented as TODO.
**Effort shipped so far:** ~1 engineer-day
**Dependencies:** Phases 0–8 already in place
**Covers:** Everything that was built on top of Phase 8 after the first round of real-world deploys hit quota limits, partial-failure recovery gaps, credential-scoping issues, and user-visibility problems. Also serves as the seed document for the provider-agnostic refactor now that GCP-specific behavior is spread across many files.

## What shipped today

### A. Deploy resilience against quota / partial failures

**A.1 — Quota-aware error messages** (`packages/core/src/deploy/providers/gcp/handlers/backend-bucket.ts`). The backend bucket handler now detects `QUOTA_EXCEEDED` and `Quota 'BACKEND_BUCKETS'` in the error body and returns a clean, actionable message instead of the raw GCP JSON dump. Tells the user to destroy old deployments, clean up orphans, or request a quota increase with a direct console link.

**A.2 — Fail-fast load balancer** (`packages/core/src/deploy/providers/gcp/handlers/load-balancer.ts`). Before creating a URL map that references a backend bucket, the handler now does a `GET /backendBuckets/<name>` verification. Previously GCP accepted dangling URL-map references at creation time and only returned 404s when real traffic arrived — so "deploy succeeded" could be a lie. Now the forwarding rule fails immediately with a message explaining that the upstream backend bucket failed (most commonly due to `QUOTA_EXCEEDED`).

**A.3 — Orphan cleanup service** (`services/deploy/src/services/orphan-cleanup.service.ts` — new). Scans the GCP project for resources labeled `ice-managed=true` and cross-references each against the `DeployedResourceMapping` table. Anything not actively referenced is deleted. Covers backend buckets, SSL certificates, URL maps, target HTTPS/HTTP proxies, backend services, and global forwarding rules. Exposed via `POST /api/canvas/deploy/cleanup-orphans` with optional `dry_run` flag.

**A.4 — `QuotaErrorBanner` UI** (`packages/ui/src/features/deploy/components/deploy-panel.tsx`). Replaces the generic error banner when a quota failure is detected. Offers a one-click "Clean up orphaned ICE resources" button that calls the new endpoint, shows a live list of what was deleted, and offers a retry after cleanup. Also links to the GCP quota console for the affected quota. The regex that triggers the banner now matches the full family of GCP quota types — `BACKEND_BUCKETS`, `IN_USE_ADDRESSES`, `FORWARDING_RULES`, `URL_MAPS`, `TARGET_HTTPS_PROXIES`, `BACKEND_SERVICES`, `SSL_CERTIFICATES` — so it catches cascading quota exhaustion, not just backend buckets.

**A.5 — Destroy-all for historical leftovers** (`services/deploy/src/services/deploy.service.ts` — `destroyAllForCard`). The existing `destroyDeployment` only finds resources from the latest success/partial row. A failed deploy that leaked resources wasn't recoverable through normal destroy. The new function walks `DeployedResourceMapping` for the card across every environment AND every historical `canvasDeployment.results.resources` row (including failed ones), deduplicates by `(type, name)`, sorts in dependency-safe order (forwarding rule → target proxy → URL map → backend bucket → backend service → storage bucket → SSL cert), and deletes each. Cleans up mapping table rows as it goes. Exposed at `POST /canvas/deploy/destroy-all`.

**A.5.1 — GCP project resolution for destroy-all**. The first cut hit `"GCP project is required (--project <id>)"` because the deployer initialize was reading `credentials.project_id || authClient.project_id` which is null for some credential shapes. Fixed to accept `gcpProject` in the request body (frontend forwards `deploy.gcpProject` from Redux), fall back to `credentials.project_id`, and as a last resort extract the project from any historical resource's `provider_id` (e.g., `projects/lc-ice/global/sslCertificates/...`). Only throws `"Cannot resolve GCP project id for destroy-all"` if all three sources fail.

**A.6 — "Destroy everything for this project" UI toggle** (`packages/ui/src/features/deploy/components/deploy-panel.tsx` → `DestroyConfirmModal`). The destroy confirmation modal gained a checkbox: "Destroy everything for this project". When enabled, the modal explains that ICE will walk every historical deployment (success, partial, failed) and the mapping table, calls `destroyAll` instead of `destroy`, and shows a warning about the dependency-ordered cleanup. Also auto-enables when the card has no currently-tracked deployed resources, so users who have failed deploys and nothing to "normal destroy" get the right default.

**A.6.1 — Destroy button visibility**. Previously the red destroy button was gated on `deployedResources.length > 0 && status !== 'deploying'`. Changed to just `status !== 'deploying'` so users can clean up after a failed deploy even when the UI has no tracked resources.

### B. User visibility into cross-tab and post-deploy state

**B.1 — In-memory deploy snapshot** (`services/deploy/src/services/deploy-locks.ts`). Keyed by `cardId`. The deploy service writes overall progress, current resource, current sub-step, and per-node status on every socket event. New tabs opening the project can fetch the current state without waiting for the next live event. Snapshot lingers 60 seconds after completion so late-joining clients see the terminal state, then drops itself.

**B.2 — `/current/:cardId` endpoint** (`services/deploy/src/routes/canvas-deploy.ts`). Returns the in-memory snapshot; falls back to the latest `deploying`/`planned` row from the database if the snapshot was lost (e.g., gateway restart).

**B.3 — `/node-outputs/:cardId` endpoint** with domain propagation. Reads the latest success/partial deployment's `results.resources`, projects outputs onto each `source_node_id`, and — critically — propagates the custom domain URL from the forwarding rule (Network.Internet block) to every Compute block connected to it via canvas edges. Also mirrors the deployed domain onto the CustomDomain block itself. This is what finally makes the Static Site block show `https://mysite.com` instead of the raw bucket URL.

**B.4 — `useDeploySubscription` hook** (`packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts` — new). Runs at the app level in `DynamicContent` for the entire lifetime of the active card view, not just when the deploy panel is open. Three effects: fetch node outputs on card mount to hydrate the canvas, pull the current snapshot to hydrate Redux for in-flight deploys, subscribe to the socket room and install the global progress listener. Moved the old deploy-panel-scoped subscription here verbatim so a closed panel / second tab never drops progress events.

**B.5 — Canvas block shows the domain URL**. `compact-lod3.tsx`'s `primaryOutputText` prioritizes `deploy_outputs.domain` as `https://<domain>` before any other output. Users clicking Static Site now see the custom domain they own, not the internal bucket path.

### C. Plan-time Google API auto-enablement

**C.1 — iceType → API map** (`services/deploy/src/services/deploy.service.ts`). The old `RESOURCE_API_MAP` used fragile string matching on resource type name fragments, which was both over-eager (false positives from partial matches) and incomplete (missed every Phase 8 type). Replaced with `ICE_TYPE_API_MAP`, an explicit dict keyed by exact iceType. Every block has an entry. Notable additions: `Network.CustomDomain` → `['compute.googleapis.com', 'siteverification.googleapis.com']`, `Compute.StaticSite` → `['storage.googleapis.com', 'compute.googleapis.com']` (previously missed `compute`).

**C.2 — `enableGcpApi` helper exported**. Thin idempotent wrapper around `POST /v1/projects/{project}/services/{api}:enable`. Used by `google-verification.service.ts` for lazy enablement.

**C.3 — Site Verification API auto-enable on first 403** (`services/deploy/src/services/google-verification.service.ts`). The Site Verification API is called during the requirements resolver (Plan step), which runs BEFORE `autoEnableGCPApis` would have fixed it. Fixed both halves: the deploy-time auto-enable now includes site verification for CustomDomain blocks, AND the verification service detects `SERVICE_DISABLED` / `has not been used in project` in 403 responses, calls `enableGcpApi`, waits 5 seconds for propagation, and retries. Guarded by a per-(orgId, project) Set to avoid retry loops when the user lacks `serviceusage.services.enable` permission. OAuth scope now includes `cloud-platform` so the same token can hit both APIs.

### D. Bucket public access for static site hosting

**D.1 — Translator sets bucket visibility flags** (`packages/core/src/deploy/card-translator.ts` → `extract_storage_bucket_properties`). When the bucket's iceType is `Compute.StaticSite`, injects `public_access: true`, `website_hosting: true`, `index_page: 'index.html'`, `not_found_page: '404.html'`. Plain `Storage.Bucket` blocks keep the old private-by-default behavior.

**D.2 — Storage handler makes bucket public + website-hosted** (`packages/core/src/deploy/providers/gcp/handlers/cloud-storage.ts`). The create method now sets `website: { mainPageSuffix, notFoundPage }` at bucket creation time and configures `iamConfiguration: { publicAccessPrevention: 'inherited', uniformBucketLevelAccess: { enabled: true } }` to opt out of org-level `enforced` defaults. Then grants `allUsers: roles/storage.objectViewer` via `bucket.iam.setPolicy`. If the IAM grant fails (org policy enforces public-access-prevention), catches the error and adds a `warnings[]` entry in the outputs so the deploy still succeeds with a clear explanation of why the bucket is private.

### E. Destroy also cleans up Artifact Registry, Cloud Functions sources, and Cloud SQL backup notice

**E.1 — Cloud Run Artifact Registry cleanup** (`packages/core/src/deploy/providers/gcp/handlers/cloud-run.ts`). After deleting a Cloud Run service, the handler now calls `deleteArtifactRegistryImagesForService` which deletes the `ice-images` repo package matching the service name (cascades to all tags + manifests). Best-effort with 404 tolerance. Logs a manual console URL if cleanup fails.

**E.2 — Cloud Functions source + container cleanup** (`packages/core/src/deploy/providers/gcp/handlers/cloud-functions.ts`). After deleting a function, the handler now calls `deleteFunctionsSourceArchives` (lists `gcf-v2-uploads-<project>-<region>` with the function name prefix and deletes every source zip) and `deleteFunctionsArtifactRegistryImages` (removes the matching package from the `gcf-artifacts` repo).

**E.3 — Cloud SQL backup note** (`packages/core/src/deploy/providers/gcp/handlers/cloud-sql.ts`). Deliberately does NOT auto-delete backups (they're the last line of defense against accidental instance deletion). Logs a clear message on destroy telling users that backups persist for the retention window and where to find them in the GCP console.

### F. GitHub credential and pipeline improvements

**F.1 — PAT field is plain text** (`packages/ui/src/features/integrations/components/github-connect-modal.tsx` and `e2e/dashboard/index.html`). Both PAT input fields — the main app's connect modal and the e2e test dashboard — now use `type="text"` with monospace font, `spellCheck=false`, `autoCorrect="off"`, `autoCapitalize="off"`, `autoComplete="off"`. Users can now see what they're pasting and catch mistyped / truncated tokens visually. The #1 "it doesn't work" cause is eliminated.

**F.2 — Repo list pagination + error capture** (`services/credentials/src/services/github.service.ts`, `packages/ui/src/store/slices/integrations-slice.ts`, `packages/ui/src/features/integrations/components/repo-selector.tsx`). The old code fetched 30 repos and silently swallowed errors, so accounts with 30+ repos or expired tokens showed an empty list with no explanation. Now fetches `per_page=100` with automatic page walking up to 1000 repos, distinguishes 401/403 with specific user-facing messages, captures errors in Redux state, and the `RepoSelector` renders an inline error card with "Retry" and "Reconnect GitHub" buttons for auth-related failures.

**F.3 — Webhook registration graceful degradation** (`services/deploy/src/services/pipeline.service.ts`, `packages/db/prisma/schema.prisma`). Previously `registerGitHubWebhook` threw on any non-success HTTP status, which surfaced as a giant stack trace in the gateway log. Now returns `{ status: 'registered' | 'failed' | 'skipped', webhookId?, error? }` with specific messages for 403 (PAT needs repo admin), 401 (reconnect), 404 (repo not accessible), network errors, and "no token" cases. The result is persisted on the `DeploymentRule` row as `webhook_status` and `webhook_error` fields so a future UI enhancement can show a badge. Deploy rules still work for manual pushes; only auto-deploy-on-push is affected by webhook registration failures.

### G. API error visibility end-to-end

**G.1 — Axios response interceptor extracts server errors** (`packages/ui/src/shared/api/axios-instance.ts`). The old interceptor just called `Promise.reject(error)` and left axios' default `"Request failed with status code 400"` message intact. The new interceptor extracts `response.data.error || response.data.message`, rewrites `error.message` to `"METHOD /path → STATUS: server reason"`, attaches `error.response.extractedMessage`, and logs full request/response context to the browser console. Users now see the actual server reason (e.g., `"POST /canvas/deploy/destroy-all → 400: GCP project is required (--project <id>)"`) instead of a generic status code.

### H. Template and translator polish

**H.1 — Static site template has 4 connected blocks**. The template now includes Internet + StaticSite + CustomDomain (defaulting to `example.com`) + Source.Repository (defaulting to `light-cloud-com/ice-test-hello-static`), connected with three edges: Internet→StaticSite (HTTPS), CustomDomain→StaticSite, Source.Repository→StaticSite (`deploys_from`).

**H.2 — GitHub Repository block description made per-type** (`packages/blocks/src/requirements/definitions/github-repo.ts`). The "Attach a source repository" requirement description used to say "container image" which was wrong for static sites. Now adapts to the block's iceType: static sites get "fetch the built static output and upload it to the bucket", serverless functions get "package the function and upload it", containers keep "build and deploy it".

**H.3 — `UI_ONLY_TYPES` extended** (`packages/core/src/deploy/card-translator.ts`). `Source.Repository` and `Config.Environment` are now recognized as intentional non-deployable canvas annotations. Previously they fell into the `!gcp_type` branch and emitted `No gcp mapping for iceType "Source.Repository"` warnings on every plan. Aligned with the validation layer which already special-cases them at `deploy-rules.ts:173` and `schema-bridge.ts:71`.

## What's left to do

The things below are deferred from today's work — some deliberate, some blocked, some just out of time.

### I. Dependency ordering for destroy and plan

**I.1 — Explicit edges from backend bucket → forwarding rule in the translator**. Currently the translator's Phase 8 pass-1.5 semantic wiring injects the backend bucket node but doesn't add an explicit edge to the forwarding rule. The deploy engine's topological sort has no dependency between them, so both run in parallel. When the backend bucket fails (quota), the forwarding rule still tries to reference it, hits the new fail-fast check, and produces a dependent failure. Adding the edge would mean the forwarding rule is skipped cleanly when its prerequisite fails instead of doing wasted work.

**I.2 — "Skip dependents of failed" option in deploy engine**. The engine currently has `continue_on_error: true` which is a global toggle. A more granular `skip_dependents_on_failure` option would keep independent branches running but skip anything reachable from a failed node. Out of scope for today.

**I.3 — Auto-retry partial failures** — when a resource fails with `ALREADY_EXISTS` (e.g., `backendService 'ice-...-backend' already exists`), the deploy engine should treat it as success + import rather than failure + retry-creates-duplicate. Currently handled for some cases (`ALREADY_EXISTS` on bucket create is recovered) but not for backend services created by load balancer chain. Should be unified.

### J. UI integration for Phase 4 block requirements in the properties panel

Phase 4's backend framework and the deploy-panel Requirements section are done, but the per-block properties panel view is still pending. When users click a CustomDomain block on the canvas, they should see the DNS record card, verification status, and cert issuance status in the properties panel — even when the deploy panel is closed. The `DnsRecordCard` component is already reusable; just needs plumbing. Documented in the Phase 4 post-mortem, still deferred.

### K. IP address reservation tracking

The `IN_USE_ADDRESSES` quota (default 8 per project) is currently hit when forwarding rules leak from partial deploys. Each forwarding rule reserves an ephemeral IP that counts against the quota. The orphan cleanup service deletes orphaned forwarding rules — which releases the IP — but ICE has no first-class tracking of static IP reservations. If a future version adds explicit `compute.address` resources (for reserved static IPs), the destroy flow would need matching cleanup.

### L. Backup of old deployed configs before destroy-all

`destroyAllForCard` permanently deletes everything. A safer UX would snapshot the current mapping + deployment state into a tombstone record before the destroy runs, so accidental deletions can be introspected (not recovered — but at least "here's what existed before you nuked it"). Deferred.

### M. Preflight requirement for GCP project quota headroom

Right now the user only finds out they've hit a quota mid-deploy. A preflight check that queries `compute.projects.get` for the current quota usage and warns "you're at 3/3 backend buckets — delete some before deploying" would turn a 60-second failed deploy into a zero-second planning warning. Same check could cover forwarding rules, IP addresses, URL maps, etc.

### N. Stable resource identity across card recreations

Phase 1's `generate_stable_name(node_id)` hashes the node UUID, so the name survives label renames and canvas moves on the same card. But recreating the same project from a template generates new UUIDs, which produces new names on every fresh project. This is why the user accumulated 3 backend buckets across template iterations and hit quota. A stronger approach would hash `(cardId, semanticRole)` instead of just `node_id`, so a "static site bucket on Card A" always produces the same name regardless of how many times the user recreates the canvas. Would need careful backward compatibility with existing deployments.

### O. Cross-environment cleanup scoping

`destroyAllForCard` currently walks every environment for a card. A user with dev/staging/prod might not want to nuke prod when they meant to clean up dev. Needs an environment selector in the destroy modal.

### P. Rate-limited background orphan sweeper

Currently the orphan cleanup only runs on user click. A background sweeper that runs once per day and cleans up resources with `ice-managed=true` labels whose mapping rows don't exist would prevent quota exhaustion silently. Would need careful guards to avoid deleting something a user created mid-deploy.

### Q. Real drift detection for Phase 8 resources

Phase 7 added `describe()` for storage buckets and Cloud Run. The new Phase 8 types — managed SSL certificate, backend bucket — have `describe()` implemented but don't feed into the drift UI yet. The drift framework exists; just needs the handler mappings registered.

### R. Requirement check retries for transient API errors

The Google Site Verification API occasionally returns 5xx errors. The requirements resolver just logs and returns `unknown`. A transient-retry wrapper (like Phase 3's `withRetry` helper for the deploy REST client) would smooth this out.

### S. PAT field security posture

Made the field plain text for diagnostics today. Long-term we should ALSO add a "reveal/hide" eye toggle so paranoid users can switch back to password mode, and auto-clear the input after a successful connect so it doesn't persist in the DOM inspector.

## GCP-specific code (targets for provider-agnostic refactor)

Everything below is GCP-hardcoded today. When we broaden to AWS / Azure / Kubernetes these will need provider-specific implementations behind a common interface.

### T.1 — Handler registry (Phase 8, expanded today)

**Files:** `packages/core/src/deploy/providers/gcp/gcp-deployer.ts`, `packages/core/src/deploy/providers/gcp/handlers/*.ts`

Each handler is GCP-specific: `cloud-storage.ts`, `cloud-run.ts`, `cloud-sql.ts`, `backend-bucket.ts`, `managed-ssl-certificate.ts`, `load-balancer.ts`, etc. They hit GCP REST APIs directly and use GCP SDK clients. AWS and Azure need their own handler sets.

**Refactor target:** The `GCPResourceHandler` interface at `packages/core/src/deploy/providers/gcp/types.ts` is already generic enough (`create/update/delete/describe`) that it can be promoted to `ResourceHandler<TContext>`. The deploy engine in `deploy-engine.ts` already calls via a generic `ProviderDeployer` abstraction, so the engine itself is provider-neutral. The missing piece is a type-parameterized handler base plus per-provider registries.

### T.2 — Card translator property extractors

**File:** `packages/core/src/deploy/card-translator.ts`

All property extractors (`extract_storage_bucket_properties`, `extract_cloud_run_properties`, `extract_custom_domain_properties`, `extract_backend_bucket_properties`, etc.) return shapes that match GCP resource APIs (`iamConfiguration`, `managed: { domains }`, `publicAccessPrevention`, `mainPageSuffix`, etc.). The translator has:

- `GCP_TYPE_MAP` — hardcoded dict from iceType → `gcp.*` resource type string
- `AWS_TYPE_MAP` — same shape for AWS (partially populated)
- `AZURE_TYPE_MAP` — same shape for Azure (partially populated)

The Phase 8 semantic-wiring pass (Pass 1.5) that creates backend buckets and wires SSL certs is written against GCP concepts specifically (`gcp.compute.backendBucket`, `gcp.compute.managedSslCertificate`). AWS would need its own pass that creates a CloudFront distribution + ACM cert + S3 origin, Azure would need Front Door + a managed cert + Blob Storage.

**Refactor target:** Move the semantic-wiring pass into a per-provider `wire_semantic_resources(graph, nodes, edges)` function that each provider implements. The translator's Pass 1 (node creation) and Pass 2 (edge addition) stay generic.

### T.3 — API auto-enablement

**File:** `services/deploy/src/services/deploy.service.ts` — `ICE_TYPE_API_MAP`, `autoEnableGCPApis`, `enableGcpApi`

GCP-specific: it maps iceTypes to `*.googleapis.com` API names and calls the Service Usage API. AWS has no equivalent "enable API" concept (services are always-on). Azure has resource providers that need explicit registration via a different flow.

**Refactor target:** A `ProviderDeployer.ensureApis(requiredFeatures: string[])` method that each provider implements differently. GCP enables APIs, Azure registers resource providers, AWS no-ops.

### T.4 — Orphan cleanup service

**File:** `services/deploy/src/services/orphan-cleanup.service.ts` (new today)

Walks GCP-specific endpoints: `compute.googleapis.com/v1/projects/{p}/global/backendBuckets`, `sslCertificates`, `urlMaps`, `targetHttpsProxies`, `targetHttpProxies`, `backendServices`, `forwardingRules`. Filters by `labels.ice-managed == 'true'`.

**Refactor target:** Per-provider `listIceManagedResources(auth, context)` + `deleteResource(auth, type, id)` methods. The cross-referencing logic against `DeployedResourceMapping` stays generic.

### T.5 — GitHub verification service

**File:** `services/deploy/src/services/google-verification.service.ts` (new today)

Uses the Google Site Verification API for domain ownership verification before managed SSL cert issuance. AWS uses ACM with a different DNS verification flow (CNAME record instead of TXT record for domain validation). Azure Front Door uses its own verification path.

**Refactor target:** `DomainVerificationProvider` interface with `generateToken(domain)`, `checkVerification(domain)` methods. The Phase 4 requirement definition (`domain-verification.ts`) reads these off the context, which is already the right abstraction — just need per-provider implementations.

### T.6 — Credential resolution

**File:** `services/deploy/src/services/deploy.service.ts` — the `applyDeployment`, `destroyDeployment`, `destroyAllForCard`, `rollbackDeployment`, `checkDrift` functions all have nearly-identical credential-building blocks: check `credentials._auth_type === 'oauth'` → use OAuth2Client, else parse SA key → build GoogleAuth → get token → write temp file → attach `_ice_key_file_path`.

**Refactor target:** A `CredentialResolver` service that returns a `ScopedDeployAuth` object wrapping the auth client, key file path, raw credentials, and project id. Called once per deploy by the main service; each provider implements its own resolver.

### T.7 — Load balancer chain wiring

**File:** `packages/core/src/deploy/providers/gcp/handlers/load-balancer.ts`

The create method chains backend service → URL map → target HTTPS proxy → forwarding rule → optional HTTP redirect rule. This is GCP-specific. AWS equivalents would be an Application Load Balancer + target group + listener + rule chain. Azure is Front Door + routing rules.

**Refactor target:** The "Internet / public traffic" iceType should compile to provider-specific load balancer primitives via a dispatcher in the translator's semantic-wiring pass. The handler stays provider-specific.

### T.8 — Standard resource labels

**File:** `packages/core/src/deploy/card-translator.ts` — `generate_stable_name`, `sanitize_label_value`

The labels (`ice-managed=true`, `ice-source-id`, `ice-type`, `ice-project`, `ice-environment`, `ice-card-id`) are written as GCP labels on every resource. AWS uses tags (same concept, different API field name). Azure uses tags. Kubernetes uses labels AND annotations.

**Refactor target:** An abstract `applyStandardMetadata(resource, ctx)` per provider that translates the ICE metadata set into the provider's tagging convention. The values themselves are universal.

### T.9 — Bucket public access configuration

**File:** `packages/core/src/deploy/providers/gcp/handlers/cloud-storage.ts`

The `iamConfiguration: { publicAccessPrevention: 'inherited', uniformBucketLevelAccess }` config is GCP-specific, and the `allUsers:roles/storage.objectViewer` grant is too. AWS S3 has `BucketPolicy` + `PublicAccessBlock` with different semantics. Azure Blob has `anonymousAccess` at the container level.

**Refactor target:** Store a provider-agnostic `public_access: boolean` on the node data (already done) and have each provider's handler translate it. No refactor needed at the translator layer.

### T.10 — Artifact registry / container image cleanup

**File:** `packages/core/src/deploy/providers/gcp/handlers/cloud-run.ts`, `cloud-functions.ts`

The `deleteArtifactRegistryImagesForService` and `deleteFunctionsSourceArchives` helpers hit GCP Artifact Registry and the GCP-managed `gcf-v2-uploads-*` bucket directly. AWS ECR has a parallel flow with different API shapes. Azure Container Registry is yet another flow.

**Refactor target:** `ProviderDeployer.cleanupArtifactsForResource(type, name, metadata)` that each provider implements. The "find and destroy accumulated build artifacts" semantics are provider-agnostic.

### T.11 — The `Network.CustomDomain` → SSL certificate mapping

**File:** `packages/core/src/deploy/card-translator.ts` — `GCP_TYPE_MAP`

`'Network.CustomDomain': 'gcp.compute.managedSslCertificate'` is one-to-one GCP. AWS would map to `aws.acm.certificate`. Azure would map to Front Door's custom domain config. The property extractor `extract_custom_domain_properties` returns GCP-specific shapes (`managed: true, domains: [...]`).

**Refactor target:** Each provider's `*_TYPE_MAP` declares its own mapping. The CustomDomain block blueprint itself (`packages/blocks/src/common/networking/custom-domain.ts`) is already provider-agnostic — it only declares `providers: ['gcp']` today because the other providers' handlers don't exist yet. Extending the providers list is the right end-state.

### T.12 — Phase 4 requirement definitions with runtime capabilities

**Files:** `packages/blocks/src/requirements/definitions/*.ts`, `services/deploy/src/services/requirements.service.ts`

The `domainVerificationRequirement` and `managedCertIssuanceRequirement` read `ctx.googleVerifier` and `ctx.certStatusChecker` from the context. The resolver injects these with GCP-specific implementations. The requirement definitions themselves are provider-agnostic (they don't import any GCP code), but the injected capabilities are.

**Refactor target:** The resolver's capability injection is already the right shape — just needs per-provider capability implementations (e.g., `awsCertificateManagerChecker` for ACM).

### T.13 — Deploy progress snapshot scope

**File:** `services/deploy/src/services/deploy-locks.ts`

The `DeployProgressSnapshot` schema is generic (status, progress, currentResource, currentStep, nodeStatuses). Not GCP-specific. Good as-is.

### T.14 — Route handlers

**File:** `services/deploy/src/routes/canvas-deploy.ts`

Most routes are provider-agnostic. Two exceptions:
- `/cleanup-orphans` accepts `gcpProject` in the body (hardcoded field name)
- `/destroy-all` accepts `gcpProject` in the body

**Refactor target:** Rename to `providerProject` or accept a `providerContext: { type: 'gcp' | 'aws', project?: string, accountId?: string, subscriptionId?: string }` object.

### T.15 — Error detection patterns keyed to GCP error shapes

**File:** `packages/core/src/deploy/messages.ts`

`API_NOT_ENABLED_PATTERNS`, `AUTH_MISSING_PATTERNS`, and `AUTH_EXPIRED_PATTERNS` are string-matched against GCP-specific error text (`"has not been used in project"`, `"PERMISSION_DENIED"` + `"googleapis.com"`, `"Could not load the default credentials"`, `"invalid_grant"`). AWS and Azure return completely different strings (AWS has `"UnauthorizedOperation"` / `"OptInRequired"`; Azure has `"AuthorizationFailed"` / `"MissingSubscriptionRegistration"`).

**Refactor target:** Promote to a provider-scoped `ErrorClassifier` interface — `classifyError(raw): { category: 'api-disabled' | 'auth-missing' | 'auth-expired' | 'quota' | 'unknown', details }`. Each provider ships its own pattern set; the deploy service calls `provider.errorClassifier.classify(err)` instead of the globally-imported detectors.

### T.16 — Environment sizing presets keyed by GCP resource type

**File:** `packages/core/src/deploy/environment-config.ts`

`ENVIRONMENT_PRESETS` is keyed by `gcp.sql.databaseInstance`, `gcp.run.service`, `gcp.run.job`, `gcp.redis.instance`, etc., and the preset values are GCP-specific shapes (`tier: 'db-f1-micro'`, `min_instances`, `cpu: '1'`). AWS would have RDS instance classes (`db.t3.micro`), Azure would have SKU tiers, and the property names differ.

**Refactor target:** Per-provider preset maps keyed by the provider's resource type. The dev/staging/prod semantics stay universal; only the concrete values and keys are provider-scoped.

### T.17 — GCP messages / service name catalogue

**File:** `packages/core/src/deploy/providers/gcp/messages.ts`

`SERVICE_NAMES` and the SDK-availability / operation-failure / timeout message helpers are all named after GCP services (`Cloud Run`, `Cloud SQL`, `Pub/Sub`, `Firestore`, `Memorystore`, `Vertex AI`, etc.). Each handler imports from here for log strings.

**Refactor target:** Each provider owns its own `messages.ts` under `providers/<name>/messages.ts` with the same shape. Handlers import from their local provider module — no cross-provider references.

### T.18 — GCP SDK lazy loader + credential-passing patterns

**File:** `packages/core/src/deploy/providers/gcp/sdk-loader.ts`

`initialize_gcp_clients` is hard-wired to load `@google-cloud/storage`, `@google-cloud/run`, `@google-cloud/functions`, etc. and passes a unified `{ keyFilename, credentials, authClient }` shape. The "Preference order: keyFilename → credentials → authClient" logic only makes sense for Google Cloud Node SDKs. AWS uses `@aws-sdk/client-*` packages that accept a `credentials: { accessKeyId, secretAccessKey, sessionToken }` shape. Azure uses `@azure/*` packages with `DefaultAzureCredential` or `ClientSecretCredential`.

**Refactor target:** Promote to `ProviderSdkLoader` interface with a `loadClients(auth): Map<string, unknown>` method. Each provider ships its own loader and its own client registry. The deploy engine asks `provider.sdkLoader.loadClients(scopedAuth)` and gets back a provider-native client bag.

### T.19 — Hardcoded region lists in the deploy panel

**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx` (lines 62–103)

`PROVIDER_REGIONS` is a hardcoded `Record<string, string[]>` with GCP regions (`us-central1`, `europe-west1`, ...), AWS regions, and Azure regions. The `PROVIDER_LABELS` map (`gcp: 'GCP'`, `aws: 'AWS'`, `azure: 'Azure'`, `kubernetes: 'Kubernetes'`) and `PROVIDER_PROJECT_LABELS` (`gcp: { label: 'GCP Project', placeholder: 'my-gcp-project' }`, `aws: { label: 'AWS Account / Region', ... }`, etc.) are also hardcoded on the client.

**Refactor target:** Fetch from a backend `/providers/:id/metadata` endpoint that returns `{ label, projectFieldLabel, regions[], features[] }`. Each provider exposes its own metadata; the UI stops shipping a static registry. Alternative: publish a provider-descriptor package that both the UI and backend import, so the list lives in code but in one place.

### T.20 — `gcpProject` naming carried through client state, API adapter, Redux, and routes

**Files:** `packages/ui/src/store/slices/deploy-slice.ts`, `packages/ui/src/shared/api/api-adapter.ts`, `packages/ui/src/shared/api/http-api-adapter.ts`, `packages/ui/src/features/deploy/components/deploy-panel.tsx`, `services/deploy/src/routes/canvas-deploy.ts`

The field name `gcpProject` (and selectors like `deploy.gcpProject`, action `setGcpProject`, and URL fragments) leaks GCP semantics into every layer of the stack. A multi-provider future needs `deploy.providerScope: { type: 'gcp' | 'aws' | ..., project?: string, accountId?: string, subscriptionId?: string, resourceGroup?: string }`.

**Refactor target:** Rename the slice field to `providerScope`, update all consumers, and have the backend accept a uniform `{ providerScope }` body. The old field name can alias for one release if backwards compatibility matters.

### T.21 — `detectDominantProvider` defaults to `'gcp'`

**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx` (lines 120–129)

When no resource nodes carry a `provider` field, `detectDominantProvider` returns `'gcp'`. This is a reasonable default today because GCP is the only working provider, but it silently hides misconfigured canvases once other providers exist.

**Refactor target:** Fall back to the user's default provider from their profile, or show an explicit "Provider not set" state and force a selection before Plan. Never silently pick.

## Phase 9 acceptance tests

1. **Destroy-all unblocks a quota-exhausted project.** With 3 orphaned backend buckets in `lc-ice`, open the deploy panel, click Destroy, enable "Destroy everything for this project", confirm. The modal walks every historical deployment + mapping row, orders the deletes, and clears out the backend buckets, forwarding rules, URL maps, SSL certs, and backend services. Next deploy succeeds.

2. **Quota error banner shows the real reason.** Trigger a quota failure on any quota type (backend buckets, IP addresses, forwarding rules). The banner shows the correct explanation + "Clean up orphaned ICE resources" button. Click it, watch the live list of deletions, retry the deploy.

3. **Cross-tab visibility.** Open the project in two browser windows. Start a deploy in window A. Window B shows the banner, block pulsing rings, and progress updates immediately without any action.

4. **Canvas hydration on reload.** Refresh the page after a successful deploy. The static site block shows `https://mysite.com` (propagated from the CustomDomain edge). Forwarding rule shows its IP. Custom Domain block shows `https://mysite.com`. No panel open required.

5. **Site Verification API auto-enable.** Start a fresh project in a GCP project where the Site Verification API is disabled. Click Plan. The first `generateVerificationToken` call fails with 403, the service detects `SERVICE_DISABLED`, enables the API, waits 5s, retries, and returns a real TXT record token. The requirement row shows the token immediately.

6. **Axios errors show server reason.** Trigger any 400 from the backend (e.g., call destroy with no deployment). The deploy panel error shows `POST /canvas/deploy/destroy → 400: No deployment found to destroy`, not the generic axios message.

7. **GitHub PAT field is plain text.** Paste a token into the GitHubConnectModal — visible in monospace. Paste a truncated one and notice immediately. Same for the e2e dashboard PAT field at `localhost:15200`.

8. **Repo list handles >30 repos.** Connect GitHub with an account that has 50+ repos. The picker shows all of them, not just the first 30.

9. **Destroy cleans up Artifact Registry.** Deploy a Cloud Run template, wait for success, destroy. The Cloud Run service is deleted AND the container image in `ice-images/serviceName` is deleted. Same for Cloud Functions.

10. **Bucket is actually reachable.** Deploy the static site template with the custom domain. After deploy, visit `https://storage.googleapis.com/<bucket-name>/` — it should return 200 for the root index, not 403.

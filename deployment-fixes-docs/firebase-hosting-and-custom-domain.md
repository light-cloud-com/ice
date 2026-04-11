# Firebase Hosting & Custom Domain Block

**Status:** Shipped 2026-04-11
**Supersedes:** [phase-8-custom-domains-https.md](./phase-8-custom-domains-https.md) (load-balancer + GCS bucket approach)

## Why this exists

Phase 8's original plan was to deploy GCP static sites as `gcp.storage.bucket` + `gcp.compute.backendBucket` + URL map + global forwarding rule + managed SSL cert. That stack works in fresh GCP projects but is **impossible** under common enterprise org policies:

| Org policy | What it blocks | Effect on Phase 8 stack |
|---|---|---|
| `iam.allowedPolicyMemberDomains` | IAM `allUsers` grants | Backend bucket can't fetch from a public-readable bucket → 502 |
| `storage.uniformBucketLevelAccess` | Disabling UBLA | Kills the legacy ACL fallback that bypasses the IAM constraint |
| `storage.publicAccessPrevention` | Public access of any kind | Even ACL grants are rejected |

In hardened projects with both `iam.allowedPolicyMemberDomains` and `storage.uniformBucketLevelAccess` enforced, **no Cloud Storage bucket can be made publicly readable**. Terraform can't either. The Phase 8 approach is structurally incompatible with these projects.

**Firebase Hosting bypasses all of it.** It has its own access model that doesn't go through GCS IAM, ships HTTPS + global CDN + custom domains out of the box, and gives every site a free public URL at `<site>.web.app`. It's the right primitive for static sites on GCP regardless of org policy posture.

## What ships

Today (2026-04-11) ICE compiles `Compute.StaticSite` on GCP to **`gcp.firebase.hosting`** instead of `gcp.storage.bucket` + the LB chain. The user experience:

1. Drop a **Compute.StaticSite** block (or any GCP static-site template).
2. Set `repository` on a connected **Source.Repository** block. ICE downloads the GitHub tarball and uploads it directly to Firebase Hosting via the Hosting REST API.
3. (Optional) Drop a **Network.CustomDomain** block, set a root domain (e.g. `example.com`), add one route per subdomain, drag from each route's port to a static site. ICE registers each `<subdomain>.<rootDomain>` as a Firebase Hosting custom domain.
4. Click **Deploy**. The site is live at `https://<site>.web.app` immediately. The deploy panel shows the DNS records (CNAMEs to add, conflicting A records to remove) for each custom domain.
5. Add the records at the registrar. Firebase auto-provisions a managed SSL cert.

## Architecture

### Resource type map

```
Compute.StaticSite (GCP) → gcp.firebase.hosting
```

Source: `packages/core/src/deploy/card-translator.ts:101`

The translator's `GCP_TYPE_MAP` no longer points static sites at `gcp.storage.bucket`. Templates and hand-dragged blocks both compile to Firebase Hosting.

### Handler

`packages/core/src/deploy/providers/gcp/handlers/firebase-hosting.ts`

The handler implements `create`, `update`, `delete`, `describe` for `gcp.firebase.hosting`. It uses the Firebase Hosting REST API directly (no Node SDK exists). High-level flow:

```
ensureFirebaseProject(ctx)        # idempotent: addFirebase if not already a Firebase project
  → ensureHostingSite(siteId)     # GET first, then POST to create — handles 409 ALREADY_EXISTS
    → publishVersion(files)       # 5-step REST flow:
        1. POST sites/<id>/versions
        2. POST <version>:populateFiles  with { "/path": sha256(gzip) }
        3. POST <uploadUrl>/<sha256> with the gzipped bytes
        4. PATCH <version>?update_mask=status with FINALIZED
        5. POST sites/<id>/releases?versionName=<version>
    → registerHostingDomain(customDomain)  # if user wired a Custom Domain block
        → returns add-records + remove-records
```

Two file sources are supported:

- **`publishPlaceholderVersion`** — uploads a single `index.html` placeholder when no Source.Repository is wired. Gives every fresh deploy a working URL.
- **`downloadGitHubRepo`** — fetches `https://codeload.github.com/<owner>/<repo>/tar.gz/refs/heads/<branch>`, decompresses, parses the tar entries with an in-process minimal ustar parser (no `tar` dep). Filters by `outputDirectory` if set; falls back to repo root if the configured directory matches no files.

### GitHub repo flow (Source.Repository → Compute.StaticSite)

Pass 1.4 of the translator (`card-translator.ts`) walks every `Source.Repository → Compute.*` edge and copies `repository`, `branch`, `buildCommand`, `outputDirectory`, `path` from the repo node onto the compute node's compiled properties. The connected source ALWAYS wins — stale local values don't block the propagation.

The handler then reads `properties.repository` and downloads. Build commands are NOT executed (we don't run user scripts on the deploy backend); the doc warns the user to pre-build and commit, or set `outputDirectory` to a pre-built folder.

For automatic redeploys on push, the deploy service calls `ensureRulesForCanvas()` (`services/deploy/src/services/pipeline.service.ts`) which idempotently creates a `DeploymentRule` row + registers a GitHub webhook for every Source.Repository → Compute edge. Push events fire `processPipelineJob()` which re-runs `applyDeployment()` → `firebase-hosting.update()` → re-fetches the repo + republishes.

### Network.CustomDomain block

`packages/blocks/src/common/networking/custom-domain.ts`

A new common block (provider-agnostic) with one root domain field and a `routes: Array<{ id, subdomain }>` array. Each route is a slot the user can connect to one downstream service. Distinct from `Network.PublicEndpoint` (which compiles to a load balancer for VPC-private services).

**Custom canvas renderer**: `packages/ui/src/features/canvas/components/nodes/custom-domain/index.tsx`. Unlike every other block (which flows through `compact-node/`), Custom Domain owns its own renderer because:

- Height is dynamic (grows with route count via `computeCustomDomainHeight()`)
- Each route row has its own connection port (`<circle data-route-id="...">`) on the right edge — not the standard four-side port pattern
- Inline editable subdomain inputs and a `+ Add subdomain route` button
- All inputs use `<foreignObject>` so HTML elements work inside SVG

The svg-canvas dispatcher (`svg-canvas.tsx`) routes `iceType === 'Network.CustomDomain'` to the custom renderer before falling through to the generic compact-node path.

### Edge anchoring

When the user drags from a route's port, `handleConnectionPortDown` reads `data-route-id` from the source DOM element and stores it on `drawingConnection.sourceRouteId`. The created edge gets `edge.data.routeId`.

`SvgConnectionPath` (`svg-connection-path.tsx`) has a special case: when the source is `Network.CustomDomain` AND the edge has a routeId, the start point is anchored to the EXACT y-coordinate of that row's port (computed via the shared `getCustomDomainRoutePortY(rowIndex)` helper). The exit side is forced to `right`. This makes each edge visually attach to its specific row instead of converging at the block midpoint.

### Three propagation paths

When the user wires `CustomDomain → Static Site`, the host (`<subdomain>.<rootDomain>`) ends up on the static site's `domain` field via three independent paths:

1. **At edge creation** (`svg-canvas.tsx`) — when `handleConnectionEnd` creates the edge, it dispatches `updateCardNodeData` to set `targetNode.data.domain = fullHost`. Mirrors the GitHub repo block's behavior at edge creation.

2. **Reactive sync** (`svg-canvas.tsx` useEffect) — walks every CustomDomain → Compute edge on every node/edge change and force-syncs the target's `domain` field. Ensures edits to the root domain or a route's subdomain immediately propagate to all connected services. Also: deletes orphan edges whose `routeId` no longer exists, and **backfills** missing routeIds on legacy edges so old edges snap onto a row port.

3. **Translator Pass 1.45** (`card-translator.ts`) — at deploy time, looks up the route by `edge.data.routeId` (with `edge.data.subdomain` fallback for back-compat) and mutates `targetGraphNode.properties.domain`. CustomDomain ALWAYS wins over the target's local `domain` field.

The properties panel of the target service shows a "Domain managed by Custom Domain" banner when an active CustomDomain edge exists, telling the user the field is governed elsewhere.

### DNS records

Firebase Hosting's `customDomains` API returns a `requiredDnsUpdates` object with two distinct sets:

- `desired[]` — records the user must **add** to verify the domain
- `discovered[]` — records currently at the registrar that **conflict** and must be **removed**

Per-record `domainUpdateAction` ("ADD"/"REMOVE") can also override the section default. The handler's `extractDnsRecords()` walks all four known shapes (`requiredDnsUpdates.{desired,discovered,checking,checks}[]`, `dnsRecordSets[]`, `provisioning.dnsStatus[]`, legacy `provisioning.expectedIps + dnsTokens`) and emits a normalized `FirebaseHostingDnsRecord[]` with `required_action: 'add' | 'remove' | 'verify'`.

The deploy panel renders two distinct sections per domain:

- **Blue "Add the records below…"** — Type / Domain / Value table with copy buttons
- **Amber "Remove the records below…"** — same table, for conflicting records that block verification

The Custom Domain block's properties panel shows the same split. Both views read from `deploy.results[].outputs.custom_domain_dns_records` (deploy panel) or `targetNode.data.custom_domain_dns_records` (properties panel — populated by the deploy subscription hook spreading outputs onto the node).

### Outputs surfaced on the canvas block

The Static Site block's compact-node renderer (`compact-lod3.tsx`) shows TWO stacked URL rows when both are present:

- **Top (green, prominent)**: `https://app.example.com` — the custom domain
- **Bottom (dimmed)**: `https://<site>.web.app` — the firebase URL

Both are clickable. When no custom domain is registered, only the firebase URL shows. The deploy panel result row shows the same primary + "Default" pair via the `gcp.firebase.hosting` case in `output-extractors.ts`.

### Required GCP APIs

`Compute.StaticSite` now requires both:

- `firebase.googleapis.com` — Firebase Management API for `addFirebase`
- `firebasehosting.googleapis.com` — the Hosting REST API itself

Defined in `services/deploy/src/services/deploy.service.ts` in the `ICE_TYPE_API_MAP`. The pre-flight check enables both before the deploy starts so the user gets a single "click to enable" prompt instead of mid-deploy 403s.

## Connection rule changes

`packages/types/src/connection-rules.ts` gained two improvements:

1. **Smallest-containing-node hit-test** in `svg-canvas.tsx` — the connection drop handler picks the smallest node containing the drop point, not the first match in array order. Without this, drops on a Compute.Container nested inside `[VPC[Subnet[…]]]` would sometimes hit the parent VPC and fail because containers can't have edges.

2. **Parent-aware `canConnect`** — new optional `context: { srcNode, tgtNode, allNodes }` parameter. When the source or target is a Domain block (PublicEndpoint or CustomDomain), the rule checks `isInsideContainer(otherEnd)` and rejects edges to VPC-internal services. Public-facing blocks can only target services that are publicly reachable.

## Deploy panel as right-sidebar panel

`packages/ui/src/features/deploy/components/deploy-panel.tsx` no longer uses `createPortal` modal/sidepanel modes. It renders inline as a standard right-sidebar panel using the shared `PanelHeader` component, mounted in `main-layout.tsx`'s `rightPanels` array alongside Cost / Properties / Validation. A Rocket strip tab in the sidebar toggles it. The `/deploy` subpage simply dispatches `openDeployPanel()` via a `DeployRouteOpener` helper.

This means the canvas stays visible and interactive during a deploy, the deploy panel is resizable/stackable with other right-side panels, and the slice-level `isOpen` state is the single source of truth for visibility.

## Destroy state cleanup

When the user clicks Destroy:

1. The deploy slice has a new **`'destroying'`** status (added to `DeployStatus` union). The status badge shows an amber "Destroying" label instead of green "Deploying".
2. `startDeploying` is now idempotent against `'destroying'` so the subscription hook's auto-flip doesn't stomp the destroy label when destroy progress events arrive.
3. After successful destroy, `clearCardDeployOverlay({ cardId })` (a new cards-slice action) wipes every deploy field from every node in the active card: `provider_id`, `deploy_status`, `url`, `default_url`, `firebaseapp_url`, `custom_domain*`, `site_id`, `last_deployed_at`, `deploy_outputs`, `ip_address`, etc. The canvas blocks lose their "Live" indicator and URL pill immediately, and the properties panel "Current" deploy section disappears.
4. `setDeployedResources([])` clears the deploy panel's "previously deployed" list.

## Templates

The `qs-static-site` template (`packages/templates/src/quick-starts.ts`) was updated:

- Dropped the `Network.PublicEndpoint` block (Firebase Hosting includes its own public URL)
- `outputDirectory: ''` instead of `'dist'` so the demo `ice-test-hello-static` repo (which ships HTML at the root) deploys correctly

`budget-webapp.ts`, `full-stack.ts`, `saas-platform.ts` had the `PublicEndpoint → StaticSite` edge removed. Their PublicEndpoint blocks remain for the Gateway/API path but no longer wire the static site through the load balancer chain.

## What this leaves behind

- **Phase 8's load-balancer code** is still in the codebase (`load-balancer.ts`, `backend-bucket.ts`, `managed-ssl-certificate.ts`). It's used by `Network.PublicEndpoint → Compute.Container/SSRSite/etc.` flows that genuinely need a load balancer. Static sites no longer touch this path.
- **`gcp.storage.bucket` handler** (`cloud-storage.ts`) still exists for users who explicitly drop a `Storage.Bucket` block. It also has the IAM → legacy ACL → UBLA-on fallback chain from earlier work, in case anyone tries to make a public bucket directly. Static sites no longer compile to it.

## Files touched (high-level)

| Layer | Files |
|---|---|
| Block | `packages/blocks/src/common/networking/custom-domain.ts` (new), `packages/blocks/src/index.ts` |
| Constants | `packages/constants/src/ice-types.ts`, `packages/constants/src/categories.ts` |
| Connection rules | `packages/types/src/connection-rules.ts` |
| Translator | `packages/core/src/deploy/card-translator.ts` (Pass 1.4, 1.45, GCP_TYPE_MAP, extract_firebase_hosting_properties) |
| Handler | `packages/core/src/deploy/providers/gcp/handlers/firebase-hosting.ts` (new), `packages/core/src/deploy/providers/gcp/gcp-deployer.ts`, `packages/core/src/deploy/providers/gcp/sdk-loader.ts` |
| Deploy service | `services/deploy/src/services/deploy.service.ts` (Source.Repository diagnostics, ensureRulesForCanvas), `services/deploy/src/services/pipeline.service.ts` |
| Canvas renderer | `packages/ui/src/features/canvas/components/nodes/custom-domain/index.tsx` (new), `packages/ui/src/features/canvas/components/svg-canvas.tsx` (dispatcher branch, drag handler, reactive sync, smallest-containing hit test), `packages/ui/src/features/canvas/components/svg-connection-path.tsx` (per-row edge anchoring) |
| Deploy panel | `packages/ui/src/features/deploy/components/deploy-panel.tsx` (sidebar refactor, DNS records section, destroy state, custom domain banner), `packages/ui/src/features/deploy/output-extractors.ts` (gcp.firebase.hosting case), `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts` |
| Properties panel | `packages/ui/src/features/properties/components/properties-panel.tsx` (CustomDomainPanel, Custom Domain inheritance banner) |
| Slices | `packages/ui/src/store/slices/deploy-slice.ts` (`'destroying'` status, `startDestroying`), `packages/ui/src/store/slices/cards-slice.ts` (`clearCardDeployOverlay`) |
| Layout | `packages/ui/src/shared/components/main-layout.tsx` (Deploy in `rightPanels`), `packages/ui/src/shared/components/app-bar.tsx` (removed standalone DeployPanel mount), `packages/web/src/app/app.tsx` (`DeployRouteOpener`) |
| Templates | `packages/templates/src/quick-starts.ts`, `budget-webapp.ts`, `full-stack.ts`, `saas-platform.ts` |
| i18n | `packages/ui/src/i18n/en.json`, `zh.json` |
| Icons | `packages/ui/src/assets/icons/service-names.ts`, `packages/ui/src/assets/icons/brand-registry.ts` |

## Open follow-ups

- **Build commands** are not executed. Repos with `npm run build` get the placeholder. The handler logs a warning telling the user to pre-build or set `outputDirectory` to a pre-committed folder. A future enhancement would submit a Cloud Build job that runs the build then calls the same Firebase Hosting REST API.
- **DNS record polling**: when `extractDnsRecords` returns 0 on the first call, it might be because Firebase hasn't computed them yet (the verification check is async). A poll loop with timeout would fetch the records once they're available. Currently the user has to redeploy to refresh.
- **Custom domain block reordering** — routes can be added/deleted but not reordered yet. Drag-handle on the row would do it.

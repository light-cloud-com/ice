# Phase 8 — Custom Domains, DNS Feedback, Managed HTTPS

**Effort:** 6–8 engineer-days
**Dependencies:** Phase 0 (safety), Phase 1 (stable identity for cert resource naming), Phase 2 (block output rendering), Phase 4 backend (requirements framework)
**Builds on:** Phase 4's `dnsARecordRequirement` — this phase finally surfaces it in the UI and extends it with sibling requirements for domain verification and certificate issuance.

## What users get

When Phase 8 ships, a user can:

1. Drag a **Custom Domain** block onto the canvas and type a real domain (`mysite.com`).
2. Connect it to a Static Site or SSR block and to a Network.Internet block.
3. Click **Plan**. The preflight section shows three requirements: "Verify domain ownership with Google", "Add this DNS A record", and "Waiting for managed SSL certificate."
4. Click **Deploy**. The bucket, backend bucket, URL map, managed SSL cert, target HTTPS proxy, and forwarding rule all provision in dependency order. The canvas shows per-block status as each one lands.
5. After deploy, the Custom Domain block shows a copyable TXT record for Google Search Console verification and an A record pointing at the forwarding rule's IP.
6. The user adds those records at their registrar. ICE's background poller detects propagation, marks the DNS and verification requirements `verified`, triggers managed cert provisioning, and polls the cert status until `ACTIVE`.
7. The Custom Domain block turns green with a clickable `https://mysite.com` pill. Click-through opens the live site.

## Why this is a distinct phase

Phase 4 delivered the backend requirements framework and the DNS A record definition, but stopped short of the UI and the HTTPS pipeline. Phase 8 completes those two halves and adds the infrastructure wiring that was always missing — the static site bucket is still not actually reachable through the load balancer today because there's no `backendBucket` resource, so even a plain HTTP custom domain deploy returns 404. That wiring gap and the managed cert work are the same piece of infrastructure, which is why they're bundled into one phase.

## The issues this closes

From the "What does NOT exist yet" list plus the investigation findings:

| ID | Issue | Source |
|---|---|---|
| P8-1 | No UI surfaces the Phase 4 requirements framework in the deploy panel or block properties panel | Phase 4 post-mortem |
| P8-2 | No Google-managed SSL certificate resource handler | investigation §5 |
| P8-3 | `Security.Certificate` block is a placeholder with no deployer | investigation §5 |
| P8-4 | No domain verification requirement (TXT record for Search Console) | Phase 4 deferred |
| P8-5 | `enableHttps` / cert selection not exposed in block properties | investigation §6 |
| P8-6 | Load balancer URL map points at an empty backend service — no `backendBucket` wiring | investigation §3 |
| P8-7 | `Network.Domain` block maps only to `gcp.run.domainMapping`; no support for load-balancer-fronted domains | investigation §2 |
| P8-8 | Static site template has `domain` as a property on the site block, not a first-class node with requirements | investigation §4 |
| P8-9 | No long-running cert issuance polling (15–60 min typical) | investigation §8 |
| P8-10 | No "visit my site" URL actually works post-deploy because of P8-6 | derived from investigation |
| P8-11 | `sslMode: 'auto'` on the existing Domain block has no implementation | investigation §1 |

## Architecture

The end-to-end flow for a deployed custom-domain static site looks like this:

```
Canvas nodes                       GCP resources
┌────────────────────┐             ┌──────────────────────┐
│ CustomDomain       │─────────────│ gcp.compute.         │
│  mysite.com        │             │ managedSslCertificate│
│  autoProvisionSsl  │             └──────────┬───────────┘
└────────┬───────────┘                        │
         │                                    │
         │     ┌──────────────────┐           │
         └─────│ StaticSite       │─────┐     │
               └────────┬─────────┘     │     │
                        │               │     │
                        ▼               ▼     ▼
               ┌────────────────┐  ┌───────────────────┐
               │ gcp.storage.   │  │ gcp.compute.      │
               │ bucket         │──│ backendBucket     │
               └────────────────┘  └─────────┬─────────┘
                                             │
                                             ▼
                                   ┌───────────────────┐
                                   │ gcp.compute.      │
                                   │ urlMap            │
                                   └─────────┬─────────┘
                                             │
                                             ▼
                                   ┌───────────────────┐
                                   │ gcp.compute.      │
                                   │ targetHttpsProxy  │
                                   └─────────┬─────────┘
                                             │
                                             ▼
                                   ┌───────────────────┐
                                   │ gcp.compute.      │
                                   │ globalForwarding  │
                                   │ Rule              │
                                   └───────────────────┘
                    ▲
                    │
               ┌────┴───────┐
               │ Internet   │ (block — wraps the forwarding rule)
               └────────────┘
```

Edges on the canvas map to explicit resource wiring:
- `CustomDomain → StaticSite` attaches the domain to the backend bucket and drives the managed cert.
- `StaticSite → bucket` is implicit (the static site block compiles to a bucket + backend bucket pair).
- `Internet → StaticSite` compiles to the forwarding rule chain.

## Steps

### Step 8.1 — New `CustomDomain` block blueprint

**Closes:** P8-7, P8-8, P8-11
**File:** New `packages/blocks/src/common/networking/custom-domain.ts`

The existing `domain.ts` block is generic (hostname/subdomain/sslMode/dnsProvider) and maps only to Cloud Run domain mapping. Rather than overloading it, create a new `CustomDomain` block that's purpose-built for "public HTTPS endpoint attached to a backend." The old block stays for Cloud Run-specific flows.

```ts
export const customDomainBlueprint: BlockBlueprint = createBlueprintFromResource('custom-domain', {
  iceType: 'Network.CustomDomain',
  category: 'networking',
  name: 'Custom Domain',
  description: 'Public HTTPS endpoint with automatic SSL certificate via Google-managed certs.',
  icon: 'Globe',
  providers: ['gcp'],
  nodeDataDefaults: {
    domain: '',                // user-provided, e.g. "app.example.com"
    enableHttps: true,         // toggles managed cert provisioning
    autoProvisionCert: true,   // false = bring-your-own cert id
    sslCertificateId: '',      // only used when autoProvisionCert=false
    redirectHttpToHttps: true, // adds an HTTP forwarding rule that redirects
  },
  requirements: [
    domainVerificationRequirement,  // new, Step 8.6
    dnsARecordRequirement,          // existing (Phase 4), now reachable via UI
    managedCertIssuanceRequirement, // new, Step 8.7
  ],
});
```

The `requirements` array is the load-bearing difference from the old Domain block: it declares what the user has to do outside ICE before the domain becomes live.

**Acceptance:**
- Blueprint compiles, appears in the block palette under Networking
- Default domain is empty (not a placeholder like `example.com`), so the user is forced to set a real value
- Requirements list resolves correctly when a domain is attached

### Step 8.2 — `Network.CustomDomain` → resource mapping

**Closes:** P8-2, P8-7
**File:** `packages/core/src/deploy/card-translator.ts`

Add to `GCP_TYPE_MAP`:

```ts
'Network.CustomDomain': 'gcp.compute.managedSslCertificate',
```

The block itself compiles to a managed SSL cert resource. The other resources it implies (backend bucket, URL map attach, target HTTPS proxy with cert ref) are inserted during Pass 2 edge handling — see Step 8.4.

Add a new property extractor:

```ts
function extract_custom_domain_properties(data: Record<string, unknown>, _region: string) {
  return {
    managed: data.autoProvisionCert !== false,
    domains: [String(data.domain || '').trim()].filter(Boolean),
    ssl_certificate_id: data.sslCertificateId || null,
    enable_https: data.enableHttps !== false,
    redirect_http: data.redirectHttpToHttps !== false,
    labels: {},
  };
}
```

**Acceptance:**
- Translator emits a `gcp.compute.managedSslCertificate` node for each CustomDomain block
- Properties include `managed: true` and `domains: ['user-entered-domain']`
- Novel name generation via Phase 1's `generate_stable_name` produces `ice-managedsslcertificate-<hash>`

### Step 8.3 — New `gcp.compute.managedSslCertificate` handler

**Closes:** P8-2, P8-3, P8-9
**File:** New `packages/core/src/deploy/providers/gcp/handlers/managed-ssl-certificate.ts`

Implements the full `GCPResourceHandler` interface:

**create:**
1. POST to `/compute/v1/projects/{project}/global/sslCertificates` with body:
   ```json
   {
     "name": "<name>",
     "type": "MANAGED",
     "managed": { "domains": ["user-entered-domain"] }
   }
   ```
2. Wait for the compute op to complete (operation only signals that the resource record was created, NOT that the cert is issued).
3. GET the cert to read the `managed.status` field.
4. Return `{ provider_id: "projects/{project}/global/sslCertificates/{name}", outputs: { status, domain_statuses } }`.

**Important:** Do not block the deploy until the cert reaches `ACTIVE` — that can take 15–60 minutes and would violate the Phase 3 HTTP timeout. Instead, return as soon as the resource is created. The `managedCertIssuanceRequirement` (Step 8.7) polls the status asynchronously post-deploy.

**update:** managed certs are effectively immutable for their domain list — treat any change as a replace. Phase 3 Step 3.2's `requires_replacement: true` flag marks this in the plan preview.

**delete:** DELETE the cert. Not reversible, no confirmation inside the handler (the deploy panel's destroy modal handles confirmation at the UI layer).

**describe:** (for Phase 7 drift detection) GET the cert, return `{ exists, properties: { domains, managed_status, domain_statuses } }`.

**Acceptance:**
- Cert resource lands in GCP on create, visible in the console
- Newly created cert has status `PROVISIONING`
- Deploy result shows provider_id and initial status in outputs
- Destroy removes the cert cleanly

Register the handler in `packages/core/src/deploy/providers/gcp/gcp-deployer.ts`:

```ts
{ prefix: 'gcp.compute.managedSslCertificate', handler: managed_ssl_certificate_handler },
```

### Step 8.4 — New `gcp.compute.backendBucket` handler + load balancer wiring

**Closes:** P8-6, P8-10
**Files:** New `packages/core/src/deploy/providers/gcp/handlers/backend-bucket.ts`, edit `packages/core/src/deploy/providers/gcp/handlers/load-balancer.ts`

This is the infrastructure gap that has been hiding behind "the deploy succeeds but visiting the IP returns 404." Today the forwarding rule points at an empty backend service. For a static site, we need:

1. A `compute.backendBucket` resource referencing the storage bucket
2. The URL map's `defaultService` pointing at the backend bucket (not a backend service)
3. The target HTTPS proxy referencing the managed cert
4. The forwarding rule on port 443

**New backend-bucket handler:**

```ts
create(name, properties, ctx) {
  const bucketName = properties.bucket_name as string;
  const op = await ctx.rest_client.post(
    `${BASE_URL}/projects/${ctx.project}/global/backendBuckets`,
    { name, bucketName, enableCdn: properties.enable_cdn !== false },
  );
  await wait_for_compute_op(ctx, op.name);
  return result(name, 'create', start, {
    provider_id: `projects/${ctx.project}/global/backendBuckets/${name}`,
  });
}
```

**Load balancer handler changes** (`load-balancer.ts`):

1. Accept an optional `backend_bucket_name` property (set by the translator when an edge connects the forwarding rule's parent to a StaticSite).
2. If `backend_bucket_name` is set, skip the empty backend service and point the URL map at `projects/{project}/global/backendBuckets/{backend_bucket_name}`.
3. Accept an optional `ssl_certificate_name` property (set when a CustomDomain edge is present). When present, create a `targetHttpsProxy` with `sslCertificates: [cert_name]` and a port-443 forwarding rule. Otherwise keep the current HTTP fallback.
4. When `redirect_http_to_https` is set on the CustomDomain, additionally create a port-80 forwarding rule with a URL map that returns `301 → https://`.

**Edge-to-wiring logic** in `translate_card_to_graph`:

The translator already has pass 1 (add nodes) and pass 2 (add edges). Extend pass 2 to:

- For each edge where source is `Network.CustomDomain` and target is `Compute.StaticSite`, record the `ssl_certificate_name` property on whichever resource will become the target HTTPS proxy (i.e., the forwarding rule node derived from the Internet block).
- For each edge where source is `Compute.StaticSite` and target is a forwarding rule, record the `backend_bucket_name` property on the forwarding rule node, and ensure a `backendBucket` node exists referencing the StaticSite's bucket.

This is the first time the translator is doing semantic edge-driven wiring beyond "add an edge to the graph." It's also where the block-to-block contract concept from Phase 4 starts paying off.

**Acceptance:**
- Canvas with StaticSite + Internet + CustomDomain deploys cleanly
- `gcloud compute backend-buckets list` shows the backend bucket
- `gcloud compute url-maps describe <name>` shows `defaultService` pointing at the backend bucket
- Visiting the forwarding rule IP in a browser returns the bucket contents (not 404)
- Visiting `https://<domain>` returns the bucket contents once DNS + cert are live

### Step 8.5 — HTTPS redirect forwarding rule

**Closes:** Part of P8-10
**File:** `packages/core/src/deploy/providers/gcp/handlers/load-balancer.ts`

When `redirect_http_to_https` is enabled on the CustomDomain, the handler creates a second forwarding rule on port 80 with a separate URL map that returns a redirect:

```ts
{
  name: `${name}-redirect-urlmap`,
  defaultUrlRedirect: {
    httpsRedirect: true,
    redirectResponseCode: 'MOVED_PERMANENTLY_DEFAULT',
    stripQuery: false,
  }
}
```

Plus a target HTTP proxy and a second forwarding rule on port 80. This is optional behavior gated by the block property, so users who just want HTTP (rare) or users who have HTTPS-only (most) both get what they asked for.

**Acceptance:**
- With redirect enabled, `curl -I http://<ip>` returns `301` with `Location: https://...`
- With redirect disabled, `http://<ip>` is unreachable (only 443 listens)

### Step 8.6 — `domainVerificationRequirement`

**Closes:** P8-4
**File:** New `packages/blocks/src/requirements/definitions/domain-verification.ts`

Before a managed SSL cert can be issued, Google requires you to verify ownership of the domain via Search Console. The verification produces a TXT record that has to exist on the domain.

```ts
export const domainVerificationRequirement: RequirementDefinition = {
  id: 'domain-verification',
  scope: 'block',
  timing: 'before-deploy',
  blocking: false, // deploy can proceed; cert issuance won't succeed until this is done
  applies: (ctx) => {
    return ctx.block.data?.iceType === 'Network.CustomDomain'
      && Boolean(ctx.block.data?.domain)
      && ctx.block.data?.autoProvisionCert !== false;
  },
  title: (ctx) => `Verify domain ownership: ${ctx.block.data?.domain}`,
  description: () =>
    'Google Cloud needs to confirm you own this domain before issuing a managed SSL certificate. Add the TXT record below at your DNS provider.',
  check: async (ctx) => {
    const domain = ctx.block.data?.domain as string;
    const verified = await checkSearchConsoleVerification(ctx.org.id, domain);
    return {
      status: verified ? 'verified' : 'unmet',
      message: verified ? `Verified for ${domain}` : `Waiting for TXT record on ${domain}`,
      lastCheckedAt: new Date().toISOString(),
    };
  },
  action: (ctx) => {
    const domain = ctx.block.data?.domain as string;
    const token = generateVerificationToken(ctx.org.id, domain);
    return {
      type: 'copy-dns-record',
      label: 'Copy TXT record',
      payload: { record_type: 'TXT', name: domain, value: `google-site-verification=${token}`, ttl: 300 },
    };
  },
  verifyPollIntervalMs: 60_000,
  verifyTimeoutMs: 24 * 60 * 60 * 1000,
};
```

`checkSearchConsoleVerification` and `generateVerificationToken` live in `services/deploy/src/services/google-verification.service.ts` (new). They call the Site Verification API (`https://www.googleapis.com/siteVerification/v1/`).

**Acceptance:**
- CustomDomain block with a real domain shows the TXT record in the requirements UI
- After the user adds the TXT record and waits ~30s, the requirement flips to `verified`
- Verified state persists across page reloads via `BlockRequirementStatus`

### Step 8.7 — `managedCertIssuanceRequirement`

**Closes:** P8-9
**File:** New `packages/blocks/src/requirements/definitions/managed-cert-issuance.ts`

Tracks the lifecycle of the managed cert from `PROVISIONING` → `ACTIVE`. This is a post-deploy requirement because the cert is created synchronously in Step 8.3, but GCP takes 15–60 minutes to actually issue it (ACME challenge, etc.).

```ts
export const managedCertIssuanceRequirement: RequirementDefinition = {
  id: 'managed-cert-issuance',
  scope: 'block',
  timing: 'post-deploy',
  blocking: false,
  applies: (ctx) => ctx.block.data?.iceType === 'Network.CustomDomain' && ctx.block.data?.autoProvisionCert !== false,
  title: (ctx) => `Issuing SSL certificate for ${ctx.block.data?.domain}`,
  description: () =>
    'Google is issuing a managed SSL certificate. This can take 15–60 minutes after DNS verification completes. ICE will poll automatically and mark it live when ready.',
  check: async (ctx) => {
    const certName = ctx.providerId; // stable name from the mapping table
    if (!certName) return { status: 'unknown', message: 'Cert not yet deployed.', lastCheckedAt: new Date().toISOString() };
    const cert = await fetchSslCertificate(ctx.gcpProject!, certName, ctx.org.id);
    const status = cert.managed?.status || 'UNKNOWN';
    if (status === 'ACTIVE') {
      return { status: 'verified', message: 'Certificate is live', lastCheckedAt: new Date().toISOString() };
    }
    if (status === 'FAILED_NOT_VISIBLE') {
      return { status: 'unmet', message: 'DNS not yet pointing at the load balancer — add the A record first.', lastCheckedAt: new Date().toISOString() };
    }
    return { status: 'unmet', message: `Status: ${status}`, lastCheckedAt: new Date().toISOString() };
  },
  verifyPollIntervalMs: 60_000,
  verifyTimeoutMs: 2 * 60 * 60 * 1000,
};
```

`fetchSslCertificate` is a thin wrapper around the Compute REST API. Shares the scoped auth client with the rest of the deploy service.

**Acceptance:**
- After deploy, the requirement shows `Status: PROVISIONING` initially
- Once DNS propagates and Google finishes ACME, status transitions to `ACTIVE`
- Requirement row updates live without requiring a page reload
- Timeout (2h) prevents infinite polling

### Step 8.8 — Deploy panel requirements UI

**Closes:** P8-1
**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx` — new section between the plan preview and the progress section

Add a **Requirements** section that renders the resolved requirements returned from `/api/canvas/deploy/requirements`. The resolver is called on plan success, result cached in the deploy slice.

Structure:

```
┌─ Requirements ─────────────────────────────────┐
│                                                │
│  Before deploy                                 │
│  ⚠ Attach GitHub repository                    │
│     Blocks: Cloud Run                          │
│     [Attach repository]                        │
│                                                │
│  ✓ Verify domain ownership: mysite.com         │
│     Verified via Search Console 2 min ago      │
│                                                │
│  Post-deploy                                   │
│  ◐ DNS A record for mysite.com                 │
│     Currently resolves to 5.5.5.5, expected    │
│     34.102.56.91                               │
│     [Copy record]  [Verify now]                │
│                                                │
│  ◐ Managed SSL certificate                     │
│     Status: PROVISIONING · last checked 30s    │
│                                                │
└────────────────────────────────────────────────┘
```

Components:
- `RequirementsSection` — top-level container, groups by timing (before-deploy, post-deploy)
- `RequirementRow` — icon, title, description, status message, timestamp
- `RequirementActionButton` — renders based on action.type (copy-dns-record shows a one-click copy, attach-repo opens the repo picker, etc.)

Blocking requirements with status `unmet` disable the Apply button. Non-blocking requirements render but don't gate deploy.

Reuse the Phase 5 tooltip pattern: if Apply is disabled because of a blocking requirement, the tooltip points at the specific row the user needs to fix.

**Acceptance:**
- Plan with a CustomDomain block and unset GitHub repo shows both requirements
- Apply button disabled until repo attached
- Copy action copies the expected record to clipboard as plain text
- Verify action triggers a fresh resolver call for that requirement only
- Verified requirements render green and can be collapsed

### Step 8.9 — Block properties panel requirements view

**Closes:** P8-1, P8-5
**File:** `packages/ui/src/features/properties/components/properties-panel.tsx`

When a user clicks a block, the properties panel currently shows generic fields (name, provider, etc.) derived from the resource schema. Add a dedicated **Requirements** section at the bottom of the panel for blocks that have at least one resolved requirement.

This is where the DNS record card lives persistently — even after closing the deploy panel, a user who clicks their CustomDomain block sees the DNS record they need to add, the verification status, and the cert issuance state.

Also extend the generic property editor to expose the new `enableHttps`, `autoProvisionCert`, and `redirectHttpToHttps` toggles on the CustomDomain block. These need entries in `packages/core/src/resources/high-level-resources.ts` under the networking category so the schema-driven properties panel picks them up automatically.

**Acceptance:**
- Clicking a CustomDomain block shows its requirements
- Toggling `enableHttps` or `autoProvisionCert` updates the block data and reflects in the next plan
- Requirements status survives page reload (backed by `BlockRequirementStatus`)

### Step 8.10 — DNS record display component

**Closes:** P8-1
**File:** New `packages/ui/src/features/deploy/components/dns-record-card.tsx`

Shared component rendered by both the requirements UI and the block properties panel. Displays a DNS record with:

- Labelled fields: Type, Name, Value, TTL
- One-click "Copy value" and "Copy all" buttons
- Optional "Verify now" button that calls the resolver endpoint for the specific requirement
- Status indicator (pending / checking / verified / expired)
- Last-checked timestamp

Rendered like a small card with monospace values so they're easy to read.

**Acceptance:**
- Values render in monospace
- Copy buttons work in both HTTP and HTTPS contexts (uses `navigator.clipboard` with fallback)
- Keyboard accessible (tab, Enter to copy)

### Step 8.11 — Background polling worker

**Closes:** P8-9, completes Phase 4's deferred poller
**File:** New `services/deploy/src/services/requirement-poller.service.ts`, registered in `services/deploy/src/index.ts`

A single in-process interval that scans `block_requirement_status` for post-deploy requirements in `unmet` or `checking` state whose `last_checked_at` is older than the requirement's `verifyPollIntervalMs`. For each stale row, re-run the requirement's `check` and upsert the result.

Scope limit: max 10 concurrent checks at once, and respect each requirement's `verifyTimeoutMs` as a hard cap.

Runs every 30 seconds. Cheap and bounded — the only API calls are DNS lookups and GCP cert GET requests, both of which are idempotent and quota-friendly.

When a row flips to `verified`, the poller emits a socket event `requirement_verified` which the frontend uses to update the UI without a full refetch.

**Acceptance:**
- DNS record added at registrar → poller notices within 60s → requirement flips to verified → UI updates live
- Expired requirements stop being polled
- Poller survives gateway restarts (state lives in DB)

### Step 8.12 — Updated static site template

**Closes:** P8-8
**File:** `packages/templates/src/quick-starts.ts`

Update `quickStartStaticSite` to include a CustomDomain block and explicit edges:

```ts
blocks: [
  { iceType: 'Network.Internet', position: { x: 100, y: 200 } },
  { iceType: 'Compute.StaticSite', position: { x: 380, y: 200 }, data: { framework: 'react' } },
  {
    iceType: 'Network.CustomDomain',
    position: { x: 380, y: 360 },
    data: { domain: '', enableHttps: true, autoProvisionCert: true },
  },
],
connections: [
  { fromBlock: 0, toBlock: 1, relationship: 'connects_to' },      // Internet → StaticSite
  { fromBlock: 2, toBlock: 1, relationship: 'attached_to' },      // CustomDomain → StaticSite
],
```

The empty `domain: ''` forces users to fill it in before deploy — the GitHub repo requirement pattern from Phase 4 rejects empty strings, so the CustomDomain requirements will block deploy with a clear "Enter a domain" message.

Also add a new `quickStartStaticSiteHttpsReady` template for users who want the pre-configured flow with a placeholder domain they edit before deploying.

**Acceptance:**
- Default template creates a 3-block canvas
- Empty domain blocks Apply with a clear message
- Filling in the domain clears the block and enables Plan
- Template compiles to the expected resource graph (cert + backend bucket + url map + target proxy + forwarding rule + bucket)

### Step 8.13 — Google Site Verification service

**Closes:** P8-4 (support code)
**File:** New `services/deploy/src/services/google-verification.service.ts`

Thin wrapper around the Google Site Verification API. Exports:

```ts
export async function generateVerificationToken(orgId: string, domain: string): Promise<string>;
export async function checkSearchConsoleVerification(orgId: string, domain: string): Promise<boolean>;
```

`generateVerificationToken` calls `POST /siteVerification/v1/token` with `{ verificationMethod: 'DNS_TXT', site: { type: 'INET_DOMAIN', identifier: domain } }`. Returns the token value that has to be in the TXT record.

`checkSearchConsoleVerification` calls `POST /siteVerification/v1/webResource/{siteId}` to mark the site as verified. Returns true if the API returns 200. Caches results per (org, domain) for 5 minutes so rapid re-polls don't hit the quota.

Both functions authenticate using the org's stored GCP credentials (same path as the deploy service uses for cert operations).

**Acceptance:**
- Token generation works end-to-end against a real GCP project
- Verification call succeeds once the TXT record is live
- Cache reduces redundant API calls

### Step 8.14 — Resource schema for CustomDomain properties

**Closes:** P8-5
**File:** `packages/core/src/resources/high-level-resources.ts`

Add a new resource entry under the networking category:

```ts
{
  id: 'network-custom-domain',
  label: 'Custom Domain',
  iceType: 'Network.CustomDomain',
  category: 'Network',
  properties: [
    { key: 'domain', label: 'Domain', type: 'string', required: true, placeholder: 'app.example.com' },
    { key: 'enableHttps', label: 'Enable HTTPS', type: 'boolean', defaultValue: true },
    { key: 'autoProvisionCert', label: 'Auto-provision SSL cert', type: 'boolean', defaultValue: true },
    { key: 'sslCertificateId', label: 'Existing cert ID (advanced)', type: 'string', required: false },
    { key: 'redirectHttpToHttps', label: 'Redirect HTTP → HTTPS', type: 'boolean', defaultValue: true },
  ],
}
```

The generic schema-driven properties panel automatically picks these up and renders them with appropriate controls (text input, checkbox).

**Acceptance:**
- Selecting a CustomDomain block shows a form with all fields
- Toggling `autoProvisionCert` off reveals the `sslCertificateId` field
- Validation: domain must be a valid DNS name

### Step 8.15 — End-to-end acceptance

Run through the full flow on a real domain:

1. Create a new project from the updated `quickStartStaticSite` template
2. Click the CustomDomain block, enter a real domain you own (e.g. a test subdomain)
3. Click Plan — preflight section shows: "Verify domain ownership" (unmet, with TXT record), "DNS A record" (unknown — waits for deploy), "Managed SSL certificate" (unknown — waits for deploy)
4. Add the TXT record at your registrar
5. Click "Verify now" on the domain verification row; within 60s it flips to verified
6. Click Apply — plan executes: bucket → backend bucket → url map → managed cert → target HTTPS proxy → forwarding rule, with optional HTTP redirect rule
7. Once the forwarding rule is created, the DNS A record requirement updates with the IP and shows the exact record to add
8. Add the A record at your registrar
9. Within a minute, the DNS requirement flips to verified
10. Over the next 15–60 minutes, the managed cert progresses from `PROVISIONING` through `ACTIVE`; the block turns green and shows a clickable `https://<domain>` pill
11. Click the pill — browser opens the live site with a valid certificate

## Dependencies and sequencing within the phase

Backend infrastructure first, UI on top:

- **Day 1–2:** Steps 8.1 (blueprint), 8.2 (mapping), 8.3 (managed cert handler), 8.4 (backend bucket + load balancer wiring). Backend-only; deployable via API calls.
- **Day 3:** Steps 8.5 (HTTPS redirect), 8.13 (Google verification service), 8.14 (resource schema). Complete the backend surface.
- **Day 4:** Steps 8.6, 8.7 (new requirements). Both depend on the handlers from day 1–2 being stable.
- **Day 5:** Step 8.11 (background poller). Depends on the requirements existing.
- **Day 6–7:** Steps 8.8, 8.9, 8.10 (UI). The big UI sweep — requirements section in deploy panel, properties panel integration, shared DNS record card.
- **Day 8:** Step 8.12 (template update), Step 8.15 (end-to-end test on a real domain). Integration and polish.

A second engineer can pick up Steps 8.8–8.10 in parallel with day 4–5 backend work.

## Risks

**Risk 1: GCP managed cert issuance is slow and non-deterministic.** Propagation + ACME challenge + GCP internal validation can take anywhere from 10 minutes to 2 hours. Users will think ICE is broken if the status sits on `PROVISIONING` for 45 minutes with no explanation. Mitigation: the requirement description and UI state text need to be very clear about this ("This is normal. Google takes up to an hour to issue managed certs after DNS validation.") Include a link to Google's status page.

**Risk 2: Search Console verification API is finicky.** The site verification flow requires the GCP project's service account to have specific IAM roles. First-time users will hit permission errors that are hard to diagnose. Mitigation: turn this into a preflight check in the same requirements framework — "SA has siteverification API access" — with a remediation link pointing at the exact IAM page.

**Risk 3: Backend bucket + url map semantics differ between HTTP and HTTPS.** The current load balancer handler code was written assuming a backend service; switching to a backend bucket for static sites changes the wiring in subtle ways (no health checks, no CDN config by default, etc.). Mitigation: ship Step 8.4 behind a feature flag for the first week, validate on internal projects before the default template change lands.

**Risk 4: DNS propagation race conditions.** The managed cert issuance requirement can flip to `FAILED_NOT_VISIBLE` if the user clicks Deploy before the A record has propagated. Once in that state, the cert object may need to be destroyed and recreated. Mitigation: the requirement's `check` method should distinguish `FAILED_NOT_VISIBLE` from other failures and offer a "Retry cert provisioning" action that deletes and recreates the cert resource without redeploying everything else.

**Risk 5: Removing `Security.Certificate` placeholder block without breaking existing users.** There's an existing `Security.Certificate` block blueprint with no handler. Any project that has it on their canvas will break when the new `Network.CustomDomain` replaces its role. Mitigation: leave the old block in place; add a deprecation warning in its properties panel; don't remove it in this phase.

## Explicit non-goals

- **Automatic DNS provisioning via Cloudflare/Route53.** Documented as deferred in `deferred.md`. The requirements framework accepts this extension without API changes — a future phase adds Cloudflare credentials and swaps the `copy-dns-record` action for `provision-dns-record`.
- **Support for wildcard certs or multi-domain SANs.** Managed certs support up to 100 domains per cert, but the first version of the CustomDomain block is 1 domain per block. Multi-domain is a future enhancement.
- **Pre-provisioned cert import.** The `sslCertificateId` field is exposed but the first version doesn't validate it exists in GCP or surface errors clearly if it doesn't.
- **DNS-01 cert validation via external providers.** Managed certs handle this automatically within GCP. Custom DNS-01 flows (e.g., Cloudflare DNS-01) are out of scope.
- **Renewal alerting.** Managed certs auto-renew, so this is unnecessary. For imported certs, renewal tracking is a separate feature.

## Post-mortem — initial landing

All fifteen steps landed and all touched packages typecheck clean.

**Backend (Steps 8.1–8.5, 8.11, 8.13)**

- `packages/blocks/src/common/networking/custom-domain.ts` — new `Network.CustomDomain` blueprint with domain/enableHttps/autoProvisionCert/sslCertificateId/redirectHttpToHttps fields, registered in `packages/blocks/src/index.ts`. The existing `Network.Domain` block is left in place for Cloud Run domain mapping.
- `packages/core/src/resources/high-level-resources.ts` — added `custom-domain` resource entry under the Networking category with the full property schema (5 properties) so the generic schema-driven properties panel renders the CustomDomain configuration form automatically.
- `packages/core/src/deploy/card-translator.ts` — added `Network.CustomDomain` → `gcp.compute.managedSslCertificate` mapping, plus two new property extractors (`extract_custom_domain_properties` and `extract_backend_bucket_properties`). Most importantly, added a new **pass 1.5** semantic wiring loop between node creation and edge creation that: (a) detects Internet↔StaticSite edges and synthesizes a `gcp.compute.backendBucket` node pointing at the static site's storage bucket, wiring its name into the forwarding rule's properties; (b) detects CustomDomain↔StaticSite/Internet edges and wires the managed SSL cert name, protocol='HTTPS', port='443', redirect_http flag, and domain onto the forwarding rule. The synthesized backend bucket gets its own deployable entry so it appears in plan output and has a stable resource mapping.
- `packages/core/src/deploy/providers/gcp/handlers/managed-ssl-certificate.ts` — new handler. Create posts to `sslCertificates` with `type: MANAGED, managed: { domains }`, waits for the compute op, fetches the cert to capture initial status, returns `{ provider_id, outputs: { managed, domains, status, domain_statuses } }`. Doesn't block on ACTIVE status — that's polled post-deploy. Update is no-op (managed certs are replace-only). Delete handles NOT_FOUND gracefully. Describe returns normalized properties for drift detection.
- `packages/core/src/deploy/providers/gcp/handlers/backend-bucket.ts` — new handler. Create posts to `backendBuckets` with `bucketName` + `enableCdn`, handles ALREADY_EXISTS idempotently, Describe for drift.
- `packages/core/src/deploy/providers/gcp/gcp-deployer.ts` — registered both new handlers in the HANDLER_REGISTRY. Order matters: `gcp.compute.managedSslCertificate` and `gcp.compute.backendBucket` precede the generic `gcp.compute.` catch-all so prefix matching picks the specific handlers first.
- `packages/core/src/deploy/providers/gcp/handlers/load-balancer.ts` — significantly rewritten. The create method now reads `backend_bucket_name`, `ssl_certificate_name`, `redirect_http`, and `domain` from properties. When `backend_bucket_name` is set, the URL map points at the backend bucket directly (closing the "empty backend service → 404" gap). When `ssl_certificate_name` is set, the target proxy is `targetHttpsProxies` with `sslCertificates: [cert]` and the forwarding rule listens on 443. When `redirect_http` is also true, a second URL map + target HTTP proxy + port-80 forwarding rule is created to redirect HTTP→HTTPS via `defaultUrlRedirect`. Outputs prefer the custom domain URL (`https://mysite.com`) over the raw IP so block pills show friendly URLs.
- `services/deploy/src/services/google-verification.service.ts` — new. Wraps the Google Site Verification API (`/siteVerification/v1/token` and `/webResource`) with org-scoped credential resolution, 5-minute in-memory caching per (org, domain), and a `fetchSslCertificateStatus` helper used by the managed cert requirement poller.
- `services/deploy/src/services/requirement-poller.service.ts` — new background interval (30s) that scans `block_requirement_status` for post-deploy requirements whose `last_checked_at` is older than their `verifyPollIntervalMs`. Processes up to 10 at a time in parallel, respects `verifyTimeoutMs` as a hard stop, looks up the card's org via the project, loads the resource mapping, re-runs `def.check` with injected capabilities, persists the new status, and emits a `requirement_verified` socket event on state transitions. Registered in `services/deploy/src/index.ts` and started from `apps/gateway/src/index.ts` alongside the cron jobs.
- `services/deploy/src/services/requirements.service.ts` — extended to inject runtime capabilities (`googleVerifier`, `certStatusChecker`, `verificationTokens`, `certResourceName`) onto the `RequirementContext` so block-layer definitions stay free of backend-only imports. Pre-fetches verification tokens for every CustomDomain block in parallel before running the check so the DNS record card can show the TXT value immediately.

**Requirement definitions (Steps 8.6, 8.7)**

- `packages/blocks/src/requirements/definitions/domain-verification.ts` — new. Before-deploy, non-blocking. Applies to CustomDomain blocks with a non-empty domain and autoProvisionCert on. `check` reads `ctx.googleVerifier` and calls `checkVerification(orgId, domain)`. `action` emits a `copy-dns-record` of type TXT using the pre-fetched token. Polls every 60s with a 24h timeout.
- `packages/blocks/src/requirements/definitions/managed-cert-issuance.ts` — new. Post-deploy, non-blocking. Applies to the same CustomDomain blocks. `check` reads `ctx.certStatusChecker` and `ctx.certResourceName`, calls `fetchStatus(orgId, gcpProject, certName)`, translates statuses (`ACTIVE` → verified; `FAILED_NOT_VISIBLE` → unmet with a clear "check your DNS" message; `FAILED_CAA_*` → unmet with a CAA-specific message; everything else → unmet with `Status: X` plus encouragement). Polls every 60s with a 2h timeout.
- `packages/blocks/src/requirements/index.ts` — both new requirements exported and added to `BUILT_IN_REQUIREMENTS`.

**UI (Steps 8.8–8.10, 8.14)**

- `packages/ui/src/shared/api/api-adapter.ts` and `http-api-adapter.ts` — added `deploy.requirements(cardId, nodes, options)` method hitting `POST /canvas/deploy/requirements`.
- `packages/ui/src/store/slices/deploy-slice.ts` — added `requirements: ResolvedRequirementState[]`, `requirementsLoading`, `requirementsFetchedAt` to state, plus four new reducers: `startRequirementsFetch`, `setRequirements`, `updateRequirement`, `clearRequirements`.
- `packages/ui/src/features/deploy/components/dns-record-card.tsx` — new shared component. Renders a DNS record with labelled type/name/value/TTL in monospace, per-field click-to-copy, a "Copy record" button that copies the whole record, an optional "Verify now" button that triggers the resolver for that specific requirement, and a status chip (`unknown`/`checking`/`unmet`/`met`/`verified`/`expired`) with appropriate icons and colors. Includes a "time ago" helper and a "How to add" external link.
- `packages/ui/src/features/deploy/components/requirements-section.tsx` — new. Renders the resolved requirements grouped by timing (Before deploy, Post-deploy). Each row shows status icon, title, blocking/satisfied chip, description, message, and the action. When the action is `copy-dns-record` it embeds a `DnsRecordCard` directly. Header shows a count of blocking items and uses the amber warning icon when any blocker is unmet.
- `packages/ui/src/features/deploy/components/deploy-panel.tsx` — imports the new `RequirementsSection`, renders it above the plan preview when requirements are loaded or loading. Adds a `fetchRequirements` callback that's invoked on plan success (in parallel with rendering the plan) and from the socket handler when a `requirement_verified` event arrives. Adds a `handleVerifyRequirement` callback that re-runs the full resolver. Extends the Apply button's disabled state with a blocking-requirement check — if any `blocking: true && status !== verified/met`, Apply is disabled and the tooltip lists the blockers.

**Template (Step 8.12)**

- `packages/templates/src/quick-starts.ts` — `quickStartStaticSite` now includes three blocks: `Network.Internet`, `Compute.StaticSite` (cleaned up the `domain: 'mysite.com'` default since the CustomDomain block handles domains now), and `Network.CustomDomain` with an empty `domain` field. Two connections: Internet↔StaticSite and CustomDomain↔StaticSite. Description updated to "CDN-backed static site with managed SSL — the simplest HTTPS-ready deploy." Tag list gains "HTTPS."

**What's deferred**

- **Preflight requirements UI for billing/IAM/quota** (Step 4.10 in the Phase 4 doc) — the backend resolver doesn't define these as requirements yet; they're still handled by the Phase 3 auto-enable flow and the direct `autoEnableGCPApis` call in deploy.service.ts. Could migrate into the same framework in a follow-up.
- **Block properties panel requirements view** (Step 8.9 partial) — the deploy panel surfacing is done. The per-block properties panel integration (so users see DNS instructions when they click the block, even when the deploy panel is closed) is still pending. The DnsRecordCard component is already shared so plumbing it into the properties panel is just wiring.
- **Retry cert provisioning action** (Risk 4 mitigation) — the requirement check detects `FAILED_NOT_VISIBLE` and tells the user to check DNS, but doesn't yet offer a "Retry cert provisioning" button that would destroy and recreate the cert resource without redeploying. Users currently have to redeploy to recover from that state.

**Verification summary**

- `@ice/blocks` typecheck: clean
- `@ice/core` typecheck: no new errors (pre-existing unrelated errors in `graph/classifier` and `schema/embedded-schema-provider`)
- `@ice/service-deploy` typecheck: no new errors in touched files (pre-existing unrelated errors in `webhooks.ts` and `queue.service.ts`)
- `@ice/web` typecheck: no new errors in touched files (same pre-existing `deploy-panel.tsx` narrowing error on line 537 that was there before Phase 8 started)

**Next-run acceptance test (Step 8.15)**

Restart `pnpm dev:all` so core and the deploy service pick up the new handlers + poller. Create a new project from the updated `quickStartStaticSite` template. Click the CustomDomain block and enter a real domain you own. Click Plan — the preflight Requirements section should show the domain verification and DNS A record cards (the DNS card will say "unknown" until after deploy). Add the TXT record at your registrar, click Verify, watch the card flip to verified within 60 seconds. Click Deploy — you should see the full resource graph provision (static site bucket, backend bucket, URL map, managed SSL cert, target HTTPS proxy, forwarding rule, optional HTTP redirect rule). After deploy the DNS A record requirement updates with the forwarding rule IP and shows the record to add. Add the A record, wait ~60 seconds for the poller to catch propagation, watch the managed-cert-issuance requirement cycle through `PROVISIONING` → `ACTIVE` over the next 15–60 minutes. The CustomDomain block should turn green with a clickable `https://<domain>` pill.

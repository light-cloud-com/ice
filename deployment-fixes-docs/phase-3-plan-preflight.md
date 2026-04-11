# Phase 3 — Plan Quality & Preflight

**Effort:** 2–3 engineer-days
**Dependencies:** Phase 1 (stable identity + partial-success state)
**Issues addressed:** P3-1 through P3-13

## Overview

Phase 3 makes the plan step meaningful and catches errors before the deploy starts hitting GCP. Today's plan is a resource count, the apply is a hope-and-pray, and errors surface 45 seconds into the deploy. After this phase, the plan shows real property diffs, the preflight catches billing/IAM/quota/naming problems upfront, the plan you reviewed is the plan that runs, and transient GCP errors auto-retry.

## Steps

### Step 3.1 — Plan-id binding between plan and apply

**Closes:** P3-2
**Files:** `services/deploy/src/services/deploy.service.ts`, `packages/ui/src/features/deploy/components/deploy-panel.tsx`, `packages/db/prisma/schema.prisma`

Currently `planDeployment` computes a plan and returns a deploymentId, but `applyDeployment` re-translates from the nodes the frontend sends. The user could review one plan and apply a different one (e.g. by editing the canvas in between).

Change `planDeployment` to persist the *full translation* (not just counts) in `canvasDeployment.plan` JSON. Add a `plan_id` field returned from the plan call. `applyDeployment` then accepts a `plan_id` and loads that exact translation instead of re-translating.

Frontend: store `plan_id` in the deploy slice when the plan succeeds. Apply sends `plan_id` instead of re-sending nodes/edges. If the canvas changes between plan and apply, the plan becomes stale and the UI shows "Plan is out of date, click Plan again."

**Acceptance:**
- Plan stores the full translation object
- Apply with a valid plan_id uses the stored translation
- Canvas edit between plan and apply invalidates the plan

### Step 3.2 — Per-property plan diffs

**Closes:** P3-1
**Files:** `packages/core/src/deploy/diff-engine.ts` (new), `services/deploy/src/services/deploy.service.ts`, `packages/ui/src/features/deploy/components/deploy-panel.tsx:847`

Build a property-level diff between `desired` and `current` graphs. For each update action, emit a list of changed fields:

```ts
interface ResourceChange {
  action: 'create' | 'update' | 'delete' | 'replace';
  name: string;
  type: string;
  source_node_id?: string;
  property_diff?: Array<{ path: string; before: unknown; after: unknown }>;
  requires_replacement?: boolean;  // true if the change forces destroy+recreate
  replacement_reason?: string;
}
```

A change to a property that requires replacement (bucket location, instance type, etc.) should set `requires_replacement: true` and downgrade the action to `'replace'`. The user sees a clear warning in the preview: "This update will DESTROY and RECREATE the resource."

UI: expand the plan preview rows to show property-level diffs when clicked. Use a diff-style display (- red for before, + green for after).

**Acceptance:**
- Changing a bucket's storage class shows "storage_class: STANDARD → NEARLINE" in the plan
- Changing a bucket's location shows a replace warning
- No-op replans show 0 changes

### Step 3.3 — Preflight check framework

**Closes:** P3-3, P3-4, P3-5, P3-6, P3-7
**File:** New `services/deploy/src/services/preflight.service.ts`

Define a preflight check interface:

```ts
export interface PreflightCheck {
  id: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  run: (ctx: PreflightContext) => Promise<PreflightResult>;
}

export interface PreflightResult {
  passed: boolean;
  message: string;
  remediation?: string;
  details?: unknown;
}
```

Register built-in checks:

1. **Billing account linked** — HEAD the billing API
2. **Required APIs enabled** — already exists as auto-enable; also surface as preflight
3. **SA has serviceUsageAdmin** — IAM testIamPermissions
4. **SA has compute.networkAdmin if using LB** — conditional on resource types
5. **Bucket name availability** — HEAD the bucket globally
6. **Region supports resource type** — static lookup table
7. **Quota for resource type** — query quotas endpoint
8. **Organization policy doesn't block resource type** — query orgpolicy

Run all checks in parallel on plan. Return aggregated results attached to the plan response.

**Acceptance:**
- Plan with a bad SA key returns "SA lacks serviceUsageAdmin" preflight error
- Plan with unlinked billing returns "Billing account not linked" with remediation link
- Plan with a globally-taken bucket name returns "Bucket name collision" error
- All checks run in parallel; total overhead < 3 seconds for a clean plan

### Step 3.4 — Preflight UI surface

**Closes:** P3-3
**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx`

Add a "Preflight" section above the plan preview. Errors block the Apply button; warnings show but don't block. Each item has:

- Icon (red/amber/blue)
- Title
- One-line description
- Expandable "Why this matters" + "How to fix"
- Optional "Fix it" button for auto-fixable issues (e.g., API not enabled, which already has auto-enable)

Hide the preflight section entirely when all checks pass.

**Acceptance:**
- Errors block Apply button with an inline explanation (no more silent disable)
- Warnings render but don't block
- Fixed issues disappear when re-planned

### Step 3.5 — Retry wrapper for transient GCP errors

**Closes:** P3-8
**File:** New `packages/core/src/deploy/providers/gcp/retry.ts`

Wrap every GCP API call in a retry helper:

```ts
export async function withRetry<T>(
  op: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number; retryable?: (err: any) => boolean } = {},
): Promise<T> {
  const { maxAttempts = 5, baseDelayMs = 500 } = opts;
  const retryable = opts.retryable ?? defaultRetryable;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (attempt === maxAttempts || !retryable(err)) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.random() * 200;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('unreachable');
}

function defaultRetryable(err: any): boolean {
  const code = err?.code || err?.status || err?.response?.status;
  // Retry on 429, 500, 502, 503, 504, ECONNRESET, ETIMEDOUT
  return code === 429 || (code >= 500 && code < 600) ||
    err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT';
}
```

Apply in `rest_client.post/get/delete/patch` at the wrapper level, not per-handler. All handlers transparently get retries.

**Acceptance:**
- Inject a 503 on the first call, verify the second call succeeds
- 4xx errors (other than 429) don't retry
- Max attempts respected

### Step 3.6 — Error-to-remediation translation

**Closes:** P3-9, P3-10
**File:** New `packages/ui/src/features/deploy/error-remediation.ts` (shared with e2e test dashboard error classifier)

Build a mapping from GCP error codes/patterns to user-friendly messages + remediation links:

```ts
interface RemediationEntry {
  pattern: RegExp | string;
  title: string;
  explanation: string;
  actions: Array<{ label: string; href?: string; onClick?: 'retry' | 'authenticate' | 'openConfig' }>;
}

const REMEDIATIONS: RemediationEntry[] = [
  {
    pattern: /billing account/i,
    title: 'Billing not enabled',
    explanation: 'This GCP project does not have an active billing account...',
    actions: [
      { label: 'Open billing console', href: 'https://console.cloud.google.com/billing' },
      { label: 'Retry deploy', onClick: 'retry' },
    ],
  },
  {
    pattern: /PERMISSION_DENIED|Resource not accessible/i,
    title: 'Permission denied',
    explanation: 'The service account lacks required permissions...',
    actions: [
      { label: 'View required roles', href: 'internal://docs/iam' },
      { label: 'Re-authenticate', onClick: 'authenticate' },
    ],
  },
  // ... many more
];

export function classify(error: string): RemediationEntry | null { /* ... */ }
```

Use the classifier in `ApiErrorBanner` and in per-resource error rows. Raw error still copyable via "Show details."

Also make per-resource errors copyable (add a copy button on each row) and remove the `max-w-[500px]` truncation in favor of `break-word` wrapping.

**Acceptance:**
- PERMISSION_DENIED shows user-friendly title + remediation link
- QUOTA_EXCEEDED shows quota increase link
- Unknown errors still show raw message (fallback)
- Copy button works on each error row

### Step 3.7 — Raise deploy route timeout

**Closes:** P3-11
**File:** `services/deploy/src/routes/canvas-deploy.ts:31-32`

10 minutes is shorter than legitimate GCP operations. Raise to 30 minutes for apply and destroy routes. Plan stays at 60s (plan is fast, a long plan is a bug).

Better than raising the timeout: move the long-running work to a background job (Phase 6 covers this more fully) so the HTTP response returns fast and progress streams over sockets. For this phase, just raise the timeout.

**Acceptance:**
- Cloud SQL deploy completes without HTTP timeout
- Plan responds within 60s

### Step 3.8 — Validate SA key shape before use

**Closes:** P3-12
**File:** `services/deploy/src/services/deploy.service.ts:240-267`

After parsing the SA key, validate it has required fields:

```ts
function validateSaKey(parsed: any): void {
  const required = ['project_id', 'private_key', 'client_email', 'type'];
  const missing = required.filter(k => !parsed[k]);
  if (missing.length) {
    throw new Error(`Service account key is missing required fields: ${missing.join(', ')}`);
  }
  if (parsed.type !== 'service_account') {
    throw new Error(`Expected service_account key, got type='${parsed.type}'`);
  }
}
```

**Acceptance:**
- Empty or malformed SA key produces clear error
- Valid key passes through unchanged

### Step 3.9 — Plan/result schema version tags

**Closes:** P3-13 (partial — full work in Phase 6)
**Files:** `services/deploy/src/services/deploy.service.ts`

Add a version field to every plan and result object we write:

```ts
const plan = {
  _schema_version: 1,
  creates: [...],
  // ...
};
```

Not a full schema migration — just tag every new write so that old readers can discriminate. Phase 6 Step 6.3 builds on this by adding proper version-aware deserializers.

**Acceptance:**
- New plans and results have `_schema_version: 1`
- Old rows without the field still readable

## Cross-cutting acceptance

1. Plan a card with a good setup. Preflight shows all green. Plan preview shows resources to create.
2. Break the SA key (remove `serviceUsageAdmin`). Plan again. Preflight shows red error. Apply button disabled with clear reason.
3. Fix the SA, make a property change on an existing resource. Plan shows property diff. Apply executes the update.
4. Change a bucket location (replacement-required). Plan shows "this will DESTROY and RECREATE."
5. Kill the GCP endpoint mid-deploy (return 503 from a mock). Verify retries, then succeed on retry.
6. Trigger a PERMISSION_DENIED. UI shows user-friendly title, not raw error.

## Risks

**Risk 1: Preflight checks add latency to every plan.** Mitigation: run checks in parallel; cache results with 5-minute TTL; allow bypass with `?skip_preflight=true` for dev.

**Risk 2: Retry masks real problems.** Mitigation: retry only well-defined transient codes; log every retry with full context so users can see why a deploy took 3 attempts.

**Risk 3: Plan-id binding breaks existing clients if they call apply without first calling plan.** Mitigation: accept both shapes — if no plan_id, fall back to the current re-translate path with a deprecation warning logged.

## Post-mortem

_TBD_

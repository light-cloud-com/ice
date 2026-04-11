# Phase 4 — Block Requirements Framework

**Effort:** 3–4 engineer-days
**Dependencies:** Phase 1 (stable identity for binding requirements to specific resources), Phase 2 (block UI for rendering requirement status)
**Issues addressed:** P4-1 through P4-8

## Overview

Phase 4 introduces a first-class concept: **every block has a list of requirements that the user must satisfy outside of ICE** (DNS records, GitHub repo access, OAuth apps, billing). Each requirement has a check, a status, and an action. The deploy panel surfaces unmet requirements before Apply, and the block UI surfaces post-deploy requirements (like "add this DNS record") after Apply.

This is the extensible framework that turns "my deploy failed with a cryptic error" into "here are the three things you need to do to make this work."

## Concept

A requirement definition is declared on the block blueprint. At plan time, ICE resolves the definitions into concrete requirements for each instance of that block and runs their checks. The UI renders the results as a checklist in the block properties panel and in the deploy panel's preflight section.

Requirements come in two timing flavors:

- **Before-deploy** — must be satisfied before the block can be applied. Example: GitHub repo attached and accessible.
- **Post-deploy** — must be satisfied after the block is applied; often uses outputs from the deployed resource. Example: "add this A record pointing to `34.102.56.91`".

Each requirement has a status: `unknown`, `checking`, `unmet`, `met`, `verified`, or `expired`.

## Steps

### Step 4.1 — Requirement type system

**Closes:** P4-1 through P4-8 (infrastructure)
**File:** New `packages/blocks/src/requirements/types.ts`

```ts
export type RequirementTiming = 'before-deploy' | 'post-deploy';
export type RequirementStatus = 'unknown' | 'checking' | 'unmet' | 'met' | 'verified' | 'expired';

export interface RequirementContext {
  block: { id: string; data: Record<string, unknown>; deploy_status?: string };
  deployedOutputs?: Record<string, unknown>;
  providerId?: string;
  environment: string;
  gcpProject?: string;
  org: { id: string };
  signal?: AbortSignal;
}

export interface RequirementCheckResult {
  status: RequirementStatus;
  message?: string;
  details?: unknown;
  lastCheckedAt: string;
}

export interface RequirementAction {
  type: 'copy-dns-record' | 'attach-repo' | 'open-url' | 'install-github-app' | 'custom';
  label: string;
  // Variable shape per action type
  payload?: unknown;
}

export interface RequirementDefinition<Data = unknown> {
  id: string;
  scope: 'block' | 'card' | 'global';
  timing: RequirementTiming;
  blocking: boolean;
  /** Does this requirement apply to this specific block given its current data? */
  applies: (ctx: RequirementContext) => boolean;
  /** Human-readable title — can depend on block data. */
  title: (ctx: RequirementContext) => string;
  /** Longer explanation. */
  description?: (ctx: RequirementContext) => string;
  /** The actual check that determines status. */
  check: (ctx: RequirementContext) => Promise<RequirementCheckResult>;
  /** What the user should do to satisfy it. */
  action?: (ctx: RequirementContext) => RequirementAction | null;
  /** For post-deploy requirements that poll for verification. */
  verifyPollIntervalMs?: number;
  verifyTimeoutMs?: number;
}
```

**Acceptance:**
- Type compiles with strict mode
- Can import from both the backend (for running checks) and frontend (for rendering)

### Step 4.2 — Block blueprint integration

**Closes:** P4-1 through P4-8
**File:** `packages/blocks/src/types.ts` (or wherever `BlockBlueprint` lives), every block blueprint

Add `requirements?: RequirementDefinition[]` to `BlockBlueprint`. Each blueprint can declare its requirements inline:

```ts
export const gcpStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  iceType: 'Compute.StaticSite',
  // ...existing fields
  requirements: [
    githubRepoAttachedRequirement,
    dnsARecordRequirement,
  ],
});
```

Shared requirement definitions live in `packages/blocks/src/requirements/definitions/` so multiple block types can reference the same ones.

**Acceptance:**
- `BlockBlueprint` interface accepts `requirements` field
- Existing blueprints still compile without the field

### Step 4.3 — Requirement resolver service

**Closes:** P4-1 through P4-8
**File:** New `services/deploy/src/services/requirements.service.ts`

The resolver walks the canvas nodes, finds their blueprints, filters the `applies` requirements, runs the `check`s in parallel, and returns the aggregate:

```ts
export async function resolveRequirements(args: {
  cardId: string;
  environment: string;
  nodes: CanvasNode[];
  orgId: string;
  gcpProject?: string;
}): Promise<Record<string, Array<{ definition: RequirementDefinition; result: RequirementCheckResult }>>>;
```

Returns a map from node id to the list of that node's requirements + current status. Runs all checks with a shared AbortSignal to bound total preflight time to 10 seconds.

**Acceptance:**
- Unit test: two nodes with different requirement sets are resolved independently
- Checks run in parallel (measured vs. serial baseline)
- Resolver doesn't throw on check failure — it records an `'unmet'` result with the error message

### Step 4.4 — Persistence for requirement status

**Closes:** P4-7 (verification persistence)
**File:** `packages/db/prisma/schema.prisma`

Add a new model for post-deploy requirements whose status needs to survive page reloads:

```prisma
model BlockRequirementStatus {
  id                String   @id @default(cuid())
  card_id           String
  node_id           String
  environment       String
  requirement_id    String
  status            String   // RequirementStatus
  message           String?
  last_checked_at   DateTime @default(now())
  verified_at       DateTime?
  details           Json?

  @@unique([card_id, node_id, environment, requirement_id])
  @@index([card_id, environment])
  @@map("block_requirement_status")
}
```

Before-deploy requirements are transient (re-checked on every plan). Post-deploy requirements persist because they reflect external state that can change independently.

**Acceptance:**
- Migration applies cleanly
- Upsert works on the unique key
- Cleanup on card deletion (add cascade in Phase 6)

### Step 4.5 — GitHub repo requirement

**Closes:** P4-1, P4-2
**File:** New `packages/blocks/src/requirements/definitions/github-repo.ts`

```ts
export const githubRepoAttachedRequirement: RequirementDefinition = {
  id: 'github-repo-attached',
  scope: 'block',
  timing: 'before-deploy',
  blocking: true,
  applies: (ctx) => {
    const iceType = ctx.block.data?.iceType as string;
    return ['Compute.StaticSite', 'Compute.SSRSite', 'Compute.Container', 'Compute.BackendAPI']
      .includes(iceType);
  },
  title: () => 'Attach a source repository',
  description: () => 'This block needs source code. Connect a GitHub repository so ICE can build and deploy it.',
  check: async (ctx) => {
    const source = ctx.block.data?.source as { repo?: string; branch?: string } | undefined;
    if (!source?.repo) {
      return { status: 'unmet', message: 'No repository selected.', lastCheckedAt: new Date().toISOString() };
    }
    // Via the GitHub client:
    const access = await checkRepoAccess(ctx.org.id, source.repo, source.branch || 'main');
    if (access.status === 'not_installed') {
      return { status: 'unmet', message: 'ICE GitHub App is not installed on this repo.', lastCheckedAt: new Date().toISOString() };
    }
    if (access.status === 'not_accessible') {
      return { status: 'unmet', message: 'ICE cannot read this repo. Check permissions.', lastCheckedAt: new Date().toISOString() };
    }
    return { status: 'met', message: `Using ${source.repo}@${source.branch || 'main'}`, lastCheckedAt: new Date().toISOString() };
  },
  action: (ctx) => {
    const source = ctx.block.data?.source as any;
    if (!source?.repo) {
      return { type: 'attach-repo', label: 'Attach repository', payload: { blockId: ctx.block.id } };
    }
    return { type: 'install-github-app', label: 'Install GitHub App', payload: { repo: source.repo } };
  },
};
```

The `checkRepoAccess` helper reuses the existing GitHub integration. If the GitHub app isn't installed on the org, the action surfaces an install link.

**Acceptance:**
- Block with no repo → requirement unmet, Apply disabled with clear message
- Block with repo but ICE app not installed → requirement unmet, install link shown
- Block with valid repo → requirement met
- Requirement status updates when user attaches a repo

### Step 4.6 — DNS A record requirement (post-deploy)

**Closes:** P4-3
**File:** New `packages/blocks/src/requirements/definitions/dns-a-record.ts`

```ts
export const dnsARecordRequirement: RequirementDefinition = {
  id: 'dns-a-record',
  scope: 'block',
  timing: 'post-deploy',
  blocking: false,
  applies: (ctx) => {
    const domain = ctx.block.data?.domain as string | undefined;
    return Boolean(domain) && domain !== 'example.com';
  },
  title: (ctx) => `Add A record for ${ctx.block.data?.domain}`,
  description: (ctx) => `Your site will be reachable at https://${ctx.block.data?.domain} once this DNS record is live.`,
  check: async (ctx) => {
    const domain = ctx.block.data?.domain as string;
    const expectedIp = ctx.deployedOutputs?.ip_address as string | undefined;
    if (!expectedIp) {
      return { status: 'unknown', message: 'Deployment output not available yet.', lastCheckedAt: new Date().toISOString() };
    }
    try {
      const resolved = await dnsResolve4(domain);
      if (resolved.includes(expectedIp)) {
        return { status: 'verified', message: `Resolves to ${expectedIp}`, lastCheckedAt: new Date().toISOString(), };
      }
      return {
        status: 'unmet',
        message: `Domain currently resolves to ${resolved.join(', ') || '(nothing)'}. Expected: ${expectedIp}.`,
        lastCheckedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return { status: 'unmet', message: `DNS lookup failed: ${err.message}`, lastCheckedAt: new Date().toISOString() };
    }
  },
  action: (ctx) => {
    const domain = ctx.block.data?.domain as string;
    const ip = ctx.deployedOutputs?.ip_address as string | undefined;
    if (!ip) return null;
    return {
      type: 'copy-dns-record',
      label: 'Copy DNS record',
      payload: { record_type: 'A', name: domain, value: ip, ttl: 300 },
    };
  },
  verifyPollIntervalMs: 10_000,
  verifyTimeoutMs: 30 * 60 * 1000,
};
```

The resolver reads `ctx.deployedOutputs` from the resource mapping and Phase 2's node data. Post-deploy requirements are polled in the background per `verifyPollIntervalMs` until they reach `verified` or the timeout expires.

**Acceptance:**
- Block with a domain but no DNS record → post-deploy requirement shown with copyable record
- After user adds the record, polling catches up within 60s and marks it verified
- Requirement persists across page reloads

### Step 4.7 — Background polling for post-deploy requirements

**Closes:** P4-7
**File:** New `services/deploy/src/services/requirement-poller.ts`

A small background worker polls post-deploy requirements that are in `unmet` or `checking` state. Uses the existing cron infrastructure or a simple `setInterval` in-process.

On each tick, for each requirement that's past its next poll time (but before its timeout), re-run `check` and upsert the result. Stop polling when `verified` or when `verifyTimeoutMs` elapses.

**Acceptance:**
- Poller picks up unmet requirements and re-checks
- Verified requirements stop being polled
- Timeout expires gracefully without retrying forever

### Step 4.8 — Deploy panel preflight integration

**Closes:** P4-1, P4-2
**File:** `packages/ui/src/features/deploy/components/deploy-panel.tsx`

When the user clicks Plan, call the requirement resolver for all nodes in the card. Show unmet blocking requirements in the preflight section above the plan preview. Disable Apply if any blocking requirement is unmet.

Reuse the Phase 3 preflight UI surface — requirements are just one more category of preflight check, rendered alongside billing/IAM checks.

**Acceptance:**
- Plan with a missing repo shows the requirement in preflight
- Apply button disabled while blocking requirements are unmet
- Requirements update when user fixes them and re-plans

### Step 4.9 — Block properties panel requirements view

**Closes:** P4-1 through P4-6
**File:** `packages/ui/src/features/deploy/components/properties-panel.tsx` or wherever block properties are rendered

Add a "Requirements" section to the block properties panel:

```
┌─ Requirements ─────────────────────────┐
│ ✓ Repository attached                  │
│   light-cloud-com/my-site @ main       │
│                                        │
│ ⚠ DNS A record not yet configured      │
│   Add this record at your DNS:        │
│   Type: A  Name: @  Value: 34.102.56.91│
│   [Copy] [Verify now]  Last checked:   │
│   2 min ago                            │
└────────────────────────────────────────┘
```

Before-deploy requirements always show (resolved fresh each time). Post-deploy requirements only show when the block is deployed.

Each requirement has:
- Status icon (checkmark, warning, error, spinner)
- Title
- Short message from the check result
- Action buttons (copy, verify now, open URL, etc.)
- Last checked timestamp

**Acceptance:**
- Properties panel for a compute block shows GitHub repo requirement
- Properties panel for a deployed domain block shows DNS requirement
- Action buttons work (copy to clipboard, trigger verify)

### Step 4.10 — Billing / IAM preflight as requirements

**Closes:** Unifies Phase 3 preflight with Phase 4 framework
**File:** New `packages/blocks/src/requirements/definitions/gcp-prerequisites.ts`

Move the Phase 3 preflight checks (billing account linked, SA has required roles, etc.) into the same requirements framework, scoped to `'card'` instead of `'block'`. This way there's one surface for all pre-deploy gating, and the UI treats GCP prerequisites and block-level requirements consistently.

Card-scoped requirements run once per deploy regardless of how many blocks are in the card.

**Acceptance:**
- Billing check shows in the same preflight section as block requirements
- SA role check shows there too
- Both block Apply when unmet

## Cross-cutting acceptance

1. Drag a Cloud Run block to the canvas. Open the properties panel. Requirements section shows "Attach repository" as unmet. Apply is disabled.
2. Attach a repo that ICE can't access. Requirement updates to "GitHub App not installed" with install link.
3. Install the GitHub App. Re-plan. Requirement is met. Apply enabled.
4. Deploy succeeds. A new requirement appears: "Add DNS A record for myapp.example.com." Pill on the canvas block shows a warning dot.
5. Copy the DNS record, add it at the registrar. Click "Verify now" in the properties panel. Within 10 seconds, the requirement status updates to verified.
6. Close the tab, reopen. Verified status persists (from the database).

## Risks

**Risk 1: Requirement checks add latency to every plan.** Mitigation: run in parallel with 10s ceiling; cache cheap checks for a short TTL.

**Risk 2: Background polling hits DNS / GitHub APIs too hard.** Mitigation: bound poll intervals per-requirement; back off after failures; limit total concurrent polls per process.

**Risk 3: Requirement definitions become a dumping ground.** Mitigation: require each requirement to document its failure mode clearly; code review catches scope creep.

**Risk 4: GitHub App install flow is outside ICE's current scope.** Mitigation: for Phase 4, accept manual install (link to install page). Automate in a later phase once the app exists.

## Post-mortem — initial backend landing

Implemented: the full type system (`packages/blocks/src/requirements/types.ts`), both built-in definitions (GitHub repo + DNS A record), the resolver service with persistence (`services/deploy/src/services/requirements.service.ts`), the `BlockRequirementStatus` Prisma model, and the `/api/canvas/deploy/requirements` + GET `/requirements/:cardId` endpoints.

Deferred to a follow-up UI pass (not blocking Phase 5):
- Deploy panel preflight section that calls `/requirements` on plan and renders the resolved list
- Block properties panel requirements view with action buttons (copy DNS record, attach repo, install GitHub App)
- Background polling worker for post-deploy requirements that periodically re-runs `check` on `unmet` / `unknown` results
- Billing / IAM checks moved into the same framework as card-scoped requirements (Step 4.10 in this doc)

The backend plumbing is stable enough that these can be built incrementally without changing the resolver contract. The action payloads are already spec'd on the requirement definitions; the UI just needs handlers.

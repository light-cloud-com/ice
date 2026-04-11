# Phase 6 — Data Model Hardening

**Effort:** 1–2 engineer-days
**Dependencies:** None (can run in parallel with any phase except Phase 0)
**Issues addressed:** P6-1 through P6-9

## Overview

Phase 6 fixes the Prisma schema so the database enforces what the application code currently assumes. Adds missing foreign keys, introduces `(card_id, environment)` uniqueness where appropriate, versions the JSON blob shapes, and refines the retention policy.

This phase is low-drama in terms of functionality but has the highest migration risk of any phase in the plan. Treat it like a database migration project, not a code change.

## Steps

### Step 6.1 — Add foreign key: `CanvasDeployment.card_id` → `CanvasCard.id`

**Closes:** P6-1
**File:** `packages/db/prisma/schema.prisma:228`

Change `CanvasDeployment` to declare the relation:

```prisma
model CanvasDeployment {
  id          String      @id @default(cuid())
  card_id     String
  card        CanvasCard  @relation(fields: [card_id], references: [id], onDelete: Cascade)
  // ... rest
}

model CanvasCard {
  // ... existing fields
  deployments CanvasDeployment[]
}
```

**Migration considerations:**
- If there are orphaned `canvas_deployment` rows with no matching card, the migration will fail. Write a data cleanup step first: `DELETE FROM canvas_deployment WHERE card_id NOT IN (SELECT id FROM canvas_card)`.
- `onDelete: Cascade` means deleting a card wipes its deploy history. That's probably what you want, but confirm with product.

**Acceptance:**
- Migration applies to a fresh DB
- Migration applies to a dev DB (with cleanup step)
- Deleting a card cascades to its deployments
- Cannot insert a deployment with an invalid `card_id`

### Step 6.2 — Add foreign key: `DeployedResourceMapping.card_id`

**Closes:** P6-1 (completeness)
**File:** `packages/db/prisma/schema.prisma`

Phase 1's new model should also have a FK and cascade:

```prisma
model DeployedResourceMapping {
  // ...
  card    CanvasCard @relation(fields: [card_id], references: [id], onDelete: Cascade)
}
```

And `BlockRequirementStatus` from Phase 4 gets the same treatment.

**Acceptance:**
- Deleting a card removes its resource mappings and requirement statuses

### Step 6.3 — Version the plan and results JSON

**Closes:** P6-3
**File:** `packages/db/prisma/schema.prisma`, `services/deploy/src/services/deploy.service.ts`

Introduce type-safe readers and writers for plan and results:

```ts
// packages/shared/src/deploy-schema.ts
export const PLAN_SCHEMA_VERSION = 1;
export const RESULTS_SCHEMA_VERSION = 1;

export interface PlanV1 {
  _schema_version: 1;
  creates: Array<{ name: string; type: string; action: 'create'; source_node_id?: string; label?: string }>;
  updates: Array<{ name: string; type: string; action: 'update'; property_diff?: PropertyDiff[] }>;
  deletes: Array<{ name: string; type: string; action: 'delete' }>;
  skipped: SkippedNode[];
  warnings: string[];
  graph_summary: { nodes: number; edges: number };
}

export type Plan = PlanV1;  // union when future versions land

export function readPlan(raw: unknown): Plan {
  if (raw == null) return emptyPlan();
  const obj = raw as any;
  if (obj._schema_version === 1) return obj as PlanV1;
  // Legacy: no version, treat as v0 and migrate in memory
  return migrateV0ToV1(obj);
}
```

Same for results. All reads of `canvasDeployment.plan` and `canvasDeployment.results` go through these readers.

**Acceptance:**
- New writes include `_schema_version: 1`
- Old records readable via the v0 migration path
- All `as any` casts on `deployment.plan` / `deployment.results` eliminated in favor of the readers

### Step 6.4 — Refine retention policy

**Closes:** P6-4
**File:** `services/deploy/src/services/cron.service.ts:27-56`

Change from "keep last 50 per card" to a smarter policy:

1. **Never prune a successful deploy if it's the most recent successful one for its environment.** That's the rollback baseline.
2. **Keep the last N successful deploys per (card, environment)** — N = 20, configurable.
3. **Keep failed deploys for 30 days only** — they're debugging data, not history.
4. **Support pinning** — add a `pinned: Boolean` field to `CanvasDeployment`. Pinned rows are never pruned. UI button in the history view lets users pin important deploys.

```prisma
model CanvasDeployment {
  // ...
  pinned Boolean @default(false)
}
```

**Acceptance:**
- Successful deploys retained up to 20 per (card, environment)
- Most recent successful deploy is never pruned regardless of count
- Failed deploys pruned after 30 days
- Pinned deploys retained forever

### Step 6.5 — Add `@@unique([card_id, environment])` constraint… carefully

**Closes:** P6-5 (partial — see discussion)
**File:** `packages/db/prisma/schema.prisma`

The inventory flags this, but a blanket unique constraint on `(card_id, environment)` is wrong because a card can have many historical deployments per env. The actual invariant is: **at most one currently-active deployment per (card, environment)**.

Model this as a partial unique index (PostgreSQL supports it):

```sql
CREATE UNIQUE INDEX canvas_deployment_active_unique
ON canvas_deployment (card_id, environment)
WHERE status IN ('deploying', 'planned', 'queued');
```

Prisma doesn't natively support partial unique indexes in the schema, so add it via a raw migration SQL. This prevents a second concurrent deploy to the same env even if the application-level lock from Phase 0 is somehow bypassed.

**Acceptance:**
- Two concurrent deploys to same card+env fail at the database level
- Historical deploys (success/failed/cancelled) are not affected by the constraint
- Migration applies cleanly

### Step 6.6 — Enforce status state machine

**Closes:** P6-6, P6-7
**File:** `packages/db/prisma/schema.prisma`, `services/deploy/src/services/deploy.service.ts`

Change `status String` to an enum:

```prisma
enum DeploymentStatus {
  planning
  planned
  queued
  deploying
  success
  partial
  failed
  cancelled
  destroying
  destroyed
  rolled_back
}

model CanvasDeployment {
  status DeploymentStatus
}
```

Rename `'planning'` ↔ `'planned'` drift at the code level (currently `planDeployment` writes `'planned'`, schema comment says `'planning'`).

Add a state-transition helper:

```ts
const ALLOWED_TRANSITIONS: Record<DeploymentStatus, DeploymentStatus[]> = {
  planning: ['planned', 'failed'],
  planned: ['deploying', 'cancelled', 'queued'],
  deploying: ['success', 'partial', 'failed', 'cancelled'],
  // ...
};

export async function transitionDeployment(id: string, to: DeploymentStatus, data?: any) {
  const current = await prisma.canvasDeployment.findUnique({ where: { id } });
  if (!current) throw new Error('Deployment not found');
  if (!ALLOWED_TRANSITIONS[current.status]?.includes(to)) {
    throw new Error(`Invalid transition: ${current.status} → ${to}`);
  }
  return prisma.canvasDeployment.update({ where: { id }, data: { status: to, ...data } });
}
```

All status writes go through this helper.

**Acceptance:**
- Enum migration succeeds
- Invalid transitions throw
- Existing code paths pass all transition checks (audit required)

### Step 6.7 — Transaction boundaries around lifecycle writes

**Closes:** P6-8
**File:** `services/deploy/src/services/deploy.service.ts`

Wrap the "create deployment record + start deploy" step in a single operation. The apply loop itself can't be in a transaction (too long), but the record creation and the final status write should both be atomic against the mapping table updates they trigger.

```ts
// Creating the deployment record
const deployment = await prisma.$transaction(async (tx) => {
  const created = await tx.canvasDeployment.create({ ... });
  await tx.blockRequirementStatus.updateMany({ ... });  // invalidate stale requirements
  return created;
});

// Finalizing the deployment record
await prisma.$transaction(async (tx) => {
  await tx.canvasDeployment.update({ where: { id }, data: { status, results, duration_ms } });
  for (const r of successfulResources) {
    await tx.deployedResourceMapping.upsert({ ... });
  }
});
```

**Acceptance:**
- Concurrent writes to the same deployment are serialized
- Mapping upserts are atomic with the status update
- Partial writes can't leave inconsistent state

### Step 6.8 — Indexes for dashboard queries

**Closes:** P6-9
**File:** `packages/db/prisma/schema.prisma`

Add composite indexes for common access patterns:

```prisma
@@index([card_id, environment, status, created_at(sort: Desc)])
@@index([status, created_at(sort: Desc)])  // for watchdog + global dashboard
```

**Acceptance:**
- `EXPLAIN ANALYZE` on the history query shows index usage
- Watchdog query uses the status index

### Step 6.9 — Optional: ProviderCredential audit trail

**Closes:** P6-2 (deferred, see discussion)
**File:** `packages/db/prisma/schema.prisma`

Add `credential_id` to `CanvasDeployment` so we know which credential was used for each deploy:

```prisma
model CanvasDeployment {
  credential_id String?
  credential    ProviderCredential? @relation(fields: [credential_id], references: [id], onDelete: SetNull)
}
```

On apply, capture the credential id at the start of the deploy and store it. This enables "which deploys used this rotated key?" queries.

**Deferred:** full credential versioning and rotation tracking. For now, just recording which credential was used is enough.

**Acceptance:**
- Every new deploy records its `credential_id`
- Historical deploys (before this change) have null — acceptable
- Deleting a credential sets the FK to null, doesn't cascade delete deploys

## Cross-cutting acceptance

1. Delete a canvas card. Verify all its `canvas_deployment` and `deployed_resource_mapping` rows are gone.
2. Try to start a second concurrent deploy to the same env via raw SQL (bypassing the app lock). Verify the unique index rejects it.
3. Try to transition a `success` deployment to `deploying`. Helper throws.
4. Insert a deployment with an old plan shape. Reader migrates it in memory without error.
5. Let the retention cron run. Verify pinned rows, recent-success rows, and the most-recent-per-env rows are preserved; old failed rows are pruned.

## Risks

**Risk 1: Migration fails on production data with orphaned rows.** Mitigation: run the cleanup step first as a separate migration that only deletes orphans. Verify count before proceeding to the FK add.

**Risk 2: Enum migration breaks existing string writes.** Mitigation: map existing string values to enum values in the migration. Audit every code path that writes `status` to confirm it uses the helper.

**Risk 3: Partial unique index is PostgreSQL-specific.** Mitigation: ICE is on Postgres. Add a schema comment that this migration is Postgres-only.

**Risk 4: Retention policy change might delete things users wanted.** Mitigation: ship the `pinned` field first, give users a week to pin important deploys, then change the retention job.

## Post-mortem

_TBD_

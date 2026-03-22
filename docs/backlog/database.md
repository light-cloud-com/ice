# Database Backlog

## DB-1: Missing index on `CanvasDeployment(card_id, status, created_at)` (P1)

**File:** `packages/db/prisma/schema.prisma:222-240`

`CanvasDeployment` has no indexes. Multiple queries filter by `{ card_id, status: 'success' }` ordered by `created_at desc`. Full table scan on every deploy status check.

**Fix:** Add `@@index([card_id, status, created_at(sort: Desc)])`.

---

## DB-2: Missing index on `CanvasProject(organisation_id)` (P1)

**File:** `packages/db/prisma/schema.prisma:120-142`

`listProjects` queries by `organisation_id`. No index exists.

**Fix:** Add `@@index([organisation_id])`.

---

## DB-3: Missing index on `DeployJob(status, started_at)` (P2)

**File:** `packages/db/prisma/schema.prisma:243-258`

The cron job queries `{ status: 'processing', started_at: { lt: ... } }` every 5 minutes.

**Fix:** Add `@@index([status, started_at])`.

---

## DB-4: Missing index on `DeploymentRule(card_id)` (P2)

**File:** `packages/db/prisma/schema.prisma:289`

Only index is on `repository`. The pipeline job queries by `card_id`.

**Fix:** Add `@@index([card_id])`.

---

## DB-5: `WebhookDelivery` — no TTL or cleanup (P2)

**File:** `packages/db/prisma/schema.prisma:320-329`

Records created for every GitHub webhook, never deleted. Unbounded table growth.

**Fix:** Add a cron job to delete records older than 7 days.

---

## DB-6: `AiConversation` missing foreign key to `User` (P2)

**File:** `packages/db/prisma/schema.prisma:333-348`

`user_id` stored as plain string, no Prisma relation. No cascade delete — orphaned records when users are deleted.

**Fix:** Add `user User @relation(...)` with `onDelete: Cascade`.

---

## DB-7: `CanvasDeployment.user_id` nullable with no relation (P3)

**File:** `packages/db/prisma/schema.prisma:222-240`

`user_id String?` has no `@relation`. No referential integrity, no cascade, no index.

---

## DB-8: `AiAuditLog` missing `user_id` and `organisation_id` (P3)

**File:** `packages/db/prisma/schema.prisma:368-384`

Cannot build per-user or per-org usage dashboards for AI. Needed for billing integration.

**Fix:** Add `user_id` and `organisation_id` fields with relations.

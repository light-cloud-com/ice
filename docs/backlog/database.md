# Database Backlog

> **Status: All 8 items fixed** (2026-03-22)

## DB-1: Missing index on `CanvasDeployment(card_id, status, created_at)` (P1) -- FIXED

**Fix applied:** Added `@@index([card_id, status, created_at(sort: Desc)])` to CanvasDeployment model.

---

## DB-2: Missing index on `CanvasProject(organisation_id)` (P1) -- FIXED

**Fix applied:** Added `@@index([organisation_id])` and `@@index([parent_id])` to CanvasProject model.

---

## DB-3: Missing index on `DeployJob(status, started_at)` (P2) -- FIXED

**Fix applied:** Added `@@index([status, started_at])` to DeployJob model.

---

## DB-4: Missing index on `DeploymentRule(card_id)` (P2) -- FIXED

**Fix applied:** Added `@@index([card_id])` to DeploymentRule model.

---

## DB-5: `WebhookDelivery` — no TTL or cleanup (P2) -- FIXED

**Fix applied:** Added `@@index([created_at])` to WebhookDelivery model. Added daily cron job (4am) in `cron.service.ts` to delete records older than 7 days.

---

## DB-6: `AiConversation` missing foreign key to `User` (P2) -- FIXED

**Fix applied:** Added `user User @relation(fields: [user_id], references: [id], onDelete: Cascade)` to AiConversation model.

---

## DB-7: `CanvasDeployment.user_id` nullable with no relation (P3) -- FIXED

**Fix applied:** Added `user User? @relation(fields: [user_id], references: [id], onDelete: SetNull)` and `@@index([user_id])` to CanvasDeployment model.

---

## DB-8: `AiAuditLog` missing `user_id` and `organisation_id` (P3) -- FIXED

**Fix applied:** Added `user_id` and `organisation_id` fields with relations and indexes (done in backend services pass).

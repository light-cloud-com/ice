# RBAC (Role-Based Access Control) Backlog

> **Status: All 20 items fixed** (2026-03-23)

Full audit and fix of role enforcement across all API routes. Prior to this fix, many routes only checked `requireAuth` (is user logged in?) but not what role they have.

## Role Hierarchy

**Organisation level:** owner > admin > member > viewer
**Project level:** owner > editor > viewer
**Org owners/admins** automatically bypass project-level checks.

---

## RBAC-1: Deploy plan unprotected (P0) -- FIXED

**Fix applied:** Added `requireProjectAccess('editor')` to `POST /deploy/plan`.

---

## RBAC-2: Deploy apply unprotected (P0) -- FIXED

**Fix applied:** Added `requireProjectAccess('owner')` to `POST /deploy/apply`. Only project owners can deploy real infrastructure.

---

## RBAC-3: Deploy destroy unprotected (P0) -- FIXED

**Fix applied:** Added `requireProjectAccess('owner')` to `POST /deploy/destroy`.

---

## RBAC-4: Pipeline rules — viewer can create (P0) -- FIXED

**Fix applied:** Added `requireProjectAccess('editor')` to `POST /pipeline/rules` (create) and `PUT /pipeline/rules/:ruleId` (update). Added `requireProjectAccess('owner')` to `DELETE /pipeline/rules/:ruleId`. Added resolver middleware (`resolveRuleToCard`) to look up `cardId` from `ruleId` for routes that don't have `cardId` in params.

---

## RBAC-5: Pipeline trigger/retry/cancel unprotected (P0) -- FIXED

**Fix applied:** Added `requireProjectAccess('editor')` with resolver middleware to `POST /pipeline/trigger` (via `resolveRuleToCard`), `POST /pipeline/retry` and `POST /pipeline/cancel` (via `resolveEventToCard`).

---

## RBAC-6: Pipeline events/rules GET unprotected (P1) -- FIXED

**Fix applied:** Added `requireProjectAccess('viewer')` to `GET /pipeline/rules/:cardId/:nodeId` and `GET /pipeline/events/:cardId/:nodeId`.

---

## RBAC-7: Billing payment method — viewer can modify (P0) -- FIXED

**Fix applied:** Added `requireOrgRole('owner')` to payment-method setup/update/remove and invoice/retry routes. New `requireOrgRole` middleware added to `@ice/shared`.

---

## RBAC-8: Billing settings/details — viewer can modify (P1) -- FIXED

**Fix applied:** Added `requireOrgRole('owner', 'admin')` to settings, details, usage, usage-history, invoices, and invoice detail routes.

---

## RBAC-9: Cloud provider connect/disconnect — viewer can modify (P1) -- FIXED

**Fix applied:** Added `requireOrgRole('owner', 'admin')` to `POST /:provider/connect`, `POST /:provider/disconnect`, `POST /:provider/credentials`, and `POST /gcp/oauth/exchange`.

---

## RBAC-10: AI audit logs exposed to all users (P1) -- FIXED

**Fix applied:** `GET /ai/audit/list` now filters by `req.organisationId`. `GET /ai/audit/:id` verifies the entry's org matches the caller's. Service function updated to accept `orgId` filter.

---

## RBAC-11: AI inspect routes unprotected (P1) -- FIXED

**Fix applied:** Added `requireProjectAccess('viewer')` to `GET /ai/inspect/:cardId/summary` and `GET /ai/inspect/:cardId/state`.

---

## RBAC-12: Card delete uses editor role (P2) -- FIXED

**Fix applied:** Changed `POST /canvas/cards/delete` from `requireProjectAccess('editor')` to `requireProjectAccess('owner')`.

---

## RBAC-13: Environment promote uses editor role (P2) -- FIXED

**Fix applied:** Changed `POST /environments/promote` from `requireProjectAccess('editor')` to `requireProjectAccess('owner')`.

---

## RBAC-14: Project members list unprotected (P2) -- FIXED

**Fix applied:** Added `requireProjectAccess('viewer')` to `POST /project-members/list`.

---

## RBAC-15: User list — no org role check (P2) -- FIXED

**Fix applied:** Added admin+ org role check to `POST /users/` (list members).

---

## RBAC-16: Invitations list — no org role check (P2) -- FIXED

**Fix applied:** Added admin+ org role check to `GET /users/invitations`.

---

## RBAC-17: New `requireOrgRole` middleware (P1) -- FIXED

**Fix applied:** Created `requireOrgRole(...allowedRoles)` factory middleware in `packages/shared/src/auth/middleware.ts`. Reads `req.organisationId` from JWT, looks up `OrganisationMember` role, rejects if not in allowed list. Exported from `@ice/shared`.

---

## RBAC-18: Pipeline ruleId/eventId resolver middleware (P2) -- FIXED

**Fix applied:** Created `resolveRuleToCard` and `resolveEventToCard` middleware in pipeline routes. These look up the `cardId` from the rule/event record so `requireProjectAccess` can resolve the project.

---

## RBAC-19: Billing estimate route (P3) -- FIXED

**Fix applied:** Left as `requireAuth` only — cost estimates are non-sensitive and don't expose billing PII.

---

## RBAC-20: Import routes (P3) -- FIXED

**Fix applied:** Import routes (`/api/import/terraform`, `/api/import/pulumi`) use `requireAuth`. They transform uploaded state into graph data without creating any resources — no project/org scoping needed.

---

## Test Coverage

- **30 RBAC tests** in `services/canvas/src/__tests__/rbac.test.ts`
- Tests cover: requireProjectAccess (viewer/editor/owner), requireOrgRole (owner, owner+admin), cardId resolution, business rules (deploy, billing, credentials, card delete, environment promote)
- All tests use real DB users with specific org/project memberships

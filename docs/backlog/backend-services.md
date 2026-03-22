# Backend Services Backlog

> **Status: All 16 items fixed** (2026-03-22)

## BE-1: Billing service crashes on startup — broken imports (P0) -- FIXED

**Fix applied:** Created `src/lib/prisma.ts` re-exporting from `@ice/db`. Added re-export shims for `../../services/` imports. Created missing `scalingTrackingService.ts`. `createBillingRouter()` now uses async `import()` with error logging (returns 503 on failure instead of silent stub).

---

## BE-2: Billing routes use `passport-jwt` strategy that isn't registered (P1) -- FIXED

**Fix applied:** Replaced `passport.authenticate('jwt', { session: false })` with `requireAuth` middleware from `@ice/shared`, consistent with all other services.

---

## BE-3: Refresh tokens never rotated or revoked on reuse (P1) -- FIXED

**Fix applied:** Refresh token rotation — old token deleted and new one issued on each refresh. Reuse of a consumed token triggers revocation of all tokens for that user (family compromise detection).

---

## BE-4: `refreshToken` doesn't validate `type: 'refresh'` claim (P2) -- FIXED

**Fix applied:** Validates `payload.type === 'refresh'` before processing. Access tokens are rejected with 401.

---

## BE-5: Deployment history/status routes have no ownership check (P1) -- FIXED

**Fix applied:** Added `requireProjectAccess('viewer')` to `GET /resources/:cardId` and `GET /history/:cardId` routes.

---

## BE-6: No graceful shutdown in gateway (P2) -- FIXED

**Fix applied:** SIGTERM/SIGINT handlers stop accepting new connections, close Socket.IO, with 30s drain timeout before forced exit.

---

## BE-7: `require()` mixed with ESM imports in queue.service.ts (P2) -- FIXED

**Fix applied:** Converted `require('@ice/shared')` to `await import('@ice/shared')`.

---

## BE-8: Rate limiter keys by IP only (P2) -- FIXED

**Fix applied:** `keyGenerator` uses `req.userId` when authenticated, falls back to `req.ip` for anonymous requests.

---

## BE-9: `getProfile` makes 2-3 sequential DB queries (P3) -- FIXED

**Fix applied:** Single Prisma query with `include: { memberships: { include: { organisation } }, organisation }`.

---

## BE-10: `requireProjectAccess` makes 3-4 sequential DB queries (P3) -- FIXED

**Fix applied:** Reduced to 2 queries — project fetch includes `members` relation filtered by user, eliminating the separate `projectMember` query.

---

## BE-11: Build service uses `cp -r` for node_modules cache (P3) -- FIXED

**Fix applied:** Uses `cp -al` (hardlinks) for fast cache restore, `rsync` for incremental cache saves. Falls back to `cp -r` on cross-device.

---

## BE-12: `destroyDeployment` missing credential cleanup (P3) -- FIXED

**Fix applied:** Added temp credentials file tracking and `finally` block cleanup, matching `applyDeployment` pattern.

---

## BE-13: CORS origins parsed independently for Express and Socket.IO (P3) -- FIXED

**Fix applied:** `ALLOWED_ORIGINS` parsed once at startup (trimmed, filtered), shared between Express CORS and Socket.IO config.

---

## BE-14: `helmet` CSP completely disabled (P3) -- FIXED

**Fix applied:** Scoped CSP for API gateway: `default-src 'none'`, `frame-ancestors 'none'`.

---

## BE-15: `AiAuditLog` has no user/org reference (P3) -- FIXED

**Fix applied:** Added `user_id` and `organisation_id` fields with relations and indexes to the Prisma schema.

---

## BE-16: No unit or integration tests for any service (P2) -- FIXED

**Fix applied:** Added 15 unit tests (vitest): crypto encrypt/decrypt/tamper detection, auth service JWT generation/OAuth sentinel, build command validation. Added 9 e2e tests (Playwright): billing auth, refresh token rotation, deploy access control, profile endpoint, CORS, CSP.

# Backend Services Backlog

## BE-1: Billing service crashes on startup — broken imports (P0)

**Files:**
- `services/billing/src/routes/stripeWebhook.ts:8` — imports from `../../services/stripeService` (file is `stripe.service.ts`)
- `services/billing/src/routes/scheduledJobs.ts:12-21` — imports `usageTrackingService`, `invoiceService`, `scalingTrackingService`, `trialService` (none exist)
- `services/billing/src/services/billing.service.ts:8` — imports from `../lib/prisma` (doesn't exist, should be `@ice-saas/db`)
- `services/billing/src/services/stripe.service.ts:12` — same `../lib/prisma` import

The billing service silently catches the crash in `createBillingRouter()` and falls back to a stub returning `{ status: 'billing_service_initializing' }`. Billing is permanently non-functional.

**Fix:** Fix all import paths. Remove the silent catch or add prominent error logging.

---

## BE-2: Billing routes use `passport-jwt` strategy that isn't registered (P1)

**Files:**
- `services/billing/src/routes/index.ts:43-58` — uses `passport.authenticate('jwt', { session: false })`
- `apps/gateway/src/index.ts` — only registers GitHub and Google OAuth strategies

No `passport-jwt` strategy is configured. All billing authenticated routes return 401 regardless of valid JWT.

**Fix:** Either register a `passport-jwt` strategy or switch billing to use `requireAuth` middleware from `@ice-saas/shared/auth` (consistent with all other services).

---

## BE-3: Refresh tokens never rotated or revoked on reuse (P1)

**File:** `services/iam/src/services/auth.service.ts:90-97`

`refreshToken()` generates a new access token but never updates or deletes the stored refresh token. A stolen refresh token remains valid for its full 30-day lifetime even after logout from other sessions. No refresh token family/reuse detection.

**Fix:** Delete and replace the refresh token on each use (rotation). Detect reuse of revoked tokens.

---

## BE-4: `refreshToken` doesn't validate `type: 'refresh'` claim (P2)

**File:** `services/iam/src/routes/auth.ts:118-133`

Token signature is verified but `payload.type === 'refresh'` is not checked. An access token could theoretically be used as a refresh token.

**Fix:** Check `type: 'refresh'` in the JWT payload.

---

## BE-5: Deployment history/status routes have no ownership check (P1)

**File:** `services/deploy/src/routes/canvas-deploy.ts:56-70`

`GET /status/:deploymentId` and `GET /history/:cardId` only require `requireAuth`. Any authenticated user can read another org's deployment history and plan snapshots.

**Fix:** Apply `requireProjectAccess` middleware to these routes.

---

## BE-6: No graceful shutdown in gateway (P2)

**File:** `apps/gateway/src/index.ts`

No `SIGTERM`/`SIGINT` handler. Container stop kills in-progress deployments (up to 10 min each) mid-deploy, leaving cloud resources partially provisioned.

**Fix:** Add shutdown handler: stop accepting new connections, drain active requests/jobs, gracefully shut down BullMQ worker.

---

## BE-7: `require()` mixed with ESM imports in queue.service.ts (P2)

**File:** `services/deploy/src/services/queue.service.ts:201`

`const { emitPipelineUpdate } = require('@ice-saas/shared')` — all other files use ES module `import`. This `require()` can cause "require is not defined" in true ESM.

**Fix:** Move to a top-level `import` statement.

---

## BE-8: Rate limiter keys by IP only — shared NAT penalized (P2)

**File:** `apps/gateway/src/index.ts:54-60`

Global rate limiter (200 req/min) keys by IP. Users behind corporate NAT share the budget. The AI-specific limiter already keys by `req.userId`.

**Fix:** Key by `userId` when authenticated, fall back to IP for anonymous requests.

---

## BE-9: `getProfile` makes 2-3 sequential DB queries for a single JOIN (P3)

**File:** `services/iam/src/services/auth.service.ts:128-141`

Multiple sequential Prisma queries that should be one include-based query.

**Fix:** Consolidate into a single query with `include`.

---

## BE-10: `requireProjectAccess` makes 3-4 sequential DB queries per request (P3)

**File:** `packages/shared/src/auth/middleware.ts:48-85`

Every protected request triggers 3-4 sequential Prisma queries. Under load, this adds significant latency.

**Fix:** Consolidate into a single JOIN query. Consider short TTL caching.

---

## BE-11: Build service uses `cp -r` for node_modules cache (P3)

**File:** `services/deploy/src/services/build.service.ts:83, 101`

Copies entire `node_modules` (often 300MB+) twice per build. The 60s timeout will fail for large projects.

**Fix:** Use symlink/hardlink approach or pnpm's content-addressable store.

---

## BE-12: `destroyDeployment` missing credential cleanup (P3)

**File:** `services/deploy/src/services/deploy.service.ts:498-659`

Duplicates service account key auth setup from `applyDeployment` but never calls `cleanupTempCredentials()`.

---

## BE-13: CORS origins parsed independently for Express and Socket.IO (P3)

**File:** `apps/gateway/src/index.ts:35-39, 47-50`

Malformed `FRONTEND_URL` (e.g., trailing space) silently breaks one transport but not the other.

**Fix:** Parse and validate origins once at startup.

---

## BE-14: `helmet` CSP completely disabled (P3)

**File:** `apps/gateway/src/index.ts:46`

`contentSecurityPolicy: false` — not critical for API-only gateway but should be explicitly scoped.

---

## BE-15: `AiAuditLog` has no user/org reference (P3)

**File:** `packages/db/prisma/schema.prisma:368-384`

Cannot answer "how many AI requests did org X make?" — needed for billing/usage dashboards.

**Fix:** Add `user_id` and `organisation_id` fields with relations.

---

## BE-16: No unit or integration tests for any service (P2)

Across all `services/*/` directories, there are zero `*.test.ts` or `*.spec.ts` files. Critical paths (HMAC verification, token refresh, credential encryption, deploy orchestration) have no automated test coverage.

**Fix:** Add unit tests for auth service, crypto module, deploy service, and webhook verification.

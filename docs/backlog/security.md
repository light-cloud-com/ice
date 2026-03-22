# Security Backlog

> **Status: All 15 items fixed** (2026-03-22)

## SEC-1: Default JWT secret and encryption key fallbacks (P0) -- FIXED

**Fix applied:** Throws on startup if `JWT_SECRET` or `CREDENTIAL_ENCRYPTION_KEY` is missing in non-test environments. Also replaced `crypto-js` with Node.js native AES-256-GCM (SEC-11).

---

## SEC-2: Stripe webhook signature verification broken (P0) -- FIXED

**Fix applied:** Mounted `express.raw({ type: 'application/json' })` on `/api/billing/webhook/stripe` before `express.json()` in gateway.

---

## SEC-3: GitHub webhook HMAC bypass (P0) -- FIXED

**Fix applied:** HMAC verification uses raw body buffer. Webhook secret is required on all rules (no bypass when missing). Mounted `express.raw()` on `/api/webhooks/github` in gateway.

---

## SEC-4: Command injection in build service (P0) -- FIXED

**Fix applied:** `shell: false` with command allowlist validation. Shell metacharacters are rejected. Only `npm`, `yarn`, `pnpm`, `pip`, `go`, `make`, `cargo`, `dotnet`, `mvn`, `gradle` are allowed.

---

## SEC-5: JWT in OAuth redirect URL query string (P1) -- FIXED

**Fix applied:** OAuth redirect uses URL fragment (`#token=`) instead of query string. Frontend `auth-callback.tsx` reads from `window.location.hash` and clears it after reading.

---

## SEC-6: Socket.IO rooms unauthenticated (P1) -- FIXED

**Fix applied:** JWT authentication middleware on Socket.IO connection handshake. Connections without valid token are rejected. Room join validates string input.

---

## SEC-7: Google token login doesn't validate audience (P1) -- FIXED

**Fix applied:** Validates token via `tokeninfo` endpoint, checks `aud`/`azp` matches `GOOGLE_CLIENT_ID` before accepting.

---

## SEC-8: Organisation IDOR via `req.body.organisationId` (P1) -- FIXED

**Fix applied:** `getOrgId()` now only uses JWT-derived `req.organisationId`, ignoring client-supplied body param.

---

## SEC-9: `requireProjectAccess` only reads from `req.body` (P1) -- FIXED

**Fix applied:** Middleware reads `projectId`/`cardId` from `req.body`, `req.params`, and `req.query`. Works for both POST and GET routes.

---

## SEC-10: OAuth users created with empty `password_hash` (P1) -- FIXED

**Fix applied:** OAuth users get `@@oauth-only@@` sentinel. Password login explicitly blocked for sentinel and empty-hash accounts with helpful error message.

---

## SEC-11: `crypto-js` AES lacks authenticated encryption (P2) -- FIXED

**Fix applied:** Replaced `crypto-js` with Node.js native `crypto` using AES-256-GCM (authenticated encryption with integrity protection). Removed `crypto-js` dependency.

---

## SEC-12: GitHub OAuth email collision (P2) -- FIXED

**Fix applied:** Uses `gh-{profile.id}@github.oauth` instead of `${profile.username}@github.local` to ensure unique email per GitHub user.

---

## SEC-13: Service account key file not cleaned up on error paths (P2) -- FIXED

**Fix applied:** `finally` block ensures cleanup in both `applyDeployment` and `destroyDeployment`. Unique per-deployment file paths prevent concurrent overwrites.

---

## SEC-14: Google OAuth Client ID committed in `.env.development` (P2) -- FIXED

**Fix applied:** Added `.env.development` to `.gitignore`. Cleared live client ID. Created `.env.example` with placeholders.

---

## SEC-15: Billing scheduled job endpoints allow unauthenticated access (P2) -- FIXED

**Fix applied:** `verifySchedulerAuth` defaults to denying access when `SCHEDULER_API_KEY` is not configured.

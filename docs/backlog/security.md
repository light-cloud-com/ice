# Security Backlog

## SEC-1: Default JWT secret and encryption key fallbacks (P0)

**Files:**
- `packages/shared/src/auth/middleware.ts:8`
- `packages/shared/src/crypto/index.ts:9`

Both `JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` fall back to static strings (`dev-secret`, `dev-only-change-in-production`) when env vars are missing. A misconfigured production deployment silently accepts forged JWTs and uses a predictable encryption key for cloud provider credentials.

**Fix:** Throw on startup if either variable is missing in non-test environments.

---

## SEC-2: Stripe webhook signature verification broken (P0)

**Files:**
- `apps/gateway/src/index.ts:52` — `express.json()` applied globally before routes
- `services/billing/src/routes/stripeWebhook.ts:39-50`

The global `express.json()` middleware parses the Stripe webhook body before it reaches the handler. Stripe requires the raw body for HMAC verification. The handler detects this and returns `400 "Request body must be raw"` on every call.

**Fix:** Mount `express.raw({ type: 'application/json' })` on `/api/billing/webhook/stripe` before `express.json()`.

---

## SEC-3: GitHub webhook HMAC bypass (P0)

**Files:**
- `services/deploy/src/routes/webhooks.ts:37-44, 130-136`

The webhook middleware immediately calls `next()` without verification. The handler reconstructs the body via `JSON.stringify(parsed_json)` which doesn't match GitHub's raw bytes. When `rulesWithSecrets.length === 0`, the check is bypassed entirely, meaning any attacker can trigger arbitrary deployments for repos with no webhook secret.

**Fix:** Mount `express.raw()` on this route and verify against the raw body. Require a webhook secret for all rules.

---

## SEC-4: Command injection in build service (P0)

**File:** `services/deploy/src/services/build.service.ts:209-211`

User-supplied `installCommand` and `buildCommand` from `DeploymentRule` are passed to `spawn` with `shell: true`. Any project editor can inject shell metacharacters.

**Fix:** Use `shell: false` with a properly split argument array, or validate against an allowlist.

---

## SEC-5: JWT in OAuth redirect URL query string (P1)

**File:** `services/iam/src/routes/oauth.ts:55`

`res.redirect(...?token=${accessToken})` — JWTs in URL query strings are logged by servers, proxies, and browsers.

**Fix:** Use URL fragment (`#token=...`) or a short-lived opaque code exchanged via POST.

---

## SEC-6: Socket.IO rooms unauthenticated (P1)

**File:** `packages/shared/src/socket/service.ts:18-58`

Any connected socket can join any `deploy:{cardId}`, `pipeline:{nodeId}`, or `canvas:{projectId}` room. No JWT verification on socket connection or room join. An attacker can receive all deployment logs and canvas updates.

**Fix:** Authenticate socket connections via JWT in handshake auth. Verify room membership matches user's accessible projects.

---

## SEC-7: Google token login doesn't validate audience (P1)

**File:** `services/iam/src/routes/auth.ts:63-114`

The Google access token is validated only by calling the userinfo endpoint. An access token from any other Google OAuth client could be used to log in.

**Fix:** Use `tokeninfo` endpoint and verify `aud` matches `GOOGLE_CLIENT_ID`.

---

## SEC-8: Organisation IDOR via `req.body.organisationId` (P1)

**File:** `services/canvas/src/routes/canvas.ts:24-26`

`getOrgId()` reads from `req.body.organisationId` which is client-supplied. Any authenticated user can list projects from any organisation.

**Fix:** Use only the JWT-derived `req.organisationId`.

---

## SEC-9: `requireProjectAccess` only reads from `req.body` — GET routes unprotected (P1)

**File:** `packages/shared/src/auth/middleware.ts:44-53`

The middleware reads `projectId` and `cardId` only from `req.body`. GET routes pass IDs as path params, so the middleware either returns 400 or is not applied. Any authenticated user can read another user's deployment history.

**Fix:** Extend middleware to read from `req.params` and `req.query`. Apply to GET routes.

---

## SEC-10: OAuth users created with empty `password_hash` (P1)

**File:** `services/iam/src/services/auth.service.ts:169`

OAuth users get `password_hash: ''`. No field distinguishes OAuth-only accounts, so there's no guard against password-based login attempts.

**Fix:** Store a sentinel like `'oauth-only'` and explicitly block password login for these users.

---

## SEC-11: `crypto-js` AES lacks authenticated encryption (P2)

**File:** `packages/shared/src/crypto/index.ts:12-13`

Using `CryptoJS.AES.encrypt` with a string key uses password-based key derivation (MD5 x 1 round) and CBC mode with no integrity protection. An attacker who can flip bytes in the stored `credentials` column can produce malformed but parseable JSON.

**Fix:** Use Node.js native `crypto.createCipheriv` with AES-256-GCM (authenticated encryption).

---

## SEC-12: GitHub OAuth email collision (P2)

**File:** `services/iam/src/configs/passportOAuth.ts:52`

Users with no public GitHub email get `${profile.username}@github.local`. Two different GitHub users with the same username and no public email would collide on the unique email constraint, or the second user logs in as the first.

**Fix:** Use GitHub user ID as the unique identifier, not email.

---

## SEC-13: Service account key file not cleaned up on error paths (P2)

**File:** `services/deploy/src/services/deploy.service.ts:244-247`

GCP service account key JSON is written to a temp file. Cleanup only runs in the success path and `applyDeployment` catch block. Process crashes leave keys on disk. Additionally, `GOOGLE_APPLICATION_CREDENTIALS` is process-global — concurrent workers can overwrite each other's path.

**Fix:** Use `finally` block for cleanup. Use unique per-job file paths (already done) but ensure concurrent safety.

---

## SEC-14: Google OAuth Client ID committed in `.env.development` (P2)

**File:** `packages/web/.env.development`

Contains a live `VITE_GOOGLE_CLIENT_ID`. The `.gitignore` doesn't ignore `.env.development`.

**Fix:** Add `.env.development` to `.gitignore`. Rotate the client ID. Create `.env.example` with placeholders.

---

## SEC-15: Billing scheduled job endpoints allow unauthenticated access (P2)

**File:** `services/billing/src/routes/scheduledJobs.ts:27-34`

If `SCHEDULER_API_KEY` is not configured, auth is bypassed (returns `true`). Any caller can invoke `generate-invoices`, `check-spending-limits`, etc.

**Fix:** Default to denying access. Enforce the key always or check `NODE_ENV`.

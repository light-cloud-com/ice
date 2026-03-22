# Infrastructure & CI/CD Backlog

## INFRA-1: CI pipeline broken — references deleted `backend/` directory (P0)

**File:** `.github/workflows/e2e.yml:46-61`

The workflow uses `working-directory: backend` for setup and startup. `backend/` no longer exists — replaced by `apps/gateway`. Every PR fails CI.

**Fix:** Update to `working-directory: apps/gateway`. Update Prisma migrate path to use `packages/db`.

---

## INFRA-2: Gateway Dockerfile missing (P0)

`apps/gateway/Dockerfile` does not exist. `docker-compose.yml` references `build: ./apps/gateway`, so `docker compose up` fails immediately.

**Fix:** Create a multi-stage Dockerfile for the gateway that installs workspace dependencies and runs `tsx` or compiled JS.

---

## INFRA-3: No `.env.example` (P1)

No `.env.example` exists at the root. New developers cannot get the project running without reading source code. 12+ env vars required with no documentation.

**Fix:** Create `.env.example` with all required variables and descriptions.

---

## INFRA-4: No `.nvmrc` or `.node-version` (P2)

Node version is undocumented for local development. CI pins `node-version: 20` but no local file enforces this.

**Fix:** Add `.nvmrc` with `20` (or `22`).

---

## INFRA-5: `.gitignore` missing entries (P2)

**File:** `.gitignore`

Missing:
- `*.tsbuildinfo`
- `coverage/`
- `.env.development`, `.env.staging`, `.env.production`
- `apps/desktop/dist/`, `apps/desktop/out/`
- `e2e/playwright-report/` (already committed)

---

## INFRA-6: Root `playwright.config.ts` is unused duplicate (P3)

Two Playwright configs exist:
- `/playwright.config.ts` (root, unused)
- `/e2e/playwright.config.ts` (used by `test:e2e` script)

**Fix:** Delete root `playwright.config.ts`.

---

## INFRA-7: E2E test artifacts committed to git (P3)

**File:** `e2e/playwright-report/`

Contains committed HTML reports and screenshots. Should be gitignored.

---

## INFRA-8: `docker-compose.yml` hardcodes dev secrets (P3)

**File:** `docker-compose.yml:40-44`

`JWT_SECRET: dev-secret` and `CREDENTIAL_ENCRYPTION_KEY: dev-encryption-key` are committed. Should reference env vars with a `.env` file.

---

## INFRA-9: `docker-compose.yml` gateway service missing `restart` policy (P3)

If the gateway crashes on startup (e.g., Redis not ready), Docker won't restart it.

**Fix:** Add `restart: unless-stopped`.

---

## INFRA-10: No CI workflows for lint, typecheck, or build (P1)

Only one workflow exists (`e2e.yml`, broken). Missing:
- **ci.yml** — run `pnpm typecheck` and `pnpm lint` on PRs
- **build.yml** — verify `@ice-engine/core` builds
- **deploy.yml** — deploy gateway and web frontend
- **release.yml** — versioning and changelog

**Fix:** Add at minimum a `ci.yml` with typecheck + lint + unit tests.

---

## INFRA-11: No deployment workflow (P2)

No automated deployment of the gateway or web frontend. Manual deploys only.

---

## INFRA-12: No `pnpm audit` in CI (P2)

Dependency vulnerabilities are never checked automatically.

---

## INFRA-13: No `SECURITY.md` (P3)

No security policy for vulnerability reporting.

---

## INFRA-14: Root `package.json` has redundant `workspaces` field (P3)

**File:** `package.json:7-13`

`"workspaces"` array is npm/yarn format. pnpm uses `pnpm-workspace.yaml` as the authoritative source. The field is ignored by pnpm but may confuse other tooling.

**Fix:** Remove the `workspaces` field from `package.json`.

---

## INFRA-15: No `packageManager` field for Corepack (P3)

**File:** `package.json`

`engines.pnpm` is declared but not enforced. A `packageManager` field (e.g., `"packageManager": "pnpm@10.12.1"`) would allow `corepack` to enforce the exact version.

---

## INFRA-16: Gateway tsconfig uses `moduleResolution: "bundler"` (P2)

**File:** `apps/gateway/tsconfig.json`

`"module": "ESNext"` with `"moduleResolution": "bundler"` is for Vite/webpack, not Node.js. Production `node dist/index.js` may fail with module resolution errors.

**Fix:** Change to `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`.

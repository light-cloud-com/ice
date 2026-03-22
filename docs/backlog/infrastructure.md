# Infrastructure & CI/CD Backlog

> **Status: 15 of 16 items fixed** (2026-03-22). 1 remaining (deploy workflow) requires cloud provider config.

## INFRA-1: CI pipeline broken — references deleted `backend/` directory (P0) -- FIXED

**Fix applied:** Updated `.github/workflows/e2e.yml` — uses `packages/db` for Prisma migrations, `apps/gateway` with `tsx` for startup, Node 22, correct env vars.

---

## INFRA-2: Gateway Dockerfile missing (P0) -- FIXED

**Fix applied:** Created `apps/gateway/Dockerfile` — multi-stage build copying workspace package.json files, `pnpm install --frozen-lockfile`, Prisma generate, runs via `tsx`.

---

## INFRA-3: No `.env.example` (P1) -- FIXED

**Fix applied:** Created root `.env.example` with all 12+ required variables organized by category with descriptions.

---

## INFRA-4: No `.nvmrc` or `.node-version` (P2) -- FIXED

**Fix applied:** Created `.nvmrc` with `22`.

---

## INFRA-5: `.gitignore` missing entries (P2) -- FIXED

**Fix applied:** Added `.env.staging`, `.env.production`, `e2e/playwright-report/`, `e2e/test-results/`, `apps/desktop/dist/`, `apps/desktop/out/`.

---

## INFRA-6: Root `playwright.config.ts` is unused duplicate (P3) -- FIXED

**Fix applied:** Deleted root `playwright.config.ts`. Only `e2e/playwright.config.ts` remains.

---

## INFRA-7: E2E test artifacts committed to git (P3) -- FIXED

**Fix applied:** Added `e2e/playwright-report/` and `e2e/test-results/` to `.gitignore`.

---

## INFRA-8: `docker-compose.yml` hardcodes dev secrets (P3) -- FIXED

**Fix applied:** Removed hardcoded `JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` from docker-compose. Gateway now uses `env_file: .env` (optional) for secrets, with only non-secret env vars in docker-compose.

---

## INFRA-9: `docker-compose.yml` gateway missing `restart` policy (P3) -- FIXED

**Fix applied:** Added `restart: unless-stopped` to gateway service. Also removed obsolete `version: '3.8'`.

---

## INFRA-10: No CI workflows for lint, typecheck, or build (P1) -- FIXED

**Fix applied:** Created `.github/workflows/ci.yml` — runs typecheck, unit tests (vitest), Vite build check (`pnpm test:build`), and `pnpm audit` on PRs and pushes to main. Build check catches import resolution errors that e2e tests miss.

---

## INFRA-11: No deployment workflow (P2) -- OPEN

No automated deployment of the gateway or web frontend. Requires cloud provider configuration (GCP Cloud Run, Vercel, etc.) which is environment-specific.

---

## INFRA-12: No `pnpm audit` in CI (P2) -- FIXED

**Fix applied:** Added `pnpm audit --prod --audit-level=high` step to `.github/workflows/ci.yml`.

---

## INFRA-13: No `SECURITY.md` (P3) -- FIXED

**Fix applied:** Created `SECURITY.md` with vulnerability reporting process, supported versions, and security measures summary.

---

## INFRA-14: Root `package.json` has redundant `workspaces` field (P3) -- FIXED

**Fix applied:** Removed `workspaces` array from `package.json`. pnpm uses `pnpm-workspace.yaml` exclusively.

---

## INFRA-15: No `packageManager` field for Corepack (P3) -- FIXED

**Fix applied:** Added `"packageManager": "pnpm@10.12.1"` to root `package.json`.

---

## INFRA-16: Gateway tsconfig uses `moduleResolution: "bundler"` (P2) -- FIXED

**Fix applied:** Changed to `"module": "NodeNext"`, `"moduleResolution": "NodeNext"` for proper Node.js runtime compatibility.

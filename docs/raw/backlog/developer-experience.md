# Developer Experience Backlog

> **Status: All 10 items fixed** (2026-03-22)

## DX-1: 20 packages have no scripts (P1) -- FIXED

**Fix applied:** Added `"typecheck": "tsc --noEmit"` to all 20 packages. Added `"clean": "rm -rf dist"` to packages with build output. Root `pnpm typecheck` now checks the entire codebase.

---

## DX-2: No root `build` or `build:all` script (P2) -- FIXED

**Fix applied:** Added `"build": "pnpm -r --workspace-concurrency=1 build"` to root `package.json`.

---

## DX-3: No root `tsconfig.json` with project references (P2) -- FIXED

**Fix applied:** Created root `tsconfig.json` with `references` pointing to all 21 packages/services/apps. Excludes `packages/web` (uses Vite's own TS config).

---

## DX-4: TypeScript version inconsistency (P3) -- FIXED

**Fix applied:** Aligned all packages to `typescript: ^5.6.3` (was split between `^5.3.3` and `^5.6.3`). Root, core, types, ui, web all updated.

---

## DX-5: `@ice/db` — `prisma generate` not automated (P2) -- FIXED

**Fix applied:** Added `"postinstall": "prisma generate --schema=prisma/schema.prisma"` to `packages/db/package.json`. Fresh `pnpm install` now auto-generates the Prisma client.

---

## DX-6: `@ice/core` — Jest not configured or installed (P2) -- FIXED

**Fix applied:** Replaced `jest` scripts with `vitest` (`"test": "vitest run"`). Vitest is installed at workspace root and works with the existing test files.

---

## DX-7: Library packages use `main: "./src/index.ts"` (P3) -- FIXED (by documentation)

Intentional design for source-only workspace packages. `tsx` and Vite handle `.ts` imports directly. Only `@ice/core` compiles to `dist/`. No code change needed.

---

## DX-8: `@ice/provider-gcp` — GCP SDKs in devDependencies (P3) -- FIXED

**Fix applied:** Moved `@google-cloud/asset`, `@google-cloud/compute`, `@google-cloud/storage` from `devDependencies` to `dependencies`.

---

## DX-9: `@ice/ui` React in both `dependencies` and `peerDependencies` (P3) -- FIXED

**Fix applied:** Removed `react` and `react-dom` from `dependencies`. Kept only in `peerDependencies`.

---

## DX-10: `packages/web` duplicates Radix UI dependencies from `@ice/ui` (P3) -- FIXED

**Fix applied:** Web's `package.json` reduced to minimal direct deps (react, react-dom, react-router-dom, react-redux, lucide-react, devicon, tailwindcss-animate). Radix UI re-added as direct dep since web's remaining shared primitives import Radix directly — these resolve through pnpm's strict hoisting. All other deps (30+ packages) come transitively through `@ice/ui`.

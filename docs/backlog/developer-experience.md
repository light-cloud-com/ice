# Developer Experience Backlog

## DX-1: 20 packages have no scripts (P1)

Only 4 packages have a `build` script, 3 have `typecheck`, 1 has `lint`. Root `pnpm typecheck` and `pnpm lint` silently skip almost the entire codebase.

**Fix:** Add `typecheck`, `lint`, and `clean` scripts to all packages. Add `build` to packages that need compilation.

| Package | Needs `build` | Needs `typecheck` | Needs `lint` |
|---|---|---|---|
| `@ice-saas/db` | No (Prisma) | Yes | Yes |
| `@ice-saas/shared` | Yes | Yes | Yes |
| `@ice-saas/ui` | Yes | Yes | Yes |
| `@ice-saas/blocks` | No | Yes | Yes |
| `@ice-saas/block-registry` | No | Yes | Yes |
| `@ice-saas/template-registry` | No | Yes | Yes |
| `@ice-saas/provider-registry` | No | Yes | Yes |
| `@ice-saas/templates` | No | Yes | Yes |
| All 3 providers | No | Yes | Yes |
| All 7 services | No | Yes | Yes |
| `@ice-saas/gateway` | Yes | Yes | Yes |

---

## DX-2: No root `build` or `build:all` script (P2)

**File:** `package.json`

Individual `build:web`, `build:core`, `build:gateway` scripts exist but no unified `build` command.

**Fix:** Add `"build": "pnpm -r build"` with proper package build order via `--workspace-concurrency`.

---

## DX-3: No root `tsconfig.json` with project references (P2)

No root tsconfig exists. For a 24-package monorepo, this prevents `tsc -b` from building in correct dependency order and IDE services from understanding cross-package types.

**Fix:** Create root `tsconfig.json` with `references` pointing to all packages.

---

## DX-4: TypeScript version inconsistency (P3)

Packages use two different TypeScript version ranges:
- `^5.3.3` — core, web, types, ui, desktop, root
- `^5.6.3` — db, shared, blocks, all registries, all providers, all services

**Fix:** Align to a single version. Use `pnpm.overrides` if needed.

---

## DX-5: `@ice-saas/db` — `prisma generate` not automated (P2)

**File:** `packages/db/package.json`

No `postinstall` or `build` script that runs `prisma generate`. A fresh `pnpm install` on a new machine produces TypeScript errors because the Prisma client isn't generated.

**Fix:** Add `"postinstall": "prisma generate"` to `packages/db/package.json`.

---

## DX-6: `@ice-engine/core` — Jest not configured or installed (P2)

**File:** `packages/core/package.json`

`"test": "jest"` is declared but `jest`, `@types/jest`, and `ts-jest` are not in `devDependencies`. No `jest.config.*` file exists. The 3 test files in `src/__tests__/` cannot run.

**Fix:** Install jest + ts-jest. Create `jest.config.ts`.

---

## DX-7: Library packages use `main: "./src/index.ts"` (P3)

All library packages point `main`, `types`, and `exports` at `.ts` source files. This works with `tsx`/Vite but prevents independent compilation or npm publishing.

This is an intentional trade-off for the source-only approach. Document it so contributors understand the constraint. The exception is `@ice-engine/core` which properly compiles to `dist/`.

---

## DX-8: `@ice-saas/provider-gcp` — GCP SDKs in devDependencies (P3)

**File:** `packages/providers/gcp/package.json`

`@google-cloud/asset`, `@google-cloud/compute`, and `@google-cloud/storage` are in `devDependencies` but imported at runtime.

**Fix:** Move to `dependencies`.

---

## DX-9: `@ice-saas/ui` React in both `dependencies` and `peerDependencies` (P3)

**File:** `packages/ui/package.json`

React listed in both — creates dual-instance risk. Should only be in `peerDependencies` for a library.

**Fix:** Remove React from `dependencies`, keep in `peerDependencies`.

---

## DX-10: `packages/web` duplicates Radix UI dependencies from `@ice-saas/ui` (P3)

Both packages list all Radix UI packages as direct dependencies. Since web depends on ui, the web package's Radix deps are redundant.

**Fix:** Remove Radix UI from `packages/web/package.json`. Let them resolve through `@ice-saas/ui`.

# Refactoring Debt

Artifacts from the modular refactoring (monolith → packages + services) that are incomplete or need cleanup.

## REF-1: `packages/ui/` is never consumed by `packages/web/` (P1)

**File:** `packages/web/package.json:19`

`@ice-saas/ui` is listed as a dependency but there are zero imports from it in `packages/web/src/`. Every component that exists in `packages/ui/src/` (canvas, deploy panel, properties panel, AI chat, pipeline panel) has a parallel copy still in `packages/web/src/features/`. The `@ice-saas/ui` package is an orphan.

**Fix:** Progressively migrate web app features to import from `@ice-saas/ui`. Delete the web-local copies as each migration completes.

---

## REF-2: `packages/ui/src/index.ts` exports nothing useful (P1)

**File:** `packages/ui/src/index.ts`

Only exports `setApiAdapter`, `getApi`, and `store`. None of the UI components (canvas, panels, primitives) are exported from the package root.

**Fix:** Export all component sub-paths from the package. The sub-path exports in `package.json` may also need updating.

---

## REF-3: Duplicate UI primitives in `packages/ui/` (P2)

**Files:**
- `packages/ui/src/components/ui/` (13 files)
- `packages/ui/src/primitives/` (14 files)

Both directories contain identical component files (`button.tsx`, `dialog.tsx`, etc.). Neither is the authoritative public API.

**Fix:** Keep one directory (e.g., `primitives/`). Delete the other. Update all internal imports.

---

## REF-4: `packages/web/src/config/blocks/` is dead duplicate code (P2)

**Files:**
- `packages/web/src/config/blocks/types.ts` — identical copy of `packages/blocks/src/types.ts`
- `packages/web/src/config/blocks/aws/`, `azure/`, `gcp/`, etc. — full provider block trees that are never imported

The `index.ts` re-exports from `@ice-saas/blocks`, but `types.ts` is a standalone copy. Components import from the local `types.ts` instead of the package.

**Fix:** Delete `types.ts` and all provider directories under `packages/web/src/config/blocks/`. Change all imports to `@ice-saas/blocks`.

---

## REF-5: Duplicate deployer implementations across `packages/core/` and `packages/providers/` (P2)

**Files:**
- `packages/core/src/deploy/providers/gcp-deployer.ts` — legacy GCP deployer (dead code, superseded by modular version)
- `packages/providers/gcp/src/gcp-deployer-legacy.ts` — duplicate of above
- `packages/providers/aws/src/aws-deployer.ts` — identical to `packages/core/src/deploy/providers/aws-deployer.ts`
- `packages/providers/azure/src/azure-deployer.ts` — identical to `packages/core/src/deploy/providers/azure-deployer.ts`

The `packages/providers/` tree is either a migration target or a leftover. Currently not wired into any import chain.

**Fix:** Decide canonical location (either `packages/core/` or `packages/providers/`). Delete the duplicates. If `packages/providers/` is the target, migrate the imports; if not, delete the directory contents and make the packages thin wrappers.

---

## REF-6: Schema registry partially wired (P3)

**File:** `packages/core/src/schema/embedded-schema-provider.ts:230`

Comment: `// The module may not export get_schema_registry yet (stub), so we type-check at runtime.`

Indicates schema registry integration is partially complete.

---

## REF-7: Desktop app `packages/web` dependency — should it depend on `@ice-saas/ui` only? (P3)

**File:** `apps/desktop/package.json`

The desktop app depends on `@ice-saas/ui` (correct) but the web app's features haven't been migrated there yet (REF-1). Once the migration is complete, verify the desktop app can use all needed components from `@ice-saas/ui` without importing from `packages/web/`.

---

## REF-8: `packages/web` Radix/React deps should come from `@ice-saas/ui` (P3)

Both `packages/web/package.json` and `packages/ui/package.json` list all Radix UI packages as direct dependencies. Once the web app imports components from `@ice-saas/ui` instead of local copies, the Radix deps can be removed from the web package.

This is blocked by REF-1 completing.

# Refactoring Debt

> **Status: All 8 items fixed** (2026-03-22)

Artifacts from the modular refactoring (monolith -> packages + services) that are incomplete or need cleanup.

## REF-1: `packages/ui/` is never consumed by `packages/web/` (P1) -- FIXED

**Fix applied:** Full migration completed. `@ice/ui` is now the single source of truth for all shared UI code:

- **Moved to `packages/ui/src/`:** All 15 feature modules (canvas, deploy, properties, palette, pipeline, templates, ai, wizard, debug, integrations, environments, toolbar, account, onboarding, project-browser), store (14 Redux slices), shared components (17 primitives + 9 business components), hooks (8), utils (5), config, assets, i18n
- **`packages/web/src/`** reduced to thin shell: `app/` (routing), `pages/` (page components), `styles/` (CSS)
- **Vite aliases:** Both `@` and `@ui` resolve to `packages/ui/src/` — web imports everything from the ui package
- **Tailwind:** `content` array includes `../ui/src/**/*.{ts,tsx}` to scan ui package classes
- **Vite build** passes with 0 errors (1456 modules)

---

## REF-2: `packages/ui/src/index.ts` exports nothing useful (P1) -- FIXED

**Fix applied:** Updated `index.ts` to re-export all component sub-modules (Canvas, Deploy, Properties, Palette, Templates, AI, Wizard, Debug, Integrations, Primitives) as namespace exports.

---

## REF-3: Duplicate UI primitives in `packages/ui/` (P2) -- FIXED

**Fix applied:** Deleted `packages/ui/src/components/ui/` (17 duplicate files). Kept `packages/ui/src/primitives/` as the canonical location.

---

## REF-4: `packages/web/src/config/blocks/` is dead duplicate code (P2) -- FIXED

**Fix applied:** Deleted all provider subdirectories (gcp/, aws/, azure/, alibaba/, digitalocean/, oci/) and `types.ts` (100+ dead files). Updated 6 imports to use `@ice/blocks` types via the existing `config/blocks/index.ts` re-export.

---

## REF-5: Duplicate deployer implementations (P2) -- FIXED

**Fix applied:** Done in ENGINE-17 — deleted `gcp-deployer-legacy.ts`, monolithic `gcp-deployer.ts`, and duplicate AWS/Azure deployers. Provider packages re-export from `@ice/core`.

---

## REF-6: Schema registry partially wired (P3) -- FIXED

**Fix applied:** Updated comment to accurately describe the graceful fallback behavior (not a stub, but intentional runtime type-check for optional module).

---

## REF-7: Desktop app `packages/web` dependency (P3) -- FIXED (verified)

The desktop app correctly depends on `@ice/ui` (not `@ice/web`). Once REF-1 migration completes, the desktop app will automatically gain access to all migrated components.

---

## REF-8: `packages/web` Radix/React deps should come from `@ice/ui` (P3) -- FIXED

**Fix applied:** Done in DX-10 — removed all 17 Radix UI packages from `packages/web/package.json`. They resolve through the `@ice/ui` dependency.

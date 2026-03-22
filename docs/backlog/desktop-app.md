# Desktop App (Electron) Backlog

> **Status: 0 of 15 items fixed.** The desktop app is non-functional — it cannot build or run.

The ICE desktop app (`@ice/desktop`) is a standalone Electron application that deploys directly to cloud providers using local credentials (no backend needed). It shares UI components from `@ice/ui` but uses IPC instead of HTTP for all operations.

## DESK-1: Missing dependencies — app cannot build (P0)

**File:** `apps/desktop/package.json`

Two critical packages are imported but not in `dependencies`:
- `@electron-toolkit/utils` — used in main process for app lifecycle, optimizer, environment detection
- `electron-store` — used for encrypted credential storage

**Fix:** `pnpm --filter @ice/desktop add @electron-toolkit/utils electron-store`

---

## DESK-2: Missing HTML entry points — app cannot load (P0)

**Files missing:**
- `apps/desktop/src/main/splash.html` — referenced in electron.vite.config.ts and main/index.ts
- `apps/desktop/src/renderer/index.html` — referenced in main/index.ts

**Fix:** Create both HTML files with proper Vite/React bootstrapping.

---

## DESK-3: Deploy handler type mismatches with @ice/core (P0)

**File:** `apps/desktop/src/main/deploy-handler.ts:834-869`

6 type errors:
- `StoredResourceState` missing `type` and `provider_id` properties
- `SqliteStateStore` missing `clear_resources()` method
- `DeploymentId` branded type mismatch (string vs branded)
- `DeploymentRecord` missing `results` property

**Fix:** Update deploy-handler to match current `@ice/core` interfaces, or add missing properties to core types.

---

## DESK-4: Renderer is a placeholder — no actual UI (P1)

**File:** `apps/desktop/src/renderer/app/app.tsx`

Only renders placeholder text: "ICE Desktop — Shared UI loaded from @ice/ui". No canvas, no deploy panel, no properties panel — none of the `@ice/ui` components are imported.

**Fix:** Import and render the full ICE UI from `@ice/ui` (Canvas, Palette, Properties, Deploy, AI, Pipeline).

---

## DESK-5: Preload missing 17 API methods (P1)

**File:** `apps/desktop/src/preload/index.ts`

The preload exposes `window.api` but is missing these `IceAPI` methods:
- `pipeline.*` (9 methods: getRules, createRule, updateRule, deleteRule, getEvents, detectFramework, triggerDeploy, retryDeploy, cancelDeploy)
- `environments.*` (7 methods: list, create, update, delete, compare, promote, togglePrPreviews)
- `window.getFilePath()`, `window.isDirty()`

UI components that use these will crash at runtime.

**Fix:** Add IPC handlers in main process + expose in preload for all missing methods.

---

## DESK-6: No Redux store initialization (P1)

**File:** `apps/desktop/src/renderer/app/app.tsx`

No Redux `<Provider>` wrapper, no store import from `@ice/ui/store`. The app has no state management.

**Fix:** Import `store` from `@ice/ui`, wrap renderer in `<Provider store={store}>`, initialize API adapter with IPC adapter.

---

## DESK-7: No Tailwind CSS configuration (P1)

No `tailwind.config.js`, no CSS globals imported. All `@ice/ui` components use Tailwind classes that won't render.

**Fix:** Create `tailwind.config.js` with content paths scanning `@ice/ui/src/**`, import global CSS in renderer entry.

---

## DESK-8: No electron-builder packaging config (P1)

No `electron-builder.yml` or build config in `package.json`. Cannot produce distributable `.dmg` (macOS), `.exe/.msi` (Windows), `.AppImage` (Linux).

**Fix:** Create `electron-builder.yml` with targets for macOS (dmg), Windows (nsis), Linux (AppImage). Configure app icon, signing, auto-update.

---

## DESK-9: Hardcoded credential encryption key (P1)

**File:** `apps/desktop/src/main/ipc-handlers.ts:26-29`

```ts
encryptionKey: process.env.ICE_CREDENTIAL_KEY || 'ice-dev-only-not-for-production'
```

Falls back to a hardcoded key. Cloud provider credentials stored locally are encrypted with a predictable key.

**Fix:** Use OS keychain via `safeStorage.encryptString()` (built into Electron) or `electron-keytar`. Never fall back to a hardcoded key.

---

## DESK-10: Preload sandbox disabled — security risk (P2)

**File:** `apps/desktop/src/main/index.ts:94`

`sandbox: false` disables Chromium's sandbox, allowing renderer process to access Node.js directly. This is a security risk — a compromised renderer could access the filesystem.

**Fix:** Set `sandbox: true` and use proper `contextBridge` IPC for all renderer-to-main communication (already partially done via preload).

---

## DESK-11: IPC adapter doesn't validate API surface (P2)

**File:** `apps/desktop/src/renderer/api/ipc-adapter.ts`

Returns `window.api` without checking if all `IceAPI` methods exist. Missing methods cause runtime crashes with unhelpful errors.

**Fix:** Add runtime validation that all required `IceAPI` methods are present, with clear error messages for missing ones.

---

## DESK-12: No auto-update mechanism (P2)

No `electron-updater` configuration. Users must manually download new versions.

**Fix:** Add `electron-updater` with GitHub Releases or S3-based update server.

---

## DESK-13: devicon SVG imports broken in desktop context (P2)

`@ice/ui` assets import devicon SVGs which resolve in the web Vite context but may not resolve in electron-vite's renderer build.

**Fix:** Ensure electron.vite.config.ts has proper SVG handling (e.g., `svgr` plugin or static asset copying).

---

## DESK-14: No offline capability documentation (P3)

The desktop app should work fully offline (it deploys directly via cloud SDKs). But there's no documentation of which features work offline vs. which need network.

---

## DESK-15: No desktop-specific tests (P3)

Zero test files in `apps/desktop/`. No unit tests for IPC handlers, deploy-handler, credential storage, or GitHub service.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                │
│  - IPC Handlers (1814 lines)                           │
│  - Deploy Handler (938 lines) — direct cloud SDK calls │
│  - GitHub Service — OAuth + repo operations            │
│  - Credential Store (electron-store, encrypted)        │
│  - Menu system (native macOS/Windows menus)            │
└────────────┬────────────────────────────────────────────┘
             │ contextBridge IPC
             ↓
┌─────────────────────────────────────────────────────────┐
│              Electron Renderer (Chromium)               │
│  - @ice/ui components (Canvas, Deploy, AI, etc.)       │
│  - Redux store from @ice/ui/store                      │
│  - IPC adapter instead of HTTP adapter                 │
│  - Same UI as web, different data transport             │
└─────────────────────────────────────────────────────────┘
```

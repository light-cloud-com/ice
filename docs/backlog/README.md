# Backlog

Comprehensive audit of the ICE SaaS codebase. Initial audit: 2026-03-21. Ongoing fixes through 2026-03-23.

## Index

### Bugs & Technical Debt

| Document | Total | Fixed | Open | Description |
|---|---|---|---|---|
| [Security](security.md) | 19 | 19 | 0 | Auth vulnerabilities, credential handling, injection risks, org isolation |
| [Backend Services](backend-services.md) | 16 | 16 | 0 | Service bugs, missing features, broken integrations |
| [Frontend](frontend.md) | 23 | 23 | 0 | React bugs, UX gaps, dead code, accessibility, org isolation UI |
| [Core Engine & Deployers](core-engine.md) | 18 | 18 | 0 | Deployer coverage gaps, broken handlers, dead code |
| [Database](database.md) | 8 | 8 | 0 | Missing indexes, schema gaps, unbounded tables |
| [Infrastructure & CI/CD](infrastructure.md) | 17 | 16 | 1 | Broken CI, missing configs, Docker issues, build system, ESLint |
| [Developer Experience](developer-experience.md) | 10 | 10 | 0 | Missing scripts, testing gaps, monorepo health |
| [Refactoring Debt](refactoring-debt.md) | 8 | 8 | 0 | Incomplete migration artifacts from modular refactor |
| [Desktop App](desktop-app.md) | 15 | 15 | 0 | Electron app — now embeds full web app + backend |
| [RBAC](rbac.md) | 20 | 20 | 0 | Role enforcement across deploy, pipeline, billing, credentials, AI |

### UX & Interaction

| Document | Total | Fixed | Open | Description |
|---|---|---|---|---|
| [Context Menus](context-menus.md) | 25 | 0 | 25 | Irrelevant items, missing actions, accessibility, cross-menu consistency |

### Product & Content Gaps

| Document | Items | Description |
|---|---|---|
| [Missing Features](missing-features.md) | 27 (4 done) | Canvas, collaboration, deploy, import/export, project mgmt |
| [Missing Blocks](missing-blocks.md) | 80+ | Per-provider gap analysis, structural issues, factual errors |
| [Missing Templates](missing-templates.md) | 12 | Multi-provider variants, architecture patterns, quick-starts |

## Progress Summary

**Total fixed: 153 / 154 bugs & tech debt items (99%)**

| Domain | Fixed | Total | % |
|---|---|---|---|
| Security | 19 | 19 | 100% |
| Backend Services | 16 | 16 | 100% |
| Frontend | 23 | 23 | 100% |
| Core Engine | 18 | 18 | 100% |
| Database | 8 | 8 | 100% |
| Infrastructure & CI/CD | 16 | 17 | 94% |
| Developer Experience | 10 | 10 | 100% |
| Refactoring Debt | 8 | 8 | 100% |
| Desktop App | 15 | 15 | 100% |
| RBAC | 20 | 20 | 100% |

**Remaining 1 open item:**
- INFRA-16: Deployment workflow (requires cloud provider configuration)

## Test Coverage

| Type | Count | Framework | Scope |
|---|---|---|---|
| Unit tests | 23 | Vitest | crypto, auth, build validation, card translator |
| Feature tests | 31 | Vitest | group selection, activity feed, rollback, drift detection |
| Containment & nesting tests | 99 | Vitest | containment rules, z-index depth, reparenting, nested groups, drag-drop, expansion direction |
| Org isolation tests | 16 | Vitest | canvas service — cross-org cards, environments, moves |
| RBAC tests | 30 | Vitest | requireProjectAccess, requireOrgRole, business rules |
| E2E tests | 32 | Playwright | security, backend services, frontend flows |
| Build checks | 1 | Vite | import resolution errors |
| **Total** | **232** | | |

## Session Log

### 2026-03-23

**Missing features — 4 implemented (FEAT-3, FEAT-8, FEAT-10, FEAT-12):**

- FEAT-3: Group Selection — context menu action + `Ctrl+G` shortcut to wrap selected nodes in a `Group.Custom` container. Extensive follow-up work on group interactions (see below).
- FEAT-8: Activity Feed — new `/activity` project subpage merging AI audit logs, infra deployments, and CI/CD events into a unified timeline with filter tabs and relative timestamps.
- FEAT-10: Rollback — `POST /api/canvas/deploy/rollback` endpoint + "Rollback" button with confirmation in deploy history UI. Uses `deploy_graph` diff engine to compare target vs current deployment state.
- FEAT-12: Drift Detection — `POST /api/canvas/deploy/drift-check` endpoint + "Check for Drift" button in properties panel. Compares canvas properties against deployed outputs. Shows `drifted`/`in_sync`/`missing`/`extra` status per node with property-level diffs. Orange status indicator on canvas.
- 31 new tests across all 4 features (6 group selection, 9 activity feed, 5 rollback validation, 11 drift detection).

**Group interactions — 10 improvements (FEAT-3 follow-up):**

- Shift+drag highlight for all selected nodes (multi-select), not just the primary
- Animated dashed border (green=entering, orange=leaving) replaces broken scale(1.4) lift
- Drag-over highlight works at all zoom levels (LOD 1, 2, 3)
- Smallest-container search for drag target detection (works across all nesting levels)
- Z-index depth ordering: child groups always above parent groups (click + render)
- Container auto-expansion in all 4 directions (left/top shift position, right/bottom increase size)
- Folded nodes use visual height (36-38px) for hit-testing and containment sizing
- Unfold auto-resizes the group to fit children + expands ancestor containers
- Drop reparent uses expanded height so parent is sized for unfold
- Auto-organize: preserves folded height, skips repositioning hidden children
- Properties panel: group color picker (10 presets), removed Rename from context menu
- 88 new tests: containment rules, z-index depth, reparenting, nesting, expansion direction

**ESLint cleanup (379 → 0):**
- 218 import-x/order, 83 unused-imports, 32 react-hooks/exhaustive-deps, 21 preserve-caught-error, 15 no-case-declarations, 4 no-require-imports, 6 misc
- ~95 files across all packages and services

**Organisation isolation — backend (8 fixes):**
- `/cards/get` had no access control (any user could read any card)
- All 7 environment routes had no project access checks
- `moveProject` allowed cross-org parent folder moves
- New `POST /auth/switch-org` endpoint issues new JWT on org switch

**Organisation isolation — frontend (5 fixes):**
- Project tree now fetches from backend (was local-only localStorage)
- `switchOrganisation` thunk calls `/auth/switch-org` for new JWT
- Removed `ice-projects` localStorage persistence
- Folder CRUD wired to backend API
- ProjectWizard mounted in all views (was missing from folder/root/settings/deployments)

**Demo card removal:**
- Removed hardcoded demo card, `loadDemoToCard` action, `isDemo` flag, demo badges
- Bumped CARDS_DATA_VERSION to 5 to force-clear old localStorage
- Cards now start empty, loaded from backend

**Core Engine (6 handler fixes):**
- ENGINE-10: New domain mapping handler (Cloud Run v1 REST API)
- ENGINE-11: Dataflow update now cancels + recreates (jobs are immutable)
- ENGINE-12: GKE update supports node pool scaling + machine type changes
- ENGINE-14: Discovery Engine update PATCHes displayName/searchTier
- ENGINE-16: Terraform/Pulumi importers wired to API (`POST /api/import/*`)
- ENGINE-18: Cloud Run IAM policy moved from desktop handler into cloud-run handler

**RBAC (20 fixes):**
- Deploy plan/apply/destroy: added `requireProjectAccess` (editor/owner/owner)
- Pipeline rules/trigger/retry/cancel: added project access checks with ruleId/eventId resolvers
- Billing payment/settings/details: added `requireOrgRole` (owner / owner+admin)
- Credentials connect/disconnect: added `requireOrgRole` (owner+admin)
- AI audit scoped to org, inspect scoped to project
- Card delete escalated to owner, env promote escalated to owner
- Project members list, users list, invitations: added role checks
- New `requireOrgRole` middleware in `@ice/shared`

**Other fixes:**
- Template cycle fix (deleted self-referencing `templates.ts`)
- Fixed `use-resolve-path.ts` infinite loop from unstable deps
- Fixed `svg-compact-node.tsx` TDZ error (`repository` used before declaration)

### 2026-03-22

Initial bulk fix session: 117 items across security, backend, frontend, database, infrastructure, developer experience, refactoring debt, desktop app. See individual backlog documents.

## Architecture

- `@ice/ui` — single source of truth for all shared UI (features, store, components, hooks, utils, config, assets)
- `@ice/web` — thin shell (routing, pages, styles), all UI from `@ice/ui` via Vite alias
- `@ice/desktop` — Electron shell that embeds the full gateway + services (same code as web, no IPC handlers)
- `@ice/shared` — auth middleware (`requireAuth`, `requireProjectAccess`, `requireOrgRole`), crypto, socket setup
- SQLite + in-memory queue for desktop (no PostgreSQL/Redis needed)
- Tailwind scans `ui/src/` for class names in both web and desktop
- All packages use `@ice/*` scope

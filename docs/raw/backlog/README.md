# ICE Backlog

Single source for the state of ICE work — what's fixed, what's open, what's next. Audit started 2026-03-21. Ongoing.

---

## Open work — priority order

### P0 — blockers

| ID prefix | Area | Status |
|---|---|---|
| BLK-1…8 | Block structural issues + factual errors | **Done** (2026-04-19) — see [missing-blocks.md](missing-blocks.md) |

### P1 — ship-blockers for open source / production

| Area | Status |
|---|---|
| Deploy reliability (5 blockers, 11 friction) — see [deploy-reliability.md](deploy-reliability.md) | **Done (18/22)** (2026-04-19) — 4 RBAC items skipped (community edition, single user) |
| AI-Native #1 Ghost Mode | **Done** (2026-04-19) |
| AI-Native #2 AI error diagnosis | **Done** (2026-04-19) |
| AI-Native #3 Pre-deploy security/cost warnings | **Done** (2026-04-19) |
| AI-Native #4 Conversational architecture polish | Open |
| AI-Native #5 Smart templates with AI interview | Open |
| AI Read L1 — deployment context in AI prompt | **Done** (2026-04-19) |
| AI Read L2 — live cloud status queries | Open |
| CTX-19/20/21 — env context menu (rename, deploy, protected) | **Done** (2026-04-19) |
| INFRA-11 — deployment workflow (needs cloud provider config) | Open |
| Template multi-provider variants (AWS + Azure for Full-Stack, SaaS, RAG Chatbot, AI/ML, EU Compliance) | Done |
| Frontend containment fixes (BND-1/2/5/6) | Done |
| TMPL-1 — AWS region strings in GCP templates | Done |

### P2 — post-launch polish

AI features 4-5, AI Read L2, user-friendly properties rewrite, remaining missing features (~60 items), canvas perf, panel UX, design system, block-level gaps across providers. See per-domain docs below.

### P3 — long tail

Polish items, minor provider blocks, industry templates, real-time collaboration, project management, AI Read L3. ~90+ items.

---

## Detail documents

### Bugs & Technical Debt (99% done — 153/154)

| Document | Total | Fixed | Open | Scope |
|---|---|---|---|---|
| [security.md](security.md) | 19 | 19 | 0 | Auth, credentials, injection, org isolation |
| [backend-services.md](backend-services.md) | 16 | 16 | 0 | Service bugs, broken integrations |
| [frontend.md](frontend.md) | 23 | 23 | 0 | React bugs, UX gaps, accessibility |
| [core-engine.md](core-engine.md) | 18 | 18 | 0 | Deployer coverage, broken handlers |
| [database.md](database.md) | 8 | 8 | 0 | Indexes, schema gaps, unbounded tables |
| [infrastructure.md](infrastructure.md) | 17 | 16 | 1 | CI, Docker, build system; INFRA-11 pending cloud target |
| [developer-experience.md](developer-experience.md) | 10 | 10 | 0 | Scripts, testing, monorepo health |
| [refactoring-debt.md](refactoring-debt.md) | 8 | 8 | 0 | Migration leftovers |
| [desktop-app.md](desktop-app.md) | 15 | 15 | 0 | Electron shell + embedded gateway |
| [rbac.md](rbac.md) | 20 | 20 | 0 | Role enforcement across all routes |

### UX & Interaction

| Document | Total | Fixed | Open | Scope |
|---|---|---|---|---|
| [context-menus.md](context-menus.md) | 25 | 15 | 10 | 15 done (incl. CTX-19/20/21 as of 2026-04-19); 5 deferred, 8 won't fix, 10 still open |

### AI-Native Features (pre-launch)

| Document | Items | Status | Scope |
|---|---|---|---|
| [ai-native-features.md](ai-native-features.md) | 6 | 4/6 done | Flash-MoE backend, Ghost Mode, Error Diagnosis, Pre-deploy Warnings shipped; Conversational polish + Smart Templates open |
| [ai-read-capabilities.md](ai-read-capabilities.md) | 3 levels | 1/3 done | L1 deployment context shipped; L2 live status + L3 logs/metrics open |
| [user-friendly-properties.md](user-friendly-properties.md) | ~40 blocks | Open | Intent-based options across block properties |

### Product & Content Gaps

| Document | Items | Status | Scope |
|---|---|---|---|
| [missing-features.md](missing-features.md) | 27 | 4 done | Canvas, collab, deploy, import/export, project mgmt |
| [missing-blocks.md](missing-blocks.md) | 80+ | P0 structural items done | Per-provider gap analysis, factual errors |
| [missing-templates.md](missing-templates.md) | 12 | Multi-provider variants shipped | Architecture patterns, quick-starts |

### Frontend Polish

| Document | Items | Status | Scope |
|---|---|---|---|
| [frontend-polish.md](frontend-polish.md) | 43 | 4 done | Containment, canvas perf, panel resize, visual clutter, sizing, overall polish |

### Concepts Palette Redesign

| Document | Scope |
|---|---|
| [concepts-palette.md](concepts-palette.md) | Original 23-block concept palette spec |
| [concepts-palette-implementation.md](concepts-palette-implementation.md) | Implementation plan + open items (Auth, Analytics blocks deferred) |

### Deploy Reliability

| Document | Scope |
|---|---|
| [deploy-reliability.md](deploy-reliability.md) | 2026-04-19 audit — 5 blockers, 11 friction, 5 block-property gaps, 4 observability polish. **18/22 shipped**; 4 RBAC-tagged items (DR-H1, DR-H2, DR-F5, DR-O4) skipped because community edition is single-user. |

---

## Recent progress

### 2026-04-19 session

**P0 block fixes** — BLK-3/4/5/7/8 shipped. BLK-1/2/6 verified already resolved in earlier commits (edge validation in `connection-rules.ts`; populated `nodeDataDefaults`; public-traffic rearchitected as canvas-only concept).
- GCP event-stream: Dataflow → Pub/Sub (BLK-3)
- GCP search: Elasticsearch → Vertex AI Search (BLK-4)
- Azure vector-db → Cosmos DB (BLK-5; now distinct from Azure AI Search)
- Azure Worker block added (BLK-7)
- Storage dedup on Alibaba/OCI/DigitalOcean (BLK-8; removed 3 duplicate blueprints + stale constants)

**P1 AI features** — 4 of 7 shipped, 3 deferred:
- Ghost Mode: static rule-based companion suggestions after drop (max 3, 10s auto-dismiss)
- Error Diagnosis: "Diagnose with AI" button, `POST /ai/diagnose-deploy` endpoint, `DeployDiagnosis` component
- Pre-deploy Warnings: 6 security rules + GCP-priced cost estimator, Apply gated on critical acknowledgement
- AI Read L1: `isQuestionIntent` + `buildDeploymentContext` inject latest `CanvasDeployment` into system prompt for question intents

**CTX** — env context menu: rename action (modal + thunk + i18n), verified protected-env menu renders correctly (Deploy-only for protected), CTX-21 Deploy entry already shipped earlier.

**Deploy audit** — `docs/raw/backlog/deploy-reliability.md` captures 25 verified findings (RBAC holes on `/cleanup-orphans` + `/status`, rollback ignoring environment, OAuth token expiry mid-deploy, empty-canvas silent success, pipeline build logs not surfacing, renamed-block status orphaning, drift diffs not rendered, etc.). Attack order documented.

**LLM wiki integration** — `docs/wiki/` generated by llm-wiki Obsidian plugin. `CLAUDE.md` points Claude Code at the wiki first.

### 2026-03-23

**Missing features — 4 implemented** (FEAT-3 Group Selection, FEAT-8 Activity Feed, FEAT-10 Rollback, FEAT-12 Drift Detection) + 31 new tests. Group interactions got 10 improvements and 88 tests.

**ESLint cleanup** — 379 → 0 errors across ~95 files (218 import-x/order, 83 unused-imports, 32 react-hooks/exhaustive-deps, 21 preserve-caught-error, 15 no-case-declarations, 4 no-require-imports, 6 misc).

**Organisation isolation — 13 fixes** (8 backend, 5 frontend) — cross-org cards, environments, project-move parent folders, `/auth/switch-org` endpoint, project tree from backend, folder CRUD wired.

**Demo card removal** — hardcoded demo deleted, `CARDS_DATA_VERSION` bumped to 5, cards start empty from backend.

**Core Engine (6 handler fixes)** — ENGINE-10/11/12/14/16/18 (domain mapping, Dataflow cancel+recreate, GKE scaling, Discovery Engine PATCH, Terraform/Pulumi importers wired, Cloud Run IAM moved into handler).

**RBAC (20 fixes)** — deploy/pipeline/billing/credentials/AI/cards/envs/members/users/invitations now have `requireProjectAccess` or `requireOrgRole` middleware.

### 2026-03-22

Initial bulk fix session — 117 items across security, backend, frontend, database, infrastructure, developer experience, refactoring debt, desktop app.

---

## Test coverage

| Type | Count | Framework | Scope |
|---|---|---|---|
| Unit tests | 23 | Vitest | crypto, auth, build validation, card translator |
| Feature tests | 31 | Vitest | group selection, activity feed, rollback, drift detection |
| Containment & nesting tests | 99 | Vitest | containment rules, z-index, reparenting, nested groups, drag-drop, expansion |
| Org isolation tests | 16 | Vitest | canvas service — cross-org cards, environments, moves |
| RBAC tests | 30 | Vitest | requireProjectAccess, requireOrgRole, business rules |
| E2E tests | 32 | Playwright | security, backend services, frontend flows |
| Build checks | 1 | Vite | import resolution errors |
| **Total** | **232** | | |

---

## Architecture reminders

- `@ice/ui` — single source of truth for all shared UI (features, store, components, hooks, utils, config, assets)
- `@ice/web` — thin shell (routing, pages, styles); all UI imported from `@ice/ui` via Vite alias
- `@ice/desktop` — Electron shell that embeds the full gateway + services (same code as web, no IPC handlers)
- `@ice/shared` — auth middleware (`requireAuth`, `requireProjectAccess`, `requireOrgRole`), crypto, socket setup
- `@ice/ai` — pluggable AI provider (Flash-MoE default, Anthropic / OpenAI-compat optional)
- SQLite + in-memory queue for desktop (no PostgreSQL / Redis needed locally)
- Tailwind scans `ui/src/` for class names in both web and desktop
- All packages use `@ice/*` scope

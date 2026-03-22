# Backlog

Comprehensive audit of the ICE SaaS codebase performed on 2026-03-21, organized by domain.
Fixed on 2026-03-22.

## Index

### Bugs & Technical Debt

| Document | Total | Fixed | Open | Description |
|---|---|---|---|---|
| [Security](security.md) | 15 | 15 | 0 | Auth vulnerabilities, credential handling, injection risks |
| [Backend Services](backend-services.md) | 16 | 16 | 0 | Service bugs, missing features, broken integrations |
| [Frontend](frontend.md) | 18 | 18 | 0 | React bugs, UX gaps, dead code, accessibility |
| [Core Engine & Deployers](core-engine.md) | 18 | 12 | 6 | Deployer coverage gaps, broken handlers, dead code |
| [Database](database.md) | 8 | 8 | 0 | Missing indexes, schema gaps, unbounded tables |
| [Infrastructure & CI/CD](infrastructure.md) | 16 | 15 | 1 | Broken CI, missing configs, Docker issues, build system |
| [Developer Experience](developer-experience.md) | 10 | 10 | 0 | Missing scripts, testing gaps, monorepo health |
| [Refactoring Debt](refactoring-debt.md) | 8 | 8 | 0 | Incomplete migration artifacts from modular refactor |

### Product & Content Gaps

| Document | Items | Description |
|---|---|---|
| [Missing Features](missing-features.md) | 27 | Canvas, collaboration, deploy, import/export, project mgmt |
| [Missing Blocks](missing-blocks.md) | 80+ | Per-provider gap analysis, structural issues, factual errors |
| [Missing Templates](missing-templates.md) | 12 | Multi-provider variants, architecture patterns, quick-starts |

## Progress Summary

**Total fixed: 102 / 109 bugs & tech debt items (94%)**

- Security: 15/15 (100%)
- Backend Services: 16/16 (100%)
- Frontend: 18/18 (100%)
- Core Engine: 12/18 (67%)
- Database: 8/8 (100%)
- Infrastructure & CI/CD: 15/16 (94%)
- Developer Experience: 10/10 (100%)
- Refactoring Debt: 8/8 (100%)

**Remaining 7 open items:**
- 6 Core Engine: GCP handler stubs (domain mapping, dataflow update, GKE update, discovery engine update), Terraform/Pulumi importer UI, Cloud Run IAM policy
- 1 Infrastructure: Deployment workflow (requires cloud provider configuration)

**Test coverage added:**
- 23 unit tests (vitest): crypto, auth, build validation, card translator type maps
- 32 e2e tests (Playwright): security, backend services, frontend

**Architecture changes:**
- `@ice/ui` is now the single source of truth for all shared UI (features, store, shared components, hooks, utils, config, assets)
- `@ice/web` is a thin shell: app routing, pages, styles — all UI imports from `@ice/ui` via `@ui/` Vite alias
- Tailwind scans both `web/src/` and `ui/src/` for class names
- Vite build (`pnpm test:build`) catches import resolution errors in CI

## Priority Summary

### P0 — Fix immediately (broken or security-critical)

1. ~~**[SEC-1]** Default JWT secret / encryption key fallbacks~~ FIXED
2. ~~**[SEC-2]** Stripe webhook body parsing broken~~ FIXED
3. ~~**[SEC-3]** GitHub webhook HMAC bypass~~ FIXED
4. ~~**[SEC-4]** Command injection in build service~~ FIXED
5. ~~**[BE-1]** Billing service crashes on startup~~ FIXED
6. ~~**[INFRA-1]** CI pipeline broken~~ FIXED
7. ~~**[INFRA-2]** Gateway Dockerfile missing~~ FIXED

### P1 — Fix before production

8. ~~**[SEC-5]** JWT in OAuth redirect URL query string~~ FIXED
9. ~~**[SEC-6]** Socket.IO rooms have no authentication~~ FIXED
10. ~~**[SEC-7]** Google token login doesn't validate audience~~ FIXED
11. ~~**[SEC-8]** OAuth IDOR~~ FIXED
12. ~~**[BE-2]** Billing routes use `passport-jwt` strategy that isn't registered~~ FIXED
13. ~~**[BE-3]** Refresh tokens never rotated or revoked on reuse~~ FIXED
14. ~~**[DB-1]** Missing indexes on high-traffic query paths~~ FIXED
15. ~~**[FE-1]** Hardcoded test credentials on login page~~ FIXED
16. ~~**[FE-2]** No error boundaries — any component crash = white screen~~ FIXED
17. ~~**[ENGINE-1]** AWS/Azure canvas deployment completely non-functional~~ FIXED

### P2 — Important improvements

18-100+: See individual backlog documents for full lists.

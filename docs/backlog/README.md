# Backlog

Comprehensive audit of the ICE SaaS codebase performed on 2026-03-21, organized by domain.

## Index

### Bugs & Technical Debt

| Document | Items | Description |
|---|---|---|
| [Security](security.md) | 15 | Auth vulnerabilities, credential handling, injection risks |
| [Backend Services](backend-services.md) | 16 | Service bugs, missing features, broken integrations |
| [Frontend](frontend.md) | 18 | React bugs, UX gaps, dead code, accessibility |
| [Core Engine & Deployers](core-engine.md) | 18 | Deployer coverage gaps, broken handlers, dead code |
| [Database](database.md) | 8 | Missing indexes, schema gaps, unbounded tables |
| [Infrastructure & CI/CD](infrastructure.md) | 16 | Broken CI, missing configs, Docker issues, build system |
| [Developer Experience](developer-experience.md) | 10 | Missing scripts, testing gaps, monorepo health |
| [Refactoring Debt](refactoring-debt.md) | 8 | Incomplete migration artifacts from modular refactor |

### Product & Content Gaps

| Document | Items | Description |
|---|---|---|
| [Missing Features](missing-features.md) | 27 | Canvas, collaboration, deploy, import/export, project mgmt |
| [Missing Blocks](missing-blocks.md) | 80+ | Per-provider gap analysis, structural issues, factual errors |
| [Missing Templates](missing-templates.md) | 12 | Multi-provider variants, architecture patterns, quick-starts |

## Priority Summary

### P0 — Fix immediately (broken or security-critical)

1. **[SEC-1]** Default JWT secret / encryption key fallbacks — production can silently use `dev-secret`
2. **[SEC-2]** Stripe webhook body parsing broken — signature verification always fails
3. **[SEC-3]** GitHub webhook HMAC bypass — arbitrary deploy trigger when no secret configured
4. **[SEC-4]** Command injection in build service — user-supplied commands run with `shell: true`
5. **[BE-1]** Billing service crashes on startup — 4 broken imports from non-existent modules
6. **[INFRA-1]** CI pipeline broken — references deleted `backend/` directory
7. **[INFRA-2]** Gateway Dockerfile missing — `docker compose up` fails

### P1 — Fix before production

8. **[SEC-5]** JWT in OAuth redirect URL query string — token leakage via logs/proxies
9. **[SEC-6]** Socket.IO rooms have no authentication
10. **[SEC-7]** Google token login doesn't validate audience
11. **[SEC-8]** OAuth IDOR — `req.body.organisationId` trusted over JWT
12. **[BE-2]** Billing routes use `passport-jwt` strategy that isn't registered
13. **[BE-3]** Refresh tokens never rotated or revoked on reuse
14. **[DB-1]** Missing indexes on high-traffic query paths
15. **[FE-1]** Hardcoded test credentials on login page
16. **[FE-2]** No error boundaries — any component crash = white screen
17. **[ENGINE-1]** AWS/Azure canvas deployment completely non-functional (empty type maps)

### P2 — Important improvements

18–100+: See individual backlog documents for full lists.

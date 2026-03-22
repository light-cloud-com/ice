# Testing

## E2E Tests

**Framework:** Playwright 1.41
**Location:** `e2e/`
**Browser:** Chromium only
**Config:** `e2e/playwright.config.ts`

### Configuration

- Timeout: 45 seconds per test
- Sequential execution (workers: 1)
- Viewport: 1440x900
- Web server: Vite on port 5173 (reuses running server)

### Test Suites

| File | Coverage |
|---|---|
| `auth.spec.ts` | Login, signup, logout flows |
| `canvas-basics.spec.ts` | Node add, delete, connect |
| `infrastructure-design.spec.ts` | Multi-resource design scenarios |
| `templates.spec.ts` | Template picker and expansion |
| `deploy-flow.spec.ts` | Deploy plan + apply |
| `deploy-full.spec.ts` | Full deploy with GCP verification |
| `project-management.spec.ts` | Project/folder CRUD |
| `multi-tab.spec.ts` | Multiple canvas cards |
| `view-levels.spec.ts` | LOD toggle |
| `smoke-all-flows.spec.ts` | Comprehensive smoke test |

### Global Setup

`e2e/global-setup.ts`:

1. Polls `http://localhost:5001/api/health` (15s timeout)
2. Registers test user `test@ice-saas.dev` (or logs in if exists)
3. Exports `TEST_AUTH_TOKEN`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` to `process.env`

### Page Objects

| Page Object | Location |
|---|---|
| `LoginPage` | `e2e/pages/login.page.ts` |
| `CanvasPage` | `e2e/pages/canvas.page.ts` |
| `DeployPage` | `e2e/pages/deploy.page.ts` |

### Fixtures

- `base.fixture.ts` — authenticated browser context
- `canvas.fixture.ts` — canvas-specific setup

### Utilities

- `action-log-reader.ts` — reads Redux action log for test assertions
- `gcp-verify.ts` — verifies GCP resources after deploy
- `flow-reporter.ts` — custom test reporter

### Running

```bash
# Run all E2E tests
pnpm test:e2e

# Run specific test
pnpm test:e2e -- --grep "canvas basics"

# Run with UI
pnpm test:e2e -- --ui

# Run headed
pnpm test:e2e -- --headed
```

## CI Pipeline

**GitHub Actions:** `.github/workflows/e2e.yml`
**Trigger:** Pull requests

### Steps

1. Start PostgreSQL + Redis as GitHub Actions services
2. Install pnpm dependencies
3. Run `prisma migrate deploy`
4. Start gateway server
5. Poll health check endpoint
6. Install Playwright Chromium
7. Run `pnpm test:e2e`
8. Upload `playwright-report/` artifact on failure

### Required Secrets

- `DATABASE_URL` — PostgreSQL connection (provided by service container)
- `REDIS_URL` — Redis connection (provided by service container)
- `JWT_SECRET` — test JWT key
- `CREDENTIAL_ENCRYPTION_KEY` — test encryption key

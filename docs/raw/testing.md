# Testing

## Unit Tests

**Framework:** Vitest
**Config:** `vitest.config.ts`
**Location:** `packages/*/src/**/*.test.ts`, `services/*/src/**/*.test.ts`

```bash
pnpm test:unit
```

## E2E Tests

**Framework:** Playwright
**Location:** `e2e/`
**Browser:** Chromium
**Config:** `e2e/playwright.config.ts`

### Configuration

- Timeout: 45 seconds per test
- Sequential execution (workers: 1)
- Viewport: 1440x900
- Frontend: `http://localhost:5174`
- Backend: `http://localhost:5002`

### Test Suites

| File | Coverage |
|---|---|
| `smoke-all-flows.spec.ts` | Comprehensive smoke test |
| `canvas-basics.spec.ts` | Node add, delete, connect |
| `templates.spec.ts` | Template picker and expansion |
| `deploy-flow.spec.ts` | Deploy plan + apply |
| `deploy-full.spec.ts` | Full deploy with GCP verification |
| `project-management.spec.ts` | Project/folder CRUD |
| `multi-tab.spec.ts` | Multiple canvas cards |
| `frontend.spec.ts` | UI component tests |
| `backend-services.spec.ts` | Backend API validation |
| `security.spec.ts` | Auth, RBAC, IDOR prevention |

### Global Setup

`e2e/global-setup.ts` polls `http://localhost:5002/api/health` (15s timeout). Community edition auto-seeds a local user — no registration needed.

### Fixtures

| Fixture | Location | Purpose |
|---|---|---|
| `base.fixture.ts` | `e2e/fixtures/` | Authenticated page + API client (no JWT in community edition) |
| `canvas.fixture.ts` | `e2e/fixtures/` | Canvas interaction helpers (drag, connect, zoom) |
| `template-deploy.fixture.ts` | `e2e/fixtures/` | GCP template deploy cycle (select, plan, apply, verify, destroy) |

### Utilities

| Utility | Purpose |
|---|---|
| `action-log-reader.ts` | Reads `window.__ICE_ACTION_LOG__` for test assertions |
| `gcp-verify.ts` | gcloud CLI verification for 22 GCP resource types |
| `flow-reporter.ts` | Structured JSON test reporter |
| `error-classifier.ts` | Categorizes GCP errors (auth, quota, API, config, build, network) |
| `deploy-log-collector.ts` | Collects deploy events, resources, timing per template |
| `template-test-reporter.ts` | HTML + JSON aggregate report generator |
| `live-progress.ts` | Writes progress.json for live dashboard updates |

### Running E2E

```bash
# Start the full stack first
pnpm dev:all

# Run all E2E tests
pnpm test:e2e

# Run specific test
pnpm test:e2e -- --grep "canvas basics"

# Run headed (visible browser)
pnpm test:e2e -- --headed
```

---

## GCP Integration Tests

End-to-end testing of ICE templates against real GCP infrastructure. All actions happen through the browser UI (Playwright drives a visible Chrome window).

### Prerequisites

1. **GCP Project** with billing enabled
2. **Service Account Key** (JSON) with roles:
   - `roles/editor` (or specific resource roles)
   - `roles/serviceusage.serviceUsageAdmin` (for auto-enabling APIs)
3. **GitHub PAT** with `repo` scope (for test repo creation and GitHub connection)
4. **ICE stack running**: `pnpm dev:all` (gateway on 5002, frontend on 5174)

### Setup

```bash
# 1. Add to .env:
ICE_TEST_GITHUB_TOKEN=ghp_your_token_here

# 2. Place SA key in project root:
# lc-ice-XXXXXXXX.json (gitignored)
```

### Interactive Dashboard

```bash
pnpm test:dashboard
# Opens http://localhost:15200
```

The dashboard provides:

- **Pre-flight checks**: Green/red dots for backend + frontend status
- **Config**: GCP project, region, SA key path, GitHub PAT (auto-loaded from .env)
- **Create Test Repos**: Creates `ice-test-hello-api`, `ice-test-hello-static`, `ice-test-hello-python`, `ice-test-hello-data` in `light-cloud-com` GitHub org
- **Template selection**: Checkboxes for all 41 templates, grouped by category, with search + filter
- **Run / Stop**: Starts Playwright in a visible Chrome window
- **Live progress**: Per-template phase dots, progress bar, elapsed time
- **Output log**: Real-time process output
- **Error feed**: Classified errors as they occur
- **View Report**: Opens the HTML report after run completes

### CLI

```bash
# Run specific templates
ICE_TEST_GCP_PROJECT=lc-ice \
ICE_TEST_SA_KEY_PATH=lc-ice-7d951349384c.json \
ICE_TEST_TEMPLATES=qs-static-site \
pnpm test:gcp

# Template selection syntax:
# By ID:        ICE_TEST_TEMPLATES=qs-static-site,qs-api-only
# By category:  ICE_TEST_TEMPLATES=@quick-start
# By difficulty: ICE_TEST_TEMPLATES=#starter
# All:          (omit ICE_TEST_TEMPLATES)
```

### Test Flow (per template)

Each template runs through this UI-driven lifecycle:

1. **Navigate** to `/templates` gallery
2. **Search** for template by name
3. **Click** template card to open details
4. **Click "Create"** to create project and navigate to canvas
5. **Wait** for canvas nodes to load
6. **Close AI chat** panel (covers deploy button)
7. **Click deploy rocket** (`#ice-btn-deploy`) to open deploy page
8. **Configure**: select GCP provider, enter project ID, select region
9. **Plan**: click Plan, wait for action log response
10. **Apply**: click Apply, wait for deploy completion (up to 10 min)
11. **Verify**: gcloud CLI checks each created resource exists
12. **Destroy**: click Destroy, wait for completion
13. **Verify removal**: gcloud CLI confirms resources deleted
14. **Capture**: screenshots, action log, deploy logs, errors

### Reports

After each run, reports are generated in `test-results/gcp/`:

| File | Contents |
|---|---|
| `gcp-template-report-{timestamp}.html` | Self-contained HTML with summary, per-template details, phase timeline, resource table, errors, screenshots |
| `gcp-template-report-{timestamp}.json` | Machine-readable full data |
| `latest-report.html` / `latest-report.json` | Symlink to most recent report |
| `progress.json` | Live progress state (read by dashboard) |
| `debug/*.png` | Debug screenshots from fixture steps |
| `{template-id}-{step}.png` | Screenshots at each phase |

### GitHub Test Repos

Templates that deploy Cloud Run services need source code repos. The dashboard creates these in `light-cloud-com` org:

| Repo | Contents | Used By |
|---|---|---|
| `ice-test-hello-api` | Express.js + Dockerfile | Web+DB, Web+API, API Only, Serverless |
| `ice-test-hello-static` | nginx + HTML + Dockerfile | Static Site |
| `ice-test-hello-python` | Flask + gunicorn + Dockerfile | (available for future templates) |
| `ice-test-hello-data` | Python data script + Dockerfile | Data Pipeline |

### GCP Resource Verification

The `gcp-verify.ts` utility supports all 22 GCP resource types via gcloud CLI:

| Type | gcloud Command |
|---|---|
| `gcp.run.service` | `gcloud run services describe` |
| `gcp.run.job` | `gcloud run jobs describe` |
| `gcp.sql.databaseInstance` | `gcloud sql instances describe` |
| `gcp.storage.bucket` | `gcloud storage buckets describe` |
| `gcp.pubsub.topic` | `gcloud pubsub topics describe` |
| `gcp.firestore.database` | `gcloud firestore databases describe` |
| `gcp.redis.instance` | `gcloud redis instances describe` |
| `gcp.secretmanager.secret` | `gcloud secrets describe` |
| `gcp.bigquery.dataset` | `gcloud bq show` |
| `gcp.cloudfunctions.function` | `gcloud functions describe` |
| `gcp.container.cluster` | `gcloud container clusters describe` |
| `gcp.cloudscheduler.job` | `gcloud scheduler jobs describe` |
| `gcp.apigateway.api` | `gcloud api-gateway apis describe` |
| `gcp.identityplatform.config` | `gcloud identity-platform config describe` |
| `gcp.compute.globalForwardingRule` | `gcloud compute forwarding-rules describe` |
| `gcp.logging.sink` | `gcloud logging sinks describe` |
| `gcp.aiplatform.endpoint` | `gcloud ai endpoints describe` |
| `gcp.aiplatform.index` | `gcloud ai indexes describe` |
| `gcp.discoveryengine.searchEngine` | `gcloud discovery-engine engines describe` |
| `gcp.dataflow.job` | `gcloud dataflow jobs list --filter` |
| `gcp.run.domainMapping` | `gcloud run domain-mappings describe` |
| `gcp.pubsub.subscription` | `gcloud pubsub subscriptions describe` |

### Error Classification

Deploy errors are automatically categorized:

| Category | Patterns | Suggestion |
|---|---|---|
| `api_not_enabled` | API not enabled, SERVICE_DISABLED | Enable API in console or `gcloud services enable` |
| `auth` | UNAUTHENTICATED, token expired | Check SA key validity |
| `permission` | PERMISSION_DENIED, 403 | Grant required IAM role |
| `quota` | QUOTA_EXCEEDED, 429 | Request quota increase |
| `config` | INVALID_ARGUMENT, 400 | Check resource configuration |
| `build` | Build failed, Dockerfile error | Check source code + Dockerfile |
| `network` | UNAVAILABLE, ECONNREFUSED | Check connectivity |
| `timeout` | DEADLINE_EXCEEDED | Increase timeout |

### Ports

| Port | Service |
|---|---|
| 5002 | ICE Gateway (dev) |
| 5174 | ICE Frontend (Vite dev) |
| 15200 | GCP Test Dashboard |

---

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

# ICE SaaS

**Infrastructure Compiler Engine** — a visual infrastructure design and deployment platform by [Light Cloud](https://light-cloud.com).

Design cloud infrastructure by dragging blocks onto a canvas, connect them, and deploy real resources to GCP, AWS, or Azure. An AI assistant (Claude) can modify the canvas via natural language. Ships as both a **web SaaS** and an **Electron desktop app** sharing the same UI.

## Quick Start

```bash
# Prerequisites: Node >= 18, pnpm >= 8, Docker

# 1. Start local infrastructure (PostgreSQL + Redis)
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Run database migrations
pnpm --filter @ice-saas/db prisma migrate deploy

# 4. Start development
pnpm dev:saas
```

This launches the gateway API on `http://localhost:5001` and the web app on `http://localhost:5173`.

### Environment Variables

Copy `.env.example` to `.env` in the project root (or `apps/gateway/`):

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | JWT signing key |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | AES-256 key for provider credentials |
| `ANTHROPIC_API_KEY` | For AI | Claude API key |
| `FRONTEND_URL` | Yes | CORS origin (`http://localhost:5173`) |
| `GITHUB_CLIENT_ID` | For GitHub | GitHub OAuth app ID |
| `GITHUB_CLIENT_SECRET` | For GitHub | GitHub OAuth app secret |
| `GOOGLE_CLIENT_ID` | For Google Auth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Google Auth | Google OAuth client secret |

## Architecture

ICE is a pnpm monorepo organized into three layers:

```
ice-saas/
├── packages/          Shared libraries (core engine, UI, types, blocks, etc.)
├── services/          Backend domain services (IAM, canvas, deploy, AI, etc.)
└── apps/              Runnable applications (API gateway, Electron desktop)
```

### Packages (Shared Libraries)

| Package | Description |
|---|---|
| [`@ice-saas/types`](docs/packages.md#types) | Shared TypeScript interfaces — API contracts, event shapes |
| [`@ice-saas/db`](docs/packages.md#db) | Prisma ORM client + schema (PostgreSQL) |
| [`@ice-saas/shared`](docs/packages.md#shared) | Auth middleware, encryption, Socket.IO service |
| [`@ice-engine/core`](docs/core-engine.md) | Graph engine, deploy orchestration, multi-cloud importers |
| [`@ice-saas/block-registry`](docs/plugin-system.md#block-registry) | `defineBlock()` plugin registration API |
| [`@ice-saas/provider-registry`](docs/plugin-system.md#provider-registry) | `defineProvider()` plugin registration API |
| [`@ice-saas/template-registry`](docs/plugin-system.md#template-registry) | `defineTemplate()` plugin registration API |
| [`@ice-saas/blocks`](docs/plugin-system.md#blocks) | All block definitions across 7 cloud providers |
| [`@ice-saas/templates`](docs/plugin-system.md#templates) | Pre-built infrastructure template compositions |
| [`@ice-saas/providers/*`](docs/plugin-system.md#providers) | Cloud provider deployer implementations (GCP, AWS, Azure) |
| [`@ice-saas/ui`](docs/frontend.md#ui-library) | Shared React component library (canvas, panels, primitives) |
| [`@lightcloud/web`](docs/frontend.md) | Web SaaS frontend (React + Vite) |

### Services (Backend)

All services export an Express Router factory (`createXxxRouter()`) composed by the gateway.

| Service | Prefix | Description |
|---|---|---|
| [`service-iam`](docs/services.md#iam) | `/api/auth`, `/api/profile`, `/api/organisations` | Auth, OAuth, users, orgs, onboarding |
| [`service-canvas`](docs/services.md#canvas) | `/api/canvas`, `/api/environments` | Canvas CRUD, environments, project members |
| [`service-deploy`](docs/services.md#deploy) | `/api/canvas/deploy`, `/api/pipeline`, `/api/webhooks` | Deploy engine, CI/CD pipeline, GitHub webhooks |
| [`service-ai`](docs/services.md#ai) | `/api/ai` | Claude-powered AI assistant (SSE streaming) |
| [`service-engine`](docs/services.md#engine) | `/api/schemas`, `/api/resources` | Schema + resource metadata from core engine |
| [`service-credentials`](docs/services.md#credentials) | `/api/providers`, `/api/github` | Encrypted credential storage |
| [`service-billing`](docs/services.md#billing) | `/api/billing` | Stripe subscription billing |

### Apps (Runnables)

| App | Description |
|---|---|
| [`gateway`](docs/services.md#gateway) | Express server composing all services at `/api` (port 5001) |
| [`desktop`](docs/desktop.md) | Electron app — same UI, local deploys via IPC |

## Documentation

| Document | Contents |
|---|---|
| [Architecture Overview](docs/architecture.md) | System design, data flow, dependency graph |
| [Core Engine](docs/core-engine.md) | Graph processing, plan/apply, deployers, importers |
| [Services](docs/services.md) | Backend service APIs, gateway composition |
| [Frontend](docs/frontend.md) | Web app structure, routing, state management, canvas |
| [Desktop App](docs/desktop.md) | Electron architecture, IPC bridge, local deploys |
| [Plugin System](docs/plugin-system.md) | Block, template, and provider registries |
| [Database Schema](docs/database.md) | Prisma models, migrations, relationships |
| [AI System](docs/ai-system.md) | Claude integration, operation schema, streaming pipeline |
| [Real-time & Sockets](docs/realtime.md) | Socket.IO rooms, event types |
| [Testing](docs/testing.md) | E2E setup, test structure, CI pipeline |
| [Development Guide](docs/development.md) | Local setup, scripts, workspace commands |

## Scripts

```bash
pnpm dev:saas          # Start gateway + web app
pnpm dev:web           # Web app only (Vite, port 5173)
pnpm dev:gateway       # Gateway API only (port 5001)
pnpm build:web         # Production build of web app
pnpm build:core        # Compile core engine
pnpm build:gateway     # Compile gateway
pnpm test:e2e          # Run Playwright E2E tests
pnpm typecheck         # TypeScript check across all packages
pnpm lint              # Lint all packages
pnpm clean             # Remove all node_modules and build artifacts
```

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, Vite 5, Redux Toolkit, Tailwind CSS, Radix UI, Custom SVG Canvas |
| Backend | Express, Prisma 6, PostgreSQL 16, Redis 7, BullMQ, Socket.IO |
| AI | Anthropic Claude API (streaming SSE) |
| Desktop | Electron 28, electron-vite, IPC bridge |
| Cloud | Google Cloud SDK, AWS SDK, Azure SDK |
| Testing | Playwright, GitHub Actions CI |
| Infra | Docker Compose, pnpm workspaces |

## License

This project is licensed under the **ICE Source Available License v1.0** — a custom source-available license. You may view, modify, and redistribute the code for non-production purposes. Production use requires a commercial license, except for qualifying non-profit organisations serving marginalised communities. See [LICENSE](LICENSE) for full terms.

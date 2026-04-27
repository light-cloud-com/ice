# ICE — Integrated Cloud Environment

[![CI](https://github.com/light-cloud-com/ice/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/light-cloud-com/ice/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron-desktop-47848F?logo=electron)](apps/desktop)

Design cloud infrastructure visually. Deploy to GCP with one click.

ICE is a free and open-source (Apache 2.0) visual infrastructure platform. Drag blocks onto a canvas, connect them, configure properties, and deploy real cloud resources. An optional AI assistant (Claude) can modify the canvas via natural language.

Ships as a **self-hosted web app** and a **standalone Electron desktop app**. A fully-managed hosted version (**ICE Cloud**) is in the works — [join the waitlist](https://light-cloud.com). Self-hosting is and will always be fully supported.

## Getting Started

```bash
# Prerequisites: Node >= 22, pnpm >= 10

# 1. Clone and install
git clone https://github.com/light-cloud-com/ice.git
cd ice
pnpm install

# 2. Start the app
pnpm dev:all
```

That's it. Open **http://localhost:5173** — no login required, you're straight on the canvas.

`dev:all` starts the API gateway on port 15173 and the web app on port 5173. Storage is a workspace-local SQLite file — no Docker, PostgreSQL, or Redis required. For a production-like setup with PostgreSQL + Redis, see [docs/getting-started.md](docs/getting-started.md).

### Desktop App (Electron)

```bash
pnpm dev:desktop
```

The desktop app is fully self-contained — it embeds the backend, uses a local SQLite database, and works offline. No Docker required.

### Configuration

Copy `.env.example` to `.env`. Only three variables are required:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | SQLite file path (dev default) or PostgreSQL URL (prod) |
| `JWT_SECRET` | Yes | Any random string |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | Any 32-character string |
| `ANTHROPIC_API_KEY` | Optional | Enables AI assistant ([get a key](https://console.anthropic.com)) |

Everything else works out of the box.

## What Can It Do

- **Visual canvas** — drag cloud resource blocks, connect them, configure via properties panel
- **Deploy to GCP** — 20 service handlers: Cloud Run, Cloud SQL, Cloud Storage, Pub/Sub, Firestore, BigQuery, Vertex AI, GKE, and more
- **Import existing infra** — scan your GCP project and import 45+ resource types onto the canvas
- **CI/CD pipelines** — connect GitHub repos to canvas nodes, auto-deploy on push
- **Environments** — production, staging, development, PR previews
- **AI assistant** — describe what you want in natural language, Claude modifies the canvas
- **Templates** — pre-built infrastructure patterns (SaaS starter, RAG chatbot, full-stack, etc.)
- **Multiple organisations** — organise projects into separate workspaces
- **i18n** — English and Mandarin

## Architecture

```
ice/
├── packages/           Shared libraries
│   ├── core            Infrastructure engine (graph, deploy, import, schemas)
│   ├── ui              React components (canvas, panels, palette, AI chat)
│   ├── web             Web app shell (Vite + React)
│   ├── blocks          Cloud resource block definitions
│   ├── templates       Pre-built infrastructure templates
│   ├── providers/gcp   GCP deployer (20 service handlers)
│   ├── providers/aws   AWS deployer
│   ├── providers/azure  Azure deployer
│   ├── db              Prisma ORM (PostgreSQL + SQLite)
│   ├── shared          Auth middleware, encryption, Socket.IO
│   └── types           Shared TypeScript interfaces
├── services/           Backend services
│   ├── canvas          Project & environment CRUD
│   ├── deploy          Deploy engine, CI/CD pipelines, GitHub webhooks
│   ├── ai              Claude AI assistant (SSE streaming)
│   ├── engine          Schema & resource metadata API
│   ├── credentials     Encrypted cloud provider credential storage
│   └── iam             User profile, organisations
├── apps/
│   ├── gateway         Express API gateway (composes all services)
│   └── desktop         Electron desktop app (embedded backend)
└── docs/               Documentation
```

## GCP Resources Supported

| Category | Services |
|---|---|
| Compute | Cloud Run (services + jobs), Cloud Functions, GKE |
| Database | Cloud SQL (PostgreSQL, MySQL), Firestore, Memorystore Redis |
| Storage | Cloud Storage |
| Messaging | Pub/Sub, Cloud Scheduler |
| AI/ML | Vertex AI (LLM endpoints, Vector Search, ML models) |
| Analytics | BigQuery, Discovery Engine |
| Security | Secret Manager, Identity Platform |
| Networking | API Gateway, Load Balancer, Domain Mapping |
| Observability | Cloud Logging |

All services support create, update, and delete with real-time progress streaming.

## Scripts

```bash
# Development
pnpm dev:all            # Start gateway + web (SQLite, no Docker)
pnpm dev:gateway        # API gateway only (port 15173 via dev:all env, else 5002)
pnpm dev:web            # Web app only (Vite, port 5173)
pnpm dev:desktop        # Electron desktop app

# Build
pnpm build              # Build all packages
pnpm dist:desktop       # Package Electron for distribution

# Testing
pnpm test:unit          # Vitest unit tests
pnpm test:e2e           # Playwright E2E tests
pnpm test:gcp           # GCP integration tests (requires env vars)
pnpm test:scenarios     # Declarative-YAML deployment scenarios (requires env vars)
pnpm test:dashboard     # Interactive GCP test dashboard (port 15200)

# Quality
pnpm typecheck          # TypeScript check all packages
pnpm lint               # Lint all packages
pnpm format             # Prettier format all files
```

## GCP Integration Testing

Test all ICE templates against real GCP infrastructure with a visible browser:

```bash
pnpm dev:all            # Terminal 1
pnpm test:dashboard     # Terminal 2 — opens http://localhost:15200
```

The dashboard provides template selection (checkboxes), GCP/GitHub configuration, test repo creation, run/stop controls, live progress, and HTML report generation. See [docs/testing.md](docs/testing.md) for the full guide.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, Vite, Redux Toolkit, Tailwind CSS, Radix UI, Custom SVG Canvas |
| Backend | Express, Prisma 6, PostgreSQL 16, Redis, BullMQ, Socket.IO |
| AI | Anthropic Claude API (streaming SSE) |
| Desktop | Electron, electron-vite, embedded gateway |
| Cloud | Google Cloud SDK (20 services), AWS SDK, Azure SDK |
| Testing | Playwright, Vitest |

## Documentation

The [`docs/`](docs/) folder has long-form guides and reference pages. Start with [docs/README.md](docs/README.md) for the full index; the short list:

- [Getting Started](docs/getting-started.md) — install, first run, troubleshooting
- [Architecture](docs/architecture.md) — system overview with diagrams
- [Deploying to GCP](docs/deploying-to-gcp.md) — end-to-end tutorial
- [Core Engine](docs/core-engine.md) — graph, schemas, plan/apply, importers
- [Frontend](docs/frontend.md) — React app, SVG canvas, Redux slices
- [Services](docs/services.md) — the six backend services
- [Database](docs/database.md) — Prisma schema, SQLite vs Postgres
- [Desktop](docs/desktop.md) — Electron architecture and packaging status
- [AI Assistant](docs/ai-assistant.md) — Claude integration, streaming, tool use
- [Blocks Reference](docs/blocks-reference.md) — the concept palette
- [Testing](docs/testing.md) — unit, integration, E2E, GCP integration dashboard
- [Contributing](docs/contributing.md) — dev loop, where to start reading
- [Community Edition](docs/community-edition.md) — how self-hosted relates to ICE Cloud

See also [ROADMAP.md](ROADMAP.md) for what's shipped, in progress, and planned.

## Contributing

ICE is open source under Apache 2.0. Issues, feature requests, and pull requests are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

## License

**[Apache License, Version 2.0](LICENSE)** — free for any use, including commercial. See [NOTICE](NOTICE) for attribution and [COMMUNITY_PLEDGE.md](COMMUNITY_PLEDGE.md) for our commitment to qualifying non-profit organisations on ICE Cloud.

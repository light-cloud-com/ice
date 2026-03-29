# ICE — Integrated Cloud Environment

Design cloud infrastructure visually. Deploy to GCP with one click.

ICE is an open-source visual infrastructure platform. Drag blocks onto a canvas, connect them, configure properties, and deploy real cloud resources. An optional AI assistant (Claude) can modify the canvas via natural language.

Ships as a **self-hosted web app** and a **standalone Electron desktop app**.

## Getting Started

```bash
# Prerequisites: Node >= 22, pnpm >= 10, Docker

# 1. Clone and install
git clone https://github.com/light-cloud-com/ice.git
cd ice
pnpm install

# 2. Start infrastructure + app
pnpm dev:all
```

That's it. Open **http://localhost:5174** — no login required, you're straight on the canvas.

`dev:all` starts PostgreSQL, Redis (via Docker), the API gateway on port 5002, and the web app on port 5174.

### Desktop App (Electron)

```bash
pnpm dev:desktop
```

The desktop app is fully self-contained — it embeds the backend, uses a local SQLite database, and works offline. No Docker required.

### Configuration

Copy `.env.example` to `.env`. Only three variables are required:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
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
pnpm dev:all            # Start everything (Docker + gateway + web)
pnpm dev:gateway        # API gateway only (port 5002)
pnpm dev:web            # Web app only (Vite, port 5174)
pnpm dev:desktop        # Electron desktop app
pnpm build              # Build all packages
pnpm dist:desktop       # Package Electron for distribution
pnpm test:e2e           # Playwright E2E tests
pnpm typecheck          # TypeScript check all packages
pnpm lint               # Lint all packages
```

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

See the [`docs/`](docs/) folder:

- [Architecture](docs/architecture.md) — system design, data flow
- [Core Engine](docs/core-engine.md) — graph processing, deploy, importers
- [Frontend](docs/frontend.md) — web app, state management, canvas
- [Desktop](docs/desktop.md) — Electron architecture
- [Database](docs/database.md) — Prisma schema
- [AI System](docs/ai-system.md) — Claude integration
- [Community Edition](docs/community-edition.md) — what differs from SaaS

## Contributing

ICE is source-available. We welcome issues, feature requests, and pull requests.

## License

**ICE Source Available License v1.0** — you may view, modify, and redistribute for non-production purposes. Production use requires a commercial license, except for qualifying non-profit organisations. See [LICENSE](LICENSE).

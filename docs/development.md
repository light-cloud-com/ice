# Development Guide

## Prerequisites

- Node.js >= 22
- pnpm >= 10
- Docker (for PostgreSQL + Redis)
- gcloud CLI (for GCP integration tests)

## Initial Setup

```bash
# 1. Clone the repo
git clone <repo-url> && cd ice-saas

# 2. Install dependencies
pnpm install

# 3. Start local infrastructure
docker compose up -d

# 4. Configure environment
cp .env.example .env
# Edit .env with your values (see README for required vars)

# 5. Run database migrations
pnpm --filter @ice/db prisma migrate deploy

# 6. Start development
pnpm dev:saas
```

## Development Scripts

| Command | Description |
|---|---|
| `pnpm dev:all` | Docker (Postgres+Redis) + gateway (5002) + web (5174) |
| `pnpm dev:saas` | Gateway + web (no Docker) |
| `pnpm dev:web` | Web frontend only |
| `pnpm dev:gateway` | API gateway only |
| `pnpm dev:desktop` | Full Electron desktop app (embedded gateway + web) |
| `pnpm build` | Build all packages |
| `pnpm build:web` | Production build of web app |
| `pnpm build:core` | Compile core engine |
| `pnpm build:gateway` | Compile gateway |
| `pnpm test:unit` | Run Vitest unit tests |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm test:gcp` | Run GCP integration tests (requires env vars) |
| `pnpm test:dashboard` | Start interactive GCP test dashboard (port 15200) |
| `pnpm typecheck` | TypeScript check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Prettier format all files |
| `pnpm clean` | Remove all node_modules + build artifacts |

## Workspace Commands

Run commands in specific packages:

```bash
# Run in a specific package
pnpm --filter @ice/db prisma studio
pnpm --filter @ice/web dev
pnpm --filter @ice/gateway build

# Run across all packages
pnpm -r typecheck
pnpm -r build
```

## Local Infrastructure

`docker-compose.yml` provides:

| Service | Port | Details |
|---|---|---|
| PostgreSQL 16 | 5557 | Database `ice_community`, user `ice`, password `icedev` |
| Redis 7 | 6380 | Queue backend for BullMQ |
| ICE Gateway | 5002 | API server (dev mode) |
| ICE Frontend | 5174 | Vite dev server |
| GCP Test Dashboard | 15200 | Interactive test runner UI |

```bash
docker compose up -d     # Start
docker compose down      # Stop
docker compose down -v   # Stop + delete volumes (reset data)
```

## Database

```bash
# Apply migrations
pnpm --filter @ice/db prisma migrate deploy

# Create new migration
pnpm --filter @ice/db prisma migrate dev --name my_migration

# Open Prisma Studio (GUI)
pnpm --filter @ice/db prisma studio

# Reset database
pnpm --filter @ice/db prisma migrate reset

# Generate client after schema changes
pnpm --filter @ice/db prisma generate
```

## Adding a New Block

1. Create the block file in `packages/blocks/src/<provider>/<category>/`:

```typescript
import { defineBlock } from '@ice/block-registry'

export const myBlock = defineBlock({
  id: '<provider>-<name>',
  name: 'My Block',
  provider: '<provider>',
  category: '<category>',
  properties: [...],
  connections: { inputs: [...], outputs: [...] },
})
```

2. Import and re-export from `packages/blocks/src/index.ts`

## Adding a New Service

1. Create `services/<name>/` with `package.json` and `src/index.ts`
2. Export a `create<Name>Router()` factory returning an Express Router
3. Mount the router in `apps/gateway/src/index.ts`
4. Add the package to gateway's `package.json` dependencies

## Adding a New Template

1. Create the template file in `packages/templates/src/`:

```typescript
import { ComposedTemplate } from './types'

export const myTemplate: ComposedTemplate = {
  id: 'my-template',
  name: 'My Template',
  blocks: [...],
  connections: [...],
}
```

2. Import and add to `ALL_TEMPLATES` in `packages/templates/src/index.ts`

## Project Structure Reference

```
ice-saas/
├── apps/
│   ├── desktop/          Electron desktop app
│   └── gateway/          Express API gateway
├── packages/
│   ├── block-registry/   defineBlock() API
│   ├── blocks/           All block definitions (7 providers)
│   ├── core/             Graph engine, deployers, importers
│   ├── db/               Prisma schema + client
│   ├── provider-registry/ defineProvider() API
│   ├── providers/
│   │   ├── gcp/          GCP deployer
│   │   ├── aws/          AWS deployer
│   │   └── azure/        Azure deployer
│   ├── shared/           Auth middleware, crypto, sockets
│   ├── template-registry/ defineTemplate() API
│   ├── templates/        Pre-built infrastructure templates
│   ├── types/            Shared TypeScript interfaces
│   ├── ui/               Shared React component library
│   └── web/              Web SaaS frontend
├── services/
│   ├── ai/               Claude AI assistant
│   ├── billing/          Stripe billing
│   ├── canvas/           Canvas + environment CRUD
│   ├── credentials/      Encrypted credential storage
│   ├── deploy/           Deploy engine + CI/CD pipeline
│   ├── engine/           Schema + resource metadata API
│   └── iam/              Auth, users, orgs
├── e2e/                  Playwright E2E tests
│   ├── tests/            Test specs (smoke, deploy, GCP integration)
│   ├── fixtures/         Playwright fixtures (base, canvas, template-deploy)
│   ├── utils/            Test utilities (gcp-verify, error-classifier, reporters)
│   ├── dashboard/        Interactive GCP test dashboard (server + UI)
│   └── repos/            GitHub test repo creation for Cloud Run
├── docker-compose.yml    Local dev infrastructure
└── package.json          Root workspace config
```

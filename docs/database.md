# Database

ICE uses Prisma as the ORM and supports two backends: SQLite for Community Edition (default) and PostgreSQL for ICE Cloud or production-grade self-hosting. The schema is the same; only the datasource differs.

## Where it lives

```
packages/db/
├── prisma/
│   ├── schema.prisma        The single schema
│   ├── migrations/          Migration history
│   └── seed.ts              Seed script
├── src/
│   └── index.ts             Exports the PrismaClient singleton
└── scripts/                 Helper scripts for dev
```

## Choosing a backend

| Mode | `DATABASE_URL` | Use |
|---|---|---|
| Desktop / Community Edition | `file:../../.desktop-dev.db` | Single-process, no extra infra. Default. |
| Self-hosted server | `postgresql://user:pass@host:5432/ice` | Multi-process, horizontal scale. |
| CI E2E | `postgresql://…` | Matches prod; see `.github/workflows/e2e.yml`. |

The Prisma schema uses only features supported by both backends. Engine selection happens automatically from the `DATABASE_URL` scheme.

## Running migrations

```bash
pnpm dev:setup                            # create + push the dev DB (SQLite)
pnpm --filter @ice/db exec prisma migrate dev --name my-change
pnpm --filter @ice/db exec prisma generate
```

For Postgres deployments:

```bash
DATABASE_URL=postgresql://… \
  pnpm --filter @ice/db exec prisma migrate deploy
```

## Core tables (at a glance)

The full schema is in `packages/db/prisma/schema.prisma`. The shape that matters:

```mermaid
erDiagram
    User ||--o{ Organization : "member of"
    Organization ||--o{ CanvasProject : owns
    CanvasProject ||--o{ Environment : has
    Environment ||--o{ Deployment : produces
    CanvasProject ||--o{ Pipeline : has
    User ||--o{ ProviderCredential : owns
    User ||--o{ GitHubInstallation : owns
    Deployment ||--o{ DeployEvent : logs
    Environment ||--o{ DeployState : "last-applied"
```

- **User, Organization** — auth + multi-tenant scope. Community Edition auto-seeds a single user and single org.
- **CanvasProject** — one project = one canvas. Holds cards + edges as JSON.
- **Environment** — production, staging, preview branches. Each has its own deploy state.
- **Deployment** — one apply run. Holds the plan, the result, and a link to the DeployEvent stream.
- **DeployEvent** — append-only per-node progress log. Powers the live canvas updates.
- **DeployState** — the last-applied graph per environment. The input to the next plan.
- **Pipeline** — CI/CD wiring (GitHub repo + branch → environment).
- **ProviderCredential** — encrypted cloud provider creds (AES-256-GCM, key from `CREDENTIAL_ENCRYPTION_KEY`).
- **GitHubInstallation** — OAuth / App installation records.

## JSON columns

A few columns are Prisma `Json` — notably `CanvasProject.cards`, `CanvasProject.edges`, `DeployState.graph`. These are kept opaque at the DB level and typed in TypeScript via the shapes in `packages/types/`. Querying *into* them is avoided; when we need to index a field, it gets promoted to a real column.

## Encryption

`ProviderCredential.encryptedData` holds the AES-256-GCM ciphertext of the provider credentials (service account JSON, API keys, etc.). The encryption happens in `packages/shared/src/crypto.ts` before Prisma sees the value.

- **Key:** `CREDENTIAL_ENCRYPTION_KEY` in the environment. Must be exactly 32 characters. Generate with `openssl rand -hex 16` or similar.
- **Rotation:** replace the key, run a migration that re-encrypts all rows. Not automated — tracked on the [roadmap](../ROADMAP.md).

## Seeding

`packages/db/prisma/seed.ts` populates a development DB with a single user/org and any fixture data needed for the first-run experience. Called automatically by `pnpm dev:setup`.

## SQLite caveats

SQLite is fantastic for Community Edition but has a few constraints to be aware of:

- **Single writer.** Concurrent writes serialize. Fine for a single-user desktop app.
- **No enum types.** Enums are implemented as strings with Prisma client-side validation.
- **No `array` columns.** Arrays live in related tables or JSON.
- **`file:` URLs are relative to the Prisma schema file**, which is why the default `DATABASE_URL` looks like `file:../../.desktop-dev.db` — that path resolves from `packages/db/prisma/`.

None of these bite in the current design.

## Postgres caveats

- Requires `REDIS_URL` for BullMQ (the deploy queue).
- Set `shared_buffers` generously; deploy-state JSON can be large.
- Back up regularly; ICE keeps no external state, so a Postgres snapshot is a complete backup.

## Inspecting the dev DB

```bash
pnpm --filter @ice/db exec prisma studio
```

Opens Prisma Studio on http://localhost:5555 against whatever `DATABASE_URL` points at. Read-only browsing of every table.

## Entry points worth reading

- [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma) — the canonical shape.
- [`packages/db/prisma/seed.ts`](../packages/db/prisma/seed.ts) — seed fixtures.
- [`packages/shared/src/crypto.ts`](../packages/shared/src/crypto.ts) — encryption helpers.
- [`packages/core/src/state/`](../packages/core/src/state) — the interface that abstracts over the Prisma store.

## See also

- [services.md](services.md) — every service uses this DB.
- [`../.env.example`](../.env.example) — `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEY`.

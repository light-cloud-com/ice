# Database

ICE has **two SQLite databases** that confuse most contributors on their first read. They have completely different roles and lifecycles. The Postgres path (used by ICE Cloud and production self-hosting) replaces the first one only.

## The two databases at a glance

| File                                | Size              | Tracked in git? | Role                                                                                                            | Written by                                                             |
| ----------------------------------- | ----------------- | --------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `.desktop-dev.db` (repo root)       | ~1.5 MB and grows | ❌ `.gitignore` | **Runtime app state** — canvases, environments, deployments, encrypted provider credentials, deploy event log   | `pnpm dev:setup` creates it; every service writes to it via Prisma     |
| `packages/core/data/ice-schemas.db` | ~36 MB            | ✅ committed    | **Provider-schema catalog** — every resource type ICE knows about, generated from Terraform + Pulumi registries | `pnpm schemas:build` (one-off, rebuilt when bumping provider versions) |

In Postgres mode, only the runtime DB moves to Postgres — `ice-schemas.db` stays SQLite because it's read-only catalog data that ships with the package.

## How they fit together

```mermaid
flowchart LR
    subgraph engine [packages/core - engine]
        sp[EmbeddedSchemaProvider]
        valid[validation + autocomplete]
        plan[plan / apply]
    end

    subgraph services [services - runtime]
        canvas[canvas service]
        deploy[deploy service]
        creds[credentials service]
    end

    catalog[(ice-schemas.db<br/>read-only<br/>committed, 36 MB)]
    runtime[(.desktop-dev.db<br/>read/write<br/>gitignored, ~1.5 MB)]

    sp -- "what properties does<br/>compute.run.service have?" --> catalog
    valid --> sp
    plan --> sp
    canvas -- Prisma --> runtime
    deploy -- Prisma --> runtime
    creds -- "AES-256-GCM ciphertext" --> runtime

    style catalog fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
    style runtime fill:#dcfce7,stroke:#22c55e,color:#14532d
```

**`ice-schemas.db` is the catalog.** It answers questions like "what fields does `gcp.run.service` accept?" Loaded by [`EmbeddedSchemaProvider`](../../packages/core/src/schema/embedded-schema-provider.ts) and resolved via [`packages/core/src/schema/customization/base-db.ts`](../../packages/core/src/schema/customization/base-db.ts). Read-only at runtime.

**`.desktop-dev.db` is the state.** It holds the user's actual canvases, deployments, and credentials. Every Prisma model in `packages/db/prisma/schema.prisma` writes here.

Delete the runtime DB to reset the app; delete `ice-schemas.db` and the palette goes blank.

## Where the runtime DB lives

| Mode                     | Path                                       | `DATABASE_URL`                                                     |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------ |
| `pnpm dev:all` (web dev) | `.desktop-dev.db` at repo root             | `file:../../.desktop-dev.db` (resolved from `packages/db/prisma/`) |
| Desktop app (macOS)      | `~/Library/Application Support/ICE/ice.db` | Set by Electron main process at startup                            |
| Desktop app (Windows)    | `%APPDATA%/ICE/ice.db`                     | same                                                               |
| Desktop app (Linux)      | `~/.config/ICE/ice.db`                     | same                                                               |
| Self-hosted server       | Postgres                                   | `postgresql://user:pass@host:5432/ice`                             |
| CI E2E                   | Postgres service container                 | `.github/workflows/e2e.yml`                                        |

The Prisma schema uses only features supported by both backends. Engine selection happens automatically from the `DATABASE_URL` scheme.

## Where the schemas DB comes from

```mermaid
flowchart LR
    tf[Terraform provider<br/>registries]
    pul[Pulumi provider<br/>registries]
    builder[pnpm schemas:build<br/>generator]
    catalog[(ice-schemas.db<br/>committed)]
    generated[packages/core/src/schemas/generated/<br/>resource-types.ts · manifest.json · unified-types.json<br/>.gitignore'd]

    tf --> builder
    pul --> builder
    builder --> catalog
    builder --> generated
```

The generator pulls ~600 MB of provider schemas (cached in `.schema-cache/`), unifies them, and writes the SQLite catalog plus generated TypeScript files. First run takes 10–15 minutes; subsequent runs hit the cache. Re-run when you bump a provider version.

Full first-run instructions in [getting-started.md](../getting-started.md#generate-schemas).

## Prisma layout

```
packages/db/
├── prisma/
│   ├── schema.prisma        The single Prisma schema (same for SQLite + Postgres)
│   ├── migrations/          Migration history
│   └── seed.ts              Seed script
├── src/
│   └── index.ts             Exports the PrismaClient singleton
└── scripts/                 Helper scripts for dev
```

Running migrations:

```bash
pnpm dev:setup                            # create + push the dev SQLite DB
pnpm --filter @ice/db exec prisma migrate dev --name my-change
pnpm --filter @ice/db exec prisma generate
```

For Postgres deployments:

```bash
DATABASE_URL=postgresql://… \
  pnpm --filter @ice/db exec prisma migrate deploy
```

## Core tables

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

A few columns are Prisma `Json` — notably `CanvasProject.cards`, `CanvasProject.edges`, `DeployState.graph`. These are kept opaque at the DB level and typed in TypeScript via the shapes in `packages/types/`. Querying _into_ them is avoided; when we need to index a field, it gets promoted to a real column.

## Encryption

`ProviderCredential.encryptedData` holds the AES-256-GCM ciphertext of the provider credentials (service account JSON, API keys, etc.). The encryption happens in `packages/shared/src/crypto/` before Prisma sees the value.

- **Key:** `CREDENTIAL_ENCRYPTION_KEY` in the environment. Must be exactly 32 characters. Generate with `openssl rand -hex 16` or similar.
- **Rotation:** replace the key, run a migration that re-encrypts all rows. Not automated — tracked on the [roadmap](../../ROADMAP.md).

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

To poke at the schemas catalog directly:

```bash
sqlite3 packages/core/data/ice-schemas.db '.tables'
```

## Entry points worth reading

- [`packages/db/prisma/schema.prisma`](../../packages/db/prisma/schema.prisma) — the canonical Prisma shape.
- [`packages/db/prisma/seed.ts`](../../packages/db/prisma/seed.ts) — seed fixtures.
- [`packages/shared/src/crypto/`](../../packages/shared/src/crypto/) — encryption helpers.
- [`packages/core/src/state/`](../../packages/core/src/state) — the interface that abstracts over the Prisma store.
- [`packages/core/src/schema/embedded-schema-provider.ts`](../../packages/core/src/schema/embedded-schema-provider.ts) — the read side of `ice-schemas.db`.
- [`packages/core/src/schema/customization/base-db.ts`](../../packages/core/src/schema/customization/base-db.ts) — how the catalog file is resolved at runtime.

## See also

- [services.md](services.md) — every service uses the runtime DB.
- [core-engine.md](core-engine.md) — how the engine reads from the schemas catalog.
- [getting-started.md](../getting-started.md) — generating `ice-schemas.db` on first install.
- [`../../.env.example`](../../.env.example) — `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEY`.

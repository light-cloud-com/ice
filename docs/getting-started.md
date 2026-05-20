# Getting Started

This page takes you from a clean machine to a running ICE canvas, then outlines what to try first.

## Prerequisites

- **Node.js 22 or later**. Check with `node --version`.
- **pnpm 10 or later**. Install with `npm install -g pnpm` or follow [pnpm.io/installation](https://pnpm.io/installation).
- **Git**. Standard.

No Docker required for the default setup - ICE's dev mode uses an embedded SQLite file.

For a production-like setup (PostgreSQL + Redis + BullMQ workers), see the "Production-like dev" section below. You will need Docker for that path.

## Install

```bash
git clone https://github.com/light-cloud-com/ice.git
cd ice
pnpm install
```

First `pnpm install` takes ~3-5 minutes (large monorepo, many workspace packages).

## Generate schemas

ICE's resource-type catalogue is generated from the Terraform and Pulumi registries - about 550 MB of source-of-truth schemas, far too large for git. Generate it locally once after install:

```bash
pnpm schemas:build
```

This pulls provider schemas, unifies them, and writes:

- `packages/core/src/schemas/generated/resource-types.ts` - the typed resource catalogue used by the engine
- `packages/core/src/schemas/generated/manifest.json` - per-provider version manifest
- `packages/core/src/schemas/generated/unified-types.json` - the canonical unified schema
- `packages/core/src/schemas/generated/raw/` - per-provider raw extracts (cache)

The first run takes 10–15 minutes and downloads ~600 MB. Subsequent runs hit the cache under `.schema-cache/` and finish in seconds.

To narrow the scope (faster, smaller):

```bash
# Just GCP + AWS + Azure (the providers ICE actively deploys)
pnpm schemas:build -- --providers hashicorp/google,hashicorp/aws,hashicorp/azurerm
```

Re-run any time you bump a provider version. The output is in `.gitignore`; only the small SQLite catalog at `packages/core/data/ice-schemas.db` is committed.

## Configure

**Skip this step.** Community Edition needs zero env vars to run.

What you might want to know:

- Local secrets used for session signing and at-rest credential encryption are auto-generated on first boot and persisted per-user (`~/Library/Application Support/ice/secrets.json` on macOS, `~/.config/ice/secrets.json` on Linux, `%APPDATA%\ice\secrets.json` on Windows). Keep this file safe - it's the key to your DB-encrypted provider credentials.
- Cloud provider credentials (GCP / AWS / Azure) are entered **in-app** under Settings → Providers and live encrypted in the workspace DB.
- The optional AI assistant reads `ANTHROPIC_API_KEY` from `.env` for now - an in-app settings flow is on the roadmap. See [ai-assistant](architecture/ai-assistant.md).
- `.env.example` lists optional dev overrides (alternate `DATABASE_URL`, `PORT`, seed credentials, `ANTHROPIC_API_KEY`). Only touch it if you need to override a default or enable AI.

## Run

**Web app (default):**

```bash
pnpm dev:all
```

Opens at **http://localhost:5173**. The API gateway starts on port 15173. No login - you're dropped straight onto the canvas.

**Desktop app (Electron):**

```bash
pnpm dev:desktop
```

Same canvas, running in an Electron window with an embedded gateway. No external server; all state in a local SQLite file.

## First canvas

1. On the canvas, open the **palette** (left side) and drag a **Static Site** block onto the surface.
2. Drag a **Custom Domain** block next to it.
3. Connect them by dragging from one block's edge to the other.
4. Select the Static Site block - the **properties panel** opens on the right. Fill in a GitHub repo (or leave blank for now).
5. Click **Deploy** in the top toolbar. If you have GCP credentials configured, it will plan and apply real infrastructure.

If you do not yet have GCP credentials, the deploy will produce a clear error message. Connect a credential under **Settings → Providers** in the app; the validator tells you which IAM role is missing if a key fails.

## Production-like dev

If you want to develop against PostgreSQL + Redis + BullMQ workers (closer to how ICE Cloud runs), you will need Docker and a Postgres instance. The dev scripts default to SQLite for onboarding friction reasons; a docker-compose setup is on the roadmap - see [ROADMAP.md](../ROADMAP.md).

## Troubleshooting

| Symptom                                   | Likely cause                     | Fix                                                          |
| ----------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| `Cannot find module '@ice/db'` after pull | Stale install                    | `pnpm install && pnpm --filter @ice/db exec prisma generate` |
| Port 5173 already in use                  | Another Vite app                 | Kill the other process or set `PORT=5174 pnpm dev:web`       |
| `ECONNREFUSED :15173` from web            | Gateway not started              | Check the `pnpm dev:all` terminal for gateway errors         |
| Electron window blank on macOS            | First-run security prompt        | System Settings → Privacy & Security → approve ICE           |
| `Error: SQLITE_READONLY`                  | Permissions on `.desktop-dev.db` | `rm .desktop-dev.db` and re-run `pnpm dev:setup`             |
| AI panel shows "No API key"               | `ANTHROPIC_API_KEY` not set      | Add `ANTHROPIC_API_KEY=sk-ant-...` to `.env` and restart     |

Still stuck? Open an issue with your OS, Node version, and the exact error. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the bug template.

## Next steps

- [architecture](architecture/README.md) - how the pieces fit together.
- [testing.md](testing.md) - run the test suites.

## See also

- [`.env.example`](../.env.example) - all environment variables.
- [`package.json`](../package.json) - the full list of `pnpm` scripts.

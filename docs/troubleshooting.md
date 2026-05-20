# Troubleshooting

Common things that go wrong, with the actual fix. Grouped by where you hit them. Search this page first before opening an issue.

## Install / first run

| Symptom                                                                                                 | Cause                                                             | Fix                                                       |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| `Cannot find module '@ice/db'` after a `git pull`                                                       | Stale install; the workspace symlinks lost the Prisma client      | `pnpm install && pnpm dev:setup`                          |
| `Error: Cannot find module '.prisma/client/default'`                                                    | Same as above - Prisma client not generated                       | `pnpm --filter @ice/db exec prisma generate`              |
| `Cannot find module './schemas/generated/resource-types'` or `Cannot find module './schemas/generated'` | Provider schemas not generated yet                                | `pnpm schemas:build` (10–15 min first time, cached after) |
| Palette is empty / "0 blocks available" after install                                                   | Same as above - engine boots without a generated schema catalogue | `pnpm schemas:build`, then restart `pnpm dev:all`         |
| `pnpm install` hangs on `Prerequisite check`                                                            | Wrong Node version (need 22+)                                     | `nvm use 22` then re-run                                  |
| `EACCES` / permission errors during install                                                             | pnpm store owned by root from a sudo install                      | `sudo chown -R $(whoami) ~/.local/share/pnpm`             |
| `pnpm: command not found`                                                                               | pnpm not on PATH                                                  | `npm i -g pnpm@10` (or use Corepack: `corepack enable`)   |

## Dev server / runtime

| Symptom                                                       | Cause                                                                             | Fix                                                                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Port 5173 (or 15173) already in use                           | Another dev server / Electron instance still running                              | `lsof -i :5173` → kill, or `PORT=5174 pnpm dev:web`                                                                             |
| `ECONNREFUSED :15173` in the browser                          | Gateway didn't start                                                              | Check the `pnpm dev:all` terminal output for a thrown error in the gateway pane                                                 |
| Blank canvas, browser console shows CORS errors               | `FRONTEND_URL` doesn't match where the browser is loaded from                     | Either open `http://localhost:5174` (the default Vite dev URL) or set `FRONTEND_URL` to your origin                             |
| `Error: SQLITE_READONLY`                                      | Bad permissions on `.desktop-dev.db`                                              | `rm .desktop-dev.db && pnpm dev:setup`                                                                                          |
| Stale UI after editing source                                 | Vite HMR didn't pick the change up (rare)                                         | Hard refresh: ⌘/Ctrl-Shift-R. If persistent, restart `pnpm dev:web`                                                             |
| AI panel says "No API key"                                    | `ANTHROPIC_API_KEY` not set                                                       | Add `ANTHROPIC_API_KEY=sk-ant-...` to `.env` (or your shell) and restart `pnpm dev:all`. See [ai-assistant.md](ai-assistant.md) |
| All saved provider credentials suddenly invalid after restart | Pre-`ensureLocalSecrets` desktop builds regenerated the encryption key per launch | Upgrade to the current main; re-enter credentials once. New keys persist across launches                                        |

## Electron / desktop

| Symptom                                            | Cause                                  | Fix                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| macOS: "ICE is damaged and can't be opened"        | Unsigned binary; macOS Gatekeeper      | Right-click → Open the first time, then **System Settings → Privacy & Security → Open anyway**. Code-signing is on the v0.2 roadmap |
| Windows SmartScreen warning on first run           | Unsigned binary                        | "More info → Run anyway" once. Same EV signing plan as above                                                                        |
| Linux AppImage won't launch                        | Missing `libfuse2`                     | `sudo apt install libfuse2` (Debian/Ubuntu)                                                                                         |
| Desktop window blank, dev tools show 404 on bundle | Stale `web-dist` from a previous build | `rm -rf packages/web/dist && pnpm build:web`                                                                                        |

## Deploy / provider connection

| Symptom                                                     | Cause                                                        | Fix                                                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Permission denied: roles/X"                                | Service account missing a GCP role                           | Add the role in GCP Console → IAM. See [deploying-to-gcp.md](deploying-to-gcp.md#step-1--create-a-service-account)                                |
| "API not enabled: cloudrun.googleapis.com"                  | The GCP service isn't enabled on the target project          | Click the Enable API link in the error, or `gcloud services enable cloudrun.googleapis.com`                                                       |
| Plan shows `DELETE` for resources you didn't create via ICE | Deploy state thinks it created something it didn't           | **Settings → Reset environment state** for that environment, or import the existing infrastructure first                                          |
| Deploy hangs at "Creating Cloud SQL instance"               | Cloud SQL first-provision is 5–10 minutes                    | Be patient. Progress is streamed but infrequent                                                                                                   |
| Custom domain stuck "pending SSL"                           | Managed cert provisioning                                    | Can take up to 60 minutes first time. Verify your DNS points at the load balancer                                                                 |
| AWS / Azure deploy fails with "unsupported resource type"   | AWS / Azure deployers cover only a subset of resources today | See [provider-status.md](provider-status.md). Either swap the block for one of the supported types or move that part of the canvas to GCP for now |
| GitHub push doesn't trigger pipeline                        | Webhook secret mismatch                                      | Project → Pipelines → Webhooks → regenerate secret. Make sure the GitHub side uses the new secret                                                 |

## Tests

| Symptom                                                | Cause                                                   | Fix                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Vitest run errors with `vi.mock` not finding an export | Test mock missing a symbol you added to the real module | Add a `vi.fn()` to the mock for the new export                          |
| `test:gcp` / `test:scenarios` skipped                  | Required env vars not set                               | See the env-var table in [testing.md](testing.md#gcp-integration-tests) |
| Playwright "browser not found"                         | Headed browsers not installed                           | `pnpm exec playwright install`                                          |
| Coverage report missing one package                    | `tsbuildinfo` cache is stale                            | `rm packages/<name>/tsconfig.tsbuildinfo` and re-run                    |

## Logs

| Symptom                              | Cause                                                                               | Fix                                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| I want more verbose deploy output    | Default logs are user-facing only                                                   | `DEBUG=ice:deploy pnpm dev:gateway` re-enables the gated debug lines in the deploy pipeline                                           |
| I can't find where a request errored | The Express error handler logs but doesn't capture stack                            | Add a `console.error(err)` in `apps/gateway/src/index.ts`'s error handler if reproducible; please open a PR if it's not already there |
| Importer returns zero assets         | Service account missing `cloudasset.assets.list` or Asset Inventory API not enabled | Enable Asset Inventory + grant the role. Importer surface area is GCP-only today - see [provider-status.md](provider-status.md)       |

## Still stuck?

Open an issue with:

- Your OS + Node version (`node -v`).
- The exact command you ran.
- The full error output.
- A small canvas (if applicable) - JSON-export it via the project menu.

We watch GitHub issues during business hours Europe/Warsaw - see [SUPPORT.md](../SUPPORT.md).

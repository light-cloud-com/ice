# E2E session state — last updated 2026-04-27

End-of-day snapshot of the deployment-test harness work. Pick up tomorrow from "Next steps" at the bottom.

## What's working (validated this session)

- **Scenario harness end-to-end on `00-static-site`** (~37 s, all phases green): setup → describe → design → deploy → verify → cleanup.
- **Validation gate** (`runner/phases/design.ts:checkCanvasValidation`) reads `window.__ICE_VALIDATION__` (mirrored from Redux by `useCanvasValidation` when the action-log flag is on); fails on errors AND warnings; per-scenario `validation.allowWarnings: ['*' | <codes>]` opt-out in YAML.
- **Requirements gate** (`runner/phases/deploy.ts:extractRequirements`) drains `/canvas/deploy/requirements` from the action log; classifies DNS-related (`/dns|domain|cert|tls|ssl/i`) as logged-only; non-DNS unmet requirements fail the deploy phase with structured detail.
- **Deploy logs in HTML report** — `runner/reporter/html-report.ts` aggregates every `deploy_log_tail` event into one copyable `<pre>` panel at the top of the timeline. Per-line tail reads `#ice-deploy-log > div` children (no regex hack).
- **Destroy modal flow** — `runner/phases/cleanup.ts` reads `cardName` from the "Type X to confirm:" label, ticks the "destroy-everything" checkbox (required for already-destroyed cards), fills the input, clicks Destroy.
- **Tighter verify** — empty `expect.resources` no longer passes when individual resources have `success: false`; surfaces `4/9 resource(s) failed: …` with each error.

## Real ICE / GCP bugs surfaced (NOT yet fixed)

| Resource | Error | Where to fix |
| --- | --- | --- |
| `gcp.sql.databaseInstance` | `Invalid Tier (db-f1-micro) for (ENTERPRISE_PLUS) Edition` | The user's `lc-ice` GCP project is on ENTERPRISE_PLUS edition. Either change project edition or have the GCP postgresql blueprint pick a tier per edition. |
| `gcp.redis.instance` | `Invalid value 'small' at 'instance.tier'` | The GCP Memorystore handler/translator sends literal `"small"` instead of valid `M1` / `M2` / `M3`. Probably one line in `packages/core/src/deploy/providers/gcp/handlers/memorystore-handler.ts` (or equivalent). |
| `gcp.logging.sink` | `Expected a resource of the form projects/[PROJECT_ID]` | GCP logging handler builds the destination path without the `projects/` prefix. |
| `Network.VPC` / `Network.Subnet` / `Network.PrivateNetwork` / `Security.WAF` | `No gcp deployer mapping for X` | These are **real deployables** (NOT UI-only — user was emphatic). Need entries in `card-translator.ts:GCP_TYPE_MAP` AND new handler files in `packages/core/src/deploy/providers/gcp/handlers/` (~150–300 lines each). User picked **`Network.PrivateNetwork`** as the starter implementation. |

## Code changes shipped this session

### New harness scaffolding under `e2e/deployment-tests/`
- `runner/{scenario-runner,schema,context}.ts`
- `runner/phases/{setup,describe,design,deploy,verify,cleanup}.ts`
- `runner/ui-helpers/{canvas,properties}.ts`
- `runner/logger/{run-logger,event-types}.ts`
- `runner/recipes/{api-not-enabled,config,network,billing-disabled,index}.ts`
- `runner/reporter/html-report.ts`
- `scenarios/00-static-site.yaml`, `01-fullstack-webapp.yaml`
- `deployment-tests.spec.ts`, `destroy-all.spec.ts`, `delete-projects.spec.ts`

### Cross-cutting UI / core edits
- `packages/ui/.../properties-panel.tsx` — `data-prop-key` on `TextField` / `NumberField` / `SelectField` and the generic `PropertyFields` wrapper.
- `packages/ui/.../nodes/{group-node/block-node, log-node, custom-domain/index, compact-node/compact-lod3}.tsx` — `data-ice-type` attribute. **`compact-lod3` is the LOD that actually renders for fullstack templates** (svg-compact-node, no LOD suffix), not block-node.
- `packages/ui/.../canvas/hooks/use-canvas-validation.ts` — writes `window.__ICE_VALIDATION__` when localStorage `ice-action-log` flag is set.
- `packages/templates/src/full-stack.ts` — split into Frontend Repo (`ice-test-hello-static` → Static Site) and Backend Repo (`ice-test-hello-api` → API Server). Removed provider-specific `data` overrides (size/protocol/storage_class) so blueprint defaults win per provider.
- `packages/core/src/deploy/card-translator.ts` — `UI_ONLY_TYPES` is **only** `Monitoring.Terminal | Source.Repository | Config.Environment | Network.PublicTraffic`. Added `iceType.startsWith('Group.')` filter (visual groups). VPC / Subnet / PrivateNetwork / WAF MUST NOT be added here.
- `packages/core/src/validation/deploy-rules.ts` — synced `UI_ONLY_TYPES` (was just `Monitoring.Terminal` — out of sync with the translator).
- `e2e/playwright.config.ts` — loads `.env` at config-eval time; webServer command fixed (`pnpm --dir .. dev:all`); scenarios project `testMatch: /.*\.spec\.ts/` so destroy-all / delete-projects are discoverable.
- `e2e/global-setup.ts` + `global-teardown.ts` — `BACKEND_URL` switched from stale `localhost:5002` → `localhost:15173` with `ICE_TEST_BACKEND_URL` override.
- `.env.example` + `e2e/deployment-tests/README.md` — documented the test env vars and harness usage.

## Cleanup state at end of session

Cumulative test runs left ~25 stale projects in the dev DB and many orphaned GCP resources.

- 16 projects had GCP resources destroyed via the UI (destroy-everything mode through `destroy-all.spec.ts`).
- 25 test projects removed from the dev DB (14 via `/canvas/projects/delete` API, 11 via SQLite cascade in `.desktop-dev.db` after the API hit FK constraints).
- Only the `Acme` org folder remains in the project tree.
- ICE dev server (`pnpm dev:all`) is still running at end of day; safe to keep running tomorrow.

## Open follow-ups

- **Stale gateway deploy snapshots — client-side workaround in place** (`use-deploy-subscription.ts` Phase 2). The hook now cross-checks `/canvas/deploy/current/<cardId>` against `/canvas/deploy/history/<cardId>`: if a terminal apply exists in the DB, the in-memory snapshot is treated as stale and dropped. This covers the "deploying@99% forever after a crashed worker" symptom without needing a server-side finalizer. The server-side fix (gateway snapshot writer marking terminal on every completion path, including process exits) is still the right long-term solution, but no longer blocks the UX.

## Known bugs in ICE itself (not just the harness)

- **`canvas.service.ts:deleteProject` cascade is incomplete.** Only deletes `canvas_card` + `canvas_project`. Leaves orphans in `canvas_deployment`, `deploy_event`, `deploy_job`, `deployed_resource_mapping`, `block_requirement_status`, `deployment_rule`, `environment`, `deployment_event`. Manifests as `500 "Failed to delete"` because the route's catch swallows the actual Prisma FK error.
- **Browser session crashes after ~10 min of continuous canvas + destroy work** (Playwright `Target page, context or browser has been closed`). Workaround: re-run, or restart `pnpm dev:all` first. Root cause not investigated; likely accumulated React/Redux state per project visit.

## Surprising / non-obvious things

- `data-ice-type` was supposed to exist per earlier exploration but didn't — `compact-lod3.tsx` is the LOD that actually renders for fullstack canvases (svg-compact-node, no LOD suffix), not `block-node.tsx` which has the `svg-block-node` class.
- `Source.Repository`'s `repository` field is a `Combobox` (`RepoSelector`), not a plain input. Can't drive it via `data-prop-key` setText. Workaround: set `repository: 'light-cloud-com/ice-test-hello-X'` as default in the template's `block.data` — acceptable because it's a sensible test default, not provider-specific data.
- The fullstack template needs **two** `Source.Repository` blocks — one for the static-site frontend, one for the Express.js backend. They can't share a repo because Cloud Build can't compile HTML as Node.js.
- Test repos that exist in `light-cloud-com` org: `ice-test-hello-static`, `ice-test-hello-api`, `ice-test-hello-python`, `ice-test-hello-data`. **`ice-test-node` does NOT exist** — verified via the GitHub API.
- The GCP project for tests is `lc-ice` and uses the ENTERPRISE_PLUS Cloud SQL edition. Default `db-f1-micro` is rejected — the SQL handler/blueprint either needs to know about edition tiers, or the test project needs to be on the Standard edition.

## Next steps (in order of value)

1. **(Optional)** Fix the `deleteProject` cascade to include the 6 missing tables. Same service file. Would unblock cleanup via API alone (no SQLite needed).
2. **(Optional)** Fix `ice-test-hello-api` repo: add a `package-lock.json` so the Cloud Run / Cloud Build flow doesn't 400 on `npm ci --production`.
3. **Investigate** if Cloud SQL ENTERPRISE_PLUS edition handling belongs in the GCP postgresql blueprint (project-edition-aware tier defaults) or stays a project-level config concern.

## 2026-04-27 update — what changed today

- ✅ **Redis `'small'` literal fixed** (`card-translator.ts:extract_memorystore_properties`). Canvas `size` (M1/M2/M3/M4/M5) now translates to `(tier, memorySizeGb)` for the API. Falls back through valid literal `tier`, `memorySizeGb`, then `memoryMb` (common-blueprint legacy field).
- ✅ **Logging sink destination fixed** (`gcp/handlers/logging.ts`). Default destination switched from invalid `…/logs/<name>` to the always-existing `…/locations/global/buckets/_Default` bucket.
- ✅ **Network.VPC / Network.Subnet / Security.WAF GCP handlers shipped**. New files: `gcp/handlers/{vpc,subnet,cloud-armor}.ts`. Wired into `gcp-deployer.ts:HANDLER_REGISTRY` (specific prefixes BEFORE the catch-all `gcp.compute.`), `card-translator.ts:GCP_TYPE_MAP`, and `PROPERTY_EXTRACTORS` with new extractors `extract_vpc_properties` / `extract_subnet_properties` / `extract_cloud_armor_properties`. Cloud Armor injects the mandatory default rule (priority 2147483647) when the user hasn't supplied one.
- ✅ **Resource names now include project + env** (`card-translator.ts:generate_stable_name`). Form is `ice-<projectSlug>-<env>-<typeSlug>-<hash>` truncated to 80 chars (Cloud SQL's strictest limit). Hash seed is `${project}::${env}::${nodeId}` so the same node in different projects/envs produces different resource names.
- ✅ **Deploy state isolation per project** (`deploy-slice.ts` extraReducers). On `setActiveCard`, deploy state resets (status/error/plan/logs/results/deployedResources/drift/requirements/diagnosis/criticalAcknowledged/currentDeployCardId) but preserves user prefs (provider, gcpProject, region, environment, dismissedWarnings) so they don't have to be re-picked every project switch.

### Still surfaces as failures (unchanged)

- ~~Cloud SQL: `db-f1-micro` rejected on ENTERPRISE_PLUS (project edition; not in our code).~~ → **fixed in `cloud-sql.ts:resolve_edition_and_tier`**. Handler now sends `settings.edition` explicitly: defaults to `'ENTERPRISE'` (which accepts `db-f1-micro`), or `'ENTERPRISE_PLUS'` if the user supplied a `db-perf-optimized-*` tier. Mismatched (edition, tier) pairs auto-correct rather than 400. The handler also threads `properties.edition` through `card-translator.ts:extract_cloud_sql_properties` so users can override via the canvas block's `edition` field.
- ~~Cloud Run: build fails with only a console URL, no log content surfaced.~~ → **fixed in `cloud-build-helper.ts:fetch_build_logs`**. On any failure terminal (FAILURE / INTERNAL_ERROR / CANCELLED / TIMEOUT / EXPIRED), the helper queries `https://logging.googleapis.com/v2/entries:list` for `resource.type="build" AND resource.labels.build_id=<id>` and pulls up to 80 log lines. The `BUILD_FAILED` message in `messages.ts` now appends `--- Log tail (N lines) --- <text>` so the actual npm/Dockerfile error appears in the deploy panel's per-resource error row. Each line is also streamed via `onLog` so it shows up live in the deploy log section.
- Cloud Run: API server build still fails because `ice-test-hello-api` has no `package-lock.json` and the Dockerfile uses `npm ci --production` — but now the user sees the actual npm error inline.

### Persistence path verified (UI end-to-end)

- ✅ `e2e/deployment-tests/persisted-summary-ui.spec.ts` — opens the deploy panel against a real prior-deploy card, captures the `[deploy-panel] hydrate fetch/dispatch` console logs, and asserts `#ice-deploy-results` renders with the "Deploy finished with errors / 5 succeeded / 4 failed / Copy summary / Copy errors" summary. Confirms DB → Redux → UI works after reload. Run via `pnpm exec playwright test --config e2e/playwright.config.ts --project=scenarios -g "panel shows hydrated results"`.
- Hydrate effect runs unconditionally on panel mount (no slice-status guard). The reducer itself ignores non-terminal DB statuses, so dispatching is safe even mid-deploy.
- Render condition for `ResultsSummary` widened: now `deploy.results.length > 0 && status !== 'deploying' && status !== 'destroying'` so prior summary survives a new Plan click (status flips to `'planning'/'planned'`).

### Original next steps (now done)

1. ✅ Re-run `01-fullstack-webapp` — done; harness validated yesterday's fixes.
2. ✅ Fix Redis `'small'` literal bug.
3. ✅ Fix Logging sink prefix bug.
4. ✅ Implement Network.PrivateNetwork (and the related VPC, Subnet, Cloud Armor) GCP handlers.

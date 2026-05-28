# Testing

ICE has four categories of tests. This page covers how to run each, what each protects, and when to write which.

## Quick reference

```bash
pnpm test:unit          # Vitest unit tests - no DB, no network
pnpm test:int           # Integration tests - hits a local SQLite DB
pnpm test:e2e           # Playwright E2E against a running web app
pnpm test:gcp           # GCP integration tests - requires real GCP creds
pnpm test:scenarios     # Declarative-YAML deployment scenarios - requires real GCP creds
pnpm test:dashboard     # Interactive GCP test dashboard (http://localhost:15200)
pnpm verify:sdk         # L1-L4 SDK verifier - static analysis, no creds
pnpm test:live:<p> <s>  # Per-handler real-cloud round-trip - requires <p> creds
pnpm typecheck          # TypeScript across all packages
pnpm lint:check         # ESLint, errors only
pnpm format:check       # Prettier
```

CI runs `typecheck`, `lint:check`, `format:check`, `test:unit`, and a web `build` on every PR. E2E runs separately against a Postgres+Redis service container - see `.github/workflows/e2e.yml`.

## Unit tests (Vitest)

Fast, in-process, no DB. Live next to the code they test as `*.test.ts` / `*.test.tsx`.

```bash
pnpm test:unit                        # all
pnpm --filter @ice/core test          # one package
pnpm --filter @ice/ui test -- --watch # watch mode for one package
```

**Write unit tests for:** pure logic (graph algorithms, schema validation, translators, Redux slice reducers, utility helpers).

**Don't write unit tests for:** anything that needs a real DB or a real cloud API - use integration or E2E.

Key suites worth reading to learn the conventions:

- `packages/core/src/__tests__/card-translator.test.ts` - translation table tests.
- `packages/ui/src/store/slices/__tests__/cards-slice-group.test.ts` - slice-level behaviour.
- `packages/ui/src/config/__tests__/containment-rules.test.ts` - block containment rules.

## Integration tests

Integration tests use a real Prisma SQLite DB but still run in-process. They're named `*.int.test.ts` so they're excluded from the default unit run.

```bash
pnpm dev:setup        # create the dev DB once
pnpm test:int         # run integration tests
```

**Write integration tests for:** Prisma queries, multi-record invariants, RBAC-adjacent code (org isolation), anything that depends on DB transactions.

Example suites:

- `services/canvas/src/__tests__/org-isolation.int.test.ts` - verifies that projects are scoped to their org.
- `services/canvas/src/__tests__/rbac.int.test.ts` - role-based access checks (mostly skipped today because Community Edition is single-user; see [architecture overview](architecture/README.md)).

## End-to-end tests (Playwright)

```bash
pnpm test:e2e               # headless against running app
pnpm test:e2e -- --headed   # see the browser
```

E2E tests expect a running gateway + web app. In CI, the workflow boots Postgres + Redis + gateway service containers before running the suite (`.github/workflows/e2e.yml`). Locally, run `pnpm dev:all` in another terminal first.

**Write E2E tests for:** full-stack flows the user cares about - "drag block, configure, save, reload, still there." Keep them few and precious.

Suites live under `e2e/` in the repo root.

## GCP integration tests

These are the opt-in heavy tests - they spin up real GCP resources and tear them down, template by template.

```bash
pnpm test:gcp                    # headless CLI
pnpm test:dashboard              # interactive dashboard UI at :15200
```

The dashboard (`e2e/dashboard/server.ts`) provides: template checkboxes, GCP/GitHub configuration, test-repo creation, run/stop controls, live progress, and HTML report generation.

**Requirements:**

- `GCP_SERVICE_ACCOUNT_JSON` (or a credential file path) - with full admin on a disposable project.
- A GitHub personal access token if testing templates that expect a connected repo.
- A project budget ceiling - the tests spin up real infra.

**Env vars (contributor-only, set in your shell or `.env`):**

| Variable                | Required           | Default       | Notes                                                          |
| ----------------------- | ------------------ | ------------- | -------------------------------------------------------------- |
| `ICE_TEST_GCP_PROJECT`  | yes                | -             | Disposable GCP project ID the tests provision in               |
| `ICE_TEST_SA_KEY_PATH`  | yes                | -             | Absolute path to a service-account JSON key with project admin |
| `ICE_TEST_GCP_REGION`   | no                 | `us-central1` | Region for regional resources                                  |
| `ICE_TEST_GITHUB_TOKEN` | scenario-dependent | -             | PAT with `repo` scope, for scenarios that pull a source repo   |
| `ICE_TEST_DOMAIN`       | scenario-dependent | -             | Apex domain used by the static-site-with-domain scenario       |

These never get baked into the app - end users running ICE don't need them. They're read by the Playwright runner only.

**What it protects:** the entire template library. If "SaaS Starter" stops deploying on GCP, this is the suite that catches it. Running it per-commit would be expensive; it's run on demand and before tagged releases.

## Deployment-test scenarios

Complementary to the template suite above. Where `test:gcp` exercises pre-built templates end-to-end, `test:scenarios` builds projects from scratch - described in YAML, placed block-by-block via the UI, with per-step JSONL logging and recipe-based recovery for known errors.

```bash
pnpm test:scenarios                                    # all scenarios
ICE_SCENARIO_ID=static-site pnpm test:scenarios        # filter by id substring
```

Credentials (`ICE_TEST_GCP_PROJECT`, `ICE_TEST_SA_KEY_PATH`, optional `ICE_TEST_GITHUB_TOKEN`, `ICE_TEST_DOMAIN`) are read from the repo-root `.env` automatically. See the [GCP integration tests](#gcp-integration-tests) section above for the canonical list; same vars work for `test:gcp` and `test:scenarios`.

Scenarios live in [`e2e/deployment-tests/scenarios/`](../e2e/deployment-tests/scenarios) as YAML files. Each run writes to `test-results/runs/<ts>-<scenarioId>/` with `events.jsonl`, `summary.json`, `description.md`, screenshots, and a self-contained `index.html` timeline.

**Write a scenario when:** you want to lock in a specific multi-block configuration end-to-end (e.g. "static site + custom domain on GCP must produce a forwarding rule"), or you want to reproduce a deployment-level bug as a regression test.

**Don't use this for:** template smoke tests (use `test:gcp`), unit-level logic (use `test:unit`).

Full reference - env vars, YAML schema, recipe model, log schema, troubleshooting - is in [`e2e/deployment-tests/README.md`](../e2e/deployment-tests/README.md).

## Typecheck

```bash
pnpm typecheck
```

Runs `tsc --noEmit` in every workspace package in dependency order. CI treats any TypeScript error as a blocker. If `packages/core` fails, downstream packages won't be typechecked - fix the root cause, then re-run.

## Lint and format

```bash
pnpm lint:check          # errors block; warnings allowed
pnpm lint                # auto-fix what it can
pnpm format:check        # prettier, block on mismatch
pnpm format              # write prettier formatting
```

ESLint config: `eslint.config.js`. Prettier config: picked up from `.prettierrc` / defaults.

## Dependency audit

```bash
pnpm audit --prod --audit-level=high
```

Runs in CI with `|| true` so it doesn't block - security advisories surface but don't fail the build. Triage them via the roadmap.

## Writing style: what a good test looks like

- **Name it after the behaviour, not the method.** `it('rejects a canvas with a cycle')` beats `it('validate()')`.
- **Arrange, Act, Assert** - one flow per test.
- **Fail loudly on the happy path's first surprise.** Don't paper over with `expect.anything()`.
- **No snapshots** for large blobs - they drift and nobody reviews the diffs.
- **Put the setup that matters in the test.** Long `beforeEach` pyramids hide intent.

## Frontend component tests

300+ `.test.tsx` files live under `packages/ui/src/**/__tests__/`. The dominant pattern is a hand-rolled "tree-walker" - see `packages/ui/src/shared/components/__tests__/app-bar.test.tsx` for the canonical shape:

- Unwrap `React.memo` via `.type` to invoke the inner FC directly.
- Mock all sub-components and hooks via `vi.hoisted({...})`.
- Render via React's TestRenderer rather than `@testing-library/react`.

This keeps tests fast and pure (no DOM, no act warnings) at the cost of more boilerplate. We've also got `jsdom` configured (`package.json`) and a smaller set of hook tests using a thin custom harness - see `packages/ui/src/features/canvas/hooks/__tests__/use-canvas-drop.test.tsx`. Both approaches are accepted; pick whichever fits the component under test.

## SDK verifier (L1-L4) and live tests

The cardinal rule for any deployer change: **a handler is only "done" once a successful real-cloud deploy round-trip is observed.** Static checks make sure the SDK call shapes are correct _before_ a real call is made; live tests prove the round-trip.

### Static SDK verification

```bash
pnpm verify:sdk                  # all providers, all layers
node scripts/verify-sdk-coverage.mjs --provider aws    # L1-L3 only
node scripts/verify-sdk-commands.mjs --provider azure  # L4 only
```

| Layer | What it checks                                                                                                                                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1    | Every handler is reachable from the provider's `HANDLER_REGISTRY`                                                                                                                                                           |
| L2    | Every handler imports a real SDK client (no stub clients)                                                                                                                                                                   |
| L3    | Every block category mapped to the provider has at least one handler                                                                                                                                                        |
| L4    | Each handler's create / update / delete _input bodies_ match the SDK's expected command-input shape — catches PascalCase / camelCase drift, path-param vs body-param mistakes, missing required fields, union-type variants |

The verifiers run in CI (`scripts/verify-sdk-*.mjs`) and exit non-zero on uncovered handlers or SDK-shape mismatches. They run against all 8 providers — GCP, AWS, Azure, Alibaba, OCI, DigitalOcean, IBM, Kubernetes. Five of the eight providers report 100 % coverage; the open gaps are tracked in the verifier output.

### Live tests (per-handler real-cloud round-trip)

Every handler under `packages/core/src/deploy/providers/<p>/handlers/` has a paired live test at:

```
packages/core/src/deploy/providers/__tests__/live/<p>-<service>.live.test.ts
```

These are excluded from `pnpm test:unit` (the vitest config has `'**/*.live.test.{ts,tsx}'` in the exclude). Run them explicitly:

```bash
pnpm test:live:aws s3               # single service
pnpm test:live:aws s3 sqs lambda    # multiple services
pnpm test:live:azure storage-account
pnpm test:live:alibaba              # all alibaba handlers
pnpm test:live:oci
pnpm test:live:digitalocean
pnpm test:live:ibm
pnpm test:live:kubernetes
```

**Without credentials**, every test in the suite skips with a one-line banner explaining which env vars to export. With credentials, each test runs a `create + delete` round-trip against your own account, tagging every resource with `ice:test-run-id=<runId>` and appending JSONL events to `e2e/<provider>-deployment-tests/runs/<runId>.jsonl`.

**Cleanup of leaked resources** — if a test crashes mid-run, run:

```bash
tsx e2e/<provider>-deployment-tests/cleanup-orphans.ts
```

The cleanup script sweeps for `ice:test-run-id=*`-tagged resources older than `ORPHAN_AGE_HOURS` (currently 24) and deletes them. AWS + Azure share the same tag key and age threshold (asserted by `cleanup-orphans.test.ts`).

**These do not run in CI** — they touch real cloud, cost real money, and need provider-specific credentials. They're a developer self-serve tool. The deploy gate ticks when a developer or contributor runs the live test on their own account and pastes the JSONL summary into the PR.

## Known gaps

- No AWS / Azure / preview-tier integration tests analogous to the GCP dashboard — live tests cover round-trips but not full scenarios. See [ROADMAP.md](../ROADMAP.md).
- E2E coverage of the AI chat flow is thin - the SSE stream is mocked in tests.

## See also

- [`vitest.config.ts`](../vitest.config.ts), [`e2e/playwright.config.ts`](../e2e/playwright.config.ts).
- [CONTRIBUTING.md](../CONTRIBUTING.md) - where tests fit in the PR workflow.
- [architecture overview](architecture/README.md) - what the integration tests actually exercise.

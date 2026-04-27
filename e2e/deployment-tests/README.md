# Deployment-test scenarios

Declarative-YAML harness for deployment-level testing of ICE projects.

Where [`gcp-template-suite.spec.ts`](../tests/gcp-template-suite.spec.ts) exercises pre-built templates end-to-end, this harness builds projects from scratch — block-by-block via the UI, with a structured log of every action, automatic recovery for known errors, and a self-contained HTML report per run.

The goal is to catch deployment-level bugs that template-driven tests pass through silently: UI regressions, missing or unclear errors, broken connections, race conditions, and GCP misconfigurations.

## Quick start

Add the test credentials to the repo-root `.env` (Playwright auto-loads it via [`e2e/playwright.config.ts`](../playwright.config.ts) — values already in `process.env` win over `.env`):

```bash
# .env — at the repo root
ICE_TEST_GCP_PROJECT=<project-id>
ICE_TEST_SA_KEY_PATH=/absolute/path/to/sa-key.json
ICE_TEST_GITHUB_TOKEN=<github-pat>     # optional, for repo-based scenarios
ICE_TEST_DOMAIN=example.test           # optional, for domain-based scenarios
ICE_TEST_GCP_REGION=us-central1        # optional, defaults to us-central1
```

Then:

```bash
# In one terminal: start ICE
pnpm dev:all

# In another: run scenarios
pnpm test:scenarios                                # all
ICE_SCENARIO_ID=static-site pnpm test:scenarios    # one by id-substring
```

Shell-exported vars work too and override `.env`. See [`.env.example`](../../.env.example) for the canonical list with comments.

Per-run artifacts land in `test-results/runs/<timestamp>-<scenarioId>/`. Open `index.html` in that directory for the timeline view.

## Directory layout

```
e2e/deployment-tests/
  scenarios/                        # YAML specs — one project per file
    00-static-site.yaml
    01-static-site-with-domain.yaml
    02-private-network.yaml
  runner/
    scenario-runner.ts              # phase orchestrator
    schema.ts                       # Zod schema + YAML loader (env-var interpolation)
    context.ts                      # RunContext shared across phases
    phases/
      setup.ts                      # connect GCP+GitHub, open canvas
      describe.ts                   # write description.md, log scenario
      design.ts                     # drag blocks, set props, connect
      deploy.ts                     # plan → apply, with recipe loop
      verify.ts                     # gcloud checks via gcp-verify.ts
      cleanup.ts                    # destroy or preserve
    ui-helpers/
      canvas.ts                     # addBlock, connectBlocks, selectBlock
      properties.ts                 # setProperty (data-prop-key + label fallback)
    logger/
      run-logger.ts                 # JSONL writer + summary.json emission
      event-types.ts                # discriminated union of event kinds
    recipes/
      api-not-enabled.ts            # auto-enable missing APIs via gcloud
      config.ts                     # re-apply scenario properties
      network.ts                    # backoff + retry
      billing-disabled.ts           # human-pause recipe
      index.ts                      # registry; gates by scenario.recipes.allow
    reporter/
      html-report.ts                # timeline HTML for a run
  deployment-tests.spec.ts          # Playwright entry — one test() per scenario
```

## Scenario YAML

A scenario describes a project: blocks, their properties, how they connect, expected GCP resources after deploy, and which recovery recipes are permitted.

```yaml
id: static-site                                 # kebab-case, used as test id
name: Static Site (qs-static-site)
description: |
  Free-form description; written to description.md and emitted as a
  note event in events.jsonl.

baseTemplate: Static Site                       # name as shown on /templates

project:
  gcp:
    project: ${ICE_TEST_GCP_PROJECT}            # ${VAR} env-var interpolation
    region: us-central1

blocks: []                                      # extra blocks to add on top of
                                                # the template — empty means
                                                # deploy template as-is
connections: []

expect:
  resources:
    - kind: gcp.storage.bucket                  # matches gcp-verify.ts dispatch
    # other matchers: name (exact), nameContains, domain

recipes:
  allow: [api_not_enabled, network]             # categories the runner may auto-fix
  forbid: ["*"]                                 # everything else is log-and-stop

validation:
  # Canvas validation runs after design phase. Errors AND warnings block
  # deploy by default. Use this list to suppress specific warning codes
  # for known/intentional cases, or "*" to disable the warning gate.
  allowWarnings: []

cleanup:
  destroyOnSuccess: true                        # tear down on success
  destroyOnFailure: false                       # preserve on failure for inspection
```

If a scenario needs to add custom blocks on top of a template, use the same
schema fields (`blocks`, `connections`) as illustrated in earlier drafts —
the design phase places anything listed there onto the canvas after the
template loads. Today we only ship template-only scenarios because the
generic block-placement path hasn't been validated end-to-end yet.

### Schema reference

Field validation lives in [`runner/schema.ts`](runner/schema.ts) (Zod). Key rules:

- `id` must be kebab-case; collision with another scenario file is fine — Playwright dedupes by file path.
- `baseTemplate` is the **user-facing template name** as shown on `/templates` (e.g. `Static Site`, `Full-Stack Web App`), not the template id. There is no "Empty" template today.
- `blocks` and `connections` are optional; for template-only scenarios leave them as empty arrays.
- Every `connections.from`/`to` and `blocks.parent` must reference a known `blocks.id`.
- `expect.resources.kind` must match a key in [`gcp-verify.ts`](../utils/gcp-verify.ts) — currently 22 GCP resource types.
- `recipes.allow` can only contain values from the `ErrorCategory` union in [`error-classifier.ts`](../utils/error-classifier.ts).
- Env-var interpolation: `${SCENARIO_ID}` resolves to the scenario's `id`; everything else reads from `process.env` and throws if undefined.

### Validated blocks

The harness is tuned for the four production-validated block types:

| iceType | Properties used in scenarios |
|---|---|
| `Source.Repository` | `repository`, `branch`, `buildCommand`, `outputDirectory` |
| `Compute.StaticSite` | (rendered generically via core property schemas) |
| `Network.CustomDomain` | `domain` (and `routes[].subdomain` for multi-route) |
| `Network.PrivateNetwork` | `ingress`, `egress`, `ingressAllowlist`, `egressAllowlist` |

Property panel inputs for these blocks expose `data-prop-key="<key>"` so scenarios reference fields by name (see [Implementation notes](#implementation-notes)). For other blocks, `PropertiesUI.setText` falls back to label-text matching, which is more brittle.

## Run lifecycle

Each scenario runs through six phases in order. A failure short-circuits later phases (cleanup always runs).

| Phase | What it does | What it logs |
|---|---|---|
| `setup` | Connect GCP+GitHub via UI, land on canvas | `ui_action`, connection status notes |
| `describe` | Write `description.md`, log scenario summary | one `note` |
| `design` | Drag each block from palette → set properties → connect ports | `ui_action`, `screenshot`, drained `api_*` from action log |
| `deploy` | Open deploy panel → configure → plan (with retry+recipe) → apply with log streaming | `api_call`/`api_response`/`api_error`, `error_classified`, `recipe_attempt`/`recipe_result`, `deploy_log_tail` |
| `verify` | Match `expect.resources` against apply output, gcloud-verify each | `gcloud_check`, `gcloud_result` |
| `cleanup` | Destroy on success (per `destroyOnSuccess`) or preserve + write `PRESERVED.md` | `ui_action`, notes |

## Logs

Each event in `events.jsonl` is one JSON object per line. Every event has a common envelope plus a discriminated body:

```jsonc
{
  "ts": 1740000000000,
  "runId": "20260425-115439",
  "scenarioId": "static-site",
  "phase": "deploy",
  "step": "plan:attempt-1",
  "seq": 42,
  "kind": "error_classified",
  "classified": { "category": "api_not_enabled", "suggestion": "Enable cloudbuild.googleapis.com", ... },
  "raw": "..."
}
```

Event kinds (see [`event-types.ts`](runner/logger/event-types.ts)):

- **Phase markers:** `phase_start`, `phase_end`
- **UI:** `ui_action` (click/fill/drag/select/keyboard/wait), `screenshot`
- **App API events** (mirrored from `window.__ICE_ACTION_LOG__`): `api_call`, `api_response`, `api_error`
- **Errors + recovery:** `error_classified`, `recipe_attempt`, `recipe_result`, `wait_for_human`
- **Verification:** `gcloud_check`, `gcloud_result`
- **Misc:** `note` (free-form), `deploy_log_tail` (stream from `#ice-deploy-log`)

A `summary.json` is written at end of run with totals, per-phase status/duration, verify results, and overall pass/fail. The HTML reporter ([`reporter/html-report.ts`](runner/reporter/html-report.ts)) renders a timeline directly from these two files; you can re-render any past run with:

```bash
npx tsx e2e/deployment-tests/runner/reporter/html-report.ts test-results/runs/<dir>
```

## Recipes

Recipes auto-recover from classified errors. Each recipe declares which `ErrorCategory` it handles, a `match(err)` predicate, a `fix(ctx, err)` body, and a `maxAttempts` cap. The runner runs at most one recipe per failed step and only if the scenario's `recipes.allow` permits the category.

Built-in recipes:

| Recipe | Category | Behavior |
|---|---|---|
| `api-not-enabled` | `api_not_enabled` | extracts `<api>.googleapis.com` from the error, runs `gcloud services enable`, waits 30s, retries |
| `config` | `config` | re-selects every scenario block and re-applies its properties from the spec |
| `network` | `network` | exponential backoff (5s/15s/45s) up to 3 attempts |
| `billing-disabled` | `permission` (billing-specific) | emits `wait_for_human` with the GCP billing console URL; never auto-fixes |

A scenario opts in like this:

```yaml
recipes:
  allow: [api_not_enabled, config]
  forbid: ["*"]    # everything else short-circuits the phase as failed
```

To add a recipe: implement `Recipe` in `runner/recipes/your-recipe.ts`, register it in `runner/recipes/index.ts`, and add its category to scenarios that should opt in.

## Authoring a new scenario

1. Pick a kebab-case id, e.g. `pubsub-fanout`.
2. Create `scenarios/<NN>-<id>.yaml` (NN sorts alphabetically — affects discovery order).
3. Add blocks using `iceType`s that exist in [`packages/blocks/`](../../packages/blocks/src). Use only validated blocks (table above) for stable selectors.
4. Add `expect.resources` entries for what should exist after apply. Lookup names — open the GCP console after a successful manual deploy to learn the naming convention.
5. Run with `ICE_SCENARIO_ID=<your-id> pnpm test:scenarios`. Iterate against the `index.html` timeline until green.
6. If you hit a class of error you want auto-recovery for, write or extend a recipe.

## Implementation notes

### Property selectors (`data-prop-key`)

The harness drives the properties panel via `[data-prop-key="<field>"]` attributes on input elements. These were added to:

- `TextField`, `NumberField`, `SelectField` in [`packages/ui/src/features/properties/components/properties-panel.tsx`](../../packages/ui/src/features/properties/components/properties-panel.tsx) — accept an optional `propKey` prop.
- The wrapper around `PropertyFields`'s generic property render (covers `Compute.StaticSite` and any other generically-rendered block via core `HighLevelProperty` schemas).
- `SourceRepositorySection` build/output TextFields and the branch `<select>`.
- `CustomDomainPanel` root-domain `<input>` and per-route subdomain `<input>` (with `data-route-id`).

`Network.PrivateNetwork` already exposes stable `data-testid` attributes (`pn-inbound-all`, `pn-inbound-allowlist`, `pn-inbound-allowlist-entry-<n>`, etc.) and is driven via those.

### Drag-drop coordinates

Block placement and connection drawing both use Playwright mouse events with bounding-box snapshots taken just before the drag (see [`ui-helpers/canvas.ts`](runner/ui-helpers/canvas.ts)). Canvas pan/zoom shifts coordinates, so the harness re-reads the canvas bounding box per action rather than caching it.

### Why no true "blank" project

Templates always inject some initial structure into a fresh canvas. The scenario's `baseTemplate: empty` searches the templates page for a template called "Empty" and uses whatever ICE provides there. If a scenario needs a strictly clean canvas, add a delete-presets step at the top of `phases/design.ts` before the block-placement loop.

### Reuse map

The harness deliberately reuses existing utilities — don't duplicate them when extending:

- [`fixtures/template-deploy.fixture.ts`](../fixtures/template-deploy.fixture.ts): credential connect, deploy panel, plan/apply/destroy.
- [`utils/error-classifier.ts`](../utils/error-classifier.ts): 11-category error classifier.
- [`utils/gcp-verify.ts`](../utils/gcp-verify.ts): 22-resource gcloud-CLI verifier dispatch.
- [`utils/action-log-reader.ts`](../utils/action-log-reader.ts): drain `window.__ICE_ACTION_LOG__`.

## Troubleshooting

**Scenario test is skipped.** Set `ICE_TEST_GCP_PROJECT` and `ICE_TEST_SA_KEY_PATH`. The Playwright `test.skip()` guards run before the test body.

**`palette item not found: <iceType>`.** The block isn't in the palette under that exact `data-testid="block-item-<iceType>"`. Check the palette component (`apps/web/src/.../resource-palette.tsx`) and confirm the block's `iceType` matches its blueprint in `packages/blocks/src/`.

**`property input not found for key="<key>"`.** The block's property panel doesn't expose `data-prop-key` for that field. Either add it (small, allowed under "validated blocks: refactor OK") or rely on the label-text fallback by using the visible label text as the key.

**Plan times out at 60s.** ICE's `/canvas/deploy/plan` is hung or slow. Inspect `events.jsonl` for the `api_call` without a matching `api_response`, and check the running gateway logs.

**Verify reports `missing` for a resource that exists.** The matcher (`name` / `nameContains`) didn't match the apply result's deployed resource list. Look at the `note` event with `Apply reported N deployed resource(s)` — if N is 0, the apply response shape may have changed; update `extractDeployedResources` in [`phases/verify.ts`](runner/phases/verify.ts).

**Resources weren't destroyed after a failed run.** That's the default. Set `cleanup.destroyOnFailure: true` in the scenario, or destroy manually using the commands in `PRESERVED.md`.

## See also

- [docs/testing.md](../../docs/testing.md) — Index of test categories.
- [docs/deploying-to-gcp.md](../../docs/deploying-to-gcp.md) — How ICE actually deploys to GCP.
- [docs/blocks-reference.md](../../docs/blocks-reference.md) — Block types and their properties.

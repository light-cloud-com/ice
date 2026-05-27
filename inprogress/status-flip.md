# Phase D — Status flip to `stable`

Final step. Only land this when A, B, C are all done and the rollout-state tables for both providers are all green.

> **Cardinal rule gate** ([README.md](README.md#cardinal-rule)): `stable` advertises "this works on the real cloud". Before flipping `PROVIDER_READINESS` to `stable`, every handler must have its deploy gate ticked in `progress.md` — at least one developer must have run the live test for that handler against their own cloud account and observed it pass.

## D1 — Bump readiness

**Files to modify**

- `packages/constants/src/providers.ts` — `PROVIDER_READINESS`:
  ```ts
  aws: 'stable',     // was 'experimental'
  azure: 'stable',   // was 'experimental'
  ```

The in-app provider badges + `CloudProviderMeta.readiness` derive from this constant, so no other code paths need to change.

**Tasks**

- [ ] Flip AWS to `stable`
- [ ] Flip Azure to `stable`

## D2 — Strip experimental warnings from docs

**Files to modify**

- `docs/deploying-to-aws.md` — remove the "experimental" preface and the "Known gaps vs. GCP" section (or trim to truly remaining gaps).
- `docs/deploying-to-azure.md` — same.
- `docs/provider-status.md` — bump AWS + Azure rows to `stable`; update the "Roadmap" section to remove items 1, 2, 3 (parity work).
- `README.md` — verify any provider-status callouts.

**Tasks**

- [ ] AWS deploy doc
- [ ] Azure deploy doc
- [ ] Provider-status matrix
- [ ] README

## D3 — Update operator notes

**Files to modify**

- `packages/core/src/deploy/providers/aws/README.md` — rollout-state table is all green; remove "Future work" items that landed in A; refresh "Quirks shipped today" with anything new from A1–A6.
- `packages/core/src/deploy/providers/azure/README.md` — same, for B-era work.

**Tasks**

- [ ] AWS operator notes refresh
- [ ] Azure operator notes refresh

## D4 — ROADMAP cleanup

**Files to modify**

- `ROADMAP.md` — under "Providers - `help-wanted`", strike through:

  > AWS + Azure to GCP parity _(top priority - see [`PROVIDER_READINESS`](packages/constants/src/providers.ts))_

  Replace with a note pointing at the next priority (likely Kubernetes deployer or DigitalOcean).

- Same section: re-rank the remaining providers.

**Tasks**

- [ ] ROADMAP "Providers" section refresh

## D5 — Changelog + release notes

**Files to modify**

- `CHANGELOG.md` — add a release entry covering the parity milestone, listing every new handler and the feature-flag flips.

**Tasks**

- [ ] CHANGELOG entry

## Acceptance

After this phase:

- `PROVIDER_READINESS.aws === 'stable'` and `PROVIDER_READINESS.azure === 'stable'`.
- `docs/provider-status.md` matrix shows both as `stable` with no caveats.
- `pnpm test` green across the monorepo.
- Every handler row in both Block-to-handler matrices has its deploy gate ticked — a developer ran the live test against their own account and recorded the run.
- The deploy verification log in `progress.md` lists at least one entry per handler.
- A demo deploy on each of AWS and Azure for the templates in `packages/templates/` succeeds end-to-end on a real account and is logged.

## Tasks

- [ ] D6: every AWS handler's deploy gate ticked at least once by a developer
- [ ] D6: every Azure handler's deploy gate ticked at least once by a developer
- [ ] D6: template demo deploy on real AWS account (per template in `packages/templates/`)
- [ ] D6: template demo deploy on real Azure subscription (per template in `packages/templates/`)

## Dependencies

```
A done  ──┐
B done  ──┼─► D
C done  ──┘
```

D is one PR — it's the announcement. Don't merge it until the previous three phases are reviewed-and-merged.

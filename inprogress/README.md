# Provider Parity Initiative

Bring AWS and Azure to GCP parity. GCP is the reference (`stable`) implementation across 25 handlers, 13 enabled categories, importer, cost tables. AWS sits at experimental with 7/13 categories on and 6 documented unblockers. Azure is nominally experimental but in practice covers only 3 resource types with a monolithic deployer.

Source of truth for status: `packages/constants/src/providers.ts` (`PROVIDER_READINESS`) and `packages/constants/src/feature-flags.ts` (`PROVIDER_FLAGS`). Per-provider operator notes live in `packages/core/src/deploy/providers/<provider>/README.md` (AWS has one; Azure does not yet).

## Phase index

| Phase | Doc                                            | Goal                                                                                                 | Status      |
| ----- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------- |
| A     | [aws-parity.md](aws-parity.md)                 | Flip every gated AWS category + every AWS block has a working handler                                | not started |
| B     | [azure-rebuild.md](azure-rebuild.md)           | Rebuild Azure on the AWS/GCP dispatcher pattern; every Azure block has a working handler + extractor | not started |
| C     | [importers-and-cost.md](importers-and-cost.md) | Wire `Import → From AWS/Azure` UI flows; populate cost tables                                        | not started |
| D     | [status-flip.md](status-flip.md)               | Bump `PROVIDER_READINESS.aws`/`.azure` to `stable`; update docs                                      | not started |
| —     | [progress.md](progress.md)                     | Master progress dashboard (156 tasks)                                                                | live        |

## Cardinal rule

**A handler is only "done" once it has been verified by a successful real-cloud deploy** — a create / update / delete round-trip against a real AWS account or Azure subscription, observed end-to-end.

Mocked-SDK unit tests in `__tests__/` are necessary but not sufficient. They don't catch: API quotas, IAM mismatches, region constraints, long-running operation polling races, eventual-consistency gaps, undocumented SDK behaviours, validation surprises (e.g. global storage-name uniqueness), or runtime-only cert/DNS/VPC dependencies.

Two gates must be ticked before a handler checkbox flips in `progress.md`:

1. **Code gate** — handler + extractor + mocked-SDK tests land in main; CI green.
2. **Deploy gate** — at least one successful real-cloud deploy logged in the "Deploy verification log" at the bottom of `progress.md`, with a link to the canvas / commit / run that exercised it.

A category feature flag flips to `on` only after every handler in that category has both gates ticked. The provider `PROVIDER_READINESS` flip to `stable` (Phase D) requires every handler in `packages/core/src/deploy/providers/{aws,azure}/handlers/` to have both gates ticked.

## Coverage policy

Every iceType in `packages/blocks/src/{aws,azure}/**/*.ts` must round-trip through a working handler + extractor — and that round-trip must be observed on the real cloud, not on mocks. The phase docs each carry a "Block-to-handler coverage matrix" table that enumerates every block file in the provider directory and maps it to the handler that ships in this plan.

The plan is "done" when:

- Both coverage matrices are fully green.
- `progress.md` Grand-total row reads N / N for the code gate AND N / N for the deploy gate.
- The Deploy verification log in `progress.md` lists at least one entry per handler.

If you add a new block file under `packages/blocks/src/{aws,azure}/`, add the row to the matching coverage matrix and add the two checkboxes (code + deploy-verified) in `progress.md` before merging.

A and B can run in parallel — no overlapping files. B should land per-handler PRs (one Azure service per PR, the same shape as GCP handler PRs).

## Current state (audit)

### GCP — `stable`

- 25 handlers in `packages/core/src/deploy/providers/gcp/handlers/` (~4,700 LOC total)
- All 13 categories `on` in `PROVIDER_FLAGS.gcp`
- Full create/update/delete + extractors + importer + auth + tests

### AWS — `experimental` (≈70% to parity)

- 21 handlers in `packages/core/src/deploy/providers/aws/handlers/` (~2,445 LOC)
- 20 extractors in `packages/core/src/deploy/extractors/aws/`
- Modular dispatcher matching GCP shape; account-id resolver; IAM bootstrap; ECS auto-cluster; Lambda auto-build; FIFO suffix; S3 account-id suffix
- 16 dedicated per-handler test files + `_aws-test-harness.ts`
- Direct importer with Resource Explorer + Config fallback
- Categories on: Storage, Messaging, Cache, Monitoring, Security, Source, Config
- Categories off (with documented unblockers): Compute, Frontend, Scheduler, Network, Database, AI, Analytics

### Azure — `experimental` on paper, `design-only` in practice (≈10% to parity)

- One 425-line monolithic `packages/core/src/deploy/providers/azure-deployer.ts`
- Only 3 resource types wired: `azure.compute.virtual_machine`, `azure.storage.account`, `azure.web.app`
- Zero extractors — `packages/core/src/deploy/extractors/azure/` does not exist
- No auth/SDK-loader/subscription-resolver abstractions
- One `azure-deployer.test.ts` covers all 3 services
- `PROVIDER_FLAGS.azure.enabled = false` → hidden from palette/wizard/canvas
- Importer exists with 50+ type-map but the deployer can't act on any of them

## How to update progress

Each phase doc has a Tasks section with markdown checkboxes (`- [ ]` → `- [x]`). When you finish a task:

1. Tick the checkbox in the phase doc.
2. Update `progress.md`'s status column.
3. If a feature flag flips (category turning on or `enabled` going true), update the matrix in `docs/provider-status.md` in the same PR.

## Why this order

1. AWS A1 (VPC blocks) flips 3 categories at once with one piece of work — highest ROI.
2. Azure B1 (scaffolding refactor) is no-functionality-change and unblocks every subsequent Azure PR being reviewable in isolation.
3. Both A and B can ship in parallel by different contributors — different files, different review queues.
4. Importers and cost tables (C) need real deploy parity first; otherwise importing into a provider that can't deploy round-trips poorly.
5. Status flip (D) is the last step — by definition it advertises "this works" so everything below must be done first.

## Out of scope

- Other providers: Kubernetes, Alibaba, OCI, DigitalOcean, IBM. These remain `design-only` until AWS + Azure ship at `stable`.
- Provider-to-provider migration plans.
- Terraform/Pulumi/CDK export parity beyond what `packages/core/src/export/` already does.

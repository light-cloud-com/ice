# Phase C — Importers + cost tables

After Phase A and B leave AWS and Azure with full deploy parity, the remaining experimental → stable gap is the read-side: importing existing cloud resources back into ICE, and providing trustworthy cost estimates.

> **Cardinal rule** ([README.md](README.md#cardinal-rule)): "zero-diff round-trip" means importing real cloud state into ICE and re-deploying it to the same real account without diff — proven by JSONL log entries under `e2e/{aws,azure}-deployment-tests/import/`, not by mocked SDK fixtures.

Today's state:

- AWS importer code exists (`packages/core/src/importers/aws/`) with Resource Explorer + Config fallback, ARN helpers, type-mapper, relationship inference scaffolding, and 7 test files. But: no `Import → From AWS` UI flow wired in the desktop/gateway path.
- Azure importer code exists (`packages/core/src/importers/azure/`) with a 50+ entry type-map and Resource Graph discovery, but the type-map is wider than the deployer's resource set (most imports map to types the deployer can't round-trip).
- Cost tables: GCP has rich per-SKU data; AWS and Azure data is sparser (`packages/core/src/resources/scale-presets-data/` and `cloud-blocks-data/`).

## C1 — AWS importer UI flow

**Goal**: surface the existing `import_aws` function as a wizard in Settings → Import → From AWS, parallel to the GCP import flow.

**Files to check (already exist)**

- `packages/core/src/importers/aws/aws-importer.ts` — entry point.
- `packages/core/src/importers/aws/discovery.ts` — Resource Explorer + Config paths.
- `packages/core/src/importers/aws/graph-conversion.ts` — `aws_result_to_graph` + relationship inference.

**Files to modify/create**

- Wherever GCP's import wizard lives in the desktop renderer — locate by searching for `import_gcp` consumer call sites; add a parallel `import_aws` consumer.
- Add a credential-picker step that reuses the existing AWS provider credential from Settings.
- A region picker (multi-select) that defaults to the deployed region.

**Tests**

- Already comprehensive in `packages/core/src/importers/aws/__tests__/`. Verify they still pass after UI consumer lands.

**Acceptance**

- Connect a **real** AWS account in Settings → Providers.
- Settings → Import → From AWS lists every supported region.
- After import: canvas shows imported resources with edges inferred from `infer_relationships`.
- Re-deploying the imported canvas to the **same real account** produces zero diffs across all handlers — logged in `e2e/aws-deployment-tests/import/round-trip.jsonl`.

**Tasks**

- [ ] Wire `import_aws` into the desktop import wizard
- [ ] Region multi-select UI
- [ ] Credential reuse from Settings → Providers
- [ ] Zero-diff round-trip on imported canvas

## C2 — Azure importer enhancements + UI flow

**Goal**: same as C1, but also widen the deployable surface so imported Azure resources can actually be redeployed. Today the type-mapper knows 50+ Azure resource types but only 3 are deployable. Phase B closes that gap; this phase makes the importer aware of the full set.

**Files to check (already exist)**

- `packages/core/src/importers/azure/azure-importer.ts` — entry point, uses Resource Graph.
- `packages/core/src/importers/azure/type-mapper.ts` — 50+ entries.

**Files to create**

- `packages/core/src/importers/azure/relationships.ts` — relationship inference parallel to `gcp/relationships.ts` and `aws/graph-conversion.ts`'s `infer_relationships`. Azure relationships to infer:
  - VM → NIC → Subnet → VNet
  - Web App → App Service Plan
  - Function App → Storage Account + ASP
  - SQL Database → SQL Server
  - Cosmos DB collections → account
  - Container Apps → ManagedEnvironment → Log Analytics workspace
  - AKS cluster → managed VNet/Subnet
  - Front Door + App Gateway → backend pools (Web App / Container App / VM)
  - APIM → backend services

**Files to modify**

- `packages/core/src/importers/azure/type-mapper.ts` — verify every type the deployer can act on (from B2) has an entry. Currently the deployer set is the bottleneck, not the importer.
- The desktop/gateway import wizard (same surface touched by C1).

**Tests**

- New `relationships.test.ts` covering each inferred relationship class.
- Integration test: import → graph → plan → "no diff" on a small canvas.

**Acceptance**

- Same as C1 but for a **real** Azure subscription.
- Re-deploying the imported canvas to the same real subscription produces zero diffs across all handlers — logged in `e2e/azure-deployment-tests/import/round-trip.jsonl`.

**Tasks**

- [ ] relationships.ts
- [ ] type-mapper completeness check vs B2 handler set
- [ ] Wire `import_azure` into desktop import wizard
- [ ] Region/subscription multi-select UI
- [ ] Credential reuse
- [ ] Zero-diff round-trip on imported canvas
- [ ] relationships test
- [ ] Integration test

## C3 — Cost estimation parity

GCP's cost tables are denser than AWS/Azure. The canvas shows projected cost in the right rail per block; cards with sparse data show "—" or stale numbers.

**Files to inspect**

- `packages/core/src/resources/scale-presets-data/` — per-block-per-provider preset data.
- `packages/core/src/resources/cloud-blocks-data/` — cost columns per provider.
- `packages/core/src/__tests__/` — coverage tests.

**Tasks**

- [ ] Inventory current AWS coverage by category (which blocks have AWS cost data vs only GCP)
- [ ] Inventory current Azure coverage
- [ ] Populate missing AWS prices for at least the categories that flip in Phase A
- [ ] Populate missing Azure prices for at least the categories that flip in Phase B
- [ ] Add a coverage test that fails when a `stable` provider is missing cost data for a block

**Acceptance**

- For every block in the palette where the deployer's category is `on`, projected cost displays a number, not a dash.
- A coverage test in `packages/core/src/__tests__/` prevents regressions.

## Cross-cutting acceptance

When Phase C is done:

- Settings → Import works for AWS and Azure with the same UX shape as GCP.
- A round-trip import → re-deploy produces zero diffs on a small canvas for both providers.
- Cost projections are populated for all blocks whose category is `on` for AWS and Azure.

## Dependencies

```
A complete ──┐
B complete ──┴─► C1 + C2 + C3 in parallel (different files)
                            │
                            └─► D (status flip)
```

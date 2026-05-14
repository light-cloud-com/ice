# @ice/core

The deploy engine. Defines the graph, the translate/plan/apply pipeline, schemas, importers, and the per-provider deployer interface.

Where to start reading:

- `src/translate/` — card → graph translation.
- `src/deploy/` — plan/apply pipeline. `deploy/providers/{aws,azure,gcp}` for per-provider handlers; `gcp-deployer.ts` is the reference implementation.
- `src/importers/` — read existing cloud state into a canvas. GCP-only today.
- `src/resources/high-level-resources/` — provider-agnostic resource catalogue that powers the concept palette.
- `src/schemas/` — protobuf-derived resource type definitions.

This package has no runtime dependencies on UI or HTTP code — it's the pure brain.

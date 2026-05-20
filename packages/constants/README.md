# @ice/constants

Pure constants. Zero runtime dependencies. Imported by both browser and Node code.

Notable exports:

- `Provider`, `ALL_PROVIDERS`, `PROVIDER_READINESS`, `CLOUD_PROVIDERS` — provider identity and per-provider readiness (`stable` / `experimental` / `design-only`). Surfaced in the Add Provider UI.
- `PROVIDER_REGIONS`, `REGION_SUGGESTION_ORDER` — regions per cloud.
- `ICE_TYPE_TO_RESOURCE_ID`, `VALID_TEMPLATE_ICE_TYPES`, `TYPE_TO_CATEGORY` — the type system used by translate/plan/apply.
- Grid + layout constants (`CARD_WIDTH`, `CHILD_GAP`, etc.) consumed by the canvas auto-layout.
- `COST_CATEGORY_LABELS`, `TIER_SCALE_FACTOR` — cost-estimation lookup tables.
- `GCP_BASE_APIS`, `GCP_ICE_TYPE_API_MAP` — which GCP APIs need enabling per ICE resource type.

Source files are tiny (one concern each) — read the relevant `src/*.ts` directly.

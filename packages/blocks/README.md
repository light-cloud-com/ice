# @ice/blocks

Block blueprints — the catalog of draggable cards users see in the palette. Two layers:

- **Concepts** (`src/common/concepts/`) — provider-agnostic primitives (Static Site, Database, Custom Domain, etc.). One concept compiles to one or more per-provider blueprints. 25 concepts today.
- **Per-provider blueprints** (`src/{aws,gcp,azure,kubernetes,alibaba,oci,digitalocean}/`) — the resource-level cards under the concept layer. Mostly hidden from the palette by default; surfaced when a concept needs to expand to multiple options.

Each concept directory has three files:

- `blueprint.ts` — schema, nodeData defaults, provider variants.
- `info.ts` — the Info-panel content (overview, "compiles to", code snippets per language).
- `index.ts` — re-exports.

To add a new block, see [`docs/blocks-reference.md`](../../docs/blocks-reference.md).

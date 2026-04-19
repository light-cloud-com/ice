# Concepts Palette — Implementation Plan

Companion to `concepts-palette.md`. That doc defines **what** the 26 Concept blocks are and **why** they were chosen. This doc defines **how** to build them.

## Canvas-only concepts (Log Terminal, Public Traffic, Group)

Three of the 26 concepts are special: they are **canvas-only**, not infrastructure. They do not provision any cloud resources. They are semantic/visual affordances on the diagram — different in purpose, but united by having no compiler output.

### Shared treatment

- **No compiler output.** Placing any of these on the canvas emits zero Terraform/Pulumi resources. `card-translator.ts` must skip them via a `CANVAS_ONLY_ICE_TYPES` set that short-circuits translation.
- **Bespoke visuals.** None fit the standard 6 visual families. Each registers its own component in `VISUAL_REGISTRY` as an override.
- **Info (i) panel "Compiles To" tab** explicitly says "No infrastructure — canvas-only block." The Overview tab explains its purpose and valid connections.
- **Connection rules** must allow their edges as special (data-feed, containment, or source) rather than standard infra wiring.
- **Read-only at deploy time.** They do not appear in deploy output or project exports.

### Per-concept details

**Log Terminal** — already exists as `Monitoring.Terminal` in `packages/blocks/src/{aws,gcp,azure,kubernetes}/observability/log-terminal.ts` (icon `Terminal`, keyed to resource `log-group`). Promote to `common/concepts/log-terminal/`.

- Role: **downstream log viewer.** Consumes logs from a connected service.
- Connects FROM: Scalable Backend, Serverless Function, Worker, Scheduled Task, SSR Site, API Gateway, Observability.
- Edge semantics: the edge carries the log source identifier so the runtime knows what to tail.
- Visual: small terminal window with streaming text.
- Zoom states: summary = last log line + source name; detailed = several lines + pause/resume controls.

**Public Traffic** — already exists as `Network.PublicTraffic` iceType (referenced in `packages/ui/src/assets/icons/service-names.ts:148` and `packages/ui/src/features/canvas/components/nodes/compact-node/context-lines.ts:189`), but has no dedicated blueprint yet. Create `common/concepts/public-traffic/`.

- Role: **symbolic upstream source.** Represents the internet / outside world / end users as the origin of public traffic on the diagram — the classic "cloud labeled Users" icon in architecture diagrams. It is NOT a request log viewer; it is a source node that makes the diagram legible by saying "traffic enters the system here."
- Connects TO: Public Endpoint, Custom Domain, API Gateway, Scalable Backend, SSR Site, Static Site.
- Edge semantics: represents the public ingress path. The edge has no runtime data — it's pure documentation.
- Visual: cloud/globe/users silhouette with a subtle animated indicator (optional traffic ripple) to hint at "live traffic."
- Zoom states: summary = just the icon + "Internet"; detailed = same plus a small count of connected ingress points and (if available) a live RPS reading sourced from the downstream endpoint.

**Group** — the generic visual container for organizing blocks on the canvas. Already exists and is on the **validated blocks list** (do not change functionality). The existing node renderer and container behavior stay as-is.

- Role: **visual organization only.** A Group is a labeled container that holds other blocks; it has no semantic meaning for deployment. Users drop related blocks inside a Group to bucket them visually ("Frontend stack", "Data layer", "Team A's services").
- Contains: any block. No type restrictions.
- Edge semantics: none — Group uses containment, not edges.
- Visual: existing design (validated). Do not re-style.
- Zoom states: whatever the existing Group node currently does (see `packages/ui/src/features/canvas/components/nodes/group-node/group-lod1.tsx`, `group-lod2.tsx`, `group-lod3.tsx` — already has level-of-detail rendering). Do not invent new states.
- Migration: create `common/concepts/group/` as a thin wrapper that registers the existing Group renderer in `VISUAL_REGISTRY`. No functional changes.

## Validated blocks — preserve functionality

The user is happy with these five blocks as they exist today. Refactoring them (moving files into `common/concepts/<name>/`, adding the (i) info panel, extracting shared helpers) is fine, but **do not change their functionality, visuals, or interactions**:

- **GitHub Repository** — `packages/blocks/src/common/source/github-repository.ts`
- **Custom Domain** — `packages/blocks/src/common/networking/custom-domain.ts` + `packages/ui/src/features/canvas/components/nodes/custom-domain/`
- **Static Site** — aws/gcp/azure variants
- **Group** — generic container node
- **Private Network** — `packages/blocks/src/common/networking/private-network.ts` + `packages/ui/src/features/canvas/components/nodes/private-network/`

These five are the visual reference for "what a concept block should feel like." When building the other 19 concepts (Postgres, Scalable Backend, etc.), match their style. If a shared-code refactor touches them, verify they still render and behave identically before considering the refactor done.

## Locked-in decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Concepts co-exist with 124 raw blueprints, or replace them? | **Co-exist.** Concepts are the default palette; raw blocks remain registered for Level 2. Same `BlockBlueprint` type so `card-translator.ts` keeps working unchanged. |
| Q2 | Where does cost estimation live? | **Its own package** (`@ice/cost` or similar). Not in `@ice/core`, not in `@ice/blocks`. Shared between UI, compiler, CLI. |
| Q3 | Initial snippet languages | **TS, Python, Go, Java, C#, Rust** (6 languages from day one). |
| Q4 | Info content format | **TypeScript files with markdown string literals.** No MDX toolchain. Type-safe, autocompletable, lints fail if snippet languages are missing. |
| Q5 | What does a block show visually? | **Concept + provider.** Each block displays both its concept identity (e.g. "Static Site") and the target provider (AWS / GCP / Azure). Users always see what the block is AND where it will deploy. The concept-to-raw breakdown (VPC, subnets, NAT, etc.) lives in the info (i) panel, not on the canvas. |
| Q6 | Pro gate? | **No.** Pro will be a separate ICE edition, not a flag on this edition. |

## Important clarifications

Three independent concerns the plan must keep separated:

1. **Concept + provider on the block itself.** Every block always shows both pieces of info on its card: the concept identity (name, family icon) and the current target provider (brand badge/label). A user glancing at the canvas sees "Static Site → AWS" at once. No toggle, no mode — both are always present.
2. **Zoom states** are small visual refinements to the same card as the user zooms in/out. Examples: at low zoom a block shows just its name + icon; at higher zoom it also shows cost, instance count, status badge, a small chart. **These are cosmetic details on the same card.** A Private Network block at any zoom level is still "a box labeled Private Network" — it does NOT reveal VPC/subnet/NAT primitives inside itself.
3. **The info (i) panel** is where the concept-to-raw breakdown lives. Opening Private Network's info panel shows the user what it compiles to on each provider: VPC + subnets + NAT gateway + route tables. This is documentation, not a canvas reveal.

The palette only shows the 26 Concept blocks. Raw provider-specific blocks stay registered for backwards compat with existing projects but are not in the palette. `Level 1 / Level 2` in `visualization-config.ts` is left alone — unrelated to this redesign.

## Grounding: what already exists

- **Schema source of truth**: `packages/core/src/resources/high-level-resources.ts` (6212 lines). `HIGH_LEVEL_CATEGORIES` with `HighLevelResource` entries — each has `id`, `name`, `icon`, `behavior`, `providers`, `implementations[]` (per-provider resource_type mapping), `keywords[]`, and `HighLevelProperty[]` (with `tier`, `optionDetails`, `customInput`, `tooltip`). This is already the de-facto Concept model for most of the 23. The redesign does **not** rebuild this — it adds missing entries and layers visuals/info on top.
- **Per-provider blueprint wrappers**: ~124 thin files in `packages/blocks/src/{aws,gcp,azure,kubernetes,alibaba,oci,digitalocean}/**`, each calling `createBlueprintFromResource(resourceId, {...})` from `packages/core/src/resources/blueprint-factory.ts`. They contribute: `iceType`, `category`, provider-specific `name`, `nodeDataDefaults`, sparse `providerVariants`. Concept-per-provider compilation already happens here via resourceId lookup — no re-architecting.
- **Common provider-agnostic blocks**: `packages/blocks/src/common/{config,networking,source}/` already holds 5 blocks (`githubRepositoryBlueprint`, `envConfigBlueprint`, `publicEndpointBlueprint`, `customDomainBlueprint`, `privateNetworkBlueprint`). These are full `BlockBlueprint` objects (not factory-generated) because they're provider-agnostic. **This is exactly the shape the 26 Concepts should take.**
- **Registry**: `packages/blocks/src/index.ts` aggregates all ~130 blueprints into `BLOCK_BLUEPRINTS` with lookup by `iceType` + optional provider.
- **View level system**: `packages/ui/src/config/visualization-config.ts` already has `VIEW_LEVELS: Record<1|2, ViewLevelConfig>` with `visibleCategories[]` driving `isTypeVisibleAtLevel()`. Currently gates canvas rendering. The redesign repurposes it to also gate palette entries; Level 1 = 23 Concepts, Level 2 = Concepts + raw provider blocks.
- **Canvas nodes**: `SvgGroupNode` at `packages/ui/src/features/canvas/components/nodes/group-node/index.tsx` is the dispatcher; delegates to `BlockNode` (`group-node/block-node.tsx`) for block-behavior nodes. `svg-canvas.tsx` (lines 54-57, 433, 441) already hand-dispatches two custom shapes: `SvgPrivateNetworkNode` and `SvgCustomDomainNode`. **This is the existing visual-variant escape hatch — the plan formalizes it.**
- **Compiler**: `packages/core/src/deploy/card-translator.ts` (1347 lines). Already handles `Network.PrivateNetwork` as a UI container and has special-case logic for `CustomDomain` nested inside it (lines 231-260, 957-970). Private Network is half-wired; missing piece is the Scalable Backend ingress switch near line ~1060.
- **Palette UI**: `packages/ui/src/features/palette/components/resource-palette.tsx` is hand-coded category definitions (`CATEGORY_DEFS`), not driven from `BLOCK_BLUEPRINTS`. **Notable gap — palette does not automatically reflect the blueprint registry.**

---

## 1. File structure for a Concept block

```
packages/blocks/src/common/
  concepts/                              NEW directory
    _shared/
      types.ts                           ConceptBlueprint, VisualFamily, InfoContent types
      helpers.ts                         mergeProviderVariants(), pickIconForProvider(), resolveDefaults(),
                                         validateConceptProps()
      visual-registry.ts                 { [iceType]: VisualVariant } dispatch map + registerVisual()
      info-registry.ts                   { [iceType]: InfoContent } dispatch map + registerInfo()
      code-snippets.ts                   SnippetLanguage union ('ts'|'py'|'go'|'java'|'csharp'|'rust')
                                         + defineSnippets<L>() helper
    static-site/
      blueprint.ts                       provider-agnostic ConceptBlueprint (iceType Compute.StaticSite)
      visual.tsx                         <StaticSiteVisual /> — browser-chrome variant
      info.ts                            { overview, snippets: { ts, py, go, java, csharp, rust }, diagrams }
      diagrams/                          SVG assets co-located with the concept
      index.ts                           barrel: re-exports + registers visual + info into global maps
    ssr-site/{blueprint,visual,info,diagrams,index}
    scalable-backend/{...}
    serverless-function/{...}
    worker/{...}
    scheduled-task/{...}
    postgres/{...}
    mysql/{...}
    mongodb/{...}
    redis-cache/{...}
    object-storage/{...}
    vector-db/{...}
    message-queue/{...}
    event-stream/{...}
    email-service/{...}
    custom-domain/{...}                  (migrate from common/networking/custom-domain.ts)
    api-gateway/{...}
    private-network/{...}                (migrate from common/networking/private-network.ts)
    llm-gateway/{...}
    private-ai-service/{...}
    observability/{...}
    secret-store/{...}
    github-repo/{...}                    (migrate from common/source/github-repository.ts)
    index.ts                             aggregates all 26 into CONCEPT_BLUEPRINTS[], plus registers
                                         visual + info maps in one place
```

### Why this shape

- **Blueprint / visual / info as siblings** — a Concept has three artifacts that change together (schema, appearance, docs). Colocating avoids hunting across three package trees when editing one concept.
- **`_shared/`** — signals "helpers for the 26 concepts only," not "shared with the rest of the repo."
- **`index.ts` barrel per concept** — lets the top-level `concepts/index.ts` import each concept as a single symbol and keeps registry hydration (visual/info map writes) centralized.
- **Migrate the 3 existing common blocks** (`github-repository`, `custom-domain`, `private-network`) into this new shape so the layout is uniform across all 26. Mechanical: rename + add `visual.tsx` + `info.ts`. The `BLOCK_BLUEPRINTS` registry replaces the three direct imports with `...CONCEPT_BLUEPRINTS`.
- **`diagrams/` co-located** — SVG assets live next to their `info.ts`, resolved by Vite as module imports. Keeps each concept hermetic.

---

## 2. Shared core for Concept blocks

### What already exists (reuse, don't rebuild)

- `createBlueprintFromResource(resourceId, overrides)` — `packages/core/src/resources/blueprint-factory.ts:84`. Works as-is for concepts. The merging logic (schema providers × overrides × nodeDataDefaults) is what concepts need.
- `HIGH_LEVEL_CATEGORIES` — `packages/core/src/resources/high-level-resources.ts:106`. Property schemas, provider implementations, keywords.
- `SCALE_PRESETS` — `packages/core/src/resources/scale-presets.ts`. Already keyed by `resourceId`.
- `BLOCK_ACCENT_COLORS` — `packages/ui/src/config/color-palette.ts`. Keyed on iceType suffix.
- `getBrandIcon()` — `packages/ui/src/assets/icons/brand-registry`.

### What's new in `packages/blocks/src/common/concepts/_shared/`

1. **`types.ts`** — re-exports `BlockBlueprint`; adds a narrowed `ConceptBlueprint = BlockBlueprint & { conceptId: string; visualFamily: VisualFamily; infoRef: string }`. Defines `VisualFamily = 'frontend' | 'compute' | 'data' | 'messaging' | 'edge' | 'ai'`. Defines `InfoContent`, `CodeSnippet`, `SnippetLanguage`.
2. **`helpers.ts`** — small utilities every concept needs:
   - `mergeProviderVariants(variants, provider)` — flatten sparse overrides
   - `resolveProviderIcon(concept, provider)` — pick brand icon given current compile target
   - `defaultScalePreset(concept)` — lookup into SCALE_PRESETS
   - `validateConceptProps(concept, nodeData)` — property schema check driven off HIGH_LEVEL_CATEGORIES
   - Cost estimation is **NOT** here; it lives in the new `@ice/cost` package (see below).
3. **`visual-registry.ts`** — exports `VISUAL_REGISTRY: Record<string, React.FC<ConceptVisualProps>>` and `registerVisual(iceType, component)`. Each concept's `index.ts` calls `registerVisual` at module load. `BlockNode` dispatcher reads from this registry.
4. **`info-registry.ts`** — same pattern for info content: `INFO_REGISTRY: Record<string, InfoContent>`. The (i) modal reads from this.
5. **`code-snippets.ts`** — a small helper, `defineSnippets<L extends SnippetLanguage>({...})`, plus the `SnippetLanguage` union. Adding a new language later = extending the union + filling in missing entries; TypeScript catches partial rollouts.

### New package: `@ice/cost`

Create `packages/cost/` as a new workspace package.

**Why its own package** (user decision Q2):
- Shared between UI (live cost estimates in blocks), compiler (budget checks at deploy time), and potentially a future CLI (`ice estimate`).
- Isolating it makes cost data (prices, regions, tiers) easy to edit without touching `@ice/core` or `@ice/blocks`.
- Versioned separately — price updates don't force core/blocks bumps.

**Shape:**
```
packages/cost/
  src/
    index.ts                    main API: estimateConceptCost(), estimateProjectCost()
    providers/
      aws.ts                    AWS pricing tables (per resource type × size × region)
      gcp.ts
      azure.ts
      kubernetes.ts
    concepts/
      static-site.ts            concept-level cost logic (maps to provider primitives)
      scalable-backend.ts
      postgres.ts
      ...
    types.ts                    CostEstimate, PricingTable, Region
  package.json                  depends on nothing from ice; pure data + functions
```

Consumers:
- `@ice/blocks` (UI) imports `estimateConceptCost(concept, nodeData, provider)` to show live cost on the block card.
- `@ice/core` compiler imports `estimateProjectCost(cards)` for budget-check features later.

### What to extend in `high-level-resources.ts`

Audit the 23 concept list against existing `HIGH_LEVEL_CATEGORIES`. Most exist: `frontend-app`, `ssr-app`, `container-service`, `serverless-function`, `worker`, `cron-job`, `postgres-db`, `mysql-db`, `mongo-db`, `redis-cache`, `object-storage`, `vector-db`, `message-queue`, `event-stream`, `email-service`, `api-gateway`, `logs`, `secrets`. **Probably missing or underspecified**: `custom-domain` (needs proper `domain` + `routes[]` schema), `private-network` (needs ingress/egress schema pulled from the existing blueprint), `llm-gateway`, `private-ai-service`. Add those entries.

---

## 3. Info (i) icon with tabbed modal

### Storage format: **TypeScript files with markdown string literals**

Not MDX. Not JSON. Not external Markdown. Reasons:
- MDX compilation needs a build-step toolchain this package doesn't currently use.
- JSON is worse than TS for authoring (no autocomplete, no TS validation of snippet language keys, no IDE lint).
- Loose `.md` files force a runtime parser.
- TS files let you `import { postgresInfo } from './info'`, use `as const`, enforce `SnippetLanguage` types at compile time, and still write prose as template literals.

**Shape** (one file per concept at `common/concepts/<name>/info.ts`):

```
{
  overview: { markdown: string, diagrams?: Diagram[] },
  compilesTo: {
    aws?: RawPrimitive[],       // e.g. [{ name: 'VPC', type: 'aws_vpc' }, { name: 'Subnet', type: 'aws_subnet' }]
    gcp?: RawPrimitive[],
    azure?: RawPrimitive[],
    // ... per-provider raw resource breakdown
  },
  snippets: {
    ts: string,
    py: string,
    go: string,
    java: string,
    csharp: string,
    rust: string
  },
  links?: [{ label, url }],
  relatedConcepts?: string[],  // iceType[]
}
```

The `compilesTo` field is the key concept-to-raw reveal. Private Network's info panel will show, per provider, the exact list of primitives (VPC + subnets + NAT + route tables for AWS, different set for GCP, etc.). This data can be sourced directly from `cloud-blocks.ts` `expands_to` definitions where they exist, so it stays in sync with the compiler.

For Markdown rendering, check if `react-markdown` or similar is already in deps. If yes, reuse; if not, a tiny manual renderer of headings/code/links is ~40 lines and avoids pulling in a dep just for this.

### Modal component

Create `packages/ui/src/features/concept-info/`:
```
concept-info-modal.tsx       — tabbed Radix Dialog; tabs: Overview, Compiles To, Code, Links
concept-info-trigger.tsx     — the (i) icon button mounted on block nodes + properties panel
use-concept-info.ts          — hook that reads INFO_REGISTRY by iceType, gates open state
tabs/overview-tab.tsx        — renders markdown + diagrams
tabs/compiles-to-tab.tsx     — per-provider raw primitives list (VPC, subnets, NAT, ...)
tabs/snippets-tab.tsx        — language picker (6 langs) + syntax-highlighted code block
tabs/links-tab.tsx           — external links (AWS/GCP docs)
```

**Compiles To tab** is where the concept-to-raw transparency lives. It shows a provider picker (AWS / GCP / Azure / ...) and for each provider lists the raw resources the concept will emit, with their Terraform/Pulumi types. This is what lets users understand "what am I actually getting" without needing to leave the block.

### Where the (i) icon mounts

Two mount points, both use the same `ConceptInfoTrigger`:
1. **On the block node** — extend `packages/ui/src/features/canvas/components/nodes/group-node/block-node.tsx` to render a small (i) button in the top-right of the header, next to `FoldButton` (line 139). Renders only when the node's iceType is in `INFO_REGISTRY`.
2. **In the properties panel** — `packages/ui/src/features/properties/components/properties-panel.tsx` — add the (i) next to the block title.

### Code snippets — 6 languages from day one

- `SnippetLanguage = 'ts' | 'py' | 'go' | 'java' | 'csharp' | 'rust'` in `_shared/code-snippets.ts`.
- Every `info.ts` file is typed `InfoContent<SnippetLanguage>`, so removing a language causes a TS error in all 26 files simultaneously.
- **Transitional rollout**: make the snippets map `Partial<Record<SnippetLanguage, string>>`. The UI tab hides languages with no snippet for the current concept. This lets you ship a concept with TS snippets first and backfill the other 5 languages without blocking the feature.
- Plan: seed all concepts with TS + Py + Go at minimum during Slice 3. Backfill Java/C#/Rust in a later pass.

### Images and diagrams

Bundle as SVG/PNG assets under `packages/blocks/src/common/concepts/<name>/diagrams/`. Import as URLs from `info.ts`:

```
import replicationDiagram from './diagrams/replication.svg';
```

Vite resolves the imports. Each concept is self-contained.

---

## 4. Visual variants + zoom states

### Current state

`BlockNode` at `packages/ui/src/features/canvas/components/nodes/group-node/block-node.tsx` is a single SVG `<foreignObject>` with accent bar + header + empty body. Per-block customization today: accent color (from iceType suffix) + brand icon.

Precedent for "this block renders differently":
- `SvgPrivateNetworkNode` in `nodes/private-network/index.tsx` — full custom renderer, hand-dispatched from `svg-canvas.tsx` lines 433-441.
- `SvgCustomDomainNode` — same.

### Three elements on every block

Every concept block card displays, at all times:

1. **Concept identity** — the concept name (e.g. "Static Site"), the family icon, the accent color. This says *what kind of thing* the block is.
2. **Target provider** — a provider brand badge (AWS, GCP, Azure, ...) visible on the card. This says *where it will deploy*. A user scanning the canvas sees both pieces of info at once.
3. **Live data** (cost, instance counts, status) — refined by zoom state (below).

### Two dimensions of variation

Each Concept varies along two axes:

1. **Visual family** (what *kind* of thing is it) — Frontend / Compute / Data / Messaging / Edge / AI. Determines the chrome (silhouette, badges, layout).
2. **Zoom state** (how much detail to show) — keyed off the current canvas zoom level. Most concepts have 2 states: `summary` (name + icon + provider badge at low zoom) and `detailed` (adds cost, instance count, status, small charts at higher zoom). **Zoom states are cosmetic refinements only.** They do not reveal internal architecture — the raw primitives (VPC, subnets, NAT) live in the info (i) panel, not inside the block.

### Proposed extension point

Do **not** fork `BlockNode` 23 times. Instead:

1. Add two new props to `BlockNodeProps` (`group-node/types.ts`):
   - `visualFamily: VisualFamily` — derived in `SvgGroupNode` from `iceType` via `ICE_TYPE_TO_FAMILY` lookup in `visual-registry.ts`.
   - `zoomState: ZoomState` — derived from current canvas zoom via a small helper `resolveZoomState(zoom: number, thresholds: ZoomThresholds)`. Thresholds are per-concept (defined in `concepts/<name>/visual.tsx`) so each block can tune where the transitions happen.
2. Define **6 family renderers** as sub-components:
   ```
   packages/ui/src/features/canvas/components/nodes/block-node/
     index.tsx              — dispatcher (moves from group-node/block-node.tsx)
     families/
       frontend.tsx         — browser-chrome silhouette overlay (summary + detailed states)
       compute.tsx          — runtime badge + scaling indicator
       data.tsx             — cylinder + engine badge
       messaging.tsx        — pipe silhouette
       edge.tsx             — shield/globe silhouette
       ai.tsx               — accent glow + model badge
       default.tsx          — plain card (fallback for non-concept blocks)
     shared/
       accent-bar.tsx       — extracted from current BlockNode
       header.tsx           — icon + label + fold + info button
       body.tsx             — empty state + cost label + resize
       zoom-state.ts        — resolveZoomState() helper, ZoomThresholds type, default thresholds
   ```
3. Each family renderer accepts `zoomState` and switches its markup between summary and detailed. Example: `data.tsx` in `summary` shows "Postgres" with a cylinder icon + provider badge; in `detailed` adds estimated cost, instance size, connection count.
4. Per-concept visual files (`concepts/<name>/visual.tsx`) can override the family default for either state. A concept registers into `VISUAL_REGISTRY` with:
   ```
   { summary?: React.FC, detailed?: React.FC, thresholds?: ZoomThresholds }
   ```
   Any state it doesn't define falls through to its family renderer. Simple concepts don't need a `visual.tsx` file at all.
5. Concepts with bespoke chrome (Private Network = container shape, Custom Domain = route chip) provide their own `summary` / `detailed` components. **Neither reveals primitives inside itself** — the primitives are listed in the info (i) panel's "Compiles To" tab. Private Network's block card is always "Private Network + provider badge"; zoomed-in shows more metadata (region, CIDR range, NAT enabled y/n) but still no VPC/subnet sub-shapes.
6. `svg-canvas.tsx` dispatching for `PrivateNetwork` and `CustomDomain` (lines 54-57, 433, 441) stays — the custom node components now also consume `zoomState` and render the summary/detailed variants of their own chrome.

### Zoom state resolution

A single hook `useZoomState(blockId, thresholds)`:
- Subscribes to canvas zoom (from the existing zoom state slice).
- Returns the current `ZoomState` for this block based on thresholds.
- Memoized so re-renders only fire at threshold crossings, not on every zoom tick.

Thresholds are defined as canvas zoom values (e.g. `{ summary: 0, detailed: 1.5 }` means switch to detailed at 1.5× zoom). Each concept can override in its `visual.tsx`.

### Files that change

- `packages/ui/src/features/canvas/components/nodes/group-node/block-node.tsx` → moves to `nodes/block-node/index.tsx`, becomes dispatcher.
- `packages/ui/src/features/canvas/components/nodes/group-node/index.tsx:46-51` — also resolves `visualFamily` and subscribes to zoom.
- `packages/ui/src/features/canvas/components/nodes/private-network/index.tsx` — refactor to consume `zoomState`; render the VPC/subnet primitives only in `detailed`.
- `packages/ui/src/features/canvas/components/nodes/custom-domain/` — same treatment.
- Family map in `packages/blocks/src/common/concepts/_shared/visual-registry.ts`.

### Trade-off

Zoom-state rendering means each block's visual code is roughly 2x larger (two states instead of one). Offset: the canvas dramatically simplifies for users who never zoom in, and power users get the full raw view by zooming without needing a toggle or separate palette. Net worth it.

---

## 5. Compiler behavior: Scalable Backend inside Private Network

### Where

`packages/core/src/deploy/card-translator.ts`. Already:
- Maps `Compute.Container` → `gcp.run.service` / `aws.ecs.service` / `azure.containerapp.containerApp` (lines 111, 160, 194).
- Treats `Network.PrivateNetwork` as a UI container that doesn't compile directly but influences children (lines 231-235).
- Has "CustomDomain nested inside PrivateNetwork = gateway" special case (lines 957-970).

### What's missing

When a `Compute.Container` (or any of `SERVICE_BACKEND_ICE_TYPES` at line 1059: Container, BackendAPI, SSRSite, Worker, ServerlessFunction) has a parent whose iceType is `Network.PrivateNetwork`, emit the internal-ingress variant.

### Concrete change

Add a pre-processing helper or extend the Compute.Container handler to:
1. Walk `node.parentId` chain; if any ancestor's `iceType === 'Network.PrivateNetwork'`, mark the node as `ingress: 'internal-and-cloud-load-balancing'` on GCP, `internal` on AWS (ALB → NLB or SG-only), `Internal` LB SKU on Azure.
2. If the parent PrivateNetwork also contains a nested `CustomDomain`, existing code at line 957 already sets that CD up as the external LB; leave it.
3. If parent PrivateNetwork does *not* contain a nested CustomDomain, the service still gets an internal LB but no external gateway — the intended "sealed" story.

Scope: ~40-60 lines. Localizes to one helper `resolveIngressFromTopology(node, parentNodes): IngressMode` + a conditional in the Compute handler per provider.

### Files to touch

- `packages/core/src/deploy/card-translator.ts` — Compute.Container handler (search `SERVICE_BACKEND_ICE_TYPES` at line 1059) + ingress helper.
- `packages/core/src/__tests__/` — add fixture: card with PrivateNetwork → Compute.Container nested, assert emitted ingress per provider.

### Risk flag

**Highest-risk part of the plan.** File is 1347 lines, existing PrivateNetwork + nested-CustomDomain logic is subtle. Do this *after* the vertical slice is proven. Write fixture tests first.

---

## 6. Migration strategy

### Mark low-level blocks as hidden from palette

Add optional field to `packages/blocks/src/types.ts`:
```
hiddenFromPalette?: boolean  // when true, block exists in registry but is not shown in the palette
```
Default false. The ~124 provider-specific blueprints all get `hiddenFromPalette: true`. The 26 concepts stay false.

Rather than editing 124 files by hand: extend `createBlueprintFromResource` factory to default `hiddenFromPalette: true` for anything called from per-provider directories. Concepts explicitly override to `false` (or use a different factory entry point).

### Palette filtering

`resource-palette.tsx` currently has hardcoded `CATEGORY_DEFS`. Refactor to drive from filtered `BLOCK_BLUEPRINTS`:
```
const paletteBlocks = useMemo(
  () => BLOCK_BLUEPRINTS.filter(bp => !bp.hiddenFromPalette),
  []
);
```
Group by `bp.category`. **No view-level toggle.** Palette always shows just the 26 concepts.

### Existing projects with low-level blocks

**Option A (display as-is)**: open project, show raw blocks as they are, no migration. Raw blocks still render via their existing renderers; they just don't appear in the palette anymore for new use.

**Option B (auto-migrate)**: detect patterns (e.g., `aws-rds-postgres` → `Postgres` concept with `provider: aws` variant), replace nodes, ask user to confirm. Fragile, destructive.

**Recommendation: Option A.** Zero risk to existing projects, no data migration needed (raw blueprints still exist in the registry). A future "convert to concept" context-menu action on individual raw blocks could offer opt-in migration.

### How users see the raw infrastructure

Two paths:
1. **Info (i) panel → Compiles To tab.** The primary path. Click (i) on any concept block, switch to the "Compiles To" tab, see exactly what primitives get emitted per provider (e.g., VPC + subnets + NAT for Private Network on AWS). Read-only — users understand what they're getting without needing to leave the canvas or edit primitives directly.
2. **Legacy projects** that contain raw blocks from before the redesign render them normally. Those blocks still exist in the registry.

A power-user drop path for raw blocks (search/command palette exposing hidden blueprints) is deferred until demand emerges.

### Templates

`packages/ui/src/features/templates/` — check each template and swap raw blocks for concepts where possible. Authored, so manual but small. Do this in Slice 5.

---

## 7. Build sequence

### Slice 1 — Vertical prove-out with Static Site (S, ~2-3 days)

Goal: one concept end-to-end so patterns solidify before fanning out.

- Create `packages/blocks/src/common/concepts/_shared/{types.ts, helpers.ts, visual-registry.ts, info-registry.ts, code-snippets.ts}` — just enough to support one concept.
- Create `packages/blocks/src/common/concepts/static-site/{blueprint.ts, visual.tsx, info.ts, index.ts}`.
- Create `packages/cost/` package shell + `concepts/static-site.ts` cost logic.
- Refactor `block-node.tsx` into dispatcher + one family renderer (`frontend.tsx`) + fallback. Don't do all 6 families yet.
- Add (i) icon + modal shell (`packages/ui/src/features/concept-info/`). Only Overview tab rendered. Snippets tab stubbed.
- Register `staticSiteBlueprint` in `BLOCK_BLUEPRINTS`, verify palette renders it, dragging onto canvas creates the node with the new visual.
- Don't touch palette filtering yet — just prove the block works.

**Risk**: `BlockNode` refactor may ripple into canvas hit-testing. Mitigate by keeping the outer `<foreignObject>` dimensions identical.

### Slice 2 — Infrastructure for all 26 (M, ~3-4 days)

- Finish remaining 5 family renderers (`compute`, `data`, `messaging`, `edge`, `ai`).
- Finish info modal: all 3 tabs, markdown rendering, language picker with all 6 languages.
- Finalize shared helpers (`validateConceptProps`).
- Finalize `@ice/cost` shared package structure (providers + types + `estimateConceptCost` API).
- Audit `HIGH_LEVEL_CATEGORIES`, add missing entries for concepts that lack a schema.
- Define `rawInfrastructure` flag on `BlockBlueprint` (don't wire the filter yet).

### Slice 3 — The other 25 concepts (L, ~5-8 days)

Priority order so highest-value ones hit the palette early:

**High priority** (most common in apps): SSR Site, Scalable Backend, Serverless Function, Postgres, Redis Cache, Object Storage, Custom Domain, API Gateway, Secret Store, GitHub Repo (migrate).

**Medium**: MySQL, MongoDB, Message Queue, Observability, Log Terminal, Public Traffic, Group (migrate), Private Network (migrate), Scheduled Task, Worker.

**Lower**: Vector DB, Event Stream, Email Service, LLM Gateway, Private AI Service.

Each concept: blueprint + visual + info (overview + snippets). Mechanical once Slice 1+2 exist. ~1-2 hours per concept if info content is drafted.

**Snippets**: seed TS+Py+Go at minimum for all 26 in Slice 3. Backfill Java/C#/Rust in a follow-up pass.

**Risk**: content quality for info modals. Allocate one session per batch of 5 concepts to review prose.

### Slice 4 — Compiler: Private Network ingress (M, ~2 days)

- Write compiler fixture first: card with Private Network + nested Scalable Backend, snapshot emitted deploy plan, assert ingress mode.
- Implement `resolveIngressFromTopology` helper in `card-translator.ts`.
- Wire into Compute.Container/SSRSite/ServerlessFunction/Worker branches, per provider.
- Extend fixture to cover Private Network + CustomDomain + Backend and assert the external LB still gets wired to the nested CD.

**Risk flag**: riskiest slice (see section 5).

### Slice 5 — Palette cleanup (S, ~1-2 days)

- Refactor `resource-palette.tsx` to render from `BLOCK_BLUEPRINTS` filtered by `hiddenFromPalette`.
- Hide the ~124 per-provider raw blocks via the factory default.
- Verify existing projects with raw blocks still open and render correctly (no palette-driven breakage).

**Risk**: palette is currently hand-coded — refactoring to data-driven may reveal hidden assumptions (category ordering, icon overrides). Budget half-day contingency.

### Slice 6 — Template migration (M, ~2-4 days)

Templates live in `packages/templates/src/` (22 files, ~600 iceType references total). They must be audited, rewritten to use the 23 Concept iceTypes, or retired. **Do this after Slice 5** so the palette is the source of truth when deciding what to keep.

#### Per-template decision matrix

| Template | File | Blocks | Decision | Rationale |
|---|---|---|---|---|
| **Quick-starts** (7) | `quick-starts.ts` | 21 | **Rewrite with concepts** | Highest user visibility — first thing new users see. Must match palette. |
| Full Stack | `full-stack.ts` | 15 | **Rewrite with concepts** | Core general-purpose template. Showcases Static/SSR + Backend + Postgres. |
| SaaS Starter | `saas-starter.ts` | 21 | **Rewrite with concepts** | Core general-purpose. |
| Backend API | `backend-api.ts` | 30 | **Rewrite with concepts** | Core general-purpose. |
| Serverless API | `serverless-api.ts` | 19 | **Rewrite with concepts** | Core general-purpose. |
| Secure API | `secure-api.ts` | 15 | **Rewrite with concepts** | Showcases Private Network + Custom Domain (both validated blocks). |
| Budget Webapp | `budget-webapp.ts` | 10 | **Rewrite with concepts** | Small, cheap, high signal. |
| AI/ML | `ai-ml.ts` | 15 | **Rewrite with concepts** | Showcases LLM Gateway + Vector DB. |
| RAG Chatbot | `rag-chatbot.ts` | 19 | **Rewrite with concepts** | Showcases LLM Gateway + Vector DB + Postgres. |
| EU Compliance | `eu-compliance.ts` | 13 | **Rewrite with concepts** | Compliance story — keep. |
| Healthcare | `healthcare.ts` | 33 | **Delete** | Industry showcase; deferred until after core palette proves out. |
| Fintech | `fintech.ts` | 34 | **Delete** | Industry showcase; deferred. |
| E-commerce | `ecommerce.ts` | 38 | **Delete** | Industry showcase; deferred. |
| SaaS Platform | `saas-platform.ts` | 35 | **Rewrite with concepts** | Core showcase — stays. |
| Mobile Backend | `mobile-backend.ts` | 35 | **Delete** | Industry showcase; deferred. |
| IoT | `iot.ts` | 31 | **Delete** | Niche. Heavy on event streams + device-specific infra. |
| Gaming | `gaming.ts` | 32 | **Delete** | Niche. |
| Logistics | `logistics.ts` | 31 | **Delete** | Niche. |
| Education | `education.ts` | 35 | **Delete** | Niche. |
| Media | `media.ts` | 32 | **Delete** | Niche. |
| DevOps Platform | `devops-platform.ts` | 25 | **Delete** | CI/CD infrastructure ICE doesn't fully model yet. |
| Data Pipeline | `data-pipeline.ts` | 27 | **Delete** | Depends on Data Warehouse, which is deferred (see `concepts-palette.md`). |

**Net**: 11 rewritten + 11 deleted = **11 templates shipped** with the concepts palette. Deleted templates are removed from the repo; if any need to come back, they'll be re-authored from scratch against the concepts palette.

#### Execution approach

1. **Map iceTypes first.** Build a mapping table from old raw iceTypes to new concept iceTypes (most are already 1:1 via `HIGH_LEVEL_CATEGORIES`). Put it in `packages/templates/src/_migration/icetype-map.ts`. This becomes the source of truth for the rewrites.
2. **Write a codemod** that reads each template, swaps iceTypes via the map, removes blocks that have no concept equivalent (or flags them for manual review). Run it against the 10 core templates.
3. **Manually review and tighten** each rewritten template: verify connections still make sense, drop redundant blocks now absorbed by concepts (e.g., separate LB + Container → one Scalable Backend), update `description`/`metadata` to reflect the simpler structure.
4. **Delete the 11 non-kept template files** from `packages/templates/src/`. Git history preserves them if ever needed.
5. **Update template registry** in `packages/templates/src/index.ts` to export only the 11 kept templates.
6. **Update UI catalog** in `packages/ui/src/features/templates/` to match. Verify template previews still render.
7. **Sanity test**: open each kept template, deploy to GCP via the existing E2E harness (see the GCP Testing Suite memory), confirm it still produces a working stack.

#### Risks

- **Connections may break.** A rewritten template with fewer blocks means fewer edges — the codemod must preserve semantic connections (e.g., "Backend → Postgres" stays even if the intermediate Load Balancer block gets absorbed).
- **Template previews** (`ui/src/features/templates/`) may have hardcoded image thumbnails referencing the old block layout. Budget time to regenerate screenshots.
- **Deletion is intentional.** The 11 removed templates will not be resurrected from git — if any come back, they'll be re-authored against the concepts palette. This keeps the repo clean and commits the team to the simpler template set.

### Total rough estimate

S (2-3d) + M (3-4d) + L (5-8d) + M (2d) + S (1-2d) + M (2-4d) ≈ **15-23 working days**, solo, excluding info modal content writing at scale.

---

## 8. Critical files to read/modify

### Schemas and blueprints (core model)

- `packages/core/src/resources/high-level-resources.ts` — **extend** for missing concepts (LLM Gateway, Private AI Service, Email Service). Line 106 = registry head.
- `packages/core/src/resources/blueprint-factory.ts:84` — `createBlueprintFromResource`; reuse as-is. Possibly extend overrides interface with `rawInfrastructure`.
- `packages/core/src/resources/cloud-blocks.ts:229` — `BLOCK_TEMPLATES` with `expands_to` — prior art for concept → primitive composition. Line 245 (Static Site), 316 (Scalable Backend) closest references.
- `packages/core/src/resources/scale-presets.ts` — extend when concepts introduce new scale presets.

### Blocks package

- `packages/blocks/src/types.ts` — **add** `hiddenFromPalette?: boolean` to `BlockBlueprint`.
- `packages/blocks/src/index.ts` — **modify** to import from `common/concepts/index.ts` aggregated registry; drop direct imports of the three migrating files.
- `packages/blocks/src/common/concepts/` — **new** directory; bulk of the work.
- `packages/blocks/src/common/networking/{custom-domain.ts, private-network.ts}` — **migrate** into `concepts/custom-domain/` and `concepts/private-network/`.
- `packages/blocks/src/common/source/github-repository.ts` — **migrate** into `concepts/github-repo/`.
- `packages/blocks/src/expand-blueprint.ts` — read-only; verify nothing assumes every blueprint is provider-specific.

### New package

- `packages/cost/` — **new** workspace package for cost estimation (Q2 decision).

### UI package

- `packages/ui/src/features/canvas/components/nodes/group-node/block-node.tsx` — **refactor** into dispatcher at `nodes/block-node/index.tsx` with family renderers. Currently 165 lines.
- `packages/ui/src/features/canvas/components/nodes/group-node/index.tsx:46-51` — where iceType → accent + brand icon is resolved. Add `visualFamily` resolution here.
- `packages/ui/src/features/canvas/components/svg-canvas.tsx:54-57, 433, 441` — existing bespoke-node dispatch for PrivateNetwork / CustomDomain. Don't break it.
- `packages/ui/src/config/visualization-config.ts` — **leave alone.** The Level 1/Level 2 system is unrelated to the concept/raw distinction and should not be repurposed.
- `packages/ui/src/features/palette/components/resource-palette.tsx` — **refactor** to drive from `BLOCK_BLUEPRINTS` filtered by `hiddenFromPalette`. Currently hardcoded category defs; becomes data-driven.
- `packages/ui/src/features/concept-info/` — **new** directory; the (i) modal.
- `packages/ui/src/features/properties/components/properties-panel.tsx` — **extend** to mount (i) button next to block title.

### Compiler

- `packages/core/src/deploy/card-translator.ts` — **extend**. Ingress helper near line 1059 (`SERVICE_BACKEND_ICE_TYPES`). Existing PrivateNetwork precedent at lines 231-260, 957-970.

### Tests

- `packages/core/src/__tests__/` — **add** fixture(s) for PrivateNetwork + Scalable Backend → internal ingress.
- `packages/blocks/src/__tests__/` — **add** registry-level test: every concept in `CONCEPT_BLUEPRINTS` has a matching entry in `VISUAL_REGISTRY` and `INFO_REGISTRY`. Catches "forgot to register a concept" errors at build time.

---

## Open questions

None at this time — all major decisions are locked in.

# Blueprint — `packages/ui/src/features/canvas/components/svg-canvas.tsx`

**Source**: 3234 LOC. **Decomposer run**: 2026-04-29.
**Public-API consumers**: top-level layout slot in App.tsx (default export of `SvgCanvas`); 11+ files import `CanvasNode`/`ViewState`/`CanvasConnection` types from this file.

## Broker prework (cross-package candidates already extracted)

Already in the workspace — DO NOT re-implement: `useCanvasInteractions`, `useCanvasValidation`, `useComputingFlows`, `useClipboard`, `useUndoRedo`, `useExposedServices`, `calculateZIndex`, `inspectLayout`, `generateGhostSuggestions`, `canConnect` / `validateConnection` / `wouldCreateCycle` / `inferConnectionMeta` / `CATEGORY_TO_RELATIONSHIP`, `computeCompactNodeWidth/Height` (and CD / PN sizing helpers), `expandBlueprint` / `getBlueprint`, `canContain` / `isContainer`, `isTypeVisibleAtLevel` / `isEdgeVisibleAtLevel`.

## Modules (29 total + 1 sub-split)

### `components/types.ts` (util, ~30 LOC, lines 172–202)

- `CanvasNode`, `ViewState`, `CanvasConnection`. Re-export from orchestrator to keep 11+ consumers quiet.

### `utils/container-bounds.ts` (util, ~120 LOC, lines 754–878 + 944–1050 + 1183–1252 + 1697–1751)

- `calculateContainerBounds(...)`, `expandToFitChildren(...)`, `clampNodeToParent(...)`, `CONTAINER_HEADER_H`, `CONTAINER_PAD`. Folds 4 copy-pasted "per-edge overflow expansion" blocks.

### `utils/node-classification.ts` (util, ~45 LOC, lines 432–434 + 1506–1515 + 1628–1635 + 2641–2672)

- `isContainerNode`, `isVpcOrSubnet`, `isPrivateNetwork`, `isLogIceType`, `isGroupContainer`. Folds 5 duplicated `isGroup` / iceType checks.

### `utils/canvas-node-sizing.ts` (util, ~75 LOC, lines 428–474)

- `computeVisualNodeSize(node, hasPipelineStatus)`, `toLocalCanvasNode(reduxNode, pipelineStatus)`. Wraps the compact / custom-domain / private-network width/height dispatch.

### `utils/folded-remap.ts` (util, ~70 LOC, lines 496–532 + 725–751)

- `buildFoldedRemap(canvasNodes, isFoldedFn)`, `descendants(...)`, `hasCollapsedAncestor(...)`, `isNodeFolded(...)`. Pure tree walks.

### `utils/canvas-connections.ts` (util, ~140 LOC, lines 553–614 + 2073–2134)

- `buildVisibleConnections(...)`, `computePortMap(...)`. Bundling dedupe + side-distribution.

### `utils/connection-preview.ts` (util, ~55 LOC, lines 2937–2973)

- `computeConnectionPreviewPath(...)`, `pickPreviewColor(...)`. Bezier control points + hit-test color.

### `utils/drop-target.ts` (util, ~70 LOC, lines 1551–1582 + 1602–1652 + 1827–1854 + 2229–2245)

- `findContainerAtPosition(...)`, `findSmallestContainerHit(...)`. Folds 4 near-identical "smallest hit" loops.

### `utils/connection-special-rules.ts` (util, ~55 LOC, lines 2264–2308)

- `findExistingSpecialConnection(...)` — "one Source.Repository / one Config.Environment per service" rule.

### `components/canvas-renderer/node-renderer-registry.tsx` (component-factory, ~260 LOC, lines 134–165 + 2660–2932)

- `CONCEPT_NODE_RENDERERS`, `renderCanvasNode(props)`. The iceType→component dispatch table.

### `components/canvas-renderer/lift-wrapper.tsx` (subcomponent, ~70 LOC, lines 2675–2743)

- `<NodeLiftWrapper>` — entrance animation + shift-drag highlight + parent-clip wrap.

### `components/canvas-renderer/parent-clip-defs.tsx` (subcomponent, ~35 LOC, lines 2635–2657)

- `<ParentClipDefs>` — `<defs>` block of clipPaths + shift-drag-shadow filter.

### `components/connection-layer.tsx` (subcomponent, ~120 LOC, lines 2572–2632 + 3019–3060)

- `<ConnectionLayer mode="background" | "highlighted">`. Replaces both connection-layer `<g>` blocks with one switched component.

### `components/connection-preview-overlay.tsx` (subcomponent, ~55 LOC, lines 2936–2989)

- `<ConnectionPreviewOverlay>` — inline IIFE for the in-flight connection drag preview.

### `components/user-traffic-overlay.tsx` (subcomponent, ~50 LOC, lines 2992–3016)

- `<UserTrafficOverlay>` — virtual user-node + its connections.

### `components/connection-tooltip.tsx` (subcomponent, ~150 LOC, lines 3079–3225)

- `<ConnectionTooltip>`. Heavy inline JSX; reads 7 i18n keys.

### `components/deploy-banner.tsx` (subcomponent, ~150 LOC, lines 230–269 + 2419–2516)

- `<CanvasDeployBanner cardId>`. Wires its own selectors; computes `deriveRollup`/`bannerActiveNode`/`bannerPct` internally.

### `hooks/use-canvas-viewport.ts` (hook, ~75 LOC, lines 288–343 + 1784–1792)

- `useCanvasViewport({ paneId?, cardId? })` — pane-or-card viewport, LOD threshold, `setPaneViewport`/`setCardViewport`/`setCardViewportById`, debounce + scaleLayoutForZoom.

### `hooks/use-canvas-resize.ts` (hook, ~30 LOC, lines 382–400)

- `useCanvasDimensions(containerRef)` — ResizeObserver effect.

### `hooks/use-pinned-user-node.ts` (hook, ~80 LOC, lines 626–687)

- `usePinnedUserNode(exposedServices, allCanvasNodes)`. setState + ref + memo cluster for the virtual user-node.

### `hooks/use-container-resizing.ts` (hook, **split into 25a + 25b**, total ~480 raw / ~250 after util extraction, lines 753–1343)

- `useContainerResizing({ visibleNodes, canvasNodes })` returning `handleNodeMove`, `handleToggleFold`, `handleNodeResize`, `recalculateAncestorBounds`, `calculateMinimumContainerSize`. **rf-canv-25a**: handleNodeResize + ancestor-bounds. **rf-canv-25b**: handleNodeMove + handleToggleFold.

### `hooks/use-canvas-drop.ts` (hook, ~140 LOC, lines 1856–1978 + 2026–2029)

- `useCanvasDrop(...)` — `handleDrop` + `handleDragOver`.

### `hooks/use-ghost-mode.ts` (hook, ~50 LOC, lines 1983–2024)

- `useGhostMode(nodes, edges)` — accept/dismiss + 10s auto-dismiss.

### `hooks/use-connection-drawing.ts` (hook, ~260 LOC, lines 2140–2400)

- `useConnectionDrawing(...)` — full connection-drag flow.

### `hooks/use-drag-target-highlight.ts` (hook, ~280 raw / shrinks with drop-target util, lines 1354–1358 + 1517–1760)

- `useDragTargetHighlight(...)` — shift-drag highlight machinery.

### `hooks/use-canvas-side-effects.ts` (hook, ~110 LOC, lines 345–423 + 616–624 + 1366–1380 + 1483–1503)

- Bundles install-inspector + updateInspectorState + auto-organize + logCanvasRender + per-card-pipeline subscribe + overlay-dismiss + per-card reset effects.

### `hooks/use-rename-state.ts` (hook, ~28 LOC, lines 1362 + 1406–1422)

- Inline-rename triplet — borderline LOC; keep for clean ownership.

### `hooks/use-canvas-context-menu.ts` (hook, ~20 LOC, lines 1763–1776) — fold-in candidate

### `hooks/use-validation-map.ts` (hook, ~22 LOC, lines 1465–1480) — fold-in candidate

### `components/svg-canvas.tsx` (orchestrator, ~300 LOC final)

- `SvgCanvas` default export. Composes hooks + section subcomponents.

## Dependency DAG (leaves first)

```
LEAVES (utils, no canvas state):
  components/types.ts
  utils/node-classification.ts
  utils/container-bounds.ts
  utils/folded-remap.ts
  utils/connection-preview.ts
  utils/drop-target.ts
  utils/connection-special-rules.ts

LAYER 1 (utils that depend on leaves):
  utils/canvas-node-sizing.ts
  utils/canvas-connections.ts

LAYER 2 (subcomponents — leaf React):
  components/canvas-renderer/parent-clip-defs.tsx
  components/canvas-renderer/lift-wrapper.tsx
  components/connection-tooltip.tsx
  components/connection-preview-overlay.tsx
  components/deploy-banner.tsx
  components/user-traffic-overlay.tsx

LAYER 3 (registry + connection-layer):
  components/canvas-renderer/node-renderer-registry.tsx
  components/connection-layer.tsx

LAYER 4 (hooks — pure state/effects):
  hooks/use-canvas-resize.ts
  hooks/use-canvas-viewport.ts
  hooks/use-rename-state.ts
  hooks/use-canvas-side-effects.ts
  hooks/use-pinned-user-node.ts
  hooks/use-ghost-mode.ts
  hooks/use-canvas-drop.ts
  hooks/use-container-resizing.ts (split)
  hooks/use-drag-target-highlight.ts
  hooks/use-connection-drawing.ts

ROOT:
  components/svg-canvas.tsx (~300 LOC)
```

## Behavior-risk flags

1. **`CanvasNode`/`ViewState`/`CanvasConnection` are public-API types** — 11+ consumer files. First unit MUST add a re-export shim at the orchestrator path.
2. **`use-container-resizing.ts`** has setState-during-drag (`setExitingGroupId` inside `handleNodeMove`) coupled to `useDragTargetHighlight`'s state. Keep `setExitingGroupId` setter passed via callback, or co-own state across the two hooks. **Sub-split into 25a + 25b**. Each of the 4 expansion loops has subtly different padding semantics — DO NOT dedup wholesale.
3. **`useConnectionDrawing` reads `card` (latest Redux) inside `handleConnectionEnd`**. Keep `card` in dep array verbatim — don't switch to a ref.
4. **`<g>` wrapping at L2624–2630 conditionally adds animation wrapper with different React keys** (`anim-edge-${id}` vs `id`). Preserve key semantics or `SvgConnectionPath` re-mounts.
5. **Connection-port detection uses `target.classList.contains('connection-port')`** at L2526–2530. The `if (port)` branch MUST stay first or drag-from-port becomes pan-from-port.
6. **Non-passive wheel listener** at L1815–1825. Keep dep array on `[bindCanvas]` not `[bindCanvas.onWheel]`.
7. **`autoOrganizeCard` import-time threshold** is `> 10`. Don't change.
8. **`setOverlayDismissed(false)` setter is read but never read back**. Don't "clean up" — leave verbatim. Tag for follow-up.
9. **Inline tooltip JSX reads 7 i18n keys** — preserve order (E2E may snapshot-test).
10. **`SvgUserNode` `onPositionChange={setUserNodePos}`** writes to canvas's `userNodePos` state read by memo. Hook must return both setter and derived nodes.
11. **`CONCEPT_NODE_RENDERERS` dispatch** has 3 branches with subtly different gates. Tests MUST cover both `type:'block'` AND `type:'resource'` for the same iceType.

## Unit ordering

1. **rf-canv-1** — `components/types.ts` + re-export shim.
2. **rf-canv-2** — `utils/node-classification.ts`.
3. **rf-canv-3** — `utils/folded-remap.ts`.
4. **rf-canv-4** — `utils/container-bounds.ts`.
5. **rf-canv-5** — `utils/canvas-node-sizing.ts`.
6. **rf-canv-6** — `utils/drop-target.ts`.
7. **rf-canv-7** — `utils/connection-special-rules.ts`.
8. **rf-canv-8** — `utils/connection-preview.ts`.
9. **rf-canv-9** — `utils/canvas-connections.ts`.
10. **rf-canv-10** — `components/canvas-renderer/lift-wrapper.tsx`.
11. **rf-canv-11** — `components/canvas-renderer/parent-clip-defs.tsx`.
12. **rf-canv-12** — `components/canvas-renderer/node-renderer-registry.tsx` (RISK #11).
13. **rf-canv-13** — `components/connection-layer.tsx` (RISK #4).
14. **rf-canv-14** — `components/connection-preview-overlay.tsx`.
15. **rf-canv-15** — `components/user-traffic-overlay.tsx`.
16. **rf-canv-16** — `components/connection-tooltip.tsx` (RISK #9).
17. **rf-canv-17** — `components/deploy-banner.tsx`.
18. **rf-canv-18** — `hooks/use-canvas-resize.ts`.
19. **rf-canv-19** — `hooks/use-canvas-viewport.ts`.
20. **rf-canv-20** — `hooks/use-rename-state.ts`.
21. **rf-canv-21** — `hooks/use-pinned-user-node.ts` (RISK #10).
22. **rf-canv-22** — `hooks/use-canvas-side-effects.ts`.
23. **rf-canv-23** — `hooks/use-ghost-mode.ts`.
24. **rf-canv-24** — `hooks/use-canvas-drop.ts`.
25. **rf-canv-25a** — `hooks/use-container-resizing.ts` part-1 (RISK #2).
26. **rf-canv-25b** — `hooks/use-container-resizing.ts` part-2 (RISK #2).
27. **rf-canv-26** — `hooks/use-drag-target-highlight.ts`.
28. **rf-canv-27** — `hooks/use-connection-drawing.ts` (RISK #3, #5).
29. **rf-canv-28** — orchestrator slim-down to ~300 LOC.
30. **rf-canv-29** — final shim-drop / housekeeping.

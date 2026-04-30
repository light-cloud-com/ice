# Blueprint — `packages/ui/src/store/slices/cards-slice.ts`

**Source**: 1195 LOC. **Decomposer run**: 2026-04-30.
**Public API**: 25 action creators, 1 default reducer export, 3 selectors, 5 exported types, 1 exported helper function — see table at end.

## Modules (16 units)

### Layer 0 — pure utilities (no Redux imports)

- **rf-cards-1** `cards/types.ts` (~60 LOC, L22–81) — `CardNode`, `CardEdge`, `CardViewport`, `Card`, `CardsState` (exported); `CardSnapshot`, `CardHistory`, `DEFAULT_VIEWPORT` (module-private). No imports beyond TypeScript primitives. Orchestrator re-exports all five types verbatim so the 12+ consumers importing them from `'../cards-slice'` continue to resolve.

- **rf-cards-2** `cards/migration.ts` (~50 LOC, L104–148) — `BLOCK_TO_GROUP_TYPES` (private Set), `migrateCardNode` (private), `migrateCardNodes` (exported). Imports `CardNode` from `./types`. Orchestrator re-exports `migrateCardNodes` to preserve its external export path. The two migration branches run in fixed order (`Monitoring.Terminal` first, then `Cluster.*/Block.*`); that order must be preserved.

- **rf-cards-3** `cards/edge-routes.ts` (~65 LOC, L280–343) — `invalidateEdgeRoutesTouching`, `applyEdgeRoutes`, `cascadeContainerReflow` (dead code but retained). Imports `CardEdge` from `./types`. The `eslint-disable-next-line unused-imports/no-unused-vars` comment on L299 must move to the line immediately before `cascadeContainerReflow` in the new file.

### Layer 1 — slice-internal helpers (use types; no Redux imports)

- **rf-cards-4** `cards/persistence.ts` (~80 LOC, L84–200) — `CARDS_STORAGE_KEY`, `CARDS_DATA_VERSION`, `CARDS_VERSION_KEY` (private), `loadPersistedCards` (private). Imports `CardNode`, `CardsState` from `./types`; `migrateCardNodes` from `./migration`. Both `localStorage.setItem` write paths are wrapped in separate try/catch blocks — both wrappers must be preserved. The `parsed.activeCardId === 'demo'` guard on L180 must survive the move.

- **rf-cards-5** `cards/snapshot.ts` (~55 LOC, L202–260) — `MAX_HISTORY` (private), `_lastSnapshotAction` (module-level `let`), `COALESCE_ACTIONS` (private Set), `pushSnapshot` (private function exported for reducer modules). Imports `CardsState` from `./types`. `_lastSnapshotAction` is a module-level singleton — its coalescing behavior is preserved as long as it stays at module scope (not inside a factory or class).

### Layer 2 — reducer groups

Each file exports a plain object of RTK-compatible case-reducer functions, spread into `createSlice`'s `reducers` in the orchestrator. This keeps all action type strings owned by the single `createSlice` call and avoids action-creator re-export complexity.

- **rf-cards-6** `cards/reducers/card-lifecycle.ts` (~75 LOC, L354–412 + L766–780) — `setActiveCard`, `createCard`, `deleteCard`, `renameCard`, `setCardViewport`, `setCardViewportById`. Viewport reducers are co-located here because they operate on the `Card` object (not nodes/edges). The unique-name loop in `createCard` reads `state.cards` inside an Immer draft but does not mutate during the loop — safe.

- **rf-cards-7** `cards/reducers/node-edge-add.ts` (~100 LOC, L414–510) — `addNodeToCard`, `addEdgeToCard`, `clearCardDeployOverlay`, `updateCardEdgeData`, `reverseCardEdge`. The 20-field `fieldsToClear` array in `clearCardDeployOverlay` (L446–471) must be preserved verbatim. The spread-and-delete Immer pattern (`const next = { ...node.data }; delete next[key]; node.data = next`) is correct; a direct `delete` on the Proxy would be flagged by strict mode.

- **rf-cards-8** `cards/reducers/node-position.ts` (~100 LOC, L512–603) — `updateCardNodePosition`, `updateCardNodePositions`, `resizeCardNode`. Imports `pushSnapshot` from `../snapshot`, `invalidateEdgeRoutesTouching` from `../edge-routes`, `CONTAINER_PADDING` / `HEADER_HEIGHT` from canvas-constants. The two-pass design in `updateCardNodePositions` (apply all, then clamp) must remain in one reducer; the `skipClamp` flag bypasses pass 2. `resizeCardNode` intentionally does NOT call `invalidateEdgeRoutesTouching`.

- **rf-cards-9** `cards/reducers/node-data.ts` (~45 LOC, L604–643) — `toggleCardNodeFold`, `updateCardNodeParent`, `updateCardNodeData`. `toggleCardNodeFold` has no `pushSnapshot` call by design (fold is not undoable). `updateCardNodeParent` uses `delete node.parentId` (not `node.parentId = undefined`) — this must be preserved; RTK Immer serializes absent fields differently from `undefined`.

- **rf-cards-10** `cards/reducers/node-delete-merge.ts` (~75 LOC, L644–664 + L732–764) — `deleteCardNode`, `deleteCardEdge`, `addToActiveCard`. `deleteCardNode` reassigns both `card.nodes` and `card.edges` on the Immer draft in one reducer body — this must stay in one function. `addToActiveCard` calls `migrateCardNodes` before the offset transform (L753) — migration runs first, then offset.

- **rf-cards-11** `cards/reducers/import.ts` (~75 LOC, L664–730) — `importToActiveCard`. Own file due to embedded `autoLayout` call and two-phase mutation (replace nodes/edges, then apply edge routes). `applyEdgeRoutes` (L727) must run after `card.nodes` is reassigned (L714–725), not before.

- **rf-cards-12** `cards/reducers/auto-organize.ts` (~205 LOC, L782–984) — `autoOrganizeCard`. Largest single reducer. The centroid-stabilize block (L938–965) shifts `edgeRoutes` by `(dx, dy)` before `applyEdgeRoutes` is called — this order is load-bearing. The `cascadeContainerReflow`/`forceResolveOverlaps` intentionally-skipped comment at L968 is operational documentation and must be kept.

- **rf-cards-13** `cards/reducers/scale-blueprint.ts` (~65 LOC, L986–1048) — `scaleLayoutForZoom`, `expandBlueprintToCard`. `scaleX = 1` / `scaleY = 1` in `scaleLayoutForZoom` is deliberate — do not change to `zoom / prevZoom`. `expandBlueprintToCard` calls `migrateCardNode` for ingestion-path parity.

- **rf-cards-14** `cards/reducers/undo-redo-group.ts` (~95 LOC, L1050–1141) — `undoCardChange`, `redoCardChange`, `groupSelectedNodes`. Undo/redo use `JSON.parse(JSON.stringify(...))` for deep clone inside Immer — must not be replaced with `structuredClone` or `current()`. In `groupSelectedNodes`, `card.nodes.push(groupNode)` happens before the `node.parentId` assignment loop — the group appears last in the array (renders behind children due to Z-order).

### Final

- **rf-cards-15** orchestrator slim-down (`cards-slice.ts` → ~300 LOC) — `import` all 9 reducer modules; spread into `createSlice`'s `reducers`; keep `initialState` assembly (`loadPersistedCards()` + `history: {}`), all re-export shims for the 5 types + `migrateCardNodes`, all 25 action-creator named exports, `export default cardsSlice.reducer`, and the 3 inline selector arrows.

- **rf-cards-16** final housekeeping — `pnpm --filter @ice/ui typecheck`; confirm all named imports from `'../cards-slice'` resolve; remove any dead imports from the orchestrator's import block.

## Behavior-risk flags (11 total)

1. **Immer two-field mutation in `deleteCardNode`**: Both `card.nodes` and `card.edges` must be assigned on the same Immer draft inside one reducer body. Splitting into two dispatched actions would create a visible intermediate state on the canvas.

2. **Two-pass position update in `updateCardNodePositions`**: Pass 1 applies all positions; pass 2 clamps children. The passes are sequential on one draft. Splitting into two dispatched actions produces a visual flash. The `skipClamp` flag skips pass 2 only — it does not affect pass 1.

3. **`applyEdgeRoutes` ordering in `importToActiveCard`**: Must run after `card.nodes` remapping (L714–725), not before. Edge route coordinates are computed relative to the post-layout node positions.

4. **`applyEdgeRoutes` ordering in `autoOrganizeCard`**: Must run after the centroid-stabilize `(dx, dy)` shift is applied to `edgeRoutes` (L956–963). Reversing the order misaligns routes and nodes.

5. **`_lastSnapshotAction` coalescing state**: Module-level `let` in `cards/snapshot.ts`. Coalescing only works if the variable is a singleton across all calls in one event loop tick. Must remain at module scope, not inside a factory.

6. **`cascadeContainerReflow` dead-code eslint-disable**: The `// eslint-disable-next-line unused-imports/no-unused-vars` comment must appear on the line immediately preceding the function in `edge-routes.ts`. The function is kept intentionally.

7. **`clearCardDeployOverlay` field list completeness**: The 20 fields at L446–471 mirror what the deploy hydrator sets. Missing one leaves a ghost pill after destroy. Do not prune any field, including `public_grant_failed` / `public_grant_error` / `public_grant_strategy`.

8. **Ingestion-path migration parity**: Four reducers call `migrateCardNode` or `migrateCardNodes` (`addNodeToCard`, `importToActiveCard`, `addToActiveCard`, `expandBlueprintToCard`). Any new ingestion reducer must also call the migrator. See learning `data-version-bump-migrates-not-wipes`.

9. **`groupSelectedNodes` node insertion order**: `card.nodes.push(groupNode)` before the `parentId` loop; the group's Z-order (last in array = renders behind children) depends on it appearing after the selected nodes.

10. **`scaleLayoutForZoom` intentional `scaleX/Y = 1`**: Do not replace with `zoom / prevZoom`. The centroid math still runs at scale=1, producing identity transforms for positions and sizes.

11. **Selectors stay non-memoized in the orchestrator**: `selectActiveCard`, `selectCanUndo`, `selectCanRedo` are plain arrows. They must not be wrapped in `createSelector` during extraction — doing so would return new selector instances on each module load, breaking referential equality for consumers that pass the selector to `useSelector`.

## Public API

| Export | Kind | External consumers |
|---|---|---|
| `CardsState` | type | `store/index.ts` (via `RootState`) |
| `Card` | type | `use-deploy-effects.ts`, `use-deploy-actions.ts`, `use-destroy-action.ts`, `use-canvas-side-effects.ts`, `project-overview.tsx` |
| `CardNode` | type | `use-canvas-drop.ts`, `use-container-move.ts`, `use-canvas-side-effects.ts`, `svg-canvas.tsx`, `use-clipboard.ts`, and 7+ others |
| `CardEdge` | type | `svg-canvas.tsx`, `use-canvas-drop.ts`, `use-connection-drawing.ts`, `use-canvas-side-effects.ts`, `edge-properties-section.tsx` |
| `CardViewport` | type | `use-canvas-viewport.ts` |
| `migrateCardNodes` | function | Internal ingestion paths; re-export shim required |
| `selectActiveCard` | selector | `svg-canvas.tsx`, `deploy-panel.tsx`, `properties-panel.tsx`, `canvas-context-menu.tsx`, `use-canvas-viewport.ts` |
| `selectCanUndo` | selector | `canvas-menu.tsx` |
| `selectCanRedo` | selector | `canvas-menu.tsx` |
| `addNodeToCard` | action | `use-canvas-drop.ts`, `use-clipboard.ts` |
| `addEdgeToCard` | action | `use-connection-drawing.ts`, `use-clipboard.ts` |
| `clearCardDeployOverlay` | action | `use-destroy-action.ts` |
| `updateCardEdgeData` | action | `edge-properties-section.tsx` |
| `reverseCardEdge` | action | `edge-menu.tsx` |
| `updateCardNodePosition` | action | `use-container-resize.ts` |
| `updateCardNodePositions` | action | `use-container-move.ts` |
| `resizeCardNode` | action | `use-container-resize.ts`, `use-container-move.ts` |
| `toggleCardNodeFold` | action | `use-container-move.ts` |
| `updateCardNodeParent` | action | `svg-canvas.tsx` (drag-end reparent) |
| `updateCardNodeData` | action | `node-properties-section.tsx`, `edge-properties-section.tsx` |
| `deleteCardNode` | action | `svg-canvas.tsx`, `node-menu.tsx`, `use-clipboard.ts` |
| `deleteCardEdge` | action | `svg-canvas.tsx`, `edge-menu.tsx`, `edge-properties-section.tsx` |
| `importToActiveCard` | action | `canvas-context-menu.tsx` |
| `addToActiveCard` | action | AI/cloud import flows |
| `setCardViewport` | action | `use-canvas-viewport.ts` |
| `setCardViewportById` | action | `use-canvas-viewport.ts` |
| `autoOrganizeCard` | action | `use-canvas-side-effects.ts`, `node-menu.tsx`, `canvas-menu.tsx` |
| `scaleLayoutForZoom` | action | `use-canvas-viewport.ts` |
| `expandBlueprintToCard` | action | `use-canvas-drop.ts`, `canvas-context-menu.tsx` |
| `undoCardChange` | action | `use-undo-redo.ts` |
| `redoCardChange` | action | `use-undo-redo.ts` |
| `groupSelectedNodes` | action | `node-menu.tsx`, `use-clipboard.ts` |
| `default` (reducer) | reducer | `store/index.ts` as `cards: cardsReducer` |

Re-export shims needed in the orchestrator: `export type { CardNode, CardEdge, CardViewport, Card, CardsState } from './cards/types'` and `export { migrateCardNodes } from './cards/migration'`. All 25 action creators are generated by the single `createSlice` call that stays in the orchestrator — no action-creator shims required.

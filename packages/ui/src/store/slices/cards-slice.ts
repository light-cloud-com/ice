/**
 * Cards Slice
 *
 * Manages multiple canvas cards/tabs, each with separate nodes and edges.
 */

import { createSlice } from '@reduxjs/toolkit';

// =============================================================================
// Types
// =============================================================================
//
// Types live in `./cards/types` (rf-cards-1). The re-export preserves the
// public import path for external consumers; the `import type` line brings
// the names into THIS module's lexical scope for internal references. After
// rf-cards-14 moved `groupSelectedNodes` (the last in-file `CardNode`
// constructor) into `./cards/reducers/undo-redo-group`, only `CardsState`
// is referenced syntactically here (initial-state typing + selectors), so
// `CardNode` is dropped from the local `import type` list.

export type { CardNode, CardEdge, CardViewport, Card, CardsState } from './cards/types';

// =============================================================================
// Migration
// =============================================================================
//
// Migration lives in `./cards/migration` (rf-cards-2). The re-export
// preserves the public import path for external consumers. After rf-cards-13
// moved `expandBlueprintToCard` (the last in-file ingestion path) into
// `./cards/reducers/scale-blueprint`, neither `migrateCardNode` nor
// `migrateCardNodes` is referenced syntactically here — only the re-export
// shim keeps `migrateCardNodes` on the public API path.

export { migrateCardNodes } from './cards/migration';

// =============================================================================
// Persistence
// =============================================================================
//
// Persistence lives in `./cards/persistence` (rf-cards-4). The runtime
// import brings `loadPersistedCards` into THIS module's lexical scope so
// the `loadedCards` initial-state assembly below can call it directly.
// The 3 storage-key constants stay module-private inside that file.

import { loadPersistedCards } from './cards/persistence';

// =============================================================================
// Snapshot
// =============================================================================
//
// `pushSnapshot` (and its coalescing state, history cap, etc.) lives in
// `./cards/snapshot` (rf-cards-5). After rf-cards-14 moved
// `groupSelectedNodes` — the last in-file caller — into
// `./cards/reducers/undo-redo-group`, the orchestrator no longer needs to
// import `pushSnapshot` directly; each reducer module imports it itself.
// `_lastSnapshotAction` stays a module-private `let` inside that file —
// keeping it module-scoped is what makes drag/resize coalescing work
// (RISK #5).

// =============================================================================
// Reducer groups
// =============================================================================
//
// Card-lifecycle reducers (rf-cards-6) live in `./cards/reducers/card-lifecycle`.
// The runtime import brings the case-reducer object into THIS module's lexical
// scope so the `createSlice` `reducers:` block can spread it. RTK still owns
// the action type strings (`'cards/setActiveCard'` etc.) because action types
// are derived from the keys of the spread object inside `createSlice`.

import { autoOrganizeReducers } from './cards/reducers/auto-organize';
import { cardLifecycleReducers } from './cards/reducers/card-lifecycle';
import { importReducers } from './cards/reducers/import';
import { nodeDataReducers } from './cards/reducers/node-data';
import { nodeDeleteMergeReducers } from './cards/reducers/node-delete-merge';
import { nodeEdgeAddReducers } from './cards/reducers/node-edge-add';
import { nodePositionReducers } from './cards/reducers/node-position';
import { scaleBlueprintReducers } from './cards/reducers/scale-blueprint';
import { undoRedoGroupReducers } from './cards/reducers/undo-redo-group';
import type { CardsState } from './cards/types';

// =============================================================================
// Initial State
// =============================================================================

const loadedCards = loadPersistedCards();
const initialState: CardsState = {
  ...loadedCards,
  history: {},
};

// =============================================================================
// Slice
// =============================================================================

const cardsSlice = createSlice({
  name: 'cards',
  initialState,
  reducers: {
    ...cardLifecycleReducers,
    ...nodeEdgeAddReducers,
    ...nodePositionReducers,
    ...nodeDataReducers,
    ...nodeDeleteMergeReducers,
    ...importReducers,
    ...autoOrganizeReducers,
    ...scaleBlueprintReducers,
    ...undoRedoGroupReducers,
  },
});

// =============================================================================
// Exports
// =============================================================================

export const {
  setActiveCard,
  createCard,
  deleteCard,
  renameCard,
  addNodeToCard,
  addEdgeToCard,
  clearCardDeployOverlay,
  updateCardEdgeData,
  reverseCardEdge,
  updateCardNodePosition,
  updateCardNodePositions,
  resizeCardNode,
  toggleCardNodeFold,
  updateCardNodeParent,
  updateCardNodeData,
  deleteCardNode,
  deleteCardEdge,
  importToActiveCard,
  addToActiveCard,
  setCardViewport,
  setCardViewportById,
  autoOrganizeCard,
  scaleLayoutForZoom,
  expandBlueprintToCard,
  undoCardChange,
  redoCardChange,
  groupSelectedNodes,
} = cardsSlice.actions;

export default cardsSlice.reducer;

// =============================================================================
// Selectors
// =============================================================================

export const selectActiveCard = (state: { cards: CardsState }) =>
  state.cards.cards.find((c) => c.id === state.cards.activeCardId);
export const selectCanUndo = (state: { cards: CardsState }) => {
  if (!state.cards.activeCardId) return false;
  const h = state.cards.history[state.cards.activeCardId];
  return h ? h.past.length > 0 : false;
};
export const selectCanRedo = (state: { cards: CardsState }) => {
  if (!state.cards.activeCardId) return false;
  const h = state.cards.history[state.cards.activeCardId];
  return h ? h.future.length > 0 : false;
};

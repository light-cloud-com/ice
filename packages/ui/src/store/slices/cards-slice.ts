/**
 * Cards Slice
 *
 * Manages multiple canvas cards/tabs, each with separate nodes and edges.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ExpandedBlueprint } from '../../config/blocks';

// =============================================================================
// Types
// =============================================================================
//
// Types live in `./cards/types` (rf-cards-1). The re-export preserves the
// public import path for external consumers; the `import type` line brings
// the names into THIS module's lexical scope for internal references. After
// rf-cards-6 moved the lifecycle reducers (the only `Card` / `CardViewport` /
// `DEFAULT_VIEWPORT` consumers in this file) into `./cards/reducers/card-
// lifecycle`, only the three names actually referenced syntactically below
// stay in the local `import type` list.

export type { CardNode, CardEdge, CardViewport, Card, CardsState } from './cards/types';
import type { CardNode, CardsState } from './cards/types';

// =============================================================================
// Migration
// =============================================================================
//
// Migration lives in `./cards/migration` (rf-cards-2). The re-export
// preserves the public import path for external consumers; the runtime
// import brings the names into THIS module's lexical scope so the
// remaining ingestion site that still lives in this file
// (`expandBlueprintToCard`) can call `migrateCardNode` directly. After
// rf-cards-7/10/11 moved `addNodeToCard`, `addToActiveCard`, and
// `importToActiveCard` into their own files, the plural `migrateCardNodes`
// is no longer named at the syntactic level here — only the re-export
// shim keeps it on the public API path.

export { migrateCardNodes } from './cards/migration';
import { migrateCardNode } from './cards/migration';

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
// `./cards/snapshot` (rf-cards-5). The runtime import brings the function
// into THIS module's lexical scope so every undoable reducer can call it.
// `_lastSnapshotAction` is a module-private `let` in that file — keeping
// it module-scoped is what makes drag/resize coalescing work (RISK #5).

import { pushSnapshot } from './cards/snapshot';

// =============================================================================
// Reducer groups
// =============================================================================
//
// Card-lifecycle reducers (rf-cards-6) live in `./cards/reducers/card-lifecycle`.
// The runtime import brings the case-reducer object into THIS module's lexical
// scope so the `createSlice` `reducers:` block can spread it. RTK still owns
// the action type strings (`'cards/setActiveCard'` etc.) because action types
// are derived from the keys of the spread object inside `createSlice`.

import { cardLifecycleReducers } from './cards/reducers/card-lifecycle';
import { nodeEdgeAddReducers } from './cards/reducers/node-edge-add';
import { nodePositionReducers } from './cards/reducers/node-position';
import { nodeDataReducers } from './cards/reducers/node-data';
import { nodeDeleteMergeReducers } from './cards/reducers/node-delete-merge';
import { importReducers } from './cards/reducers/import';
import { autoOrganizeReducers } from './cards/reducers/auto-organize';

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

    // ── Proportional zoom scaling ──────────────────────────────────────
    // Instead of re-running the full layout (which rearranges topology and
    // causes jumps), scale positions and sizes proportionally around the
    // centroid.  The relative arrangement stays identical — blocks just
    // grow/shrink in place.
    scaleLayoutForZoom: (state, action: PayloadAction<{ zoom: number; prevZoom: number }>) => {
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card || card.nodes.length === 0) return;

      const { zoom, prevZoom } = action.payload;
      if (Math.abs(zoom - prevZoom) < 0.001) return;

      // Block dimensions are now fixed (CARD_WIDTH × CARD_HEIGHT) at all
      // zoom levels, so the scale factor is always 1.  We keep the centroid
      // logic intact in case future sizing changes re-introduce zoom-dependent
      // dimensions.
      const scaleX = 1;
      const scaleY = 1;

      // Compute centroid of top-level nodes (scale around this point)
      const topNodes = card.nodes.filter((n) => !n.parentId);
      if (topNodes.length === 0) return;

      let cx = 0,
        cy = 0;
      for (const n of topNodes) {
        cx += n.position.x + n.width / 2;
        cy += n.position.y + n.height / 2;
      }
      cx /= topNodes.length;
      cy /= topNodes.length;

      // Scale every node's position and size around the centroid
      for (const node of card.nodes) {
        const nodeCx = node.position.x + node.width / 2;
        const nodeCy = node.position.y + node.height / 2;

        // Scale center position relative to centroid
        const newCx = cx + (nodeCx - cx) * scaleX;
        const newCy = cy + (nodeCy - cy) * scaleY;

        // Scale dimensions
        const newW = node.width * scaleX;
        const newH = node.height * scaleY;

        node.position.x = newCx - newW / 2;
        node.position.y = newCy - newH / 2;
        node.width = newW;
        node.height = newH;
      }
    },

    // Expand a blueprint into the active card (single flat resource node)
    expandBlueprintToCard: (state, action: PayloadAction<ExpandedBlueprint>) => {
      pushSnapshot(state);
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card) return;

      // Run blueprint-emitted nodes through the migrator for parity with
      // the other ingestion paths — defends against any blueprint that
      // still references a legacy iceType.
      card.nodes.push(migrateCardNode(action.payload.node as CardNode));
    },

    // Undo last change on active card
    undoCardChange: (state) => {
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card) return;

      const history = state.history[card.id];
      if (!history || history.past.length === 0) return;

      // Save current state to future (redo)
      history.future.push({
        nodes: JSON.parse(JSON.stringify(card.nodes)),
        edges: JSON.parse(JSON.stringify(card.edges)),
      });

      // Restore from past
      const snapshot = history.past.pop()!;
      card.nodes = snapshot.nodes;
      card.edges = snapshot.edges;
    },

    // Redo last undone change on active card
    redoCardChange: (state) => {
      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card) return;

      const history = state.history[card.id];
      if (!history || history.future.length === 0) return;

      // Save current state to past (undo)
      history.past.push({
        nodes: JSON.parse(JSON.stringify(card.nodes)),
        edges: JSON.parse(JSON.stringify(card.edges)),
      });

      // Restore from future
      const snapshot = history.future.pop()!;
      card.nodes = snapshot.nodes;
      card.edges = snapshot.edges;
    },

    // Group selected nodes into a new Group.Custom container
    groupSelectedNodes: (state, action: PayloadAction<string[]>) => {
      const nodeIds = action.payload;
      if (nodeIds.length < 2) return;

      const card = state.cards.find((c) => c.id === state.activeCardId);
      if (!card) return;

      pushSnapshot(state);

      const selectedNodes = card.nodes.filter((n) => nodeIds.includes(n.id));
      if (selectedNodes.length < 2) return;

      // Compute bounding box of selected nodes
      const PADDING = 40;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const node of selectedNodes) {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + node.width);
        maxY = Math.max(maxY, node.position.y + node.height);
      }

      const groupNode: CardNode = {
        id: `group-${Date.now()}`,
        type: 'container',
        position: { x: minX - PADDING, y: minY - PADDING },
        width: maxX - minX + PADDING * 2,
        height: maxY - minY + PADDING * 2 + 30, // extra 30 for group header
        data: {
          label: 'New Group',
          iceType: 'Group.Custom',
          groupColor: '#3b82f6',
          behavior: 'container',
          status: 'active',
          folded: false,
        },
      };

      card.nodes.push(groupNode);

      // Reparent selected nodes (only top-level ones, not already children of each other)
      for (const node of selectedNodes) {
        if (!nodeIds.includes(node.parentId || '')) {
          node.parentId = groupNode.id;
        }
      }
    },
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

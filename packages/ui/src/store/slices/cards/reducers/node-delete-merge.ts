/**
 * Cards slice — node/edge delete + active-card merge reducers.
 *
 * Three reducers covering the destructive deletion paths and the
 * "merge into active card" ingestion (template combine / AI tool-use
 * "add nodes to current canvas"). Spread into `createSlice`'s `reducers`
 * block in the orchestrator (`cards-slice.ts`) so RTK still owns the
 * action type strings (`'cards/deleteCardNode'` etc.).
 *
 * - `deleteCardNode` — removes the node by id AND every incident edge
 *   (source or target matches the node id) on the active card. Both
 *   reassignments (`card.nodes = ...filter` and `card.edges = ...filter`)
 *   happen on the SAME Immer draft inside the SAME reducer body. This
 *   single-tick guarantee is load-bearing (RISK #1 in the rf-cards
 *   blueprint): splitting the work across two dispatched actions would
 *   produce a visible intermediate frame on the canvas where the deleted
 *   node is gone but its edges remain dangling.
 * - `deleteCardEdge` — removes a single edge by id from the active card.
 *   No node-level mutation; symmetric counterpart to `deleteCardNode` for
 *   the edge case.
 * - `addToActiveCard` — merges incoming nodes/edges into the active
 *   card by offsetting the new nodes to the right of existing content.
 *   The migration step (`migrateCardNodes`) runs FIRST, then the offset
 *   transform is applied to the migrated nodes (RISK #8: ingestion-path
 *   migration parity, and load-bearing order). Reversing the order would
 *   either (a) skip migration on the offset-wrapped nodes or (b) re-run
 *   migration on already-offset positions — both subtly wrong. The
 *   bounding-box scan reads `card.nodes` BEFORE migration/offset to derive
 *   `(maxX, maxY)` from existing canvas content, then the new nodes land
 *   at `maxX + 120` (the 120px gap is the visual breathing room). When
 *   the active card is empty, `offsetX` falls to `0` so a fresh canvas
 *   starts at origin.
 *
 * All three reducers call `pushSnapshot(state)` (no actionType) so each
 * action becomes its own undo step — these are user-initiated, not
 * high-frequency drag/resize events that need coalescing.
 *
 * @see rf-cards-10
 */

import { migrateCardNodes } from '../migration';
import { pushSnapshot } from '../snapshot';
import type { CardNode, CardEdge, CardsState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const nodeDeleteMergeReducers = {
  // Delete node from active card. Also removes every incident edge in
  // the SAME reducer body — splitting across two dispatched actions
  // would create a visible intermediate frame on the canvas (RISK #1).
  deleteCardNode: (state: CardsState, action: PayloadAction<string>) => {
    pushSnapshot(state);
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      card.nodes = card.nodes.filter((n) => n.id !== action.payload);
      // Also remove edges connected to this node
      card.edges = card.edges.filter((e) => e.source !== action.payload && e.target !== action.payload);
    }
  },

  // Delete edge from active card
  deleteCardEdge: (state: CardsState, action: PayloadAction<string>) => {
    pushSnapshot(state);
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      card.edges = card.edges.filter((e) => e.id !== action.payload);
    }
  },

  // Add nodes/edges to active card (merge, not replace) — for combining
  // templates. Migration runs FIRST so any legacy iceType (e.g. an AI
  // tool-use payload carrying `Monitoring.Terminal`) is upgraded BEFORE
  // the offset transform lands the nodes on the canvas (RISK #8). The
  // bounding-box scan reads existing nodes to derive the right-edge
  // offset; new nodes land at `maxX + 120`.
  addToActiveCard: (state: CardsState, action: PayloadAction<{ nodes: CardNode[]; edges: CardEdge[] }>) => {
    pushSnapshot(state);
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      // Find the bounding box of existing nodes to offset new ones
      let maxX = 0;
      let maxY = 0;
      for (const node of card.nodes) {
        const right = node.position.x + (node.width || 220);
        const bottom = node.position.y + (node.height || 56);
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      }

      // Offset new nodes to the right of existing content (with gap)
      const offsetX = card.nodes.length > 0 ? maxX + 120 : 0;
      const offsetY = 0;

      // Migrate incoming nodes (template merge / clipboard) before
      // offsetting so any legacy iceType is upgraded in place.
      const offsetNodes = migrateCardNodes(action.payload.nodes).map((node) => ({
        ...node,
        position: {
          x: node.position.x + offsetX,
          y: node.position.y + offsetY,
        },
      }));

      card.nodes = [...card.nodes, ...offsetNodes];
      card.edges = [...card.edges, ...action.payload.edges];
    }
  },
} as const;

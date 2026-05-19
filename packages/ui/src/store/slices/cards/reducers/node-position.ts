/**
 * Cards slice — node position + resize reducers.
 *
 * Three reducers covering the high-frequency drag/resize hot path:
 *
 * - `updateCardNodePosition` — single-node move with parent-bound clamp
 *   (BND-2 safety net). Invalidates incident edge routes so the cached
 *   dagre polylines don't paint through stale anchor points.
 * - `updateCardNodePositions` — batch move with a TWO-PASS design (RISK
 *   #2 in `state/blueprints/rf-cards.md`). Pass 1 applies all positions
 *   unconditionally; pass 2 clamps children to parent bounds. Both
 *   passes operate on the same Immer draft inside ONE reducer body —
 *   splitting them across two dispatches would create a visible flash
 *   where a child briefly renders outside its parent. The `skipClamp`
 *   flag (Shift+drag) bypasses pass 2 only; pass 1 always runs. Pass 1
 *   collects moved IDs into a Set so route invalidation runs once per
 *   moved node regardless of payload-shape (legacy array vs new object).
 *   Edge route invalidation runs BETWEEN the passes so children that
 *   land clamped still get their routes invalidated by virtue of having
 *   moved in pass 1.
 * - `resizeCardNode` — width/height update. Intentionally does NOT call
 *   `invalidateEdgeRoutesTouching`: a resize keeps the node's center
 *   point and connection ports stable enough that dagre's cached route
 *   stays visually correct, and recomputing on every resize-tick would
 *   cause edge flicker during corner-drag.
 *
 * All three reducers pass their action type to `pushSnapshot` so the
 * coalescing set in `cards/snapshot.ts` collapses a multi-tick drag or
 * resize into a single undo step. The action-type strings here MUST
 * match the keys in `COALESCE_ACTIONS` (`updateCardNodePosition`,
 * `updateCardNodePositions`, `resizeCardNode`) — change one and undo
 * coalescing breaks silently.
 *
 * Spread into `createSlice`'s `reducers` block in the orchestrator
 * (`cards-slice.ts`) so RTK still owns the action type strings.
 *
 * @see rf-cards-8
 */

import { CONTAINER_PADDING, HEADER_HEIGHT } from '../../../../config/canvas-constants';
import { invalidateEdgeRoutesTouching } from '../edge-routes';
import { pushSnapshot } from '../snapshot';
import type { CardsState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const nodePositionReducers = {
  // Update node position in active card (L2 / canonical position)
  // BND-2: Clamps child nodes to parent bounds as a safety net.
  updateCardNodePosition: (state: CardsState, action: PayloadAction<{ nodeId: string; x: number; y: number }>) => {
    pushSnapshot(state, 'updateCardNodePosition');
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      const node = card.nodes.find((n) => n.id === action.payload.nodeId);
      if (node) {
        let { x, y } = action.payload;
        if (node.parentId) {
          const parent = card.nodes.find((n) => n.id === node.parentId);
          if (parent) {
            const minX = parent.position.x + CONTAINER_PADDING;
            const minY = parent.position.y + CONTAINER_PADDING + HEADER_HEIGHT;
            const maxX = parent.position.x + parent.width - CONTAINER_PADDING - node.width;
            const maxY = parent.position.y + parent.height - CONTAINER_PADDING - node.height;
            x = Math.max(minX, Math.min(maxX, x));
            y = Math.max(minY, Math.min(maxY, y));
          }
        }
        node.position.x = x;
        node.position.y = y;
        invalidateEdgeRoutesTouching(card.edges, action.payload.nodeId);
      }
    }
  },

  // Batch update node positions in active card (L2 / canonical position)
  // BND-2: Clamps child nodes to parent bounds as a safety net.
  // Parent positions are applied first (they appear earlier in the update array)
  // so that expanded parent dimensions are available for child clamping.
  // Pass skipClamp: true during Shift+drag to allow nodes to escape containers.
  updateCardNodePositions: (
    state: CardsState,
    action: PayloadAction<
      | {
          updates: Array<{ id: string; position: { x: number; y: number } }>;
          skipClamp?: boolean;
        }
      | Array<{ id: string; position: { x: number; y: number } }>
    >,
  ) => {
    pushSnapshot(state, 'updateCardNodePositions');
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      // Support both old array format and new { updates, skipClamp } format
      const updates = Array.isArray(action.payload) ? action.payload : action.payload.updates;
      const skipClamp = Array.isArray(action.payload) ? false : !!action.payload.skipClamp;

      // First pass: apply all position updates
      const movedIds = new Set<string>();
      for (const update of updates) {
        const node = card.nodes.find((n) => n.id === update.id);
        if (node) {
          node.position.x = update.position.x;
          node.position.y = update.position.y;
          movedIds.add(update.id);
        }
      }
      for (const id of movedIds) invalidateEdgeRoutesTouching(card.edges, id);
      // Second pass: clamp children to their parent bounds (skip during Shift+drag)
      if (!skipClamp) {
        for (const update of updates) {
          const node = card.nodes.find((n) => n.id === update.id);
          if (node?.parentId) {
            const parent = card.nodes.find((n) => n.id === node.parentId);
            if (parent) {
              const minX = parent.position.x + CONTAINER_PADDING;
              const minY = parent.position.y + CONTAINER_PADDING + HEADER_HEIGHT;
              const maxX = parent.position.x + parent.width - CONTAINER_PADDING - node.width;
              const maxY = parent.position.y + parent.height - CONTAINER_PADDING - node.height;
              node.position.x = Math.max(minX, Math.min(maxX, node.position.x));
              node.position.y = Math.max(minY, Math.min(maxY, node.position.y));
            }
          }
        }
      }
    }
  },

  // Resize node in active card.
  // Intentionally does NOT invalidate edge routes — keeps cached polylines
  // stable through corner-drag without flicker. See module JSDoc.
  resizeCardNode: (state: CardsState, action: PayloadAction<{ id: string; width: number; height: number }>) => {
    pushSnapshot(state, 'resizeCardNode');
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      const node = card.nodes.find((n) => n.id === action.payload.id);
      if (node) {
        node.width = action.payload.width;
        node.height = action.payload.height;
      }
    }
  },
} as const;

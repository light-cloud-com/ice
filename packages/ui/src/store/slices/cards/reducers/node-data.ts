/**
 * Cards slice — node fold/parent/data reducers.
 *
 * Three reducers covering low-frequency single-node mutations that touch
 * `node.data`, `node.parentId`, or the fold flag:
 *
 * - `toggleCardNodeFold` — flips `node.data.folded`. Intentionally does NOT
 *   call `pushSnapshot`: fold/expand is a presentational state that should
 *   not consume an undo slot. A user pressing Cmd+Z after collapsing a
 *   group should undo the LAST data/structural action, not the fold gesture
 *   (RISK: blueprint flag, rf-cards-9). Also returns silently when
 *   `node.data` is absent so the toggle never throws on partially-shaped
 *   nodes.
 * - `updateCardNodeParent` — assigns `node.parentId` when the payload's
 *   parentId is truthy; uses `delete node.parentId` (NOT `=
 *   undefined`) on the falsy branch. RTK Immer serializes an absent field
 *   differently from `undefined` — keeping the field with an explicit
 *   `undefined` value would round-trip through `JSON.stringify` and back as
 *   the same string `"parentId":undefined` would simply be omitted, but the
 *   in-memory shape after a `JSON.parse(JSON.stringify(...))` clone (used
 *   by undo/redo) would diverge from the post-`delete` shape. The `delete`
 *   keeps the public-API contract: a node with no parent has no `parentId`
 *   field at all (RISK: blueprint flag, rf-cards-9).
 * - `updateCardNodeData` — shallow-merges the payload's `data` patch onto
 *   the existing `node.data` via spread. Sibling fields not in the patch
 *   are preserved. This is the canonical channel for properties-panel
 *   mutations that target `node.data` (label, groupColor, streamingMode,
 *   sourceNodeIdOverride, etc.).
 *
 * `updateCardNodeParent` and `updateCardNodeData` call `pushSnapshot(state)`
 * (no actionType) — each becomes its own undo step. They are user-initiated
 * and not high-frequency drag/resize events that need coalescing, so the
 * actionType-keyed coalescing in `pushSnapshot` is intentionally bypassed.
 *
 * Spread into `createSlice`'s `reducers` block in the orchestrator
 * (`cards-slice.ts`) so RTK still owns the action type strings
 * (`'cards/toggleCardNodeFold'`, etc.).
 *
 * @see rf-cards-9
 */

import { pushSnapshot } from '../snapshot';
import type { CardsState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const nodeDataReducers = {
  // Toggle node fold state in active card.
  // Intentionally NOT undoable — fold is a presentational state.
  toggleCardNodeFold: (state: CardsState, action: PayloadAction<string>) => {
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      const node = card.nodes.find((n) => n.id === action.payload);
      if (node && node.data) {
        node.data.folded = !node.data.folded;
      }
    }
  },

  // Update a node's parent (for drag in/out of groups).
  // Falsy branch uses `delete node.parentId` — NOT `= undefined` — so the
  // undo/redo deep-clone (`JSON.parse(JSON.stringify(...))`) round-trips
  // a "no parent" node as a node with no `parentId` key, matching the
  // type's optional-field contract (`parentId?: string`).
  updateCardNodeParent: (state: CardsState, action: PayloadAction<{ nodeId: string; parentId: string | null }>) => {
    pushSnapshot(state);
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      const node = card.nodes.find((n) => n.id === action.payload.nodeId);
      if (node) {
        if (action.payload.parentId) {
          node.parentId = action.payload.parentId;
        } else {
          delete node.parentId;
        }
      }
    }
  },

  // Update a node's data fields (label, groupColor, streamingMode, etc.).
  // Shallow-merges the patch onto existing `node.data` via spread; sibling
  // fields not in the patch are preserved.
  updateCardNodeData: (state: CardsState, action: PayloadAction<{ nodeId: string; data: Record<string, unknown> }>) => {
    pushSnapshot(state);
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      const node = card.nodes.find((n) => n.id === action.payload.nodeId);
      if (node) {
        node.data = { ...node.data, ...action.payload.data };
      }
    }
  },
} as const;

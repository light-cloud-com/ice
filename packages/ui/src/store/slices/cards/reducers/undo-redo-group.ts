/**
 * Cards slice — undo / redo / group-selection reducers.
 *
 * Three reducers spread into `createSlice`'s `reducers` block in the
 * orchestrator (`cards-slice.ts`) so RTK still owns the action type strings
 * (`'cards/undoCardChange'`, `'cards/redoCardChange'`,
 * `'cards/groupSelectedNodes'`).
 *
 * `undoCardChange` and `redoCardChange` MUST deep-clone via
 * `JSON.parse(JSON.stringify(...))` — RISK from rf-cards blueprint. Inside
 * an Immer `produce(...)` callback, `card.nodes` and `card.edges` are live
 * Proxies. Pushing them straight onto `history.future` (or `history.past`)
 * would persist references that are revoked the moment the `produce` call
 * returns, which manifests as `TypeError: Cannot perform 'has' on a proxy
 * that has been revoked` the next time undo/redo runs. `structuredClone`
 * handles plain data shapes too, but Immer 9's draft Proxies expose the
 * `WellKnownSymbols`-tagged backing object that `structuredClone` rejects
 * with `DataCloneError: <Object> could not be cloned` (versions vary). The
 * `JSON.parse(JSON.stringify(...))` route is the only deep-clone primitive
 * that round-trips an Immer draft cleanly, because it serializes through a
 * neutral JSON shape that drops Proxy traps. `current(card.nodes)` from
 * Immer would also work, but importing `current` here would couple the
 * reducer to Immer's runtime — we keep the slice-internal modules free of
 * Immer imports (only `produce` is used at the test boundary). Do NOT
 * replace these with `structuredClone` or `current()`.
 *
 * `groupSelectedNodes` creates a new `Group.Custom` container around two
 * or more selected nodes and reparents them. Insertion order matters
 * (RISK from rf-cards blueprint): `card.nodes.push(groupNode)` runs
 * BEFORE the `node.parentId = groupNode.id` reassignment loop. The group
 * is therefore the LAST element in `card.nodes`, which means it renders
 * BEHIND its children (the canvas paints in array order, so later =
 * deeper in z-stack from the user's POV). Reordering the push to come
 * after the loop, or inserting at index 0, would flip the z-stack and
 * the group's frame would occlude its members. Calls `pushSnapshot` so
 * the operation is undoable.
 *
 * @see rf-cards-14
 */

import { pushSnapshot } from '../snapshot';
import type { CardNode, CardsState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const undoRedoGroupReducers = {
  // Undo last change on active card
  undoCardChange: (state: CardsState) => {
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
  redoCardChange: (state: CardsState) => {
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
  groupSelectedNodes: (state: CardsState, action: PayloadAction<string[]>) => {
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
} as const;

/**
 * Cards slice — undo/redo snapshot helper.
 *
 * `pushSnapshot` is called from every undoable reducer in cards-slice.ts
 * before mutating card state. It deep-clones the active card's nodes and
 * edges into the per-card `past` stack, caps the stack at MAX_HISTORY (50),
 * and clears the redo `future` stack on every new action.
 *
 * Coalescing: high-frequency actions (drag, resize) are coalesced into a
 * single undo step by tracking the last action type that snapshotted. The
 * second through Nth call in a sequence are skipped, so dragging a node
 * across the canvas creates ONE undo step instead of dozens.
 *
 * `_lastSnapshotAction` is a module-level `let` — its singleton scope
 * across all callers in one event-loop tick is what makes coalescing work.
 * Do NOT wrap this in a factory or class; the module-private state is the
 * mechanism (see RISK #5 in `state/blueprints/rf-cards.md`).
 *
 * @see rf-cards-5
 */

import type { CardsState } from './types';

const MAX_HISTORY = 50;

/**
 * Coalescing: track the last action type that created a snapshot.
 * Sequential calls to the same high-frequency action (position, resize)
 * only snapshot on the FIRST call, so dragging creates one undo step.
 */
let _lastSnapshotAction = '';

/** High-frequency actions that should be coalesced into one undo step */
const COALESCE_ACTIONS = new Set(['updateCardNodePosition', 'updateCardNodePositions', 'resizeCardNode']);

/**
 * Push a snapshot of the active card's current state onto its undo stack.
 * Called before any mutation that should be undoable.
 * Clears the redo stack (new action invalidates future).
 *
 * For high-frequency actions (drag/resize), only the first call in a
 * sequence creates a snapshot — subsequent calls are coalesced.
 */
export function pushSnapshot(state: CardsState, actionType?: string): void {
  // Coalesce rapid-fire position/resize updates
  if (actionType && COALESCE_ACTIONS.has(actionType)) {
    if (_lastSnapshotAction === actionType) return; // already snapshotted
  }
  _lastSnapshotAction = actionType || '';

  const card = state.cards.find((c) => c.id === state.activeCardId);
  if (!card) return;

  const cardId = card.id;
  if (!state.history[cardId]) {
    state.history[cardId] = { past: [], future: [] };
  }

  const history = state.history[cardId];
  history.past.push({
    nodes: JSON.parse(JSON.stringify(card.nodes)),
    edges: JSON.parse(JSON.stringify(card.edges)),
  });

  // Cap history size
  if (history.past.length > MAX_HISTORY) {
    history.past.shift();
  }

  // New action clears redo
  history.future = [];
}

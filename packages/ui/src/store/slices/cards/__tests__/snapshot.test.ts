/**
 * Tests for `cards/snapshot.ts` — the undo-stack push helper.
 *
 * Covers all 7 documented branches: coalescing within COALESCE_ACTIONS,
 * cross-action snapshot creation, non-coalescing actions always snapshot,
 * no-op when no active card or card is missing, lazy `history[cardId]`
 * initialization, deep-clone isolation between snapshot and source,
 * MAX_HISTORY (50) cap with FIFO shift, and redo-stack clearing.
 *
 * Coalescing state (`_lastSnapshotAction`) is module-private. Each test
 * resets it via a synthetic non-coalescing action call (`'reset-coalesce'`)
 * — simpler than `vi.resetModules()` + dynamic imports and keeps the suite
 * pointed at one stable module instance.
 *
 * @see rf-cards-5
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { pushSnapshot } from '../snapshot';
import type { CardEdge, CardNode, CardsState } from '../types';

// -----------------------------------------------------------------------------
// Fixture builders
// -----------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<CardNode> = {}): CardNode {
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    width: 220,
    height: 56,
    data: { label: id },
    ...overrides,
  };
}

function makeEdge(id: string, source: string, target: string): CardEdge {
  return { id, source, target };
}

function makeState(opts: {
  activeCardId?: string | null;
  cards?: Array<{ id: string; nodes?: CardNode[]; edges?: CardEdge[] }>;
} = {}): CardsState {
  const activeCardId = opts.activeCardId === undefined ? 'c1' : opts.activeCardId;
  const cards = (opts.cards ?? [{ id: 'c1', nodes: [makeNode('n1')], edges: [] }]).map((c) => ({
    id: c.id,
    name: c.id,
    nodes: c.nodes ?? [],
    edges: c.edges ?? [],
    viewport: { panX: 0, panY: 0, scale: 1 },
    createdAt: 0,
  }));
  return { cards, activeCardId, history: {} };
}

// -----------------------------------------------------------------------------
// Coalescing state reset
// -----------------------------------------------------------------------------
//
// `_lastSnapshotAction` is a module-level `let` in snapshot.ts — the
// singleton scope is what makes drag/resize coalescing work. We reset it
// between tests by calling pushSnapshot with a synthetic action that's NOT
// in COALESCE_ACTIONS; that overwrites `_lastSnapshotAction` to
// 'reset-coalesce'. Subsequent calls inside the test then start from a
// known coalescing baseline that won't accidentally match a real action
// type. We point the call at a throwaway state with no active card so the
// reset itself doesn't perturb test fixtures.

beforeEach(() => {
  pushSnapshot(makeState({ activeCardId: null }), 'reset-coalesce');
});

// -----------------------------------------------------------------------------
// Coalescing
// -----------------------------------------------------------------------------

describe('pushSnapshot — coalescing within COALESCE_ACTIONS', () => {
  it('first call with updateCardNodePosition pushes a snapshot', () => {
    const state = makeState();
    pushSnapshot(state, 'updateCardNodePosition');
    expect(state.history.c1.past).toHaveLength(1);
  });

  it('second call with the same action is coalesced (no new snapshot)', () => {
    const state = makeState();
    pushSnapshot(state, 'updateCardNodePosition');
    pushSnapshot(state, 'updateCardNodePosition');
    expect(state.history.c1.past).toHaveLength(1);
  });

  it('three coalescing calls in a row produce exactly one snapshot', () => {
    const state = makeState();
    pushSnapshot(state, 'updateCardNodePositions');
    pushSnapshot(state, 'updateCardNodePositions');
    pushSnapshot(state, 'updateCardNodePositions');
    expect(state.history.c1.past).toHaveLength(1);
  });

  it('a different coalescing action breaks the streak — next call snapshots', () => {
    const state = makeState();
    pushSnapshot(state, 'updateCardNodePosition');
    // Different action type — overwrites `_lastSnapshotAction`, snapshots.
    pushSnapshot(state, 'resizeCardNode');
    // Now the original action snapshots again because the streak broke.
    pushSnapshot(state, 'updateCardNodePosition');
    expect(state.history.c1.past).toHaveLength(3);
  });

  it('all three COALESCE_ACTIONS coalesce within their own streak', () => {
    const actions = ['updateCardNodePosition', 'updateCardNodePositions', 'resizeCardNode'] as const;
    for (const a of actions) {
      const state = makeState();
      pushSnapshot(state, a);
      pushSnapshot(state, a);
      pushSnapshot(state, a);
      expect(state.history.c1.past).toHaveLength(1);
      // Reset so the next iteration's first call isn't itself coalesced.
      pushSnapshot(makeState({ activeCardId: null }), 'reset-coalesce');
    }
  });
});

// -----------------------------------------------------------------------------
// Non-coalescing actions
// -----------------------------------------------------------------------------

describe('pushSnapshot — non-coalescing actions', () => {
  it('addNodeToCard always snapshots regardless of repeats', () => {
    const state = makeState();
    pushSnapshot(state, 'addNodeToCard');
    pushSnapshot(state, 'addNodeToCard');
    pushSnapshot(state, 'addNodeToCard');
    expect(state.history.c1.past).toHaveLength(3);
  });

  it('no actionType arg always snapshots (undefined skips coalesce check)', () => {
    const state = makeState();
    pushSnapshot(state);
    pushSnapshot(state);
    expect(state.history.c1.past).toHaveLength(2);
  });

  it('no actionType arg sets _lastSnapshotAction to the empty string', () => {
    // After a no-arg call, `_lastSnapshotAction = ''`. The next coalescing
    // call shouldn't be skipped because '' !== 'updateCardNodePosition'.
    const state = makeState();
    pushSnapshot(state);
    pushSnapshot(state, 'updateCardNodePosition');
    expect(state.history.c1.past).toHaveLength(2);
  });
});

// -----------------------------------------------------------------------------
// No-op cases
// -----------------------------------------------------------------------------

describe('pushSnapshot — no-op cases', () => {
  it('does nothing when activeCardId is null', () => {
    const state = makeState({ activeCardId: null });
    pushSnapshot(state, 'addNodeToCard');
    expect(state.history).toEqual({});
  });

  it('does nothing when the active card is not found in state.cards', () => {
    const state = makeState({ activeCardId: 'missing' });
    pushSnapshot(state, 'addNodeToCard');
    expect(state.history).toEqual({});
  });
});

// -----------------------------------------------------------------------------
// Lazy history initialization
// -----------------------------------------------------------------------------

describe('pushSnapshot — history initialization', () => {
  it('initializes history[cardId] = { past: [], future: [] } when missing', () => {
    const state = makeState();
    expect(state.history.c1).toBeUndefined();
    pushSnapshot(state, 'addNodeToCard');
    expect(state.history.c1).toBeDefined();
    expect(state.history.c1.past).toHaveLength(1);
    expect(state.history.c1.future).toEqual([]);
  });

  it('reuses an existing history[cardId] entry — does not overwrite future', () => {
    const state = makeState();
    state.history.c1 = {
      past: [{ nodes: [makeNode('old')], edges: [] }],
      future: [{ nodes: [makeNode('redo-target')], edges: [] }],
    };
    // pushSnapshot will append to past AND clear future (see redo test
    // below). Here we just confirm it doesn't replace the whole object.
    const beforeRef = state.history.c1;
    pushSnapshot(state, 'addNodeToCard');
    expect(state.history.c1).toBe(beforeRef); // same reference
    expect(state.history.c1.past).toHaveLength(2); // appended
  });
});

// -----------------------------------------------------------------------------
// Deep clone isolation
// -----------------------------------------------------------------------------

describe('pushSnapshot — deep clone isolation', () => {
  it('mutating the snapshot does not affect the source nodes/edges', () => {
    const sourceNode = makeNode('n1', { data: { label: 'original' } });
    const sourceEdge = makeEdge('e1', 'n1', 'n2');
    const state = makeState({
      cards: [{ id: 'c1', nodes: [sourceNode], edges: [sourceEdge] }],
    });

    pushSnapshot(state, 'addNodeToCard');

    const snap = state.history.c1.past[0];
    snap.nodes[0].data.label = 'mutated-snapshot';
    snap.edges[0].source = 'mutated-source';

    expect(sourceNode.data.label).toBe('original');
    expect(sourceEdge.source).toBe('n1');
  });

  it('mutating the source after snapshot does not affect the snapshot', () => {
    const sourceNode = makeNode('n1', { data: { label: 'original' } });
    const sourceEdge = makeEdge('e1', 'n1', 'n2');
    const state = makeState({
      cards: [{ id: 'c1', nodes: [sourceNode], edges: [sourceEdge] }],
    });

    pushSnapshot(state, 'addNodeToCard');

    sourceNode.data.label = 'post-snapshot-mutation';
    sourceEdge.target = 'mutated-target';

    const snap = state.history.c1.past[0];
    expect(snap.nodes[0].data.label).toBe('original');
    expect(snap.edges[0].target).toBe('n2');
  });

  it('snapshot is a deep clone — top-level reference is different', () => {
    const sourceNode = makeNode('n1');
    const state = makeState({
      cards: [{ id: 'c1', nodes: [sourceNode], edges: [] }],
    });

    pushSnapshot(state, 'addNodeToCard');

    const snap = state.history.c1.past[0];
    expect(snap.nodes).not.toBe(state.cards[0].nodes);
    expect(snap.nodes[0]).not.toBe(sourceNode);
  });
});

// -----------------------------------------------------------------------------
// MAX_HISTORY cap
// -----------------------------------------------------------------------------

describe('pushSnapshot — MAX_HISTORY cap', () => {
  it('caps past.length at 50 — older snapshots shift out (FIFO)', () => {
    const state = makeState();

    // Push 51 distinct snapshots. We use a non-coalescing action so each
    // call lands a new entry. We tag each snapshot via the source nodes
    // before pushing, so the FIFO order is verifiable.
    for (let i = 0; i < 51; i++) {
      state.cards[0].nodes = [makeNode(`n-${i}`)];
      pushSnapshot(state, 'addNodeToCard');
    }

    expect(state.history.c1.past).toHaveLength(50);
    // The first push (n-0) was shifted out; the second (n-1) is now the
    // oldest, the 51st (n-50) is the newest.
    expect(state.history.c1.past[0].nodes[0].id).toBe('n-1');
    expect(state.history.c1.past[49].nodes[0].id).toBe('n-50');
  });

  it('exactly 50 snapshots — no shift', () => {
    const state = makeState();
    for (let i = 0; i < 50; i++) {
      pushSnapshot(state, 'addNodeToCard');
    }
    expect(state.history.c1.past).toHaveLength(50);
  });
});

// -----------------------------------------------------------------------------
// Redo stack cleared
// -----------------------------------------------------------------------------

describe('pushSnapshot — redo stack', () => {
  it('clears history.future on every push (new action invalidates redo)', () => {
    const state = makeState();
    state.history.c1 = {
      past: [],
      future: [
        { nodes: [makeNode('redo-1')], edges: [] },
        { nodes: [makeNode('redo-2')], edges: [] },
      ],
    };

    pushSnapshot(state, 'addNodeToCard');

    expect(state.history.c1.future).toEqual([]);
  });

  it('clears future even on the very first snapshot for the card', () => {
    // Pre-seed history with future but no past — pushSnapshot still wipes
    // future after appending its first past entry.
    const state = makeState();
    state.history.c1 = {
      past: [],
      future: [{ nodes: [makeNode('stale-redo')], edges: [] }],
    };

    pushSnapshot(state, 'addNodeToCard');

    expect(state.history.c1.past).toHaveLength(1);
    expect(state.history.c1.future).toEqual([]);
  });
});

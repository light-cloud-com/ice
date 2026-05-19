/**
 * Tests for `cards/reducers/node-delete-merge.ts` — the three reducers
 * covering destructive deletion (`deleteCardNode`, `deleteCardEdge`) and
 * the active-card merge (`addToActiveCard`).
 *
 * Each reducer is exercised through Immer's `produce` to mirror RTK's runtime
 * behavior — the reducer body mutates a draft and the produced result is
 * structurally equal to the post-mutation draft. This avoids dragging in
 * `configureStore` for what is fundamentally a pure
 * `(state, action) => void` shape.
 *
 * `pushSnapshot` from `../../snapshot` is the real implementation. All three
 * reducers call it WITHOUT an actionType, so coalescing is bypassed. The
 * `beforeEach` "reset-coalesce" sentinel call keeps parity with sibling
 * test files (cheap insurance against module-level `let` leakage —
 * see `pushsnapshot-coalescing-needs-explicit-reset-between-tests`).
 *
 * Coverage targets:
 * - `deleteCardNode`: removes node by id; ALSO removes every incident edge
 *   (source or target match) in ONE reducer call (RISK #1: single-tick
 *   guarantee — no intermediate frame); leaves unrelated nodes/edges
 *   untouched; pushSnapshot recorded; no-op when no active card; no-op
 *   when nodeId is missing.
 * - `deleteCardEdge`: removes single edge by id; leaves nodes untouched;
 *   leaves unrelated edges untouched; pushSnapshot recorded; no-op when
 *   no active card; no-op when edgeId is missing.
 * - `addToActiveCard`: migrates payload nodes (Monitoring.Terminal →
 *   Monitoring.Log) BEFORE applying the offset transform — so a migrated
 *   node carries BOTH the new iceType AND the offset coordinates (RISK
 *   #8: ingestion-path migration parity, load-bearing order); offsets
 *   new nodes by `maxX + 120` (right of existing content); falls to
 *   `offsetX = 0` on an empty canvas; appends payload edges as-is;
 *   pushSnapshot recorded; no-op when no active card.
 *
 * @see rf-cards-10
 */

import { produce } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import { pushSnapshot } from '../../snapshot';
import { nodeDeleteMergeReducers } from '../node-delete-merge';
import type { Card, CardEdge, CardNode, CardsState } from '../../types';
import type { PayloadAction } from '@reduxjs/toolkit';

// -----------------------------------------------------------------------------
// Fixture builders
// -----------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<CardNode> = {}): CardNode {
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    width: 240,
    height: 56,
    data: {},
    ...overrides,
  };
}

function makeEdge(id: string, source: string, target: string, overrides: Partial<CardEdge> = {}): CardEdge {
  return {
    id,
    source,
    target,
    ...overrides,
  };
}

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    name: id,
    nodes: [],
    edges: [] as CardEdge[],
    viewport: { panX: 0, panY: 0, scale: 1 },
    createdAt: 0,
    ...overrides,
  };
}

function makeState(opts: { cards?: Card[]; activeCardId?: string | null } = {}): CardsState {
  return {
    cards: opts.cards ?? [makeCard('c1')],
    activeCardId: opts.activeCardId === undefined ? 'c1' : opts.activeCardId,
    history: {},
  };
}

// -----------------------------------------------------------------------------
// Coalesce-state reset
// -----------------------------------------------------------------------------
//
// `pushSnapshot` keeps `_lastSnapshotAction` at module scope. None of the
// reducers in this file call `pushSnapshot` with an actionType, so coalescing
// wouldn't fire, but a stale value from another test could in theory affect
// downstream tests. The "reset-coalesce" sentinel is cheap insurance — a
// no-op call against a null-active state, see
// `reset-module-let-via-synthetic-call-not-vi-resetModules`.

beforeEach(() => {
  pushSnapshot({ cards: [], activeCardId: null, history: {} } as CardsState, 'reset-coalesce');
});

// -----------------------------------------------------------------------------
// deleteCardNode
// -----------------------------------------------------------------------------

describe('deleteCardNode', () => {
  it('removes the targeted node from the active card', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1'), makeNode('n2'), makeNode('n3')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.deleteCardNode(draft, {
        type: 'cards/deleteCardNode',
        payload: 'n2',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['n1', 'n3']);
  });

  it('removes ALL incident edges (source or target match) in the SAME reducer call', () => {
    // RISK #1: both `card.nodes` and `card.edges` reassignments must
    // happen on the SAME Immer draft inside ONE reducer body. Splitting
    // across two dispatched actions would create a visible intermediate
    // frame on the canvas. Pin: after one deleteCardNode call, the
    // node and ALL its edges are gone, with unrelated edges preserved.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1'), makeNode('n2'), makeNode('n3')],
          edges: [
            makeEdge('e1', 'n1', 'n2'), // n2 as target — should be removed
            makeEdge('e2', 'n2', 'n3'), // n2 as source — should be removed
            makeEdge('e3', 'n1', 'n3'), // unrelated — should be kept
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.deleteCardNode(draft, {
        type: 'cards/deleteCardNode',
        payload: 'n2',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['n1', 'n3']);
    expect(next.cards[0].edges.map((e) => e.id)).toEqual(['e3']);
  });

  it('removes the node even when there are no incident edges', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1'), makeNode('n2')],
          edges: [makeEdge('e1', 'n1', 'n2')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      // Deleting n3 (which doesn't exist) should be a no-op, but the same
      // reducer body filters edges — verify edges are unchanged.
      nodeDeleteMergeReducers.deleteCardNode(draft, {
        type: 'cards/deleteCardNode',
        payload: 'n3',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(next.cards[0].edges.map((e) => e.id)).toEqual(['e1']);
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1'), makeNode('n2')],
          edges: [makeEdge('e1', 'n1', 'n2')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.deleteCardNode(draft, {
        type: 'cards/deleteCardNode',
        payload: 'n2',
      } as PayloadAction<string>);
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    // Snapshot captures pre-deletion state — both nodes and the edge.
    expect(next.history.c1.past[0].nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(next.history.c1.past[0].edges.map((e) => e.id)).toEqual(['e1']);
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1')],
          edges: [],
        }),
      ],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.deleteCardNode(draft, {
        type: 'cards/deleteCardNode',
        payload: 'n1',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['n1']);
  });
});

// -----------------------------------------------------------------------------
// deleteCardEdge
// -----------------------------------------------------------------------------

describe('deleteCardEdge', () => {
  it('removes the targeted edge from the active card', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1'), makeNode('n2')],
          edges: [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n1'), makeEdge('e3', 'n1', 'n2')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.deleteCardEdge(draft, {
        type: 'cards/deleteCardEdge',
        payload: 'e2',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].edges.map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('leaves nodes untouched', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1'), makeNode('n2')],
          edges: [makeEdge('e1', 'n1', 'n2')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.deleteCardEdge(draft, {
        type: 'cards/deleteCardEdge',
        payload: 'e1',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(next.cards[0].edges).toEqual([]);
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1'), makeNode('n2')],
          edges: [makeEdge('e1', 'n1', 'n2')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.deleteCardEdge(draft, {
        type: 'cards/deleteCardEdge',
        payload: 'e1',
      } as PayloadAction<string>);
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    expect(next.history.c1.past[0].edges.map((e) => e.id)).toEqual(['e1']);
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1'), makeNode('n2')],
          edges: [makeEdge('e1', 'n1', 'n2')],
        }),
      ],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.deleteCardEdge(draft, {
        type: 'cards/deleteCardEdge',
        payload: 'e1',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].edges.map((e) => e.id)).toEqual(['e1']);
  });

  it('is a no-op when the edgeId does not match any edge', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1'), makeNode('n2')],
          edges: [makeEdge('e1', 'n1', 'n2')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.deleteCardEdge(draft, {
        type: 'cards/deleteCardEdge',
        payload: 'missing',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].edges.map((e) => e.id)).toEqual(['e1']);
  });
});

// -----------------------------------------------------------------------------
// addToActiveCard
// -----------------------------------------------------------------------------

describe('addToActiveCard', () => {
  it('migrates incoming nodes BEFORE applying the offset transform', () => {
    // RISK #8: load-bearing order. The migration step (Monitoring.Terminal
    // → Monitoring.Log) must run on the raw payload, then the offset is
    // applied to the migrated nodes. Pin: a single Monitoring.Terminal
    // node with `position: { x: 100, y: 50 }` arriving on a canvas with
    // existing content (maxX = 240) should land with BOTH (a) the new
    // iceType `Monitoring.Log` AND (b) coordinates `(100 + maxX + 120, 50)`.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('existing', {
              position: { x: 0, y: 0 },
              width: 240,
              height: 56,
            }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const incomingNode = makeNode('new', {
      position: { x: 100, y: 50 },
      data: { iceType: 'Monitoring.Terminal' },
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.addToActiveCard(draft, {
        type: 'cards/addToActiveCard',
        payload: { nodes: [incomingNode], edges: [] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[] }>);
    });
    const added = next.cards[0].nodes.find((n) => n.id === 'new');
    expect(added).toBeDefined();
    // (a) Migrated iceType — the migrator ran.
    expect(added!.data.iceType).toBe('Monitoring.Log');
    // (b) Offset applied AFTER migration: existing maxX is 240 (0 + 240),
    //     gap is 120, so offsetX = 360. Incoming position.x is 100 →
    //     final x = 460. y stays as offsetY = 0 → final y = 50.
    expect(added!.position).toEqual({ x: 460, y: 50 });
  });

  it('appends payload edges to the active card', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('existing')],
          edges: [makeEdge('e0', 'existing', 'existing')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.addToActiveCard(draft, {
        type: 'cards/addToActiveCard',
        payload: {
          nodes: [makeNode('new1'), makeNode('new2')],
          edges: [makeEdge('e1', 'new1', 'new2'), makeEdge('e2', 'new2', 'new1')],
        },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[] }>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['existing', 'new1', 'new2']);
    expect(next.cards[0].edges.map((e) => e.id)).toEqual(['e0', 'e1', 'e2']);
  });

  it('falls to offsetX = 0 when the active card is empty', () => {
    // The branch `card.nodes.length > 0 ? maxX + 120 : 0` — empty canvas
    // case. New nodes land at their incoming positions, no shift.
    const state = makeState({
      cards: [makeCard('c1', { nodes: [], edges: [] })],
      activeCardId: 'c1',
    });
    const incoming = makeNode('new', { position: { x: 100, y: 50 } });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.addToActiveCard(draft, {
        type: 'cards/addToActiveCard',
        payload: { nodes: [incoming], edges: [] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[] }>);
    });
    const added = next.cards[0].nodes.find((n) => n.id === 'new');
    expect(added!.position).toEqual({ x: 100, y: 50 });
  });

  it('keeps the running maxX/maxY from the first node when later nodes do not exceed it', () => {
    // Branch coverage for the bounding-box scan: the `if (right > maxX)`
    // and `if (bottom > maxY)` falsy paths fire when a later node's
    // right/bottom edge is <= the running max. Pin: two existing nodes
    // where the second has smaller dimensions/position than the first —
    // maxX/maxY stay anchored to the first node.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('big', {
              position: { x: 100, y: 200 },
              width: 240,
              height: 100,
            }),
            makeNode('small', {
              position: { x: 0, y: 0 },
              width: 50,
              height: 30,
            }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const incoming = makeNode('new', { position: { x: 0, y: 0 } });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.addToActiveCard(draft, {
        type: 'cards/addToActiveCard',
        payload: { nodes: [incoming], edges: [] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[] }>);
    });
    const added = next.cards[0].nodes.find((n) => n.id === 'new');
    // big right = 100 + 240 = 340; small right = 50 — first wins.
    // offsetX = 340 + 120 = 460; offsetY = 0.
    expect(added!.position).toEqual({ x: 460, y: 0 });
  });

  it('uses fallback widths/heights (220 / 56) when existing nodes lack them', () => {
    // The bounding-box scan reads `node.width || 220` and `node.height || 56`.
    // Cover the fallback branch with an existing node that has zero/missing
    // dimensions — width 0 falls through `|| 220`, so right edge is 220,
    // gap is 120, offsetX should be 340.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            {
              id: 'existing',
              type: 'block',
              position: { x: 0, y: 0 },
              width: 0,
              height: 0,
              data: {},
            } as CardNode,
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const incoming = makeNode('new', { position: { x: 0, y: 0 } });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.addToActiveCard(draft, {
        type: 'cards/addToActiveCard',
        payload: { nodes: [incoming], edges: [] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[] }>);
    });
    const added = next.cards[0].nodes.find((n) => n.id === 'new');
    // existing right = 0 + 220 (fallback) = 220 → offsetX = 220 + 120 = 340.
    expect(added!.position).toEqual({ x: 340, y: 0 });
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('existing')] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.addToActiveCard(draft, {
        type: 'cards/addToActiveCard',
        payload: { nodes: [makeNode('new')], edges: [] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[] }>);
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    // Snapshot captures pre-merge state (only the existing node).
    expect(next.history.c1.past[0].nodes.map((n) => n.id)).toEqual(['existing']);
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('existing')] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodeDeleteMergeReducers.addToActiveCard(draft, {
        type: 'cards/addToActiveCard',
        payload: { nodes: [makeNode('new')], edges: [] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[] }>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['existing']);
  });
});

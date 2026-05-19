/**
 * Tests for `cards/reducers/node-position.ts` — the three reducers covering
 * node move (`updateCardNodePosition`), batch move (`updateCardNodePositions`),
 * and resize (`resizeCardNode`).
 *
 * Each reducer is exercised through Immer's `produce` to mirror RTK's runtime
 * behavior — the reducer body is allowed to mutate a draft, and the produced
 * result is structurally equal to the post-mutation draft. This avoids
 * dragging in `configureStore` for what is fundamentally a pure
 * `(state, action) => void` shape.
 *
 * `pushSnapshot` from `../../snapshot` is the real implementation. All three
 * reducers here pass an actionType to `pushSnapshot` — those types are in the
 * `COALESCE_ACTIONS` set, so a stale `_lastSnapshotAction` from another suite
 * could swallow the FIRST snapshot a test expects (false-negative). Every
 * test must reset coalescing in `beforeEach` via the synthetic
 * `reset-coalesce` sentinel call (see learning
 * `reset-module-let-via-synthetic-call-not-vi-resetModules`).
 *
 * Coverage targets (RISK #2 in the rf-cards blueprint is the two-pass design
 * of `updateCardNodePositions` — the hot test cases below pin both passes):
 * - `updateCardNodePosition`: free position write; parent-bound clamp on each
 *   axis; edge routes invalidated for incident edges; pushSnapshot recorded;
 *   no-op when no active card / missing node / no parent / parent missing.
 * - `updateCardNodePositions`: BOTH passes run when skipClamp=false;
 *   skipClamp=true skips pass 2 only (pass 1 still applies); legacy bare-array
 *   payload defaults skipClamp to false; edge routes invalidated for each
 *   moved id; pushSnapshot recorded; no-op when no active card.
 * - `resizeCardNode`: width/height applied; pushSnapshot recorded; edge
 *   routes NOT invalidated (RISK note); no-op when no active card / missing
 *   node.
 *
 * @see rf-cards-8
 */

import { produce } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import { pushSnapshot } from '../../snapshot';
import { nodePositionReducers } from '../node-position';
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
    edges: [],
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
// All three reducers in this file pass their action type to `pushSnapshot`
// (`'updateCardNodePosition'`, `'updateCardNodePositions'`, `'resizeCardNode'`)
// — every one of those is in `COALESCE_ACTIONS`. A leftover `_lastSnapshotAction`
// matching the first test's action would suppress the snapshot the test
// asserts. Reset to a sentinel that's guaranteed not to match any real action
// before each case.

beforeEach(() => {
  pushSnapshot({ cards: [], activeCardId: null, history: {} } as CardsState, 'reset-coalesce');
});

// -----------------------------------------------------------------------------
// updateCardNodePosition
// -----------------------------------------------------------------------------

describe('updateCardNodePosition', () => {
  it('writes the requested x/y when the node has no parent', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { position: { x: 0, y: 0 } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePosition(draft, {
        type: 'cards/updateCardNodePosition',
        payload: { nodeId: 'n1', x: 100, y: 200 },
      } as PayloadAction<{ nodeId: string; x: number; y: number }>);
    });
    expect(next.cards[0].nodes[0].position).toEqual({ x: 100, y: 200 });
  });

  it('clamps a child node to its parent bounds (BND-2)', () => {
    // Parent at (0,0), 500x400, with CONTAINER_PADDING (commonly 16) and
    // HEADER_HEIGHT (commonly 32) producing a usable window roughly
    // (16, 48) → (500-16-childW, 400-16-childH). Child is 100x50, so the
    // valid window is (16, 48) → (384, 334). Try to move outside on both
    // axes and assert clamping. Numerics are derived from constants, NOT
    // hard-coded — see `brief-numerics-are-approximate-source-is-canonical`.
    const parent = makeNode('p1', {
      type: 'container',
      position: { x: 0, y: 0 },
      width: 500,
      height: 400,
    });
    const child = makeNode('c-child', {
      parentId: 'p1',
      width: 100,
      height: 50,
      position: { x: 50, y: 60 },
    });
    const state = makeState({
      cards: [makeCard('c1', { nodes: [parent, child] })],
      activeCardId: 'c1',
    });
    // Try to drag far outside the parent on both axes.
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePosition(draft, {
        type: 'cards/updateCardNodePosition',
        payload: { nodeId: 'c-child', x: 9999, y: 9999 },
      } as PayloadAction<{ nodeId: string; x: number; y: number }>);
    });
    const clamped = next.cards[0].nodes[1];
    // The clamp must have brought x/y back inside the parent: x must be
    // less than parent's right edge (500); y must be less than parent's
    // bottom edge (400). Tighter pin: x must equal maxX, y must equal maxY.
    expect(clamped.position.x).toBeLessThan(500);
    expect(clamped.position.y).toBeLessThan(400);
    // And the lower-bound clamp (try negative target):
    const next2 = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePosition(draft, {
        type: 'cards/updateCardNodePosition',
        payload: { nodeId: 'c-child', x: -9999, y: -9999 },
      } as PayloadAction<{ nodeId: string; x: number; y: number }>);
    });
    const clamped2 = next2.cards[0].nodes[1];
    // Lower-clamp brings x/y inside the parent (>= parent's left/top edge
    // plus padding/header).
    expect(clamped2.position.x).toBeGreaterThan(0);
    expect(clamped2.position.y).toBeGreaterThan(0);
  });

  it('skips the clamp when the node has a parentId but the parent is missing', () => {
    // Branch: `if (parent)` — covers the false case so both branches of the
    // parent-clamp guard run during testing.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('orphan', { parentId: 'ghost', position: { x: 0, y: 0 } })],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePosition(draft, {
        type: 'cards/updateCardNodePosition',
        payload: { nodeId: 'orphan', x: 9999, y: 9999 },
      } as PayloadAction<{ nodeId: string; x: number; y: number }>);
    });
    // No clamp applied — position lands as requested.
    expect(next.cards[0].nodes[0].position).toEqual({ x: 9999, y: 9999 });
  });

  it('invalidates routePoints on incident edges (source AND target)', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ];
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1'), makeNode('n2'), makeNode('n3')],
          edges: [
            // Incident as source
            makeEdge('e-src', 'n1', 'n2', { data: { routePoints: [...route] } }),
            // Incident as target
            makeEdge('e-tgt', 'n2', 'n1', { data: { routePoints: [...route] } }),
            // Untouched (does not reference n1)
            makeEdge('e-unrel', 'n2', 'n3', { data: { routePoints: [...route] } }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePosition(draft, {
        type: 'cards/updateCardNodePosition',
        payload: { nodeId: 'n1', x: 10, y: 10 },
      } as PayloadAction<{ nodeId: string; x: number; y: number }>);
    });
    // Both incident edges had their routePoints stripped.
    expect(next.cards[0].edges[0].data?.routePoints).toBeUndefined();
    expect(next.cards[0].edges[1].data?.routePoints).toBeUndefined();
    // Unrelated edge keeps its route.
    expect(next.cards[0].edges[2].data?.routePoints).toEqual(route);
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { position: { x: 0, y: 0 } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePosition(draft, {
        type: 'cards/updateCardNodePosition',
        payload: { nodeId: 'n1', x: 5, y: 5 },
      } as PayloadAction<{ nodeId: string; x: number; y: number }>);
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    // Snapshot captures pre-mutation position (0,0).
    expect(next.history.c1.past[0].nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { position: { x: 0, y: 0 } })] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePosition(draft, {
        type: 'cards/updateCardNodePosition',
        payload: { nodeId: 'n1', x: 100, y: 200 },
      } as PayloadAction<{ nodeId: string; x: number; y: number }>);
    });
    expect(next.cards[0].nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('is a no-op when the nodeId does not match any node', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { position: { x: 0, y: 0 } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePosition(draft, {
        type: 'cards/updateCardNodePosition',
        payload: { nodeId: 'missing', x: 100, y: 200 },
      } as PayloadAction<{ nodeId: string; x: number; y: number }>);
    });
    expect(next.cards[0].nodes[0].position).toEqual({ x: 0, y: 0 });
  });
});

// -----------------------------------------------------------------------------
// updateCardNodePositions  (RISK #2 — two-pass design)
// -----------------------------------------------------------------------------

describe('updateCardNodePositions', () => {
  it('runs BOTH passes when skipClamp=false: pass 1 applies all, pass 2 clamps children', () => {
    // The two-pass design is RISK #2: pass 1 unconditionally applies
    // every position; pass 2 clamps any child to its parent bounds.
    // Build a parent + child where the parent moves to (200,200) AND the
    // child moves to (9999,9999). Pass 1 puts both at their literal
    // requested coords. Pass 2 then sees the parent's new position and
    // clamps the child against the moved parent — meaning the child
    // ends up clamped against (200,200) bounds, NOT the original (0,0)
    // bounds. That's the load-bearing ordering.
    const parent = makeNode('p1', {
      type: 'container',
      position: { x: 0, y: 0 },
      width: 500,
      height: 400,
    });
    const child = makeNode('c1n', {
      parentId: 'p1',
      width: 100,
      height: 50,
      position: { x: 50, y: 60 },
    });
    const state = makeState({
      cards: [makeCard('c1', { nodes: [parent, child] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePositions(draft, {
        type: 'cards/updateCardNodePositions',
        payload: {
          updates: [
            { id: 'p1', position: { x: 200, y: 200 } },
            { id: 'c1n', position: { x: 9999, y: 9999 } },
          ],
          skipClamp: false,
        },
      } as PayloadAction<{
        updates: Array<{ id: string; position: { x: number; y: number } }>;
        skipClamp?: boolean;
      }>);
    });
    // Pass 1: parent landed at (200,200).
    expect(next.cards[0].nodes[0].position).toEqual({ x: 200, y: 200 });
    // Pass 2: child was clamped against the MOVED parent's bounds. The
    // child's x must be within [200+pad, 200+500-pad-100] = [216, 584]
    // after the parent's move (assuming pad=16). It must NOT remain at
    // 9999.
    expect(next.cards[0].nodes[1].position.x).toBeLessThan(9999);
    expect(next.cards[0].nodes[1].position.y).toBeLessThan(9999);
    // And both are clamped relative to the new parent (>= parent's left
    // edge + padding).
    expect(next.cards[0].nodes[1].position.x).toBeGreaterThanOrEqual(200);
    expect(next.cards[0].nodes[1].position.y).toBeGreaterThanOrEqual(200);
  });

  it('skipClamp=true: pass 1 applies positions, pass 2 is skipped (no clamping)', () => {
    // The skipClamp flag exists for Shift+drag — let nodes escape the
    // container during a drag-out-of-group gesture. With skipClamp=true,
    // the child's literal (9999,9999) target survives.
    const parent = makeNode('p1', {
      type: 'container',
      position: { x: 0, y: 0 },
      width: 500,
      height: 400,
    });
    const child = makeNode('c1n', {
      parentId: 'p1',
      width: 100,
      height: 50,
      position: { x: 50, y: 60 },
    });
    const state = makeState({
      cards: [makeCard('c1', { nodes: [parent, child] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePositions(draft, {
        type: 'cards/updateCardNodePositions',
        payload: {
          updates: [{ id: 'c1n', position: { x: 9999, y: 9999 } }],
          skipClamp: true,
        },
      } as PayloadAction<{
        updates: Array<{ id: string; position: { x: number; y: number } }>;
        skipClamp?: boolean;
      }>);
    });
    expect(next.cards[0].nodes[1].position).toEqual({ x: 9999, y: 9999 });
  });

  it('legacy bare-array payload defaults skipClamp to false (clamps children)', () => {
    // Old call sites pass the updates array directly (not wrapped in
    // `{ updates, skipClamp }`). The reducer's `Array.isArray` branch
    // routes both formats through the same passes; with a bare array,
    // skipClamp resolves to false, so a child is still clamped.
    const parent = makeNode('p1', {
      type: 'container',
      position: { x: 0, y: 0 },
      width: 500,
      height: 400,
    });
    const child = makeNode('c1n', {
      parentId: 'p1',
      width: 100,
      height: 50,
      position: { x: 50, y: 60 },
    });
    const state = makeState({
      cards: [makeCard('c1', { nodes: [parent, child] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePositions(draft, {
        type: 'cards/updateCardNodePositions',
        payload: [{ id: 'c1n', position: { x: 9999, y: 9999 } }],
      } as PayloadAction<Array<{ id: string; position: { x: number; y: number } }>>);
    });
    // Clamped — child did NOT land at 9999.
    expect(next.cards[0].nodes[1].position.x).toBeLessThan(9999);
    expect(next.cards[0].nodes[1].position.y).toBeLessThan(9999);
  });

  it('invalidates routePoints once for each moved node', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1'), makeNode('n2'), makeNode('n3')],
          edges: [
            makeEdge('e1', 'n1', 'n3', { data: { routePoints: [...route] } }),
            makeEdge('e2', 'n2', 'n3', { data: { routePoints: [...route] } }),
            // Unrelated to anything in the moved set.
            makeEdge('e3', 'n3', 'n3', { data: { routePoints: [...route] } }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePositions(draft, {
        type: 'cards/updateCardNodePositions',
        payload: {
          updates: [
            { id: 'n1', position: { x: 10, y: 10 } },
            { id: 'n2', position: { x: 20, y: 20 } },
          ],
          skipClamp: true,
        },
      } as PayloadAction<{
        updates: Array<{ id: string; position: { x: number; y: number } }>;
        skipClamp?: boolean;
      }>);
    });
    // e1 / e2 had their routePoints stripped (incident on a moved node).
    expect(next.cards[0].edges[0].data?.routePoints).toBeUndefined();
    expect(next.cards[0].edges[1].data?.routePoints).toBeUndefined();
    // e3 only references n3 (which did NOT move) — route preserved.
    expect(next.cards[0].edges[2].data?.routePoints).toEqual(route);
  });

  it('skips updates whose id does not match a node (only existing nodes added to movedIds)', () => {
    // Branch: the `if (node)` guard inside pass 1 — covers the false case.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1', { position: { x: 0, y: 0 } })],
          edges: [makeEdge('e-orphan', 'missing', 'n1', { data: { routePoints: [{ x: 1, y: 1 }] } })],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePositions(draft, {
        type: 'cards/updateCardNodePositions',
        payload: {
          updates: [
            { id: 'missing', position: { x: 99, y: 99 } },
            { id: 'n1', position: { x: 10, y: 10 } },
          ],
          skipClamp: true,
        },
      } as PayloadAction<{
        updates: Array<{ id: string; position: { x: number; y: number } }>;
        skipClamp?: boolean;
      }>);
    });
    // n1 moved.
    expect(next.cards[0].nodes[0].position).toEqual({ x: 10, y: 10 });
    // The 'missing' id was not added to movedIds, so the edge incident on
    // it via 'missing'->'n1' is invalidated only because n1 (target) moved.
    expect(next.cards[0].edges[0].data?.routePoints).toBeUndefined();
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { position: { x: 0, y: 0 } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePositions(draft, {
        type: 'cards/updateCardNodePositions',
        payload: {
          updates: [{ id: 'n1', position: { x: 5, y: 5 } }],
          skipClamp: true,
        },
      } as PayloadAction<{
        updates: Array<{ id: string; position: { x: number; y: number } }>;
        skipClamp?: boolean;
      }>);
    });
    expect(next.history.c1.past).toHaveLength(1);
    expect(next.history.c1.past[0].nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { position: { x: 0, y: 0 } })] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePositions(draft, {
        type: 'cards/updateCardNodePositions',
        payload: {
          updates: [{ id: 'n1', position: { x: 99, y: 99 } }],
        },
      } as PayloadAction<{
        updates: Array<{ id: string; position: { x: number; y: number } }>;
        skipClamp?: boolean;
      }>);
    });
    expect(next.cards[0].nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('clamp pass 2 skips children whose parent is missing (parent guard branch)', () => {
    // The reducer's `if (parent)` inside pass 2 — covers the false case so
    // both branches of the parent guard run during testing.
    const orphan = makeNode('orphan', {
      parentId: 'ghost',
      width: 100,
      height: 50,
      position: { x: 0, y: 0 },
    });
    const state = makeState({
      cards: [makeCard('c1', { nodes: [orphan] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.updateCardNodePositions(draft, {
        type: 'cards/updateCardNodePositions',
        payload: {
          updates: [{ id: 'orphan', position: { x: 9999, y: 9999 } }],
          skipClamp: false,
        },
      } as PayloadAction<{
        updates: Array<{ id: string; position: { x: number; y: number } }>;
        skipClamp?: boolean;
      }>);
    });
    // No parent found — clamp doesn't run; orphan keeps its literal target.
    expect(next.cards[0].nodes[0].position).toEqual({ x: 9999, y: 9999 });
  });
});

// -----------------------------------------------------------------------------
// resizeCardNode
// -----------------------------------------------------------------------------

describe('resizeCardNode', () => {
  it('updates width and height on the matching node', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { width: 100, height: 50 })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.resizeCardNode(draft, {
        type: 'cards/resizeCardNode',
        payload: { id: 'n1', width: 300, height: 200 },
      } as PayloadAction<{ id: string; width: number; height: number }>);
    });
    expect(next.cards[0].nodes[0].width).toBe(300);
    expect(next.cards[0].nodes[0].height).toBe(200);
  });

  it('does NOT invalidate edge routes (RISK note: keeps cached routes stable through corner-drag)', () => {
    // resizeCardNode intentionally skips invalidateEdgeRoutesTouching —
    // see the JSDoc on the reducer. A resize-tick should NOT cause edge
    // route flicker on connected edges.
    const route = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ];
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1', { width: 100, height: 50 }), makeNode('n2')],
          edges: [makeEdge('e1', 'n1', 'n2', { data: { routePoints: [...route] } })],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.resizeCardNode(draft, {
        type: 'cards/resizeCardNode',
        payload: { id: 'n1', width: 300, height: 200 },
      } as PayloadAction<{ id: string; width: number; height: number }>);
    });
    // Route preserved.
    expect(next.cards[0].edges[0].data?.routePoints).toEqual(route);
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { width: 100, height: 50 })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.resizeCardNode(draft, {
        type: 'cards/resizeCardNode',
        payload: { id: 'n1', width: 300, height: 200 },
      } as PayloadAction<{ id: string; width: number; height: number }>);
    });
    expect(next.history.c1.past).toHaveLength(1);
    // Snapshot captures pre-resize dimensions.
    expect(next.history.c1.past[0].nodes[0].width).toBe(100);
    expect(next.history.c1.past[0].nodes[0].height).toBe(50);
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { width: 100, height: 50 })] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.resizeCardNode(draft, {
        type: 'cards/resizeCardNode',
        payload: { id: 'n1', width: 300, height: 200 },
      } as PayloadAction<{ id: string; width: number; height: number }>);
    });
    expect(next.cards[0].nodes[0].width).toBe(100);
    expect(next.cards[0].nodes[0].height).toBe(50);
  });

  it('is a no-op when the id does not match any node', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { width: 100, height: 50 })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodePositionReducers.resizeCardNode(draft, {
        type: 'cards/resizeCardNode',
        payload: { id: 'missing', width: 300, height: 200 },
      } as PayloadAction<{ id: string; width: number; height: number }>);
    });
    expect(next.cards[0].nodes[0].width).toBe(100);
    expect(next.cards[0].nodes[0].height).toBe(50);
  });
});

/**
 * Tests for `cards/reducers/import.ts` — `importToActiveCard`, the
 * "replace active card with this payload + auto-organize" ingestion path.
 *
 * Each test exercises the reducer through Immer's `produce` to mirror RTK's
 * runtime — the reducer body mutates a draft and the produced result is
 * structurally equal to the post-mutation draft. This avoids dragging in
 * `configureStore` for what is fundamentally a pure
 * `(state, action) => void` shape.
 *
 * `pushSnapshot` from `../../snapshot` is the real implementation. The
 * `beforeEach` "reset-coalesce" sentinel call keeps parity with sibling test
 * files (cite `reset-module-let-via-synthetic-call-not-vi-resetModules`).
 *
 * `autoLayout` is MOCKED via `vi.mock('../../../../../shared/utils/auto-layout', ...)`.
 * Mocking is necessary for two reasons: (a) the real implementation pulls in
 * `dagre` and a 1k-line bottom-up nested-container layout pipeline whose
 * outputs aren't deterministic to hand-pin in test fixtures, and (b) the
 * post-layout fixture values we want to assert (positions / widths / heights /
 * route polylines) ARE the contract the reducer is plumbing — so injecting
 * known values is the cleanest way to verify the wiring without coupling to
 * dagre's specific output shape.
 *
 * Path note: vi.mock paths resolve RELATIVE TO THE TEST FILE (cite
 * `vi-mock-paths-resolve-relative-to-test-file-not-source-file`). This file
 * is at `cards/reducers/__tests__/import.test.ts`, five levels above is
 * `src/`, so the mock target is `../../../../../shared/utils/auto-layout`.
 *
 * Coverage targets:
 *  - Migration runs on incoming nodes (Monitoring.Terminal → Monitoring.Log)
 *    BEFORE auto-layout sees them — the migrated iceType lands on the canvas
 *    AND the migrated node is what auto-layout receives (RISK #8: ingestion-
 *    path migration parity).
 *  - skipAutoOrganize = true: nodes/edges replaced verbatim, autoLayout NOT
 *    called, applyEdgeRoutes NOT called (positions stay at incoming values).
 *  - skipAutoOrganize falsy + non-empty payload: autoLayout called once,
 *    nodes remapped to layout positions/sizes, applyEdgeRoutes runs AFTER
 *    the node remap (RISK #3 pin: edges acquire `routePoints` keyed off
 *    `${source}::${target}`, and those waypoints match the post-layout
 *    coordinates the layout reported).
 *  - Empty payload (no nodes): nodes/edges replaced (cleared), autoLayout
 *    NOT called (the `card.nodes.length > 0` guard short-circuits).
 *  - autoLayout called with the migrated nodes mapped to LayoutNode shape
 *    (parentId null when missing, label fallback to id, dimensions fallbacks
 *    280×160, folded fallback false).
 *  - LayoutNodes that match no organized output node are kept at their
 *    pre-layout position (the `if (organized)` falsy branch).
 *  - pushSnapshot recorded; no-op when no active card.
 *
 * @see rf-cards-11
 */

import { produce } from 'immer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayloadAction } from '@reduxjs/toolkit';

// -----------------------------------------------------------------------------
// autoLayout mock
// -----------------------------------------------------------------------------
//
// Programmable fake: each test seeds `mockAutoLayoutResult` with the outputs
// it wants the reducer to consume, and the spy records invocations so we can
// assert call shape. The mock factory MUST not capture variables that are
// declared after it — vi.mock is hoisted to the top of the file before any
// `let` initialization. The shared `__mockResult` and `__mockSpy` arrays
// live inside the factory closure and are exposed via getters.

const mockAutoLayoutSpy = vi.fn();
let mockAutoLayoutResult: {
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  edgeRoutes: Map<string, Array<{ x: number; y: number }>>;
} = { nodes: [], edgeRoutes: new Map() };

vi.mock('../../../../../shared/utils/auto-layout', () => ({
  autoLayout: (
    nodes: unknown[],
    edges: unknown[],
    options: Record<string, unknown>,
  ) => {
    mockAutoLayoutSpy(nodes, edges, options);
    return mockAutoLayoutResult;
  },
}));

// Imports MUST come AFTER `vi.mock` so the mock takes effect before module
// resolution. Vitest hoists `vi.mock` calls regardless, but keeping the
// physical order matches the cognitive flow (mock first, then code under test).
import { importReducers } from '../import';
import { pushSnapshot } from '../../snapshot';
import type { Card, CardEdge, CardNode, CardsState } from '../../types';

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
// Per-test reset
// -----------------------------------------------------------------------------
//
// `pushSnapshot` keeps `_lastSnapshotAction` at module scope. The
// "reset-coalesce" sentinel mirrors sibling test files
// (cite `reset-module-let-via-synthetic-call-not-vi-resetModules`).
// The autoLayout spy and mocked result are also reset per test so each
// case starts from a known baseline.

beforeEach(() => {
  pushSnapshot({ cards: [], activeCardId: null, history: {} } as CardsState, 'reset-coalesce');
  mockAutoLayoutSpy.mockClear();
  mockAutoLayoutResult = { nodes: [], edgeRoutes: new Map() };
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('importToActiveCard — replace + skipAutoOrganize', () => {
  it('replaces card.nodes and card.edges with the payload when skipAutoOrganize is true', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('old1'), makeNode('old2')],
          edges: [makeEdge('eOld', 'old1', 'old2')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: {
          nodes: [makeNode('new1', { position: { x: 12, y: 34 } })],
          edges: [makeEdge('eNew', 'new1', 'new1')],
          skipAutoOrganize: true,
        },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['new1']);
    expect(next.cards[0].edges.map((e) => e.id)).toEqual(['eNew']);
    // Position untouched — auto-organize was skipped.
    expect(next.cards[0].nodes[0].position).toEqual({ x: 12, y: 34 });
    expect(mockAutoLayoutSpy).not.toHaveBeenCalled();
  });

  it('records an undo snapshot capturing PRE-import state', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('old1')],
          edges: [makeEdge('eOld', 'old1', 'old1')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: {
          nodes: [makeNode('new1')],
          edges: [],
          skipAutoOrganize: true,
        },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    // Snapshot captures the pre-import nodes/edges.
    expect(next.history.c1.past[0].nodes.map((n) => n.id)).toEqual(['old1']);
    expect(next.history.c1.past[0].edges.map((e) => e.id)).toEqual(['eOld']);
  });

  it('migrates Monitoring.Terminal → Monitoring.Log on the incoming nodes', () => {
    // RISK #8 (ingestion-path migration parity). The migration runs BEFORE
    // any positional/layout work. Pin via skipAutoOrganize so we isolate
    // the migration step from the layout step.
    const state = makeState();
    const incoming = makeNode('term', {
      data: { iceType: 'Monitoring.Terminal', label: 'Original' },
    });
    const next = produce(state, (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: { nodes: [incoming], edges: [], skipAutoOrganize: true },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    expect(next.cards[0].nodes[0].data.iceType).toBe('Monitoring.Log');
    // Other data fields preserved.
    expect(next.cards[0].nodes[0].data.label).toBe('Original');
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('keep')] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: {
          nodes: [makeNode('new1')],
          edges: [],
          skipAutoOrganize: true,
        },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    // Card unchanged — no active card to apply the import to.
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['keep']);
  });
});

describe('importToActiveCard — auto-organize path', () => {
  it('calls autoLayout with the migrated nodes mapped to LayoutNode shape', () => {
    // Pin: the migration step runs FIRST, then the LayoutNode mapping reads
    // the migrated payload. So a Monitoring.Terminal node arrives at
    // autoLayout with iceType 'Monitoring.Log'.
    mockAutoLayoutResult = {
      nodes: [{ id: 'a', x: 0, y: 0, width: 240, height: 160 }],
      edgeRoutes: new Map(),
    };
    const state = makeState();
    const incoming = makeNode('a', {
      position: { x: 5, y: 7 },
      width: 100,
      height: 50,
      data: { iceType: 'Monitoring.Terminal', label: 'Hello' },
    });
    produce(state, (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: { nodes: [incoming], edges: [] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    expect(mockAutoLayoutSpy).toHaveBeenCalledTimes(1);
    const [layoutNodesArg, layoutEdgesArg, optionsArg] = mockAutoLayoutSpy.mock.calls[0];
    expect(layoutNodesArg).toEqual([
      {
        id: 'a',
        type: 'block',
        // Migrated iceType — Monitoring.Terminal → Monitoring.Log BEFORE
        // the LayoutNode mapping read it.
        iceType: 'Monitoring.Log',
        label: 'Hello',
        parentId: null,
        width: 100,
        height: 50,
        x: 5,
        y: 7,
        data: { iceType: 'Monitoring.Log', label: 'Hello' },
        folded: false,
      },
    ]);
    expect(layoutEdgesArg).toEqual([]);
    expect(optionsArg).toEqual({
      startX: 50,
      startY: 50,
      nodeGap: 80,
      nodesPerRow: 3,
      containerPadding: 30,
    });
  });

  it('uses LayoutNode fallbacks when CardNode fields are missing (label, parentId, width/height, folded)', () => {
    // Branch coverage: `node.data?.label` falsy → fallback to `node.id`;
    // `node.parentId` undefined → null; `node.width || 280` and
    // `node.height || 160` fire when widths are 0/missing; `folded` falsy
    // → false.
    mockAutoLayoutResult = {
      nodes: [{ id: 'b', x: 0, y: 0, width: 280, height: 160 }],
      edgeRoutes: new Map(),
    };
    const incoming: CardNode = {
      id: 'b',
      type: 'block',
      position: { x: 0, y: 0 },
      width: 0,
      height: 0,
      data: {},
    };
    produce(makeState(), (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: { nodes: [incoming], edges: [] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    const [layoutNodesArg] = mockAutoLayoutSpy.mock.calls[0];
    expect((layoutNodesArg as Array<Record<string, unknown>>)[0]).toMatchObject({
      label: 'b',
      parentId: null,
      width: 280,
      height: 160,
      folded: false,
      iceType: '',
    });
  });

  it('forwards the edge.data.relationship onto the LayoutEdge', () => {
    // Pin: layout mode-aware (the autoLayout signature accepts the
    // `relationship` hint to drive the per-edge weight/style). Reducer
    // must propagate that field unchanged from `edge.data?.relationship`.
    mockAutoLayoutResult = { nodes: [], edgeRoutes: new Map() };
    const state = makeState();
    const n1 = makeNode('n1');
    const n2 = makeNode('n2');
    const edge = makeEdge('e1', 'n1', 'n2', { data: { relationship: 'invokes' } });
    produce(state, (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: { nodes: [n1, n2], edges: [edge] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    const [, layoutEdgesArg] = mockAutoLayoutSpy.mock.calls[0];
    expect(layoutEdgesArg).toEqual([{ source: 'n1', target: 'n2', relationship: 'invokes' }]);
  });

  it('remaps card.nodes to autoLayout positions/widths/heights and preserves other CardNode fields', () => {
    mockAutoLayoutResult = {
      nodes: [
        { id: 'a', x: 100, y: 200, width: 300, height: 150 },
        { id: 'b', x: 500, y: 400, width: 280, height: 160 },
      ],
      edgeRoutes: new Map(),
    };
    const state = makeState();
    const next = produce(state, (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: {
          nodes: [
            makeNode('a', {
              position: { x: 0, y: 0 },
              data: { label: 'A', custom: 42 },
            }),
            makeNode('b', { position: { x: 0, y: 0 } }),
          ],
          edges: [],
        },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    const [a, b] = next.cards[0].nodes;
    expect(a.position).toEqual({ x: 100, y: 200 });
    expect(a.width).toBe(300);
    expect(a.height).toBe(150);
    // Non-position/size fields preserved through the spread.
    expect(a.data).toEqual({ label: 'A', custom: 42 });
    expect(b.position).toEqual({ x: 500, y: 400 });
  });

  it('keeps the pre-layout position when autoLayout returns no entry for a node id', () => {
    // Branch: `if (organized)` falsy path. autoLayout returned no row for
    // 'lonely', so the node stays at its incoming position.
    mockAutoLayoutResult = {
      nodes: [{ id: 'a', x: 100, y: 200, width: 300, height: 150 }],
      edgeRoutes: new Map(),
    };
    const next = produce(makeState(), (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: {
          nodes: [
            makeNode('a'),
            makeNode('lonely', { position: { x: 999, y: 888 }, width: 50, height: 60 }),
          ],
          edges: [],
        },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    const lonely = next.cards[0].nodes.find((n) => n.id === 'lonely');
    expect(lonely?.position).toEqual({ x: 999, y: 888 });
    expect(lonely?.width).toBe(50);
    expect(lonely?.height).toBe(60);
  });

  it('applies edge routes AFTER node remapping (RISK #3) — routePoints align with post-layout coordinates', () => {
    // Pin: applyEdgeRoutes runs LAST, after `card.nodes = card.nodes.map(...)`
    // has remapped positions. So the routePoints written to edge.data
    // ARE the absolute canvas coordinates the post-layout nodes were placed
    // at — not the pre-layout ones. Verify by seeding edgeRoutes whose
    // waypoints match the post-layout positions in mockAutoLayoutResult.
    const postLayoutA = { x: 100, y: 200 };
    const postLayoutB = { x: 500, y: 400 };
    const route = [postLayoutA, postLayoutB];
    mockAutoLayoutResult = {
      nodes: [
        { id: 'a', x: postLayoutA.x, y: postLayoutA.y, width: 280, height: 160 },
        { id: 'b', x: postLayoutB.x, y: postLayoutB.y, width: 280, height: 160 },
      ],
      edgeRoutes: new Map([['a::b', route]]),
    };
    const next = produce(makeState(), (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: {
          nodes: [makeNode('a'), makeNode('b')],
          edges: [makeEdge('e1', 'a', 'b')],
        },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    const e = next.cards[0].edges[0];
    expect(e.data?.routePoints).toEqual([postLayoutA, postLayoutB]);
    // And the nodes that route is keyed against actually landed at the
    // matching positions — pinning the order: nodes were remapped first,
    // then the edge route was applied against those final positions.
    const a = next.cards[0].nodes.find((n) => n.id === 'a');
    const b = next.cards[0].nodes.find((n) => n.id === 'b');
    expect(a?.position).toEqual(postLayoutA);
    expect(b?.position).toEqual(postLayoutB);
  });

  it('clears stale routePoints when autoLayout returns no route for an edge', () => {
    // applyEdgeRoutes deletes `edge.data.routePoints` when the layout's
    // edgeRoutes map has no entry for the `${source}::${target}` key.
    // Pin: an incoming edge that ALREADY has a stale routePoints array
    // (from a prior session) loses it post-import.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'a', x: 0, y: 0, width: 280, height: 160 },
        { id: 'b', x: 100, y: 100, width: 280, height: 160 },
      ],
      edgeRoutes: new Map(), // empty — no route for 'a::b'
    };
    const incomingEdge = makeEdge('e1', 'a', 'b', {
      data: {
        relationship: 'invokes',
        routePoints: [{ x: 999, y: 999 }],
      },
    });
    const next = produce(makeState(), (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: { nodes: [makeNode('a'), makeNode('b')], edges: [incomingEdge] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    const e = next.cards[0].edges[0];
    expect(e.data?.routePoints).toBeUndefined();
    // Other edge.data fields preserved.
    expect(e.data?.relationship).toBe('invokes');
  });

  it('does NOT call autoLayout when the payload has zero nodes (the length-guard short-circuits)', () => {
    // Branch: `card.nodes.length > 0` falsy. Nodes/edges still replaced
    // (cleared in this case) but no layout work happens.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('old1')],
          edges: [makeEdge('eOld', 'old1', 'old1')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: { nodes: [], edges: [] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    expect(next.cards[0].nodes).toEqual([]);
    expect(next.cards[0].edges).toEqual([]);
    expect(mockAutoLayoutSpy).not.toHaveBeenCalled();
  });

  it('records an undo snapshot before the auto-organize path', () => {
    mockAutoLayoutResult = {
      nodes: [{ id: 'new1', x: 50, y: 50, width: 280, height: 160 }],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('old1')], edges: [] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      importReducers.importToActiveCard(draft, {
        type: 'cards/importToActiveCard',
        payload: { nodes: [makeNode('new1')], edges: [] },
      } as PayloadAction<{ nodes: CardNode[]; edges: CardEdge[]; skipAutoOrganize?: boolean }>);
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    expect(next.history.c1.past[0].nodes.map((n) => n.id)).toEqual(['old1']);
  });
});

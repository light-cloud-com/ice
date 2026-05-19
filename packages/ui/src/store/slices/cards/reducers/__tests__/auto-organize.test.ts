/**
 * Tests for `cards/reducers/auto-organize.ts` — `autoOrganizeCard`, the
 * "re-run autoLayout over the active card" reducer with master and
 * per-container modes.
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
 * `autoLayout` is MOCKED via `vi.mock('../../../../../shared/utils/auto-layout', ...)`
 * with the let-closure pattern (cite
 * `vi-mock-let-closure-for-per-test-result-staging`): each test seeds a
 * module-scoped `mockAutoLayoutResult` with the `{nodes, edgeRoutes}` shape
 * it wants the reducer to consume, and a separate `vi.fn()` spy records the
 * invocation arguments for shape assertions.
 *
 * Path note: `vi.mock` paths resolve RELATIVE TO THE TEST FILE (cite
 * `vi-mock-paths-resolve-relative-to-test-file-not-source-file`). Source is
 * at `cards/reducers/auto-organize.ts` (4 ups → `src/`), test is at
 * `cards/reducers/__tests__/auto-organize.test.ts` (5 ups → `src/`), so the
 * mock target is `../../../../../shared/utils/auto-layout`.
 *
 * `isContainer` from `../../../../../config/containment-rules` is the REAL
 * implementation — it's a pure lookup with no side effects, and the
 * deterministic container iceTypes (`Group.Custom`, `Network.VPC`) make
 * fixture setup straightforward without mocking.
 *
 * Coverage targets:
 *  - Empty card / no active card → no-op (pushSnapshot not called, layout
 *    not called).
 *  - parentId cleanup pass: orphaned parentId references (pointing at
 *    non-container nodes) are stripped before the LayoutNode mapping reads
 *    them. Container detection covers BOTH `type: 'container'` AND
 *    `iceType` from `isContainer(...)` (e.g. `Network.VPC`).
 *  - autoLayout shape: layoutNodes mapped with all CardNode fallbacks
 *    (label fallback to id, parentId null, width 280 / height 160 fallbacks,
 *    folded false), layoutEdges propagate `relationship`, options carry the
 *    direction/layout/zoom payload + LAYOUT_NODE_SEP gap.
 *  - Default direction/layout (`'vertical'`/`'flow'`) when payload is
 *    undefined or missing fields.
 *  - Container-mode branch: layout runs ONCE over all nodes, but only the
 *    container + its descendants are remapped — siblings outside the
 *    container keep their original positions. Container itself keeps its
 *    position, gains new width/height. Descendants are translated by
 *    `(oldOrigin - newOrigin)` so they stay anchored.
 *  - Container-mode: returns early when the containerId isn't in the
 *    organized output OR the original card.
 *  - Per-container branch: applyEdgeRoutes is NOT called.
 *  - Master branch: layout runs over all nodes and ALL nodes are remapped.
 *  - Master branch + centroid drift > 1: nodes shifted AND edgeRoutes
 *    shifted by (dx, dy) BEFORE applyEdgeRoutes runs (RISK #4 pin —
 *    routePoints align with post-shift node positions).
 *  - Master branch + centroid drift <= 1: no shift applied.
 *  - applyEdgeRoutes only fires in master mode.
 *  - Folded nodes preserve their original height.
 *  - Nodes with no organized output stay at pre-layout positions (master
 *    branch's `if (organized)` falsy path).
 *
 * @see rf-cards-12
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
// `let` initialization. The shared `mockAutoLayoutResult` is read at
// invocation time inside the factory's returned function, NOT at mock
// registration time, so the factory works despite hoisting.

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
    // Deep-clone the spy args because the reducer is invoked from inside
    // an Immer `produce(...)` callback — the LayoutNode array is built
    // by mapping over the draft, and references to the draft proxies
    // would be revoked once `produce` returns. JSON-clone is enough for
    // this fixture (no Date/RegExp/etc.).
    mockAutoLayoutSpy(
      JSON.parse(JSON.stringify(nodes)),
      JSON.parse(JSON.stringify(edges)),
      JSON.parse(JSON.stringify(options)),
    );
    return mockAutoLayoutResult;
  },
}));

// Imports MUST come AFTER `vi.mock` so the mock takes effect before module
// resolution. Vitest hoists `vi.mock` calls regardless, but keeping the
// physical order matches the cognitive flow (mock first, then code under test).
import { autoOrganizeReducers } from '../auto-organize';
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

// Synthetic action constructor: caller supplies the payload, we forge the
// `type` field so the PayloadAction shape is satisfied.
function autoOrganizeAction(
  payload?: {
    direction?: 'vertical' | 'horizontal';
    layout?: 'flow' | 'grid' | 'circular';
    containerId?: string;
    zoom?: number;
  },
): PayloadAction<
  | {
      direction?: 'vertical' | 'horizontal';
      layout?: 'flow' | 'grid' | 'circular';
      containerId?: string;
      zoom?: number;
    }
  | undefined
> {
  return { type: 'cards/autoOrganizeCard', payload } as PayloadAction<
    | {
        direction?: 'vertical' | 'horizontal';
        layout?: 'flow' | 'grid' | 'circular';
        containerId?: string;
        zoom?: number;
      }
    | undefined
  >;
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

describe('autoOrganizeCard — short-circuits', () => {
  it('is a no-op when the active card has zero nodes', () => {
    const state = makeState({ cards: [makeCard('c1', { nodes: [] })] });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    expect(mockAutoLayoutSpy).not.toHaveBeenCalled();
    // No snapshot recorded because the function early-returns before pushSnapshot.
    expect(next.history.c1).toBeUndefined();
  });

  it('is a no-op when there is no active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('a')] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    expect(mockAutoLayoutSpy).not.toHaveBeenCalled();
    expect(next.cards[0].nodes[0].position).toEqual({ x: 0, y: 0 });
  });
});

describe('autoOrganizeCard — parentId cleanup pass', () => {
  it('strips parentId when the parent is not a container (block parent)', () => {
    // Pin: a node whose parentId points at a `type: 'block'` non-container
    // gets its parentId DELETED before the LayoutNode mapping. The
    // LayoutNode that autoLayout sees has parentId=null, so the layout
    // pass treats the node as top-level.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'parent', x: 0, y: 0, width: 240, height: 56 },
        { id: 'child', x: 0, y: 0, width: 240, height: 56 },
      ],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('parent'), // type: 'block', NOT a container
            makeNode('child', { parentId: 'parent' }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    // Pre-layout: child.parentId was deleted.
    expect(next.cards[0].nodes.find((n) => n.id === 'child')?.parentId).toBeUndefined();
    // The LayoutNode autoLayout received had parentId=null.
    const [layoutNodesArg] = mockAutoLayoutSpy.mock.calls[0];
    const childLayoutNode = (layoutNodesArg as Array<Record<string, unknown>>).find(
      (n) => n.id === 'child',
    );
    expect(childLayoutNode?.parentId).toBeNull();
  });

  it('keeps parentId when the parent is type "container"', () => {
    mockAutoLayoutResult = {
      nodes: [
        { id: 'group', x: 0, y: 0, width: 600, height: 400 },
        { id: 'child', x: 50, y: 50, width: 240, height: 56 },
      ],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('group', { type: 'container', data: { iceType: 'Group.Custom' } }),
            makeNode('child', { parentId: 'group' }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    expect(next.cards[0].nodes.find((n) => n.id === 'child')?.parentId).toBe('group');
  });

  it('keeps parentId when the parent has a container iceType (resource-typed Network.VPC)', () => {
    // Pin: this is the load-bearing case from the source comment.
    // `Network.VPC` IS a container by iceType but stored as `type: 'resource'`.
    // Without the `isContainer(iceType)` check, the cleanup pass would
    // strip the children's parentId.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'vpc', x: 0, y: 0, width: 800, height: 600 },
        { id: 'subnet', x: 50, y: 50, width: 600, height: 400 },
      ],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('vpc', { type: 'resource', data: { iceType: 'Network.VPC' } }),
            makeNode('subnet', { parentId: 'vpc', data: { iceType: 'Network.Subnet' } }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    expect(next.cards[0].nodes.find((n) => n.id === 'subnet')?.parentId).toBe('vpc');
  });
});

describe('autoOrganizeCard — autoLayout call shape', () => {
  it('passes the LayoutNode-mapped nodes, LayoutEdge-mapped edges, and option payload', () => {
    mockAutoLayoutResult = {
      nodes: [{ id: 'a', x: 0, y: 0, width: 240, height: 56 }],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', {
              position: { x: 5, y: 7 },
              width: 100,
              height: 50,
              data: { iceType: 'Compute.Function', label: 'Hello', folded: true },
            }),
          ],
          edges: [makeEdge('e1', 'a', 'a', { data: { relationship: 'invokes' } })],
        }),
      ],
    });
    produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(
        draft,
        autoOrganizeAction({ direction: 'horizontal', layout: 'grid', zoom: 1.5 }),
      );
    });
    expect(mockAutoLayoutSpy).toHaveBeenCalledTimes(1);
    const [layoutNodesArg, layoutEdgesArg, optionsArg] = mockAutoLayoutSpy.mock.calls[0];
    expect(layoutNodesArg).toEqual([
      {
        id: 'a',
        type: 'block',
        iceType: 'Compute.Function',
        label: 'Hello',
        parentId: null,
        width: 100,
        height: 50,
        x: 5,
        y: 7,
        data: { iceType: 'Compute.Function', label: 'Hello', folded: true },
        folded: true,
      },
    ]);
    expect(layoutEdgesArg).toEqual([{ source: 'a', target: 'a', relationship: 'invokes' }]);
    expect(optionsArg).toEqual({
      startX: 50,
      startY: 50,
      // LAYOUT_NODE_SEP is 40 (must be a multiple of LAYOUT_GRID_STEP).
      nodeGap: 40,
      nodesPerRow: 3,
      containerPadding: 30,
      direction: 'horizontal',
      layout: 'grid',
      zoom: 1.5,
    });
  });

  it('uses LayoutNode fallbacks when CardNode fields are missing (label, parentId, width/height, folded, iceType)', () => {
    mockAutoLayoutResult = {
      nodes: [{ id: 'b', x: 0, y: 0, width: 280, height: 160 }],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            {
              id: 'b',
              type: 'block',
              position: { x: 0, y: 0 },
              width: 0,
              height: 0,
              data: {},
            },
          ],
        }),
      ],
    });
    produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
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

  it('defaults direction to "vertical" and layout to "flow" when payload is undefined', () => {
    mockAutoLayoutResult = {
      nodes: [{ id: 'a', x: 0, y: 0, width: 240, height: 56 }],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('a')] })],
    });
    produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    const [, , optionsArg] = mockAutoLayoutSpy.mock.calls[0];
    expect(optionsArg).toMatchObject({ direction: 'vertical', layout: 'flow' });
    expect((optionsArg as Record<string, unknown>).zoom).toBeUndefined();
  });

  it('defaults direction/layout when payload is supplied without those fields', () => {
    // Branch: action.payload exists (truthy) but `direction`/`layout` are
    // missing → the `||` fallbacks kick in.
    mockAutoLayoutResult = {
      nodes: [{ id: 'a', x: 0, y: 0, width: 240, height: 56 }],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('a')] })],
    });
    produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction({ zoom: 0.5 }));
    });
    const [, , optionsArg] = mockAutoLayoutSpy.mock.calls[0];
    expect(optionsArg).toMatchObject({ direction: 'vertical', layout: 'flow', zoom: 0.5 });
  });
});

describe('autoOrganizeCard — master organize branch', () => {
  it('remaps every node with the autoLayout positions/widths/heights and preserves other fields', () => {
    // Fixture chosen so the centroid is invariant pre/post layout — drift is
    // 0 so the centroid-stabilize block runs but applies a (0,0) shift,
    // isolating the "node remap" assertion from the "centroid shift"
    // behavior covered in its own describe block below.
    //
    // Pre centroids: a@(0,0,200,200) center=(100,100); b@(400,400,200,200)
    // center=(500,500). Pre centroid = (300, 300).
    // Post centroids: a@(50,50,100,100) center=(100,100); b@(450,450,100,100)
    // center=(500,500). Post centroid = (300, 300). Drift = (0, 0).
    mockAutoLayoutResult = {
      nodes: [
        { id: 'a', x: 50, y: 50, width: 100, height: 100 },
        { id: 'b', x: 450, y: 450, width: 100, height: 100 },
      ],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', {
              position: { x: 0, y: 0 },
              width: 200,
              height: 200,
              data: { label: 'A', custom: 42 },
            }),
            makeNode('b', {
              position: { x: 400, y: 400 },
              width: 200,
              height: 200,
            }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    const [a, b] = next.cards[0].nodes;
    expect(a.position).toEqual({ x: 50, y: 50 });
    expect(a.width).toBe(100);
    expect(a.height).toBe(100);
    // Non-position/size fields preserved through the spread.
    expect(a.data).toEqual({ label: 'A', custom: 42 });
    expect(b.position).toEqual({ x: 450, y: 450 });
    expect(b.width).toBe(100);
    expect(b.height).toBe(100);
  });

  it('keeps the pre-layout position when autoLayout returns no entry for a node id', () => {
    // Branch: master branch's `if (organized)` falsy path. autoLayout
    // returned no row for 'lonely', so the node stays at its incoming
    // position.
    //
    // Fixture chosen so the centroid is invariant pre/post: pre centroid =
    // (a.center 100,100 + lonely.center 500,500)/2 = (300, 300). Post:
    // a.center = (50+50, 50+50) = (100, 100); lonely unchanged → center
    // (500, 500). Post centroid = (300, 300). Drift = 0.
    mockAutoLayoutResult = {
      nodes: [{ id: 'a', x: 50, y: 50, width: 100, height: 100 }],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', { position: { x: 0, y: 0 }, width: 200, height: 200 }),
            makeNode('lonely', { position: { x: 400, y: 400 }, width: 200, height: 200 }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    const lonely = next.cards[0].nodes.find((n) => n.id === 'lonely');
    expect(lonely?.position).toEqual({ x: 400, y: 400 });
    expect(lonely?.width).toBe(200);
    expect(lonely?.height).toBe(200);
    // 'a' was remapped to the layout output.
    const a = next.cards[0].nodes.find((n) => n.id === 'a');
    expect(a?.position).toEqual({ x: 50, y: 50 });
    expect(a?.width).toBe(100);
    expect(a?.height).toBe(100);
  });

  it('preserves the original height of folded nodes', () => {
    // Pin: when a CardNode has `data.folded === true`, the height from
    // autoLayout is IGNORED — the user's collapsed state is sticky.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'a', x: 100, y: 200, width: 300, height: 999 }, // layout says 999
      ],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', { height: 42, data: { folded: true } }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    expect(next.cards[0].nodes[0].height).toBe(42);
    // Width still adopted from layout.
    expect(next.cards[0].nodes[0].width).toBe(300);
  });

  it('records an undo snapshot capturing PRE-organize state', () => {
    mockAutoLayoutResult = {
      nodes: [{ id: 'a', x: 100, y: 200, width: 300, height: 150 }],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('a', { position: { x: 0, y: 0 } })],
          edges: [],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    // Snapshot captures the pre-organize position.
    expect(next.history.c1.past[0].nodes[0].position).toEqual({ x: 0, y: 0 });
  });
});

describe('autoOrganizeCard — centroid stabilize (master branch)', () => {
  it('shifts ALL nodes by (oldCentroid - newCentroid) when drift > 1px', () => {
    // Pin: pre-layout centroid = (100, 100) (single top-level node at 0,0
    // with width=200 height=200 → center 100,100). Post-layout centroid =
    // (200, 200) (layout placed it at 100,100 with width=200 height=200 →
    // center 200,200). dx = 100 - 200 = -100, dy = -100. After shift,
    // node.position = (100 + -100, 100 + -100) = (0, 0).
    mockAutoLayoutResult = {
      nodes: [{ id: 'a', x: 100, y: 100, width: 200, height: 200 }],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('a', { position: { x: 0, y: 0 }, width: 200, height: 200 })],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    expect(next.cards[0].nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('skips the shift when drift <= 1px', () => {
    // Pin: pre-layout centroid = (100, 100). Post-layout centroid =
    // (100.5, 100.5) — drift 0.5 < 1. Nodes stay at the layout position
    // unchanged.
    mockAutoLayoutResult = {
      nodes: [{ id: 'a', x: 0.5, y: 0.5, width: 200, height: 200 }],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('a', { position: { x: 0, y: 0 }, width: 200, height: 200 })],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    expect(next.cards[0].nodes[0].position).toEqual({ x: 0.5, y: 0.5 });
  });

  it('shifts edgeRoutes by (dx, dy) BEFORE applyEdgeRoutes runs (RISK #4)', () => {
    // Pin: pre-layout centroid = (100, 100). Post-layout centroid =
    // (200, 200). dx = -100, dy = -100. The reducer:
    //   1. shifts node.position by (-100, -100) so (100,100) → (0,0)
    //   2. shifts edgeRoutes entry by (-100, -100) so [(150,150), (250,250)]
    //      → [(50,50), (150,150)]
    //   3. calls applyEdgeRoutes which writes the SHIFTED routePoints onto
    //      edge.data.routePoints
    //
    // The recorded routePoints MUST be the post-shift values — verifying
    // the order of operations.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'a', x: 100, y: 100, width: 200, height: 200 },
        { id: 'b', x: 500, y: 500, width: 200, height: 200 },
      ],
      edgeRoutes: new Map([
        ['a::b', [{ x: 200, y: 200 }, { x: 600, y: 600 }]],
      ]),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', { position: { x: 0, y: 0 }, width: 200, height: 200 }),
            makeNode('b', { position: { x: 400, y: 400 }, width: 200, height: 200 }),
          ],
          edges: [makeEdge('e1', 'a', 'b')],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    // Pre-shift centroid: (a.center 100,100 + b.center 500,500) / 2 = (300, 300).
    // Post-layout centroid: (a.center 200,200 + b.center 600,600) / 2 = (400, 400).
    // dx = 300 - 400 = -100. dy = -100.
    // After shift: a at (0, 0), b at (400, 400).
    expect(next.cards[0].nodes.find((n) => n.id === 'a')?.position).toEqual({ x: 0, y: 0 });
    expect(next.cards[0].nodes.find((n) => n.id === 'b')?.position).toEqual({ x: 400, y: 400 });
    // edgeRoutes shifted before applyEdgeRoutes ran:
    // [(200,200),(600,600)] → [(100,100),(500,500)]
    const e = next.cards[0].edges[0];
    expect(e.data?.routePoints).toEqual([
      { x: 100, y: 100 },
      { x: 500, y: 500 },
    ]);
  });

  it('does NOT shift when no top-level nodes exist', () => {
    // Branch: the centroid-stabilize block is gated on `topNodes.length > 0`.
    // If every node has a parentId pointing at a container, the topNodes
    // filter returns empty, and the shift is skipped.
    // The container itself is top-level, so we set up: container at top-level,
    // a single child whose parentId is the container. Then we mark the
    // container as folded so layout returns it at a different position
    // without the shift mattering — actually we just need topNodes to be
    // non-empty for the shift, so for the "skip" branch we need topNodes
    // empty. The simplest way: zero nodes → already covered by the empty-card
    // short-circuit. So instead pin the inner gate: pre-layout centroid is
    // computed, post-layout is computed, dx/dy may be zero, but the inner
    // gate `topNodes.length > 0` for the SECOND centroid block guards
    // re-entry. Since the outer block is also gated on the same `topNodes`,
    // and the node-remap already happened, this branch is effectively
    // covered by the "drift <= 1" test above. Keep this case for explicit
    // coverage of `topNodes.length === 0` AT the outer if.
    //
    // We seed a single child whose parentId points at a container that
    // ALSO exists in card.nodes — the cleanup pass keeps the parentId, so
    // topNodes filter excludes the child. The container IS top-level, so
    // topNodes is [container] (length 1, not 0). This means the simplest
    // way to hit the `topNodes.length === 0` branch would need every node
    // to have a parentId. That's impossible in a valid graph (you'd need
    // a cycle or a parent that doesn't exist). We can construct it
    // artificially: child whose parentId points at a container, and a
    // container whose parentId also points at the child — both have
    // parentId set, so topNodes is empty.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'g1', x: 0, y: 0, width: 600, height: 400 },
        { id: 'g2', x: 100, y: 100, width: 240, height: 56 },
      ],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('g1', {
              type: 'container',
              data: { iceType: 'Group.Custom' },
              parentId: 'g2',
            }),
            makeNode('g2', {
              type: 'container',
              data: { iceType: 'Group.Custom' },
              parentId: 'g1',
            }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    // Both nodes get the layout positions verbatim (no centroid shift).
    expect(next.cards[0].nodes.find((n) => n.id === 'g1')?.position).toEqual({ x: 0, y: 0 });
    expect(next.cards[0].nodes.find((n) => n.id === 'g2')?.position).toEqual({ x: 100, y: 100 });
  });
});

describe('autoOrganizeCard — per-container branch', () => {
  it('keeps non-descendant nodes at their original positions', () => {
    // Pin: per-container organize touches ONLY the targeted container's
    // size/height and its descendants' positions/sizes. Sibling nodes
    // outside the container are untouched even though autoLayout was
    // called over all nodes.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'group', x: 1000, y: 1000, width: 600, height: 400 },
        { id: 'inside', x: 1050, y: 1050, width: 240, height: 56 },
        { id: 'outside', x: 9999, y: 9999, width: 240, height: 56 },
      ],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('group', {
              type: 'container',
              position: { x: 100, y: 100 },
              data: { iceType: 'Group.Custom' },
            }),
            makeNode('inside', { parentId: 'group', position: { x: 50, y: 50 } }),
            makeNode('outside', { position: { x: 5000, y: 5000 } }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction({ containerId: 'group' }));
    });
    // Container kept its old position, gained new size.
    const group = next.cards[0].nodes.find((n) => n.id === 'group');
    expect(group?.position).toEqual({ x: 100, y: 100 });
    expect(group?.width).toBe(600);
    expect(group?.height).toBe(400);
    // dx = 100 - 1000 = -900, dy = -900.
    // inside.position becomes (1050 + -900, 1050 + -900) = (150, 150).
    const inside = next.cards[0].nodes.find((n) => n.id === 'inside');
    expect(inside?.position).toEqual({ x: 150, y: 150 });
    // Outside untouched.
    const outside = next.cards[0].nodes.find((n) => n.id === 'outside');
    expect(outside?.position).toEqual({ x: 5000, y: 5000 });
  });

  it('does NOT call applyEdgeRoutes (per-container leaves outside nodes stale)', () => {
    // Pin: applyEdgeRoutes is only safe in master mode. Per-container
    // mode skips it because rewriting routes against the new layout would
    // mismatch the unchanged outside-the-container node positions.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'group', x: 0, y: 0, width: 600, height: 400 },
        { id: 'inside', x: 50, y: 50, width: 240, height: 56 },
      ],
      edgeRoutes: new Map([
        ['inside::inside', [{ x: 100, y: 100 }, { x: 200, y: 200 }]],
      ]),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('group', { type: 'container', data: { iceType: 'Group.Custom' } }),
            makeNode('inside', { parentId: 'group' }),
          ],
          edges: [makeEdge('e1', 'inside', 'inside')],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction({ containerId: 'group' }));
    });
    // applyEdgeRoutes was NOT called → routePoints stays as it was on the
    // edge (undefined in this fixture).
    expect(next.cards[0].edges[0].data?.routePoints).toBeUndefined();
  });

  it('returns early when the targeted containerId is not in the layout output', () => {
    // Branch: `if (!containerOrganized || !containerOld) return;` —
    // organizedMap.get(containerId) returns undefined when autoLayout
    // dropped the container from its output.
    mockAutoLayoutResult = {
      // No 'group' entry — autoLayout dropped it.
      nodes: [{ id: 'inside', x: 50, y: 50, width: 240, height: 56 }],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('group', {
              type: 'container',
              position: { x: 100, y: 100 },
              data: { iceType: 'Group.Custom' },
            }),
            makeNode('inside', {
              parentId: 'group',
              position: { x: 999, y: 999 },
            }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction({ containerId: 'group' }));
    });
    // No mutations applied — `inside` stayed at its original position.
    expect(next.cards[0].nodes.find((n) => n.id === 'inside')?.position).toEqual({ x: 999, y: 999 });
  });

  it('returns early when the targeted containerId is not in the original card', () => {
    // Branch: `containerOld = card.nodes.find(n => n.id === containerId)` —
    // unknown id → containerOld undefined → early return.
    mockAutoLayoutResult = {
      nodes: [{ id: 'lonely', x: 50, y: 50, width: 240, height: 56 }],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('lonely', { position: { x: 999, y: 999 } })],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction({ containerId: 'ghost' }));
    });
    expect(next.cards[0].nodes[0].position).toEqual({ x: 999, y: 999 });
  });

  it('preserves the original height of folded descendants', () => {
    // Per-container branch parity with master: folded children keep their
    // height even when layout reports a different one.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'group', x: 0, y: 0, width: 600, height: 400 },
        { id: 'kid', x: 50, y: 50, width: 240, height: 999 }, // layout says 999
      ],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('group', {
              type: 'container',
              position: { x: 0, y: 0 },
              data: { iceType: 'Group.Custom' },
            }),
            makeNode('kid', {
              parentId: 'group',
              height: 42,
              data: { folded: true },
            }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction({ containerId: 'group' }));
    });
    expect(next.cards[0].nodes.find((n) => n.id === 'kid')?.height).toBe(42);
  });

  it('recursively collects nested descendants for the per-container remap', () => {
    // Pin: collectDescendants walks parentId chains so a grandchild is
    // included even when only its parent (not the grandchild itself)
    // points directly at the targeted container.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'group', x: 0, y: 0, width: 600, height: 400 },
        { id: 'subgroup', x: 50, y: 50, width: 400, height: 300 },
        { id: 'grandchild', x: 70, y: 70, width: 240, height: 56 },
      ],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('group', {
              type: 'container',
              position: { x: 0, y: 0 },
              data: { iceType: 'Group.Custom' },
            }),
            makeNode('subgroup', {
              type: 'container',
              parentId: 'group',
              position: { x: 0, y: 0 },
              data: { iceType: 'Group.Custom' },
            }),
            makeNode('grandchild', {
              parentId: 'subgroup',
              position: { x: 0, y: 0 },
            }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction({ containerId: 'group' }));
    });
    // dx = 0 - 0 = 0, dy = 0 (group origin matches in this fixture).
    // Both subgroup AND grandchild get remapped.
    expect(next.cards[0].nodes.find((n) => n.id === 'subgroup')?.position).toEqual({ x: 50, y: 50 });
    expect(next.cards[0].nodes.find((n) => n.id === 'grandchild')?.position).toEqual({ x: 70, y: 70 });
  });

  it('keeps a descendant at its old position when autoLayout returns no entry for it', () => {
    // Branch: per-container branch's `if (organized)` falsy path on a
    // descendant. The descendant is in `descendantIds` (so it enters the
    // `if (descendantIds.has(node.id))` block) but `organizedMap.get(id)`
    // returns undefined → fall through to the bottom `return node` arm.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'group', x: 0, y: 0, width: 600, height: 400 },
        // Note: no 'inside' entry.
      ],
      edgeRoutes: new Map(),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('group', {
              type: 'container',
              position: { x: 0, y: 0 },
              data: { iceType: 'Group.Custom' },
            }),
            makeNode('inside', {
              parentId: 'group',
              position: { x: 999, y: 999 },
            }),
          ],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction({ containerId: 'group' }));
    });
    expect(next.cards[0].nodes.find((n) => n.id === 'inside')?.position).toEqual({ x: 999, y: 999 });
  });
});

describe('autoOrganizeCard — applyEdgeRoutes is master-only', () => {
  it('writes routePoints onto edge.data when in master mode (no centroid drift)', () => {
    // Drift is exactly 0 (pre and post centroids match), so the shift
    // block is skipped. applyEdgeRoutes still runs and copies routes.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'a', x: 0, y: 0, width: 200, height: 200 },
        { id: 'b', x: 400, y: 400, width: 200, height: 200 },
      ],
      edgeRoutes: new Map([
        ['a::b', [{ x: 100, y: 100 }, { x: 500, y: 500 }]],
      ]),
    };
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', { position: { x: 0, y: 0 }, width: 200, height: 200 }),
            makeNode('b', { position: { x: 400, y: 400 }, width: 200, height: 200 }),
          ],
          edges: [makeEdge('e1', 'a', 'b')],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    const e = next.cards[0].edges[0];
    expect(e.data?.routePoints).toEqual([
      { x: 100, y: 100 },
      { x: 500, y: 500 },
    ]);
  });

  it('clears stale routePoints in master mode when layout returns no route for an edge', () => {
    // applyEdgeRoutes deletes `edge.data.routePoints` when the layout's
    // edgeRoutes map has no entry for the `${source}::${target}` key.
    mockAutoLayoutResult = {
      nodes: [
        { id: 'a', x: 0, y: 0, width: 200, height: 200 },
        { id: 'b', x: 400, y: 400, width: 200, height: 200 },
      ],
      edgeRoutes: new Map(), // empty
    };
    const incomingEdge = makeEdge('e1', 'a', 'b', {
      data: {
        relationship: 'invokes',
        routePoints: [{ x: 999, y: 999 }],
      },
    });
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', { position: { x: 0, y: 0 }, width: 200, height: 200 }),
            makeNode('b', { position: { x: 400, y: 400 }, width: 200, height: 200 }),
          ],
          edges: [incomingEdge],
        }),
      ],
    });
    const next = produce(state, (draft) => {
      autoOrganizeReducers.autoOrganizeCard(draft, autoOrganizeAction());
    });
    const e = next.cards[0].edges[0];
    expect(e.data?.routePoints).toBeUndefined();
    // Other edge.data fields preserved.
    expect(e.data?.relationship).toBe('invokes');
  });
});

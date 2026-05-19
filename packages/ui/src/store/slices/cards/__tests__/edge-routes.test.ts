/**
 * Tests for `cards/edge-routes.ts` — edge-route management helpers and the
 * legacy `cascadeContainerReflow` dead-code helper.
 *
 * Two live functions feed the position / import / auto-organize reducers in
 * the orchestrator:
 *
 *   - `invalidateEdgeRoutesTouching(edges, nodeId)` clears stale dagre
 *     polylines on edges incident to a moved node.
 *   - `applyEdgeRoutes(edges, edgeRoutes)` writes dagre's per-edge waypoints
 *     onto `edge.data.routePoints` so SvgConnectionPath can draw curves
 *     instead of straight lines.
 *
 * `cascadeContainerReflow` is dead code (no reducer wires it) but kept for
 * symmetry; tested for parity in case anyone re-wires it.
 *
 * @see rf-cards-3
 */

import { describe, it, expect } from 'vitest';
import {
  CONTAINER_PADDING,
  HEADER_HEIGHT,
  MIN_CONTAINER_WIDTH,
  MIN_CONTAINER_HEIGHT,
} from '../../../../config/canvas-constants';
import { invalidateEdgeRoutesTouching, applyEdgeRoutes, cascadeContainerReflow } from '../edge-routes';
import type { CardEdge, CardNode } from '../types';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function makeEdge(overrides: Partial<CardEdge> = {}): CardEdge {
  return { id: 'e1', source: 'a', target: 'b', ...overrides };
}

function makeNode(overrides: Partial<CardNode> = {}): CardNode {
  return {
    id: 'n1',
    type: 'block',
    position: { x: 0, y: 0 },
    width: 100,
    height: 60,
    data: {},
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// invalidateEdgeRoutesTouching
// -----------------------------------------------------------------------------

describe('invalidateEdgeRoutesTouching', () => {
  it('is a no-op on an empty edges array', () => {
    const edges: CardEdge[] = [];
    invalidateEdgeRoutesTouching(edges, 'a');
    expect(edges).toEqual([]);
  });

  it('clears routePoints when the edge.source matches nodeId', () => {
    const edges: CardEdge[] = [
      makeEdge({
        id: 'e1',
        source: 'a',
        target: 'b',
        data: {
          routePoints: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      }),
    ];
    invalidateEdgeRoutesTouching(edges, 'a');
    expect(edges[0].data?.routePoints).toBeUndefined();
  });

  it('clears routePoints when the edge.target matches nodeId', () => {
    const edges: CardEdge[] = [
      makeEdge({
        id: 'e1',
        source: 'a',
        target: 'b',
        data: {
          routePoints: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      }),
    ];
    invalidateEdgeRoutesTouching(edges, 'b');
    expect(edges[0].data?.routePoints).toBeUndefined();
  });

  it('preserves routePoints when neither endpoint matches nodeId', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const edges: CardEdge[] = [
      makeEdge({
        id: 'e1',
        source: 'a',
        target: 'b',
        data: { routePoints: route },
      }),
    ];
    invalidateEdgeRoutesTouching(edges, 'unrelated-c');
    expect(edges[0].data?.routePoints).toBe(route);
  });

  it('is a no-op on edges without data.routePoints (no `data`)', () => {
    const edges: CardEdge[] = [makeEdge({ id: 'e1', source: 'a', target: 'b' })];
    invalidateEdgeRoutesTouching(edges, 'a');
    expect(edges[0].data).toBeUndefined();
  });

  it('is a no-op on edges with data but absent routePoints', () => {
    const edges: CardEdge[] = [makeEdge({ id: 'e1', source: 'a', target: 'b', data: { relationship: 'depends-on' } })];
    invalidateEdgeRoutesTouching(edges, 'a');
    expect(edges[0].data).toEqual({ relationship: 'depends-on' });
    expect(edges[0].data?.routePoints).toBeUndefined();
  });

  it('clears routePoints on every incident edge', () => {
    const edges: CardEdge[] = [
      makeEdge({
        id: 'e1',
        source: 'a',
        target: 'b',
        data: {
          routePoints: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      }),
      makeEdge({
        id: 'e2',
        source: 'b',
        target: 'a',
        data: {
          routePoints: [
            { x: 2, y: 2 },
            { x: 3, y: 3 },
          ],
        },
      }),
      makeEdge({
        id: 'e3',
        source: 'c',
        target: 'd',
        data: {
          routePoints: [
            { x: 4, y: 4 },
            { x: 5, y: 5 },
          ],
        },
      }),
    ];
    invalidateEdgeRoutesTouching(edges, 'a');
    expect(edges[0].data?.routePoints).toBeUndefined();
    expect(edges[1].data?.routePoints).toBeUndefined();
    // Untouched: neither source nor target equals 'a'.
    expect(edges[2].data?.routePoints).toEqual([
      { x: 4, y: 4 },
      { x: 5, y: 5 },
    ]);
  });

  it('preserves sibling fields on `data` (only routePoints is deleted)', () => {
    const edges: CardEdge[] = [
      makeEdge({
        id: 'e1',
        source: 'a',
        target: 'b',
        data: {
          routePoints: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
          relationship: 'depends-on',
        },
      }),
    ];
    invalidateEdgeRoutesTouching(edges, 'a');
    expect(edges[0].data).toEqual({ relationship: 'depends-on' });
  });
});

// -----------------------------------------------------------------------------
// applyEdgeRoutes
// -----------------------------------------------------------------------------

describe('applyEdgeRoutes', () => {
  it('is a no-op on an empty edges array', () => {
    const edges: CardEdge[] = [];
    const routes = new Map<string, Array<{ x: number; y: number }>>();
    applyEdgeRoutes(edges, routes);
    expect(edges).toEqual([]);
  });

  it('deletes routePoints when the edge has no matching key in the routes map', () => {
    const edges: CardEdge[] = [
      makeEdge({
        id: 'e1',
        source: 'a',
        target: 'b',
        data: {
          routePoints: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      }),
    ];
    const routes = new Map<string, Array<{ x: number; y: number }>>();
    applyEdgeRoutes(edges, routes);
    expect(edges[0].data?.routePoints).toBeUndefined();
    // `data` was preserved as an object — only the key was removed.
    expect(edges[0].data).toEqual({});
  });

  it('writes routePoints when the route has length >= 2', () => {
    const edges: CardEdge[] = [makeEdge({ id: 'e1', source: 'a', target: 'b' })];
    const routes = new Map<string, Array<{ x: number; y: number }>>([
      [
        'a::b',
        [
          { x: 5, y: 6 },
          { x: 7, y: 8 },
          { x: 9, y: 10 },
        ],
      ],
    ]);
    applyEdgeRoutes(edges, routes);
    expect(edges[0].data?.routePoints).toEqual([
      { x: 5, y: 6 },
      { x: 7, y: 8 },
      { x: 9, y: 10 },
    ]);
  });

  it('drops routePoints when the matched route has length < 2 (single-point degenerate)', () => {
    const edges: CardEdge[] = [
      makeEdge({
        id: 'e1',
        source: 'a',
        target: 'b',
        data: {
          routePoints: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      }),
    ];
    const routes = new Map<string, Array<{ x: number; y: number }>>([['a::b', [{ x: 99, y: 99 }]]]);
    applyEdgeRoutes(edges, routes);
    expect(edges[0].data?.routePoints).toBeUndefined();
  });

  it('drops routePoints when the matched route is empty', () => {
    const edges: CardEdge[] = [
      makeEdge({
        id: 'e1',
        source: 'a',
        target: 'b',
        data: {
          routePoints: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      }),
    ];
    const routes = new Map<string, Array<{ x: number; y: number }>>([['a::b', []]]);
    applyEdgeRoutes(edges, routes);
    expect(edges[0].data?.routePoints).toBeUndefined();
  });

  it('initialises edge.data when it was absent', () => {
    const edges: CardEdge[] = [makeEdge({ id: 'e1', source: 'a', target: 'b' })];
    expect(edges[0].data).toBeUndefined();
    const routes = new Map<string, Array<{ x: number; y: number }>>();
    applyEdgeRoutes(edges, routes);
    // `data` is created (set to {}) even when the route is missing.
    expect(edges[0].data).toEqual({});
  });

  it('initialises edge.data and writes routePoints in one call when route is present', () => {
    const edges: CardEdge[] = [makeEdge({ id: 'e1', source: 'a', target: 'b' })];
    const routes = new Map<string, Array<{ x: number; y: number }>>([
      [
        'a::b',
        [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      ],
    ]);
    applyEdgeRoutes(edges, routes);
    expect(edges[0].data?.routePoints).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it('processes multiple edges independently', () => {
    const edges: CardEdge[] = [
      makeEdge({ id: 'e1', source: 'a', target: 'b' }),
      makeEdge({ id: 'e2', source: 'c', target: 'd' }),
      makeEdge({
        id: 'e3',
        source: 'x',
        target: 'y',
        data: {
          routePoints: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      }),
    ];
    const routes = new Map<string, Array<{ x: number; y: number }>>([
      [
        'a::b',
        [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
      ],
      // 'c::d' missing → e2 gets no routePoints.
      // 'x::y' missing → e3's existing routePoints get cleared.
    ]);
    applyEdgeRoutes(edges, routes);
    expect(edges[0].data?.routePoints).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);
    expect(edges[1].data?.routePoints).toBeUndefined();
    expect(edges[2].data?.routePoints).toBeUndefined();
  });

  it('keys routes by `${source}::${target}` exactly (different separators do NOT match)', () => {
    const edges: CardEdge[] = [makeEdge({ id: 'e1', source: 'a', target: 'b' })];
    const routes = new Map<string, Array<{ x: number; y: number }>>([
      [
        'a:b',
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      ], // single colon → no match
    ]);
    applyEdgeRoutes(edges, routes);
    expect(edges[0].data?.routePoints).toBeUndefined();
  });

  it('deep-clones each route point (strips extra fields, no shared references)', () => {
    const sourcePoints = [
      // Extra field would slip through if we used the raw reference.
      { x: 1, y: 2, extra: 'foo' } as { x: number; y: number; extra: string },
      { x: 3, y: 4, extra: 'bar' } as { x: number; y: number; extra: string },
    ];
    const edges: CardEdge[] = [makeEdge({ id: 'e1', source: 'a', target: 'b' })];
    const routes = new Map<string, Array<{ x: number; y: number }>>([['a::b', sourcePoints]]);
    applyEdgeRoutes(edges, routes);
    const points = edges[0].data?.routePoints as Array<Record<string, unknown>>;
    expect(points).toHaveLength(2);
    // Each point is a fresh object, not the input reference.
    expect(points[0]).not.toBe(sourcePoints[0]);
    expect(points[1]).not.toBe(sourcePoints[1]);
    // Only x and y survive — extras are stripped.
    expect(points[0]).toEqual({ x: 1, y: 2 });
    expect(points[1]).toEqual({ x: 3, y: 4 });
    expect(points[0].extra).toBeUndefined();
    expect(points[1].extra).toBeUndefined();
  });

  it('preserves sibling fields on `data` while writing routePoints', () => {
    const edges: CardEdge[] = [
      makeEdge({
        id: 'e1',
        source: 'a',
        target: 'b',
        data: { relationship: 'depends-on' },
      }),
    ];
    const routes = new Map<string, Array<{ x: number; y: number }>>([
      [
        'a::b',
        [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      ],
    ]);
    applyEdgeRoutes(edges, routes);
    expect(edges[0].data?.relationship).toBe('depends-on');
    expect(edges[0].data?.routePoints).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });
});

// -----------------------------------------------------------------------------
// cascadeContainerReflow (dead code, retained)
// -----------------------------------------------------------------------------

describe('cascadeContainerReflow', () => {
  it('is a no-op when there are no containers', () => {
    const nodes: CardNode[] = [
      makeNode({ id: 'a', type: 'block', position: { x: 100, y: 100 }, width: 50, height: 30 }),
    ];
    cascadeContainerReflow(nodes);
    expect(nodes[0].position).toEqual({ x: 100, y: 100 });
    expect(nodes[0].width).toBe(50);
    expect(nodes[0].height).toBe(30);
  });

  it('leaves a childless container unchanged', () => {
    const nodes: CardNode[] = [
      makeNode({
        id: 'c1',
        type: 'container',
        position: { x: 50, y: 60 },
        width: 400,
        height: 300,
      }),
    ];
    cascadeContainerReflow(nodes);
    expect(nodes[0].position).toEqual({ x: 50, y: 60 });
    expect(nodes[0].width).toBe(400);
    expect(nodes[0].height).toBe(300);
  });

  it('resizes a container around its children using CONTAINER_PADDING + HEADER_HEIGHT', () => {
    // One child at (200, 200) with width=100, height=60 — well above minimums.
    // Padding pushes the container to contentW + CONTAINER_PADDING*2 wide.
    const child = makeNode({
      id: 'child',
      parentId: 'c1',
      position: { x: 200, y: 200 },
      width: 600, // big enough to exceed MIN_CONTAINER_WIDTH after padding
      height: 400, // big enough to exceed MIN_CONTAINER_HEIGHT after padding + header
    });
    const container = makeNode({
      id: 'c1',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
    });
    const nodes: CardNode[] = [container, child];

    cascadeContainerReflow(nodes);

    // contentW = maxX - minX = 800 - 200 = 600
    // contentH = maxY - minY = 600 - 200 = 400
    // newW = max(600 + 2*CONTAINER_PADDING, MIN_CONTAINER_WIDTH)
    const expectedW = Math.max(600 + CONTAINER_PADDING * 2, MIN_CONTAINER_WIDTH);
    const expectedH = Math.max(400 + CONTAINER_PADDING * 2 + HEADER_HEIGHT, MIN_CONTAINER_HEIGHT);
    expect(container.width).toBe(expectedW);
    expect(container.height).toBe(expectedH);

    // contentCenterX = (200 + 800) / 2 = 500
    // contentCenterY = (200 + 600) / 2 = 400
    // newX = 500 - newW/2
    // newY = 400 - (newH - HEADER_HEIGHT)/2 - HEADER_HEIGHT
    expect(container.position.x).toBe(500 - expectedW / 2);
    expect(container.position.y).toBe(400 - (expectedH - HEADER_HEIGHT) / 2 - HEADER_HEIGHT);
  });

  it('clamps to MIN_CONTAINER_WIDTH / MIN_CONTAINER_HEIGHT for a single small child', () => {
    // Single child means contentW = 0 and contentH = 0 (maxX == minX, maxY == minY).
    // The container width/height should clamp to the minimums.
    const child = makeNode({
      id: 'child',
      parentId: 'c1',
      position: { x: 100, y: 100 },
      width: 0,
      height: 0,
    });
    const container = makeNode({
      id: 'c1',
      type: 'container',
      position: { x: 50, y: 50 },
      width: 200,
      height: 100,
    });
    const nodes: CardNode[] = [container, child];

    cascadeContainerReflow(nodes);

    // contentW = 0, contentH = 0
    // newW = max(0 + 2*CONTAINER_PADDING, MIN_CONTAINER_WIDTH) = MIN_CONTAINER_WIDTH
    // newH = max(0 + 2*CONTAINER_PADDING + HEADER_HEIGHT, MIN_CONTAINER_HEIGHT) = MIN_CONTAINER_HEIGHT
    expect(container.width).toBe(MIN_CONTAINER_WIDTH);
    expect(container.height).toBe(MIN_CONTAINER_HEIGHT);
  });

  it('processes deeper containers BEFORE their parents (leaf-up)', () => {
    // Topology:
    //   outer (depth 0)
    //     inner (depth 1, parentId=outer)
    //       leaf (parentId=inner, the "child" the inner container resizes around)
    //     sibling (parentId=outer, the "child" the outer container resizes around)
    //
    // The leaf-up sort means inner is processed first; the resize of inner
    // changes inner's width/height which then becomes the bounding-box input
    // for outer's resize. We pin the order by checking that outer's bounding
    // box reflects inner's POST-resize dimensions.
    const leaf = makeNode({
      id: 'leaf',
      parentId: 'inner',
      position: { x: 1000, y: 1000 },
      width: 800, // huge: forces inner to resize past minimum
      height: 600,
    });
    const sibling = makeNode({
      id: 'sibling',
      parentId: 'outer',
      position: { x: 2000, y: 2000 },
      width: 50,
      height: 50,
    });
    const inner = makeNode({
      id: 'inner',
      type: 'container',
      parentId: 'outer',
      position: { x: 1000, y: 1000 }, // initial pos — will be repositioned
      width: 100,
      height: 100,
    });
    const outer = makeNode({
      id: 'outer',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
    });
    const nodes: CardNode[] = [outer, inner, sibling, leaf];

    cascadeContainerReflow(nodes);

    // inner was processed first. Its content (just the leaf) is at (1000,1000)→(1800,1600).
    // contentW = 800, contentH = 600
    const innerExpectedW = Math.max(800 + CONTAINER_PADDING * 2, MIN_CONTAINER_WIDTH);
    const innerExpectedH = Math.max(600 + CONTAINER_PADDING * 2 + HEADER_HEIGHT, MIN_CONTAINER_HEIGHT);
    expect(inner.width).toBe(innerExpectedW);
    expect(inner.height).toBe(innerExpectedH);

    // outer's bounding box is computed from inner's POST-resize dims (proves
    // the leaf-up ordering). inner.position is recentered around the leaf's
    // centroid (1400, 1300):
    const innerExpectedX = 1400 - innerExpectedW / 2;
    const innerExpectedY = 1300 - (innerExpectedH - HEADER_HEIGHT) / 2 - HEADER_HEIGHT;
    expect(inner.position.x).toBe(innerExpectedX);
    expect(inner.position.y).toBe(innerExpectedY);

    // outer's children are inner (post-resize) + sibling.
    // sibling extents: (2000, 2000) → (2050, 2050)
    // inner extents: (innerExpectedX, innerExpectedY) → (innerExpectedX + innerExpectedW, innerExpectedY + innerExpectedH)
    const innerMaxX = innerExpectedX + innerExpectedW;
    const innerMaxY = innerExpectedY + innerExpectedH;
    const minX = Math.min(2000, innerExpectedX);
    const minY = Math.min(2000, innerExpectedY);
    const maxX = Math.max(2050, innerMaxX);
    const maxY = Math.max(2050, innerMaxY);

    const outerExpectedW = Math.max(maxX - minX + CONTAINER_PADDING * 2, MIN_CONTAINER_WIDTH);
    const outerExpectedH = Math.max(maxY - minY + CONTAINER_PADDING * 2 + HEADER_HEIGHT, MIN_CONTAINER_HEIGHT);
    expect(outer.width).toBe(outerExpectedW);
    expect(outer.height).toBe(outerExpectedH);
  });

  it('skips a container whose children list is empty even when other containers have children', () => {
    const empty = makeNode({
      id: 'empty',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
    });
    const populated = makeNode({
      id: 'pop',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
    });
    const child = makeNode({
      id: 'child',
      parentId: 'pop',
      position: { x: 500, y: 500 },
      width: 700,
      height: 500,
    });
    const nodes: CardNode[] = [empty, populated, child];

    cascadeContainerReflow(nodes);

    // empty was untouched.
    expect(empty.position).toEqual({ x: 0, y: 0 });
    expect(empty.width).toBe(100);
    expect(empty.height).toBe(100);

    // populated was resized.
    const expectedW = Math.max(700 + CONTAINER_PADDING * 2, MIN_CONTAINER_WIDTH);
    const expectedH = Math.max(500 + CONTAINER_PADDING * 2 + HEADER_HEIGHT, MIN_CONTAINER_HEIGHT);
    expect(populated.width).toBe(expectedW);
    expect(populated.height).toBe(expectedH);
  });
});

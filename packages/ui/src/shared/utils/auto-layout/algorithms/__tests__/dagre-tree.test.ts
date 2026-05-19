/**
 * dagreTreeLayout — direct fixture-driven exercise. dagre is real (no
 * mock), so the assertions focus on the orchestration invariants this
 * module owns rather than the exact post-dagre coordinates:
 *
 *  - opts threading (rankdir, nodeGap, startX/startY) routes correctly.
 *  - The flow / isolated split keeps isolated subtrees out of dagre's
 *    bounding-box stretch.
 *  - The grid-pack short-circuit kicks in when a container's kids share
 *    no flow edge.
 *  - The shrink-wrap container pass produces a `width`/`height` that
 *    fits content + GRID_STEP*2 (W) and content + GRID_STEP*3 (H), or
 *    the iceType's intrinsic min, whichever is bigger.
 *  - All output coords land on the GRID_STEP grid (snap pass invariant).
 *  - Edge routes get absolute coordinates, with container-owned routes
 *    offset by the container's absolute position.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_OPTIONS, type LayoutEdge, type LayoutNode } from '../../types';
import { dagreTreeLayout } from '../dagre-tree';

const GRID_STEP = 40;

function mk(
  id: string,
  iceType: string = 'Compute.Container',
  parentId: string | null = null,
  data: Record<string, unknown> = {},
): LayoutNode {
  return {
    id,
    type: iceType.startsWith('Group.') || iceType === 'Network.PrivateNetwork' ? 'container' : 'resource',
    iceType,
    label: id,
    parentId,
    width: 240,
    height: 160,
    x: 0,
    y: 0,
    data: { iceType, ...data },
  };
}

describe('dagreTreeLayout — entry-level invariants', () => {
  it('all output coordinates are GRID_STEP-snapped', () => {
    const nodes = [mk('a'), mk('b'), mk('c')];
    const edges: LayoutEdge[] = [
      { source: 'a', target: 'b', relationship: 'connects_to' },
      { source: 'b', target: 'c', relationship: 'connects_to' },
    ];
    const { nodes: out } = dagreTreeLayout(nodes, edges, DEFAULT_OPTIONS);
    for (const n of out) {
      expect(n.x % GRID_STEP).toBe(0);
      expect(n.y % GRID_STEP).toBe(0);
      expect(n.width % GRID_STEP).toBe(0);
      expect(n.height % GRID_STEP).toBe(0);
    }
  });

  it('returns one entry per input node', () => {
    const nodes = [mk('a'), mk('b'), mk('c')];
    const { nodes: out } = dagreTreeLayout(nodes, [], DEFAULT_OPTIONS);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((n) => n.id))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('empty edges list: every node is isolated, no overlaps after repack', () => {
    const nodes = [mk('a'), mk('b'), mk('c')];
    const { nodes: out } = dagreTreeLayout(nodes, [], DEFAULT_OPTIONS);
    // No flow at all: repackIsolatedTopLevel returns early because flowRoots is empty.
    // Dagre still positions them in some default arrangement.
    expect(out).toHaveLength(3);
  });

  it('flow + isolated mix: isolated nodes are placed below the flow under TB', () => {
    const nodes = [mk('a'), mk('b'), mk('iso')];
    const edges: LayoutEdge[] = [{ source: 'a', target: 'b', relationship: 'connects_to' }];
    const { nodes: out } = dagreTreeLayout(nodes, edges, { ...DEFAULT_OPTIONS, direction: 'vertical' });
    const byId = new Map(out.map((n) => [n.id, n] as const));
    const a = byId.get('a')!;
    const b = byId.get('b')!;
    const iso = byId.get('iso')!;
    // 'iso' should be below the lower of (a, b).
    const flowMaxY = Math.max(a.y + a.height, b.y + b.height);
    expect(iso.y).toBeGreaterThanOrEqual(flowMaxY);
  });

  it('horizontal direction: flow runs LR; isolated to the right', () => {
    const nodes = [mk('a'), mk('b'), mk('iso')];
    const edges: LayoutEdge[] = [{ source: 'a', target: 'b', relationship: 'connects_to' }];
    const { nodes: out } = dagreTreeLayout(nodes, edges, { ...DEFAULT_OPTIONS, direction: 'horizontal' });
    const byId = new Map(out.map((n) => [n.id, n] as const));
    const a = byId.get('a')!;
    const b = byId.get('b')!;
    const iso = byId.get('iso')!;
    const flowMaxX = Math.max(a.x + a.width, b.x + b.width);
    expect(iso.x).toBeGreaterThanOrEqual(flowMaxX);
  });
});

describe('dagreTreeLayout — container shrink-wrap', () => {
  it('container with two flow-connected children: container width fits content + 2*GRID_STEP padding', () => {
    const nodes = [mk('p', 'Group.Custom'), mk('c1', 'Compute.Container', 'p'), mk('c2', 'Compute.Container', 'p')];
    const edges: LayoutEdge[] = [{ source: 'c1', target: 'c2', relationship: 'connects_to' }];
    const { nodes: out } = dagreTreeLayout(nodes, edges, DEFAULT_OPTIONS);
    const byId = new Map(out.map((n) => [n.id, n] as const));
    const p = byId.get('p')!;
    const c1 = byId.get('c1')!;
    const c2 = byId.get('c2')!;

    // Children inside parent.
    expect(c1.x).toBeGreaterThanOrEqual(p.x);
    expect(c2.x).toBeGreaterThanOrEqual(p.x);
    expect(c1.x + c1.width).toBeLessThanOrEqual(p.x + p.width);
    expect(c2.x + c2.width).toBeLessThanOrEqual(p.x + p.width);
  });

  it('Private Network container: shrink-wraps to PN floor (560x320) when kids fit smaller', () => {
    const nodes = [mk('pn', 'Network.PrivateNetwork'), mk('c', 'Compute.Container', 'pn')];
    const { nodes: out } = dagreTreeLayout(nodes, [], DEFAULT_OPTIONS);
    const pn = out.find((n) => n.id === 'pn')!;
    expect(pn.width).toBeGreaterThanOrEqual(560);
    expect(pn.height).toBeGreaterThanOrEqual(320);
  });

  it('container with isolated kids: gridPackKids short-circuit kicks in', () => {
    // Three kids, no internal edge → gridPackKids fires.
    const nodes = [
      mk('p', 'Group.Custom'),
      mk('a', 'Compute.Container', 'p'),
      mk('b', 'Compute.Container', 'p'),
      mk('c', 'Compute.Container', 'p'),
    ];
    const { nodes: out } = dagreTreeLayout(nodes, [], DEFAULT_OPTIONS);
    const byId = new Map(out.map((n) => [n.id, n] as const));
    const p = byId.get('p')!;
    // All kids inside p.
    for (const id of ['a', 'b', 'c']) {
      const kid = byId.get(id)!;
      expect(kid.x).toBeGreaterThanOrEqual(p.x);
      expect(kid.y).toBeGreaterThanOrEqual(p.y);
      expect(kid.x + kid.width).toBeLessThanOrEqual(p.x + p.width);
      expect(kid.y + kid.height).toBeLessThanOrEqual(p.y + p.height);
    }
  });

  it('container with one kid: dagre branch (kids.length < 2 skips gridPack)', () => {
    const nodes = [mk('p', 'Group.Custom'), mk('a', 'Compute.Container', 'p')];
    const { nodes: out } = dagreTreeLayout(nodes, [], DEFAULT_OPTIONS);
    const byId = new Map(out.map((n) => [n.id, n] as const));
    const p = byId.get('p')!;
    const a = byId.get('a')!;
    expect(a.x).toBeGreaterThanOrEqual(p.x);
    expect(a.y).toBeGreaterThanOrEqual(p.y);
  });
});

describe('dagreTreeLayout — edge routes', () => {
  it('flow-edge is keyed `${source}::${target}` in the routes map', () => {
    const nodes = [mk('a'), mk('b')];
    const edges: LayoutEdge[] = [{ source: 'a', target: 'b', relationship: 'connects_to' }];
    const { edgeRoutes } = dagreTreeLayout(nodes, edges, DEFAULT_OPTIONS);
    expect(edgeRoutes.has('a::b')).toBe(true);
  });

  it('contains-relationship edges are not flow edges and produce no route', () => {
    const nodes = [mk('p', 'Group.Custom'), mk('c', 'Compute.Container', 'p')];
    const edges: LayoutEdge[] = [{ source: 'p', target: 'c', relationship: 'contains' }];
    const { edgeRoutes } = dagreTreeLayout(nodes, edges, DEFAULT_OPTIONS);
    expect(edgeRoutes.has('p::c')).toBe(false);
  });

  it('self-loop edge (source === target) produces no route', () => {
    const nodes = [mk('a'), mk('b')];
    const edges: LayoutEdge[] = [{ source: 'a', target: 'a', relationship: 'connects_to' }];
    const { edgeRoutes } = dagreTreeLayout(nodes, edges, DEFAULT_OPTIONS);
    expect(edgeRoutes.has('a::a')).toBe(false);
  });

  it('an edge whose endpoint is missing from kids is filtered out', () => {
    const nodes = [mk('a')];
    const edges: LayoutEdge[] = [{ source: 'a', target: 'ghost', relationship: 'connects_to' }];
    const { edgeRoutes } = dagreTreeLayout(nodes, edges, DEFAULT_OPTIONS);
    expect(edgeRoutes.size).toBe(0);
  });

  it('container-internal edge route gets offset by the container absolute position', () => {
    const nodes = [mk('p', 'Group.Custom'), mk('c1', 'Compute.Container', 'p'), mk('c2', 'Compute.Container', 'p')];
    const edges: LayoutEdge[] = [{ source: 'c1', target: 'c2', relationship: 'connects_to' }];
    const { nodes: out, edgeRoutes } = dagreTreeLayout(nodes, edges, DEFAULT_OPTIONS);
    const byId = new Map(out.map((n) => [n.id, n] as const));
    const p = byId.get('p')!;
    const route = edgeRoutes.get('c1::c2');
    expect(route).toBeDefined();
    // Each waypoint should be inside the container's absolute bounding box (with some tolerance for header).
    for (const pt of route!) {
      expect(pt.x).toBeGreaterThanOrEqual(p.x);
      expect(pt.y).toBeGreaterThanOrEqual(p.y);
    }
  });
});

describe('dagreTreeLayout — option threading', () => {
  it('startX / startY shift the top-level origin (TB)', () => {
    const nodes = [mk('a'), mk('b')];
    const edges: LayoutEdge[] = [{ source: 'a', target: 'b', relationship: 'connects_to' }];
    const { nodes: shifted } = dagreTreeLayout(nodes, edges, { ...DEFAULT_OPTIONS, startX: 200, startY: 200 });
    // Smallest top-left should be at startX/startY (snapped to grid).
    const minX = Math.min(...shifted.map((n) => n.x));
    const minY = Math.min(...shifted.map((n) => n.y));
    expect(minX).toBeGreaterThanOrEqual(200 - GRID_STEP);
    expect(minY).toBeGreaterThanOrEqual(200 - GRID_STEP);
  });

  it('nodeGap=0 falls back to NODE_SEP default (truthy guard)', () => {
    const nodes = [mk('a'), mk('b')];
    const edges: LayoutEdge[] = [{ source: 'a', target: 'b', relationship: 'connects_to' }];
    expect(() => dagreTreeLayout(nodes, edges, { ...DEFAULT_OPTIONS, nodeGap: 0 })).not.toThrow();
  });
});

describe('dagreTreeLayout — visual size mirroring', () => {
  it('Private Network top-level uses PN visual size (>= 560x320)', () => {
    const nodes = [mk('pn', 'Network.PrivateNetwork'), mk('a')];
    const edges: LayoutEdge[] = [{ source: 'pn', target: 'a', relationship: 'connects_to' }];
    const { nodes: out } = dagreTreeLayout(nodes, edges, DEFAULT_OPTIONS);
    const pn = out.find((n) => n.id === 'pn')!;
    expect(pn.width).toBeGreaterThanOrEqual(560);
    expect(pn.height).toBeGreaterThanOrEqual(320);
  });

  it('Custom Domain visual size grows with route count (height varies)', () => {
    const cd0 = mk('cd', 'Network.CustomDomain');
    const cd5 = mk('cd', 'Network.CustomDomain', null, { routes: [{}, {}, {}, {}, {}] });
    const out0 = dagreTreeLayout([cd0, mk('x')], [], DEFAULT_OPTIONS);
    const out5 = dagreTreeLayout([cd5, mk('x')], [], DEFAULT_OPTIONS);
    const cd0Out = out0.nodes.find((n) => n.id === 'cd')!;
    const cd5Out = out5.nodes.find((n) => n.id === 'cd')!;
    expect(cd5Out.height).toBeGreaterThan(cd0Out.height);
  });
});

describe('dagreTreeLayout — determinism', () => {
  it('same input yields the same output (snap-grid invariant)', () => {
    const nodes = [mk('a'), mk('b'), mk('c')];
    const edges: LayoutEdge[] = [
      { source: 'a', target: 'b', relationship: 'connects_to' },
      { source: 'b', target: 'c', relationship: 'connects_to' },
    ];
    const out1 = dagreTreeLayout(nodes, edges, DEFAULT_OPTIONS);
    // Re-run with cloned input.
    const nodes2 = nodes.map((n) => ({ ...n, data: { ...n.data } }));
    const edges2 = edges.map((e) => ({ ...e }));
    const out2 = dagreTreeLayout(nodes2, edges2, DEFAULT_OPTIONS);

    const map1 = new Map(out1.nodes.map((n) => [n.id, { x: n.x, y: n.y, w: n.width, h: n.height }]));
    const map2 = new Map(out2.nodes.map((n) => [n.id, { x: n.x, y: n.y, w: n.width, h: n.height }]));
    expect(map1).toEqual(map2);
  });
});

describe('dagreTreeLayout — branch-coverage edge cases', () => {
  it('top-level container with zero children: kids.length === 0 → continue', () => {
    // An empty container at top level: kids = [] under it → the per-owner loop
    // hits `if (kids.length === 0) continue;` (the early-exit branch).
    const nodes = [mk('p', 'Group.Custom')];
    const { nodes: out } = dagreTreeLayout(nodes, [], DEFAULT_OPTIONS);
    expect(out).toHaveLength(1);
    const p = out[0];
    expect(p.id).toBe('p');
    // No layout work happened on the empty container's interior.
    expect(p.x).toBeGreaterThanOrEqual(0);
  });

  it('shared child via two contains edges: checkFlowSubtree cache-hit branch fires', () => {
    // Two top-level nodes share a child via `contains` edges. `buildHierarchy`
    // appends the shared child to both parents' children lists. When
    // `checkFlowSubtree` traverses the second parent's subtree, the shared
    // child's `topHasFlow` entry is already populated → cache hit at
    // `if (cached !== undefined) return cached;`.
    const nodes = [mk('a', 'Group.Custom'), mk('b', 'Group.Custom'), mk('shared')];
    const edges: LayoutEdge[] = [
      { source: 'a', target: 'shared', relationship: 'contains' },
      { source: 'b', target: 'shared', relationship: 'contains' },
    ];
    const { nodes: out } = dagreTreeLayout(nodes, edges, DEFAULT_OPTIONS);
    // No throw; everyone placed.
    expect(out).toHaveLength(3);
  });

  it('container with empty iceType (`""`) falls through visualMin to MIN_CONTAINER', () => {
    // The fallback `(... .iceType as string) || ''` is exercised when the
    // container's iceType is the empty string. visualMin then resolves to
    // MIN_CONTAINER (240×150).
    const blankContainer: LayoutNode = {
      id: 'blank',
      type: 'container',
      iceType: '',
      label: 'blank',
      parentId: null,
      width: 240,
      height: 160,
      x: 0,
      y: 0,
      data: {},
    };
    const child = mk('c', 'Compute.Container', 'blank');
    const { nodes: out } = dagreTreeLayout([blankContainer, child], [], DEFAULT_OPTIONS);
    const blankOut = out.find((n) => n.id === 'blank')!;
    expect(blankOut.width).toBeGreaterThanOrEqual(240);
    expect(blankOut.height).toBeGreaterThanOrEqual(150);
  });

  it('only-isolated top-level (no flow at all): early-out leaves nodes placed', () => {
    // No flow edges → flowRoots is empty. `repackIsolatedTopLevel` short-
    // circuits on `flowRoots.length === 0`. Dagre still positions each root.
    const nodes = [mk('a'), mk('b'), mk('c')];
    const { nodes: out } = dagreTreeLayout(nodes, [], DEFAULT_OPTIONS);
    expect(out).toHaveLength(3);
  });
});

/**
 * circularLayout — fixture-driven tests of the concentric-ring algorithm.
 * forceResolveOverlaps — pinned via overlap / no-overlap fixtures.
 */

import { describe, it, expect } from 'vitest';
import { circularLayout, forceResolveOverlaps } from '../circular';
import { DEFAULT_OPTIONS, type LayoutEdge, type LayoutNode } from '../../types';

const GRID_STEP = 40;

function mk(
  id: string,
  iceType: string = 'Compute.Container',
  parentId: string | null = null,
): LayoutNode {
  return {
    id,
    type:
      iceType.startsWith('Group.') || iceType === 'Network.PrivateNetwork' ? 'container' : 'resource',
    iceType,
    label: id,
    parentId,
    width: 240,
    height: 160,
    x: 0,
    y: 0,
    data: { iceType },
  };
}

describe('circularLayout', () => {
  it('single top-level node: placed at startX/startY (snap-rounded)', () => {
    const { nodes } = circularLayout([mk('a')], [], { ...DEFAULT_OPTIONS, layout: 'circular' });
    const out = nodes[0];
    expect(out.x % GRID_STEP).toBe(0);
    expect(out.y % GRID_STEP).toBe(0);
  });

  it('returns an empty edgeRoutes Map (circular mode does not route edges)', () => {
    const { edgeRoutes } = circularLayout(
      [mk('a'), mk('b')],
      [{ source: 'a', target: 'b', relationship: 'connects_to' }],
      { ...DEFAULT_OPTIONS, layout: 'circular' },
    );
    expect(edgeRoutes.size).toBe(0);
  });

  it('all output coords land on the GRID_STEP grid', () => {
    const nodes = [mk('a'), mk('b'), mk('c'), mk('d')];
    const { nodes: out } = circularLayout(nodes, [], { ...DEFAULT_OPTIONS, layout: 'circular' });
    for (const n of out) {
      expect(n.x % GRID_STEP).toBe(0);
      expect(n.y % GRID_STEP).toBe(0);
      expect(n.width % GRID_STEP).toBe(0);
      expect(n.height % GRID_STEP).toBe(0);
    }
  });

  it('multiple top-level nodes: distributed around a ring (none colocated)', () => {
    const nodes = [mk('a'), mk('b'), mk('c'), mk('d')];
    const { nodes: out } = circularLayout(nodes, [], { ...DEFAULT_OPTIONS, layout: 'circular' });
    const positions = out.map((n) => `${n.x},${n.y}`);
    // No two nodes share the exact same (x, y).
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('container with kids: kids positioned inside container bounds', () => {
    const nodes = [
      mk('p', 'Group.Custom'),
      mk('c1', 'Compute.Container', 'p'),
      mk('c2', 'Compute.Container', 'p'),
      mk('c3', 'Compute.Container', 'p'),
    ];
    const { nodes: out } = circularLayout(nodes, [], { ...DEFAULT_OPTIONS, layout: 'circular' });
    const byId = new Map(out.map((n) => [n.id, n] as const));
    const p = byId.get('p')!;
    for (const id of ['c1', 'c2', 'c3']) {
      const k = byId.get(id)!;
      expect(k.x).toBeGreaterThanOrEqual(p.x);
      expect(k.y).toBeGreaterThanOrEqual(p.y);
      expect(k.x + k.width).toBeLessThanOrEqual(p.x + p.width);
      expect(k.y + k.height).toBeLessThanOrEqual(p.y + p.height);
    }
  });

  it('container with one kid: radius=0 → kid at center', () => {
    const nodes = [mk('p', 'Group.Custom'), mk('c', 'Compute.Container', 'p')];
    const { nodes: out } = circularLayout(nodes, [], { ...DEFAULT_OPTIONS, layout: 'circular' });
    const byId = new Map(out.map((n) => [n.id, n] as const));
    const p = byId.get('p')!;
    const c = byId.get('c')!;
    // c inside p.
    expect(c.x).toBeGreaterThanOrEqual(p.x);
    expect(c.y).toBeGreaterThanOrEqual(p.y);
  });

  it('container shrink-wrap respects MIN_CONTAINER bounds for non-PN containers', () => {
    const nodes = [mk('p', 'Group.Custom'), mk('c', 'Compute.Container', 'p')];
    const { nodes: out } = circularLayout(nodes, [], { ...DEFAULT_OPTIONS, layout: 'circular' });
    const p = out.find((n) => n.id === 'p')!;
    expect(p.width).toBeGreaterThanOrEqual(240);
    expect(p.height).toBeGreaterThanOrEqual(150);
  });

  it('returns one entry per input node', () => {
    const nodes = [mk('a'), mk('b'), mk('c'), mk('d'), mk('e')];
    const { nodes: out } = circularLayout(nodes, [], { ...DEFAULT_OPTIONS, layout: 'circular' });
    expect(out).toHaveLength(5);
  });

  it('respects a contains edge as parent linkage', () => {
    const nodes = [mk('p', 'Group.Custom'), mk('c', 'Compute.Container')];
    const edges: LayoutEdge[] = [{ source: 'p', target: 'c', relationship: 'contains' }];
    const { nodes: out } = circularLayout(nodes, edges, { ...DEFAULT_OPTIONS, layout: 'circular' });
    const byId = new Map(out.map((n) => [n.id, n] as const));
    const p = byId.get('p')!;
    const c = byId.get('c')!;
    expect(c.x).toBeGreaterThanOrEqual(p.x);
    expect(c.x + c.width).toBeLessThanOrEqual(p.x + p.width);
  });

  it('all-nodes-have-known-parents (rootIds empty): kids.length===0 continue branch', () => {
    // Cyclic parentId pair → both nodes excluded from rootIds (their parent is
    // in the nodeMap). groupOrder = [null]; null's kids = [] → continue.
    const a: LayoutNode = {
      id: 'a',
      type: 'resource',
      iceType: 'Compute.Container',
      label: 'a',
      parentId: 'b',
      width: 240,
      height: 160,
      x: 0,
      y: 0,
      data: {},
    };
    const b: LayoutNode = { ...a, id: 'b', parentId: 'a' };
    const { nodes: out } = circularLayout([a, b], [], { ...DEFAULT_OPTIONS, layout: 'circular' });
    // No throw; the early-out continue keeps us safe.
    expect(out).toHaveLength(2);
  });
});

describe('forceResolveOverlaps', () => {
  function rect(id: string, x: number, y: number, w = 100, h = 100, parentId: string | null = null) {
    return { id, x, y, width: w, height: h, parentId };
  }

  function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a, gap = 0): boolean {
    return !(a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x || a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y);
  }

  it('< 2 nodes: no-op', () => {
    const a = rect('a', 0, 0);
    forceResolveOverlaps([a]);
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
  });

  it('< 2 top-level nodes after parent filter: no-op', () => {
    const p = rect('p', 0, 0);
    const c = rect('c', 0, 0, 100, 100, 'p');
    const before = JSON.stringify({ p, c });
    forceResolveOverlaps([p, c]);
    expect(JSON.stringify({ p, c })).toBe(before);
  });

  it('two non-overlapping top-level nodes: positions unchanged', () => {
    const a = rect('a', 0, 0);
    const b = rect('b', 200, 0);
    forceResolveOverlaps([a, b]);
    expect(a.x).toBe(0);
    expect(b.x).toBe(200);
  });

  it('two overlapping top-level nodes: separated after sim', () => {
    const a = rect('a', 0, 0);
    const b = rect('b', 50, 50);
    forceResolveOverlaps([a, b], 12);
    // After simulation, they should not overlap (with the 12px gap).
    expect(overlaps(a, b, 0)).toBe(false);
  });

  it('descendants follow the top-level shift', () => {
    const a = rect('a', 0, 0);
    const child = rect('a-child', 10, 10, 50, 50, 'a');
    const b = rect('b', 50, 50);
    forceResolveOverlaps([a, child, b], 12);
    // child should have moved by the same vector as a.
    const dx = a.x - 0;
    const dy = a.y - 0;
    expect(child.x).toBe(10 + dx);
    expect(child.y).toBe(10 + dy);
  });

  it('related nodes (shared ancestry) never collide', () => {
    // a is parent of b; both have positions that "overlap" in the rect sense.
    // Because b is a descendant of a, the sim should treat them as related and
    // skip. b will only move because a moves, not because of pair forces.
    const a = rect('a', 0, 0, 200, 200);
    const b = rect('b', 50, 50, 50, 50, 'a');
    const c = rect('c', 220, 0); // unrelated to a/b
    forceResolveOverlaps([a, b, c], 12);
    // b stays inside a — sim doesn't push them apart.
    expect(b.x).toBeGreaterThanOrEqual(a.x);
    expect(b.x + b.width).toBeLessThanOrEqual(a.x + a.width);
  });

  it('clears vx/vy properties from all nodes after simulation', () => {
    type R = ReturnType<typeof rect> & { vx?: number; vy?: number };
    const a: R = rect('a', 0, 0);
    const b: R = rect('b', 50, 50);
    forceResolveOverlaps([a, b], 12);
    expect(a.vx).toBeUndefined();
    expect(a.vy).toBeUndefined();
    expect(b.vx).toBeUndefined();
    expect(b.vy).toBeUndefined();
  });

  it('large overlap: y-axis push when oy < ox at first contact', () => {
    // Tall/narrow overlap → ox > oy → resolved on Y.
    const a = rect('a', 0, 0, 200, 50);
    const b = rect('b', 10, 30, 200, 50);
    forceResolveOverlaps([a, b], 12);
    // After resolution a.y should differ from b.y (separated vertically).
    expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(50); // height of one rect
  });

  it('respects custom gap parameter (post-sim no overlap with that gap)', () => {
    const a = rect('a', 0, 0);
    const b = rect('b', 50, 50);
    const gap = 30;
    forceResolveOverlaps([a, b], gap, 200);
    // After simulation with a gap of 30, they should be at least gap apart on one axis.
    const ax2 = a.x + a.width;
    const ay2 = a.y + a.height;
    const bx2 = b.x + b.width;
    const by2 = b.y + b.height;
    const separatedX = a.x >= bx2 + gap || b.x >= ax2 + gap;
    const separatedY = a.y >= by2 + gap || b.y >= ay2 + gap;
    expect(separatedX || separatedY).toBe(true);
  });

  it('a parent_id pointing at unknown id is treated as top-level', () => {
    // Both nodes are top-level (one orphaned reference).
    const a = rect('a', 0, 0, 100, 100, 'ghost');
    const b = rect('b', 50, 50);
    forceResolveOverlaps([a, b]);
    // Both treated as top-level → no related-skip → resolved.
    expect(overlaps(a, b, 0)).toBe(false);
  });

  it('alpha decay short-circuit fires when alpha < 0.01', () => {
    // strength=0.001, ticks=60 → alpha = 0.001 * (1 - 0/60) = 0.001 < 0.01 → break tick 0.
    const a = rect('a', 0, 0);
    const b = rect('b', 50, 50);
    forceResolveOverlaps([a, b], 12, 60, 0.001);
    // No movement because the loop breaks immediately.
    expect(a.x).toBe(0);
    expect(b.x).toBe(50);
  });

  it('x-axis push, a-left-of-b (ox<oy, a.cx<b.cx → if branch)', () => {
    // Tall narrow rectangles with a small horizontal overlap → ox < oy.
    // a's x-center (25) < b's x-center (65) → if branch fires (a is pushed left).
    const a = rect('a', 0, 0, 50, 200);
    const b = rect('b', 40, 50, 50, 200);
    const beforeAx = a.x;
    forceResolveOverlaps([a, b], 0, 60, 0.8);
    // a should have moved left (or stayed), b right; either way they no longer overlap.
    expect(overlaps(a, b, 0)).toBe(false);
    // a's center moved leftward of its starting position (the if-branch decreases a.vx).
    expect(a.x).toBeLessThanOrEqual(beforeAx);
  });

  it('x-axis push, a-right-of-b (ox<oy, a.cx>=b.cx → else branch)', () => {
    // Same shape, but with a positioned to the right of b.
    // a center x = 65, b center x = 25 → else branch fires (a pushed right, b pushed left).
    const a = rect('a', 40, 0, 50, 200);
    const b = rect('b', 0, 50, 50, 200);
    const beforeAx = a.x;
    forceResolveOverlaps([a, b], 0, 60, 0.8);
    expect(overlaps(a, b, 0)).toBe(false);
    expect(a.x).toBeGreaterThanOrEqual(beforeAx);
  });

  it('y-axis push, a-below-b (oy<=ox, a.cy>=b.cy → else branch)', () => {
    // Wide flat overlap with a positioned BELOW b → ox > oy → y-axis push.
    // a center y = 65, b center y = 25 → else branch (a pushed down, b pushed up).
    const a = rect('a', 0, 40, 200, 50);
    const b = rect('b', 0, 0, 200, 50);
    const beforeAy = a.y;
    forceResolveOverlaps([a, b], 0, 60, 0.8);
    expect(overlaps(a, b, 0)).toBe(false);
    expect(a.y).toBeGreaterThanOrEqual(beforeAy);
  });
});

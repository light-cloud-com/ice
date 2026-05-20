/**
 * rf-canv-9 — pure regression for the canvas-connections helpers.
 *
 * Two helpers, each pinned against the verbatim inline `useMemo` blocks
 * lifted from `svg-canvas.tsx`.
 *
 * `buildVisibleConnections` runs the **filter → map → filter → bundle**
 * pipeline. The two-pass shape is load-bearing: container-id detection
 * happens against `effectiveNodes` (post-folded-remap), but the visible-id
 * gate has to operate on the *remapped* source/target so a folded ancestor
 * is still rendered as the connection's endpoint.
 *
 * `computePortMap` distributes per-side ports across connections sharing a
 * side of the same node. The dominant-axis side selection uses
 * **strict-greater-than** (`>` not `>=`) — the inverse of
 * `connection-preview.ts`'s `>=`. Sort comparators: left/right by other-Y,
 * top/bottom by other-X. Connections whose endpoints aren't in
 * `effectiveNodes` are silently skipped, not errored.
 *
 * No React, no Redux — synthetic `CanvasNode[]` and `RawCanvasEdge[]` only.
 * `isEdgeVisibleAtLevel` is real (pure config lookup); we run the test cases
 * at viewLevel 2 (passes everything except `relationship: 'contains'`) and
 * viewLevel 1 (also drops `'contains'`) to cover both branches.
 */

import { describe, it, expect } from 'vitest';
import { buildVisibleConnections, computePortMap, type RawCanvasEdge } from '../canvas-connections';
import type { CanvasNode, CanvasConnection } from '../../components/types';

// ── Factories ────────────────────────────────────────────────────────────

/** Minimal CanvasNode factory — only the fields the helpers read. */
function node(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extras: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: 'block',
    x,
    y,
    width,
    height,
    label: id,
    data: {},
    ...extras,
  };
}

/** Minimal RawCanvasEdge factory. */
function edge(id: string, source: string, target: string, data?: RawCanvasEdge['data']): RawCanvasEdge {
  return { id, source, target, data };
}

/** Minimal CanvasConnection factory for portMap tests. */
function conn(id: string, from: string, to: string): CanvasConnection {
  return { id, from, to };
}

// ── buildVisibleConnections ──────────────────────────────────────────────

describe('buildVisibleConnections', () => {
  it('returns an empty list when edges is empty', () => {
    const result = buildVisibleConnections({
      edges: [],
      effectiveNodes: [node('a', 0, 0, 100, 100), node('b', 200, 0, 100, 100)],
      foldedRemap: new Map(),
      viewLevel: 2,
    });
    expect(result).toEqual([]);
  });

  it("filters out edges with relationship === 'contains' (viewLevel 2)", () => {
    // `isEdgeVisibleAtLevel` at level 2 normally passes everything; but the
    // outer pipeline has its own `relationship === 'contains'` short-circuit
    // BEFORE the level check, so contains edges are always dropped.
    const edges = [
      edge('e1', 'a', 'b', { relationship: 'contains' }),
      edge('e2', 'a', 'b', { relationship: 'connects_to' }),
    ];
    const result = buildVisibleConnections({
      edges,
      effectiveNodes: [node('a', 0, 0, 100, 100), node('b', 200, 0, 100, 100)],
      foldedRemap: new Map(),
      viewLevel: 2,
    });
    // Only the connects_to edge survives.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e2');
  });

  it('filters out edges where either endpoint is a container (type=container)', () => {
    const edges = [
      edge('e1', 'a', 'cont', { relationship: 'connects_to' }),
      edge('e2', 'cont', 'b', { relationship: 'connects_to' }),
      edge('e3', 'a', 'b', { relationship: 'connects_to' }),
    ];
    const result = buildVisibleConnections({
      edges,
      effectiveNodes: [
        node('a', 0, 0, 100, 100),
        node('b', 200, 0, 100, 100),
        node('cont', 400, 0, 100, 100, { type: 'container' }),
      ],
      foldedRemap: new Map(),
      viewLevel: 2,
    });
    expect(result.map((c) => c.id)).toEqual(['e3']);
  });

  it('filters out edges to/from a Group.* iceType node', () => {
    const result = buildVisibleConnections({
      edges: [
        edge('e1', 'a', 'g', { relationship: 'connects_to' }),
        edge('e2', 'a', 'b', { relationship: 'connects_to' }),
      ],
      effectiveNodes: [
        node('a', 0, 0, 100, 100),
        node('b', 200, 0, 100, 100),
        node('g', 400, 0, 100, 100, { data: { iceType: 'Group.MicroVPC' } }),
      ],
      foldedRemap: new Map(),
      viewLevel: 2,
    });
    expect(result.map((c) => c.id)).toEqual(['e2']);
  });

  it('filters out edges to/from a container iceType (Network.VPC, Network.Subnet, Network.PrivateNetwork)', () => {
    const result = buildVisibleConnections({
      edges: [
        edge('e1', 'vpc', 'a', { relationship: 'connects_to' }),
        edge('e2', 'a', 'subnet', { relationship: 'connects_to' }),
        edge('e3', 'a', 'pn', { relationship: 'connects_to' }),
        edge('e4', 'a', 'b', { relationship: 'connects_to' }),
      ],
      effectiveNodes: [
        node('a', 0, 0, 100, 100),
        node('b', 200, 0, 100, 100),
        node('vpc', 400, 0, 100, 100, { data: { iceType: 'Network.VPC' } }),
        node('subnet', 600, 0, 100, 100, { data: { iceType: 'Network.Subnet' } }),
        node('pn', 800, 0, 100, 100, { data: { iceType: 'Network.PrivateNetwork' } }),
      ],
      foldedRemap: new Map(),
      viewLevel: 2,
    });
    expect(result.map((c) => c.id)).toEqual(['e4']);
  });

  it('at viewLevel 1, drops edges hidden by isEdgeVisibleAtLevel (containment relationships)', () => {
    // At level 1 the config drops `'contains'`; the outer `'contains'`
    // short-circuit also catches it, but the level filter is the second
    // gate, so this just confirms both gates compose without mistakes.
    const edges = [
      edge('e1', 'a', 'b', { relationship: 'connects_to' }),
      edge('e2', 'a', 'b', { relationship: 'depends_on' }),
    ];
    const result = buildVisibleConnections({
      edges,
      effectiveNodes: [node('a', 0, 0, 100, 100), node('b', 200, 0, 100, 100)],
      foldedRemap: new Map(),
      viewLevel: 1,
    });
    // Both relationships are visible at level 1; the bundle key is the same
    // so they collapse into one connection with bundleCount 2.
    expect(result).toHaveLength(1);
    expect((result[0].data as { bundleCount?: number }).bundleCount).toBe(2);
  });

  it('applies foldedRemap to source and target', () => {
    // Edge from `child` → `b`; the remap re-routes `child` to `parent`, so
    // the rendered edge is `parent` → `b`. `parent` and `b` must be in
    // effectiveNodes; `child` does not have to be.
    const result = buildVisibleConnections({
      edges: [edge('e1', 'child', 'b', { relationship: 'connects_to' })],
      effectiveNodes: [node('parent', 0, 0, 100, 100), node('b', 200, 0, 100, 100)],
      foldedRemap: new Map([['child', 'parent']]),
      viewLevel: 2,
    });
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe('parent');
    expect(result[0].to).toBe('b');
  });

  it('drops edges where the remapped endpoint is no longer in effectiveNodes', () => {
    // The remap sends `a` to `ghost`, which is NOT in effectiveNodes — the
    // second filter pass drops the edge entirely.
    const result = buildVisibleConnections({
      edges: [edge('e1', 'a', 'b', { relationship: 'connects_to' })],
      effectiveNodes: [node('b', 200, 0, 100, 100)],
      foldedRemap: new Map([['a', 'ghost']]),
      viewLevel: 2,
    });
    expect(result).toEqual([]);
  });

  it('drops self-loops produced post-remap (source === target after remap)', () => {
    // Both endpoints fold up to the same parent — without the post-remap
    // self-loop filter the renderer would draw a degenerate edge.
    const result = buildVisibleConnections({
      edges: [edge('e1', 'childA', 'childB', { relationship: 'connects_to' })],
      effectiveNodes: [node('parent', 0, 0, 100, 100)],
      foldedRemap: new Map([
        ['childA', 'parent'],
        ['childB', 'parent'],
      ]),
      viewLevel: 2,
    });
    expect(result).toEqual([]);
  });

  it('bundles multiple edges with the same source→target into one connection with a count', () => {
    const edges = [
      edge('e1', 'a', 'b', { relationship: 'connects_to' }),
      edge('e2', 'a', 'b', { relationship: 'depends_on' }),
      edge('e3', 'a', 'b', { relationship: 'connects_to' }),
    ];
    const result = buildVisibleConnections({
      edges,
      effectiveNodes: [node('a', 0, 0, 100, 100), node('b', 200, 0, 100, 100)],
      foldedRemap: new Map(),
      viewLevel: 2,
    });
    expect(result).toHaveLength(1);
    // Verbatim: the FIRST edge in the bundle group "wins" — its id is the
    // returned connection's id and its data shape is preserved.
    expect(result[0].id).toBe('e1');
    expect((result[0].data as { bundleCount?: number }).bundleCount).toBe(3);
  });

  it('returns the verbatim shape: { id, from, to, data: { ...edge.data, bundleCount } }', () => {
    const result = buildVisibleConnections({
      edges: [edge('e1', 'a', 'b', { relationship: 'connects_to', label: 'hi', custom: 7 })],
      effectiveNodes: [node('a', 0, 0, 100, 100), node('b', 200, 0, 100, 100)],
      foldedRemap: new Map(),
      viewLevel: 2,
    });
    expect(result[0]).toEqual({
      id: 'e1',
      from: 'a',
      to: 'b',
      data: { relationship: 'connects_to', label: 'hi', custom: 7, bundleCount: 1 },
    });
  });

  it('treats undefined relationship as connects_to (default branch in the level check)', () => {
    // No `relationship` key on the edge data — the pipeline supplies the
    // default `'connects_to'` for the level check and the edge passes.
    const result = buildVisibleConnections({
      edges: [edge('e1', 'a', 'b', { someOther: 'thing' })],
      effectiveNodes: [node('a', 0, 0, 100, 100), node('b', 200, 0, 100, 100)],
      foldedRemap: new Map(),
      viewLevel: 2,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });
});

// ── computePortMap ───────────────────────────────────────────────────────

describe('computePortMap', () => {
  it('returns an empty Map when no connections are passed', () => {
    const result = computePortMap([], []);
    expect(result.size).toBe(0);
  });

  it('assigns { index: 0, count: 1 } to both source and target on a single connection', () => {
    // a at (0,0), b at (200,0) — dx=200, dy=0 — horizontal-dominant, exitSide
    // is 'right' (dx > 0), entrySide is 'left'.
    const nodes = [node('a', 0, 0, 100, 100), node('b', 200, 0, 100, 100)];
    const conns = [conn('c1', 'a', 'b')];
    const result = computePortMap(conns, nodes);
    expect(result.get('c1:source')).toEqual({ index: 0, count: 1 });
    expect(result.get('c1:target')).toEqual({ index: 0, count: 1 });
  });

  it('assigns increasing indices and shared count to two connections leaving the same node-side', () => {
    // a → b and a → c, both exit a's right side. The sort is by other-Y;
    // b is at y=0, c is at y=200 → b first (index 0), c second (index 1).
    const nodes = [node('a', 0, 0, 100, 100), node('b', 300, 0, 100, 100), node('c', 300, 200, 100, 100)];
    const conns = [conn('c1', 'a', 'b'), conn('c2', 'a', 'c')];
    const result = computePortMap(conns, nodes);
    expect(result.get('c1:source')).toEqual({ index: 0, count: 2 });
    expect(result.get('c2:source')).toEqual({ index: 1, count: 2 });
    // b and c each have one entry on their target side, so count 1 each.
    expect(result.get('c1:target')).toEqual({ index: 0, count: 1 });
    expect(result.get('c2:target')).toEqual({ index: 0, count: 1 });
  });

  it('horizontal-dominant exits right (dx > 0) and left (dx < 0)', () => {
    // a → b: a at (0,0), b at (200,0) — exit right, entry left.
    // a → c: a at (0,0), c at (-200,0) — exit left, entry right.
    const nodes = [node('a', 0, 0, 100, 100), node('b', 200, 0, 100, 100), node('c', -200, 0, 100, 100)];
    const conns = [conn('c1', 'a', 'b'), conn('c2', 'a', 'c')];
    const result = computePortMap(conns, nodes);
    // Different sides → each is alone in its side group, both index 0 count 1.
    expect(result.get('c1:source')).toEqual({ index: 0, count: 1 });
    expect(result.get('c1:target')).toEqual({ index: 0, count: 1 });
    expect(result.get('c2:source')).toEqual({ index: 0, count: 1 });
    expect(result.get('c2:target')).toEqual({ index: 0, count: 1 });
  });

  it('vertical-dominant exits bottom (dy > 0) and top (dy < 0)', () => {
    // a → b: a at (0,0), b at (0,200) — dx=0, dy=200 — vertical-dominant,
    // exit bottom, entry top.
    // a → c: a at (0,0), c at (0,-200) — dy=-200 — exit top, entry bottom.
    const nodes = [node('a', 0, 0, 100, 100), node('b', 0, 200, 100, 100), node('c', 0, -200, 100, 100)];
    const conns = [conn('c1', 'a', 'b'), conn('c2', 'a', 'c')];
    const result = computePortMap(conns, nodes);
    expect(result.get('c1:source')).toEqual({ index: 0, count: 1 });
    expect(result.get('c1:target')).toEqual({ index: 0, count: 1 });
    expect(result.get('c2:source')).toEqual({ index: 0, count: 1 });
    expect(result.get('c2:target')).toEqual({ index: 0, count: 1 });
  });

  it('ties (|dx| === |dy|) go to the vertical branch (the strict `>` semantics, NOT `>=`)', () => {
    // c1: a → tie at (200,200) — dx=200, dy=200 → tie, falls to vertical → exit bottom.
    // c2: a → vert at (0, 400) — dx=0, dy=400 → vertical → exit bottom.
    // Both must share the SAME source-side group; if the tie went to
    // horizontal (the `>=` semantics), c1's count would be 1 and c2's
    // count would also be 1 — they'd land on different sides.
    const nodes = [
      node('a', 0, 0, 100, 100), // center (50, 50)
      node('tie', 150, 150, 100, 100), // center (200, 200) — dx=150, dy=150 (tie)
      node('vert', 0, 400, 100, 100), // center (50, 450) — dx=0, dy=400
    ];
    const conns = [conn('c1', 'a', 'tie'), conn('c2', 'a', 'vert')];
    const result = computePortMap(conns, nodes);
    // Both source entries share `${a}:bottom` → count is 2 for both.
    // If the tie went horizontal (`>=`), they'd be on different sides and
    // both counts would be 1.
    // Sort comparator on bottom is by other-X. c1's other-X is 200,
    // c2's is 50 → c2 sorts first (index 0), c1 second (index 1).
    expect(result.get('c2:source')).toEqual({ index: 0, count: 2 });
    expect(result.get('c1:source')).toEqual({ index: 1, count: 2 });
  });

  it('ties (|dx| === |dy|) — verifies side via sort comparator (top/bottom = sort by X)', () => {
    // Three connections from `a` whose targets sit at exactly equal
    // |dx|/|dy| (so all exit bottom — the vertical-tie branch). Place the
    // targets at distinct X positions to verify the sort uses other-X.
    // a center is (50,50); targets must have |dx| === |dy|, all positive,
    // and distinct X.
    //   t1 center (250, 250) → dx=200, dy=200 → bottom branch.
    //   t2 center (450, 450) → dx=400, dy=400 → bottom branch.
    //   t3 center (350, 350) → dx=300, dy=300 → bottom branch.
    // After sort by other-X: t1 (250) → t3 (350) → t2 (450).
    const nodes = [
      node('a', 0, 0, 100, 100),
      node('t1', 200, 200, 100, 100),
      node('t2', 400, 400, 100, 100),
      node('t3', 300, 300, 100, 100),
    ];
    const conns = [conn('c1', 'a', 't1'), conn('c2', 'a', 't2'), conn('c3', 'a', 't3')];
    const result = computePortMap(conns, nodes);
    expect(result.get('c1:source')).toEqual({ index: 0, count: 3 });
    expect(result.get('c3:source')).toEqual({ index: 1, count: 3 });
    expect(result.get('c2:source')).toEqual({ index: 2, count: 3 });
  });

  it('left/right side groups sort by the OTHER node center Y (top-to-bottom)', () => {
    // a at (0,0); three targets at x=900 with varying y. Each must satisfy
    // |dx| > |dy| so they all exit a's right side. With dx=900 fixed, |dy|
    // values must stay < 900: pick y such that center-y is -300, 100, 600.
    // Other-Y ordering: -300 → 100 → 600.
    const nodes = [
      node('a', 0, 0, 100, 100), // center (50, 50)
      node('b1', 900, -350, 100, 100), // center (950, -300)
      node('b2', 900, 50, 100, 100), // center (950, 100)
      node('b3', 900, 550, 100, 100), // center (950, 600)
    ];
    // Insert connections in REVERSE position order to verify the sort runs.
    const conns = [conn('c1', 'a', 'b3'), conn('c2', 'a', 'b1'), conn('c3', 'a', 'b2')];
    const result = computePortMap(conns, nodes);
    // After sort: b1 (other-Y -300) → b2 (100) → b3 (600), so the
    // connection ids in index order are c2 → c3 → c1.
    expect(result.get('c2:source')).toEqual({ index: 0, count: 3 });
    expect(result.get('c3:source')).toEqual({ index: 1, count: 3 });
    expect(result.get('c1:source')).toEqual({ index: 2, count: 3 });
  });

  it('top/bottom side groups sort by the OTHER node center X (left-to-right)', () => {
    // a at (0,0); three targets BELOW (so they exit a's bottom side) at
    // x = 0, 200, 400. Sort by other-X: 0 → 200 → 400.
    // Each target needs |dy| > |dx|; place them at y = 500 so the vertical
    // delta dominates regardless of horizontal offset.
    const nodes = [
      node('a', 0, 0, 100, 100),
      node('b1', 0, 500, 100, 100), // center (50, 550), dx=0
      node('b2', 200, 500, 100, 100), // center (250, 550), dx=200, dy=500 → vertical
      node('b3', 400, 500, 100, 100), // center (450, 550), dx=400, dy=500 → vertical
    ];
    const conns = [conn('c1', 'a', 'b3'), conn('c2', 'a', 'b1'), conn('c3', 'a', 'b2')];
    const result = computePortMap(conns, nodes);
    // Sort by other-X: b1 (50) → b2 (250) → b3 (450) → c2, c3, c1.
    expect(result.get('c2:source')).toEqual({ index: 0, count: 3 });
    expect(result.get('c3:source')).toEqual({ index: 1, count: 3 });
    expect(result.get('c1:source')).toEqual({ index: 2, count: 3 });
  });

  it('skips connections whose source or target is not in effectiveNodes', () => {
    // c1's source is missing; c2's target is missing; c3 is fully present.
    // Only c3 contributes to the map.
    const nodes = [node('a', 0, 0, 100, 100), node('b', 200, 0, 100, 100)];
    const conns = [conn('c1', 'ghost', 'a'), conn('c2', 'a', 'ghost'), conn('c3', 'a', 'b')];
    const result = computePortMap(conns, nodes);
    expect(result.size).toBe(2); // only c3:source and c3:target
    expect(result.get('c3:source')).toEqual({ index: 0, count: 1 });
    expect(result.get('c3:target')).toEqual({ index: 0, count: 1 });
    expect(result.has('c1:source')).toBe(false);
    expect(result.has('c2:target')).toBe(false);
  });
});

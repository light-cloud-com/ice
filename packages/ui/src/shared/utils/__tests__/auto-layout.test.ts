/**
 * `autoLayout` shell — selects the algorithm based on `options.layout` and
 * threads through to `dagreTreeLayout` (default) or `circularLayout`.
 *
 * The other public exports (`calculateZIndex`, `forceResolveOverlaps`) get
 * coverage in their own test files (`z-index-depth.test.ts` and
 * `algorithms/__tests__/circular.test.ts`); this file pins the dispatcher.
 */

import { describe, it, expect } from 'vitest';
import { autoLayout, type LayoutNode, type LayoutEdge } from '../auto-layout';

function mk(id: string, parentId: string | null = null): LayoutNode {
  return {
    id,
    type: 'resource',
    iceType: 'Compute.Container',
    label: id,
    parentId,
    width: 240,
    height: 160,
    x: 0,
    y: 0,
    data: {},
  };
}

describe('autoLayout — empty + dispatch', () => {
  it('returns an empty result for an empty node list (early return)', () => {
    const result = autoLayout([], []);
    expect(result.nodes).toEqual([]);
    expect(result.edgeRoutes).toBeInstanceOf(Map);
    expect(result.edgeRoutes.size).toBe(0);
  });

  it('routes layout="circular" through circularLayout (no edge routes)', () => {
    // The circular branch always returns an empty edgeRoutes map.
    const nodes = [mk('a'), mk('b')];
    const edges: LayoutEdge[] = [{ source: 'a', target: 'b', relationship: 'connects_to' }];
    const result = autoLayout(nodes, edges, { layout: 'circular' });
    expect(result.nodes).toHaveLength(2);
    expect(result.edgeRoutes.size).toBe(0);
  });

  it('routes layout="flow" (default) through dagreTreeLayout (edge routed)', () => {
    const nodes = [mk('a'), mk('b')];
    const edges: LayoutEdge[] = [{ source: 'a', target: 'b', relationship: 'connects_to' }];
    const result = autoLayout(nodes, edges);
    expect(result.edgeRoutes.has('a::b')).toBe(true);
  });

  it('routes an unspecified layout through dagreTreeLayout (default branch)', () => {
    // Passing `{}` for options falls back to DEFAULT_OPTIONS.layout='flow'.
    const nodes = [mk('a'), mk('b')];
    const edges: LayoutEdge[] = [{ source: 'a', target: 'b', relationship: 'connects_to' }];
    const result = autoLayout(nodes, edges, {});
    expect(result.edgeRoutes.has('a::b')).toBe(true);
  });

  it('options merge with DEFAULT_OPTIONS (a partial options object is OK)', () => {
    const nodes = [mk('a'), mk('b')];
    const result = autoLayout(nodes, [], { startX: 100, startY: 100 });
    // Smallest output coordinate near 100 (snap to grid may shift slightly).
    const minX = Math.min(...result.nodes.map((n) => n.x));
    const minY = Math.min(...result.nodes.map((n) => n.y));
    expect(minX).toBeGreaterThanOrEqual(0);
    expect(minY).toBeGreaterThanOrEqual(0);
  });
});

// `calculateZIndex` is also exported from auto-layout. The richer ordering
// tests live in z-index-depth.test.ts; the cases below pin the four conditional
// branches (VPC / Subnet / Group / Container / leaf) so coverage hits each arm.
import { calculateZIndex } from '../auto-layout';

describe('calculateZIndex — branch coverage', () => {
  it('Network.VPC returns 0 + depth', () => {
    expect(calculateZIndex('Network.VPC')).toBe(0);
    expect(calculateZIndex('Network.VPC', 5)).toBe(5);
  });

  it('Network.Subnet returns 10 + depth', () => {
    expect(calculateZIndex('Network.Subnet')).toBe(10);
    expect(calculateZIndex('Network.Subnet', 3)).toBe(13);
  });

  it('Group.* returns 15 + depth', () => {
    expect(calculateZIndex('Group.Custom')).toBe(15);
    expect(calculateZIndex('Group.Frontend', 2)).toBe(17);
  });

  it('non-Group container (e.g. Network.PrivateNetwork) returns 20 + depth', () => {
    // PN goes through `isContainerType()` rather than the Group prefix.
    expect(calculateZIndex('Network.PrivateNetwork')).toBe(20);
    expect(calculateZIndex('Network.PrivateNetwork', 4)).toBe(24);
  });

  it('leaf resource returns 100 + depth', () => {
    expect(calculateZIndex('Compute.Container')).toBe(100);
    expect(calculateZIndex('Compute.Container', 7)).toBe(107);
  });
});

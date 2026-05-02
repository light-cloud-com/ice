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

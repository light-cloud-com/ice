/**
 * Hierarchy helpers — pure graph traversal. Fixture-driven tests cover
 * containment via `contains` edges, containment via `parentId`, the
 * precedence rule when both are present, orphaned references, and
 * post-order traversal of nested containers.
 */

import { describe, it, expect } from 'vitest';
import { buildHierarchy, collectRootIds, buildPostOrder } from '../hierarchy';
import type { LayoutNode, LayoutEdge } from '../types';

function n(id: string, parentId: string | null = null): LayoutNode {
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

function ce(source: string, target: string): LayoutEdge {
  return { source, target, relationship: 'contains' };
}

describe('buildHierarchy', () => {
  it('contains-edge derives parent/children maps', () => {
    const nodes = [n('p'), n('c1'), n('c2')];
    const edges: LayoutEdge[] = [ce('p', 'c1'), ce('p', 'c2')];
    const { parentOf, childrenOf } = buildHierarchy(nodes, edges);
    expect(parentOf.get('c1')).toBe('p');
    expect(parentOf.get('c2')).toBe('p');
    expect(childrenOf.get('p')).toEqual(['c1', 'c2']);
  });

  it('parentId derives parent/children maps', () => {
    const nodes = [n('p'), n('c1', 'p'), n('c2', 'p')];
    const { parentOf, childrenOf } = buildHierarchy(nodes, []);
    expect(parentOf.get('c1')).toBe('p');
    expect(parentOf.get('c2')).toBe('p');
    expect(childrenOf.get('p')).toEqual(['c1', 'c2']);
  });

  it('non-contains edges are ignored', () => {
    const nodes = [n('a'), n('b')];
    const edges: LayoutEdge[] = [{ source: 'a', target: 'b', relationship: 'connects_to' }];
    const { parentOf, childrenOf } = buildHierarchy(nodes, edges);
    expect(parentOf.size).toBe(0);
    expect(childrenOf.size).toBe(0);
  });

  it('contains edge with unknown source is dropped', () => {
    const nodes = [n('c')];
    const edges: LayoutEdge[] = [ce('ghost', 'c')];
    const { parentOf } = buildHierarchy(nodes, edges);
    expect(parentOf.size).toBe(0);
  });

  it('contains edge with unknown target is dropped', () => {
    const nodes = [n('p')];
    const edges: LayoutEdge[] = [ce('p', 'ghost')];
    const { parentOf } = buildHierarchy(nodes, edges);
    expect(parentOf.size).toBe(0);
  });

  it('parentId pointing at unknown node is dropped', () => {
    const nodes = [n('c', 'ghost')];
    const { parentOf, childrenOf } = buildHierarchy(nodes, []);
    expect(parentOf.size).toBe(0);
    expect(childrenOf.size).toBe(0);
  });

  it('contains-edge takes precedence over parentId on first match', () => {
    // Edge says c -> p1, parentId says p2.
    // Edges are processed first; once parentOf.has(c), the parentId branch is
    // a no-op for parentOf — but childrenOf still gets a duplicate-resistant
    // append.
    const nodes = [n('p1'), n('p2'), n('c', 'p2')];
    const edges: LayoutEdge[] = [ce('p1', 'c')];
    const { parentOf, childrenOf } = buildHierarchy(nodes, edges);
    expect(parentOf.get('c')).toBe('p1');
    // c shows up in BOTH p1 (via edge) and p2 (via parentId fallback for childrenOf).
    expect(childrenOf.get('p1')).toEqual(['c']);
    expect(childrenOf.get('p2')).toEqual(['c']);
  });

  it('duplicate contains edges do not create duplicate child entries', () => {
    const nodes = [n('p'), n('c')];
    const edges: LayoutEdge[] = [ce('p', 'c'), ce('p', 'c')];
    const { childrenOf } = buildHierarchy(nodes, edges);
    expect(childrenOf.get('p')).toEqual(['c']);
  });

  it('parentId-only when contains-edge is absent', () => {
    const nodes = [n('p'), n('c', 'p')];
    const { parentOf, childrenOf } = buildHierarchy(nodes, []);
    expect(parentOf.get('c')).toBe('p');
    expect(childrenOf.get('p')).toEqual(['c']);
  });

  it('combination of contains + parentId for the same pair: no duplicate child', () => {
    const nodes = [n('p'), n('c', 'p')];
    const edges: LayoutEdge[] = [ce('p', 'c')];
    const { childrenOf } = buildHierarchy(nodes, edges);
    expect(childrenOf.get('p')).toEqual(['c']);
  });

  it('handles empty inputs', () => {
    const { parentOf, childrenOf } = buildHierarchy([], []);
    expect(parentOf.size).toBe(0);
    expect(childrenOf.size).toBe(0);
  });
});

describe('collectRootIds', () => {
  it('returns top-level nodes (no parentId)', () => {
    const nodes = [n('a'), n('b'), n('c')];
    const map = new Map(nodes.map((x) => [x.id, x] as const));
    expect(collectRootIds(nodes, map)).toEqual(['a', 'b', 'c']);
  });

  it('excludes nodes with a parentId pointing at a known node', () => {
    const nodes = [n('p'), n('c', 'p')];
    const map = new Map(nodes.map((x) => [x.id, x] as const));
    expect(collectRootIds(nodes, map)).toEqual(['p']);
  });

  it('treats orphaned parentId references as roots', () => {
    const nodes = [n('p'), n('c', 'ghost')];
    const map = new Map(nodes.map((x) => [x.id, x] as const));
    expect(collectRootIds(nodes, map)).toEqual(['p', 'c']);
  });

  it('preserves input order', () => {
    const nodes = [n('z'), n('a'), n('m')];
    const map = new Map(nodes.map((x) => [x.id, x] as const));
    expect(collectRootIds(nodes, map)).toEqual(['z', 'a', 'm']);
  });

  it('null parentId is treated as root', () => {
    const nodes = [{ ...n('a'), parentId: null }];
    const map = new Map(nodes.map((x) => [x.id, x] as const));
    expect(collectRootIds(nodes, map)).toEqual(['a']);
  });
});

describe('buildPostOrder', () => {
  it('flat tree (no nesting): [null] only', () => {
    const order = buildPostOrder(['a', 'b', 'c'], new Map());
    expect(order).toEqual([null]);
  });

  it('one container with two leaves: [container, null]', () => {
    const childrenOf = new Map<string, string[]>([['p', ['c1', 'c2']]]);
    const order = buildPostOrder(['p'], childrenOf);
    expect(order).toEqual(['p', null]);
  });

  it('nested containers: inner container before outer, then null', () => {
    // structure: root -> p -> q -> [leaf]
    const childrenOf = new Map<string, string[]>([
      ['p', ['q']],
      ['q', ['leaf']],
    ]);
    const order = buildPostOrder(['p'], childrenOf);
    // q has children (leaf), so q is visited and pushed first; then p; then null.
    // leaf has no children — it's never pushed (post-order skips leaves).
    expect(order).toEqual(['q', 'p', null]);
  });

  it('two siblings with children: both visited in encounter order', () => {
    const childrenOf = new Map<string, string[]>([
      ['p1', ['c1']],
      ['p2', ['c2']],
      ['c1', ['leaf1']],
      ['c2', ['leaf2']],
    ]);
    const order = buildPostOrder(['p1', 'p2'], childrenOf);
    expect(order).toEqual(['c1', 'p1', 'c2', 'p2', null]);
  });

  it('null is always the last entry', () => {
    const childrenOf = new Map<string, string[]>([['p', ['c']]]);
    const order = buildPostOrder(['p'], childrenOf);
    expect(order[order.length - 1]).toBe(null);
  });

  it('does not revisit a container reachable through multiple paths', () => {
    // Pathological but possible: child appearing under two parents (shouldn't
    // really happen post-buildHierarchy but the post-order has its own visited
    // set so it must not loop).
    const childrenOf = new Map<string, string[]>([
      ['p1', ['shared']],
      ['p2', ['shared']],
      ['shared', ['leaf']],
    ]);
    const order = buildPostOrder(['p1', 'p2'], childrenOf);
    // shared visited once
    expect(order.filter((x) => x === 'shared').length).toBe(1);
    expect(order).toContain(null);
  });

  it('empty rootIds: [null] only', () => {
    const order = buildPostOrder([], new Map());
    expect(order).toEqual([null]);
  });
});

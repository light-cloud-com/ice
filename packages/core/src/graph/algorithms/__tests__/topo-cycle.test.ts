/**
 * Tests for `algorithms/topo-cycle.ts` (rf-galg-1).
 *
 * Behaviour preserved verbatim from pre-extraction L18-220 of
 * `graph/algorithms.ts`.
 */
import { describe, expect, it } from 'vitest';
import { find_cycles, has_cycle, reverse_topological_sort, topological_sort } from '../topo-cycle';
import { make_graph } from './fixtures';

describe('topological_sort', () => {
  it('returns nodes in dependency order for linear chain', () => {
    // a -> b -> c (a depends_on b, b depends_on c)
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    const result = topological_sort(graph);
    expect(result.success).toBe(true);
    if (!result.success || !result.order) throw new Error('expected success');
    // c has no deps -> emitted first; b depends on c only; a depends on b.
    const order_names = result.order.map((id) => {
      for (const n of graph.nodes.values()) if (n.id === id) return n.name;
      return id;
    });
    // Expected: c emitted first (no deps), then b, then a.
    expect(order_names.indexOf('c')).toBeLessThan(order_names.indexOf('b'));
    expect(order_names.indexOf('b')).toBeLessThan(order_names.indexOf('a'));
  });

  it('handles single node with no edges', () => {
    const graph = make_graph(['a'], []);
    const result = topological_sort(graph);
    expect(result.success).toBe(true);
    expect(result.order?.length).toBe(1);
  });

  it('handles disconnected nodes', () => {
    const graph = make_graph(['a', 'b', 'c'], []);
    const result = topological_sort(graph);
    expect(result.success).toBe(true);
    expect(result.order?.length).toBe(3);
  });

  it('detects simple cycle and returns failure', () => {
    // a -> b -> a (cycle)
    const graph = make_graph(
      ['a', 'b'],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    const result = topological_sort(graph);
    expect(result.success).toBe(false);
    expect(result.cycle).toBeDefined();
  });

  it('ignores non-depends_on edges', () => {
    // Only contains-relationship edges should not affect topological order
    const graph = make_graph(['a', 'b'], [['a', 'b', 'contains']]);
    const result = topological_sort(graph);
    expect(result.success).toBe(true);
    expect(result.order?.length).toBe(2);
  });
});

describe('reverse_topological_sort', () => {
  it('reverses topological order', () => {
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    const forward = topological_sort(graph);
    const reverse = reverse_topological_sort(graph);
    if (!forward.success || !forward.order) throw new Error('expected success');
    if (!reverse.success || !reverse.order) throw new Error('expected success');
    expect(reverse.order).toEqual(forward.order.slice().reverse());
  });

  it('propagates cycle failure unchanged', () => {
    const graph = make_graph(
      ['a', 'b'],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    const result = reverse_topological_sort(graph);
    expect(result.success).toBe(false);
  });
});

describe('has_cycle', () => {
  it('returns false for DAG', () => {
    const graph = make_graph(['a', 'b'], [['a', 'b']]);
    expect(has_cycle(graph)).toBe(false);
  });

  it('returns true for graph with cycle', () => {
    const graph = make_graph(
      ['a', 'b'],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    expect(has_cycle(graph)).toBe(true);
  });

  it('returns false for empty graph', () => {
    const graph = make_graph([], []);
    expect(has_cycle(graph)).toBe(false);
  });

  it('returns false for graph with only contains edges (cycle in non-depends-on relation)', () => {
    const graph = make_graph(
      ['a', 'b'],
      [
        ['a', 'b', 'contains'],
        ['b', 'a', 'contains'],
      ],
    );
    expect(has_cycle(graph)).toBe(false);
  });
});

describe('find_cycles', () => {
  it('returns empty for DAG', () => {
    const graph = make_graph(['a', 'b'], [['a', 'b']]);
    expect(find_cycles(graph)).toEqual([]);
  });

  it('finds simple two-node cycle', () => {
    const graph = make_graph(
      ['a', 'b'],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    const cycles = find_cycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
    // Each cycle starts and ends at the same node
    for (const cycle of cycles) {
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    }
  });

  it('finds three-node cycle', () => {
    // a -> b -> c -> a
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ],
    );
    const cycles = find_cycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('returns empty for empty graph', () => {
    const graph = make_graph([], []);
    expect(find_cycles(graph)).toEqual([]);
  });

  it('ignores non-depends_on edges', () => {
    const graph = make_graph(
      ['a', 'b'],
      [
        ['a', 'b', 'contains'],
        ['b', 'a', 'contains'],
      ],
    );
    expect(find_cycles(graph)).toEqual([]);
  });
});

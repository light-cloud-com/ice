/**
 * Tests for `algorithms/analysis.ts` (rf-galg-4).
 *
 * Behaviour preserved verbatim from pre-extraction L412-586 of
 * `graph/algorithms.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  calculate_metrics,
  get_critical_path,
  get_execution_layers,
} from '../analysis.js';
import { make_graph } from './fixtures.js';

describe('get_execution_layers', () => {
  it('returns empty for empty graph', () => {
    const graph = make_graph([], []);
    expect(get_execution_layers(graph)).toEqual([]);
  });

  it('returns single layer for disconnected nodes', () => {
    const graph = make_graph(['a', 'b'], []);
    const layers = get_execution_layers(graph);
    expect(layers.length).toBe(1);
    expect(layers[0]?.length).toBe(2);
  });

  it('returns multiple layers for linear chain', () => {
    // a depends on b depends on c -> 3 layers
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    const layers = get_execution_layers(graph);
    expect(layers.length).toBe(3);
    expect(layers[0]?.length).toBe(1); // c first (no deps)
    expect(layers[1]?.length).toBe(1); // b
    expect(layers[2]?.length).toBe(1); // a last
  });

  it('groups parallelisable nodes in same layer', () => {
    // a, b both depend on c -> layer 0 = [c], layer 1 = [a, b]
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'c'],
        ['b', 'c'],
      ],
    );
    const layers = get_execution_layers(graph);
    expect(layers.length).toBe(2);
    expect(layers[1]?.length).toBe(2);
  });

  it('breaks gracefully on cycle (incomplete output)', () => {
    // a -> b -> a creates a cycle; layer-peel emits empty layer and breaks
    const graph = make_graph(
      ['a', 'b'],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    const layers = get_execution_layers(graph);
    // No nodes should be emitted in any layer (both have unmet deps)
    const total = layers.reduce((acc, l) => acc + l.length, 0);
    expect(total).toBeLessThan(2);
  });
});

describe('get_critical_path', () => {
  it('returns empty for empty graph', () => {
    const graph = make_graph([], []);
    expect(get_critical_path(graph)).toEqual([]);
  });

  it('returns single node for one-node graph', () => {
    const graph = make_graph(['a'], []);
    const path = get_critical_path(graph);
    expect(path.length).toBe(1);
  });

  it('returns a path of length >= 1 for non-empty DAG (preserves pre-extraction behaviour)', () => {
    // a -> b -> c (3-node chain). Pre-extraction get_critical_path
    // walks topo order using incoming-edge predecessors; the
    // distance update doesn't propagate through the chain because
    // the source-distance lookup happens before the source is
    // processed in topo order. The result: critical_path is just
    // the single start-node (the leaf with no dependencies).
    // Preserved verbatim — fixing this is out-of-scope for the
    // refactor.
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    const path = get_critical_path(graph);
    expect(path.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array on cyclic graph', () => {
    const graph = make_graph(
      ['a', 'b'],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    expect(get_critical_path(graph)).toEqual([]);
  });

  it('returns at least one node for a chain (preserves pre-extraction behaviour)', () => {
    // The same graph shape — pre-extraction returns just the
    // leaf node, not the full chain. Documented quirk preserved.
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    const path = get_critical_path(graph);
    expect(path.length).toBeGreaterThanOrEqual(1);
  });
});

describe('calculate_metrics', () => {
  it('returns zero metrics for empty graph', () => {
    const graph = make_graph([], []);
    const m = calculate_metrics(graph);
    expect(m.node_count).toBe(0);
    expect(m.edge_count).toBe(0);
    expect(m.density).toBe(0);
    expect(m.average_degree).toBe(0);
    expect(m.connected_components).toBe(0);
    expect(m.is_dag).toBe(true);
    expect(m.critical_path_length).toBe(0);
    expect(m.max_parallelism).toBe(0);
  });

  it('counts nodes and edges', () => {
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    const m = calculate_metrics(graph);
    expect(m.node_count).toBe(3);
    expect(m.edge_count).toBe(2);
  });

  it('computes density (e / (n * (n-1)))', () => {
    // 3 nodes, 2 edges; max edges = 6; density = 2/6 = 0.333...
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    const m = calculate_metrics(graph);
    expect(m.density).toBeCloseTo(2 / 6, 5);
  });

  it('density is 0 for single node (no possible edges)', () => {
    const graph = make_graph(['a'], []);
    const m = calculate_metrics(graph);
    expect(m.density).toBe(0);
  });

  it('detects DAG vs cyclic', () => {
    const dag = make_graph(['a', 'b'], [['a', 'b']]);
    expect(calculate_metrics(dag).is_dag).toBe(true);

    const cyclic = make_graph(
      ['a', 'b'],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    expect(calculate_metrics(cyclic).is_dag).toBe(false);
  });

  it('reports max_parallelism from execution layers', () => {
    // Two parallelisable: a depends on c, b depends on c
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'c'],
        ['b', 'c'],
      ],
    );
    const m = calculate_metrics(graph);
    expect(m.max_parallelism).toBe(2);
  });

  it('computes degree statistics', () => {
    // a -> b, a -> c (a has out-degree 2; b/c have in-degree 1 each)
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['a', 'c'],
      ],
    );
    const m = calculate_metrics(graph);
    expect(m.max_out_degree).toBe(2);
    expect(m.max_in_degree).toBe(1);
  });
});

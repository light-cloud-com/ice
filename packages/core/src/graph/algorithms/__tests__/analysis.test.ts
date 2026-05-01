/**
 * Tests for `algorithms/analysis.ts` (rf-galg-4 + bugfix-3).
 *
 * `get_critical_path` was extracted verbatim in rf-galg-4 with a
 * documented quirk: the distance update walked `get_incoming_edges`
 * but in the topo order `topological_sort` emits (leaves-first for
 * `depends_on`), source distances were always `-Infinity` and the
 * chain never propagated. The function returned just the start
 * node for any DAG. bugfix-3 swaps the loop to walk
 * `get_outgoing_edges` and read the *target's* distance — target
 * is processed earlier in topo order, so the chain propagates.
 */
import { describe, expect, it } from 'vitest';
import {
  calculate_metrics,
  get_critical_path,
  get_execution_layers,
} from '../analysis.js';
import { make_graph, id_of } from './fixtures.js';

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

  it('returns the full chain for a 3-node depends_on chain (bugfix-3)', () => {
    // a depends_on b depends_on c. Edges: [a→b], [b→c]. Pre-fix
    // returned just `[c]` because the distance update walked
    // get_incoming_edges and read source distance — sources are
    // processed AFTER the current node in topo order, so the
    // lookup returned -Infinity and the chain never propagated.
    // Post-fix walks get_outgoing_edges and reads target distance:
    // for each node, examine its dependencies, take the
    // longest-yet path through them.
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    const path = get_critical_path(graph);
    expect(path.length).toBe(3);
    // Path is reported leaf-first → root-last: c (no deps) → b → a.
    expect(path).toEqual([id_of(graph, 'c'), id_of(graph, 'b'), id_of(graph, 'a')]);
  });

  it('returns the full 4-node chain (a→b→c→d, 3 hops)', () => {
    const graph = make_graph(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
      ],
    );
    const path = get_critical_path(graph);
    expect(path.length).toBe(4);
    expect(path).toEqual([
      id_of(graph, 'd'),
      id_of(graph, 'c'),
      id_of(graph, 'b'),
      id_of(graph, 'a'),
    ]);
  });

  it('picks one of the longest paths in a diamond DAG', () => {
    // a depends_on b, a depends_on c; b depends_on d; c depends_on d.
    // Edges: [a→b], [a→c], [b→d], [c→d].
    // Two equal-length paths exist: d→b→a and d→c→a (3 nodes each).
    // The algorithm picks whichever is encountered first when the
    // 'a' update fires; either is correct.
    const graph = make_graph(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'd'],
        ['c', 'd'],
      ],
    );
    const path = get_critical_path(graph);
    expect(path.length).toBe(3);
    expect(path[0]).toBe(id_of(graph, 'd'));
    expect(path[2]).toBe(id_of(graph, 'a'));
    // Middle node is either b or c — both valid longest paths.
    expect([id_of(graph, 'b'), id_of(graph, 'c')]).toContain(path[1]);
  });

  it('returns the single node for an isolated node', () => {
    const graph = make_graph(['solo'], []);
    const path = get_critical_path(graph);
    expect(path.length).toBe(1);
    expect(path[0]).toBe(id_of(graph, 'solo'));
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

  it('handles disconnected components: returns the longest of all chains', () => {
    // Two components: chain a→b (length 2) and isolated c (length 1).
    // The longest chain is a→b → 2 nodes.
    const graph = make_graph(
      ['a', 'b', 'c'],
      [['a', 'b']],
    );
    const path = get_critical_path(graph);
    expect(path.length).toBe(2);
    expect(path).toEqual([id_of(graph, 'b'), id_of(graph, 'a')]);
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

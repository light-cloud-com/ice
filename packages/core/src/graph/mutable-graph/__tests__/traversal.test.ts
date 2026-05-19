/**
 * Tests for `mutable-graph/traversal.ts`.
 */

import { describe, expect, it } from 'vitest';
import { create_node_id, type NodeInput } from '../../../types/graph';
import { edges_add_edge } from '../edges';
import { nodes_add_node } from '../nodes';
import {
  traversal_get_all_dependencies,
  traversal_get_all_dependents,
  traversal_get_dependencies,
  traversal_get_dependents,
  traversal_traverse,
} from '../traversal';
import { create_mutable_graph_state, type MutableGraphState } from '../types';

function input(name: string, type = 't.x'): NodeInput {
  return { type, name, properties: {} };
}

/**
 * Build a small DAG:
 *
 *   a -> b -> c
 *        |
 *        v
 *        d
 *
 * (all `depends_on`)
 */
function makeChain() {
  const state = create_mutable_graph_state();
  const a = nodes_add_node(state, input('a')).node!;
  const b = nodes_add_node(state, input('b')).node!;
  const c = nodes_add_node(state, input('c')).node!;
  const d = nodes_add_node(state, input('d')).node!;
  edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
  edges_add_edge(state, { source: b.id, target: c.id, relationship: 'depends_on' });
  edges_add_edge(state, { source: b.id, target: d.id, relationship: 'depends_on' });
  return { state, a, b, c, d };
}

describe('traversal_get_dependencies', () => {
  it('returns only nodes connected via outgoing depends_on', () => {
    const { state, b, c, d } = makeChain();
    const deps = traversal_get_dependencies(state, b.id);
    expect(deps.map((n) => n.id).sort()).toEqual([c.id, d.id].sort());
  });

  it('ignores non-depends_on relationships', () => {
    const state = create_mutable_graph_state();
    const a = nodes_add_node(state, input('a')).node!;
    const b = nodes_add_node(state, input('b')).node!;
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'connects_to' });
    expect(traversal_get_dependencies(state, a.id)).toEqual([]);
  });
});

describe('traversal_get_dependents', () => {
  it('returns only nodes connected via incoming depends_on', () => {
    const { state, a, b } = makeChain();
    const deps = traversal_get_dependents(state, b.id);
    expect(deps.map((n) => n.id)).toEqual([a.id]);
  });
});

describe('traversal_get_all_dependencies', () => {
  it('walks transitively, pre-order DFS, excluding the start node', () => {
    const { state, a, b, c, d } = makeChain();
    const all = traversal_get_all_dependencies(state, a.id);
    // Pre-order: visit a, push b, recurse → push c, recurse (none), pop, push d, recurse (none)
    expect(all.map((n) => n.id)).toEqual([b.id, c.id, d.id]);
  });

  it('handles cycles without infinite recursion', () => {
    const state = create_mutable_graph_state();
    const a = nodes_add_node(state, input('a')).node!;
    const b = nodes_add_node(state, input('b')).node!;
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    edges_add_edge(state, { source: b.id, target: a.id, relationship: 'depends_on' });
    const all = traversal_get_all_dependencies(state, a.id);
    expect(all.map((n) => n.id)).toEqual([b.id, a.id]);
  });
});

describe('traversal_get_all_dependents', () => {
  it('walks backward through depends_on edges', () => {
    const { state, a, b, c } = makeChain();
    const all = traversal_get_all_dependents(state, c.id);
    expect(all.map((n) => n.id)).toEqual([b.id, a.id]);
  });
});

describe('traversal_traverse', () => {
  function collect(
    state: MutableGraphState,
    start: ReturnType<typeof nodes_add_node>['node'] & { id: string },
    options: Parameters<typeof traversal_traverse>[2],
  ) {
    const result: Array<{ name: string; depth: number }> = [];
    traversal_traverse(state, start.id as never, options, (n, d) => {
      result.push({ name: n.name, depth: d });
    });
    return result;
  }

  it('forward BFS from a yields ordered visits', () => {
    const { state, a, b, c, d } = makeChain();
    const visits = collect(state, a, { direction: 'forward' });
    expect(visits[0]).toEqual({ name: 'a', depth: 0 });
    // b is depth 1, c+d are depth 2 (order between c/d depends on edge insertion)
    const map = new Map(visits.map((v) => [v.name, v.depth]));
    expect(map.get('b')).toBe(1);
    expect(map.get('c')).toBe(2);
    expect(map.get('d')).toBe(2);
    void { _: c, __: d }; // suppress unused
  });

  it('respects max_depth', () => {
    const { state, a } = makeChain();
    const visits = collect(state, a, { direction: 'forward', max_depth: 1 });
    expect(visits.map((v) => v.name).sort()).toEqual(['a', 'b']);
  });

  it('backward direction walks predecessors', () => {
    const { state, c } = makeChain();
    const visits = collect(state, c, { direction: 'backward' });
    expect(visits.map((v) => v.name)).toEqual(['c', 'b', 'a']);
  });

  it('callback returning false short-circuits the BFS', () => {
    const { state, a } = makeChain();
    const visits: string[] = [];
    traversal_traverse(state, a.id, { direction: 'forward' }, (n) => {
      visits.push(n.name);
      if (n.name === 'b') return false;
    });
    expect(visits).toEqual(['a', 'b']);
  });

  it('relationship_filter excludes edges of other types', () => {
    const state = create_mutable_graph_state();
    const a = nodes_add_node(state, input('a')).node!;
    const b = nodes_add_node(state, input('b')).node!;
    const c = nodes_add_node(state, input('c')).node!;
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    edges_add_edge(state, { source: a.id, target: c.id, relationship: 'connects_to' });
    const visits = collect(state, a, { direction: 'forward', relationship_filter: ['depends_on'] });
    expect(visits.map((v) => v.name).sort()).toEqual(['a', 'b']);
  });

  it('type_filter excludes targets of other node types', () => {
    const state = create_mutable_graph_state();
    const a = nodes_add_node(state, input('a', 'aws.s3.bucket')).node!;
    const b = nodes_add_node(state, input('b', 'aws.s3.bucket')).node!;
    const c = nodes_add_node(state, input('c', 'aws.rds.dbInstance')).node!;
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    edges_add_edge(state, { source: a.id, target: c.id, relationship: 'depends_on' });
    const visits = collect(state, a, { direction: 'forward', type_filter: ['aws.s3.bucket'] });
    expect(visits.map((v) => v.name).sort()).toEqual(['a', 'b']);
  });

  it('handles missing start node gracefully', () => {
    const state = create_mutable_graph_state();
    const visits: string[] = [];
    traversal_traverse(state, create_node_id('nope'), { direction: 'forward' }, (n) => {
      visits.push(n.name);
    });
    expect(visits).toEqual([]);
  });
});

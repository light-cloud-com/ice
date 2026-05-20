/**
 * Tests for `mutable-graph/edges.ts`.
 */

import { describe, expect, it } from 'vitest';
import { create_edge_id, create_node_id, type NodeInput } from '../../../types/graph';
import {
  edges_add_edge,
  edges_get_edge,
  edges_get_edges_between,
  edges_get_incoming_edges,
  edges_get_outgoing_edges,
  edges_remove_edge,
  edges_resolve_node_id,
} from '../edges';
import { nodes_add_node } from '../nodes';
import { create_mutable_graph_state } from '../types';

function makeState() {
  const state = create_mutable_graph_state();
  const a = nodes_add_node(state, { type: 't.x', name: 'a', properties: {} } as NodeInput).node!;
  const b = nodes_add_node(state, { type: 't.x', name: 'b', properties: {} } as NodeInput).node!;
  const c = nodes_add_node(state, { type: 't.x', name: 'c', properties: {} } as NodeInput).node!;
  return { state, a, b, c };
}

describe('edges_resolve_node_id', () => {
  it('passes through valid NodeIds', () => {
    const { state, a } = makeState();
    expect(edges_resolve_node_id(state, a.id)).toBe(a.id);
  });

  it('resolves bare names through the node_names index', () => {
    const { state, a } = makeState();
    expect(edges_resolve_node_id(state, 'a')).toBe(a.id);
  });

  it('returns undefined for unknown refs', () => {
    const { state } = makeState();
    expect(edges_resolve_node_id(state, 'missing')).toBeUndefined();
  });
});

describe('edges_add_edge', () => {
  it('creates an edge between two existing nodes', () => {
    const { state, a, b } = makeState();
    const result = edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    expect(result.success).toBe(true);
    expect(result.edge?.source).toBe(a.id);
    expect(result.edge?.target).toBe(b.id);
    expect(state.edges.size).toBe(1);
  });

  it('updates outgoing/incoming adjacency lists', () => {
    const { state, a, b } = makeState();
    const result = edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    expect(state.outgoing.get(a.id)?.has(result.edge!.id)).toBe(true);
    expect(state.incoming.get(b.id)?.has(result.edge!.id)).toBe(true);
  });

  it('rejects edges with missing source', () => {
    const { state, b } = makeState();
    const r = edges_add_edge(state, { source: 'nope', target: b.id, relationship: 'depends_on' });
    expect(r.success).toBe(false);
    expect(r.errors?.[0]).toContain('Source node not found');
  });

  it('rejects edges with missing target', () => {
    const { state, a } = makeState();
    const r = edges_add_edge(state, { source: a.id, target: 'nope', relationship: 'depends_on' });
    expect(r.success).toBe(false);
    expect(r.errors?.[0]).toContain('Target node not found');
  });

  it('rejects duplicate edges (same source, target, relationship)', () => {
    const { state, a, b } = makeState();
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    const r = edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    expect(r.success).toBe(false);
    expect(r.errors?.[0]).toContain('already exists');
  });

  it('allows two edges between the same pair with different relationships', () => {
    const { state, a, b } = makeState();
    expect(edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' }).success).toBe(true);
    expect(edges_add_edge(state, { source: a.id, target: b.id, relationship: 'connects_to' }).success).toBe(true);
    expect(state.edges.size).toBe(2);
  });
});

describe('edges_get_edge / remove_edge', () => {
  it('round-trips by id', () => {
    const { state, a, b } = makeState();
    const r = edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    expect(edges_get_edge(state, r.edge!.id)?.id).toBe(r.edge!.id);
  });

  it('remove clears adjacency lists', () => {
    const { state, a, b } = makeState();
    const r = edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    expect(edges_remove_edge(state, r.edge!.id)).toBe(true);
    expect(state.edges.size).toBe(0);
    expect(state.outgoing.get(a.id)?.has(r.edge!.id)).toBe(false);
    expect(state.incoming.get(b.id)?.has(r.edge!.id)).toBe(false);
  });

  it('remove returns false for unknown ids', () => {
    const { state } = makeState();
    expect(edges_remove_edge(state, create_edge_id('nope'))).toBe(false);
  });
});

describe('edges_get_edges_between', () => {
  it('returns all edges from source to target across relationships', () => {
    const { state, a, b } = makeState();
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'connects_to' });
    const between = edges_get_edges_between(state, a.id, b.id);
    expect(between).toHaveLength(2);
  });

  it('does not return edges in the reverse direction', () => {
    const { state, a, b } = makeState();
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    expect(edges_get_edges_between(state, b.id, a.id)).toEqual([]);
  });

  it('returns empty array for unknown source', () => {
    const { state, a } = makeState();
    expect(edges_get_edges_between(state, create_node_id('nope'), a.id)).toEqual([]);
  });
});

describe('edges_get_outgoing_edges / get_incoming_edges', () => {
  it('returns the right partitions', () => {
    const { state, a, b, c } = makeState();
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    edges_add_edge(state, { source: a.id, target: c.id, relationship: 'connects_to' });
    edges_add_edge(state, { source: c.id, target: b.id, relationship: 'depends_on' });

    const outA = edges_get_outgoing_edges(state, a.id);
    expect(outA.map((e) => e.target).sort()).toEqual([b.id, c.id].sort());

    const inB = edges_get_incoming_edges(state, b.id);
    expect(inB.map((e) => e.source).sort()).toEqual([a.id, c.id].sort());
  });

  it('returns empty arrays for unknown nodes', () => {
    const { state } = makeState();
    const fake = create_node_id('nope');
    expect(edges_get_outgoing_edges(state, fake)).toEqual([]);
    expect(edges_get_incoming_edges(state, fake)).toEqual([]);
  });
});

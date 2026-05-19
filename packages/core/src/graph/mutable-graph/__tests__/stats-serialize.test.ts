/**
 * Tests for `mutable-graph/stats-serialize.ts`.
 */

import { describe, expect, it } from 'vitest';
import { create_graph_id, type GraphMetadata, type NodeInput } from '../../../types/graph';
import { edges_add_edge } from '../edges';
import { nodes_add_node } from '../nodes';
import {
  stats_clear,
  stats_copy_state,
  stats_get_stats,
  stats_populate_from_serialized,
  stats_to_json,
  type SerializedGraphIdentity,
} from '../stats-serialize';
import { create_mutable_graph_state, type SerializedGraph } from '../types';

function input(name: string, type = 't.x'): NodeInput {
  return { type, name, properties: {} };
}

function makeIdentity(): SerializedGraphIdentity {
  const metadata: GraphMetadata = {
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    description: 'fixture',
    labels: { env: 'test' },
    annotations: { ttl: 30 },
    providers: ['aws', 'gcp'],
    regions: ['us-east-1'],
  };
  return {
    id: create_graph_id('graph_fixed'),
    name: 'fixture',
    version: '1.0.0',
    metadata,
  };
}

describe('stats_get_stats', () => {
  it('counts nodes and edges and groups by type', () => {
    const state = create_mutable_graph_state();
    const a = nodes_add_node(state, input('a', 'aws.s3.bucket')).node!;
    const b = nodes_add_node(state, input('b', 'aws.s3.bucket')).node!;
    nodes_add_node(state, input('c', 'aws.rds.dbInstance'));
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });

    const s = stats_get_stats(state);
    expect(s.node_count).toBe(3);
    expect(s.edge_count).toBe(1);
    expect(s.node_types).toEqual({ 'aws.s3.bucket': 2, 'aws.rds.dbInstance': 1 });
    expect(s.edge_types).toEqual({ depends_on: 1 });
  });

  it('returns zero counts on empty state', () => {
    const state = create_mutable_graph_state();
    const s = stats_get_stats(state);
    expect(s).toEqual({ node_count: 0, edge_count: 0, node_types: {}, edge_types: {} });
  });
});

describe('stats_clear', () => {
  it('empties all five state maps in place', () => {
    const state = create_mutable_graph_state();
    const a = nodes_add_node(state, input('a')).node!;
    const b = nodes_add_node(state, input('b')).node!;
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });

    const ref = state;
    stats_clear(state);
    expect(state).toBe(ref); // identity preserved
    expect(state.nodes.size).toBe(0);
    expect(state.edges.size).toBe(0);
    expect(state.outgoing.size).toBe(0);
    expect(state.incoming.size).toBe(0);
    expect(state.node_names.size).toBe(0);
  });
});

describe('stats_to_json', () => {
  it('builds an envelope around the live nodes/edges', () => {
    const state = create_mutable_graph_state();
    const a = nodes_add_node(state, input('a')).node!;
    const b = nodes_add_node(state, input('b')).node!;
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });

    const id = makeIdentity();
    const j = stats_to_json(state, id);

    expect(j.id).toBe(id.id);
    expect(j.name).toBe(id.name);
    expect(j.version).toBe(id.version);
    expect(j.metadata).toBe(id.metadata);
    expect(j.nodes).toHaveLength(2);
    expect(j.edges).toHaveLength(1);
  });
});

describe('stats_copy_state', () => {
  it('replicates nodes/edges/adjacency into a fresh state', () => {
    const src = create_mutable_graph_state();
    const a = nodes_add_node(src, input('a')).node!;
    const b = nodes_add_node(src, input('b')).node!;
    edges_add_edge(src, { source: a.id, target: b.id, relationship: 'depends_on' });

    const dst = create_mutable_graph_state();
    stats_copy_state(src, dst);

    expect(dst.nodes.size).toBe(2);
    expect(dst.edges.size).toBe(1);
    expect(dst.node_names.get('a')).toBe(a.id);
    expect(dst.node_names.get('b')).toBe(b.id);
    expect(dst.outgoing.get(a.id)?.size).toBe(1);
    expect(dst.incoming.get(b.id)?.size).toBe(1);
  });

  it('shallow-copies node objects so dst mutations do not affect src', () => {
    const src = create_mutable_graph_state();
    nodes_add_node(src, input('a'));
    const dst = create_mutable_graph_state();
    stats_copy_state(src, dst);
    const srcNode = src.nodes.values().next().value!;
    const dstNode = dst.nodes.values().next().value!;
    expect(dstNode).not.toBe(srcNode);
    expect(dstNode).toEqual(srcNode);
  });

  it('shallow-copies adjacency Sets so dst mutations do not affect src', () => {
    const src = create_mutable_graph_state();
    const a = nodes_add_node(src, input('a')).node!;
    const b = nodes_add_node(src, input('b')).node!;
    edges_add_edge(src, { source: a.id, target: b.id, relationship: 'depends_on' });

    const dst = create_mutable_graph_state();
    stats_copy_state(src, dst);
    expect(dst.outgoing.get(a.id)).not.toBe(src.outgoing.get(a.id));
  });
});

describe('stats_populate_from_serialized', () => {
  it('rebuilds state from a SerializedGraph envelope', () => {
    // Make a snapshot first using a populated state
    const original = create_mutable_graph_state();
    const a = nodes_add_node(original, input('a')).node!;
    const b = nodes_add_node(original, input('b')).node!;
    edges_add_edge(original, { source: a.id, target: b.id, relationship: 'depends_on' });
    const json = stats_to_json(original, makeIdentity());

    const restored = create_mutable_graph_state();
    stats_populate_from_serialized(restored, json);

    expect(restored.nodes.size).toBe(2);
    expect(restored.edges.size).toBe(1);
    expect(restored.node_names.get('a')).toBe(a.id);
    expect(restored.node_names.get('b')).toBe(b.id);
    expect(restored.outgoing.get(a.id)?.size).toBe(1);
    expect(restored.incoming.get(b.id)?.size).toBe(1);
  });

  it('round-trips byte-identical when the envelope is deserialized JSON', () => {
    const original = create_mutable_graph_state();
    const a = nodes_add_node(original, input('a', 'aws.s3.bucket')).node!;
    const c = nodes_add_node(original, input('c', 'aws.rds.dbInstance')).node!;
    edges_add_edge(original, { source: a.id, target: c.id, relationship: 'connects_to' });
    const env: SerializedGraph = stats_to_json(original, makeIdentity());

    const json = JSON.parse(JSON.stringify(env)) as SerializedGraph;
    const restored = create_mutable_graph_state();
    stats_populate_from_serialized(restored, json);

    const re_json = stats_to_json(restored, makeIdentity());
    expect(JSON.parse(JSON.stringify(re_json))).toEqual(JSON.parse(JSON.stringify(env)));
  });
});

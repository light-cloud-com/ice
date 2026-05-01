/**
 * Tests for `mutable-graph/nodes.ts`.
 */

import { describe, expect, it } from 'vitest';

import { create_node_id, type NodeInput } from '../../../types/graph.js';
import { edges_add_edge } from '../edges.js';
import {
  nodes_add_node,
  nodes_get_node,
  nodes_get_node_by_name,
  nodes_get_nodes_by_type,
  nodes_has_node,
  nodes_remove_node,
  nodes_update_node,
} from '../nodes.js';
import { create_mutable_graph_state } from '../types.js';

function input(name: string, type = 'aws.s3.bucket', props: Record<string, unknown> = {}): NodeInput {
  return { type, name, properties: props };
}

describe('nodes_add_node', () => {
  it('inserts a node and creates adjacency-list entries', () => {
    const state = create_mutable_graph_state();
    const result = nodes_add_node(state, input('alpha'));
    expect(result.success).toBe(true);
    expect(result.node?.id).toBe('aws.s3.bucket:alpha');
    expect(state.nodes.size).toBe(1);
    expect(state.node_names.get('alpha')).toBe(result.node!.id);
    expect(state.outgoing.get(result.node!.id)).toBeInstanceOf(Set);
    expect(state.incoming.get(result.node!.id)).toBeInstanceOf(Set);
  });

  it('rejects duplicate ids', () => {
    const state = create_mutable_graph_state();
    nodes_add_node(state, input('alpha'));
    const result = nodes_add_node(state, input('alpha'));
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('already exists');
  });

  it('rejects duplicate names with different types', () => {
    const state = create_mutable_graph_state();
    nodes_add_node(state, input('shared', 'aws.s3.bucket'));
    const result = nodes_add_node(state, input('shared', 'gcp.storage.bucket'));
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain("name 'shared' already exists");
  });

  it('classifies the node category', () => {
    const state = create_mutable_graph_state();
    const result = nodes_add_node(state, input('db', 'aws.rds.dbInstance'));
    // The classifier is data-driven; we just check that *some* category was assigned.
    expect(result.node?.metadata.category).toBeDefined();
  });
});

describe('nodes_get_node / has_node / get_node_by_name', () => {
  it('round-trips by id and by name', () => {
    const state = create_mutable_graph_state();
    const r = nodes_add_node(state, input('alpha'));
    const id = r.node!.id;
    expect(nodes_has_node(state, id)).toBe(true);
    expect(nodes_get_node(state, id)?.name).toBe('alpha');
    expect(nodes_get_node_by_name(state, 'alpha')?.id).toBe(id);
  });

  it('returns undefined for missing ids', () => {
    const state = create_mutable_graph_state();
    const fakeId = create_node_id('does:not:exist');
    expect(nodes_get_node(state, fakeId)).toBeUndefined();
    expect(nodes_get_node_by_name(state, 'nope')).toBeUndefined();
    expect(nodes_has_node(state, fakeId)).toBe(false);
  });
});

describe('nodes_update_node', () => {
  it('merges properties, labels, and annotations', () => {
    const state = create_mutable_graph_state();
    const r = nodes_add_node(state, {
      type: 'aws.s3.bucket',
      name: 'alpha',
      properties: { region: 'us-east-1' },
      labels: { env: 'prod' },
    });
    const ok = nodes_update_node(state, r.node!.id, {
      properties: { versioning: true },
      labels: { team: 'core' },
      annotations: { ttl: 30 },
    });
    expect(ok).toBe(true);
    const updated = nodes_get_node(state, r.node!.id)!;
    expect(updated.properties).toEqual({ region: 'us-east-1', versioning: true });
    expect(updated.metadata.labels).toEqual({ env: 'prod', team: 'core' });
    expect(updated.metadata.annotations).toEqual({ ttl: 30 });
  });

  it('returns false for unknown ids', () => {
    const state = create_mutable_graph_state();
    const ok = nodes_update_node(state, create_node_id('nope:1'), { properties: { x: 1 } });
    expect(ok).toBe(false);
  });

  it('bumps updated_at', async () => {
    const state = create_mutable_graph_state();
    const r = nodes_add_node(state, input('alpha'));
    const before = r.node!.metadata.updated_at;
    await new Promise((resolve) => setTimeout(resolve, 10));
    nodes_update_node(state, r.node!.id, { properties: { foo: 'bar' } });
    const after = nodes_get_node(state, r.node!.id)!.metadata.updated_at;
    expect(after).not.toBe(before);
  });
});

describe('nodes_remove_node', () => {
  it('removes the node and clears its adjacency-list entries', () => {
    const state = create_mutable_graph_state();
    const r = nodes_add_node(state, input('alpha'));
    const ok = nodes_remove_node(state, r.node!.id);
    expect(ok).toBe(true);
    expect(state.nodes.size).toBe(0);
    expect(state.node_names.has('alpha')).toBe(false);
    expect(state.outgoing.has(r.node!.id)).toBe(false);
    expect(state.incoming.has(r.node!.id)).toBe(false);
  });

  it('removes incident edges (invariant: no orphan edges)', () => {
    const state = create_mutable_graph_state();
    const a = nodes_add_node(state, input('a')).node!;
    const b = nodes_add_node(state, input('b')).node!;
    edges_add_edge(state, { source: a.id, target: b.id, relationship: 'depends_on' });
    expect(state.edges.size).toBe(1);
    nodes_remove_node(state, a.id);
    expect(state.edges.size).toBe(0);
  });

  it('returns false for unknown ids', () => {
    const state = create_mutable_graph_state();
    expect(nodes_remove_node(state, create_node_id('nope:1'))).toBe(false);
  });
});

describe('nodes_get_nodes_by_type', () => {
  it('filters nodes by exact type match', () => {
    const state = create_mutable_graph_state();
    nodes_add_node(state, input('a', 'aws.s3.bucket'));
    nodes_add_node(state, input('b', 'aws.s3.bucket'));
    nodes_add_node(state, input('c', 'aws.rds.dbInstance'));
    const buckets = nodes_get_nodes_by_type(state, 'aws.s3.bucket');
    expect(buckets).toHaveLength(2);
    expect(buckets.map((n) => n.name).sort()).toEqual(['a', 'b']);
  });

  it('returns empty array when type has no nodes', () => {
    const state = create_mutable_graph_state();
    expect(nodes_get_nodes_by_type(state, 'absent')).toEqual([]);
  });
});

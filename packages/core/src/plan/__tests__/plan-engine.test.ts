/**
 * Tests for `plan/plan-engine.ts`.
 *
 * The plan engine compares a desired-state graph against a
 * ResourceState map and produces a `DeploymentPlan` with the
 * ordered changes plus summary/provider stats.
 *
 * We construct an in-memory MutableGraph and feed a Map of
 * resource states keyed by NodeId. No external mocks needed —
 * the engine reads only the graph + state map.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  create_plan,
  plan_has_changes,
  plan_has_destructive_changes,
  get_changes_by_action,
  get_plan_execution_layers,
  serialize_plan,
  deserialize_plan,
} from '../plan-engine';
import { create_mutable_graph, type MutableGraph } from '../../graph/mutable-graph';
import type { NodeId } from '../../types/graph';
import type { ResourceState } from '../../types/providers';

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Test fixtures
// ============================================================================

/**
 * Build a graph from a node-list + edge-list, returning the graph
 * plus a name->NodeId map for asserting against state.
 *
 * Each node carries its own `properties` for the diff path. `type`
 * defaults to a generic test type but can be overridden per node.
 */
function build_graph(
  spec: {
    nodes: Array<{ name: string; type?: string; properties?: Record<string, unknown> }>;
    edges?: Array<{ source: string; target: string }>;
    graph_name?: string;
  },
): { graph: MutableGraph; ids: Map<string, NodeId> } {
  const graph = create_mutable_graph(spec.graph_name ?? 'test-plan');
  const ids = new Map<string, NodeId>();

  for (const n of spec.nodes) {
    const result = graph.add_node({
      type: n.type ?? 'test.resource',
      name: n.name,
      properties: n.properties ?? {},
    });
    if (result.success && result.node) {
      ids.set(n.name, result.node.id);
    }
  }

  for (const e of spec.edges ?? []) {
    const source = ids.get(e.source) ?? (e.source as unknown as NodeId);
    const target = ids.get(e.target) ?? (e.target as unknown as NodeId);
    graph.add_edge({ source, target, relationship: 'depends_on' });
  }

  return { graph, ids };
}

function fake_state(overrides: Partial<ResourceState> = {}): ResourceState {
  return {
    cloud_id: overrides.cloud_id ?? 'cloud-id',
    status: overrides.status ?? 'available',
    outputs: overrides.outputs ?? {},
    ...overrides,
  };
}

// ============================================================================
// create_plan: empty / basic shapes
// ============================================================================

describe('create_plan: empty graph', () => {
  it('returns a plan with zero changes for an empty graph and empty state', () => {
    const { graph } = build_graph({ nodes: [] });
    const plan = create_plan(graph, new Map());

    expect(plan.changes).toEqual([]);
    expect(plan.summary).toEqual({
      total: 0,
      create: 0,
      update: 0,
      replace: 0,
      delete: 0,
      no_op: 0,
      destructive: 0,
    });
    expect(plan.providers).toEqual([]);
  });

  it('stamps a plan id with plan_<timestamp>_<random> shape', () => {
    const { graph } = build_graph({ nodes: [] });
    const plan = create_plan(graph, new Map());
    expect(plan.id).toMatch(/^plan_\d+_[a-z0-9]+$/);
  });

  it('uses the graph id as graph_id when no override is provided', () => {
    const { graph } = build_graph({ nodes: [] });
    const plan = create_plan(graph, new Map());
    expect(plan.graph_id).toBe(graph.id);
  });

  it('honors an explicit graph_id override in options', () => {
    const { graph } = build_graph({ nodes: [] });
    const plan = create_plan(graph, new Map(), { graph_id: 'override-id' });
    expect(plan.graph_id).toBe('override-id');
  });

  it('stamps created_at as an ISO string', () => {
    const { graph } = build_graph({ nodes: [] });
    const plan = create_plan(graph, new Map());
    expect(() => new Date(plan.created_at).toISOString()).not.toThrow();
    expect(plan.created_at).toBe(new Date(plan.created_at).toISOString());
  });
});

// ============================================================================
// create_plan: create / update / no-op / replace
// ============================================================================

describe('create_plan: sync mode', () => {
  it('generates a create change for a node with no current state', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a', properties: { region: 'us-east-1' } }],
    });
    const plan = create_plan(graph, new Map());

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({
      node_id: ids.get('a'),
      action: 'create',
      reason: 'Resource does not exist',
      destructive: false,
      depends_on: [],
    });
    expect(plan.summary.create).toBe(1);
  });

  it('generates a no_op when desired and current properties match', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a', properties: { region: 'us-east-1' } }],
    });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state({ outputs: { region: 'us-east-1' } })],
    ]);
    const plan = create_plan(graph, state);

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({
      action: 'no_op',
      reason: 'Resource is up to date',
      destructive: false,
    });
    expect(plan.summary.no_op).toBe(1);
  });

  it('generates an update for a non-destructive property change', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a', properties: { tag: 'new' } }],
    });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state({ outputs: { tag: 'old' } })],
    ]);
    const plan = create_plan(graph, state);

    expect(plan.changes[0]).toMatchObject({
      action: 'update',
      reason: 'Resource properties changed',
      destructive: false,
    });
    expect(plan.changes[0]?.changed_properties).toHaveLength(1);
    expect(plan.summary.update).toBe(1);
  });

  it('generates a replace for a destructive property change on a known type', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a', type: 'aws.ec2.instance', properties: { ami: 'ami-new' } }],
    });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state({ outputs: { ami: 'ami-old' } })],
    ]);
    const plan = create_plan(graph, state);

    expect(plan.changes[0]).toMatchObject({
      action: 'replace',
      reason: 'Resource requires replacement due to immutable property changes',
      destructive: true,
    });
    expect(plan.summary.replace).toBe(1);
    expect(plan.summary.destructive).toBe(1);
  });

  it('attaches changed_properties to update changes', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a', properties: { tag: 'new', size: 10 } }],
    });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state({ outputs: { tag: 'old', size: 10 } })],
    ]);
    const plan = create_plan(graph, state);

    expect(plan.changes[0]?.changed_properties).toHaveLength(1);
    expect(plan.changes[0]?.changed_properties?.[0]?.path).toBe('tag');
  });

  it('honors targets to filter which nodes are planned', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
    });
    const plan = create_plan(graph, new Map(), {
      targets: [ids.get('a')!, ids.get('c')!],
    });

    const planned_ids = plan.changes.map((c) => c.node_id);
    expect(planned_ids).toContain(ids.get('a'));
    expect(planned_ids).toContain(ids.get('c'));
    expect(planned_ids).not.toContain(ids.get('b'));
  });
});

// ============================================================================
// create_plan: destroy mode
// ============================================================================

describe('create_plan: destroy mode', () => {
  it('emits delete entries for every resource in current state', () => {
    const { graph, ids } = build_graph({ nodes: [{ name: 'a' }, { name: 'b' }] });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state({ cloud_id: 'cloud-a' })],
      [ids.get('b')!, fake_state({ cloud_id: 'cloud-b' })],
    ]);

    const plan = create_plan(graph, state, { destroy: true });

    expect(plan.changes).toHaveLength(2);
    expect(plan.changes.every((c) => c.action === 'delete')).toBe(true);
    expect(plan.changes.every((c) => c.destructive)).toBe(true);
    expect(plan.summary.delete).toBe(2);
    expect(plan.summary.destructive).toBe(2);
  });

  it('attaches the existing ResourceState to delete entries', () => {
    const { graph, ids } = build_graph({ nodes: [{ name: 'a' }] });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state({ cloud_id: 'cloud-a' })],
    ]);
    const plan = create_plan(graph, state, { destroy: true });
    expect(plan.changes[0]?.current_state?.cloud_id).toBe('cloud-a');
  });

  it('uses dependents (reverse deps) as depends_on for delete entries when the node still exists in the graph', () => {
    // a depends_on b — destroying both should report a as a dependent of b.
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a' }, { name: 'b' }],
      edges: [{ source: 'a', target: 'b' }],
    });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state({ cloud_id: 'cloud-a' })],
      [ids.get('b')!, fake_state({ cloud_id: 'cloud-b' })],
    ]);
    const plan = create_plan(graph, state, { destroy: true });

    const change_for_b = plan.changes.find((c) => c.node_id === ids.get('b'));
    expect(change_for_b?.depends_on).toContain(ids.get('a'));
  });

  it('returns empty depends_on when destroying a resource that is no longer in the graph', () => {
    // State has node ids that don't exist in the graph (orphans).
    const { graph } = build_graph({ nodes: [] });
    const orphan_id = 'orphan-node' as NodeId;
    const state = new Map<string, ResourceState>([
      [orphan_id, fake_state({ cloud_id: 'orphan' })],
    ]);
    const plan = create_plan(graph, state, { destroy: true });

    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]?.depends_on).toEqual([]);
  });

  it('respects targets in destroy mode', () => {
    const { graph, ids } = build_graph({ nodes: [{ name: 'a' }, { name: 'b' }] });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state()],
      [ids.get('b')!, fake_state()],
    ]);
    const plan = create_plan(graph, state, {
      destroy: true,
      targets: [ids.get('a')!],
    });
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]?.node_id).toBe(ids.get('a'));
  });
});

// ============================================================================
// Dependency ordering
// ============================================================================

describe('create_plan: dependency ordering', () => {
  it('orders A-depends-on-B as B before A in changes', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a' }, { name: 'b' }],
      edges: [{ source: 'a', target: 'b' }],
    });
    const plan = create_plan(graph, new Map());

    const a_index = plan.changes.findIndex((c) => c.node_id === ids.get('a'));
    const b_index = plan.changes.findIndex((c) => c.node_id === ids.get('b'));
    expect(b_index).toBeLessThan(a_index);
  });

  it('attaches depends_on with direct dependencies (not transitive)', () => {
    // a -> b -> c, so a's depends_on is just [b].
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
    });
    const plan = create_plan(graph, new Map());

    const change_a = plan.changes.find((c) => c.node_id === ids.get('a'));
    expect(change_a?.depends_on).toEqual([ids.get('b')]);
  });

  it('keeps disconnected nodes in the plan even if not part of any layer', () => {
    const { graph, ids } = build_graph({ nodes: [{ name: 'a' }, { name: 'b' }] });
    const plan = create_plan(graph, new Map());

    const planned_ids = plan.changes.map((c) => c.node_id);
    expect(planned_ids).toContain(ids.get('a'));
    expect(planned_ids).toContain(ids.get('b'));
  });

  it('preserves nodes that the layering algorithm omits (cycle fallback)', () => {
    // a depends on b, b depends on a — cycle. get_execution_layers may
    // not emit either node; the engine appends them at the end.
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a' }, { name: 'b' }],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ],
    });
    const plan = create_plan(graph, new Map());

    const planned_ids = plan.changes.map((c) => c.node_id);
    expect(planned_ids).toContain(ids.get('a'));
    expect(planned_ids).toContain(ids.get('b'));
    expect(plan.changes).toHaveLength(2);
  });
});

// ============================================================================
// Provider tracking
// ============================================================================

describe('create_plan: provider requirements', () => {
  it('extracts provider from dotted resource type', () => {
    const { graph } = build_graph({
      nodes: [{ name: 'a', type: 'aws.ec2.instance' }],
    });
    const plan = create_plan(graph, new Map());
    expect(plan.providers).toEqual([{ provider: 'aws', resource_count: 1 }]);
  });

  it('extracts provider from colon-separated resource type', () => {
    const { graph } = build_graph({
      nodes: [{ name: 'a', type: 'aws:ec2/instance:Instance' }],
    });
    const plan = create_plan(graph, new Map());
    expect(plan.providers).toEqual([{ provider: 'aws', resource_count: 1 }]);
  });

  it('extracts provider from slash-separated resource type', () => {
    const { graph } = build_graph({
      nodes: [{ name: 'a', type: 'gcp/compute/instance' }],
    });
    const plan = create_plan(graph, new Map());
    expect(plan.providers[0]?.provider).toBe('gcp');
  });

  it('lowercases provider names', () => {
    const { graph } = build_graph({
      nodes: [{ name: 'a', type: 'AWS.ec2.instance' }],
    });
    const plan = create_plan(graph, new Map());
    expect(plan.providers[0]?.provider).toBe('aws');
  });

  it('returns empty-string provider for an empty type (logic surprise)', () => {
    // `''.split(/[.:/]/)` returns `['']`, so `parts[0]` is `''` (defined,
    // non-nullish). The `?? 'unknown'` fallback only fires when split
    // returns an empty array, which String.prototype.split never does.
    // So the 'unknown' branch is effectively unreachable for any input.
    const { graph } = build_graph({ nodes: [{ name: 'a', type: '' }] });
    const plan = create_plan(graph, new Map());
    expect(plan.providers[0]?.provider).toBe('');
  });

  it('aggregates resource counts per provider and sorts by descending count', () => {
    const { graph } = build_graph({
      nodes: [
        { name: 'a', type: 'aws.ec2.instance' },
        { name: 'b', type: 'aws.s3.bucket' },
        { name: 'c', type: 'aws.s3.bucket' },
        { name: 'd', type: 'gcp.compute.instance' },
      ],
    });
    const plan = create_plan(graph, new Map());

    expect(plan.providers).toEqual([
      { provider: 'aws', resource_count: 3 },
      { provider: 'gcp', resource_count: 1 },
    ]);
  });

  it('does not populate providers for destroy plans', () => {
    // Destroy path doesn't track providers_used.
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a', type: 'aws.ec2.instance' }],
    });
    const state = new Map<string, ResourceState>([[ids.get('a')!, fake_state()]]);
    const plan = create_plan(graph, state, { destroy: true });

    expect(plan.providers).toEqual([]);
  });
});

// ============================================================================
// Summary
// ============================================================================

describe('create_plan: summary', () => {
  it('counts every action category alongside total', () => {
    const { graph, ids } = build_graph({
      nodes: [
        { name: 'a', properties: { v: 1 } }, // create
        { name: 'b', properties: { v: 1 } }, // no_op
        { name: 'c', properties: { v: 2 } }, // update
        { name: 'd', type: 'aws.ec2.instance', properties: { ami: 'new' } }, // replace
      ],
    });
    const state = new Map<string, ResourceState>([
      [ids.get('b')!, fake_state({ outputs: { v: 1 } })],
      [ids.get('c')!, fake_state({ outputs: { v: 1 } })],
      [ids.get('d')!, fake_state({ outputs: { ami: 'old' } })],
    ]);
    const plan = create_plan(graph, state);

    expect(plan.summary).toEqual({
      total: 4,
      create: 1,
      update: 1,
      replace: 1,
      delete: 0,
      no_op: 1,
      destructive: 1, // replace counts as destructive
    });
  });
});

// ============================================================================
// plan_has_changes / plan_has_destructive_changes
// ============================================================================

describe('plan_has_changes', () => {
  it('returns false when no actionable changes', () => {
    const { graph } = build_graph({ nodes: [] });
    const plan = create_plan(graph, new Map());
    expect(plan_has_changes(plan)).toBe(false);
  });

  it('returns true when any create exists', () => {
    const { graph } = build_graph({ nodes: [{ name: 'a' }] });
    const plan = create_plan(graph, new Map());
    expect(plan_has_changes(plan)).toBe(true);
  });

  it('returns true when any update exists', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a', properties: { v: 'new' } }],
    });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state({ outputs: { v: 'old' } })],
    ]);
    expect(plan_has_changes(create_plan(graph, state))).toBe(true);
  });

  it('returns true when any replace exists', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a', type: 'aws.ec2.instance', properties: { ami: 'new' } }],
    });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state({ outputs: { ami: 'old' } })],
    ]);
    expect(plan_has_changes(create_plan(graph, state))).toBe(true);
  });

  it('returns true when any delete exists', () => {
    const { graph, ids } = build_graph({ nodes: [{ name: 'a' }] });
    const state = new Map<string, ResourceState>([[ids.get('a')!, fake_state()]]);
    const plan = create_plan(graph, state, { destroy: true });
    expect(plan_has_changes(plan)).toBe(true);
  });

  it('returns false when only no_ops exist', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a', properties: { v: 1 } }],
    });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state({ outputs: { v: 1 } })],
    ]);
    expect(plan_has_changes(create_plan(graph, state))).toBe(false);
  });
});

describe('plan_has_destructive_changes', () => {
  it('returns false for create-only plan', () => {
    const { graph } = build_graph({ nodes: [{ name: 'a' }] });
    expect(plan_has_destructive_changes(create_plan(graph, new Map()))).toBe(false);
  });

  it('returns true when a destroy plan has any deletes', () => {
    const { graph, ids } = build_graph({ nodes: [{ name: 'a' }] });
    const state = new Map<string, ResourceState>([[ids.get('a')!, fake_state()]]);
    expect(plan_has_destructive_changes(create_plan(graph, state, { destroy: true }))).toBe(true);
  });

  it('returns true when any replace is in the plan', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a', type: 'aws.ec2.instance', properties: { ami: 'new' } }],
    });
    const state = new Map<string, ResourceState>([
      [ids.get('a')!, fake_state({ outputs: { ami: 'old' } })],
    ]);
    expect(plan_has_destructive_changes(create_plan(graph, state))).toBe(true);
  });
});

// ============================================================================
// get_changes_by_action
// ============================================================================

describe('get_changes_by_action', () => {
  it('filters changes to a single action category', () => {
    const { graph, ids } = build_graph({
      nodes: [
        { name: 'a' }, // create
        { name: 'b', properties: { v: 1 } }, // no_op
      ],
    });
    const state = new Map<string, ResourceState>([
      [ids.get('b')!, fake_state({ outputs: { v: 1 } })],
    ]);
    const plan = create_plan(graph, state);

    const creates = get_changes_by_action(plan, 'create');
    expect(creates).toHaveLength(1);
    expect(creates[0]?.node_id).toBe(ids.get('a'));

    const noops = get_changes_by_action(plan, 'no_op');
    expect(noops).toHaveLength(1);
    expect(noops[0]?.node_id).toBe(ids.get('b'));
  });

  it('returns empty array for actions with no matches', () => {
    const { graph } = build_graph({ nodes: [{ name: 'a' }] });
    const plan = create_plan(graph, new Map());
    expect(get_changes_by_action(plan, 'delete')).toEqual([]);
  });
});

// ============================================================================
// get_plan_execution_layers
// ============================================================================

describe('get_plan_execution_layers', () => {
  it('returns empty list for an empty plan', () => {
    const { graph } = build_graph({ nodes: [] });
    const plan = create_plan(graph, new Map());
    expect(get_plan_execution_layers(plan)).toEqual([]);
  });

  it('puts independent changes in a single layer', () => {
    const { graph } = build_graph({
      nodes: [{ name: 'a' }, { name: 'b' }],
    });
    const plan = create_plan(graph, new Map());
    const layers = get_plan_execution_layers(plan);
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveLength(2);
  });

  it('splits dependent changes across layers in dependency order', () => {
    // a depends on b, b depends on c; layers should be [[c], [b], [a]]
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
    });
    const plan = create_plan(graph, new Map());
    const layers = get_plan_execution_layers(plan);

    expect(layers).toHaveLength(3);
    expect(layers[0]?.[0]?.node_id).toBe(ids.get('c'));
    expect(layers[1]?.[0]?.node_id).toBe(ids.get('b'));
    expect(layers[2]?.[0]?.node_id).toBe(ids.get('a'));
  });

  it('groups parallel-capable changes into the same layer', () => {
    // a, b both depend on c. Layers: [[c], [a, b]].
    const { graph } = build_graph({
      nodes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      edges: [
        { source: 'a', target: 'c' },
        { source: 'b', target: 'c' },
      ],
    });
    const plan = create_plan(graph, new Map());
    const layers = get_plan_execution_layers(plan);

    expect(layers).toHaveLength(2);
    expect(layers[0]).toHaveLength(1);
    expect(layers[1]).toHaveLength(2);
  });

  it('flushes the remaining changes as a final layer when a cycle blocks progress', () => {
    // Hand-craft a plan with a self-cycle: a depends on a — no progress can
    // be made, so the layering breaks the deadlock by emitting all remaining.
    const plan = {
      id: 'plan' as never,
      graph_id: 'g',
      created_at: new Date().toISOString(),
      changes: [
        {
          node_id: 'a' as NodeId,
          action: 'create' as const,
          depends_on: ['a' as NodeId],
          destructive: false,
        },
        {
          node_id: 'b' as NodeId,
          action: 'create' as const,
          depends_on: ['a' as NodeId],
          destructive: false,
        },
      ],
      summary: { total: 2, create: 2, update: 0, replace: 0, delete: 0, no_op: 0, destructive: 0 },
      providers: [],
    };
    const layers = get_plan_execution_layers(plan);

    // No dep is satisfied, so the entire remaining list is emitted as one layer.
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveLength(2);
  });

  it('does not include the same node twice across layers', () => {
    const { graph } = build_graph({
      nodes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
    });
    const plan = create_plan(graph, new Map());
    const layers = get_plan_execution_layers(plan);
    const flat = layers.flat().map((c) => c.node_id);
    const unique = new Set(flat);
    expect(flat.length).toBe(unique.size);
  });
});

// ============================================================================
// serialize / deserialize
// ============================================================================

describe('serialize_plan / deserialize_plan', () => {
  it('round-trips a plan through JSON without losing structure', () => {
    const { graph, ids } = build_graph({
      nodes: [{ name: 'a', properties: { region: 'us' } }],
      edges: [],
    });
    const plan = create_plan(graph, new Map());
    const json = serialize_plan(plan);
    const restored = deserialize_plan(json);

    expect(restored.id).toBe(plan.id);
    expect(restored.graph_id).toBe(plan.graph_id);
    expect(restored.changes).toHaveLength(plan.changes.length);
    expect(restored.changes[0]?.node_id).toBe(ids.get('a'));
    expect(restored.summary).toEqual(plan.summary);
  });

  it('produces pretty-printed JSON (indented with 2 spaces)', () => {
    const { graph } = build_graph({ nodes: [{ name: 'a' }] });
    const plan = create_plan(graph, new Map());
    const json = serialize_plan(plan);
    expect(json).toContain('\n  ');
  });
});

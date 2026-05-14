/**
 * Unit tests for the rf-sched-2 DAG construction helpers.
 *
 * Pure-function tests — no scheduler instance needed. Build a small
 * `Graph` + `ResourceChange[]`, call `build_dag`, assert the
 * resulting `NodeRecord` Map shape directly.
 */

import { describe, it, expect } from 'vitest';
import { build_dag, assert_no_cycle } from '../dag';
import type { ResourceChange } from '../../../diff/types';
import type { Graph, Node, NodeId, Edge, EdgeId } from '../../../types/graph';
import type { NodeRecord, SchedulerPhase } from '../types';

// ─── helpers ─────────────────────────────────────────────────────────

function build_change(name: string, type: string): ResourceChange {
  return {
    id: `${type}:${name}`,
    name,
    type,
    provider: 'gcp',
    change_type: 'create',
    property_changes: [],
    current_properties: null,
    desired_properties: {},
  };
}

function build_graph(
  resources: Array<{ name: string; type: string }>,
  edges_from_to: Array<[string, string]>,
): Graph {
  const nodes = new Map<NodeId, Node>();
  const edges = new Map<EdgeId, Edge>();
  const now = new Date().toISOString();
  for (const { name, type } of resources) {
    const id = `${type}:${name}` as NodeId;
    nodes.set(id, {
      id,
      type,
      name,
      properties: {},
      metadata: { created_at: now, updated_at: now, labels: {}, annotations: {} },
    });
  }
  // edges_from_to: "from must finish before to" — i.e. to depends on from.
  // The scheduler treats every edge as source → target where source depends on target.
  // So source = to, target = from.
  for (const [from, to] of edges_from_to) {
    const sourceId = [...nodes.values()].find((n) => n.name === to)!.id;
    const targetId = [...nodes.values()].find((n) => n.name === from)!.id;
    const edgeId = `${sourceId}->${targetId}:depends_on` as EdgeId;
    edges.set(edgeId, {
      id: edgeId,
      source: sourceId,
      target: targetId,
      relationship: 'depends_on',
      metadata: { created_at: now, labels: {}, inferred: false },
    });
  }
  return {
    id: 'g' as Graph['id'],
    name: 'g',
    version: '1.0',
    nodes,
    edges,
    metadata: { created_at: now, updated_at: now, labels: {}, annotations: {} },
  };
}

const create_phase: SchedulerPhase = 'create';

// ─── tests ───────────────────────────────────────────────────────────

describe('build_dag', () => {
  it('returns an empty Map for empty changes', () => {
    const records = build_dag([], create_phase, build_graph([], []));
    expect(records.size).toBe(0);
  });

  it('seeds one record per change with empty deps and dependents', () => {
    const resources = [
      { name: 'a', type: 'gcp.storage.bucket' },
      { name: 'b', type: 'gcp.storage.bucket' },
    ];
    const graph = build_graph(resources, []);
    const changes = resources.map((r) => build_change(r.name, r.type));
    const records = build_dag(changes, create_phase, graph);
    expect(records.size).toBe(2);
    for (const rec of records.values()) {
      expect(rec.deps.size).toBe(0);
      expect(rec.dependents.size).toBe(0);
      expect(rec.terminal).toBeUndefined();
      expect(rec.queued_emitted).toBe(false);
    }
  });

  it('wires deps and dependents from the graph edges (create phase)', () => {
    const resources = [
      { name: 'a', type: 'gcp.storage.bucket' },
      { name: 'b', type: 'gcp.storage.bucket' },
    ];
    // a must finish before b.
    const graph = build_graph(resources, [['a', 'b']]);
    const changes = resources.map((r) => build_change(r.name, r.type));
    const records = build_dag(changes, create_phase, graph);
    const a = records.get('gcp.storage.bucket:a')!;
    const b = records.get('gcp.storage.bucket:b')!;
    // b depends on a; a's dependents include b.
    expect(b.deps.has('gcp.storage.bucket:a')).toBe(true);
    expect(a.dependents.has('gcp.storage.bucket:b')).toBe(true);
    expect(a.deps.size).toBe(0);
    expect(b.dependents.size).toBe(0);
  });

  it('reverses edge direction for the delete phase', () => {
    const resources = [
      { name: 'a', type: 'gcp.storage.bucket' },
      { name: 'b', type: 'gcp.storage.bucket' },
    ];
    // Same edge as create-phase test, but phase=delete flips direction.
    const graph = build_graph(resources, [['a', 'b']]);
    const changes = resources.map((r) => ({
      ...build_change(r.name, r.type),
      change_type: 'delete' as const,
    }));
    const records = build_dag(changes, 'delete', graph);
    const a = records.get('gcp.storage.bucket:a')!;
    const b = records.get('gcp.storage.bucket:b')!;
    // For delete, b finishes before a — a depends on b.
    expect(a.deps.has('gcp.storage.bucket:b')).toBe(true);
    expect(b.dependents.has('gcp.storage.bucket:a')).toBe(true);
  });

  it('skips edges where one endpoint is not in this phase', () => {
    const all_resources = [
      { name: 'a', type: 'gcp.storage.bucket' },
      { name: 'b', type: 'gcp.storage.bucket' },
    ];
    const graph = build_graph(all_resources, [['a', 'b']]);
    // Only `a` is in this phase. Edge must be skipped silently.
    const changes = [build_change('a', 'gcp.storage.bucket')];
    const records = build_dag(changes, create_phase, graph);
    expect(records.size).toBe(1);
    expect(records.get('gcp.storage.bucket:a')!.deps.size).toBe(0);
    expect(records.get('gcp.storage.bucket:a')!.dependents.size).toBe(0);
  });

  it('skips self-edges', () => {
    const resources = [{ name: 'a', type: 'gcp.storage.bucket' }];
    const graph = build_graph(resources, []);
    // Manually add a self-loop.
    const id = 'gcp.storage.bucket:a' as NodeId;
    const edgeId = `${id}->${id}:depends_on` as EdgeId;
    graph.edges.set(edgeId, {
      id: edgeId,
      source: id,
      target: id,
      relationship: 'depends_on',
      metadata: { created_at: new Date().toISOString(), labels: {}, inferred: false },
    });
    const changes = [build_change('a', 'gcp.storage.bucket')];
    const records = build_dag(changes, create_phase, graph);
    expect(records.get(id)!.deps.size).toBe(0);
    expect(records.get(id)!.dependents.size).toBe(0);
  });

  it('builds a diamond fan-out correctly', () => {
    const resources = ['a', 'b', 'c', 'd'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
    const changes = resources.map((r) => build_change(r.name, r.type));
    const records = build_dag(changes, create_phase, graph);
    expect(records.get('gcp.storage.bucket:b')!.deps.has('gcp.storage.bucket:a')).toBe(true);
    expect(records.get('gcp.storage.bucket:c')!.deps.has('gcp.storage.bucket:a')).toBe(true);
    expect(records.get('gcp.storage.bucket:d')!.deps.has('gcp.storage.bucket:b')).toBe(true);
    expect(records.get('gcp.storage.bucket:d')!.deps.has('gcp.storage.bucket:c')).toBe(true);
    expect(records.get('gcp.storage.bucket:a')!.dependents.size).toBe(2);
    expect(records.get('gcp.storage.bucket:d')!.dependents.size).toBe(0);
  });

  it('throws on a 2-node cycle (a→b, b→a)', () => {
    const resources = ['a', 'b'].map((n) => ({ name: n, type: 'gcp.storage.bucket' }));
    const graph = build_graph(resources, [
      ['a', 'b'],
      ['b', 'a'],
    ]);
    const changes = resources.map((r) => build_change(r.name, r.type));
    expect(() => build_dag(changes, create_phase, graph)).toThrow(/Cycle detected in deployment graph/);
  });
});

describe('assert_no_cycle', () => {
  function rec(id: string, name: string, deps: string[] = [], dependents: string[] = []): NodeRecord {
    return {
      change: build_change(name, 'gcp.storage.bucket'),
      deps: new Set(deps),
      dependents: new Set(dependents),
      queued_emitted: false,
    };
  }

  it('passes silently for an empty Map', () => {
    expect(() => assert_no_cycle(new Map())).not.toThrow();
  });

  it('passes for a linear chain', () => {
    const records = new Map<string, NodeRecord>([
      ['a', rec('a', 'a', [], ['b'])],
      ['b', rec('b', 'b', ['a'], ['c'])],
      ['c', rec('c', 'c', ['b'], [])],
    ]);
    expect(() => assert_no_cycle(records)).not.toThrow();
  });

  it('throws with the offending names listed', () => {
    const records = new Map<string, NodeRecord>([
      ['a', rec('a', 'alpha', ['b'], ['b'])],
      ['b', rec('b', 'beta', ['a'], ['a'])],
    ]);
    let caught: Error | null = null;
    try {
      assert_no_cycle(records);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/Cycle detected in deployment graph/);
    expect(caught!.message).toContain('alpha');
    expect(caught!.message).toContain('beta');
  });

  it('throws even when only a sub-graph has a cycle', () => {
    const records = new Map<string, NodeRecord>([
      ['root', rec('root', 'root', [], [])],
      ['a', rec('a', 'a', ['b'], ['b'])],
      ['b', rec('b', 'b', ['a'], ['a'])],
    ]);
    expect(() => assert_no_cycle(records)).toThrow(/Cycle detected/);
  });
});

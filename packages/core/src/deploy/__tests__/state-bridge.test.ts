/**
 * Tests for `state-bridge.ts` — utilities for persisting deploy results
 * and loading prior deploy state for diffing.
 *
 * Covers every function:
 *   - load_state_for_diff: builds Map keyed by name; skips status === 'deleted'.
 *   - enrich_graph_with_state: maps node.name → entry.provider_id when both
 *     present; skips nodes whose state entry has no provider_id; skips nodes
 *     with no matching state entry.
 *   - sync_deploy_result_to_state: per-resource branch tree —
 *       (a) success === false → skip both upsert and delete.
 *       (b) success && action === 'delete' → delete_resource called.
 *       (c) success && action === 'create' → upsert_resource with status='created'.
 *       (d) success && action === 'update' → upsert_resource with status='updated'.
 *   - sync_resource_results_to_state: same branch tree against a flat
 *     ResourceDeployResult[] input.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  load_state_for_diff,
  enrich_graph_with_state,
  sync_deploy_result_to_state,
  sync_resource_results_to_state,
  type DeployStateStore,
  type StoredResourceEntry,
} from '../state-bridge';
import type { Graph, Node, NodeId, EdgeId } from '../../types/graph';
import type { DeployResult, ResourceDeployResult } from '../types';

// ─── Test helpers ────────────────────────────────────────────────────

function makeStore(): DeployStateStore & {
  upsert_resource: ReturnType<typeof vi.fn>;
  delete_resource: ReturnType<typeof vi.fn>;
  get_resources: ReturnType<typeof vi.fn>;
  get_resource: ReturnType<typeof vi.fn>;
} {
  return {
    upsert_resource: vi.fn().mockResolvedValue(undefined),
    delete_resource: vi.fn().mockResolvedValue(undefined),
    get_resources: vi.fn().mockResolvedValue([]),
    get_resource: vi.fn().mockResolvedValue(null),
  };
}

function entry(overrides: Partial<StoredResourceEntry> = {}): StoredResourceEntry {
  return {
    node_id: 'gcp.run.service:web',
    graph_id: 'graph-1',
    ice_type: 'gcp.run.service',
    name: 'web',
    provider_id: 'projects/p/locations/us-central1/services/web',
    status: 'created',
    properties: {},
    outputs: { url: 'https://example.com' },
    deployed_at: '2026-05-03T00:00:00.000Z',
    ...overrides,
  };
}

function makeGraph(nodes: Array<{ name: string; type: string }>): Graph {
  const nodes_map = new Map<NodeId, Node>();
  const now = '2026-05-03T00:00:00.000Z';
  for (const { name, type } of nodes) {
    const id = `${type}:${name}` as NodeId;
    nodes_map.set(id, {
      id,
      type,
      name,
      properties: {},
      metadata: { created_at: now, updated_at: now, labels: {}, annotations: {} },
    });
  }
  return {
    id: 'graph-1' as Graph['id'],
    name: 'g',
    version: '1',
    nodes: nodes_map,
    edges: new Map<EdgeId, never>(),
    metadata: { created_at: now, updated_at: now, labels: {}, annotations: {} },
  };
}

function makeResource(overrides: Partial<ResourceDeployResult> = {}): ResourceDeployResult {
  return {
    resource_id: 'gcp.run.service:web',
    name: 'web',
    type: 'gcp.run.service',
    action: 'create',
    success: true,
    duration_ms: 100,
    provider_id: 'svc-1',
    outputs: { url: 'https://example.com' },
    ...overrides,
  };
}

function makeDeployResult(resources: ResourceDeployResult[]): DeployResult {
  return {
    success: true,
    resources,
    summary: { total: resources.length, created: 0, updated: 0, deleted: 0, skipped: 0, failed: 0 },
    provider: 'gcp',
    started_at: '2026-05-03T00:00:00.000Z',
    completed_at: '2026-05-03T00:01:00.000Z',
    duration_ms: 60_000,
    errors: [],
    warnings: [],
  };
}

// ─── load_state_for_diff ─────────────────────────────────────────────

describe('load_state_for_diff', () => {
  it('returns an empty Map when the store has no entries for the graph', async () => {
    const store = makeStore();
    store.get_resources.mockResolvedValue([]);

    const map = await load_state_for_diff(store, 'graph-1');

    expect(map.size).toBe(0);
    expect(store.get_resources).toHaveBeenCalledWith('graph-1');
  });

  it('keys the Map by entry.name', async () => {
    const store = makeStore();
    store.get_resources.mockResolvedValue([entry({ name: 'web' }), entry({ name: 'db' })]);

    const map = await load_state_for_diff(store, 'graph-1');

    expect(map.size).toBe(2);
    expect(map.get('web')?.name).toBe('web');
    expect(map.get('db')?.name).toBe('db');
  });

  it('skips entries whose status is "deleted" so the diff engine sees only live state', async () => {
    const store = makeStore();
    store.get_resources.mockResolvedValue([
      entry({ name: 'live', status: 'created' }),
      entry({ name: 'gone', status: 'deleted' }),
    ]);

    const map = await load_state_for_diff(store, 'graph-1');

    expect(map.size).toBe(1);
    expect(map.has('live')).toBe(true);
    expect(map.has('gone')).toBe(false);
  });

  it('keeps entries with status "updated" or "failed" — only "deleted" is filtered', async () => {
    const store = makeStore();
    store.get_resources.mockResolvedValue([
      entry({ name: 'a', status: 'created' }),
      entry({ name: 'b', status: 'updated' }),
      entry({ name: 'c', status: 'failed' }),
    ]);

    const map = await load_state_for_diff(store, 'graph-1');

    expect(map.size).toBe(3);
  });
});

// ─── enrich_graph_with_state ─────────────────────────────────────────

describe('enrich_graph_with_state', () => {
  it('returns an empty Map when there are no graph nodes', () => {
    const graph = makeGraph([]);
    const state = new Map<string, StoredResourceEntry>();

    const result = enrich_graph_with_state(graph, state);

    expect(result.size).toBe(0);
  });

  it('returns an empty Map when no node names match state entries', () => {
    const graph = makeGraph([{ name: 'web', type: 'gcp.run.service' }]);
    const state = new Map<string, StoredResourceEntry>([['db', entry({ name: 'db' })]]);

    const result = enrich_graph_with_state(graph, state);

    expect(result.size).toBe(0);
  });

  it('maps node.name → provider_id for matched entries with provider_id', () => {
    const graph = makeGraph([{ name: 'web', type: 'gcp.run.service' }]);
    const state = new Map([['web', entry({ name: 'web', provider_id: 'svc-123' })]]);

    const result = enrich_graph_with_state(graph, state);

    expect(result.size).toBe(1);
    expect(result.get('web')).toBe('svc-123');
  });

  it('skips entries whose provider_id is undefined', () => {
    const graph = makeGraph([{ name: 'web', type: 'gcp.run.service' }]);
    const state = new Map([['web', entry({ name: 'web', provider_id: undefined })]]);

    const result = enrich_graph_with_state(graph, state);

    expect(result.size).toBe(0);
  });

  it('skips nodes with no matching state entry but maps the matching ones', () => {
    const graph = makeGraph([
      { name: 'web', type: 'gcp.run.service' },
      { name: 'db', type: 'gcp.sql.databaseInstance' },
      { name: 'cache', type: 'gcp.redis.instance' },
    ]);
    const state = new Map([
      ['web', entry({ name: 'web', provider_id: 'svc-1' })],
      ['db', entry({ name: 'db', provider_id: 'sql-1' })],
      // 'cache' missing
    ]);

    const result = enrich_graph_with_state(graph, state);

    expect(result.size).toBe(2);
    expect(result.get('web')).toBe('svc-1');
    expect(result.get('db')).toBe('sql-1');
    expect(result.has('cache')).toBe(false);
  });
});

// ─── sync_deploy_result_to_state ─────────────────────────────────────

describe('sync_deploy_result_to_state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T12:00:00.000Z'));
  });

  it('upserts a created resource with status="created" and the action mapped from "create"', async () => {
    const store = makeStore();
    const result = makeDeployResult([
      makeResource({ name: 'web', action: 'create', provider_id: 'svc-new', outputs: { url: 'u' } }),
    ]);

    await sync_deploy_result_to_state(store, result, 'graph-1');

    expect(store.upsert_resource).toHaveBeenCalledTimes(1);
    expect(store.delete_resource).not.toHaveBeenCalled();
    expect(store.upsert_resource).toHaveBeenCalledWith({
      node_id: 'gcp.run.service:web',
      graph_id: 'graph-1',
      ice_type: 'gcp.run.service',
      name: 'web',
      provider_id: 'svc-new',
      status: 'created',
      outputs: { url: 'u' },
      deployed_at: '2026-05-03T12:00:00.000Z',
    });
  });

  it('upserts an updated resource with status="updated" (action !== "create" branch)', async () => {
    const store = makeStore();
    const result = makeDeployResult([
      makeResource({ name: 'web', action: 'update', provider_id: 'svc-existing' }),
    ]);

    await sync_deploy_result_to_state(store, result, 'graph-1');

    expect(store.upsert_resource).toHaveBeenCalledTimes(1);
    expect(store.upsert_resource.mock.calls[0]?.[0]).toMatchObject({
      status: 'updated',
      provider_id: 'svc-existing',
    });
  });

  it('calls delete_resource (not upsert) for action="delete" and uses ${type}:${name} as the node id', async () => {
    const store = makeStore();
    const result = makeDeployResult([
      makeResource({ name: 'web', type: 'gcp.run.service', action: 'delete' }),
    ]);

    await sync_deploy_result_to_state(store, result, 'graph-1');

    expect(store.delete_resource).toHaveBeenCalledWith('gcp.run.service:web');
    expect(store.upsert_resource).not.toHaveBeenCalled();
  });

  it('skips resources with success=false (no upsert, no delete)', async () => {
    const store = makeStore();
    const result = makeDeployResult([
      makeResource({ name: 'failed-web', action: 'create', success: false }),
    ]);

    await sync_deploy_result_to_state(store, result, 'graph-1');

    expect(store.upsert_resource).not.toHaveBeenCalled();
    expect(store.delete_resource).not.toHaveBeenCalled();
  });

  it('handles a mixed batch: success creates, success deletes, and failures', async () => {
    const store = makeStore();
    const result = makeDeployResult([
      makeResource({ name: 'a', action: 'create', success: true }),
      makeResource({ name: 'b', action: 'delete', success: true }),
      makeResource({ name: 'c', action: 'update', success: true }),
      makeResource({ name: 'd', action: 'create', success: false }),
    ]);

    await sync_deploy_result_to_state(store, result, 'graph-1');

    expect(store.upsert_resource).toHaveBeenCalledTimes(2);
    expect(store.delete_resource).toHaveBeenCalledTimes(1);
    expect(store.delete_resource).toHaveBeenCalledWith('gcp.run.service:b');
  });

  it('passes the same ISO timestamp to every resource in one batch', async () => {
    const store = makeStore();
    const result = makeDeployResult([
      makeResource({ name: 'a', action: 'create' }),
      makeResource({ name: 'b', action: 'update' }),
    ]);

    await sync_deploy_result_to_state(store, result, 'graph-1');

    const call0 = store.upsert_resource.mock.calls[0]?.[0] as StoredResourceEntry;
    const call1 = store.upsert_resource.mock.calls[1]?.[0] as StoredResourceEntry;
    expect(call0.deployed_at).toBe(call1.deployed_at);
    expect(call0.deployed_at).toBe('2026-05-03T12:00:00.000Z');
  });

  it('does nothing when there are no resources in the result', async () => {
    const store = makeStore();
    const result = makeDeployResult([]);

    await sync_deploy_result_to_state(store, result, 'graph-1');

    expect(store.upsert_resource).not.toHaveBeenCalled();
    expect(store.delete_resource).not.toHaveBeenCalled();
  });
});

// ─── sync_resource_results_to_state ──────────────────────────────────

describe('sync_resource_results_to_state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T12:00:00.000Z'));
  });

  it('upserts a created resource with status="created"', async () => {
    const store = makeStore();
    const results = [
      makeResource({ name: 'web', action: 'create', provider_id: 'svc-new', outputs: { url: 'u' } }),
    ];

    await sync_resource_results_to_state(store, results, 'graph-1');

    expect(store.upsert_resource).toHaveBeenCalledTimes(1);
    expect(store.upsert_resource).toHaveBeenCalledWith({
      node_id: 'gcp.run.service:web',
      graph_id: 'graph-1',
      ice_type: 'gcp.run.service',
      name: 'web',
      provider_id: 'svc-new',
      status: 'created',
      outputs: { url: 'u' },
      deployed_at: '2026-05-03T12:00:00.000Z',
    });
  });

  it('upserts an updated resource with status="updated"', async () => {
    const store = makeStore();
    const results = [makeResource({ name: 'web', action: 'update' })];

    await sync_resource_results_to_state(store, results, 'graph-1');

    expect(store.upsert_resource.mock.calls[0]?.[0]).toMatchObject({
      status: 'updated',
    });
  });

  it('calls delete_resource for action="delete" with the ${type}:${name} key', async () => {
    const store = makeStore();
    const results = [
      makeResource({ name: 'web', type: 'gcp.run.service', action: 'delete' }),
    ];

    await sync_resource_results_to_state(store, results, 'graph-1');

    expect(store.delete_resource).toHaveBeenCalledWith('gcp.run.service:web');
    expect(store.upsert_resource).not.toHaveBeenCalled();
  });

  it('skips resources with success=false', async () => {
    const store = makeStore();
    const results = [makeResource({ name: 'web', action: 'create', success: false })];

    await sync_resource_results_to_state(store, results, 'graph-1');

    expect(store.upsert_resource).not.toHaveBeenCalled();
    expect(store.delete_resource).not.toHaveBeenCalled();
  });

  it('does nothing when given an empty array', async () => {
    const store = makeStore();

    await sync_resource_results_to_state(store, [], 'graph-1');

    expect(store.upsert_resource).not.toHaveBeenCalled();
    expect(store.delete_resource).not.toHaveBeenCalled();
  });

  it('handles a mixed batch identically to sync_deploy_result_to_state (parity check)', async () => {
    const store = makeStore();
    const results = [
      makeResource({ name: 'a', action: 'create', success: true }),
      makeResource({ name: 'b', action: 'delete', success: true }),
      makeResource({ name: 'c', action: 'update', success: true }),
      makeResource({ name: 'd', action: 'create', success: false }),
    ];

    await sync_resource_results_to_state(store, results, 'graph-1');

    expect(store.upsert_resource).toHaveBeenCalledTimes(2);
    expect(store.delete_resource).toHaveBeenCalledTimes(1);
    expect(store.delete_resource).toHaveBeenCalledWith('gcp.run.service:b');
  });
});

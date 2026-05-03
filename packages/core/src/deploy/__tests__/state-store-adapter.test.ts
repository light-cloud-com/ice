/**
 * Tests for `state-store-adapter.ts` — adapts SqliteStateStore (Result<T,
 * IceError>) to the simpler DeployStateStore interface used by
 * state-bridge.ts.
 *
 * Coverage targets every adapter method's success and error branches
 * plus the per-status mapping helper:
 *   - upsert_resource: maps `created` and `updated` → 'available' state
 *     status; everything else → 'pending'; provider_id ?? '' fallback;
 *     outputs ?? {} fallback; throws on Result.error.
 *   - delete_resource: passes graph_id (constructor) + node_id; throws on
 *     Result.error.
 *   - get_resources: maps Result.value (StoredResourceState[]) → entries,
 *     including the `cloud_id || undefined` fallback when cloud_id is empty;
 *     throws on Result.error; resource_status_to_entry_status: 'available'
 *     → 'created', 'updating' → 'updated', 'deleting' → 'deleted', anything
 *     else → 'created' (default branch).
 *   - get_resource: returns null when Result.value is null; maps single
 *     entry; throws on error.
 */
import { describe, it, expect, vi } from 'vitest';
import { create_deploy_state_adapter } from '../state-store-adapter.js';
import type { StoredResourceEntry } from '../state-bridge.js';
import type { SqliteStateStore } from '../../state/sqlite-state-store.js';
import type { StoredResourceState } from '../../state/state-store.js';
import type { NodeId } from '../../types/graph.js';
import type { Result } from '../../types/result.js';
import type { IceError } from '../../types/errors.js';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Build a Failure<IceError>-shape Result without instantiating IceError. */
function failure(message: string): Result<never, IceError> {
  return {
    ok: false,
    error: { message } as unknown as IceError,
  };
}

function successOf<T>(value: T): Result<T, IceError> {
  return { ok: true, value };
}

function makeStoredState(overrides: Partial<StoredResourceState> = {}): StoredResourceState {
  return {
    node_id: 'gcp.run.service:web' as NodeId,
    graph_id: 'graph-1',
    ice_type: 'gcp.run.service',
    name: 'web',
    state: {
      cloud_id: 'svc-1',
      status: 'available',
      outputs: { url: 'https://x' },
      created_at: '2026-05-03T00:00:00.000Z',
      updated_at: '2026-05-03T00:01:00.000Z',
    },
    created_at: '2026-05-03T00:00:00.000Z',
    updated_at: '2026-05-03T00:01:00.000Z',
    version: 1,
    ...overrides,
  };
}

function makeMockStore(): SqliteStateStore & {
  save_resource: ReturnType<typeof vi.fn>;
  delete_resource: ReturnType<typeof vi.fn>;
  get_resources: ReturnType<typeof vi.fn>;
  get_resource: ReturnType<typeof vi.fn>;
} {
  const fns = {
    save_resource: vi.fn().mockResolvedValue(successOf(undefined)),
    delete_resource: vi.fn().mockResolvedValue(successOf(undefined)),
    get_resources: vi.fn().mockResolvedValue(successOf([])),
    get_resource: vi.fn().mockResolvedValue(successOf(null)),
  };
  return fns as unknown as ReturnType<typeof makeMockStore>;
}

function entry(overrides: Partial<StoredResourceEntry> = {}): StoredResourceEntry {
  return {
    node_id: 'gcp.run.service:web',
    graph_id: 'graph-1',
    ice_type: 'gcp.run.service',
    name: 'web',
    provider_id: 'svc-1',
    status: 'created',
    outputs: { url: 'https://x' },
    deployed_at: '2026-05-03T00:00:00.000Z',
    ...overrides,
  };
}

// ─── upsert_resource ─────────────────────────────────────────────────

describe('create_deploy_state_adapter — upsert_resource', () => {
  it('forwards a "created" entry to save_resource with state.status="available" and version=1', async () => {
    const store = makeMockStore();
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await adapter.upsert_resource(entry({ status: 'created', provider_id: 'svc-1' }));

    expect(store.save_resource).toHaveBeenCalledTimes(1);
    const arg = store.save_resource.mock.calls[0]?.[0] as StoredResourceState;
    expect(arg.state.status).toBe('available');
    expect(arg.state.cloud_id).toBe('svc-1');
    expect(arg.version).toBe(1);
  });

  it('maps an "updated" entry to state.status="available" (matches the "created || updated" branch)', async () => {
    const store = makeMockStore();
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await adapter.upsert_resource(entry({ status: 'updated' }));

    const arg = store.save_resource.mock.calls[0]?.[0] as StoredResourceState;
    expect(arg.state.status).toBe('available');
  });

  it('maps a "failed" entry to state.status="pending" (else branch)', async () => {
    const store = makeMockStore();
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await adapter.upsert_resource(entry({ status: 'failed' }));

    const arg = store.save_resource.mock.calls[0]?.[0] as StoredResourceState;
    expect(arg.state.status).toBe('pending');
  });

  it('maps a "deleted" entry to state.status="pending" (else branch — included for completeness)', async () => {
    const store = makeMockStore();
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await adapter.upsert_resource(entry({ status: 'deleted' }));

    const arg = store.save_resource.mock.calls[0]?.[0] as StoredResourceState;
    expect(arg.state.status).toBe('pending');
  });

  it('substitutes empty string for cloud_id when provider_id is absent (?? "" branch)', async () => {
    const store = makeMockStore();
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await adapter.upsert_resource(entry({ provider_id: undefined }));

    const arg = store.save_resource.mock.calls[0]?.[0] as StoredResourceState;
    expect(arg.state.cloud_id).toBe('');
  });

  it('substitutes an empty object for outputs when undefined (?? {} branch)', async () => {
    const store = makeMockStore();
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await adapter.upsert_resource(entry({ outputs: undefined }));

    const arg = store.save_resource.mock.calls[0]?.[0] as StoredResourceState;
    expect(arg.state.outputs).toEqual({});
  });

  it('passes through the entry deployed_at as state.created_at and uses now() for updated_at', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T15:00:00.000Z'));
    const store = makeMockStore();
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await adapter.upsert_resource(entry({ deployed_at: '2026-05-01T00:00:00.000Z' }));

    const arg = store.save_resource.mock.calls[0]?.[0] as StoredResourceState;
    expect(arg.state.created_at).toBe('2026-05-01T00:00:00.000Z');
    expect(arg.state.updated_at).toBe('2026-05-03T15:00:00.000Z');
    expect(arg.created_at).toBe('2026-05-01T00:00:00.000Z');
    expect(arg.updated_at).toBe('2026-05-03T15:00:00.000Z');

    vi.useRealTimers();
  });

  it('threads node_id through create_node_id (branded NodeId) without altering the string value', async () => {
    const store = makeMockStore();
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await adapter.upsert_resource(entry({ node_id: 'gcp.run.service:web' }));

    const arg = store.save_resource.mock.calls[0]?.[0] as StoredResourceState;
    expect(arg.node_id).toBe('gcp.run.service:web');
  });

  it('throws with a "Failed to upsert resource" message when save_resource returns a failure', async () => {
    const store = makeMockStore();
    store.save_resource.mockResolvedValue(failure('disk full'));
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await expect(adapter.upsert_resource(entry())).rejects.toThrow('Failed to upsert resource: disk full');
  });
});

// ─── delete_resource ─────────────────────────────────────────────────

describe('create_deploy_state_adapter — delete_resource', () => {
  it('forwards the constructor graph_id and a branded node_id to the store', async () => {
    const store = makeMockStore();
    const adapter = create_deploy_state_adapter(store, 'graph-7');

    await adapter.delete_resource('gcp.run.service:web');

    expect(store.delete_resource).toHaveBeenCalledTimes(1);
    expect(store.delete_resource).toHaveBeenCalledWith('graph-7', 'gcp.run.service:web');
  });

  it('throws "Failed to delete resource" with the inner message on failure', async () => {
    const store = makeMockStore();
    store.delete_resource.mockResolvedValue(failure('not found'));
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await expect(adapter.delete_resource('gcp.run.service:gone')).rejects.toThrow(
      'Failed to delete resource: not found',
    );
  });
});

// ─── get_resources ───────────────────────────────────────────────────

describe('create_deploy_state_adapter — get_resources', () => {
  it('returns an empty array when the store returns no entries', async () => {
    const store = makeMockStore();
    store.get_resources.mockResolvedValue(successOf([]));
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    const result = await adapter.get_resources('graph-1');

    expect(result).toEqual([]);
    expect(store.get_resources).toHaveBeenCalledWith('graph-1');
  });

  it('maps each StoredResourceState to a StoredResourceEntry', async () => {
    const store = makeMockStore();
    store.get_resources.mockResolvedValue(
      successOf([
        makeStoredState({
          node_id: 'gcp.run.service:web' as NodeId,
          ice_type: 'gcp.run.service',
          name: 'web',
          state: { cloud_id: 'svc-1', status: 'available', outputs: { url: 'u' } },
          updated_at: '2026-05-03T03:00:00.000Z',
        }),
      ]),
    );
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    const [first] = await adapter.get_resources('graph-1');

    expect(first).toEqual({
      node_id: 'gcp.run.service:web',
      graph_id: 'graph-1',
      ice_type: 'gcp.run.service',
      name: 'web',
      provider_id: 'svc-1',
      status: 'created',
      outputs: { url: 'u' },
      deployed_at: '2026-05-03T03:00:00.000Z',
    });
  });

  it('maps a status of "available" → "created"', async () => {
    const store = makeMockStore();
    store.get_resources.mockResolvedValue(
      successOf([makeStoredState({ state: { cloud_id: 'c', status: 'available', outputs: {} } })]),
    );
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    const result = await adapter.get_resources('graph-1');

    expect(result[0]?.status).toBe('created');
  });

  it('maps a status of "updating" → "updated"', async () => {
    const store = makeMockStore();
    store.get_resources.mockResolvedValue(
      successOf([makeStoredState({ state: { cloud_id: 'c', status: 'updating', outputs: {} } })]),
    );
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    const result = await adapter.get_resources('graph-1');

    expect(result[0]?.status).toBe('updated');
  });

  it('maps a status of "deleting" → "deleted"', async () => {
    const store = makeMockStore();
    store.get_resources.mockResolvedValue(
      successOf([makeStoredState({ state: { cloud_id: 'c', status: 'deleting', outputs: {} } })]),
    );
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    const result = await adapter.get_resources('graph-1');

    expect(result[0]?.status).toBe('deleted');
  });

  it('maps any other status (default branch — e.g. "pending") → "created"', async () => {
    const store = makeMockStore();
    store.get_resources.mockResolvedValue(
      successOf([makeStoredState({ state: { cloud_id: 'c', status: 'pending', outputs: {} } })]),
    );
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    const result = await adapter.get_resources('graph-1');

    expect(result[0]?.status).toBe('created');
  });

  it('also maps "failed" through the default branch → "created"', async () => {
    const store = makeMockStore();
    store.get_resources.mockResolvedValue(
      successOf([makeStoredState({ state: { cloud_id: 'c', status: 'failed', outputs: {} } })]),
    );
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    const result = await adapter.get_resources('graph-1');

    expect(result[0]?.status).toBe('created');
  });

  it('produces provider_id=undefined when cloud_id is the empty string (cloud_id || undefined branch)', async () => {
    const store = makeMockStore();
    store.get_resources.mockResolvedValue(
      successOf([makeStoredState({ state: { cloud_id: '', status: 'available', outputs: {} } })]),
    );
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    const result = await adapter.get_resources('graph-1');

    expect(result[0]?.provider_id).toBeUndefined();
  });

  it('throws "Failed to get resources" on store failure', async () => {
    const store = makeMockStore();
    store.get_resources.mockResolvedValue(failure('connection refused'));
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await expect(adapter.get_resources('graph-1')).rejects.toThrow(
      'Failed to get resources: connection refused',
    );
  });
});

// ─── get_resource (singular) ─────────────────────────────────────────

describe('create_deploy_state_adapter — get_resource', () => {
  it('returns null when the store finds no row (Result.value === null)', async () => {
    const store = makeMockStore();
    store.get_resource.mockResolvedValue(successOf(null));
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    const result = await adapter.get_resource('gcp.run.service:missing');

    expect(result).toBeNull();
    expect(store.get_resource).toHaveBeenCalledWith('graph-1', 'gcp.run.service:missing');
  });

  it('maps the single StoredResourceState to a StoredResourceEntry on a hit', async () => {
    const store = makeMockStore();
    store.get_resource.mockResolvedValue(
      successOf(
        makeStoredState({
          name: 'web',
          state: { cloud_id: 'svc-99', status: 'available', outputs: { url: 'u' } },
          updated_at: '2026-05-03T05:00:00.000Z',
        }),
      ),
    );
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    const result = await adapter.get_resource('gcp.run.service:web');

    expect(result).toEqual({
      node_id: 'gcp.run.service:web',
      graph_id: 'graph-1',
      ice_type: 'gcp.run.service',
      name: 'web',
      provider_id: 'svc-99',
      status: 'created',
      outputs: { url: 'u' },
      deployed_at: '2026-05-03T05:00:00.000Z',
    });
  });

  it('produces provider_id=undefined when cloud_id is empty (single-row variant of cloud_id || undefined)', async () => {
    const store = makeMockStore();
    store.get_resource.mockResolvedValue(
      successOf(makeStoredState({ state: { cloud_id: '', status: 'available', outputs: {} } })),
    );
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    const result = await adapter.get_resource('gcp.run.service:web');

    expect(result?.provider_id).toBeUndefined();
  });

  it('passes the constructor graph_id and a branded node_id', async () => {
    const store = makeMockStore();
    const adapter = create_deploy_state_adapter(store, 'graph-42');

    await adapter.get_resource('gcp.run.service:web');

    expect(store.get_resource).toHaveBeenCalledWith('graph-42', 'gcp.run.service:web');
  });

  it('throws "Failed to get resource" on store failure', async () => {
    const store = makeMockStore();
    store.get_resource.mockResolvedValue(failure('row corrupt'));
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    await expect(adapter.get_resource('gcp.run.service:web')).rejects.toThrow(
      'Failed to get resource: row corrupt',
    );
  });

  it('also maps every status branch through the singular getter (parity with get_resources)', async () => {
    const store = makeMockStore();
    const adapter = create_deploy_state_adapter(store, 'graph-1');

    for (const [storeStatus, entryStatus] of [
      ['available', 'created'],
      ['updating', 'updated'],
      ['deleting', 'deleted'],
      ['pending', 'created'],
    ] as const) {
      store.get_resource.mockResolvedValueOnce(
        successOf(makeStoredState({ state: { cloud_id: 'c', status: storeStatus, outputs: {} } })),
      );
      const result = await adapter.get_resource('gcp.run.service:web');
      expect(result?.status).toBe(entryStatus);
    }
  });
});

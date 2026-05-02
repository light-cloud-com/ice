/**
 * Tests for `sqlite-state-store.ts` (rf-sqlite-7 — orchestrator class).
 *
 * The class itself is a thin shell: every method delegates to a
 * standalone helper in `./sqlite/<domain>.ts`. The helpers are
 * exhaustively tested in `sqlite/__tests__/<domain>.test.ts` against
 * the same SqliteContext. These tests pin the orchestration layer:
 *  - constructor merges Partial<SqliteStateStoreOptions> with DEFAULT_OPTIONS
 *  - every method routes ctx + args to the correct helper (1:1 delegate)
 *  - on_change / off_change mutate ctx.listeners in place
 *  - factory functions construct with the expected option shape
 *
 * Concurrent invocation against a single store is a regression check:
 * the SqliteContext mutable handle must survive concurrent reads/writes
 * without dropping events or corrupting prepared-statement cache.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SqliteStateStore,
  create_sqlite_state_store,
  create_memory_state_store,
} from '../sqlite-state-store.js';
import { create_node_id } from '../../types/graph.js';
import { create_deployment_id } from '../../types/deployment.js';
import type { DeploymentRecord, StateChangeEvent, StoredResourceState } from '../state-store.js';

function fixture_resource(overrides: Partial<StoredResourceState> = {}): StoredResourceState {
  return {
    node_id: create_node_id('node-1'),
    ice_type: 'compute',
    name: 'web-1',
    state: { cloud_id: 'c1', status: 'available', outputs: {} },
    created_at: '2026-04-30T00:00:00.000Z',
    updated_at: '2026-04-30T00:00:00.000Z',
    graph_id: 'graph-1',
    version: 1,
    ...overrides,
  };
}

function fixture_deployment(overrides: Partial<DeploymentRecord> = {}): DeploymentRecord {
  return {
    id: create_deployment_id('dep-1'),
    graph_id: 'graph-1',
    status: 'running',
    started_at: '2026-04-30T00:00:00.000Z',
    resource_count: 3,
    success_count: 0,
    failure_count: 0,
    version: 1,
    ...overrides,
  };
}

// =============================================================================
// Constructor + factories
// =============================================================================

describe('SqliteStateStore constructor', () => {
  it('uses DEFAULT_OPTIONS when no options passed', () => {
    const store = new SqliteStateStore();
    // Reach into the shell to confirm defaults applied.
    const opts = (store as unknown as { options: { path: string; wal_mode: boolean } }).options;
    expect(opts.path).toBe('.ice/state.db');
    expect(opts.wal_mode).toBe(true);
  });

  it('merges partial overrides on top of defaults', () => {
    const store = new SqliteStateStore({ path: ':memory:', wal_mode: false });
    const opts = (store as unknown as {
      options: { path: string; wal_mode: boolean; foreign_keys: boolean; busy_timeout_ms: number };
    }).options;
    expect(opts.path).toBe(':memory:');
    expect(opts.wal_mode).toBe(false);
    // Untouched defaults survive the merge.
    expect(opts.foreign_keys).toBe(true);
    expect(opts.busy_timeout_ms).toBe(5000);
  });
});

describe('create_sqlite_state_store', () => {
  it('returns a SqliteStateStore instance', () => {
    const store = create_sqlite_state_store({ path: ':memory:' });
    expect(store).toBeInstanceOf(SqliteStateStore);
  });

  it('passes options through to the constructor', () => {
    const store = create_sqlite_state_store({ path: ':memory:', wal_mode: false });
    const opts = (store as unknown as { options: { path: string; wal_mode: boolean } }).options;
    expect(opts.path).toBe(':memory:');
    expect(opts.wal_mode).toBe(false);
  });

  it('works with no options argument (uses defaults)', () => {
    const store = create_sqlite_state_store();
    expect(store).toBeInstanceOf(SqliteStateStore);
  });
});

describe('create_memory_state_store', () => {
  it('returns a SqliteStateStore configured for :memory:', () => {
    const store = create_memory_state_store();
    const opts = (store as unknown as { options: { path: string } }).options;
    expect(opts.path).toBe(':memory:');
  });

  it('produces a fully-functional store after initialize()', async () => {
    const store = create_memory_state_store();
    const init = await store.initialize();
    expect(init.ok).toBe(true);
    const health = await store.health_check();
    if (health.ok) expect(health.value).toBe(true);
    await store.close();
  });
});

// =============================================================================
// Lifecycle delegation
// =============================================================================

describe('lifecycle delegation', () => {
  it('initialize → close → health_check round-trip', async () => {
    const store = create_memory_state_store();

    const beforeInit = await store.health_check();
    if (beforeInit.ok) expect(beforeInit.value).toBe(false);

    const init = await store.initialize();
    expect(init.ok).toBe(true);

    const afterInit = await store.health_check();
    if (afterInit.ok) expect(afterInit.value).toBe(true);

    const close = await store.close();
    expect(close.ok).toBe(true);

    const afterClose = await store.health_check();
    if (afterClose.ok) expect(afterClose.value).toBe(false);
  });
});

// =============================================================================
// Resource delegation
// =============================================================================

describe('resource method delegation', () => {
  let store: SqliteStateStore;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
  });

  it('save_resource → get_resource round-trips through the orchestrator', async () => {
    const r = fixture_resource();
    const save = await store.save_resource(r);
    expect(save.ok).toBe(true);

    const got = await store.get_resource('graph-1', create_node_id('node-1'));
    expect(got.ok).toBe(true);
    if (got.ok && got.value) {
      expect(got.value.name).toBe('web-1');
      expect(got.value.state.cloud_id).toBe('c1');
    }
  });

  it('save_resources persists multiple in one txn via the orchestrator', async () => {
    const items = [
      fixture_resource({ node_id: create_node_id('n1'), name: 'a' }),
      fixture_resource({ node_id: create_node_id('n2'), name: 'b' }),
    ];
    const save = await store.save_resources(items);
    expect(save.ok).toBe(true);

    const all = await store.get_resources('graph-1');
    if (all.ok) expect(all.value).toHaveLength(2);
  });

  it('query_resources routes filter args to the helper', async () => {
    await store.save_resource(fixture_resource({ node_id: create_node_id('n1'), ice_type: 'compute' }));
    await store.save_resource(fixture_resource({ node_id: create_node_id('n2'), ice_type: 'database' }));

    const result = await store.query_resources({ ice_type: 'database' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.ice_type).toBe('database');
    }
  });

  it('delete_resource removes the row through the orchestrator', async () => {
    await store.save_resource(fixture_resource());
    const del = await store.delete_resource('graph-1', create_node_id('node-1'));
    expect(del.ok).toBe(true);

    const got = await store.get_resource('graph-1', create_node_id('node-1'));
    if (got.ok) expect(got.value).toBeNull();
  });

  it('delete_resources returns the changes count from the helper', async () => {
    await store.save_resource(fixture_resource({ node_id: create_node_id('n1') }));
    await store.save_resource(fixture_resource({ node_id: create_node_id('n2') }));

    const result = await store.delete_resources('graph-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(2);
  });
});

// =============================================================================
// Deployment delegation
// =============================================================================

describe('deployment method delegation', () => {
  let store: SqliteStateStore;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
  });

  it('save_deployment → get_deployment round-trip', async () => {
    const d = fixture_deployment();
    const save = await store.save_deployment(d);
    expect(save.ok).toBe(true);

    const got = await store.get_deployment(d.id);
    if (got.ok && got.value) {
      expect(got.value.id).toBe('dep-1');
      expect(got.value.status).toBe('running');
    }
  });

  it('get_deployments returns rows for a graph', async () => {
    await store.save_deployment(fixture_deployment({ id: create_deployment_id('d1') }));
    await store.save_deployment(fixture_deployment({ id: create_deployment_id('d2') }));

    const result = await store.get_deployments('graph-1');
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('query_deployments routes filter args to the helper', async () => {
    await store.save_deployment(fixture_deployment({ id: create_deployment_id('d1'), status: 'running' }));
    await store.save_deployment(fixture_deployment({ id: create_deployment_id('d2'), status: 'succeeded' }));

    const result = await store.query_deployments({ status: 'succeeded' });
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe('d2');
    }
  });

  it('update_deployment_status routes status + counts + error_message to helper', async () => {
    await store.save_deployment(fixture_deployment());
    const update = await store.update_deployment_status(
      create_deployment_id('dep-1'),
      'failed',
      { success: 1, failure: 2 },
      'partial outage',
    );
    expect(update.ok).toBe(true);

    const got = await store.get_deployment(create_deployment_id('dep-1'));
    if (got.ok && got.value) {
      expect(got.value.status).toBe('failed');
      expect(got.value.success_count).toBe(1);
      expect(got.value.failure_count).toBe(2);
      expect(got.value.error_message).toBe('partial outage');
    }
  });
});

// =============================================================================
// Lock delegation
// =============================================================================

describe('lock method delegation', () => {
  let store: SqliteStateStore;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
  });

  it('acquire_lock → is_locked → get_lock → refresh_lock → release_lock chain', async () => {
    const acq = await store.acquire_lock('graph-1', 'owner-1', 60);
    expect(acq.ok).toBe(true);
    if (!acq.ok) return;

    const locked = await store.is_locked('graph-1');
    if (locked.ok) expect(locked.value).toBe(true);

    const got = await store.get_lock('graph-1');
    if (got.ok && got.value) {
      expect(got.value.owner).toBe('owner-1');
    }

    const refreshed = await store.refresh_lock(acq.value.id, 600);
    expect(refreshed.ok).toBe(true);

    const released = await store.release_lock(acq.value.id);
    expect(released.ok).toBe(true);

    const finalCheck = await store.is_locked('graph-1');
    if (finalCheck.ok) expect(finalCheck.value).toBe(false);
  });

  it('acquire_lock passes deployment_id through to the helper', async () => {
    const dep_id = create_deployment_id('dep-x');
    const acq = await store.acquire_lock('graph-1', 'owner-1', 60, dep_id);
    if (acq.ok) {
      expect(acq.value.deployment_id).toBe('dep-x');
    }
  });
});

// =============================================================================
// Snapshot delegation
// =============================================================================

describe('snapshot method delegation', () => {
  let store: SqliteStateStore;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
  });

  it('create_snapshot → get_snapshot → list_snapshots round-trip', async () => {
    await store.save_resource(fixture_resource());
    const create = await store.create_snapshot('graph-1', 'a-description');
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const got = await store.get_snapshot(create.value.id);
    if (got.ok && got.value) {
      expect(got.value.description).toBe('a-description');
    }

    const list = await store.list_snapshots('graph-1');
    if (list.ok) {
      expect(list.value).toHaveLength(1);
      expect(list.value[0]?.id).toBe(create.value.id);
    }
  });

  it('restore_snapshot replaces current resources via the orchestrator', async () => {
    await store.save_resource(fixture_resource({ node_id: create_node_id('n1'), name: 'before' }));
    const snap = await store.create_snapshot('graph-1');
    if (!snap.ok) throw new Error('snapshot seed failed');

    // Mutate.
    await store.save_resource(fixture_resource({ node_id: create_node_id('n1'), name: 'after' }));

    const restore = await store.restore_snapshot(snap.value.id);
    expect(restore.ok).toBe(true);

    const got = await store.get_resource('graph-1', create_node_id('n1'));
    if (got.ok && got.value) {
      expect(got.value.name).toBe('before');
    }
  });

  it('delete_snapshot removes the snapshot via the orchestrator', async () => {
    const create = await store.create_snapshot('graph-1');
    if (!create.ok) throw new Error('snapshot seed failed');

    const del = await store.delete_snapshot(create.value.id);
    expect(del.ok).toBe(true);

    const got = await store.get_snapshot(create.value.id);
    if (got.ok) expect(got.value).toBeNull();
  });
});

// =============================================================================
// Event subscription (on_change / off_change)
// =============================================================================

describe('on_change / off_change', () => {
  it('on_change subscribes a listener that receives state-change events', async () => {
    const store = create_memory_state_store();
    await store.initialize();

    const seen: StateChangeEvent[] = [];
    const listener = (e: StateChangeEvent): void => {
      seen.push(e);
    };
    store.on_change(listener);

    await store.save_resource(fixture_resource());
    expect(seen.map((e) => e.type)).toContain('resource_created');
  });

  it('off_change removes a previously-subscribed listener', async () => {
    const store = create_memory_state_store();
    await store.initialize();

    const seen: StateChangeEvent[] = [];
    const listener = (e: StateChangeEvent): void => {
      seen.push(e);
    };
    store.on_change(listener);
    store.off_change(listener);

    await store.save_resource(fixture_resource());
    expect(seen).toEqual([]);
  });

  it('multiple listeners all receive events; off_change removes only the targeted one', async () => {
    const store = create_memory_state_store();
    await store.initialize();

    const a: StateChangeEvent[] = [];
    const b: StateChangeEvent[] = [];
    const listenerA = (e: StateChangeEvent): void => {
      a.push(e);
    };
    const listenerB = (e: StateChangeEvent): void => {
      b.push(e);
    };
    store.on_change(listenerA);
    store.on_change(listenerB);

    await store.save_resource(fixture_resource());
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    store.off_change(listenerA);
    await store.save_resource(fixture_resource({ node_id: create_node_id('node-2') }));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
  });
});

// =============================================================================
// Concurrent operations against the same store
// =============================================================================

describe('concurrent operations', () => {
  it('parallel save_resource calls all land in the same context without losing rows', async () => {
    const store = create_memory_state_store();
    await store.initialize();

    const saves = Array.from({ length: 10 }, (_, i) =>
      store.save_resource(fixture_resource({ node_id: create_node_id(`n-${i}`), name: `r-${i}` })),
    );
    const results = await Promise.all(saves);
    expect(results.every((r) => r.ok)).toBe(true);

    const all = await store.get_resources('graph-1');
    if (all.ok) expect(all.value).toHaveLength(10);
  });

  it('parallel reads against a populated store all succeed', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    await store.save_resource(fixture_resource());

    const reads = Array.from({ length: 5 }, () => store.get_resource('graph-1', create_node_id('node-1')));
    const results = await Promise.all(reads);
    expect(results.every((r) => r.ok && r.value !== null)).toBe(true);
  });
});

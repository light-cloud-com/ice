/**
 * Tests for `sqlite/snapshots.ts` (rf-sqlite-5).
 *
 * Behaviour pinned (preserved from pre-extraction):
 *  - create_snapshot returns the snapshot WITH resources hydrated
 *    (the in-txn closure reuses the same row[] for both INSERT
 *    serialization AND the return value)
 *  - create_snapshot emits 'snapshot_created' AFTER the txn commits
 *  - resource_data is a JSON-stringified ResourceRow[] (raw row shape,
 *    NOT StoredResourceState[]); restore_snapshot reads
 *    state_json/status from each row directly to re-upsert
 *  - get_snapshot / list_snapshots return null/[] on miss
 *  - list_snapshots orders by created_at DESC
 *  - restore_snapshot:
 *      - DELETEs all current resources for the snapshot's graph_id
 *        BEFORE inserting from snapshot (full replacement)
 *      - works in a single transaction (snapshot-not-found throws
 *        inside the txn → catch wraps via wrap_error)
 *      - emits 'snapshot_restored' AFTER commit
 *  - delete_snapshot does NOT emit any event (no snapshot_deleted in
 *    StateChangeType enum)
 *  - row_to_snapshot maps null description → undefined
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { create_node_id } from '../../../types/graph';
import { create_memory_state_store } from '../../sqlite-state-store';
import { resources_get, resources_get_all, resources_save } from '../resources';
import { snapshots_create, snapshots_get, snapshots_list, snapshots_restore, snapshots_delete } from '../snapshots';
import type { StoredResourceState, StateChangeEvent } from '../../state-store';
import type { SqliteContext } from '../types';

function getCtx(store: ReturnType<typeof create_memory_state_store>): SqliteContext {
  return (store as unknown as { ctx: SqliteContext }).ctx;
}

function fixture(overrides: Partial<StoredResourceState> = {}): StoredResourceState {
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

describe('snapshots_create', () => {
  let store: ReturnType<typeof create_memory_state_store>;
  let ctx: SqliteContext;
  let events: StateChangeEvent[];

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
    ctx = getCtx(store);
    events = [];
    ctx.listeners.add((e) => events.push(e));
  });

  it('emits snapshot_created and returns the snapshot with hydrated resources', async () => {
    await resources_save(ctx, fixture({ node_id: create_node_id('n1'), name: 'a' }));
    await resources_save(ctx, fixture({ node_id: create_node_id('n2'), name: 'b' }));
    events.length = 0;

    const result = await snapshots_create(ctx, 'graph-1', 'before-prod-cutover');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.graph_id).toBe('graph-1');
      expect(result.value.description).toBe('before-prod-cutover');
      expect(result.value.id).toMatch(/^snap_\d+_/);
      expect(result.value.resources).toHaveLength(2);
      expect(result.value.resources.map((r) => r.name).sort()).toEqual(['a', 'b']);
    }
    expect(events.map((e) => e.type)).toEqual(['snapshot_created']);
    expect(events[0]?.graph_id).toBe('graph-1');
  });

  it('snapshots an empty graph (resources=[])', async () => {
    const result = await snapshots_create(ctx, 'graph-empty');
    if (result.ok) {
      expect(result.value.resources).toEqual([]);
    }
  });

  it('description is undefined when omitted', async () => {
    const result = await snapshots_create(ctx, 'graph-1');
    if (result.ok) {
      expect(result.value.description).toBeUndefined();
    }
  });

  it('two snapshots of the same graph have distinct ids', async () => {
    const a = await snapshots_create(ctx, 'graph-1');
    // Wait a millisecond so Date.now() differs in the id; the random
    // suffix would also differ but timing makes the test robust.
    await new Promise((r) => setTimeout(r, 2));
    const b = await snapshots_create(ctx, 'graph-1');
    if (a.ok && b.ok) {
      expect(a.value.id).not.toBe(b.value.id);
    }
  });
});

describe('snapshots_get / snapshots_list', () => {
  let store: ReturnType<typeof create_memory_state_store>;
  let ctx: SqliteContext;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
    ctx = getCtx(store);
  });

  it('get returns null for unknown id', async () => {
    const result = await snapshots_get(ctx, 'snap-nope');
    if (result.ok) expect(result.value).toBeNull();
  });

  it('list returns [] for a graph with no snapshots', async () => {
    const result = await snapshots_list(ctx, 'graph-empty');
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('round-trips a created snapshot through get', async () => {
    await resources_save(ctx, fixture());
    const create = await snapshots_create(ctx, 'graph-1', 'desc');
    if (!create.ok) throw new Error('seed failed');
    const got = await snapshots_get(ctx, create.value.id);
    if (got.ok && got.value) {
      expect(got.value.id).toBe(create.value.id);
      expect(got.value.description).toBe('desc');
      expect(got.value.resources).toHaveLength(1);
      expect(got.value.resources[0]?.name).toBe('web-1');
    }
  });

  it('list orders by created_at DESC', async () => {
    const a = await snapshots_create(ctx, 'graph-1');
    await new Promise((r) => setTimeout(r, 5));
    const b = await snapshots_create(ctx, 'graph-1');
    await new Promise((r) => setTimeout(r, 5));
    const c = await snapshots_create(ctx, 'graph-1');
    if (!(a.ok && b.ok && c.ok)) throw new Error('seed failed');

    const result = await snapshots_list(ctx, 'graph-1');
    if (result.ok) {
      expect(result.value.map((s) => s.id)).toEqual([c.value.id, b.value.id, a.value.id]);
    }
  });

  it('row_to_snapshot maps null description → undefined', async () => {
    const create = await snapshots_create(ctx, 'graph-1'); // no description
    if (!create.ok) throw new Error('seed failed');
    const got = await snapshots_get(ctx, create.value.id);
    if (got.ok && got.value) {
      expect(got.value.description).toBeUndefined();
    }
  });
});

describe('snapshots_restore', () => {
  let store: ReturnType<typeof create_memory_state_store>;
  let ctx: SqliteContext;
  let events: StateChangeEvent[];

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
    ctx = getCtx(store);
    events = [];
    ctx.listeners.add((e) => events.push(e));
  });

  it('replaces current resources with snapshot contents and emits snapshot_restored', async () => {
    // Snapshot with 2 resources.
    await resources_save(ctx, fixture({ node_id: create_node_id('n1'), name: 'before-1' }));
    await resources_save(ctx, fixture({ node_id: create_node_id('n2'), name: 'before-2' }));
    const snap = await snapshots_create(ctx, 'graph-1');
    if (!snap.ok) throw new Error('seed failed');

    // Add a third resource AFTER snapshot — should be removed by restore.
    await resources_save(ctx, fixture({ node_id: create_node_id('n3'), name: 'after-snap' }));

    events.length = 0;
    const result = await snapshots_restore(ctx, snap.value.id);
    expect(result.ok).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['snapshot_restored']);

    const all = await resources_get_all(ctx, 'graph-1');
    if (all.ok) {
      expect(all.value).toHaveLength(2);
      // The third resource (added after snap) is gone.
      expect(all.value.map((r) => r.name).sort()).toEqual(['before-1', 'before-2']);
    }
  });

  it('restoring an empty snapshot deletes ALL current resources', async () => {
    // Empty graph snapshot.
    const snap = await snapshots_create(ctx, 'graph-1');
    if (!snap.ok) throw new Error('seed failed');

    // Add resources after snapshot.
    await resources_save(ctx, fixture({ node_id: create_node_id('n1') }));
    await resources_save(ctx, fixture({ node_id: create_node_id('n2') }));

    await snapshots_restore(ctx, snap.value.id);
    const all = await resources_get_all(ctx, 'graph-1');
    if (all.ok) expect(all.value).toEqual([]);
  });

  it('preserves resources in OTHER graphs (only deletes graph_id from snapshot)', async () => {
    await resources_save(ctx, fixture({ graph_id: 'graph-1', node_id: create_node_id('n1') }));
    const snap = await snapshots_create(ctx, 'graph-1');
    if (!snap.ok) throw new Error('seed failed');

    // Resources in a different graph.
    await resources_save(ctx, fixture({ graph_id: 'graph-2', node_id: create_node_id('m1') }));

    await snapshots_restore(ctx, snap.value.id);
    const other = await resources_get_all(ctx, 'graph-2');
    if (other.ok) expect(other.value).toHaveLength(1);
  });

  it('returns failure when snapshot id is unknown (NOT a STATE_NOT_FOUND code — generic INTERNAL_ERROR)', async () => {
    const result = await snapshots_restore(ctx, 'snap-nope');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('restore_snapshot');
      expect(result.error.message).toContain('Snapshot not found');
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });

  it('preserves version + state from snapshot — round-trips state_json correctly', async () => {
    await resources_save(
      ctx,
      fixture({
        node_id: create_node_id('n1'),
        version: 7,
        state: { cloud_id: 'pinned-cloud', status: 'available', outputs: { url: 'https://saved.example' } },
      }),
    );
    const snap = await snapshots_create(ctx, 'graph-1');
    if (!snap.ok) throw new Error('seed failed');

    // Mutate after snapshot.
    await resources_save(
      ctx,
      fixture({
        node_id: create_node_id('n1'),
        version: 99,
        state: { cloud_id: 'mutated-cloud', status: 'updating', outputs: { url: 'https://mutated.example' } },
      }),
    );

    await snapshots_restore(ctx, snap.value.id);
    const got = await resources_get(ctx, 'graph-1', create_node_id('n1'));
    if (got.ok && got.value) {
      // Restore deletes ALL graph rows BEFORE the upsert loop, so the
      // ON CONFLICT path never fires — the INSERT lands fresh and the
      // version field is preserved exactly as snapshotted (7, not 8).
      // This is the documented restore semantics: full snapshot-state
      // replacement, not a state-merge.
      expect(got.value.version).toBe(7);
      expect(got.value.state.cloud_id).toBe('pinned-cloud');
      expect(got.value.state.outputs).toEqual({ url: 'https://saved.example' });
    }
  });
});

describe('snapshots_delete', () => {
  it('removes the snapshot and does NOT emit any event', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);
    const events: StateChangeEvent[] = [];
    ctx.listeners.add((e) => events.push(e));

    const snap = await snapshots_create(ctx, 'graph-1');
    if (!snap.ok) throw new Error('seed failed');
    events.length = 0;

    await snapshots_delete(ctx, snap.value.id);
    const got = await snapshots_get(ctx, snap.value.id);
    if (got.ok) expect(got.value).toBeNull();
    expect(events).toEqual([]);
  });

  it('is a no-op for unknown snapshot id', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);
    const result = await snapshots_delete(ctx, 'snap-nope');
    expect(result.ok).toBe(true);
  });
});

describe('error wrapping', () => {
  it('wraps a thrown error from list_snapshots when ctx.db is null', async () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const result = await snapshots_list(ctx, 'g1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('list_snapshots');
  });

  it('wraps a thrown error from snapshots_create when ctx.db is null', async () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const result = await snapshots_create(ctx, 'g1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('create_snapshot');
  });

  it('wraps a thrown error from snapshots_get when ctx.db is null', async () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const result = await snapshots_get(ctx, 'snap-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('get_snapshot');
  });

  it('wraps a thrown error from snapshots_delete when ctx.db is null', async () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const result = await snapshots_delete(ctx, 'snap-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('delete_snapshot');
  });
});

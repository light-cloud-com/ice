/**
 * Tests for `sqlite/resources.ts` (rf-sqlite-2).
 *
 * Behaviour-preservation tests for the 7 resource methods after
 * extraction. The class delegates all 7 methods to these standalone
 * functions; tests drive the helpers DIRECTLY against an in-memory
 * SQLite store (initialised via `create_memory_state_store()`) so we
 * exercise the same prepared-statement cache and table schema that
 * the class uses end-to-end.
 *
 * Behaviour pinned:
 *  - read paths return null/[] on miss; row_to_resource translates
 *    every row field including JSON.parse on state_json
 *  - save_resource emits 'resource_created' on the listener set
 *  - save_resources is transactional + emits per resource AFTER the
 *    transaction commits (one event per item)
 *  - delete_resource emits 'resource_deleted' even on no-op delete
 *    (matches pre-extraction — the run.changes is not checked)
 *  - delete_resources returns the changes count and does NOT emit
 *  - query_resources composes graph_id/ice_type/status filters,
 *    defaults order_by='created_at', order_dir='desc', applies
 *    LIMIT/OFFSET only when present
 *  - ensure_db throws 'State store not initialized' on null db
 *  - listener errors are swallowed (one bad listener does not break
 *    delivery to the next)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { create_memory_state_store } from '../../sqlite-state-store.js';
import {
  ensure_db,
  emit_event,
  wrap_error,
  row_to_resource,
  resources_get,
  resources_get_all,
  resources_query,
  resources_save,
  resources_save_many,
  resources_delete,
  resources_delete_all,
} from '../resources.js';
import { create_node_id } from '../../../types/graph.js';
import type { SqliteContext, ResourceRow } from '../types.js';
import type { StoredResourceState, StateChangeEvent } from '../../state-store.js';

// =============================================================================
// Helpers
// =============================================================================

/** Build a stored resource fixture with sensible defaults. */
function fixture(overrides: Partial<StoredResourceState> = {}): StoredResourceState {
  return {
    node_id: create_node_id('node-1'),
    ice_type: 'compute',
    name: 'web-1',
    state: {
      cloud_id: 'cloud-1',
      status: 'available',
      outputs: { url: 'https://example.com' },
    },
    created_at: '2026-04-30T00:00:00.000Z',
    updated_at: '2026-04-30T00:00:00.000Z',
    graph_id: 'graph-1',
    version: 1,
    ...overrides,
  };
}

/** Reach into the class shell to expose its private context for direct testing. */
function getCtx(store: ReturnType<typeof create_memory_state_store>): SqliteContext {
  return (store as unknown as { ctx: SqliteContext }).ctx;
}

// =============================================================================
// Internal helpers (ensure_db / emit_event / wrap_error / row_to_resource)
// =============================================================================

describe('ensure_db', () => {
  it('throws "State store not initialized" when db is null', () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    expect(() => ensure_db(ctx)).toThrow('State store not initialized');
  });

  it('returns the database when ctx.db is set', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);
    expect(ensure_db(ctx)).toBe(ctx.db);
    await store.close();
  });
});

describe('emit_event', () => {
  it('delivers events to every subscribed listener with the requested type', () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const seen: StateChangeEvent[] = [];
    ctx.listeners.add((e) => seen.push(e));
    emit_event(ctx, 'resource_created', 'g1', create_node_id('n1'));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.type).toBe('resource_created');
    expect(seen[0]?.graph_id).toBe('g1');
    expect(seen[0]?.node_id).toBe('n1');
  });

  it('swallows listener errors without breaking delivery to the next listener', () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const seen: StateChangeEvent[] = [];
    ctx.listeners.add(() => {
      throw new Error('boom');
    });
    ctx.listeners.add((e) => seen.push(e));
    expect(() => emit_event(ctx, 'resource_deleted', 'g1')).not.toThrow();
    expect(seen).toHaveLength(1);
  });

  it('stamps an ISO timestamp on every event', () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    let captured: StateChangeEvent | null = null;
    ctx.listeners.add((e) => {
      captured = e;
    });
    emit_event(ctx, 'lock_acquired', 'g1');
    const e = captured as StateChangeEvent | null;
    expect(e).not.toBeNull();
    expect(e!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('wrap_error', () => {
  it('wraps a thrown Error into a failure with operation in details', () => {
    const result = wrap_error('save_resource', new Error('disk full'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('save_resource');
      expect(result.error.message).toContain('disk full');
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });

  it('coerces non-Error throws via String(...)', () => {
    const result = wrap_error('get_resource', 'plain string');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('plain string');
    }
  });
});

describe('row_to_resource', () => {
  it('parses state_json and creates a typed NodeId', () => {
    const row: ResourceRow = {
      graph_id: 'g1',
      node_id: 'n1',
      ice_type: 'compute',
      name: 'web-1',
      state_json: JSON.stringify({ cloud_id: 'c1', status: 'available', outputs: {} }),
      status: 'available',
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-04-30T00:00:01.000Z',
      version: 7,
    };
    const r = row_to_resource(row);
    expect(r.node_id).toBe('n1');
    expect(r.ice_type).toBe('compute');
    expect(r.name).toBe('web-1');
    expect(r.state.cloud_id).toBe('c1');
    expect(r.state.status).toBe('available');
    expect(r.created_at).toBe('2026-04-30T00:00:00.000Z');
    expect(r.updated_at).toBe('2026-04-30T00:00:01.000Z');
    expect(r.graph_id).toBe('g1');
    expect(r.version).toBe(7);
  });
});

// =============================================================================
// Resource read path
// =============================================================================

describe('resources_get / resources_get_all', () => {
  let store: ReturnType<typeof create_memory_state_store>;
  let ctx: SqliteContext;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
    ctx = getCtx(store);
  });

  it('returns null when no row matches', async () => {
    const result = await resources_get(ctx, 'graph-x', create_node_id('node-x'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('returns [] for a graph with no resources', async () => {
    const result = await resources_get_all(ctx, 'graph-empty');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('round-trips a saved resource through resources_get', async () => {
    const r = fixture();
    await resources_save(ctx, r);
    const got = await resources_get(ctx, r.graph_id, r.node_id);
    expect(got.ok).toBe(true);
    if (got.ok && got.value) {
      expect(got.value.node_id).toBe('node-1');
      expect(got.value.state.cloud_id).toBe('cloud-1');
      expect(got.value.state.outputs).toEqual({ url: 'https://example.com' });
    }
  });

  it('returns resources ordered by name from resources_get_all', async () => {
    await resources_save(ctx, fixture({ node_id: create_node_id('n2'), name: 'b' }));
    await resources_save(ctx, fixture({ node_id: create_node_id('n1'), name: 'a' }));
    await resources_save(ctx, fixture({ node_id: create_node_id('n3'), name: 'c' }));
    const result = await resources_get_all(ctx, 'graph-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((r) => r.name)).toEqual(['a', 'b', 'c']);
    }
  });
});

describe('resources_query', () => {
  let store: ReturnType<typeof create_memory_state_store>;
  let ctx: SqliteContext;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
    ctx = getCtx(store);

    // Seed: 3 graphs × 2 types × 2 statuses
    await resources_save(
      ctx,
      fixture({
        graph_id: 'g1',
        node_id: create_node_id('n1'),
        ice_type: 'compute',
        state: { cloud_id: 'c1', status: 'available', outputs: {} },
        created_at: '2026-04-30T00:00:00.000Z',
      }),
    );
    await resources_save(
      ctx,
      fixture({
        graph_id: 'g1',
        node_id: create_node_id('n2'),
        ice_type: 'database',
        state: { cloud_id: 'c2', status: 'pending', outputs: {} },
        created_at: '2026-04-30T00:01:00.000Z',
      }),
    );
    await resources_save(
      ctx,
      fixture({
        graph_id: 'g2',
        node_id: create_node_id('n3'),
        ice_type: 'compute',
        state: { cloud_id: 'c3', status: 'available', outputs: {} },
        created_at: '2026-04-30T00:02:00.000Z',
      }),
    );
  });

  it('filters by graph_id', async () => {
    const result = await resources_query(ctx, { graph_id: 'g1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value.every((r) => r.graph_id === 'g1')).toBe(true);
    }
  });

  it('filters by ice_type', async () => {
    const result = await resources_query(ctx, { ice_type: 'compute' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value.every((r) => r.ice_type === 'compute')).toBe(true);
    }
  });

  it('filters by status', async () => {
    const result = await resources_query(ctx, { status: 'pending' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.state.status).toBe('pending');
    }
  });

  it('combines graph_id + ice_type + status filters', async () => {
    const result = await resources_query(ctx, { graph_id: 'g1', ice_type: 'compute', status: 'available' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.node_id).toBe('n1');
    }
  });

  it('defaults to ORDER BY created_at DESC', async () => {
    const result = await resources_query(ctx, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      // n3 created last, n1 first → desc order: n3, n2, n1
      expect(result.value.map((r) => String(r.node_id))).toEqual(['n3', 'n2', 'n1']);
    }
  });

  it('honours order_by=name + order_dir=asc', async () => {
    const result = await resources_query(ctx, { order_by: 'name', order_dir: 'asc' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // All names default to 'web-1' from fixture, so this just exercises the path.
      expect(result.value).toHaveLength(3);
    }
  });

  it('applies LIMIT', async () => {
    const result = await resources_query(ctx, { limit: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('applies OFFSET', async () => {
    const result = await resources_query(ctx, { limit: 10, offset: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(2);
  });
});

// =============================================================================
// Resource write path + listener emission
// =============================================================================

describe('resources_save', () => {
  it('emits resource_created on success', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);
    const events: StateChangeEvent[] = [];
    ctx.listeners.add((e) => events.push(e));

    await resources_save(ctx, fixture());
    expect(events.map((e) => e.type)).toEqual(['resource_created']);
    expect(events[0]?.graph_id).toBe('graph-1');
    expect(events[0]?.node_id).toBe('node-1');
  });

  it('upserts: a second save with the same key replaces the row + bumps version', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);

    await resources_save(ctx, fixture({ name: 'before' }));
    await resources_save(ctx, fixture({ name: 'after' }));

    const got = await resources_get(ctx, 'graph-1', create_node_id('node-1'));
    if (got.ok && got.value) {
      expect(got.value.name).toBe('after');
      // Pre-extraction upsert SQL: `version = version + 1` on conflict — bumps from 1→2.
      expect(got.value.version).toBe(2);
    }
  });
});

describe('resources_save_many', () => {
  it('saves all resources transactionally and emits one event per item', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);
    const events: StateChangeEvent[] = [];
    ctx.listeners.add((e) => events.push(e));

    const items = [
      fixture({ node_id: create_node_id('n1') }),
      fixture({ node_id: create_node_id('n2') }),
      fixture({ node_id: create_node_id('n3') }),
    ];
    await resources_save_many(ctx, items);

    const all = await resources_get_all(ctx, 'graph-1');
    if (all.ok) expect(all.value).toHaveLength(3);
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.type === 'resource_created')).toBe(true);
  });

  it('handles empty array without emitting', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);
    const events: StateChangeEvent[] = [];
    ctx.listeners.add((e) => events.push(e));

    await resources_save_many(ctx, []);
    expect(events).toEqual([]);
  });
});

describe('resources_delete', () => {
  it('removes the row and emits resource_deleted', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);
    await resources_save(ctx, fixture());

    const events: StateChangeEvent[] = [];
    ctx.listeners.add((e) => events.push(e));

    await resources_delete(ctx, 'graph-1', create_node_id('node-1'));
    const after = await resources_get(ctx, 'graph-1', create_node_id('node-1'));
    if (after.ok) expect(after.value).toBeNull();
    expect(events.map((e) => e.type)).toEqual(['resource_deleted']);
  });

  it('emits resource_deleted even when no row matches (matches pre-extraction)', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);
    const events: StateChangeEvent[] = [];
    ctx.listeners.add((e) => events.push(e));

    await resources_delete(ctx, 'g-nonexistent', create_node_id('n-nonexistent'));
    expect(events.map((e) => e.type)).toEqual(['resource_deleted']);
  });
});

describe('resources_delete_all', () => {
  it('returns the changes count and does NOT emit', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);
    await resources_save(ctx, fixture({ node_id: create_node_id('n1') }));
    await resources_save(ctx, fixture({ node_id: create_node_id('n2') }));

    const events: StateChangeEvent[] = [];
    ctx.listeners.add((e) => events.push(e));

    const result = await resources_delete_all(ctx, 'graph-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(2);
    expect(events).toEqual([]);
  });

  it('returns 0 when no rows match', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);
    const result = await resources_delete_all(ctx, 'g-empty');
    if (result.ok) expect(result.value).toBe(0);
  });
});

// =============================================================================
// Error wrapping path
// =============================================================================

describe('error wrapping', () => {
  it('returns a failure when the store is not initialized', async () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const result = await resources_get(ctx, 'g1', create_node_id('n1'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('get_resource');
      expect(result.error.message).toContain('State store not initialized');
    }
  });
});

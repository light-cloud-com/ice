/**
 * Tests for `sqlite/deployments.ts` (rf-sqlite-3).
 *
 * Behaviour pinned for the 5 deployment helpers:
 *  - read paths return null/[] on miss
 *  - get_deployments orders by started_at DESC (most recent first)
 *  - query composes graph_id + status filters and applies LIMIT/OFFSET
 *  - save_deployment emits 'deployment_started' (NOT 'deployment_completed'
 *    — the latter fires elsewhere; the row save is just persistence)
 *  - update_deployment_status sets completed_at ONLY for terminal states
 *    (succeeded / failed / cancelled); other statuses preserve the
 *    existing completed_at via COALESCE (matches pre-extraction L420)
 *  - update_deployment_status increments version unconditionally
 *  - update_deployment_status's counts/error_message are optional and
 *    COALESCE-preserved when absent (matches pre-extraction L426-429)
 *  - row_to_deployment maps null → undefined for completed_at /
 *    error_message and casts status string → DeploymentStatus
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { create_deployment_id } from '../../../types/deployment';
import { create_memory_state_store } from '../../sqlite-state-store';
import {
  deployments_get,
  deployments_get_all,
  deployments_query,
  deployments_save,
  deployments_update_status,
} from '../deployments';
import type { DeploymentRecord } from '../../state-store';
import type { SqliteContext } from '../types';

function getCtx(store: ReturnType<typeof create_memory_state_store>): SqliteContext {
  return (store as unknown as { ctx: SqliteContext }).ctx;
}

function deployment(overrides: Partial<DeploymentRecord> = {}): DeploymentRecord {
  return {
    id: create_deployment_id('dep-1'),
    graph_id: 'graph-1',
    status: 'running',
    started_at: '2026-04-30T00:00:00.000Z',
    resource_count: 5,
    success_count: 0,
    failure_count: 0,
    version: 1,
    ...overrides,
  };
}

describe('deployments_get / deployments_get_all', () => {
  let store: ReturnType<typeof create_memory_state_store>;
  let ctx: SqliteContext;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
    ctx = getCtx(store);
  });

  it('returns null when no deployment matches', async () => {
    const result = await deployments_get(ctx, create_deployment_id('nope'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('returns [] for a graph with no deployments', async () => {
    const result = await deployments_get_all(ctx, 'graph-empty');
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('round-trips a saved deployment', async () => {
    const d = deployment({
      completed_at: '2026-04-30T00:01:00.000Z',
      success_count: 4,
      failure_count: 1,
      error_message: 'partial',
    });
    await deployments_save(ctx, d);
    const got = await deployments_get(ctx, d.id);
    if (got.ok && got.value) {
      expect(got.value.id).toBe('dep-1');
      expect(got.value.status).toBe('running');
      expect(got.value.completed_at).toBe('2026-04-30T00:01:00.000Z');
      expect(got.value.success_count).toBe(4);
      expect(got.value.failure_count).toBe(1);
      expect(got.value.error_message).toBe('partial');
      expect(got.value.version).toBe(1);
    }
  });

  it('orders get_all by started_at DESC', async () => {
    await deployments_save(
      ctx,
      deployment({ id: create_deployment_id('d-old'), started_at: '2026-04-29T00:00:00.000Z' }),
    );
    await deployments_save(
      ctx,
      deployment({ id: create_deployment_id('d-new'), started_at: '2026-04-30T00:00:00.000Z' }),
    );
    await deployments_save(
      ctx,
      deployment({ id: create_deployment_id('d-mid'), started_at: '2026-04-29T12:00:00.000Z' }),
    );
    const result = await deployments_get_all(ctx, 'graph-1');
    if (result.ok) {
      expect(result.value.map((d) => String(d.id))).toEqual(['d-new', 'd-mid', 'd-old']);
    }
  });

  it('row_to_deployment maps null completed_at / error_message to undefined', async () => {
    const d = deployment(); // no completed_at, no error_message
    await deployments_save(ctx, d);
    const got = await deployments_get(ctx, d.id);
    if (got.ok && got.value) {
      expect(got.value.completed_at).toBeUndefined();
      expect(got.value.error_message).toBeUndefined();
    }
  });
});

describe('deployments_query', () => {
  let store: ReturnType<typeof create_memory_state_store>;
  let ctx: SqliteContext;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
    ctx = getCtx(store);

    await deployments_save(ctx, deployment({ id: create_deployment_id('d1'), graph_id: 'g1', status: 'running' }));
    await deployments_save(
      ctx,
      deployment({
        id: create_deployment_id('d2'),
        graph_id: 'g1',
        status: 'succeeded',
        started_at: '2026-04-30T00:01:00.000Z',
      }),
    );
    await deployments_save(
      ctx,
      deployment({
        id: create_deployment_id('d3'),
        graph_id: 'g2',
        status: 'failed',
        started_at: '2026-04-30T00:02:00.000Z',
      }),
    );
  });

  it('filters by graph_id', async () => {
    const result = await deployments_query(ctx, { graph_id: 'g1' });
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value.every((d) => d.graph_id === 'g1')).toBe(true);
    }
  });

  it('filters by status', async () => {
    const result = await deployments_query(ctx, { status: 'failed' });
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe('d3');
    }
  });

  it('combines graph_id + status', async () => {
    const result = await deployments_query(ctx, { graph_id: 'g1', status: 'succeeded' });
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe('d2');
    }
  });

  it('always orders by started_at DESC', async () => {
    const result = await deployments_query(ctx, {});
    if (result.ok) {
      expect(result.value.map((d) => String(d.id))).toEqual(['d3', 'd2', 'd1']);
    }
  });

  it('applies LIMIT', async () => {
    const result = await deployments_query(ctx, { limit: 2 });
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('applies OFFSET', async () => {
    const result = await deployments_query(ctx, { limit: 10, offset: 1 });
    if (result.ok) expect(result.value).toHaveLength(2);
  });
});

describe('deployments_save', () => {
  it('emits deployment_started with the deployment id', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);
    let captured: import('../../state-store').StateChangeEvent | null = null;
    ctx.listeners.add((e) => {
      captured = e;
    });

    const d = deployment();
    await deployments_save(ctx, d);
    const e = captured as import('../../state-store').StateChangeEvent | null;
    expect(e).not.toBeNull();
    expect(e!.type).toBe('deployment_started');
    expect(e!.deployment_id).toBe('dep-1');
    expect(e!.graph_id).toBe('graph-1');
  });

  it('upserts an existing deployment by id and bumps version', async () => {
    const store = create_memory_state_store();
    await store.initialize();
    const ctx = getCtx(store);

    await deployments_save(ctx, deployment({ status: 'running' }));
    await deployments_save(ctx, deployment({ status: 'succeeded' }));
    const got = await deployments_get(ctx, create_deployment_id('dep-1'));
    if (got.ok && got.value) {
      expect(got.value.status).toBe('succeeded');
      // ON CONFLICT bumps version: 1 → 2
      expect(got.value.version).toBe(2);
    }
  });
});

describe('deployments_update_status', () => {
  let store: ReturnType<typeof create_memory_state_store>;
  let ctx: SqliteContext;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
    ctx = getCtx(store);
    await deployments_save(ctx, deployment({ status: 'running' }));
  });

  it('sets completed_at on succeeded', async () => {
    await deployments_update_status(ctx, create_deployment_id('dep-1'), 'succeeded');
    const got = await deployments_get(ctx, create_deployment_id('dep-1'));
    if (got.ok && got.value) {
      expect(got.value.status).toBe('succeeded');
      expect(got.value.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // version: 1 → 2 (the unconditional `version = version + 1` clause)
      expect(got.value.version).toBe(2);
    }
  });

  it('sets completed_at on failed', async () => {
    await deployments_update_status(ctx, create_deployment_id('dep-1'), 'failed');
    const got = await deployments_get(ctx, create_deployment_id('dep-1'));
    if (got.ok && got.value) {
      expect(got.value.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('sets completed_at on cancelled', async () => {
    await deployments_update_status(ctx, create_deployment_id('dep-1'), 'cancelled');
    const got = await deployments_get(ctx, create_deployment_id('dep-1'));
    if (got.ok && got.value) {
      expect(got.value.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('preserves completed_at as null for non-terminal status (e.g. running)', async () => {
    // running → running transition — completed_at stays null because the
    // SQL passes `null` and COALESCE keeps the existing value (also null).
    await deployments_update_status(ctx, create_deployment_id('dep-1'), 'running');
    const got = await deployments_get(ctx, create_deployment_id('dep-1'));
    if (got.ok && got.value) {
      expect(got.value.completed_at).toBeUndefined();
    }
  });

  it('updates counts when provided', async () => {
    await deployments_update_status(ctx, create_deployment_id('dep-1'), 'running', {
      success: 3,
      failure: 1,
    });
    const got = await deployments_get(ctx, create_deployment_id('dep-1'));
    if (got.ok && got.value) {
      expect(got.value.success_count).toBe(3);
      expect(got.value.failure_count).toBe(1);
    }
  });

  it('preserves existing counts when omitted', async () => {
    // First write counts...
    await deployments_update_status(ctx, create_deployment_id('dep-1'), 'running', {
      success: 5,
      failure: 2,
    });
    // ...then update without counts. COALESCE keeps the existing values.
    await deployments_update_status(ctx, create_deployment_id('dep-1'), 'running');
    const got = await deployments_get(ctx, create_deployment_id('dep-1'));
    if (got.ok && got.value) {
      expect(got.value.success_count).toBe(5);
      expect(got.value.failure_count).toBe(2);
    }
  });

  it('updates only one of success/failure when only one is provided', async () => {
    await deployments_update_status(ctx, create_deployment_id('dep-1'), 'running', { success: 7 });
    const got = await deployments_get(ctx, create_deployment_id('dep-1'));
    if (got.ok && got.value) {
      expect(got.value.success_count).toBe(7);
      expect(got.value.failure_count).toBe(0); // initial value preserved
    }
  });

  it('writes error_message when provided', async () => {
    await deployments_update_status(ctx, create_deployment_id('dep-1'), 'failed', undefined, 'oops');
    const got = await deployments_get(ctx, create_deployment_id('dep-1'));
    if (got.ok && got.value) {
      expect(got.value.error_message).toBe('oops');
    }
  });
});

describe('error wrapping', () => {
  it('wraps a thrown error from update_deployment_status', async () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const result = await deployments_update_status(ctx, create_deployment_id('x'), 'running');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('update_deployment_status');
  });

  it('wraps a thrown error from deployments_get when ctx.db is null', async () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const result = await deployments_get(ctx, create_deployment_id('x'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('get_deployment');
  });

  it('wraps a thrown error from deployments_get_all when ctx.db is null', async () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const result = await deployments_get_all(ctx, 'g1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('get_deployments');
  });

  it('wraps a thrown error from deployments_query when ctx.db is null', async () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const result = await deployments_query(ctx, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('query_deployments');
  });

  it('wraps a thrown error from deployments_save when ctx.db is null', async () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const result = await deployments_save(ctx, deployment());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('save_deployment');
  });
});

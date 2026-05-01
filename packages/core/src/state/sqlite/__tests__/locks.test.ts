/**
 * Tests for `sqlite/locks.ts` (rf-sqlite-4).
 *
 * Behaviour pinned (preserved from pre-extraction):
 *  - acquire_lock cleans up expired locks BEFORE checking for an
 *    existing lock (so a stale-but-expired lock doesn't block acquire)
 *  - acquire_lock fails (not throws) when graph is held by an active
 *    owner; the failure message embeds the existing owner name
 *  - acquire_lock emits 'lock_acquired' on success, NOT on failure
 *  - refresh_lock returns STATE_NOT_FOUND failure for unknown lock id
 *    (NOT a generic INTERNAL_ERROR — the error code is load-bearing
 *    for callers that distinguish "lock expired" from "db crashed")
 *  - release_lock emits 'lock_released' only when the lock existed
 *    (matches pre-extraction L529 — the `if (lock)` guard)
 *  - is_locked returns false for expired locks (expires_at > now filter)
 *  - get_lock returns null for expired locks
 *
 * Time semantics: TTL is in seconds. Tests use TTL=60 so expiry is
 * not a concern within a test run; the expiry-eviction path is
 * exercised by directly inserting a row with a past expires_at.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { create_memory_state_store } from '../../sqlite-state-store.js';
import {
  locks_acquire,
  locks_refresh,
  locks_release,
  locks_is_locked,
  locks_get,
} from '../locks.js';
import { create_deployment_id } from '../../../types/deployment.js';
import type { SqliteContext } from '../types.js';
import type { StateChangeEvent } from '../../state-store.js';

function getCtx(store: ReturnType<typeof create_memory_state_store>): SqliteContext {
  return (store as unknown as { ctx: SqliteContext }).ctx;
}

describe('locks_acquire', () => {
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

  it('acquires a lock on an unlocked graph and emits lock_acquired', async () => {
    const result = await locks_acquire(ctx, 'g1', 'owner-1', 60);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.graph_id).toBe('g1');
      expect(result.value.owner).toBe('owner-1');
      expect(result.value.id).toMatch(/^lock_\d+_/);
      expect(result.value.acquired_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.value.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(events.map((e) => e.type)).toEqual(['lock_acquired']);
  });

  it('attaches deployment_id when provided', async () => {
    const dep_id = create_deployment_id('dep-1');
    const result = await locks_acquire(ctx, 'g1', 'owner-1', 60, dep_id);
    if (result.ok) {
      expect(result.value.deployment_id).toBe('dep-1');
    }
  });

  it('fails when graph is already locked by another owner; embeds existing owner in error', async () => {
    await locks_acquire(ctx, 'g1', 'owner-1', 60);
    const result = await locks_acquire(ctx, 'g1', 'owner-2', 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('acquire_lock');
      expect(result.error.message).toContain('owner-1');
      expect(result.error.message).toContain('g1');
    }
    // No second lock_acquired event on the failed acquire.
    expect(events.filter((e) => e.type === 'lock_acquired')).toHaveLength(1);
  });

  it('cleans up expired locks before checking — stale lock does not block acquire', async () => {
    const db = ctx.db!;
    // Insert a past-expired lock directly.
    db.prepare(
      `INSERT INTO locks (id, graph_id, owner, acquired_at, expires_at, deployment_id)
       VALUES ('lock-stale', 'g1', 'old-owner', '2020-01-01T00:00:00.000Z', '2020-01-01T00:01:00.000Z', NULL)`,
    ).run();

    const result = await locks_acquire(ctx, 'g1', 'new-owner', 60);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.owner).toBe('new-owner');
    }
  });

  it('different graphs lock independently', async () => {
    const r1 = await locks_acquire(ctx, 'g1', 'a', 60);
    const r2 = await locks_acquire(ctx, 'g2', 'b', 60);
    expect(r1.ok && r2.ok).toBe(true);
  });
});

describe('locks_refresh', () => {
  let store: ReturnType<typeof create_memory_state_store>;
  let ctx: SqliteContext;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
    ctx = getCtx(store);
  });

  it('returns STATE_NOT_FOUND for unknown lock id', async () => {
    const result = await locks_refresh(ctx, 'lock-nope', 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('STATE_NOT_FOUND');
      expect(result.error.message).toContain('lock-nope');
    }
  });

  it('extends expires_at and returns the refreshed lock', async () => {
    const acq = await locks_acquire(ctx, 'g1', 'a', 5);
    if (!acq.ok) throw new Error('seed failed');
    const original_expires = acq.value.expires_at;

    // Wait a tiny bit so the new expires_at differs from the original.
    await new Promise((r) => setTimeout(r, 5));

    const refreshed = await locks_refresh(ctx, acq.value.id, 600);
    expect(refreshed.ok).toBe(true);
    if (refreshed.ok) {
      expect(refreshed.value.id).toBe(acq.value.id);
      expect(refreshed.value.graph_id).toBe('g1');
      // Long TTL → newer expires_at.
      expect(refreshed.value.expires_at > original_expires).toBe(true);
    }
  });

  it('preserves owner / acquired_at / deployment_id on refresh', async () => {
    const dep_id = create_deployment_id('dep-1');
    const acq = await locks_acquire(ctx, 'g1', 'owner-1', 60, dep_id);
    if (!acq.ok) throw new Error('seed failed');
    const refreshed = await locks_refresh(ctx, acq.value.id, 60);
    if (refreshed.ok) {
      expect(refreshed.value.owner).toBe('owner-1');
      expect(refreshed.value.acquired_at).toBe(acq.value.acquired_at);
      expect(refreshed.value.deployment_id).toBe('dep-1');
    }
  });
});

describe('locks_release', () => {
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

  it('emits lock_released when the lock existed; lock is gone after', async () => {
    const acq = await locks_acquire(ctx, 'g1', 'a', 60);
    if (!acq.ok) throw new Error('seed failed');
    events.length = 0;

    const result = await locks_release(ctx, acq.value.id);
    expect(result.ok).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['lock_released']);
    expect(events[0]?.graph_id).toBe('g1');

    // After release, is_locked is false.
    const locked = await locks_is_locked(ctx, 'g1');
    if (locked.ok) expect(locked.value).toBe(false);
  });

  it('does NOT emit lock_released when releasing an unknown id (no-op succeeds)', async () => {
    const result = await locks_release(ctx, 'lock-nope');
    expect(result.ok).toBe(true);
    expect(events.filter((e) => e.type === 'lock_released')).toHaveLength(0);
  });
});

describe('locks_is_locked', () => {
  let store: ReturnType<typeof create_memory_state_store>;
  let ctx: SqliteContext;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
    ctx = getCtx(store);
  });

  it('returns false for an unlocked graph', async () => {
    const result = await locks_is_locked(ctx, 'g1');
    if (result.ok) expect(result.value).toBe(false);
  });

  it('returns true for an actively-locked graph', async () => {
    await locks_acquire(ctx, 'g1', 'a', 60);
    const result = await locks_is_locked(ctx, 'g1');
    if (result.ok) expect(result.value).toBe(true);
  });

  it('returns false for an expired lock (expires_at > now filter)', async () => {
    const db = ctx.db!;
    db.prepare(
      `INSERT INTO locks (id, graph_id, owner, acquired_at, expires_at, deployment_id)
       VALUES ('lock-old', 'g1', 'old-owner', '2020-01-01T00:00:00.000Z', '2020-01-01T00:01:00.000Z', NULL)`,
    ).run();

    const result = await locks_is_locked(ctx, 'g1');
    if (result.ok) expect(result.value).toBe(false);
  });
});

describe('locks_get', () => {
  let store: ReturnType<typeof create_memory_state_store>;
  let ctx: SqliteContext;

  beforeEach(async () => {
    store = create_memory_state_store();
    await store.initialize();
    ctx = getCtx(store);
  });

  it('returns null when graph is not locked', async () => {
    const result = await locks_get(ctx, 'g1');
    if (result.ok) expect(result.value).toBeNull();
  });

  it('returns the lock when graph is actively locked', async () => {
    const acq = await locks_acquire(ctx, 'g1', 'owner-1', 60);
    if (!acq.ok) throw new Error('seed failed');
    const result = await locks_get(ctx, 'g1');
    if (result.ok && result.value) {
      expect(result.value.id).toBe(acq.value.id);
      expect(result.value.owner).toBe('owner-1');
      expect(result.value.graph_id).toBe('g1');
    }
  });

  it('returns null for expired locks (expires_at > now filter)', async () => {
    const db = ctx.db!;
    db.prepare(
      `INSERT INTO locks (id, graph_id, owner, acquired_at, expires_at, deployment_id)
       VALUES ('lock-old', 'g1', 'old-owner', '2020-01-01T00:00:00.000Z', '2020-01-01T00:01:00.000Z', NULL)`,
    ).run();

    const result = await locks_get(ctx, 'g1');
    if (result.ok) expect(result.value).toBeNull();
  });

  it('row_to_lock maps null deployment_id to undefined', async () => {
    await locks_acquire(ctx, 'g1', 'a', 60); // no deployment_id
    const result = await locks_get(ctx, 'g1');
    if (result.ok && result.value) {
      expect(result.value.deployment_id).toBeUndefined();
    }
  });
});

describe('error wrapping', () => {
  it('wraps a thrown error from is_locked when ctx.db is null', async () => {
    const ctx: SqliteContext = { db: null, listeners: new Set(), statements: new Map() };
    const result = await locks_is_locked(ctx, 'g1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('is_locked');
  });
});

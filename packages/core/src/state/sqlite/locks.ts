/**
 * SQLite State Store — lock operations (rf-sqlite-4).
 *
 * Standalone helpers for the 5 lock methods originally on
 * `SqliteStateStore` (pre-extraction L445-574): `acquire_lock`,
 * `refresh_lock`, `release_lock`, `is_locked`, `get_lock`.
 *
 * Behaviour pinned (preserved from pre-extraction):
 *  - `acquire_lock` runs the cleanup + check + insert in a single
 *    transaction. The "lock taken" path THROWS inside the txn; the
 *    catch wraps it via `wrap_error('acquire_lock', ...)` and the
 *    error message embeds the existing owner. Don't switch this to
 *    a Result-typed early-return — the rollback semantics rely on
 *    the throw.
 *  - `acquire_lock` cleans up expired locks BEFORE checking for an
 *    existing lock (so a stale-but-expired lock doesn't block a
 *    legitimate acquire). `expires_at < now` is the eviction predicate.
 *  - `refresh_lock` uses `RETURNING *` to avoid a second SELECT and
 *    returns a STATE_NOT_FOUND failure (not INTERNAL_ERROR) when the
 *    lock id is unknown — pre-extraction L510 used the named code.
 *  - `release_lock` reads graph_id BEFORE delete so the
 *    `'lock_released'` event can be emitted with it; if the lock id
 *    is unknown, no event fires (matches pre-extraction L529).
 *  - `is_locked` filters with `expires_at > now` so expired locks are
 *    treated as not locked.
 *  - `get_lock` applies the same `expires_at > now` filter — never
 *    returns expired locks.
 */

import { ensure_db, emit_event, wrap_error } from './resources';
import { create_deployment_id } from '../../types/deployment';
import { InternalError } from '../../types/errors';
import { failure, success } from '../../types/result';
import type { DeploymentId } from '../../types/deployment';
import type { IceError } from '../../types/errors';
import type { Result } from '../../types/result';
import type { StateLock } from '../state-store';
import type { LockRow, SqliteContext } from './types';

// =============================================================================
// Row translation
// =============================================================================

function row_to_lock(row: LockRow): StateLock {
  return {
    id: row.id,
    graph_id: row.graph_id,
    owner: row.owner,
    acquired_at: row.acquired_at,
    expires_at: row.expires_at,
    deployment_id: row.deployment_id ? create_deployment_id(row.deployment_id) : undefined,
  };
}

// =============================================================================
// Lock Operations
// =============================================================================

export async function locks_acquire(
  ctx: SqliteContext,
  graph_id: string,
  owner: string,
  ttl_seconds: number,
  deployment_id?: DeploymentId,
): Promise<Result<StateLock, IceError>> {
  try {
    const db = ensure_db(ctx);

    const now = new Date();
    const expires_at = new Date(now.getTime() + ttl_seconds * 1000);
    const lock_id = `lock_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Try to acquire lock (only if no valid lock exists).
    const transaction = db.transaction(() => {
      // Clean up expired locks first.
      db.prepare('DELETE FROM locks WHERE expires_at < ?').run(now.toISOString());

      // Check for existing lock.
      const existing = db.prepare('SELECT * FROM locks WHERE graph_id = ?').get(graph_id) as LockRow | undefined;

      if (existing) {
        throw new Error(`Graph ${graph_id} is already locked by ${existing.owner}`);
      }

      // Insert new lock.
      db.prepare(
        `
          INSERT INTO locks (id, graph_id, owner, acquired_at, expires_at, deployment_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).run(lock_id, graph_id, owner, now.toISOString(), expires_at.toISOString(), deployment_id ?? null);

      return {
        id: lock_id,
        graph_id,
        owner,
        acquired_at: now.toISOString(),
        expires_at: expires_at.toISOString(),
        deployment_id,
      } as StateLock;
    });

    const lock = transaction();
    emit_event(ctx, 'lock_acquired', graph_id);
    return success(lock);
  } catch (error) {
    return wrap_error('acquire_lock', error);
  }
}

export async function locks_refresh(
  ctx: SqliteContext,
  lock_id: string,
  ttl_seconds: number,
): Promise<Result<StateLock, IceError>> {
  try {
    const db = ensure_db(ctx);

    const expires_at = new Date(Date.now() + ttl_seconds * 1000).toISOString();

    const result = db.prepare('UPDATE locks SET expires_at = ? WHERE id = ? RETURNING *').get(expires_at, lock_id) as
      | LockRow
      | undefined;

    if (!result) {
      return failure(new InternalError(`Lock not found: ${lock_id}`, 'STATE_NOT_FOUND'));
    }

    return success(row_to_lock(result));
  } catch (error) {
    return wrap_error('refresh_lock', error);
  }
}

export async function locks_release(ctx: SqliteContext, lock_id: string): Promise<Result<void, IceError>> {
  try {
    const db = ensure_db(ctx);

    const lock = db.prepare('SELECT graph_id FROM locks WHERE id = ?').get(lock_id) as { graph_id: string } | undefined;

    db.prepare('DELETE FROM locks WHERE id = ?').run(lock_id);

    if (lock) {
      emit_event(ctx, 'lock_released', lock.graph_id);
    }

    return success(undefined);
  } catch (error) {
    return wrap_error('release_lock', error);
  }
}

export async function locks_is_locked(ctx: SqliteContext, graph_id: string): Promise<Result<boolean, IceError>> {
  try {
    const db = ensure_db(ctx);

    const now = new Date().toISOString();
    const row = db.prepare('SELECT 1 FROM locks WHERE graph_id = ? AND expires_at > ?').get(graph_id, now);

    return success(row !== undefined);
  } catch (error) {
    return wrap_error('is_locked', error);
  }
}

export async function locks_get(ctx: SqliteContext, graph_id: string): Promise<Result<StateLock | null, IceError>> {
  try {
    const db = ensure_db(ctx);

    const now = new Date().toISOString();
    const row = db.prepare('SELECT * FROM locks WHERE graph_id = ? AND expires_at > ?').get(graph_id, now) as
      | LockRow
      | undefined;

    if (!row) {
      return success(null);
    }

    return success(row_to_lock(row));
  } catch (error) {
    return wrap_error('get_lock', error);
  }
}

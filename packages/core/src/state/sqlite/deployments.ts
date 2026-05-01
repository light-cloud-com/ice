/**
 * SQLite State Store — deployment operations (rf-sqlite-3).
 *
 * Standalone helpers for the 5 deployment methods originally on
 * `SqliteStateStore` (pre-extraction L319-444): `get_deployment`,
 * `get_deployments`, `query_deployments`, `save_deployment`,
 * `update_deployment_status`.
 *
 * Each helper takes `ctx: SqliteContext` first. Behaviour is unchanged:
 *  - `save_deployment` upserts via the `upsert_deployment` prepared
 *    statement and emits `'deployment_started'` (NOT
 *    `'deployment_completed'` — that event is reserved for the
 *    out-of-band lifecycle the queue.service drives, not the row save).
 *  - `update_deployment_status` builds `completed_at` only when status
 *    is one of `'succeeded' | 'failed' | 'cancelled'`; otherwise the
 *    UPDATE preserves the existing value via COALESCE.
 *
 * `row_to_deployment` is module-private — only this file consumes
 * `DeploymentRow`. (Resources expose `row_to_resource` because
 * snapshots also unmarshal `ResourceRow[]` from `resource_data`.)
 */

import { create_deployment_id } from '../../types/deployment.js';
import { success } from '../../types/result.js';
import { ensure_db, emit_event, wrap_error } from './resources.js';
import type { DeploymentId, DeploymentStatus } from '../../types/deployment.js';
import type { IceError } from '../../types/errors.js';
import type { Result } from '../../types/result.js';
import type { DeploymentRecord, DeploymentQuery } from '../state-store.js';
import type { DeploymentRow, SqliteContext } from './types.js';

// =============================================================================
// Row translation
// =============================================================================

function row_to_deployment(row: DeploymentRow): DeploymentRecord {
  return {
    id: create_deployment_id(row.id),
    graph_id: row.graph_id,
    status: row.status as DeploymentStatus,
    started_at: row.started_at,
    completed_at: row.completed_at ?? undefined,
    resource_count: row.resource_count,
    success_count: row.success_count,
    failure_count: row.failure_count,
    error_message: row.error_message ?? undefined,
    version: row.version,
  };
}

// =============================================================================
// Deployment Operations
// =============================================================================

export async function deployments_get(
  ctx: SqliteContext,
  id: DeploymentId,
): Promise<Result<DeploymentRecord | null, IceError>> {
  try {
    const db = ensure_db(ctx);

    const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id) as DeploymentRow | undefined;

    if (!row) {
      return success(null);
    }

    return success(row_to_deployment(row));
  } catch (error) {
    return wrap_error('get_deployment', error);
  }
}

export async function deployments_get_all(
  ctx: SqliteContext,
  graph_id: string,
): Promise<Result<DeploymentRecord[], IceError>> {
  try {
    const db = ensure_db(ctx);

    const rows = db
      .prepare('SELECT * FROM deployments WHERE graph_id = ? ORDER BY started_at DESC')
      .all(graph_id) as DeploymentRow[];

    return success(rows.map((row) => row_to_deployment(row)));
  } catch (error) {
    return wrap_error('get_deployments', error);
  }
}

export async function deployments_query(
  ctx: SqliteContext,
  query: DeploymentQuery,
): Promise<Result<DeploymentRecord[], IceError>> {
  try {
    const db = ensure_db(ctx);

    let sql = 'SELECT * FROM deployments WHERE 1=1';
    const params: unknown[] = [];

    if (query.graph_id) {
      sql += ' AND graph_id = ?';
      params.push(query.graph_id);
    }

    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    sql += ' ORDER BY started_at DESC';

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }

    const rows = db.prepare(sql).all(...params) as DeploymentRow[];
    return success(rows.map((row) => row_to_deployment(row)));
  } catch (error) {
    return wrap_error('query_deployments', error);
  }
}

export async function deployments_save(
  ctx: SqliteContext,
  deployment: DeploymentRecord,
): Promise<Result<void, IceError>> {
  try {
    ensure_db(ctx);

    const stmt = ctx.statements.get('upsert_deployment')!;
    stmt.run(
      deployment.id,
      deployment.graph_id,
      deployment.status,
      deployment.started_at,
      deployment.completed_at ?? null,
      deployment.resource_count,
      deployment.success_count,
      deployment.failure_count,
      deployment.error_message ?? null,
      deployment.version,
    );

    emit_event(ctx, 'deployment_started', deployment.graph_id, undefined, deployment.id);
    return success(undefined);
  } catch (error) {
    return wrap_error('save_deployment', error);
  }
}

export async function deployments_update_status(
  ctx: SqliteContext,
  id: DeploymentId,
  status: DeploymentStatus,
  counts?: { success?: number; failure?: number },
  error_message?: string,
): Promise<Result<void, IceError>> {
  try {
    const db = ensure_db(ctx);

    const now = new Date().toISOString();
    const completed_at = ['succeeded', 'failed', 'cancelled'].includes(status) ? now : null;

    db.prepare(
      `
        UPDATE deployments
        SET status = ?,
            completed_at = COALESCE(?, completed_at),
            success_count = COALESCE(?, success_count),
            failure_count = COALESCE(?, failure_count),
            error_message = COALESCE(?, error_message),
            version = version + 1
        WHERE id = ?
      `,
    ).run(status, completed_at, counts?.success ?? null, counts?.failure ?? null, error_message ?? null, id);

    return success(undefined);
  } catch (error) {
    return wrap_error('update_deployment_status', error);
  }
}

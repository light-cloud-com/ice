/**
 * SQLite State Store — resource operations (rf-sqlite-2).
 *
 * Standalone helpers for the 7 resource methods originally on
 * `SqliteStateStore` (pre-extraction L155-318): `get_resource`,
 * `get_resources`, `query_resources`, `save_resource`,
 * `save_resources`, `delete_resource`, `delete_resources`.
 *
 * Each helper takes `ctx: SqliteContext` as the first arg. Bodies
 * are mechanical: `this.db!` → `db`, `this.statements` → `ctx.statements`,
 * `this.emit_event(...)` → `emit_event(ctx, ...)` (defined locally;
 * the pre-extraction private method lives here unchanged because every
 * domain module emits to the same listener set on `ctx.listeners`).
 *
 * `ensure_db(ctx)` is the rf-port of `ensure_initialized()` — it now
 * returns the unwrapped Database so callers don't need a non-null
 * assertion at every prepare/run site. Same throw semantics ("State
 * store not initialized"), same trip-wire for callers that forgot to
 * `await initialize()`.
 *
 * The class shell (rf-sqlite-7) becomes a 1-line delegate per method:
 * `async get_resource(...args) { return resources_get(this.ctx, ...args); }`.
 */

import { InternalError } from '../../types/errors';
import { create_node_id } from '../../types/graph';
import { success, failure } from '../../types/result';
import type { DeploymentId } from '../../types/deployment';
import type { IceError } from '../../types/errors';
import type { NodeId } from '../../types/graph';
import type { ResourceState } from '../../types/providers';
import type { Result } from '../../types/result';
import type { StoredResourceState, ResourceQuery, StateChangeType, StateChangeEvent } from '../state-store';
import type { ResourceRow, SqliteContext } from './types';
import type { Database } from 'better-sqlite3';

// =============================================================================
// Shared internals (used by every domain helper module)
// =============================================================================

/**
 * Unwrap `ctx.db` or throw with the pre-extraction message.
 *
 * Pre-extraction: `private ensure_initialized(): void` threw
 * `'State store not initialized'`; callers then re-asserted
 * non-null with `this.db!`. This single helper combines both
 * steps — throws on null, returns the Database otherwise.
 */
export function ensure_db(ctx: SqliteContext): Database {
  if (!ctx.db) {
    throw new Error('State store not initialized');
  }
  return ctx.db;
}

/**
 * Emit a state change event to all subscribed listeners.
 *
 * Pre-extraction: `private emit_event(...)`. Listener errors are
 * swallowed (matches pre-extraction behaviour — a broken listener
 * must not break the store). Order of iteration matches `Set`
 * insertion order, which is the implicit contract some consumers
 * depend on (e.g. test-side ordering of resource_created events).
 */
export function emit_event(
  ctx: SqliteContext,
  type: StateChangeType,
  graph_id: string,
  node_id?: NodeId,
  deployment_id?: DeploymentId,
): void {
  const event: StateChangeEvent = {
    type,
    timestamp: new Date().toISOString(),
    graph_id,
    node_id,
    deployment_id,
  };

  for (const listener of ctx.listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors — match pre-extraction.
    }
  }
}

/**
 * Wrap a thrown unknown into the standard failure shape.
 *
 * Pre-extraction: `private wrap_error(operation, error)`. Used by
 * every catch-block in this module + every other domain module.
 * The operation name flows into the InternalError's details field
 * for downstream telemetry.
 */
export function wrap_error(operation: string, error: unknown): Result<never, IceError> {
  const err = error instanceof Error ? error : new Error(String(error));
  return failure(
    new InternalError(`State store ${operation} failed: ${err.message}`, 'INTERNAL_ERROR', { operation }, err),
  );
}

/**
 * Translate a sqlite row into the public StoredResourceState shape.
 *
 * Pre-extraction: `private row_to_resource(row)`. Snapshot helpers
 * also call this (snapshots embed full rows in `resource_data`),
 * so it must stay exported from this module rather than local.
 */
export function row_to_resource(row: ResourceRow): StoredResourceState {
  return {
    node_id: create_node_id(row.node_id),
    ice_type: row.ice_type,
    name: row.name,
    state: JSON.parse(row.state_json) as ResourceState,
    created_at: row.created_at,
    updated_at: row.updated_at,
    graph_id: row.graph_id,
    version: row.version,
  };
}

// =============================================================================
// Resource Operations
// =============================================================================

export async function resources_get(
  ctx: SqliteContext,
  graph_id: string,
  node_id: NodeId,
): Promise<Result<StoredResourceState | null, IceError>> {
  try {
    const db = ensure_db(ctx);

    const row = db.prepare('SELECT * FROM resources WHERE graph_id = ? AND node_id = ?').get(graph_id, node_id) as
      | ResourceRow
      | undefined;

    if (!row) {
      return success(null);
    }

    return success(row_to_resource(row));
  } catch (error) {
    return wrap_error('get_resource', error);
  }
}

export async function resources_get_all(
  ctx: SqliteContext,
  graph_id: string,
): Promise<Result<StoredResourceState[], IceError>> {
  try {
    const db = ensure_db(ctx);

    const rows = db.prepare('SELECT * FROM resources WHERE graph_id = ? ORDER BY name').all(graph_id) as ResourceRow[];

    return success(rows.map((row) => row_to_resource(row)));
  } catch (error) {
    return wrap_error('get_resources', error);
  }
}

export async function resources_query(
  ctx: SqliteContext,
  query: ResourceQuery,
): Promise<Result<StoredResourceState[], IceError>> {
  try {
    const db = ensure_db(ctx);

    let sql = 'SELECT * FROM resources WHERE 1=1';
    const params: unknown[] = [];

    if (query.graph_id) {
      sql += ' AND graph_id = ?';
      params.push(query.graph_id);
    }

    if (query.ice_type) {
      sql += ' AND ice_type = ?';
      params.push(query.ice_type);
    }

    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    const order_by = query.order_by ?? 'created_at';
    const order_dir = query.order_dir ?? 'desc';
    sql += ` ORDER BY ${order_by} ${order_dir}`;

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }

    const rows = db.prepare(sql).all(...params) as ResourceRow[];
    return success(rows.map((row) => row_to_resource(row)));
  } catch (error) {
    return wrap_error('query_resources', error);
  }
}

export async function resources_save(
  ctx: SqliteContext,
  resource: StoredResourceState,
): Promise<Result<void, IceError>> {
  try {
    ensure_db(ctx);

    const stmt = ctx.statements.get('upsert_resource')!;
    stmt.run(
      resource.graph_id,
      resource.node_id,
      resource.ice_type,
      resource.name,
      JSON.stringify(resource.state),
      resource.state.status,
      resource.created_at,
      new Date().toISOString(),
      resource.version,
    );

    emit_event(ctx, 'resource_created', resource.graph_id, resource.node_id);
    return success(undefined);
  } catch (error) {
    return wrap_error('save_resource', error);
  }
}

export async function resources_save_many(
  ctx: SqliteContext,
  resources: StoredResourceState[],
): Promise<Result<void, IceError>> {
  try {
    const db = ensure_db(ctx);

    const stmt = ctx.statements.get('upsert_resource')!;
    const now = new Date().toISOString();

    const transaction = db.transaction((items: StoredResourceState[]) => {
      for (const resource of items) {
        stmt.run(
          resource.graph_id,
          resource.node_id,
          resource.ice_type,
          resource.name,
          JSON.stringify(resource.state),
          resource.state.status,
          resource.created_at,
          now,
          resource.version,
        );
      }
    });

    transaction(resources);

    for (const resource of resources) {
      emit_event(ctx, 'resource_created', resource.graph_id, resource.node_id);
    }

    return success(undefined);
  } catch (error) {
    return wrap_error('save_resources', error);
  }
}

export async function resources_delete(
  ctx: SqliteContext,
  graph_id: string,
  node_id: NodeId,
): Promise<Result<void, IceError>> {
  try {
    const db = ensure_db(ctx);

    db.prepare('DELETE FROM resources WHERE graph_id = ? AND node_id = ?').run(graph_id, node_id);

    emit_event(ctx, 'resource_deleted', graph_id, node_id);
    return success(undefined);
  } catch (error) {
    return wrap_error('delete_resource', error);
  }
}

export async function resources_delete_all(ctx: SqliteContext, graph_id: string): Promise<Result<number, IceError>> {
  try {
    const db = ensure_db(ctx);

    const result = db.prepare('DELETE FROM resources WHERE graph_id = ?').run(graph_id);

    return success(result.changes);
  } catch (error) {
    return wrap_error('delete_resources', error);
  }
}

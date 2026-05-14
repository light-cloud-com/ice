/**
 * SQLite State Store — snapshot operations (rf-sqlite-5).
 *
 * Standalone helpers for the 5 snapshot methods originally on
 * `SqliteStateStore` (pre-extraction L575-693): `create_snapshot`,
 * `get_snapshot`, `list_snapshots`, `restore_snapshot`,
 * `delete_snapshot`.
 *
 * Behaviour pinned (preserved from pre-extraction):
 *  - `create_snapshot` runs the resource-fetch + snapshot-insert in a
 *    SINGLE transaction. The serialised payload (`resource_data`) is
 *    a JSON-stringified ResourceRow[] (raw row shape, not the
 *    StoredResourceState shape — `restore_snapshot` reads the row
 *    fields directly when re-upserting). Don't change to
 *    StoredResourceState[]: the round-trip would lose the version
 *    column and break `restore`.
 *  - `restore_snapshot` runs DELETE + restore-loop in a single
 *    transaction; the snapshot-not-found path THROWS inside the txn
 *    so the catch wraps it via `wrap_error`. Generic
 *    'INTERNAL_ERROR' (not STATE_NOT_FOUND) — distinct from
 *    refresh_lock's NOT_FOUND, matching pre-extraction.
 *  - `delete_snapshot` does NOT emit any state-change event (no
 *    `'snapshot_deleted'` enum exists). Pre-extraction matched.
 *  - `create_snapshot` emits `'snapshot_created'`; `restore_snapshot`
 *    emits `'snapshot_restored'` AFTER the txn commits.
 *
 * `row_to_resource` is imported from `./resources.js` — snapshots
 * unmarshal each ResourceRow stored in `resource_data` through it
 * to produce the public StateSnapshot.resources array.
 */

import { success } from '../../types/result';
import { ensure_db, emit_event, row_to_resource, wrap_error } from './resources';
import type { IceError } from '../../types/errors';
import type { Result } from '../../types/result';
import type { StateSnapshot } from '../state-store';
import type { ResourceRow, SnapshotRow, SqliteContext } from './types';

// =============================================================================
// Row translation
// =============================================================================

function row_to_snapshot(row: SnapshotRow): StateSnapshot {
  const resources = JSON.parse(row.resource_data) as ResourceRow[];
  return {
    id: row.id,
    graph_id: row.graph_id,
    created_at: row.created_at,
    description: row.description ?? undefined,
    resources: resources.map((r) => row_to_resource(r)),
  };
}

// =============================================================================
// Snapshot Operations
// =============================================================================

export async function snapshots_create(
  ctx: SqliteContext,
  graph_id: string,
  description?: string,
): Promise<Result<StateSnapshot, IceError>> {
  try {
    const db = ensure_db(ctx);

    const snapshot_id = `snap_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const created_at = new Date().toISOString();

    const transaction = db.transaction(() => {
      // Get all resources.
      const resources = db.prepare('SELECT * FROM resources WHERE graph_id = ?').all(graph_id) as ResourceRow[];

      // Insert snapshot.
      db.prepare(
        `
          INSERT INTO snapshots (id, graph_id, created_at, description, resource_data)
          VALUES (?, ?, ?, ?, ?)
        `,
      ).run(snapshot_id, graph_id, created_at, description ?? null, JSON.stringify(resources));

      return {
        id: snapshot_id,
        graph_id,
        created_at,
        description,
        resources: resources.map((r) => row_to_resource(r)),
      } as StateSnapshot;
    });

    const snapshot = transaction();
    emit_event(ctx, 'snapshot_created', graph_id);
    return success(snapshot);
  } catch (error) {
    return wrap_error('create_snapshot', error);
  }
}

export async function snapshots_get(
  ctx: SqliteContext,
  id: string,
): Promise<Result<StateSnapshot | null, IceError>> {
  try {
    const db = ensure_db(ctx);

    const row = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as SnapshotRow | undefined;

    if (!row) {
      return success(null);
    }

    return success(row_to_snapshot(row));
  } catch (error) {
    return wrap_error('get_snapshot', error);
  }
}

export async function snapshots_list(
  ctx: SqliteContext,
  graph_id: string,
): Promise<Result<StateSnapshot[], IceError>> {
  try {
    const db = ensure_db(ctx);

    const rows = db
      .prepare('SELECT * FROM snapshots WHERE graph_id = ? ORDER BY created_at DESC')
      .all(graph_id) as SnapshotRow[];

    return success(rows.map((row) => row_to_snapshot(row)));
  } catch (error) {
    return wrap_error('list_snapshots', error);
  }
}

export async function snapshots_restore(ctx: SqliteContext, id: string): Promise<Result<void, IceError>> {
  try {
    const db = ensure_db(ctx);

    const transaction = db.transaction(() => {
      const snapshot = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as SnapshotRow | undefined;

      if (!snapshot) {
        throw new Error(`Snapshot not found: ${id}`);
      }

      const resources = JSON.parse(snapshot.resource_data) as ResourceRow[];

      // Delete current resources.
      db.prepare('DELETE FROM resources WHERE graph_id = ?').run(snapshot.graph_id);

      // Restore resources from snapshot.
      const stmt = ctx.statements.get('upsert_resource')!;
      for (const resource of resources) {
        stmt.run(
          resource.graph_id,
          resource.node_id,
          resource.ice_type,
          resource.name,
          resource.state_json,
          resource.status,
          resource.created_at,
          resource.updated_at,
          resource.version,
        );
      }

      return snapshot.graph_id;
    });

    const graph_id = transaction();
    emit_event(ctx, 'snapshot_restored', graph_id);
    return success(undefined);
  } catch (error) {
    return wrap_error('restore_snapshot', error);
  }
}

export async function snapshots_delete(ctx: SqliteContext, id: string): Promise<Result<void, IceError>> {
  try {
    const db = ensure_db(ctx);

    db.prepare('DELETE FROM snapshots WHERE id = ?').run(id);
    return success(undefined);
  } catch (error) {
    return wrap_error('delete_snapshot', error);
  }
}

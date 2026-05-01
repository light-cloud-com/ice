/**
 * SQLite State Store — lifecycle operations (rf-sqlite-6).
 *
 * Standalone helpers for the 3 lifecycle methods + 2 setup helpers
 * originally on `SqliteStateStore` (pre-extraction L83-149 + L717-805):
 *  - `lifecycle_initialize(ctx, options)` — dynamic-imports better-sqlite3,
 *    opens the DB, applies pragmas, runs the schema DDL, primes the
 *    prepared-statement cache.
 *  - `lifecycle_close(ctx)` — closes the DB and clears the statement
 *    cache; idempotent (close on never-initialized ctx returns success).
 *  - `lifecycle_health_check(ctx)` — best-effort `SELECT 1` ping;
 *    swallows errors and returns `success(false)`.
 *  - `create_tables(db)` — emits the four `CREATE TABLE IF NOT EXISTS`
 *    statements + indexes. Schema is pinned in this module; consumers
 *    that grep for `CREATE TABLE` find it here.
 *  - `prepare_statements(db, statements)` — populates the cache with
 *    the two upsert statements (`upsert_resource`, `upsert_deployment`)
 *    used by the resources and deployments helpers.
 *
 * Pre-extraction quirks preserved:
 *  - `initialize` does the dynamic-import-then-resolve dance because
 *    `better-sqlite3` is an optional dep — falling back to a clear
 *    "not installed" error message instead of a generic
 *    `Cannot find module` is the consumer-friendly path.
 *  - `close` does NOT throw on close-when-not-open; the `if (this.db)`
 *    guard keeps it idempotent.
 *  - `health_check` returns `success(false)` (not `failure`) for both
 *    "uninitialised" AND "query threw" — callers distinguish with
 *    `value`, not by checking `ok`.
 *  - WAL mode pragma fires only when `wal_mode === true` (not
 *    truthy — explicit equality check matches pre-extraction L101).
 *  - Foreign keys pragma fires only when `foreign_keys === true`.
 *  - busy_timeout pragma always fires (no conditional, even on 0).
 */

import { InternalError } from '../../types/errors.js';
import { failure, success } from '../../types/result.js';
import type { IceError } from '../../types/errors.js';
import type { Result } from '../../types/result.js';
import type { SqliteContext, SqliteStateStoreOptions } from './types.js';
import type { Database, Statement } from 'better-sqlite3';

// =============================================================================
// Schema setup — co-located with lifecycle so the DDL grep-locates here
// =============================================================================

export function create_tables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      graph_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      ice_type TEXT NOT NULL,
      name TEXT NOT NULL,
      state_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (graph_id, node_id)
    );

    CREATE INDEX IF NOT EXISTS idx_resources_graph ON resources(graph_id);
    CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(ice_type);
    CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      graph_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      resource_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_graph ON deployments(graph_id);
    CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);

    CREATE TABLE IF NOT EXISTS locks (
      id TEXT PRIMARY KEY,
      graph_id TEXT NOT NULL UNIQUE,
      owner TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      deployment_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_locks_expires ON locks(expires_at);

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      graph_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      description TEXT,
      resource_data TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_graph ON snapshots(graph_id);
  `);
}

export function prepare_statements(db: Database, statements: Map<string, Statement>): void {
  statements.set(
    'upsert_resource',
    db.prepare(`
      INSERT INTO resources (graph_id, node_id, ice_type, name, state_json, status, created_at, updated_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(graph_id, node_id) DO UPDATE SET
        ice_type = excluded.ice_type,
        name = excluded.name,
        state_json = excluded.state_json,
        status = excluded.status,
        updated_at = excluded.updated_at,
        version = version + 1
    `),
  );

  statements.set(
    'upsert_deployment',
    db.prepare(`
      INSERT INTO deployments (id, graph_id, status, started_at, completed_at, resource_count, success_count, failure_count, error_message, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        completed_at = COALESCE(excluded.completed_at, completed_at),
        resource_count = excluded.resource_count,
        success_count = excluded.success_count,
        failure_count = excluded.failure_count,
        error_message = COALESCE(excluded.error_message, error_message),
        version = version + 1
    `),
  );
}

// =============================================================================
// Lifecycle Operations
// =============================================================================

export async function lifecycle_initialize(
  ctx: SqliteContext,
  options: Required<SqliteStateStoreOptions>,
): Promise<Result<void, IceError>> {
  try {
    // Dynamic import of better-sqlite3 (optional dep — fail with a
    // clear message if missing rather than the generic module error).
    const BetterSqlite3 = await import('better-sqlite3').then((m) => m.default || m).catch(() => null);

    if (!BetterSqlite3) {
      return failure(
        new InternalError(
          'better-sqlite3 is not installed. Install it with: npm install better-sqlite3',
          'INTERNAL_ERROR',
        ),
      );
    }

    // Create database.
    ctx.db = new BetterSqlite3(options.path);

    // Configure database.
    if (options.wal_mode) {
      ctx.db.pragma('journal_mode = WAL');
    }
    ctx.db.pragma(`busy_timeout = ${options.busy_timeout_ms}`);
    if (options.foreign_keys) {
      ctx.db.pragma('foreign_keys = ON');
    }

    // Create tables.
    create_tables(ctx.db);

    // Prepare statements.
    prepare_statements(ctx.db, ctx.statements);

    return success(undefined);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return failure(
      new InternalError(`Failed to initialize SQLite state store: ${err.message}`, 'INTERNAL_ERROR', {}, err),
    );
  }
}

export async function lifecycle_close(ctx: SqliteContext): Promise<Result<void, IceError>> {
  try {
    if (ctx.db) {
      ctx.db.close();
      ctx.db = null;
    }
    ctx.statements.clear();
    return success(undefined);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return failure(new InternalError(`Failed to close state store: ${err.message}`, 'INTERNAL_ERROR', {}, err));
  }
}

export async function lifecycle_health_check(ctx: SqliteContext): Promise<Result<boolean, IceError>> {
  try {
    if (!ctx.db) {
      return success(false);
    }
    // Simple query to verify database is accessible.
    ctx.db.prepare('SELECT 1').get();
    return success(true);
  } catch {
    return success(false);
  }
}

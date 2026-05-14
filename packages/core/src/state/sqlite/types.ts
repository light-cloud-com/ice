/**
 * SQLite State Store — shared types (rf-sqlite-1).
 *
 * Extracted from `sqlite-state-store.ts` (pre-extraction L31-60 + L884-928).
 * Contains the public option shape, the option defaults, and the four
 * row interfaces used by every domain helper module (resources,
 * deployments, locks, snapshots).
 *
 * The row shapes are 1:1 mappings of the `CREATE TABLE` statements
 * in `lifecycle.ts::create_tables`. Mutable from sqlite reads —
 * helpers must not store these directly; they are translated through
 * `row_to_*` helpers (co-located with each domain module) into the
 * public `Stored*` shapes that flow back to consumers.
 *
 * `SqliteContext` is the shared mutable handle passed as the first
 * argument to every domain helper, modelled on the rf-parse-1
 * `ParserState` pattern. The class shell (rf-sqlite-7) holds one
 * `SqliteContext` and threads it through; standalone helpers can be
 * tested directly without instantiating the class.
 */

import type { StateChangeListener } from '../state-store';
import type { Database, Statement } from 'better-sqlite3';

// =============================================================================
// SQLite State Store Configuration
// =============================================================================

/**
 * SQLite state store options.
 */
export interface SqliteStateStoreOptions {
  /** Path to the database file (use ':memory:' for in-memory) */
  readonly path: string;

  /** Whether to use WAL mode */
  readonly wal_mode?: boolean;

  /** Busy timeout in milliseconds */
  readonly busy_timeout_ms?: number;

  /** Whether to enable foreign keys */
  readonly foreign_keys?: boolean;
}

/**
 * Default options.
 */
export const DEFAULT_OPTIONS: Required<SqliteStateStoreOptions> = {
  path: '.ice/state.db',
  wal_mode: true,
  busy_timeout_ms: 5000,
  foreign_keys: true,
};

// =============================================================================
// Shared mutable handle for domain helpers
// =============================================================================

/**
 * Mutable context handed to every standalone helper.
 *
 * - `db` — the open `better-sqlite3` Database, or `null` before
 *   `initialize()` / after `close()`. Helpers call `ensure_db(ctx)`
 *   (in `lifecycle.ts`) to assert non-null and unwrap.
 * - `listeners` — the change-listener set; mutated in place by
 *   `on_change` / `off_change` and read by `emit_event`.
 * - `statements` — prepared statement cache; populated by
 *   `prepare_statements()` during `initialize()` and cleared on
 *   `close()`. Helpers fetch by name (`'upsert_resource'`,
 *   `'upsert_deployment'`).
 *
 * The shape mirrors the pre-extraction class fields one-for-one;
 * there is no semantic change, only a relocation from class
 * private members to a structurally-typed handle. The orchestrator
 * (rf-sqlite-7) keeps one of these on `this.ctx` and passes
 * `this.ctx` through to every domain function.
 */
export interface SqliteContext {
  db: Database | null;
  readonly listeners: Set<StateChangeListener>;
  readonly statements: Map<string, Statement>;
}

// =============================================================================
// Row Types — 1:1 with CREATE TABLE statements
// =============================================================================

export interface ResourceRow {
  graph_id: string;
  node_id: string;
  ice_type: string;
  name: string;
  state_json: string;
  status: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface DeploymentRow {
  id: string;
  graph_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  resource_count: number;
  success_count: number;
  failure_count: number;
  error_message: string | null;
  version: number;
}

export interface LockRow {
  id: string;
  graph_id: string;
  owner: string;
  acquired_at: string;
  expires_at: string;
  deployment_id: string | null;
}

export interface SnapshotRow {
  id: string;
  graph_id: string;
  created_at: string;
  description: string | null;
  resource_data: string;
}

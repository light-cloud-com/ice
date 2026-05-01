/**
 * SQLite State Store
 *
 * SQLite-based implementation of the state store.
 * Uses better-sqlite3 for synchronous, transactional operations.
 */

import { create_deployment_id } from '../types/deployment.js';
import { InternalError } from '../types/errors.js';
import { create_node_id } from '../types/graph.js';
import { success, failure } from '../types/result.js';
import {
  deployments_get,
  deployments_get_all,
  deployments_query,
  deployments_save,
  deployments_update_status,
} from './sqlite/deployments.js';
import {
  resources_get,
  resources_get_all,
  resources_query,
  resources_save,
  resources_save_many,
  resources_delete,
  resources_delete_all,
} from './sqlite/resources.js';
import { DEFAULT_OPTIONS, type SqliteContext } from './sqlite/types.js';
import type {
  StoredResourceState,
  DeploymentRecord,
  StateLock,
  StateSnapshot,
  ResourceQuery,
  DeploymentQuery,
  ObservableStateStore,
  StateChangeListener,
  StateChangeEvent,
  StateChangeType,
} from './state-store.js';
import type { DeploymentId, DeploymentStatus } from '../types/deployment.js';
import type { IceError } from '../types/errors.js';
import type { NodeId } from '../types/graph.js';
import type { ResourceState } from '../types/providers.js';
import type { Result } from '../types/result.js';
import type { SqliteStateStoreOptions } from './sqlite/types.js';
import type { Database, Statement } from 'better-sqlite3';

export type { SqliteStateStoreOptions };

// =============================================================================
// SQLite State Store Implementation
// =============================================================================

/**
 * SQLite-based state store.
 */
export class SqliteStateStore implements ObservableStateStore {
  private readonly ctx: SqliteContext = {
    db: null,
    listeners: new Set(),
    statements: new Map(),
  };
  private readonly options: Required<SqliteStateStoreOptions>;

  constructor(options: Partial<SqliteStateStoreOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // Backwards-compat private accessors — kept while rf-sqlite-3..6 still
  // touch class-private state. Removed in rf-sqlite-7.
  private get db(): Database | null {
    return this.ctx.db;
  }
  private set db(value: Database | null) {
    this.ctx.db = value;
  }
  private get listeners(): Set<StateChangeListener> {
    return this.ctx.listeners;
  }
  private get statements(): Map<string, Statement> {
    return this.ctx.statements;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(): Promise<Result<void, IceError>> {
    try {
      // Dynamic import of better-sqlite3
      const BetterSqlite3 = await import('better-sqlite3').then((m) => m.default || m).catch(() => null);

      if (!BetterSqlite3) {
        return failure(
          new InternalError(
            'better-sqlite3 is not installed. Install it with: npm install better-sqlite3',
            'INTERNAL_ERROR',
          ),
        );
      }

      // Create database
      this.db = new BetterSqlite3(this.options.path);

      // Configure database
      if (this.options.wal_mode) {
        this.db.pragma('journal_mode = WAL');
      }
      this.db.pragma(`busy_timeout = ${this.options.busy_timeout_ms}`);
      if (this.options.foreign_keys) {
        this.db.pragma('foreign_keys = ON');
      }

      // Create tables
      this.create_tables();

      // Prepare statements
      this.prepare_statements();

      return success(undefined);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return failure(
        new InternalError(`Failed to initialize SQLite state store: ${err.message}`, 'INTERNAL_ERROR', {}, err),
      );
    }
  }

  async close(): Promise<Result<void, IceError>> {
    try {
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      this.statements.clear();
      return success(undefined);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return failure(new InternalError(`Failed to close state store: ${err.message}`, 'INTERNAL_ERROR', {}, err));
    }
  }

  async health_check(): Promise<Result<boolean, IceError>> {
    try {
      if (!this.db) {
        return success(false);
      }
      // Simple query to verify database is accessible
      this.db.prepare('SELECT 1').get();
      return success(true);
    } catch {
      return success(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Resource State Operations
  // ---------------------------------------------------------------------------

  async get_resource(graph_id: string, node_id: NodeId): Promise<Result<StoredResourceState | null, IceError>> {
    return resources_get(this.ctx, graph_id, node_id);
  }

  async get_resources(graph_id: string): Promise<Result<StoredResourceState[], IceError>> {
    return resources_get_all(this.ctx, graph_id);
  }

  async query_resources(query: ResourceQuery): Promise<Result<StoredResourceState[], IceError>> {
    return resources_query(this.ctx, query);
  }

  async save_resource(resource: StoredResourceState): Promise<Result<void, IceError>> {
    return resources_save(this.ctx, resource);
  }

  async save_resources(resources: StoredResourceState[]): Promise<Result<void, IceError>> {
    return resources_save_many(this.ctx, resources);
  }

  async delete_resource(graph_id: string, node_id: NodeId): Promise<Result<void, IceError>> {
    return resources_delete(this.ctx, graph_id, node_id);
  }

  async delete_resources(graph_id: string): Promise<Result<number, IceError>> {
    return resources_delete_all(this.ctx, graph_id);
  }

  // ---------------------------------------------------------------------------
  // Deployment Operations
  // ---------------------------------------------------------------------------

  async get_deployment(id: DeploymentId): Promise<Result<DeploymentRecord | null, IceError>> {
    return deployments_get(this.ctx, id);
  }

  async get_deployments(graph_id: string): Promise<Result<DeploymentRecord[], IceError>> {
    return deployments_get_all(this.ctx, graph_id);
  }

  async query_deployments(query: DeploymentQuery): Promise<Result<DeploymentRecord[], IceError>> {
    return deployments_query(this.ctx, query);
  }

  async save_deployment(deployment: DeploymentRecord): Promise<Result<void, IceError>> {
    return deployments_save(this.ctx, deployment);
  }

  async update_deployment_status(
    id: DeploymentId,
    status: DeploymentStatus,
    counts?: { success?: number; failure?: number },
    error_message?: string,
  ): Promise<Result<void, IceError>> {
    return deployments_update_status(this.ctx, id, status, counts, error_message);
  }

  // ---------------------------------------------------------------------------
  // Locking Operations
  // ---------------------------------------------------------------------------

  async acquire_lock(
    graph_id: string,
    owner: string,
    ttl_seconds: number,
    deployment_id?: DeploymentId,
  ): Promise<Result<StateLock, IceError>> {
    try {
      this.ensure_initialized();

      const now = new Date();
      const expires_at = new Date(now.getTime() + ttl_seconds * 1000);
      const lock_id = `lock_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Try to acquire lock (only if no valid lock exists)
      const transaction = this.db!.transaction(() => {
        // Clean up expired locks
        this.db!.prepare('DELETE FROM locks WHERE expires_at < ?').run(now.toISOString());

        // Check for existing lock
        const existing = this.db!.prepare('SELECT * FROM locks WHERE graph_id = ?').get(graph_id) as
          | LockRow
          | undefined;

        if (existing) {
          throw new Error(`Graph ${graph_id} is already locked by ${existing.owner}`);
        }

        // Insert new lock
        this.db!.prepare(
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
      this.emit_event('lock_acquired', graph_id);
      return success(lock);
    } catch (error) {
      return this.wrap_error('acquire_lock', error);
    }
  }

  async refresh_lock(lock_id: string, ttl_seconds: number): Promise<Result<StateLock, IceError>> {
    try {
      this.ensure_initialized();

      const expires_at = new Date(Date.now() + ttl_seconds * 1000).toISOString();

      const result = this.db!.prepare('UPDATE locks SET expires_at = ? WHERE id = ? RETURNING *').get(
        expires_at,
        lock_id,
      ) as LockRow | undefined;

      if (!result) {
        return failure(new InternalError(`Lock not found: ${lock_id}`, 'STATE_NOT_FOUND'));
      }

      return success(this.row_to_lock(result));
    } catch (error) {
      return this.wrap_error('refresh_lock', error);
    }
  }

  async release_lock(lock_id: string): Promise<Result<void, IceError>> {
    try {
      this.ensure_initialized();

      const lock = this.db!.prepare('SELECT graph_id FROM locks WHERE id = ?').get(lock_id) as
        | { graph_id: string }
        | undefined;

      this.db!.prepare('DELETE FROM locks WHERE id = ?').run(lock_id);

      if (lock) {
        this.emit_event('lock_released', lock.graph_id);
      }

      return success(undefined);
    } catch (error) {
      return this.wrap_error('release_lock', error);
    }
  }

  async is_locked(graph_id: string): Promise<Result<boolean, IceError>> {
    try {
      this.ensure_initialized();

      const now = new Date().toISOString();
      const row = this.db!.prepare('SELECT 1 FROM locks WHERE graph_id = ? AND expires_at > ?').get(graph_id, now);

      return success(row !== undefined);
    } catch (error) {
      return this.wrap_error('is_locked', error);
    }
  }

  async get_lock(graph_id: string): Promise<Result<StateLock | null, IceError>> {
    try {
      this.ensure_initialized();

      const now = new Date().toISOString();
      const row = this.db!.prepare('SELECT * FROM locks WHERE graph_id = ? AND expires_at > ?').get(graph_id, now) as
        | LockRow
        | undefined;

      if (!row) {
        return success(null);
      }

      return success(this.row_to_lock(row));
    } catch (error) {
      return this.wrap_error('get_lock', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshot Operations
  // ---------------------------------------------------------------------------

  async create_snapshot(graph_id: string, description?: string): Promise<Result<StateSnapshot, IceError>> {
    try {
      this.ensure_initialized();

      const snapshot_id = `snap_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const created_at = new Date().toISOString();

      const transaction = this.db!.transaction(() => {
        // Get all resources
        const resources = this.db!.prepare('SELECT * FROM resources WHERE graph_id = ?').all(graph_id) as ResourceRow[];

        // Insert snapshot
        this.db!.prepare(
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
          resources: resources.map((r) => this.row_to_resource(r)),
        } as StateSnapshot;
      });

      const snapshot = transaction();
      this.emit_event('snapshot_created', graph_id);
      return success(snapshot);
    } catch (error) {
      return this.wrap_error('create_snapshot', error);
    }
  }

  async get_snapshot(id: string): Promise<Result<StateSnapshot | null, IceError>> {
    try {
      this.ensure_initialized();

      const row = this.db!.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as SnapshotRow | undefined;

      if (!row) {
        return success(null);
      }

      return success(this.row_to_snapshot(row));
    } catch (error) {
      return this.wrap_error('get_snapshot', error);
    }
  }

  async list_snapshots(graph_id: string): Promise<Result<StateSnapshot[], IceError>> {
    try {
      this.ensure_initialized();

      const rows = this.db!.prepare('SELECT * FROM snapshots WHERE graph_id = ? ORDER BY created_at DESC').all(
        graph_id,
      ) as SnapshotRow[];

      return success(rows.map((row) => this.row_to_snapshot(row)));
    } catch (error) {
      return this.wrap_error('list_snapshots', error);
    }
  }

  async restore_snapshot(id: string): Promise<Result<void, IceError>> {
    try {
      this.ensure_initialized();

      const transaction = this.db!.transaction(() => {
        const snapshot = this.db!.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as SnapshotRow | undefined;

        if (!snapshot) {
          throw new Error(`Snapshot not found: ${id}`);
        }

        const resources = JSON.parse(snapshot.resource_data) as ResourceRow[];

        // Delete current resources
        this.db!.prepare('DELETE FROM resources WHERE graph_id = ?').run(snapshot.graph_id);

        // Restore resources from snapshot
        const stmt = this.statements.get('upsert_resource')!;
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
      this.emit_event('snapshot_restored', graph_id);
      return success(undefined);
    } catch (error) {
      return this.wrap_error('restore_snapshot', error);
    }
  }

  async delete_snapshot(id: string): Promise<Result<void, IceError>> {
    try {
      this.ensure_initialized();

      this.db!.prepare('DELETE FROM snapshots WHERE id = ?').run(id);
      return success(undefined);
    } catch (error) {
      return this.wrap_error('delete_snapshot', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Event Handling
  // ---------------------------------------------------------------------------

  on_change(listener: StateChangeListener): void {
    this.listeners.add(listener);
  }

  off_change(listener: StateChangeListener): void {
    this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private ensure_initialized(): void {
    if (!this.db) {
      throw new Error('State store not initialized');
    }
  }

  private create_tables(): void {
    this.db!.exec(`
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

  private prepare_statements(): void {
    this.statements.set(
      'upsert_resource',
      this.db!.prepare(`
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

    this.statements.set(
      'upsert_deployment',
      this.db!.prepare(`
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

  private emit_event(type: StateChangeType, graph_id: string, node_id?: NodeId, deployment_id?: DeploymentId): void {
    const event: StateChangeEvent = {
      type,
      timestamp: new Date().toISOString(),
      graph_id,
      node_id,
      deployment_id,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private wrap_error(operation: string, error: unknown): Result<never, IceError> {
    const err = error instanceof Error ? error : new Error(String(error));
    return failure(
      new InternalError(`State store ${operation} failed: ${err.message}`, 'INTERNAL_ERROR', { operation }, err),
    );
  }

  private row_to_resource(row: ResourceRow): StoredResourceState {
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

  private row_to_deployment(row: DeploymentRow): DeploymentRecord {
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

  private row_to_lock(row: LockRow): StateLock {
    return {
      id: row.id,
      graph_id: row.graph_id,
      owner: row.owner,
      acquired_at: row.acquired_at,
      expires_at: row.expires_at,
      deployment_id: row.deployment_id ? create_deployment_id(row.deployment_id) : undefined,
    };
  }

  private row_to_snapshot(row: SnapshotRow): StateSnapshot {
    const resources = JSON.parse(row.resource_data) as ResourceRow[];
    return {
      id: row.id,
      graph_id: row.graph_id,
      created_at: row.created_at,
      description: row.description ?? undefined,
      resources: resources.map((r) => this.row_to_resource(r)),
    };
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface ResourceRow {
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

interface DeploymentRow {
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

interface LockRow {
  id: string;
  graph_id: string;
  owner: string;
  acquired_at: string;
  expires_at: string;
  deployment_id: string | null;
}

interface SnapshotRow {
  id: string;
  graph_id: string;
  created_at: string;
  description: string | null;
  resource_data: string;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a SQLite state store.
 */
export function create_sqlite_state_store(options?: Partial<SqliteStateStoreOptions>): SqliteStateStore {
  return new SqliteStateStore(options);
}

/**
 * Create an in-memory state store for testing.
 */
export function create_memory_state_store(): SqliteStateStore {
  return new SqliteStateStore({ path: ':memory:' });
}

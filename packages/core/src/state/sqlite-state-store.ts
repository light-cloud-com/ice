/**
 * SQLite State Store
 *
 * SQLite-based implementation of the state store.
 * Uses better-sqlite3 for synchronous, transactional operations.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { NodeId } from '../types/graph.js';
import type { ResourceState, ResourceStatus } from '../types/providers.js';
import type { DeploymentId, DeploymentStatus } from '../types/deployment.js';
import { create_deployment_id } from '../types/deployment.js';
import { create_node_id } from '../types/graph.js';
import type { Result } from '../types/result.js';
import type { IceError } from '../types/errors.js';
import { success, failure } from '../types/result.js';
import { InternalError } from '../types/errors.js';
import type {
  StateStore,
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
const DEFAULT_OPTIONS: Required<SqliteStateStoreOptions> = {
  path: '.ice/state.db',
  wal_mode: true,
  busy_timeout_ms: 5000,
  foreign_keys: true,
};

// =============================================================================
// SQLite State Store Implementation
// =============================================================================

/**
 * SQLite-based state store.
 */
export class SqliteStateStore implements ObservableStateStore {
  private db: Database | null = null;
  private readonly options: Required<SqliteStateStoreOptions>;
  private readonly listeners: Set<StateChangeListener> = new Set();
  private statements: Map<string, Statement> = new Map();

  constructor(options: Partial<SqliteStateStoreOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(): Promise<Result<void, IceError>> {
    try {
      // Dynamic import of better-sqlite3
      const BetterSqlite3 = await import('better-sqlite3')
        .then((m) => m.default || m)
        .catch(() => null);

      if (!BetterSqlite3) {
        return failure(
          new InternalError(
            'better-sqlite3 is not installed. Install it with: npm install better-sqlite3',
            'INTERNAL_ERROR'
          )
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
        new InternalError(
          `Failed to initialize SQLite state store: ${err.message}`,
          'INTERNAL_ERROR',
          {},
          err
        )
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
      return failure(
        new InternalError(`Failed to close state store: ${err.message}`, 'INTERNAL_ERROR', {}, err)
      );
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

  async get_resource(
    graph_id: string,
    node_id: NodeId
  ): Promise<Result<StoredResourceState | null, IceError>> {
    try {
      this.ensure_initialized();

      const row = this.db!.prepare(
        'SELECT * FROM resources WHERE graph_id = ? AND node_id = ?'
      ).get(graph_id, node_id) as ResourceRow | undefined;

      if (!row) {
        return success(null);
      }

      return success(this.row_to_resource(row));
    } catch (error) {
      return this.wrap_error('get_resource', error);
    }
  }

  async get_resources(graph_id: string): Promise<Result<StoredResourceState[], IceError>> {
    try {
      this.ensure_initialized();

      const rows = this.db!.prepare('SELECT * FROM resources WHERE graph_id = ? ORDER BY name').all(
        graph_id
      ) as ResourceRow[];

      return success(rows.map((row) => this.row_to_resource(row)));
    } catch (error) {
      return this.wrap_error('get_resources', error);
    }
  }

  async query_resources(query: ResourceQuery): Promise<Result<StoredResourceState[], IceError>> {
    try {
      this.ensure_initialized();

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

      const rows = this.db!.prepare(sql).all(...params) as ResourceRow[];
      return success(rows.map((row) => this.row_to_resource(row)));
    } catch (error) {
      return this.wrap_error('query_resources', error);
    }
  }

  async save_resource(resource: StoredResourceState): Promise<Result<void, IceError>> {
    try {
      this.ensure_initialized();

      const stmt = this.statements.get('upsert_resource')!;
      stmt.run(
        resource.graph_id,
        resource.node_id,
        resource.ice_type,
        resource.name,
        JSON.stringify(resource.state),
        resource.state.status,
        resource.created_at,
        new Date().toISOString(),
        resource.version
      );

      this.emit_event('resource_created', resource.graph_id, resource.node_id);
      return success(undefined);
    } catch (error) {
      return this.wrap_error('save_resource', error);
    }
  }

  async save_resources(resources: StoredResourceState[]): Promise<Result<void, IceError>> {
    try {
      this.ensure_initialized();

      const stmt = this.statements.get('upsert_resource')!;
      const now = new Date().toISOString();

      const transaction = this.db!.transaction((items: StoredResourceState[]) => {
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
            resource.version
          );
        }
      });

      transaction(resources);

      for (const resource of resources) {
        this.emit_event('resource_created', resource.graph_id, resource.node_id);
      }

      return success(undefined);
    } catch (error) {
      return this.wrap_error('save_resources', error);
    }
  }

  async delete_resource(graph_id: string, node_id: NodeId): Promise<Result<void, IceError>> {
    try {
      this.ensure_initialized();

      this.db!.prepare('DELETE FROM resources WHERE graph_id = ? AND node_id = ?').run(
        graph_id,
        node_id
      );

      this.emit_event('resource_deleted', graph_id, node_id);
      return success(undefined);
    } catch (error) {
      return this.wrap_error('delete_resource', error);
    }
  }

  async delete_resources(graph_id: string): Promise<Result<number, IceError>> {
    try {
      this.ensure_initialized();

      const result = this.db!.prepare('DELETE FROM resources WHERE graph_id = ?').run(graph_id);

      return success(result.changes);
    } catch (error) {
      return this.wrap_error('delete_resources', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Deployment Operations
  // ---------------------------------------------------------------------------

  async get_deployment(id: DeploymentId): Promise<Result<DeploymentRecord | null, IceError>> {
    try {
      this.ensure_initialized();

      const row = this.db!.prepare('SELECT * FROM deployments WHERE id = ?').get(id) as
        | DeploymentRow
        | undefined;

      if (!row) {
        return success(null);
      }

      return success(this.row_to_deployment(row));
    } catch (error) {
      return this.wrap_error('get_deployment', error);
    }
  }

  async get_deployments(graph_id: string): Promise<Result<DeploymentRecord[], IceError>> {
    try {
      this.ensure_initialized();

      const rows = this.db!.prepare(
        'SELECT * FROM deployments WHERE graph_id = ? ORDER BY started_at DESC'
      ).all(graph_id) as DeploymentRow[];

      return success(rows.map((row) => this.row_to_deployment(row)));
    } catch (error) {
      return this.wrap_error('get_deployments', error);
    }
  }

  async query_deployments(query: DeploymentQuery): Promise<Result<DeploymentRecord[], IceError>> {
    try {
      this.ensure_initialized();

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

      const rows = this.db!.prepare(sql).all(...params) as DeploymentRow[];
      return success(rows.map((row) => this.row_to_deployment(row)));
    } catch (error) {
      return this.wrap_error('query_deployments', error);
    }
  }

  async save_deployment(deployment: DeploymentRecord): Promise<Result<void, IceError>> {
    try {
      this.ensure_initialized();

      const stmt = this.statements.get('upsert_deployment')!;
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
        deployment.version
      );

      this.emit_event('deployment_started', deployment.graph_id, undefined, deployment.id);
      return success(undefined);
    } catch (error) {
      return this.wrap_error('save_deployment', error);
    }
  }

  async update_deployment_status(
    id: DeploymentId,
    status: DeploymentStatus,
    counts?: { success?: number; failure?: number },
    error_message?: string
  ): Promise<Result<void, IceError>> {
    try {
      this.ensure_initialized();

      const now = new Date().toISOString();
      const completed_at = ['succeeded', 'failed', 'cancelled'].includes(status) ? now : null;

      this.db!.prepare(
        `
          UPDATE deployments
          SET status = ?,
              completed_at = COALESCE(?, completed_at),
              success_count = COALESCE(?, success_count),
              failure_count = COALESCE(?, failure_count),
              error_message = COALESCE(?, error_message),
              version = version + 1
          WHERE id = ?
        `
      ).run(
        status,
        completed_at,
        counts?.success ?? null,
        counts?.failure ?? null,
        error_message ?? null,
        id
      );

      return success(undefined);
    } catch (error) {
      return this.wrap_error('update_deployment_status', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Locking Operations
  // ---------------------------------------------------------------------------

  async acquire_lock(
    graph_id: string,
    owner: string,
    ttl_seconds: number,
    deployment_id?: DeploymentId
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
        const existing = this.db!.prepare('SELECT * FROM locks WHERE graph_id = ?').get(
          graph_id
        ) as LockRow | undefined;

        if (existing) {
          throw new Error(`Graph ${graph_id} is already locked by ${existing.owner}`);
        }

        // Insert new lock
        this.db!.prepare(
          `
            INSERT INTO locks (id, graph_id, owner, acquired_at, expires_at, deployment_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `
        ).run(
          lock_id,
          graph_id,
          owner,
          now.toISOString(),
          expires_at.toISOString(),
          deployment_id ?? null
        );

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

      const result = this.db!.prepare(
        'UPDATE locks SET expires_at = ? WHERE id = ? RETURNING *'
      ).get(expires_at, lock_id) as LockRow | undefined;

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
      const row = this.db!.prepare('SELECT 1 FROM locks WHERE graph_id = ? AND expires_at > ?').get(
        graph_id,
        now
      );

      return success(row !== undefined);
    } catch (error) {
      return this.wrap_error('is_locked', error);
    }
  }

  async get_lock(graph_id: string): Promise<Result<StateLock | null, IceError>> {
    try {
      this.ensure_initialized();

      const now = new Date().toISOString();
      const row = this.db!.prepare('SELECT * FROM locks WHERE graph_id = ? AND expires_at > ?').get(
        graph_id,
        now
      ) as LockRow | undefined;

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

  async create_snapshot(
    graph_id: string,
    description?: string
  ): Promise<Result<StateSnapshot, IceError>> {
    try {
      this.ensure_initialized();

      const snapshot_id = `snap_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const created_at = new Date().toISOString();

      const transaction = this.db!.transaction(() => {
        // Get all resources
        const resources = this.db!.prepare('SELECT * FROM resources WHERE graph_id = ?').all(
          graph_id
        ) as ResourceRow[];

        // Insert snapshot
        this.db!.prepare(
          `
            INSERT INTO snapshots (id, graph_id, created_at, description, resource_data)
            VALUES (?, ?, ?, ?, ?)
          `
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

      const row = this.db!.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as
        | SnapshotRow
        | undefined;

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

      const rows = this.db!.prepare(
        'SELECT * FROM snapshots WHERE graph_id = ? ORDER BY created_at DESC'
      ).all(graph_id) as SnapshotRow[];

      return success(rows.map((row) => this.row_to_snapshot(row)));
    } catch (error) {
      return this.wrap_error('list_snapshots', error);
    }
  }

  async restore_snapshot(id: string): Promise<Result<void, IceError>> {
    try {
      this.ensure_initialized();

      const transaction = this.db!.transaction(() => {
        const snapshot = this.db!.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as
          | SnapshotRow
          | undefined;

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
            resource.version
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
      `)
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
      `)
    );
  }

  private emit_event(
    type: StateChangeType,
    graph_id: string,
    node_id?: NodeId,
    deployment_id?: DeploymentId
  ): void {
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
      new InternalError(
        `State store ${operation} failed: ${err.message}`,
        'INTERNAL_ERROR',
        { operation },
        err
      )
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
export function create_sqlite_state_store(
  options?: Partial<SqliteStateStoreOptions>
): SqliteStateStore {
  return new SqliteStateStore(options);
}

/**
 * Create an in-memory state store for testing.
 */
export function create_memory_state_store(): SqliteStateStore {
  return new SqliteStateStore({ path: ':memory:' });
}

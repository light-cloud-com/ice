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
import { lifecycle_close, lifecycle_health_check, lifecycle_initialize } from './sqlite/lifecycle.js';
import {
  locks_acquire,
  locks_refresh,
  locks_release,
  locks_is_locked,
  locks_get,
} from './sqlite/locks.js';
import {
  snapshots_create,
  snapshots_get,
  snapshots_list,
  snapshots_restore,
  snapshots_delete,
} from './sqlite/snapshots.js';
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
    return lifecycle_initialize(this.ctx, this.options);
  }

  async close(): Promise<Result<void, IceError>> {
    return lifecycle_close(this.ctx);
  }

  async health_check(): Promise<Result<boolean, IceError>> {
    return lifecycle_health_check(this.ctx);
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
    return locks_acquire(this.ctx, graph_id, owner, ttl_seconds, deployment_id);
  }

  async refresh_lock(lock_id: string, ttl_seconds: number): Promise<Result<StateLock, IceError>> {
    return locks_refresh(this.ctx, lock_id, ttl_seconds);
  }

  async release_lock(lock_id: string): Promise<Result<void, IceError>> {
    return locks_release(this.ctx, lock_id);
  }

  async is_locked(graph_id: string): Promise<Result<boolean, IceError>> {
    return locks_is_locked(this.ctx, graph_id);
  }

  async get_lock(graph_id: string): Promise<Result<StateLock | null, IceError>> {
    return locks_get(this.ctx, graph_id);
  }

  // ---------------------------------------------------------------------------
  // Snapshot Operations
  // ---------------------------------------------------------------------------

  async create_snapshot(graph_id: string, description?: string): Promise<Result<StateSnapshot, IceError>> {
    return snapshots_create(this.ctx, graph_id, description);
  }

  async get_snapshot(id: string): Promise<Result<StateSnapshot | null, IceError>> {
    return snapshots_get(this.ctx, id);
  }

  async list_snapshots(graph_id: string): Promise<Result<StateSnapshot[], IceError>> {
    return snapshots_list(this.ctx, graph_id);
  }

  async restore_snapshot(id: string): Promise<Result<void, IceError>> {
    return snapshots_restore(this.ctx, id);
  }

  async delete_snapshot(id: string): Promise<Result<void, IceError>> {
    return snapshots_delete(this.ctx, id);
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

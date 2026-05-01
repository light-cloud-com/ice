/**
 * SQLite State Store
 *
 * SQLite-based implementation of the state store. The class itself
 * is a thin orchestration shell — every method delegates to a
 * standalone helper in `./sqlite/<domain>.ts`. Field-level mutable
 * state lives on `this.ctx: SqliteContext`; the `options` object
 * is read-only post-construction and only consumed by
 * `lifecycle_initialize`.
 *
 * Decomposition map:
 *  - `./sqlite/types.ts` — shapes (rf-sqlite-1)
 *  - `./sqlite/resources.ts` — get/save/delete/query resources, plus
 *    the shared `ensure_db` / `emit_event` / `wrap_error` /
 *    `row_to_resource` helpers (rf-sqlite-2)
 *  - `./sqlite/deployments.ts` — deployment record CRUD + status
 *    update (rf-sqlite-3)
 *  - `./sqlite/locks.ts` — graph lock acquire/refresh/release (rf-sqlite-4)
 *  - `./sqlite/snapshots.ts` — snapshot create/restore/delete (rf-sqlite-5)
 *  - `./sqlite/lifecycle.ts` — initialize/close/health_check + DDL +
 *    statement priming (rf-sqlite-6)
 *
 * Public API unchanged — `SqliteStateStore`,
 * `create_sqlite_state_store`, `create_memory_state_store`,
 * `SqliteStateStoreOptions` all keep their pre-extraction shape.
 */

import {
  deployments_get,
  deployments_get_all,
  deployments_query,
  deployments_save,
  deployments_update_status,
} from './sqlite/deployments.js';
import { lifecycle_close, lifecycle_health_check, lifecycle_initialize } from './sqlite/lifecycle.js';
import { locks_acquire, locks_get, locks_is_locked, locks_refresh, locks_release } from './sqlite/locks.js';
import {
  resources_delete,
  resources_delete_all,
  resources_get,
  resources_get_all,
  resources_query,
  resources_save,
  resources_save_many,
} from './sqlite/resources.js';
import {
  snapshots_create,
  snapshots_delete,
  snapshots_get,
  snapshots_list,
  snapshots_restore,
} from './sqlite/snapshots.js';
import { DEFAULT_OPTIONS, type SqliteContext, type SqliteStateStoreOptions } from './sqlite/types.js';
import type { DeploymentId, DeploymentStatus } from '../types/deployment.js';
import type { IceError } from '../types/errors.js';
import type { NodeId } from '../types/graph.js';
import type { Result } from '../types/result.js';
import type {
  DeploymentQuery,
  DeploymentRecord,
  ObservableStateStore,
  ResourceQuery,
  StateChangeListener,
  StateLock,
  StateSnapshot,
  StoredResourceState,
} from './state-store.js';

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
    this.ctx.listeners.add(listener);
  }

  off_change(listener: StateChangeListener): void {
    this.ctx.listeners.delete(listener);
  }
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

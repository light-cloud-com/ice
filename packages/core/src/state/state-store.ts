/**
 * State Store Interface
 *
 * Defines the interface for storing and retrieving ICE state.
 * State includes resource states, deployment history, and locks.
 */

import type { NodeId } from '../types/graph.js';
import type { ResourceState, ResourceStatus } from '../types/providers.js';
import type { DeploymentId, DeploymentStatus } from '../types/deployment.js';
import type { Result } from '../types/result.js';
import type { IceError } from '../types/errors.js';

// =============================================================================
// State Types
// =============================================================================

/**
 * Stored resource state with metadata.
 */
export interface StoredResourceState {
  /** Node ID */
  readonly node_id: NodeId;

  /** ICE resource type */
  readonly ice_type: string;

  /** Resource name */
  readonly name: string;

  /** Cloud resource state */
  readonly state: ResourceState;

  /** When this state was first created */
  readonly created_at: string;

  /** When this state was last updated */
  readonly updated_at: string;

  /** Graph ID this resource belongs to */
  readonly graph_id: string;

  /** Version number for optimistic concurrency */
  readonly version: number;
}

/**
 * Deployment record.
 */
export interface DeploymentRecord {
  /** Deployment ID */
  readonly id: DeploymentId;

  /** Graph ID being deployed */
  readonly graph_id: string;

  /** Deployment status */
  readonly status: DeploymentStatus;

  /** When deployment started */
  readonly started_at: string;

  /** When deployment completed */
  readonly completed_at?: string;

  /** Number of resources affected */
  readonly resource_count: number;

  /** Number of successful operations */
  readonly success_count: number;

  /** Number of failed operations */
  readonly failure_count: number;

  /** Error message if failed */
  readonly error_message?: string;

  /** Version number */
  readonly version: number;
}

/**
 * State lock for preventing concurrent modifications.
 */
export interface StateLock {
  /** Lock ID */
  readonly id: string;

  /** Graph ID being locked */
  readonly graph_id: string;

  /** Who holds the lock */
  readonly owner: string;

  /** When the lock was acquired */
  readonly acquired_at: string;

  /** When the lock expires */
  readonly expires_at: string;

  /** Optional deployment ID */
  readonly deployment_id?: DeploymentId;
}

/**
 * State snapshot for backup/restore.
 */
export interface StateSnapshot {
  /** Snapshot ID */
  readonly id: string;

  /** Graph ID */
  readonly graph_id: string;

  /** When the snapshot was created */
  readonly created_at: string;

  /** All resource states */
  readonly resources: StoredResourceState[];

  /** Snapshot description */
  readonly description?: string;
}

// =============================================================================
// Query Types
// =============================================================================

/**
 * Query parameters for listing resources.
 */
export interface ResourceQuery {
  /** Filter by graph ID */
  readonly graph_id?: string;

  /** Filter by ICE type */
  readonly ice_type?: string;

  /** Filter by status */
  readonly status?: ResourceStatus;

  /** Maximum results */
  readonly limit?: number;

  /** Offset for pagination */
  readonly offset?: number;

  /** Order by field */
  readonly order_by?: 'created_at' | 'updated_at' | 'name';

  /** Order direction */
  readonly order_dir?: 'asc' | 'desc';
}

/**
 * Query parameters for listing deployments.
 */
export interface DeploymentQuery {
  /** Filter by graph ID */
  readonly graph_id?: string;

  /** Filter by status */
  readonly status?: DeploymentStatus;

  /** Maximum results */
  readonly limit?: number;

  /** Offset for pagination */
  readonly offset?: number;
}

// =============================================================================
// State Store Interface
// =============================================================================

/**
 * Interface for state persistence.
 */
export interface StateStore {
  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialize the store.
   */
  initialize(): Promise<Result<void, IceError>>;

  /**
   * Close the store.
   */
  close(): Promise<Result<void, IceError>>;

  /**
   * Check if the store is healthy.
   */
  health_check(): Promise<Result<boolean, IceError>>;

  // ---------------------------------------------------------------------------
  // Resource State Operations
  // ---------------------------------------------------------------------------

  /**
   * Get a resource state by node ID.
   */
  get_resource(graph_id: string, node_id: NodeId): Promise<Result<StoredResourceState | null, IceError>>;

  /**
   * Get all resource states for a graph.
   */
  get_resources(graph_id: string): Promise<Result<StoredResourceState[], IceError>>;

  /**
   * Query resources with filters.
   */
  query_resources(query: ResourceQuery): Promise<Result<StoredResourceState[], IceError>>;

  /**
   * Save a resource state.
   */
  save_resource(resource: StoredResourceState): Promise<Result<void, IceError>>;

  /**
   * Save multiple resource states atomically.
   */
  save_resources(resources: StoredResourceState[]): Promise<Result<void, IceError>>;

  /**
   * Delete a resource state.
   */
  delete_resource(graph_id: string, node_id: NodeId): Promise<Result<void, IceError>>;

  /**
   * Delete all resources for a graph.
   */
  delete_resources(graph_id: string): Promise<Result<number, IceError>>;

  // ---------------------------------------------------------------------------
  // Deployment Operations
  // ---------------------------------------------------------------------------

  /**
   * Get a deployment record.
   */
  get_deployment(id: DeploymentId): Promise<Result<DeploymentRecord | null, IceError>>;

  /**
   * Get deployments for a graph.
   */
  get_deployments(graph_id: string): Promise<Result<DeploymentRecord[], IceError>>;

  /**
   * Query deployments with filters.
   */
  query_deployments(query: DeploymentQuery): Promise<Result<DeploymentRecord[], IceError>>;

  /**
   * Save a deployment record.
   */
  save_deployment(deployment: DeploymentRecord): Promise<Result<void, IceError>>;

  /**
   * Update deployment status.
   */
  update_deployment_status(
    id: DeploymentId,
    status: DeploymentStatus,
    counts?: { success?: number; failure?: number },
    error_message?: string,
  ): Promise<Result<void, IceError>>;

  // ---------------------------------------------------------------------------
  // Locking Operations
  // ---------------------------------------------------------------------------

  /**
   * Acquire a lock on a graph.
   */
  acquire_lock(
    graph_id: string,
    owner: string,
    ttl_seconds: number,
    deployment_id?: DeploymentId,
  ): Promise<Result<StateLock, IceError>>;

  /**
   * Refresh a lock to extend its TTL.
   */
  refresh_lock(lock_id: string, ttl_seconds: number): Promise<Result<StateLock, IceError>>;

  /**
   * Release a lock.
   */
  release_lock(lock_id: string): Promise<Result<void, IceError>>;

  /**
   * Check if a graph is locked.
   */
  is_locked(graph_id: string): Promise<Result<boolean, IceError>>;

  /**
   * Get the current lock on a graph.
   */
  get_lock(graph_id: string): Promise<Result<StateLock | null, IceError>>;

  // ---------------------------------------------------------------------------
  // Snapshot Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a state snapshot.
   */
  create_snapshot(graph_id: string, description?: string): Promise<Result<StateSnapshot, IceError>>;

  /**
   * Get a snapshot by ID.
   */
  get_snapshot(id: string): Promise<Result<StateSnapshot | null, IceError>>;

  /**
   * List snapshots for a graph.
   */
  list_snapshots(graph_id: string): Promise<Result<StateSnapshot[], IceError>>;

  /**
   * Restore state from a snapshot.
   */
  restore_snapshot(id: string): Promise<Result<void, IceError>>;

  /**
   * Delete a snapshot.
   */
  delete_snapshot(id: string): Promise<Result<void, IceError>>;
}

// =============================================================================
// State Change Events
// =============================================================================

/**
 * State change event types.
 */
export type StateChangeType =
  | 'resource_created'
  | 'resource_updated'
  | 'resource_deleted'
  | 'deployment_started'
  | 'deployment_completed'
  | 'lock_acquired'
  | 'lock_released'
  | 'snapshot_created'
  | 'snapshot_restored';

/**
 * State change event.
 */
export interface StateChangeEvent {
  readonly type: StateChangeType;
  readonly timestamp: string;
  readonly graph_id: string;
  readonly node_id?: NodeId;
  readonly deployment_id?: DeploymentId;
  readonly details?: Record<string, unknown>;
}

/**
 * State change listener.
 */
export type StateChangeListener = (event: StateChangeEvent) => void;

/**
 * Observable state store interface.
 */
export interface ObservableStateStore extends StateStore {
  /**
   * Subscribe to state changes.
   */
  on_change(listener: StateChangeListener): void;

  /**
   * Unsubscribe from state changes.
   */
  off_change(listener: StateChangeListener): void;
}

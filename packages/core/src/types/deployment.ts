/**
 * Deployment Type Definitions
 *
 * Types for deployment planning, execution, and state management.
 */

import type { NodeId } from './graph.js';
import type { ProviderName, ResourceState } from './providers.js';

// =============================================================================
// Deployment Plan
// =============================================================================

/**
 * Unique identifier for a deployment.
 */
export type DeploymentId = string & { readonly __brand: 'DeploymentId' };

/**
 * Create a typed DeploymentId.
 */
export function create_deployment_id(id: string): DeploymentId {
  return id as DeploymentId;
}

/**
 * Action to perform on a resource.
 */
export type DeploymentAction =
  | 'create' // Create a new resource
  | 'update' // Update existing resource
  | 'replace' // Delete and recreate
  | 'delete' // Delete resource
  | 'no_op'; // No changes needed

/**
 * Planned change for a single resource.
 */
export interface PlannedChange {
  /** Node being changed */
  readonly node_id: NodeId;

  /** Action to perform */
  readonly action: DeploymentAction;

  /** Current state (if exists) */
  readonly current_state?: ResourceState;

  /** Properties being changed */
  readonly changed_properties?: PropertyChange[];

  /** Reason for the change */
  readonly reason?: string;

  /** Dependencies that must complete first */
  readonly depends_on: NodeId[];

  /** Whether this change is destructive */
  readonly destructive: boolean;
}

/**
 * Individual property change.
 */
export interface PropertyChange {
  readonly path: string;
  readonly old_value: unknown;
  readonly new_value: unknown;
  readonly sensitive: boolean;
}

/**
 * Deployment plan containing all changes.
 */
export interface DeploymentPlan {
  /** Unique identifier */
  readonly id: DeploymentId;

  /** Graph being deployed */
  readonly graph_id: string;

  /** When the plan was created */
  readonly created_at: string;

  /** All planned changes in execution order */
  readonly changes: PlannedChange[];

  /** Summary statistics */
  readonly summary: PlanSummary;

  /** Provider requirements */
  readonly providers: ProviderRequirement[];
}

/**
 * Summary of a deployment plan.
 */
export interface PlanSummary {
  readonly total: number;
  readonly create: number;
  readonly update: number;
  readonly replace: number;
  readonly delete: number;
  readonly no_op: number;
  readonly destructive: number;
}

/**
 * Provider requirement for deployment.
 */
export interface ProviderRequirement {
  readonly provider: ProviderName;
  readonly region?: string;
  readonly resource_count: number;
}

// =============================================================================
// Deployment Execution
// =============================================================================

/**
 * Status of a deployment.
 */
export type DeploymentStatus =
  | 'pending' // Not started
  | 'running' // In progress
  | 'succeeded' // All changes applied
  | 'failed' // One or more changes failed
  | 'cancelled' // Cancelled by user
  | 'rolling_back'; // Rolling back changes

/**
 * Status of a single operation.
 */
export type OperationStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'rolled_back';

/**
 * Result of a single operation.
 */
export interface OperationResult {
  readonly node_id: NodeId;
  readonly action: DeploymentAction;
  readonly status: OperationStatus;
  readonly started_at: string;
  readonly completed_at?: string;
  readonly duration_ms?: number;
  readonly state?: ResourceState;
  readonly error?: OperationError;
}

/**
 * Operation error details.
 */
export interface OperationError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly provider_error?: unknown;
}

/**
 * Deployment execution result.
 */
export interface DeploymentExecution {
  /** Deployment ID */
  readonly id: DeploymentId;

  /** Plan that was executed */
  readonly plan_id: DeploymentId;

  /** Current status */
  readonly status: DeploymentStatus;

  /** When execution started */
  readonly started_at: string;

  /** When execution completed */
  readonly completed_at?: string;

  /** Total duration in milliseconds */
  readonly duration_ms?: number;

  /** Results of each operation */
  readonly operations: OperationResult[];

  /** Summary of execution */
  readonly summary: ExecutionSummary;
}

/**
 * Summary of deployment execution.
 */
export interface ExecutionSummary {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly skipped: number;
  readonly rolled_back: number;
}

// =============================================================================
// Deployment Options
// =============================================================================

/**
 * Options for creating a deployment plan.
 */
export interface PlanOptions {
  /** Target specific nodes */
  readonly targets?: NodeId[];

  /** Refresh state before planning */
  readonly refresh?: boolean;

  /** Create a destroy plan */
  readonly destroy?: boolean;

  /** Maximum parallel operations */
  readonly parallelism?: number;
}

/**
 * Options for executing a deployment.
 */
export interface ExecuteOptions {
  /** Auto-approve without confirmation */
  readonly auto_approve?: boolean;

  /** Maximum parallel operations */
  readonly parallelism?: number;

  /** Continue on error */
  readonly continue_on_error?: boolean;

  /** Rollback on failure */
  readonly rollback_on_failure?: boolean;

  /** Progress callback */
  readonly on_progress?: (event: ProgressEvent) => void;
}

/**
 * Progress event during deployment.
 */
export interface ProgressEvent {
  readonly type: 'start' | 'progress' | 'complete' | 'error';
  readonly node_id: NodeId;
  readonly action: DeploymentAction;
  readonly status: OperationStatus;
  readonly message?: string;
  readonly progress_percent?: number;
}

// =============================================================================
// State Management
// =============================================================================

/**
 * Deployment state tracking.
 */
export interface DeploymentState {
  /** Graph ID */
  readonly graph_id: string;

  /** Graph version */
  readonly version: string;

  /** Resource states */
  readonly resources: Map<NodeId, ResourceState>;

  /** When state was last updated */
  readonly updated_at: string;

  /** State format version */
  readonly format_version: number;
}

/**
 * State diff between two states.
 */
export interface StateDiff {
  /** Resources added */
  readonly added: NodeId[];

  /** Resources removed */
  readonly removed: NodeId[];

  /** Resources changed */
  readonly changed: NodeId[];

  /** Resources unchanged */
  readonly unchanged: NodeId[];
}

/**
 * Drift detection result.
 */
export interface DriftResult {
  /** Whether drift was detected */
  readonly has_drift: boolean;

  /** Resources that drifted */
  readonly drifted: DriftedResource[];

  /** When drift was checked */
  readonly checked_at: string;
}

/**
 * Drifted resource details.
 */
export interface DriftedResource {
  readonly node_id: NodeId;
  readonly expected_state: ResourceState;
  readonly actual_state: ResourceState;
  readonly drifted_properties: PropertyChange[];
}

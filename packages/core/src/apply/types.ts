/**
 * Apply Types
 *
 * Types for deployment apply operations.
 */

import type { NodeId } from '../types/graph.js';
import type { DeploymentId, DeploymentPlan, PlannedChange } from '../types/deployment.js';
import type { DeploymentError, ResourceState } from '../types/providers.js';

// =============================================================================
// Apply Options
// =============================================================================

/**
 * Options for apply operation.
 */
export interface ApplyOptions {
  /** Plan to apply (either plan or graph required) */
  plan?: DeploymentPlan;

  /** Path to plan file (alternative to plan object) */
  plan_file?: string;

  /** Path to graph file (will generate plan) */
  graph_file?: string;

  /** Path to state database */
  state_path?: string;

  /** Skip confirmation prompt */
  auto_approve?: boolean;

  /** Maximum parallel operations per layer (default: 10) */
  parallelism?: number;

  /** Target specific nodes only */
  targets?: NodeId[];

  /** Simulate execution without making changes */
  dry_run?: boolean;

  /** Abort on first error (default: false = continue) */
  abort_on_error?: boolean;

  /** Use mock provider for testing */
  mock?: boolean;

  /** Callback for progress updates */
  on_progress?: ApplyProgressCallback;
}

// =============================================================================
// Apply Results
// =============================================================================

/**
 * Result of a complete apply operation.
 */
export interface ApplyResult {
  /** Overall success status */
  success: boolean;

  /** Deployment ID for tracking */
  deployment_id: DeploymentId;

  /** Summary counts */
  summary: ApplySummary;

  /** Individual resource results */
  results: ResourceApplyResult[];

  /** Errors encountered */
  errors: ApplyError[];

  /** Total duration in milliseconds */
  duration_ms: number;
}

/**
 * Summary of apply operation.
 */
export interface ApplySummary {
  total: number;
  created: number;
  updated: number;
  replaced: number;
  deleted: number;
  skipped: number;
  failed: number;
}

/**
 * Result of applying a single resource change.
 */
export interface ResourceApplyResult {
  node_id: NodeId;
  action: string;
  success: boolean;
  state?: ResourceState;
  error?: DeploymentError;
  duration_ms: number;
  dry_run?: boolean;
}

/**
 * Error during apply operation.
 */
export interface ApplyError {
  node_id: NodeId;
  action: string;
  error: DeploymentError;
  recoverable: boolean;
}

// =============================================================================
// Progress Tracking
// =============================================================================

/**
 * Progress event types.
 */
export type ApplyProgressEvent =
  | ApplyStartedEvent
  | LayerStartedEvent
  | ResourceStartedEvent
  | ResourceCompletedEvent
  | LayerCompletedEvent
  | ApplyCompletedEvent;

export interface ApplyStartedEvent {
  type: 'apply_started';
  deployment_id: DeploymentId;
  total_changes: number;
  total_layers: number;
}

export interface LayerStartedEvent {
  type: 'layer_started';
  layer_index: number;
  total_layers: number;
  changes_in_layer: number;
}

export interface ResourceStartedEvent {
  type: 'resource_started';
  node_id: NodeId;
  action: string;
  layer_index: number;
}

export interface ResourceCompletedEvent {
  type: 'resource_completed';
  node_id: NodeId;
  action: string;
  success: boolean;
  duration_ms: number;
  error?: DeploymentError;
}

export interface LayerCompletedEvent {
  type: 'layer_completed';
  layer_index: number;
  success_count: number;
  failure_count: number;
}

export interface ApplyCompletedEvent {
  type: 'apply_completed';
  result: ApplyResult;
}

/**
 * Callback for progress updates.
 */
export type ApplyProgressCallback = (event: ApplyProgressEvent) => void;

// =============================================================================
// Execution Context
// =============================================================================

/**
 * Internal context for apply execution.
 */
export interface ApplyContext {
  deployment_id: DeploymentId;
  plan: DeploymentPlan;
  options: Required<Omit<ApplyOptions, 'plan' | 'plan_file' | 'graph_file' | 'on_progress'>> & {
    on_progress?: ApplyProgressCallback;
  };
  results: ResourceApplyResult[];
  errors: ApplyError[];
  start_time: number;
}

// =============================================================================
// Execution Layer
// =============================================================================

/**
 * A layer of changes that can execute in parallel.
 */
export interface ExecutionLayer {
  index: number;
  changes: PlannedChange[];
}

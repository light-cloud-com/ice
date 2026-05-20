/**
 * Apply Engine
 *
 * Core logic for executing deployment plans.
 */

import { get_plan_execution_layers } from '../plan/plan-engine';
import { create_mock_provider } from '../providers/mock-provider';
import { create_deployment_id } from '../types/deployment';
import type {
  ApplyOptions,
  ApplyResult,
  ApplySummary,
  ApplyContext,
  ResourceApplyResult,
  ExecutionLayer,
} from './types';
import type { MutableGraph } from '../graph/mutable-graph';
import type { DeploymentPlan, PlannedChange, DeploymentAction } from '../types/deployment';
import type { Node } from '../types/graph';
import type { ProviderClient, ResourceState } from '../types/providers';

// =============================================================================
// Apply Function
// =============================================================================

/**
 * Apply a deployment plan.
 */
export async function apply_plan(
  plan: DeploymentPlan,
  graph: MutableGraph,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const start_time = Date.now();

  // Create deployment ID
  const deployment_id = create_deployment_id(`deploy_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`);

  // Initialize context
  const context: ApplyContext = {
    deployment_id,
    plan,
    options: {
      state_path: options.state_path ?? '.ice/state.json',
      auto_approve: options.auto_approve ?? false,
      parallelism: options.parallelism ?? 10,
      targets: options.targets ?? [],
      dry_run: options.dry_run ?? false,
      abort_on_error: options.abort_on_error ?? false,
      mock: options.mock ?? true, // Default to mock mode
      provider: options.provider ?? 'mock',
      on_progress: options.on_progress,
      signal: options.signal,
    },
    results: [],
    errors: [],
    start_time,
    cancelled: false,
  };

  // Get provider (mock for now)
  const provider = get_provider(context);

  // Get execution layers from plan
  const layer_changes = get_plan_execution_layers(plan);
  const layers: ExecutionLayer[] = layer_changes.map((changes, index) => ({
    index,
    changes,
  }));

  // Emit start event
  emit_progress(context, {
    type: 'apply_started',
    deployment_id,
    total_changes: plan.changes.filter((c) => c.action !== 'no_op').length,
    total_layers: layers.length,
  });

  // Execute each layer
  // findings.md #23 — check the AbortSignal between layers. The
  // contract: in-flight provider operations within the current
  // batch are NOT interrupted (we await Promise.all to settle), but
  // no new layers or batches start once the signal is aborted.
  // Remaining unprocessed changes are recorded as CANCELLED so the
  // result reflects the partial-completion state honestly.
  for (let layer_index = 0; layer_index < layers.length; layer_index++) {
    if (context.options.signal?.aborted) {
      record_cancellation(context, layers.slice(layer_index));
      break;
    }
    const should_continue = await execute_layer(layers[layer_index]!, graph, provider, context);
    if (context.options.signal?.aborted) {
      // Aborted mid-layer — pending later layers stay unrecorded as
      // run, but `record_cancellation` covers them so the summary
      // and errors[] reflect the stop-point.
      record_cancellation(context, layers.slice(layer_index + 1));
      break;
    }
    if (!should_continue && context.options.abort_on_error) {
      break;
    }
  }

  // Build result
  const result = build_result(context);

  // Emit completion event
  emit_progress(context, {
    type: 'apply_completed',
    result,
  });

  return result;
}

// =============================================================================
// Layer Execution
// =============================================================================

/**
 * Execute a single layer of changes.
 * Returns true if execution should continue, false if it should stop.
 */
async function execute_layer(
  layer: ExecutionLayer,
  graph: MutableGraph,
  provider: ProviderClient,
  context: ApplyContext,
): Promise<boolean> {
  const { parallelism, abort_on_error } = context.options;

  // Filter out no_op changes
  const changes_to_apply = layer.changes.filter((c) => c.action !== 'no_op');

  if (changes_to_apply.length === 0) {
    return true;
  }

  // Emit layer start
  emit_progress(context, {
    type: 'layer_started',
    layer_index: layer.index,
    total_layers: get_plan_execution_layers(context.plan).length,
    changes_in_layer: changes_to_apply.length,
  });

  let success_count = 0;
  let failure_count = 0;

  // Execute changes in parallel batches
  for (let i = 0; i < changes_to_apply.length; i += parallelism) {
    // findings.md #23 — check the signal at each batch boundary so a
    // long-running layer (many parallelism-sized batches) can be
    // cancelled without waiting for the entire layer to drain.
    if (context.options.signal?.aborted) {
      record_cancelled_changes(context, changes_to_apply.slice(i));
      emit_progress(context, {
        type: 'layer_completed',
        layer_index: layer.index,
        success_count,
        failure_count: failure_count + (changes_to_apply.length - i),
      });
      return false;
    }

    const batch = changes_to_apply.slice(i, i + parallelism);

    const results = await Promise.all(batch.map((change) => execute_change(change, graph, provider, context)));

    for (const result of results) {
      context.results.push(result);

      if (result.success) {
        success_count++;
      } else {
        failure_count++;
        if (result.error) {
          context.errors.push({
            node_id: result.node_id,
            action: result.action,
            error: result.error,
            recoverable: result.error.retryable ?? false,
          });
        }

        if (abort_on_error) {
          emit_progress(context, {
            type: 'layer_completed',
            layer_index: layer.index,
            success_count,
            failure_count,
          });
          return false;
        }
      }
    }
  }

  // Emit layer completion
  emit_progress(context, {
    type: 'layer_completed',
    layer_index: layer.index,
    success_count,
    failure_count,
  });

  return true;
}

// =============================================================================
// Change Execution
// =============================================================================

/**
 * Execute a single resource change.
 */
async function execute_change(
  change: PlannedChange,
  graph: MutableGraph,
  provider: ProviderClient,
  context: ApplyContext,
): Promise<ResourceApplyResult> {
  const { dry_run } = context.options;
  const start = Date.now();

  // Emit resource start
  emit_progress(context, {
    type: 'resource_started',
    node_id: change.node_id,
    action: change.action,
    layer_index: 0, // Will be filled in by caller
  });

  // Get node from graph
  const node = graph.get_node(change.node_id);
  if (!node) {
    const error = {
      code: 'NODE_NOT_FOUND',
      message: `Node not found in graph: ${change.node_id}`,
      retryable: false,
    };

    emit_progress(context, {
      type: 'resource_completed',
      node_id: change.node_id,
      action: change.action,
      success: false,
      duration_ms: Date.now() - start,
      error,
    });

    return {
      node_id: change.node_id,
      action: change.action,
      success: false,
      error,
      duration_ms: Date.now() - start,
      dry_run,
    };
  }

  // Dry run mode - simulate success
  if (dry_run) {
    const result: ResourceApplyResult = {
      node_id: change.node_id,
      action: change.action,
      success: true,
      state: create_dry_run_state(node),
      duration_ms: Date.now() - start,
      dry_run: true,
    };

    emit_progress(context, {
      type: 'resource_completed',
      node_id: change.node_id,
      action: change.action,
      success: true,
      duration_ms: result.duration_ms,
    });

    return result;
  }

  // Execute actual change
  try {
    const result = await execute_provider_operation(change.action, node, change.current_state, provider);

    emit_progress(context, {
      type: 'resource_completed',
      node_id: change.node_id,
      action: change.action,
      success: result.success,
      duration_ms: Date.now() - start,
      error: result.error,
    });

    return {
      node_id: change.node_id,
      action: change.action,
      success: result.success,
      state: result.state,
      error: result.error,
      duration_ms: Date.now() - start,
      dry_run: false,
    };
  } catch (err) {
    const error = {
      code: 'APPLY_ERROR',
      message: err instanceof Error ? err.message : String(err),
      retryable: false,
    };

    emit_progress(context, {
      type: 'resource_completed',
      node_id: change.node_id,
      action: change.action,
      success: false,
      duration_ms: Date.now() - start,
      error,
    });

    return {
      node_id: change.node_id,
      action: change.action,
      success: false,
      error,
      duration_ms: Date.now() - start,
      dry_run: false,
    };
  }
}

/**
 * Execute a provider operation based on action type.
 */
async function execute_provider_operation(
  action: DeploymentAction,
  node: Node,
  current_state: ResourceState | undefined,
  provider: ProviderClient,
): Promise<{ success: boolean; state?: ResourceState; error?: any }> {
  switch (action) {
    case 'create':
      return provider.deploy(node);

    case 'update':
      if (!current_state) {
        return {
          success: false,
          error: {
            code: 'MISSING_STATE',
            message: 'Cannot update resource without current state',
            retryable: false,
          },
        };
      }
      return provider.update(node, current_state);

    case 'replace':
      // Replace = destroy + create
      // findings.md #25 — when current_state is missing the destroy
      // step used to be silently skipped. That diverges from the
      // scheduler's stricter destroy/create choreography and produces
      // orphaned cloud resources for any caller that didn't pass a
      // current_state alongside a 'replace' action. We can't destroy
      // what we don't know about, so emit a warning before falling
      // through to deploy-only — the log makes the "create-only on
      // replace" mode observable.
      if (current_state) {
        const destroy_result = await provider.destroy(node, current_state);
        if (!destroy_result.success) {
          return {
            success: false,
            error: destroy_result.error,
          };
        }
      } else {
        console.warn(
          `[apply-engine] replace action for node ${node.id} has no current_state; skipping destroy and proceeding as create-only. Existing cloud resources for this node may be orphaned.`,
        );
      }
      return provider.deploy(node);

    case 'delete': {
      if (!current_state) {
        return {
          success: false,
          error: {
            code: 'MISSING_STATE',
            message: 'Cannot delete resource without current state',
            retryable: false,
          },
        };
      }
      const destroy_result = await provider.destroy(node, current_state);
      return {
        success: destroy_result.success,
        error: destroy_result.error,
      };
    }

    case 'no_op':
      return { success: true, state: current_state };

    default:
      return {
        success: false,
        error: {
          code: 'UNKNOWN_ACTION',
          message: `Unknown action: ${action}`,
          retryable: false,
        },
      };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get provider client.
 * Uses real provider deployer when available, falls back to mock.
 */
function get_provider(context: ApplyContext): ProviderClient {
  const provider = context.options?.provider;
  if (provider && provider !== 'mock') {
    // Real providers are handled by deploy_graph() in deploy/deployer.ts
    // The apply engine uses ProviderClient interface for plan/apply semantics
    // For now, use mock for the apply pipeline — real deploys go through deploy_graph()
    console.log(`[apply-engine] Provider "${provider}" — using plan-only mode`);
  }
  return create_mock_provider(provider || 'mock');
}

/**
 * Create a dry-run state object.
 */
function create_dry_run_state(node: Node): ResourceState {
  const now = new Date().toISOString();
  return {
    cloud_id: `dry-run-${node.id}`,
    status: 'available',
    message: 'Dry run - no actual changes made',
    created_at: now,
    updated_at: now,
    outputs: node.properties as Record<string, unknown>,
    provider_metadata: {
      dry_run: true,
    },
  };
}

/**
 * Emit a progress event.
 */
function emit_progress(context: ApplyContext, event: any): void {
  if (context.options.on_progress) {
    context.options.on_progress(event);
  }
}

/**
 * Build the final result object.
 */
function build_result(context: ApplyContext): ApplyResult {
  const summary = build_summary(context.results);

  // findings.md #24 — derive overall success from the summary, not
  // from `errors.length`. A handler that returns `{ success: false }`
  // without pushing an error onto `context.errors` would otherwise
  // produce a result that says "1 failed" in the summary AND
  // `success: true` overall. Using `summary.failed === 0` makes the
  // two views of success consistent.
  return {
    success: summary.failed === 0 && context.errors.length === 0 && !context.cancelled,
    cancelled: context.cancelled || undefined,
    deployment_id: context.deployment_id,
    summary,
    results: context.results,
    errors: context.errors,
    duration_ms: Date.now() - context.start_time,
  };
}

/**
 * Record every change in the given remaining layers as a CANCELLED
 * result + ApplyError. Called when the AbortSignal fires between
 * layers — the changes never started, so we synthesise their result
 * rows here for the summary to count them as failures and for the
 * caller to see exactly which work was abandoned.
 *
 * findings.md #23.
 */
function record_cancellation(context: ApplyContext, remaining_layers: ExecutionLayer[]): void {
  context.cancelled = true;
  for (const layer of remaining_layers) {
    record_cancelled_changes(
      context,
      layer.changes.filter((c) => c.action !== 'no_op'),
    );
  }
}

/**
 * Record every change in the slice as a CANCELLED result. Used both
 * by the between-layers path and the between-batches path.
 *
 * findings.md #23.
 */
function record_cancelled_changes(context: ApplyContext, changes: PlannedChange[]): void {
  context.cancelled = true;
  const error = {
    code: 'CANCELLED',
    message: 'Apply aborted via AbortSignal before this change started',
    retryable: true,
  } as const;
  for (const change of changes) {
    context.results.push({
      node_id: change.node_id,
      action: change.action,
      success: false,
      error,
      duration_ms: 0,
      dry_run: context.options.dry_run,
    });
    context.errors.push({
      node_id: change.node_id,
      action: change.action,
      error,
      recoverable: true,
    });
  }
}

/**
 * Build summary counts from results.
 */
function build_summary(results: ResourceApplyResult[]): ApplySummary {
  const summary: ApplySummary = {
    total: results.length,
    created: 0,
    updated: 0,
    replaced: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
  };

  for (const result of results) {
    if (!result.success) {
      summary.failed++;
    } else {
      switch (result.action) {
        case 'create':
          summary.created++;
          break;
        case 'update':
          summary.updated++;
          break;
        case 'replace':
          summary.replaced++;
          break;
        case 'delete':
          summary.deleted++;
          break;
        case 'no_op':
          summary.skipped++;
          break;
      }
    }
  }

  return summary;
}

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * Check if an apply result indicates success.
 */
export function apply_succeeded(result: ApplyResult): boolean {
  return result.success && result.errors.length === 0;
}

/**
 * Get failed resources from apply result.
 */
export function get_failed_resources(result: ApplyResult): ResourceApplyResult[] {
  return result.results.filter((r) => !r.success);
}

/**
 * Get successful resources from apply result.
 */
export function get_successful_resources(result: ApplyResult): ResourceApplyResult[] {
  return result.results.filter((r) => r.success);
}

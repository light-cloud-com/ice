/**
 * ICE Deploy Engine
 *
 * Orchestrates deployment of infrastructure changes to cloud providers.
 */

import { DEPLOY_ERROR_CODES, DEPLOY_DISPLAY } from './messages.js';
import { diff_graphs } from '../diff/diff.js';
import type {
  DeployOptions,
  DeployResult,
  DeploySummary,
  DeployError,
  DeployWarning,
  ResourceDeployResult,
  ProviderDeployer,
} from './types.js';
import type { DiffResult, ResourceChange } from '../diff/types.js';
import type { Graph, Node } from '../types/graph.js';

/**
 * Default deployment options.
 */
const DEFAULT_OPTIONS: Partial<DeployOptions> = {
  parallelism: 10,
  continue_on_error: false,
  dry_run: false,
  auto_approve: false,
};

/**
 * Deploy infrastructure changes from a diff result.
 */
export async function deploy_changes(
  diff: DiffResult,
  desired: Graph,
  deployer: ProviderDeployer,
  options: DeployOptions,
): Promise<DeployResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const started_at = new Date().toISOString();
  const start_time = Date.now();
  const errors: DeployError[] = [];
  const warnings: DeployWarning[] = [];
  const results: ResourceDeployResult[] = [];

  try {
    // Initialize the deployer
    await deployer.initialize(opts);

    // Filter changes based on target/exclude patterns
    const filtered_changes = filter_changes(diff.changes, opts);

    // Separate changes by action type
    const creates = filtered_changes.filter((c) => c.change_type === 'create');
    const updates = filtered_changes.filter((c) => c.change_type === 'update');
    const deletes = filtered_changes.filter((c) => c.change_type === 'delete');

    // Order changes for safe deployment:
    // 1. Create in dependency order (parents first)
    // 2. Update in any order
    // 3. Delete in reverse dependency order (children first)
    const ordered_creates = order_by_dependencies(creates, desired, 'forward');
    const ordered_deletes = order_by_dependencies(deletes, desired, 'reverse');

    // Execute creates
    for (const change of ordered_creates) {
      if (opts.dry_run) {
        results.push(dry_run_result(change, 'create'));
        continue;
      }

      try {
        opts.on_progress?.(change.name, 'create', 'running');
        const node = get_node_by_name(desired, change.name);
        const result = await deployer.create(change.type, change.name, change.desired_properties || {}, { node });
        results.push(result);
        opts.on_progress?.(change.name, 'create', result.success ? 'completed' : 'failed', {
          outputs: result.outputs,
          error: result.success ? undefined : result.error,
          provider_id: result.provider_id,
        });

        if (!result.success && !opts.continue_on_error) {
          throw new Error(`Failed to create ${change.name}: ${result.error}`);
        }
      } catch (error) {
        const err_msg = error instanceof Error ? error.message : String(error);
        errors.push({
          code: DEPLOY_ERROR_CODES.CREATE_FAILED,
          message: err_msg,
          resource_id: change.id,
          recoverable: false,
        });
        if (!opts.continue_on_error) break;
      }
    }

    // Execute updates
    for (const change of updates) {
      if (opts.dry_run) {
        results.push(dry_run_result(change, 'update'));
        continue;
      }

      try {
        opts.on_progress?.(change.name, 'update', 'running');
        const node = get_node_by_name(desired, change.name);
        const result = await deployer.update(
          change.type,
          change.name,
          change.provider_id || '',
          change.desired_properties || {},
          change.current_properties || {},
          { node },
        );
        results.push(result);
        opts.on_progress?.(change.name, 'update', result.success ? 'completed' : 'failed', {
          outputs: result.outputs,
          error: result.success ? undefined : result.error,
          provider_id: result.provider_id,
        });

        if (!result.success && !opts.continue_on_error) {
          throw new Error(`Failed to update ${change.name}: ${result.error}`);
        }
      } catch (error) {
        const err_msg = error instanceof Error ? error.message : String(error);
        errors.push({
          code: DEPLOY_ERROR_CODES.UPDATE_FAILED,
          message: err_msg,
          resource_id: change.id,
          recoverable: true,
        });
        if (!opts.continue_on_error) break;
      }
    }

    // Execute deletes
    for (const change of ordered_deletes) {
      if (opts.dry_run) {
        results.push(dry_run_result(change, 'delete'));
        continue;
      }

      try {
        opts.on_progress?.(change.name, 'delete', 'running');
        const result = await deployer.delete(change.type, change.name, change.provider_id || '', {});
        results.push(result);
        opts.on_progress?.(change.name, 'delete', result.success ? 'completed' : 'failed', {
          outputs: result.outputs,
          error: result.success ? undefined : result.error,
          provider_id: result.provider_id,
        });

        if (!result.success && !opts.continue_on_error) {
          throw new Error(`Failed to delete ${change.name}: ${result.error}`);
        }
      } catch (error) {
        const err_msg = error instanceof Error ? error.message : String(error);
        errors.push({
          code: DEPLOY_ERROR_CODES.DELETE_FAILED,
          message: err_msg,
          resource_id: change.id,
          recoverable: true,
        });
        if (!opts.continue_on_error) break;
      }
    }
  } finally {
    await deployer.cleanup();
  }

  const completed_at = new Date().toISOString();
  const duration_ms = Date.now() - start_time;

  const summary = calculate_summary(results);

  return {
    success: errors.length === 0 && results.every((r) => r.success),
    resources: results,
    summary,
    provider: options.provider,
    started_at,
    completed_at,
    duration_ms,
    errors,
    warnings,
  };
}

/**
 * Deploy a desired graph to a cloud provider.
 */
export async function deploy_graph(
  desired: Graph,
  current: Graph,
  deployer: ProviderDeployer,
  options: DeployOptions,
): Promise<DeployResult> {
  // Compute diff first
  const diff = diff_graphs(desired, current, options.provider);

  // Deploy the changes
  return deploy_changes(diff, desired, deployer, options);
}

/**
 * Filter changes based on target/exclude patterns.
 */
function filter_changes(changes: ResourceChange[], options: Partial<DeployOptions>): ResourceChange[] {
  let filtered = changes.filter((c) => c.change_type !== 'no_change');

  if (options.target && options.target.length > 0) {
    filtered = filtered.filter((c) =>
      options.target!.some((pattern) => matches_pattern(c.name, pattern) || matches_pattern(c.type, pattern)),
    );
  }

  if (options.exclude && options.exclude.length > 0) {
    filtered = filtered.filter(
      (c) => !options.exclude!.some((pattern) => matches_pattern(c.name, pattern) || matches_pattern(c.type, pattern)),
    );
  }

  return filtered;
}

/**
 * Simple glob-like pattern matching.
 */
function matches_pattern(value: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(value);
  }
  return value === pattern;
}

/**
 * Order changes by dependencies.
 */
function order_by_dependencies(
  changes: ResourceChange[],
  graph: Graph,
  direction: 'forward' | 'reverse',
): ResourceChange[] {
  // Build dependency map from graph edges
  const deps = new Map<string, Set<string>>();
  for (const edge of graph.edges.values()) {
    const source_node = graph.nodes.get(edge.source);
    const target_node = graph.nodes.get(edge.target);
    if (source_node && target_node) {
      if (!deps.has(source_node.name)) {
        deps.set(source_node.name, new Set());
      }
      deps.get(source_node.name)!.add(target_node.name);
    }
  }

  // Topological sort using Kahn's algorithm
  const change_names = new Set(changes.map((c) => c.name));
  const in_degree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const change of changes) {
    in_degree.set(change.name, 0);
    adj.set(change.name, []);
  }

  for (const change of changes) {
    const change_deps = deps.get(change.name) || new Set();
    for (const dep of change_deps) {
      if (change_names.has(dep)) {
        adj.get(dep)!.push(change.name);
        in_degree.set(change.name, (in_degree.get(change.name) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [name, degree] of in_degree) {
    if (degree === 0) queue.push(name);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    sorted.push(name);
    for (const neighbor of adj.get(name) || []) {
      in_degree.set(neighbor, (in_degree.get(neighbor) || 0) - 1);
      if (in_degree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Cycle detection: any node with in_degree > 0 was never enqueued, which
  // means it participates in a cycle. Previously these were silently dropped
  // from the plan — now we fail loudly so users can fix the canvas.
  if (sorted.length !== changes.length) {
    const stranded = [...in_degree.entries()]
      .filter(([, degree]) => degree > 0)
      .map(([name]) => name);
    throw new Error(
      `Cycle detected in deployment graph. ${stranded.length} node(s) participate in a cycle: ` +
        `${stranded.join(', ')}. Review the canvas edges to break the loop before deploying.`,
    );
  }

  // Map sorted names back to changes
  const name_to_change = new Map(changes.map((c) => [c.name, c]));
  const ordered = sorted.map((name) => name_to_change.get(name)!).filter(Boolean);

  return direction === 'reverse' ? ordered.reverse() : ordered;
}

/**
 * Get a node from the graph by name.
 */
function get_node_by_name(graph: Graph, name: string): Node | undefined {
  for (const node of graph.nodes.values()) {
    if (node.name === name) return node;
  }
  return undefined;
}

/**
 * Create a dry-run result for a change.
 */
function dry_run_result(change: ResourceChange, action: 'create' | 'update' | 'delete'): ResourceDeployResult {
  return {
    resource_id: change.id,
    name: change.name,
    type: change.type,
    action,
    success: true,
    duration_ms: 0,
  };
}

/**
 * Calculate deployment summary.
 */
function calculate_summary(results: ResourceDeployResult[]): DeploySummary {
  return {
    total: results.length,
    created: results.filter((r) => r.action === 'create' && r.success).length,
    updated: results.filter((r) => r.action === 'update' && r.success).length,
    deleted: results.filter((r) => r.action === 'delete' && r.success).length,
    skipped: results.filter((r) => r.action === 'skip').length,
    failed: results.filter((r) => !r.success).length,
  };
}

/**
 * Format deployment result for display.
 */
export function format_deploy_result(result: DeployResult): string {
  const lines: string[] = [];

  lines.push(DEPLOY_DISPLAY.TITLE);
  lines.push(DEPLOY_DISPLAY.PROVIDER(result.provider));
  lines.push(DEPLOY_DISPLAY.DURATION((result.duration_ms / 1000).toFixed(2)));
  lines.push('');

  if (result.resources.length === 0) {
    lines.push(DEPLOY_DISPLAY.NO_CHANGES);
    return lines.join('\n');
  }

  // Group by action
  const creates = result.resources.filter((r) => r.action === 'create');
  const updates = result.resources.filter((r) => r.action === 'update');
  const deletes = result.resources.filter((r) => r.action === 'delete');

  if (creates.length > 0) {
    lines.push(DEPLOY_DISPLAY.CREATED_HEADER(creates.length));
    for (const r of creates) {
      lines.push(DEPLOY_DISPLAY.RESOURCE_LINE(r.success, r.type, r.name, r.error));
    }
    lines.push('');
  }

  if (updates.length > 0) {
    lines.push(DEPLOY_DISPLAY.UPDATED_HEADER(updates.length));
    for (const r of updates) {
      lines.push(DEPLOY_DISPLAY.RESOURCE_LINE(r.success, r.type, r.name, r.error));
    }
    lines.push('');
  }

  if (deletes.length > 0) {
    lines.push(DEPLOY_DISPLAY.DELETED_HEADER(deletes.length));
    for (const r of deletes) {
      lines.push(DEPLOY_DISPLAY.RESOURCE_LINE(r.success, r.type, r.name, r.error));
    }
    lines.push('');
  }

  // Summary
  lines.push(DEPLOY_DISPLAY.SEPARATOR);
  lines.push(result.success ? DEPLOY_DISPLAY.RESULT_SUCCESS : DEPLOY_DISPLAY.RESULT_FAILED);
  lines.push(DEPLOY_DISPLAY.SUMMARY_CREATED(result.summary.created));
  lines.push(DEPLOY_DISPLAY.SUMMARY_UPDATED(result.summary.updated));
  lines.push(DEPLOY_DISPLAY.SUMMARY_DELETED(result.summary.deleted));
  lines.push(DEPLOY_DISPLAY.SUMMARY_FAILED(result.summary.failed));

  return lines.join('\n');
}

/**
 * ICE Deploy Engine
 *
 * Orchestrates deployment of infrastructure changes to cloud providers.
 */

import { DEPLOY_ERROR_CODES, DEPLOY_DISPLAY } from './messages.js';
import { diff_graphs } from '../diff/diff.js';
import { run_parallel_apply, wrap_on_progress_for_node_progress, type SchedulerPhase } from './scheduler.js';
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
import type { Graph } from '../types/graph.js';

/**
 * Default deployment options.
 *
 * `parallelism: 10` is preserved as a deprecated alias — the new
 * scheduler reads `pool_size` first and falls back to `parallelism`
 * for one revision before the field is removed.
 */
const DEFAULT_OPTIONS: Partial<DeployOptions> = {
  parallelism: 10,
  continue_on_error: false,
  dry_run: false,
  auto_approve: false,
};

/**
 * Deploy infrastructure changes from a diff result.
 *
 * Phase 1 (pdl-1): the apply walk is now a bounded worker-pool
 * scheduler over the per-node DAG (creates → updates → deletes, one
 * phase end-to-end before the next). The legacy three sequential
 * `for...of` loops are gone; the scheduler emits the same
 * `on_progress`/`on_resource_result` events plus the new per-node
 * `on_node_status`/`on_node_progress` channels.
 *
 * The phase boundary stays serial (creates settle before updates
 * start, etc.) because mixing phases in one DAG would let an update
 * schedule before its create finishes — out of scope for this unit.
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
    // Filter changes based on target/exclude patterns
    const filtered_changes = filter_changes(diff.changes, opts);

    // Build the resource_name → ResourceChange index used by the
    // on_progress wrapper to translate `step` events to
    // `on_node_progress` with the correct `node_id` payload.
    const changes_by_resource_name = new Map<string, ResourceChange>();
    for (const c of filtered_changes) changes_by_resource_name.set(c.name, c);

    // Wrap on_progress before deployer.initialize captures it. The
    // wrapper forwards `step` events from handler `on_step` calls to
    // the new `on_node_progress` channel; everything else is
    // pass-through.
    const opts_with_wrapped_progress = wrap_on_progress_for_node_progress(opts, changes_by_resource_name);

    // Initialize the deployer (captures opts.on_progress etc.)
    await deployer.initialize(opts_with_wrapped_progress);

    // Separate changes by action type. Each phase is its own DAG.
    const creates = filtered_changes.filter((c) => c.change_type === 'create');
    const updates = filtered_changes.filter((c) => c.change_type === 'update');
    const deletes = filtered_changes.filter((c) => c.change_type === 'delete');

    const phase_buckets: Array<{ phase: SchedulerPhase; changes: ResourceChange[] }> = [
      { phase: 'create', changes: creates },
      { phase: 'update', changes: updates },
      { phase: 'delete', changes: deletes },
    ];

    for (const { phase, changes } of phase_buckets) {
      if (changes.length === 0) continue;

      const phase_results = await run_parallel_apply({
        changes,
        phase,
        graph: desired,
        deployer,
        options: opts_with_wrapped_progress,
      });

      results.push(...phase_results);

      // Capture per-resource errors on the legacy errors[] surface so
      // DeployResult.errors stays populated. With continue_on_error
      // (current default true at the service callsite), the scheduler
      // already cancels descendants — the loop continues to the next
      // phase regardless. With continue_on_error: false, the scheduler
      // already flipped not-yet-applying nodes to cancelled-due-to-dep
      // before returning, so the failed/cancelled results are present
      // in phase_results.
      for (const r of phase_results) {
        if (r.success) continue;
        const error_code =
          phase === 'create'
            ? DEPLOY_ERROR_CODES.CREATE_FAILED
            : phase === 'update'
              ? DEPLOY_ERROR_CODES.UPDATE_FAILED
              : DEPLOY_ERROR_CODES.DELETE_FAILED;
        errors.push({
          code: error_code,
          message: r.error || 'unknown error',
          resource_id: r.resource_id,
          recoverable: phase !== 'create',
        });
      }

      // Honour continue_on_error: false at the phase boundary. The
      // scheduler within a phase already cancels descendants and (in
      // the strict mode) flips remaining nodes to cancelled. We must
      // also stop entering the next phase.
      if (!opts.continue_on_error && errors.length > 0) break;
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

/**
 * Quota Retry — auto-cleanup-on-quota-failure orchestration extracted from
 * `services/deploy/src/services/deploy.service.ts` (rf-deploy-14).
 *
 * The user's pain point: hitting the GCP default 3-backend-bucket limit
 * during iteration leaves the user staring at a "Cleanup Orphans" button
 * that they didn't know they had to click. This helper detects the quota
 * error in the deploy result, runs orphan cleanup automatically, and
 * re-runs the failed resources — mutating `result` in place so the caller
 * sees a single coherent post-retry result.
 *
 * The gate is folded into the helper as a no-op short-circuit — calling
 * this without a quota failure is cheap. `hasQuotaFailure` is exported
 * separately so tests (and future callers) can exercise the gate
 * independently.
 *
 * The helper takes `deployGraph` as a function parameter rather than
 * importing `@ice/core` directly — keeps the helper testable without a
 * heavy mock and follows the existing pattern of injecting the engine.
 */

import { emitLog } from './deploy-event-dispatcher.js';
import { makeSchedulerCallbacks } from './scheduler-callbacks.js';

const QUOTA_PATTERNS = ['QUOTA_EXCEEDED', "Quota 'BACKEND_BUCKETS'", 'Backend bucket quota exceeded'];

/** True iff `result.resources` contains a failed resource whose error matches a known quota-exhaustion signature. */
export function hasQuotaFailure(resources: any[] | undefined | null): boolean {
  return (resources || []).some(
    (r) => !r.success && r.error && QUOTA_PATTERNS.some((p) => String(r.error).includes(p)),
  );
}

export interface RetryAfterQuotaCleanupArgs {
  cardId: string;
  orgId: string;
  gcpProject: string;
  /** Mutated in place: `resources`, `success`, and `summary.failed` are merged from the retry. */
  result: any;
  deployer: any;
  /**
   * Injected `deploy_graph` from `@ice/core` (typically destructured from
   * `getCoreEngine()` at the callsite). Passing it as a parameter keeps
   * this helper testable without mocking the heavy core engine module.
   */
  deployGraph: (
    desired: any,
    current: any,
    deployer: any,
    opts: any,
  ) => Promise<{ resources?: any[]; success?: boolean; summary?: any }>;
  translation: { graph: any };
  currentGraph: any;
  graphIdToCanvasId: Map<string, string>;
  authClient: any;
  options: { provider?: string; region?: string };
}

/**
 * Auto-cleanup orchestration: when an apply result includes a quota-error
 * failed resource, attempt to free orphaned ICE resources and re-run the
 * deploy. Mutates `result` in place to merge the retry's successful
 * resources over the primary's failures (retry success overrides primary
 * failure, by resource name).
 *
 * Caller is freed of the gate — calling this without a quota failure is
 * a cheap no-op. Caller is also freed of catching cleanup errors — they
 * surface as a `[auto-cleanup] Cleanup attempt failed: ...` log line.
 */
export async function retryAfterQuotaCleanup(args: RetryAfterQuotaCleanupArgs): Promise<void> {
  if (!hasQuotaFailure(args.result.resources)) return;

  emitLog(
    args.cardId,
    '[auto-cleanup] Backend bucket quota exceeded — scanning for orphaned ICE resources to free up the slot...',
  );

  try {
    // Dynamic import preserves the lazy-load behavior of the original
    // inline block (only paid when a quota failure actually fires).
    const { cleanupOrphanedIceResources } = await import('./orphan-cleanup.service.js');
    const cleanup = await cleanupOrphanedIceResources(args.orgId, args.gcpProject, { dryRun: false });
    const deletedCount = cleanup.deleted.length;
    emitLog(
      args.cardId,
      deletedCount > 0
        ? `[auto-cleanup] Freed ${deletedCount} orphaned resource${deletedCount === 1 ? '' : 's'} — retrying failed resources.`
        : '[auto-cleanup] No orphans found. Quota is exhausted by active deployments — destroy an old project or request a quota increase.',
    );

    if (deletedCount > 0) {
      // Re-run only the resources that failed with a quota error. We rebuild
      // a sub-graph by filtering the original translation to only the failed
      // names + their dependencies. The forwarding rule + URL map + target
      // proxy chain depends on the backend bucket, so freeing one slot fixes
      // the whole downstream chain on retry.
      emitLog(args.cardId, '[auto-cleanup] Retrying deploy after orphan cleanup...');
      const retryCallbacks = makeSchedulerCallbacks({
        cardId: args.cardId,
        graphIdToCanvasId: args.graphIdToCanvasId,
        warnOnMiss: false,
        // No `totals` — retry skips overall-progress writes per the
        // original behavior.
      });
      const retryResult = await args.deployGraph(args.translation.graph, args.currentGraph, args.deployer, {
        provider: args.options.provider || 'gcp',
        project: args.gcpProject,
        regions: [args.options.region || 'us-central1'],
        continue_on_error: true,
        auth_client: args.authClient,
        auth_key_file: (args.authClient as any)?._ice_key_file_path,
        auth_credentials: (args.authClient as any)?._ice_parsed_credentials,
        on_log: retryCallbacks.on_log,
        on_node_status: retryCallbacks.on_node_status,
        on_node_progress: retryCallbacks.on_node_progress,
        // on_resource_result intentionally omitted to match the original
        // retry shape.
      });

      // Merge retry results into the primary result: any resource that
      // succeeded on retry overrides its failed entry from the first
      // attempt. The deploy engine internally skips already-existing
      // resources via ALREADY_EXISTS handling.
      if (retryResult.resources && retryResult.resources.length > 0) {
        const byName = new Map<string, any>();
        for (const r of args.result.resources) byName.set(r.name, r);
        for (const r of retryResult.resources) {
          if (r.success) byName.set(r.name, r);
        }
        args.result.resources = Array.from(byName.values());
        args.result.success = args.result.resources.every((r: any) => r.success);
        if (args.result.summary) {
          args.result.summary.failed = args.result.resources.filter((r: any) => !r.success).length;
        }
      }
    }
  } catch (cleanupErr: any) {
    emitLog(args.cardId, `[auto-cleanup] Cleanup attempt failed: ${cleanupErr?.message || cleanupErr}`);
  }
}

/**
 * Pure outcome computation for deploy events. Extracted from
 * `services/deploy/src/services/deploy.service.ts` (rf-deploy-2) — the
 * orchestrator file re-exports `computeCompleteTotals` and
 * `deriveCompleteOutcome` to preserve the public API.
 */

import type { DeployCompleteEvent } from '@ice/types';

/** Compute the totals rollup for a `DeployCompleteEvent` from the resource
 *  results. Reads only `success` + `action` so it works on partial / failed
 *  / cancelled exit paths too. The reducer that consumes the wire event
 *  treats absent counts as zero, but always emit all six for clarity. */
export function computeCompleteTotals(resources: any[] | undefined): DeployCompleteEvent['totals'] {
  const totals = { queued: 0, applying: 0, succeeded: 0, failed: 0, skipped: 0, cancelled: 0 };
  for (const r of resources || []) {
    if (r?.success === true) {
      // 'no_change' is the post-process success-after-ALREADY_EXISTS marker
      // (see the post-processing block below) — counts as a success.
      totals.succeeded += 1;
    } else if (r?.success === false) {
      // The scheduler emits cancelled-due-to-dep with success: false +
      // a sentinel error. Cancellation is a lifecycle, not a quality
      // outcome, so split it from regular failures.
      const err = (r?.error as string | undefined) || '';
      if (/cancelled-due-to-dep|cancelled/i.test(err)) totals.cancelled += 1;
      else if (r?.action === 'skip') totals.skipped += 1;
      else totals.failed += 1;
    }
  }
  return totals;
}

/**
 * Derive the {@link DeployCompleteEvent} `outcome` from the resource
 * results and a cancellation flag.
 *
 *   - `cancelled` — every non-success resource looks cancelled (or no
 *     resources at all but the cancel signal fired). Surfaced first
 *     because a cancelled deploy isn't a quality judgement.
 *   - `success`   — every resource succeeded.
 *   - `failure`   — at least one resource ran AND none succeeded. The
 *     "none ran" zero-resource case lands here as well so the outcome
 *     is non-nil for the consumer.
 *   - `partial`   — at least one succeeded AND at least one didn't.
 *
 * The brief asked: "all-succeed → success, mixed → partial, all-fail →
 * failure, cancelled mid-deploy → cancelled" — this is the implementation.
 */
export function deriveCompleteOutcome(
  resources: any[] | undefined,
  opts: { cancelled?: boolean; engineSuccess?: boolean } = {},
): DeployCompleteEvent['outcome'] {
  const list = resources || [];
  const successes = list.filter((r) => r?.success === true);
  const nonSuccess = list.filter((r) => r?.success !== true);
  const cancelledLike = nonSuccess.filter((r) => /cancelled-due-to-dep|cancelled/i.test((r?.error as string) || ''));

  // Cancel takes precedence: if the cancel signal fired AND there's no
  // successful resource (or every non-success looks cancelled), surface
  // 'cancelled'. A cancelled deploy with one already-completed resource
  // before the abort is still 'partial' — the user has a real artifact
  // they need to clean up.
  if (opts.cancelled && successes.length === 0) return 'cancelled';
  if (list.length > 0 && nonSuccess.length === cancelledLike.length && cancelledLike.length > 0 && successes.length === 0) {
    return 'cancelled';
  }

  if (list.length === 0) {
    // No resources ran. If the engine reported success (clean no-op
    // pass), call it success; otherwise treat as failure so the UI
    // surfaces the error path. Cancelled is handled above.
    return opts.engineSuccess ? 'success' : 'failure';
  }
  if (successes.length === list.length) return 'success';
  if (successes.length === 0) return 'failure';
  return 'partial';
}

/**
 * Compute a resource-count summary for the history UI from a deploy result.
 * Returns `{ created, updated, deleted, failed, total }` so the history row
 * can render "3 created · 1 updated · 2 failed" without re-walking results.
 */
export function computeDeploySummary(result: any): Record<string, number> {
  const resources = (result?.resources || []) as any[];
  let created = 0,
    updated = 0,
    deleted = 0,
    failed = 0;
  for (const r of resources) {
    if (!r.success) {
      failed += 1;
      continue;
    }
    const action = (r.action as string) || 'create';
    if (action === 'create') created += 1;
    else if (action === 'update') updated += 1;
    else if (action === 'delete') deleted += 1;
  }
  return { created, updated, deleted, failed, total: resources.length };
}

/**
 * Deploy slice — derived view helpers.
 *
 * Pure functions that project from the per-node live state map
 * (`DeployState.nodesById`) onto the shapes the deploy panel and canvas
 * banner consume:
 *
 * - `deriveRollup` — bucket counts (queued / applying / succeeded / failed
 *   / skipped / cancelled / total / terminal) used for the in-flight
 *   rollup ("X of N succeeded") and the canvas progress bar. Cap at 99%
 *   while any node is non-terminal so the legacy bouncing-bar bug is
 *   impossible by construction.
 *
 * - `orderNodesForPanel` — ordered list of node-deploy records for the
 *   panel's per-row UI: applying first, then queued, then terminal sorted
 *   by `last_at` descending. Stable on equal-rank ties.
 *
 * Both consume the slice's `nodesById` map but live OUTSIDE the
 * `createSlice` reducers block — they are not state mutations, they are
 * read-side helpers. Re-exported from `../deploy-slice` so external
 * consumers (deploy-banner, deploy-in-flight-panel, etc.) keep resolving
 * the same import path.
 *
 * @see rf-dslice-2
 */

import { STATUS_RANK } from './types';
import type { DeployRollup, NodeDeployState } from './types';

export function deriveRollup(nodesById: Record<string, NodeDeployState>): DeployRollup {
  const rollup: DeployRollup = {
    queued: 0,
    applying: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    total: 0,
    terminal: 0,
  };
  for (const node of Object.values(nodesById)) {
    rollup.total += 1;
    switch (node.status) {
      case 'queued':
        rollup.queued += 1;
        break;
      case 'applying':
        rollup.applying += 1;
        break;
      case 'succeeded':
        rollup.succeeded += 1;
        rollup.terminal += 1;
        break;
      case 'failed':
        rollup.failed += 1;
        rollup.terminal += 1;
        break;
      case 'skipped':
        rollup.skipped += 1;
        rollup.terminal += 1;
        break;
      case 'cancelled-due-to-dep':
        rollup.cancelled += 1;
        rollup.terminal += 1;
        break;
      default:
        // pdl-5 critic — defensive guard against wire-contract drift.
        // TypeScript narrows `node.status` to the 6 known values, so this
        // arm is unreachable through normal code paths; it catches the
        // runtime case where a backend sends a status the frontend hasn't
        // shipped support for yet (per the contract-evolution caveat in
        // learning `requirement-verified-needs-full-tenancy-key-on-the-wire`).
        // We undo the `total += 1` so the bucket sum still equals the
        // total, then warn so an operator sees the drift in the console.
        rollup.total -= 1;
        if (typeof console !== 'undefined') {
           
          console.warn(
            '[deploy-rollup] unknown node status:',
            (node as { status?: unknown }).status,
            '— not counted in rollup',
          );
        }
        break;
    }
  }
  return rollup;
}

/**
 * Project a `DeployRollup` onto a 0–100 progress percentage, applying the
 * cap-at-99 rule: while any node is still queued or applying, the bar
 * holds short of 100% so the user never sees "100% complete" with work
 * still in flight. Empty rollup → 0%; fully terminal → 100% exactly.
 *
 * Extracted from three identical inline copies in deploy-in-flight-panel,
 * deploy-banner, and status-bar (pdl-5 critic findings #2 and #4).
 */
export function deriveRollupPercentage(rollup: DeployRollup): number {
  if (rollup.total === 0) return 0;
  if (rollup.terminal === rollup.total) return 100;
  return Math.min(99, Math.round((rollup.terminal / Math.max(rollup.total, 1)) * 100));
}

export function orderNodesForPanel(nodesById: Record<string, NodeDeployState>): NodeDeployState[] {
  const all = Object.values(nodesById);
  return [...all].sort((a, b) => {
    const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rankDiff !== 0) return rankDiff;
    // Within the same rank-2 (terminal) bucket, newest first.
    if (STATUS_RANK[a.status] === 2) {
      // last_at is ISO-8601, lex-sort descending.
      if (a.last_at < b.last_at) return 1;
      if (a.last_at > b.last_at) return -1;
    }
    return 0;
  });
}

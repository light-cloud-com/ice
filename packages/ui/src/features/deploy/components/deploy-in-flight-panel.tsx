/**
 * pdl-5 — in-flight per-node panel. Replaces the legacy single-resource
 * progress bar (the one that bounced 59% → 0% → 0% on every step
 * transition because each percent was per-resource, not overall). Shows
 * an honest rollup ("3 in flight · 5 done · 1 failed · 9 of 13 terminal")
 * plus a list of every node from `nodesById` ordered by lifecycle phase.
 *
 * Rendering rules:
 *   - Empty `nodesById` (very first event hasn't landed yet) → tiny
 *     "Preparing…" sentinel rather than an empty list.
 *   - Progress bar caps at 99% while any node is non-terminal — the
 *     `terminal === total` invariant is the only path to 100%.
 *   - Wrapped in React.memo so a parent re-render with unchanged
 *     `nodesById` reference (e.g. on `state.environment` change) skips
 *     the inner work.
 */

import { Loader2 } from 'lucide-react';
import React, { useMemo } from 'react';
import { DeployNodeRow } from './deploy-node-row';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import {
  deriveRollup,
  orderNodesForPanel,
  type DeployStatus,
  type NodeDeployState,
} from '../../../store/slices/deploy-slice';

export const DeployInFlightPanel: React.FC<{
  nodesById: Record<string, NodeDeployState>;
  status: DeployStatus;
}> = React.memo(({ nodesById, status }) => {
  const { t } = useTranslation();
  // Memoize derived data so children of this component don't re-derive
  // every parent render. `nodesById` is the only input — when it doesn't
  // change reference, neither does the rollup or the ordered list.
  const rollup = useMemo(() => deriveRollup(nodesById), [nodesById]);
  const ordered = useMemo(() => orderNodesForPanel(nodesById), [nodesById]);

  const empty = rollup.total === 0;
  // Cap at 99% while any node is non-terminal. The legacy bug was a
  // per-resource percentage that bounced; this one is monotonic over the
  // whole deploy, but we still hold short of 100% until the last
  // terminal lands so the user doesn't see "100% with 1 still applying".
  const pct = empty
    ? 0
    : rollup.terminal === rollup.total
      ? 100
      : Math.min(99, Math.round((rollup.terminal / Math.max(rollup.total, 1)) * 100));

  return (
    <div id="ice-deploy-progress" className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>
            {empty
              ? status === 'destroying'
                ? 'Preparing destroy…'
                : t('deploy.progress.deploying')
              : (
                <>
                  <span className="text-blue-600 dark:text-blue-400">{rollup.applying}</span> in flight
                  {' · '}
                  <span className="text-emerald-600 dark:text-emerald-400">{rollup.succeeded}</span> done
                  {rollup.failed > 0 && (
                    <>
                      {' · '}
                      <span className="text-red-600 dark:text-red-400">{rollup.failed}</span> failed
                    </>
                  )}
                </>
              )}
          </span>
        </span>
        <span className="font-mono text-xs tabular-nums">
          {empty ? '' : `${rollup.terminal} of ${rollup.total}`}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            rollup.failed > 0 ? 'bg-amber-500' : 'bg-emerald-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!empty && (
        <ul className="divide-y divide-border rounded-md border border-border bg-muted/20 max-h-72 overflow-y-auto">
          {ordered.map((node) => (
            <DeployNodeRow key={node.node_id} node={node} />
          ))}
        </ul>
      )}
    </div>
  );
});
DeployInFlightPanel.displayName = 'DeployInFlightPanel';

/**
 * rf-pdpl-13 — DeployNodeRow.
 *
 * Single row in the in-flight per-node list (pdl-5). Displays a status
 * pill (colors aligned with the canvas badge from pdl-6 via
 * `getDeployBadge`), the resource name, a sub-step label if a recent
 * `node_progress` event landed, and an inline error message if failed.
 *
 * Kept in its own module — and separate from `DeployInFlightPanel` (which
 * extracts in rf-pdpl-14) — because the `React.memo` boundary is load-
 * bearing: collapsing the row back into the panel would re-render every
 * row whenever the rollup or any other panel-level state changes (cite
 * `react-memo-on-rollup-component-instead-of-shallowequal-on-selector`).
 */

import React from 'react';
import { cn } from '../../../shared/utils/cn';
import { getDeployBadge } from '../../canvas/components/nodes/compact-node/helpers';
import { mapWireStatusToOverlay } from '../hooks/use-deploy-subscription';
import { type NodeDeployState } from '../../../store/slices/deploy-slice';

export const DeployNodeRow: React.FC<{ node: NodeDeployState }> = React.memo(({ node }) => {
  // Translate wire status to the same overlay key the canvas uses, so the
  // pill picks up the same color from `getDeployBadge`. Single source of
  // truth: `mapWireStatusToOverlay` from `use-deploy-subscription.ts`.
  // Earlier drafts inlined a third copy of this mapping here — that
  // violated the cited learning `deploy-overlay-mapping-must-match-status-colors-keyset`,
  // since divergence between parallel mappings is the exact footgun the
  // shared helper exists to prevent.
  const overlayKey = mapWireStatusToOverlay(node.status);
  const baseBadge = getDeployBadge(overlayKey);
  // Action-aware label override for destroy paths. The wire emits the
  // same `node_status` shape for create and delete; the badge palette
  // is identical (DEPLOY blue, LIVE green) and reads as a contradiction
  // when the engine is destroying ("LIVE" on a resource that's gone).
  // Substitute destroy-flavored labels while keeping the colors so the
  // canvas + panel stay visually coherent. See critic finding pdl-5#1.
  const badge = (() => {
    if (!baseBadge) return null;
    if (node.action !== 'delete') return baseBadge;
    const destroyLabel =
      node.status === 'applying'
        ? 'DESTROY'
        : node.status === 'succeeded'
          ? 'GONE'
          : null;
    return destroyLabel ? { ...baseBadge, label: destroyLabel } : baseBadge;
  })();
  const isTerminal =
    node.status === 'succeeded' ||
    node.status === 'failed' ||
    node.status === 'skipped' ||
    node.status === 'cancelled-due-to-dep';
  const muted = node.status === 'skipped' || node.status === 'cancelled-due-to-dep';

  return (
    <li
      className={cn(
        'px-3 py-2 text-xs flex items-start gap-2',
        muted && 'opacity-60',
      )}
      data-testid="ice-deploy-node-row"
      data-node-id={node.node_id}
      data-node-status={node.status}
    >
      {badge && (
        <span
          className="shrink-0 mt-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wider"
          style={{ backgroundColor: badge.color + '20', color: badge.color }}
        >
          {badge.label}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate" title={node.resource_name}>
            {node.resource_name || node.node_id}
          </span>
          {node.resource_type && (
            <span className="text-muted-foreground font-mono text-[10px] truncate">
              {node.resource_type}
            </span>
          )}
          {isTerminal && typeof node.duration_ms === 'number' && (
            <span className="ml-auto text-muted-foreground tabular-nums">
              {(node.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        {node.status === 'applying' && node.step && (
          <div className="text-muted-foreground mt-0.5">
            └ {node.step.label} ({node.step.index}/{node.step.total})
          </div>
        )}
        {node.status === 'failed' && node.error?.message && (
          <div className="text-red-600 dark:text-red-400 mt-0.5 break-words">
            {node.error.message}
          </div>
        )}
      </div>
    </li>
  );
});
DeployNodeRow.displayName = 'DeployNodeRow';

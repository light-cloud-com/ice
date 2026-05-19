/**
 * Service Source Section — read-only display of the `Source.Repository` block
 * connected to a service node. Walks `activeCard.edges` to find a connected
 * node whose `iceType === 'Source.Repository'` OR whose `behavior === 'source'`
 * (the dual-match is intentional — some templates use `behavior` instead of
 * `iceType` to flag a source-of-truth block). When found, the matched node's
 * `repository`, `branch`, and `label` flow into the linked-repo display.
 *
 * Fallback chain when no edge matches:
 *   1. The connected node's `repository` → if missing, fall through to
 *   2. The `nodeRepo` prop (the service node's own `data.repository`) → if
 *      empty, fall through to
 *   3. The empty-state hint ("no source connected").
 *
 * Same fallback applies to `nodeBranch`. `sourceBlockName` falls back to
 * `'GitHub Repo'` when the connected node has no `label`.
 *
 * Two callsites in `properties-panel.tsx` — one in the dedicated source-tab
 * branch, one in the no-tabs fallback — render this with identical props.
 *
 * Extracted verbatim from `properties-panel.tsx` lines 1187-1242 during
 * rf-props-18. No Redux, no hooks: purely presentational. The matching order
 * (first-edge-wins via `break`), the `||` fallbacks, and the empty-state copy
 * are all preserved exactly.
 */

import React from 'react';
import { t } from '../../../../i18n';
import { Section } from '../fields';

// ─── Service Source Section (read-only — shows linked repo or hint) ──────────

export const ServiceSourceSection: React.FC<{
  nodeId: string;
  nodeRepo: string;
  nodeBranch: string;
  activeCard: any;
}> = ({ nodeId, nodeRepo, nodeBranch, activeCard }) => {
  // Find connected Source.Repository block
  let linkedRepo = nodeRepo;
  let linkedBranch = nodeBranch;
  let sourceBlockName = '';

  if (activeCard) {
    const edges = (activeCard.edges || []) as Array<{ source: string; target: string }>;
    const connected = edges.filter((e: any) => e.source === nodeId || e.target === nodeId);
    for (const edge of connected) {
      const otherId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = (activeCard.nodes || []).find((n: any) => n.id === otherId);
      if (otherNode?.data?.iceType === 'Source.Repository' || otherNode?.data?.behavior === 'source') {
        linkedRepo = (otherNode.data.repository as string) || linkedRepo;
        linkedBranch = (otherNode.data.branch as string) || linkedBranch;
        sourceBlockName = (otherNode.data.label as string) || 'GitHub Repo';
        break;
      }
    }
  }

  if (linkedRepo) {
    return (
      <Section title={t('properties.source.title')}>
        <div className="rounded border border-ice-border bg-ice-raised px-2.5 py-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-ice-sm font-mono text-ice-text-1">{linkedRepo}</span>
          </div>
          {linkedBranch && <div className="text-ice-xs text-ice-text-3 font-mono">&rarr; {linkedBranch}</div>}
          {sourceBlockName && (
            <div className="text-ice-xs text-ice-text-3">
              {t('properties.source.managedBy')} <span className="text-ice-text-2 font-medium">{sourceBlockName}</span>{' '}
              {t('properties.source.block')}
            </div>
          )}
        </div>
      </Section>
    );
  }

  return (
    <Section title={t('properties.source.title')}>
      <div className="rounded border border-dashed border-ice-border px-2.5 py-3 text-center space-y-1.5">
        <div className="text-ice-sm text-ice-text-3">{t('properties.source.noSourceConnected')}</div>
        <div className="text-ice-xs text-ice-text-3 leading-relaxed">{t('properties.source.noSourceHint')}</div>
      </div>
    </Section>
  );
};

/**
 * Custom Domain Banner — surfaces that a node's `domain` field is
 * managed by an upstream Custom Domain block.
 *
 * Extracted from `node-properties-section.tsx` during rf-npsec-2.
 * Renders nothing when this node is not the target of a Network.CustomDomain
 * edge; otherwise renders the inheritance banner with the cd block label
 * + the inherited domain (when set) + a hint about disconnecting.
 */

import React from 'react';
import { t } from '../../../../i18n';
import type { Card, CardNode } from '../../../../store/slices/cards-slice';
import { findCustomDomainEdge } from '../../utils/node-properties-derivations';

export const CustomDomainBanner: React.FC<{
  selectedNode: CardNode;
  activeCard: Card;
}> = ({ selectedNode, activeCard }) => {
  if (!activeCard || !selectedNode) return null;
  const cdResult = findCustomDomainEdge(activeCard, selectedNode);
  if (!cdResult) return null;
  const cdLabel = (cdResult.cdNode.data?.label as string) || t('canvas.properties.customDomainBanner.fallbackLabel');
  const inheritedDomain = (selectedNode.data?.domain as string) || '';
  return (
    <div className="px-3 py-2 border-b border-ice-border bg-blue-500/5">
      <div className="flex items-center gap-1.5 text-ice-2xs text-blue-400">
        <span>🌐</span>
        <span className="font-medium">{t('canvas.properties.customDomainBanner.managedBy')}</span>
        <span className="font-mono">{cdLabel}</span>
      </div>
      {inheritedDomain && (
        <div className="mt-0.5 text-ice-xs font-mono text-ice-text-1 truncate" title={inheritedDomain}>
          {inheritedDomain}
        </div>
      )}
      <div className="mt-0.5 text-ice-2xs text-ice-text-3 leading-snug">
        {t('canvas.properties.customDomainBanner.disconnectHint')}
      </div>
    </div>
  );
};

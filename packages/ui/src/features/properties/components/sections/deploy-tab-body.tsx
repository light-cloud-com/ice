/**
 * Deploy tab body — current deployment status panel for the node.
 *
 * Extracted from `node-properties-section.tsx` during rf-npsec-4. Renders
 * the DriftIndicator, a current-state Section (Live status, URL, image,
 * resource id, region, instances), the DeployHistory list, and a
 * DriftCheckButton at the bottom.
 *
 * Each row in the current-state Section is conditionally rendered based
 * on which fields the node carries; behavior preserved verbatim.
 */

import React from 'react';
import { useTranslation } from '../../../../i18n';
import { Section } from '../fields';
import { DeployHistory } from './deploy-history';
import { DriftIndicator, DriftCheckButton } from './drift';
import type { Card, CardNode } from '../../../../store/slices/cards-slice';

export const DeployTabBody: React.FC<{
  selectedNode: CardNode;
  activeCard: Card;
}> = ({ selectedNode, activeCard }) => {
  const { t } = useTranslation();
  return (
    <div className="pt-1">
      <DriftIndicator nodeId={selectedNode.id} />
      <Section title={t('properties.deploy.current')}>
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-ice-xs text-emerald-500 font-medium">{t('properties.deploy.live')}</span>
          </div>
          {!!selectedNode.data?.url && (
            <div>
              <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.urlLabel')}</div>
              <a
                href={selectedNode.data.url as string}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ice-xs text-blue-400 hover:underline break-all"
              >
                {selectedNode.data.url as string}
              </a>
            </div>
          )}
          {!!selectedNode.data?.deployed_image && (
            <div>
              <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.imageLabel')}</div>
              <div className="text-ice-xs text-ice-text-2 font-mono break-all">
                {selectedNode.data.deployed_image as string}
              </div>
            </div>
          )}
          <div>
            <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.resourceIdLabel')}</div>
            <div className="text-ice-xs text-ice-text-2 font-mono break-all">
              {selectedNode.data.provider_id as string}
            </div>
          </div>
          {!!selectedNode.data?.region && (
            <div>
              <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.regionLabel')}</div>
              <div className="text-ice-xs text-ice-text-2">{selectedNode.data.region as string}</div>
            </div>
          )}
          {!!selectedNode.data?.max_instances && (
            <div>
              <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.instancesLabel')}</div>
              <div className="text-ice-xs text-ice-text-2">
                {String(selectedNode.data.min_instances || 0)} – {String(selectedNode.data.max_instances)}
              </div>
            </div>
          )}
        </div>
      </Section>
      <DeployHistory cardId={activeCard.id} />
      <DriftCheckButton cardId={activeCard.id} nodes={activeCard.nodes} />
    </div>
  );
};

/**
 * DeploymentTargetCard — region picker.
 *
 * Sits just below `NodeIdentityCard` in the right-side properties panel
 * and surfaces `node.data.region` as a dropdown of regions for the
 * block's currently-bound provider. Provider stays implicit — it's set
 * at drop-time and visible on the canvas via the brand-logo stamp on
 * the block header. Showing a separate provider picker here was
 * redundant with the on-canvas stamp, so this card now keeps the
 * editor focused on the one editable field: region.
 *
 * Symbolic blocks (Source.Repository, Network.PublicTraffic) skip this
 * card — they aren't deployed to a cloud, so the picker would be noise.
 * Filtering happens in the parent (`NodePropertiesSection`).
 */

import React from 'react';
import { t } from '../../../../i18n';
import { IceSelect } from '../../../../shared/components/ui/ice-select';
import { PROVIDER_REGIONS } from '../../../deploy/utils/provider-regions';

export interface DeploymentTargetCardProps {
  provider: string;
  region: string;
  onUpdate: (field: 'provider' | 'region', value: string) => void;
}

export const DeploymentTargetCard: React.FC<DeploymentTargetCardProps> = ({ provider, region, onUpdate }) => {
  const regionOptions = provider ? (PROVIDER_REGIONS[provider] ?? []) : [];

  return (
    <div className="px-3 py-3 border-b border-ice-border space-y-2.5">
      <div className="text-ice-2xs font-medium tracking-wide text-ice-text-3/50">
        {t('canvas.properties.deployment.sectionLabel')}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-ice-xs text-ice-text-3 shrink-0">{t('canvas.properties.deployment.regionLabel')}</span>
        {provider ? (
          <IceSelect
            value={region}
            onChange={(v) => onUpdate('region', v)}
            options={regionOptions}
            placeholder={t('canvas.properties.deployment.regionAuto')}
            allowEmpty
            emptyLabel={t('canvas.properties.deployment.regionAuto')}
            width="140px"
          />
        ) : (
          <span className="text-ice-xs text-ice-text-3/40 italic">{t('canvas.properties.deployment.regionAuto')}</span>
        )}
      </div>
    </div>
  );
};

DeploymentTargetCard.displayName = 'DeploymentTargetCard';

import React, { memo } from 'react';
import { BRAND_ICON_SIZE } from '../../../../../config/canvas-constants';
import { FONT_MONO } from '../_shared/fonts';
import type { BrandIcon } from '../../../../../assets/icons/brand-registry';

interface ServiceLineProps {
  brandIcon: BrandIcon | null;
  providerUrl: string;
  serviceLineText: string;
  maxChars?: number;
}

export const ServiceLine: React.FC<ServiceLineProps> = memo(
  ({ brandIcon, providerUrl, serviceLineText, maxChars = 28 }) => {
    if (!brandIcon && !providerUrl && !serviceLineText) return null;
    const truncated = serviceLineText.length > maxChars ? serviceLineText.slice(0, maxChars) + '\u2026' : serviceLineText;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        {(brandIcon || providerUrl) && (
          <img
            src={brandIcon?.url || providerUrl}
            alt=""
            width={BRAND_ICON_SIZE}
            height={BRAND_ICON_SIZE}
            style={{ objectFit: 'contain', flexShrink: 0 }}
            draggable={false}
          />
        )}
        {serviceLineText && (
          <span
            style={{
              color: 'var(--ice-text-secondary)',
              fontSize: 10,
              fontFamily: FONT_MONO,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {truncated}
          </span>
        )}
      </div>
    );
  },
);

ServiceLine.displayName = 'ServiceLine';

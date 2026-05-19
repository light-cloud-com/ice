import React, { memo } from 'react';
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
    const truncated =
      serviceLineText.length > maxChars ? serviceLineText.slice(0, maxChars) + '\u2026' : serviceLineText;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
        {(brandIcon || providerUrl) && (
          <img
            src={brandIcon?.url || providerUrl}
            alt=""
            width={14}
            height={14}
            style={{ objectFit: 'contain', flexShrink: 0, opacity: 0.8 }}
            draggable={false}
          />
        )}
        {serviceLineText && (
          <span
            style={{
              color: 'var(--ice-text-secondary)',
              fontSize: 11,
              fontFamily: FONT_MONO,
              opacity: 0.7,
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

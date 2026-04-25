import React, { memo } from 'react';
import { FONT_MONO } from '../_shared/fonts';

interface StatusCostLineProps {
  statusLabel: string;
  statusColor: string;
  estimatedCost: string;
}

export const StatusCostLine: React.FC<StatusCostLineProps> = memo(({ statusLabel, statusColor, estimatedCost }) => (
  <div
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 4 }}
  >
    {statusLabel ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, opacity: 0.85 }} />
        <span style={{ color: 'var(--ice-text-tertiary)', fontSize: 10, fontFamily: FONT_MONO }}>{statusLabel}</span>
      </div>
    ) : (
      <span />
    )}
    {estimatedCost && (
      <span style={{ color: 'var(--ice-text-tertiary)', fontSize: 10, fontFamily: FONT_MONO }}>{estimatedCost}</span>
    )}
  </div>
));

StatusCostLine.displayName = 'StatusCostLine';

import React, { memo } from 'react';
import { FONT_MONO } from '../_shared/fonts';

interface StatusCostLineProps {
  statusLabel: string;
  statusColor: string;
  estimatedCost: string;
}

export const StatusCostLine: React.FC<StatusCostLineProps> = memo(
  ({ statusLabel, statusColor, estimatedCost }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
      {statusLabel ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, opacity: 0.9 }} />
          <span style={{ color: 'var(--ice-text-secondary)', fontSize: 9, fontFamily: FONT_MONO, opacity: 0.7 }}>
            {statusLabel}
          </span>
        </div>
      ) : (
        <span />
      )}
      {estimatedCost && (
        <span style={{ color: 'var(--ice-text-secondary)', fontSize: 9, fontFamily: FONT_MONO, opacity: 0.7 }}>
          {estimatedCost}
        </span>
      )}
    </div>
  ),
);

StatusCostLine.displayName = 'StatusCostLine';

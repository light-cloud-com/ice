import React, { memo } from 'react';

interface CostLabelProps {
  cost: string;
  style?: React.CSSProperties;
}

export const CostLabel: React.FC<CostLabelProps> = memo(({ cost, style }) => (
  <span
    style={{
      color: 'var(--ice-text-secondary)',
      fontSize: 9,
      fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
      opacity: 0.7,
      pointerEvents: 'none',
      ...style,
    }}
  >
    {cost}
  </span>
));

CostLabel.displayName = 'CostLabel';

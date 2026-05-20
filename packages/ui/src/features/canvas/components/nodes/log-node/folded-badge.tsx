import React, { memo } from 'react';

interface FoldedBadgeProps {
  logCount: number;
}

export const FoldedBadge: React.FC<FoldedBadgeProps> = memo(({ logCount }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2px 8px',
      borderRadius: 4,
      background: '#22c55e22',
      border: '0.5px solid #22c55e',
      color: '#22c55e',
      fontSize: 9,
      fontWeight: 600,
      fontFamily: 'ui-monospace, monospace',
    }}
  >
    {logCount}&nbsp;logs
  </span>
));

FoldedBadge.displayName = 'FoldedBadge';

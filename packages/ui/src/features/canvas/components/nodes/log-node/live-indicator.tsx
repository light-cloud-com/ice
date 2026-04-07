import React, { memo } from 'react';

interface LiveIndicatorProps {
  isAutoScroll: boolean;
}

export const LiveIndicator: React.FC<LiveIndicatorProps> = memo(({ isAutoScroll }) => {
  if (isAutoScroll) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#22c55e',
            animation: 'pulse-opacity 1.5s ease-in-out infinite',
          }}
        />
        <span style={{ color: '#22c55e', fontSize: 8, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
          LIVE
        </span>
      </span>
    );
  }

  return (
    <span style={{ color: '#f59e0b', fontSize: 8, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
      PAUSED
    </span>
  );
});

LiveIndicator.displayName = 'LiveIndicator';

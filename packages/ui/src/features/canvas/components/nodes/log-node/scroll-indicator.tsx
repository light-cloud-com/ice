import React, { memo } from 'react';

interface ScrollIndicatorProps {
  trackHeight: number;
  scrollProgress: number;
  isAutoScroll: boolean;
}

export const ScrollIndicator: React.FC<ScrollIndicatorProps> = memo(
  ({ trackHeight, scrollProgress, isAutoScroll }) => {
    const thumbHeight = 30;

    return (
      <div
        style={{
          position: 'absolute',
          right: 2,
          top: 0,
          width: 3,
          height: trackHeight,
        }}
      >
        {/* Track */}
        <div style={{ width: '100%', height: '100%', borderRadius: 1.5, background: 'var(--ice-bg-raised)' }} />
        {/* Thumb */}
        <div
          style={{
            position: 'absolute',
            top: (1 - scrollProgress) * (trackHeight - thumbHeight),
            width: '100%',
            height: thumbHeight,
            borderRadius: 1.5,
            background: isAutoScroll ? '#22c55e' : 'var(--ice-border-strong)',
            opacity: 0.7,
          }}
        />
      </div>
    );
  },
);

ScrollIndicator.displayName = 'ScrollIndicator';

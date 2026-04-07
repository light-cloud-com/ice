import React, { memo } from 'react';

interface StatusDotProps {
  color: string;
  label?: string;
  radius?: number;
}

export const StatusDot: React.FC<StatusDotProps> = memo(({ color, label, radius = 3 }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: radius + 2 }}>
    <span
      style={{
        width: radius * 2,
        height: radius * 2,
        borderRadius: '50%',
        background: color,
        opacity: 0.9,
        flexShrink: 0,
      }}
    />
    {label && (
      <span
        style={{
          color: 'var(--ice-text-secondary)',
          fontSize: 9,
          fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
          opacity: 0.7,
          pointerEvents: 'none',
        }}
      >
        {label}
      </span>
    )}
  </span>
));

StatusDot.displayName = 'StatusDot';

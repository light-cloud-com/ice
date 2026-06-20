import React, { memo } from 'react';

interface StatusDotProps {
  color: string;
  label?: string;
  radius?: number;
  /** CNV3 — pulse the dot while work is in flight (e.g. deploying) so it reads
   *  differently from a static "active". Uses Tailwind's `animate-pulse` (a real,
   *  defined keyframe) gated on `motion-safe` so it respects reduced-motion. */
  pulse?: boolean;
}

export const StatusDot: React.FC<StatusDotProps> = memo(({ color, label, radius = 3, pulse = false }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: radius + 2 }}>
    <span
      className={pulse ? 'motion-safe:animate-pulse' : undefined}
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

import React, { memo } from 'react';

interface ScaleGaugeProps {
  min: number;
  max: number;
  /** Color applied to the track + marker. Defaults to the ICE accent. */
  color?: string;
  /** Optional caption shown right under the track (e.g. "CPU 70%"). */
  caption?: string;
}

/**
 * Horizontal "min ←→ max" gauge for blocks that auto-scale on a metric.
 * The dot floats halfway between min and max — `current` would be a
 * deploy-time value we don't have on the canvas, and pretending to know
 * it would mislead. The min/max labels frame the elasticity at a glance.
 *
 * Reused by `scalable-backend`, `ssr-site`, and `worker` since all three
 * carry the same `minInstances`/`maxInstances`/`scalingMetric` shape.
 */
export const ScaleGauge: React.FC<ScaleGaugeProps> = memo(({ min, max, color = '#3b82f6', caption }) => {
  // Clamp inputs so a misconfigured block (max < min) still renders.
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(min, max, 1);
  const range = Math.max(hi - lo, 1);
  const safeRange = range;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '6px 4px',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
            color: 'var(--ice-text-tertiary)',
            flexShrink: 0,
          }}
        >
          {lo}
        </span>
        <div
          style={{
            flex: 1,
            position: 'relative',
            height: 4,
            background: `${color}22`,
            borderRadius: 2,
          }}
        >
          {/* The active range is the entire track — we render a brighter
              segment from lo→hi and a marker dot at the midpoint. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              background: `${color}55`,
              borderRadius: 2,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: -3,
              // Marker sits at midpoint (50% of the active band). For the
              // single-instance edge case (lo == hi), still centre it.
              left: `${safeRange > 1 ? 50 : 50}%`,
              transform: 'translateX(-50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 0 2px var(--ice-bg-raised)`,
            }}
          />
        </div>
        <span
          style={{
            fontSize: 10,
            fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
            color: 'var(--ice-text-tertiary)',
            flexShrink: 0,
          }}
        >
          {hi}
        </span>
      </div>
      {caption && (
        <div
          style={{
            fontSize: 10,
            fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
            color: 'var(--ice-text-tertiary)',
            textAlign: 'center',
            opacity: 0.8,
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
});

ScaleGauge.displayName = 'ScaleGauge';

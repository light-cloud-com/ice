import React, { memo } from 'react';
import type { LogStreamStatus } from '../../../../../store/slices/logs-slice';

interface LiveIndicatorProps {
  status: LogStreamStatus;
}

// Visual spec mirrors the `pillFor` switch in
// `features/properties/components/sections/monitoring-log-section.tsx`. The
// canvas header dot and the properties panel pill must agree — see
// `ux-log-terminal-live-indicator-decoupled-from-status` in
// `.claude/state/learnings.md`.
type Tone = 'green' | 'amber' | 'grey' | 'red';

interface IndicatorSpec {
  tone: Tone;
  label: string;
  pulse: boolean;
}

function specFor(status: LogStreamStatus): IndicatorSpec {
  switch (status) {
    case 'streaming':
      return { tone: 'green', label: 'LIVE', pulse: true };
    case 'connecting':
      return { tone: 'amber', label: 'CONNECTING', pulse: false };
    case 'permission-denied':
    case 'error':
      return { tone: 'red', label: 'ERROR', pulse: false };
    case 'pre-deploy':
    case 'no-source':
    case 'ambiguous':
    case 'unsupported':
    case 'idle':
    default:
      return { tone: 'grey', label: 'IDLE', pulse: false };
  }
}

const TONE_COLOR: Record<Tone, string> = {
  green: '#22c55e',
  amber: '#f59e0b',
  grey: '#94a3b8',
  red: '#ef4444',
};

export const LiveIndicator: React.FC<LiveIndicatorProps> = memo(({ status }) => {
  const spec = specFor(status);
  const color = TONE_COLOR[spec.tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          ...(spec.pulse ? { animation: 'pulse-opacity 1.5s ease-in-out infinite' } : {}),
        }}
      />
      <span style={{ color, fontSize: 8, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>{spec.label}</span>
    </span>
  );
});

LiveIndicator.displayName = 'LiveIndicator';

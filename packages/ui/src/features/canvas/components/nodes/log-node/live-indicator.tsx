import React, { memo } from 'react';
import { t } from '../../../../../i18n';
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
      return { tone: 'green', label: t('canvas.status.live'), pulse: true };
    case 'connecting':
      return { tone: 'amber', label: t('canvas.status.connecting'), pulse: false };
    case 'permission-denied':
    case 'error':
      return { tone: 'red', label: t('canvas.status.error'), pulse: false };
    // OL6 — these non-streaming states used to collapse to a single grey "IDLE",
    // so surveying the board you couldn't tell "waiting on a deploy" from "no
    // source connected" from "pick a source" without opening the panel. Give
    // each a distinct label (tones kept grey to match the panel's `pillFor`, so
    // the canvas dot and the panel pill still agree).
    case 'pre-deploy':
      return { tone: 'grey', label: t('canvas.status.preDeploy'), pulse: false };
    case 'no-source':
      return { tone: 'grey', label: t('canvas.status.noSource'), pulse: false };
    case 'ambiguous':
      return { tone: 'grey', label: t('canvas.status.ambiguous'), pulse: false };
    case 'unsupported':
      return { tone: 'grey', label: t('canvas.status.unsupported'), pulse: false };
    case 'provider-unsupported':
      return { tone: 'grey', label: t('canvas.status.providerUnsupported'), pulse: false };
    case 'idle':
    default:
      return { tone: 'grey', label: t('canvas.status.idle'), pulse: false };
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

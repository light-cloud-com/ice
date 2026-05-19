import React, { memo } from 'react';
import { CARD_PX } from '../../../../../config/canvas-constants';
import { t } from '../../../../../i18n';
import type { NodePipelineStatus } from './types';

const FONT_MONO = "ui-monospace, 'SFMono-Regular', monospace";

// Labels are computed on each render via `statusConfigFor` so a locale
// change updates the chip text without a re-mount. Colors are
// theme-static, so the table only holds the color/label-key pair.
const STATUS_COLORS: Record<string, { color: string; labelKey: string | null }> = {
  success: { color: '#22c55e', labelKey: 'canvas.status.pipelineLive' },
  failed: { color: '#ef4444', labelKey: 'canvas.status.pipelineFailed' },
  building: { color: '#3b82f6', labelKey: 'canvas.status.pipelineBuilding' },
  deploying: { color: '#3b82f6', labelKey: 'canvas.status.pipelineDeploying' },
  queued: { color: '#f59e0b', labelKey: 'canvas.status.pipelineQueued' },
  idle: { color: '#64748b', labelKey: null },
};

function statusConfigFor(status: string): { color: string; label: string } {
  const spec = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  return { color: spec.color, label: spec.labelKey ? t(spec.labelKey) : '' };
}

interface PipelineRowProps {
  status: NodePipelineStatus;
  reducedMotion: boolean;
  onClick: (e: React.MouseEvent) => void;
}

export const PipelineRow: React.FC<PipelineRowProps> = memo(({ status, reducedMotion, onClick }) => {
  const config = statusConfigFor(status.status);
  const isActive = status.status === 'building' || status.status === 'deploying' || status.status === 'queued';
  const isComplete = status.status === 'success' || status.status === 'failed';
  const iconColor = status.status === 'success' ? '#22c55e' : status.status === 'failed' ? '#ef4444' : '#f59e0b';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: `2px ${CARD_PX}px`,
        cursor: 'pointer',
      }}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span style={{ fontSize: 10, color: iconColor }}>⚡</span>
      <span style={{ fontSize: 9, fontWeight: 600, fontFamily: FONT_MONO, color: config.color }}>{config.label}</span>

      {isActive && (
        <div
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            background: 'var(--ice-border)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${Math.max(2, status.progress || 0)}%`,
              borderRadius: 2,
              background: '#3b82f6',
              animation: !reducedMotion ? 'pulse-opacity 1.5s ease-in-out infinite' : undefined,
            }}
          />
        </div>
      )}

      {isComplete && status.commitSha && (
        <span style={{ marginLeft: 'auto', fontSize: 8, fontFamily: FONT_MONO, color: 'var(--ice-text-tertiary)' }}>
          {status.commitSha.slice(0, 7)}
        </span>
      )}
    </div>
  );
});

PipelineRow.displayName = 'PipelineRow';

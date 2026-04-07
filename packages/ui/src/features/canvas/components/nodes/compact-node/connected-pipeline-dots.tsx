import React, { memo } from 'react';
import { CARD_PX } from '../../../../../config/canvas-constants';
import type { NodePipelineStatus } from './types';

const FONT_MONO = "ui-monospace, 'SFMono-Regular', monospace";

function dotColor(status: NodePipelineStatus['status']): string {
  switch (status) {
    case 'success':
      return '#22c55e';
    case 'failed':
      return '#ef4444';
    case 'building':
    case 'deploying':
      return '#3b82f6';
    case 'queued':
      return '#f59e0b';
    default:
      return '#64748b';
  }
}

interface ConnectedPipelineDotsProps {
  statuses: NodePipelineStatus[];
}

export const ConnectedPipelineDots: React.FC<ConnectedPipelineDotsProps> = memo(({ statuses }) => {
  const liveCount = statuses.filter((p) => p.status === 'success').length;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: `0 ${CARD_PX}px`, marginBottom: 2 }}>
      {statuses.map((ps, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColor(ps.status),
            opacity: 0.9,
          }}
        />
      ))}
      {liveCount > 0 && (
        <span style={{ color: 'var(--ice-text-tertiary)', fontSize: 8, fontFamily: FONT_MONO, marginLeft: 2 }}>
          {liveCount} live
        </span>
      )}
    </div>
  );
});

ConnectedPipelineDots.displayName = 'ConnectedPipelineDots';

import React, { memo } from 'react';
import { CopyButton } from './copy-button';
import { LiveIndicator } from './live-indicator';
import { FoldButton } from '../_shared/fold-button';
import type { LogStreamStatus } from '../../../../../store/slices/logs-slice';

interface LogHeaderProps {
  label: string;
  folded: boolean;
  isHovered: boolean;
  status: LogStreamStatus;
  onToggleFold: (e: React.MouseEvent) => void;
  onCopyAll: (e: React.MouseEvent) => void;
}

export const LogHeader: React.FC<LogHeaderProps> = memo(
  ({ label, folded, isHovered, status, onToggleFold, onCopyAll }) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 8px',
        height: 32,
        background: 'var(--ice-bg-surface)',
        borderBottom: '1px solid var(--ice-border)',
        flexShrink: 0,
      }}
    >
      {/* Terminal icon */}
      <span style={{ color: '#22c55e', fontSize: 11, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>
        &gt;_
      </span>

      {/* Title */}
      <span
        style={{
          color: 'var(--ice-text-primary)',
          fontSize: 12,
          fontWeight: 500,
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label || 'Logs'}
      </span>

      {/* Stream status indicator — mirrors the properties-panel pill so the
          canvas header and the properties pill never disagree. */}
      {!folded && <LiveIndicator status={status} />}

      {/* Copy all button */}
      {!folded && isHovered && <CopyButton onClick={onCopyAll} />}

      {/* Fold button */}
      <FoldButton folded={folded} onClick={onToggleFold} opacity={isHovered ? 0.8 : 0.5} />
    </div>
  ),
);

LogHeader.displayName = 'LogHeader';

import React, { memo } from 'react';
import { LOG_COLORS } from '../../../../../config/color-palette';
import type { LogEntry } from './types';

const TERMINAL_TEXT = 'var(--ice-text-primary)';
const TERMINAL_TEXT_DIM = 'var(--ice-text-secondary)';
const FONT_MONO = "ui-monospace, 'SF Mono', monospace";

interface LogEntryRowProps {
  log: LogEntry;
  isLast: boolean;
  isCopied: boolean;
  onClick: (log: LogEntry, e: React.MouseEvent) => void;
}

export const LogEntryRow: React.FC<LogEntryRowProps> = memo(({ log, isLast, isCopied, onClick }) => {
  const levelConfig = LOG_COLORS[log.level];
  const hasBg = log.level === 'error' || log.level === 'warn';
  const msgColor = log.level === 'error' ? '#fca5a5' : log.level === 'warn' ? '#fcd34d' : TERMINAL_TEXT;

  return (
    <div
      className="log-entry"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        height: 18,
        padding: '0 4px',
        borderRadius: 2,
        cursor: 'pointer',
        background: isCopied ? 'rgba(34, 197, 94, 0.15)' : hasBg ? levelConfig.bg : 'transparent',
      }}
      onClick={(e) => onClick(log, e)}
    >
      {/* Timestamp */}
      <span style={{ color: TERMINAL_TEXT_DIM, fontSize: 10, fontFamily: FONT_MONO, flexShrink: 0, width: 60 }}>
        {log.timestamp}
      </span>

      {/* Level */}
      <span style={{ color: levelConfig.text, fontSize: 9, fontWeight: 600, fontFamily: 'ui-monospace, monospace', flexShrink: 0, width: 42 }}>
        [{levelConfig.label}]
      </span>

      {/* Message */}
      <span
        style={{
          color: msgColor,
          fontSize: 10,
          fontFamily: FONT_MONO,
          opacity: isLast ? 1 : 0.85,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {log.message}
      </span>
    </div>
  );
});

LogEntryRow.displayName = 'LogEntryRow';

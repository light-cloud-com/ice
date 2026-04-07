import React, { memo } from 'react';
import { LogEntryRow } from './log-entry-row';
import { ScrollIndicator } from './scroll-indicator';
import type { LogEntry } from './types';

interface LogContentProps {
  logAreaHeight: number;
  visibleLogs: LogEntry[];
  copiedLine: string | null;
  isAutoScroll: boolean;
  maxOffset: number;
  scrollProgress: number;
  onCopyLine: (log: LogEntry, e: React.MouseEvent) => void;
}

export const LogContent: React.FC<LogContentProps> = memo(
  ({ logAreaHeight, visibleLogs, copiedLine, isAutoScroll, maxOffset, scrollProgress, onCopyLine }) => (
    <div
      className="log-content"
      style={{
        position: 'relative',
        flex: 1,
        overflow: 'hidden',
        padding: '4px 0',
      }}
    >
      {/* Fade at top */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 4,
          right: 16,
          height: 16,
          background: 'linear-gradient(to bottom, var(--ice-bg-base), transparent)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Log entries */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visibleLogs.map((log, index) => (
          <LogEntryRow
            key={log.id}
            log={log}
            isLast={index === visibleLogs.length - 1}
            isCopied={copiedLine === log.id}
            onClick={onCopyLine}
          />
        ))}
      </div>

      {/* Scroll indicator */}
      {maxOffset > 0 && (
        <ScrollIndicator
          trackHeight={logAreaHeight - 4}
          scrollProgress={scrollProgress}
          isAutoScroll={isAutoScroll}
        />
      )}

      {/* Cursor blink at bottom */}
      {isAutoScroll && (
        <div
          style={{
            position: 'absolute',
            bottom: 2,
            left: 4,
            right: 16,
            height: 1.5,
            borderRadius: 0.5,
            background: '#22c55e',
            opacity: 0.6,
            animation: 'pulse-opacity 2s ease-in-out infinite',
          }}
        />
      )}
    </div>
  ),
);

LogContent.displayName = 'LogContent';

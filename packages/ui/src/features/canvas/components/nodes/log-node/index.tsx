/**
 * SVG Log Node Component
 *
 * Terminal-style node with streaming logs.
 * Orchestrates header, log content, and folded badge sub-components.
 */

import React, { memo, useState, useCallback, useEffect, useRef } from 'react';
import { FoldedBadge } from './folded-badge';
import { LogContent } from './log-content';
import { SAMPLE_MESSAGES, generateTimestamp } from './log-data';
import { LogHeader } from './log-header';
import { CORNER_RADIUS } from '../../../../../config/canvas-constants';
import { useReducedMotion } from '../../../../../shared/hooks/use-reduced-motion';
import type { SvgLogNodeProps, LogEntry } from './types';

export const SvgLogNode: React.FC<SvgLogNodeProps> = memo(({ node, isSelected, onToggleFold }) => {
  const reducedMotion = useReducedMotion();
  const { x, y, width, height, data, label } = node;
  const [isHovered, setIsHovered] = useState(false);
  const [folded, setFolded] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [copiedLine, setCopiedLine] = useState<string | null>(null);
  const logIdRef = useRef(0);

  const serviceName = (data.serviceName as string) || (label || '').toLowerCase().replace(/\s+/g, '-') || 'default';
  const serviceMessages = SAMPLE_MESSAGES[serviceName as keyof typeof SAMPLE_MESSAGES] || SAMPLE_MESSAGES.default;

  // Dimensions
  const headerHeight = 32;
  const nodeWidth = Math.max(width || 400, 320);
  const nodeHeight = folded ? headerHeight : Math.max(height || 240, 160);
  const logAreaHeight = nodeHeight - headerHeight - 8;
  const lineHeight = 18;
  const maxVisibleLogs = Math.floor(logAreaHeight / lineHeight);

  // Generate streaming logs
  useEffect(() => {
    if (folded) return;

    const historicalLogs: LogEntry[] = [];
    const totalHistoricalLogs = maxVisibleLogs + 20;
    let secondsAgo = 180 + Math.floor(Math.random() * 120);

    for (let i = 0; i < totalHistoricalLogs; i++) {
      const msgIndex = Math.floor(Math.random() * serviceMessages.length);
      const msg = serviceMessages[msgIndex];
      historicalLogs.push({
        id: `log-${logIdRef.current++}`,
        timestamp: generateTimestamp(secondsAgo),
        level: msg.level as LogEntry['level'],
        service: serviceName.substring(0, 12),
        message: msg.message,
      });
      secondsAgo -= Math.floor(Math.random() * 13) + 2;
      if (secondsAgo < 0) secondsAgo = 0;
    }

    historicalLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    setLogs(historicalLogs);
    setScrollOffset(0);
    setIsAutoScroll(true);

    const interval = setInterval(
      () => {
        const msgIndex = Math.floor(Math.random() * serviceMessages.length);
        const msg = serviceMessages[msgIndex];
        setLogs((prev) => {
          const newLog: LogEntry = {
            id: `log-${logIdRef.current++}`,
            timestamp: generateTimestamp(0),
            level: msg.level as LogEntry['level'],
            service: serviceName.substring(0, 12),
            message: msg.message,
          };
          const newLogs = [...prev, newLog];
          return newLogs.length > 200 ? newLogs.slice(-200) : newLogs;
        });
      },
      1500 + Math.random() * 2000,
    );

    return () => clearInterval(interval);
  }, [folded, serviceName, serviceMessages, maxVisibleLogs]);

  // Auto-scroll
  useEffect(() => {
    if (isAutoScroll) setScrollOffset(0);
  }, [logs.length, isAutoScroll]);

  const handleToggleFold = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setFolded(!folded);
      onToggleFold?.(node.id);
    },
    [folded, node.id, onToggleFold],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.stopPropagation();
      const maxOffset = Math.max(0, logs.length - maxVisibleLogs);
      setScrollOffset((prev) => {
        const newOffset = prev + (e.deltaY > 0 ? -1 : 1);
        const clamped = Math.max(-maxOffset, Math.min(0, newOffset));
        setIsAutoScroll(clamped === 0);
        return clamped;
      });
    },
    [logs.length, maxVisibleLogs],
  );

  const handleCopyAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const text = logs.map((l) => `${l.timestamp} [${l.level.toUpperCase()}] ${l.message}`).join('\n');
      navigator.clipboard.writeText(text).catch(() => {});
    },
    [logs],
  );

  const handleCopyLine = useCallback((log: LogEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedLine(log.id);
    setTimeout(() => setCopiedLine(null), 1000);
  }, []);

  // Visible logs
  const startIndex = Math.max(0, logs.length - maxVisibleLogs + scrollOffset);
  const visibleLogs = logs.slice(startIndex, startIndex + maxVisibleLogs);

  // Scroll progress
  const totalLogs = logs.length;
  const maxOffset = Math.max(0, totalLogs - maxVisibleLogs);
  const scrollProgress = maxOffset > 0 ? (maxOffset + scrollOffset) / maxOffset : 1;

  return (
    <g
      className="svg-log-node"
      data-node-id={node.id}
      style={{ cursor: 'move' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onWheel={handleWheel as unknown as React.WheelEventHandler<SVGGElement>}
    >
      {/* HTML card */}
      <foreignObject x={x} y={y} width={nodeWidth} height={nodeHeight}>
        <div
          style={{
            width: nodeWidth,
            height: nodeHeight,
            background: 'var(--ice-bg-base)',
            border: `1px solid ${isSelected || isHovered ? '#22c55e' : '#22c55e55'}`,
            borderRadius: CORNER_RADIUS,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            overflow: 'hidden',
            boxShadow: isSelected
              ? '0 0 0 1.5px #22c55e, 0 4px 14px -4px rgba(34, 197, 94, 0.2)'
              : isHovered
                ? '0 2px 8px -2px rgba(0,0,0,0.15)'
                : '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <LogHeader
            label={label || ''}
            folded={folded}
            isHovered={isHovered}
            isAutoScroll={isAutoScroll}
            onToggleFold={handleToggleFold}
            onCopyAll={handleCopyAll}
          />

          {!folded && (
            <LogContent
              logAreaHeight={logAreaHeight}
              visibleLogs={visibleLogs}
              copiedLine={copiedLine}
              isAutoScroll={isAutoScroll}
              maxOffset={maxOffset}
              scrollProgress={scrollProgress}
              onCopyLine={handleCopyLine}
            />
          )}

          {folded && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', flex: 1 }}>
              <FoldedBadge logCount={logs.length} />
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  );
});

SvgLogNode.displayName = 'SvgLogNode';

// ─── Re-exports ────────────────────────────────────────────────────────────

export type { SvgLogNodeProps, LogEntry } from './types';

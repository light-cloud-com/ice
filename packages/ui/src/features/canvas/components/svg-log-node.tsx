/**
 * SVG Log Node Component
 *
 * Terminal-style node with streaming logs.
 * Features:
 * - Color-coded log levels (info, warn, error, debug)
 * - Manual scroll with mouse wheel
 * - Auto-scroll when at bottom, pause when scrolled up
 * - Copy all logs button
 * - Copy single line on click
 * - Fold/unfold
 */

import React, { memo, useState, useCallback, useEffect, useRef } from 'react';
import { CORNER_RADIUS } from '../../../config/canvas-constants';
import { LOG_COLORS } from '../../../config/color-palette';
import type { CanvasNode } from './svg-canvas';

interface SvgLogNodeProps {
  node: CanvasNode;
  isSelected: boolean;
  onToggleFold?: (nodeId: string) => void;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  service: string;
  message: string;
}

// Terminal colors
const TERMINAL = {
  bg: 'var(--ice-bg-base)',
  headerBg: 'var(--ice-bg-surface)',
  border: 'var(--ice-border)',
  text: 'var(--ice-text-primary)',
  textDim: 'var(--ice-text-secondary)',
  cursor: '#22c55e',
};

// Sample log messages
const SAMPLE_MESSAGES: Record<string, Array<{ level: string; message: string }>> = {
  'order-service': [
    { level: 'info', message: 'Processing order #ORD-2847291' },
    { level: 'info', message: 'Inventory check passed for SKU-8821' },
    { level: 'info', message: 'Payment authorized via Stripe' },
    { level: 'warn', message: 'High latency detected: 245ms' },
    { level: 'info', message: 'Order confirmed, sending to fulfillment' },
    { level: 'debug', message: 'Cache hit for product catalog' },
    { level: 'error', message: 'Failed to update inventory: timeout' },
    { level: 'info', message: 'Retry successful for inventory update' },
  ],
  'payment-service': [
    { level: 'info', message: 'Initiating payment for $127.99' },
    { level: 'debug', message: 'Stripe API call started' },
    { level: 'info', message: 'Card ending in 4242 authorized' },
    { level: 'info', message: 'Transaction ID: txn_3Nk8sH2eZvKY' },
    { level: 'warn', message: 'Rate limit approaching: 85%' },
    { level: 'error', message: '3DS authentication required' },
    { level: 'info', message: 'Refund processed: $24.99' },
  ],
  default: [
    { level: 'info', message: 'Service started successfully' },
    { level: 'info', message: 'Health check passed' },
    { level: 'debug', message: 'Configuration loaded' },
    { level: 'info', message: 'Connected to database' },
    { level: 'warn', message: 'Memory usage at 75%' },
    { level: 'info', message: 'Processing request...' },
  ],
};

function generateTimestamp(secondsAgo: number = 0): string {
  const now = new Date();
  now.setSeconds(now.getSeconds() - secondsAgo);
  return now.toISOString().split('T')[1].split('.')[0];
}

export const SvgLogNode: React.FC<SvgLogNodeProps> = memo(({ node, isSelected, onToggleFold }) => {
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
          // Keep max 200 logs
          return newLogs.length > 200 ? newLogs.slice(-200) : newLogs;
        });
      },
      1500 + Math.random() * 2000,
    );

    return () => clearInterval(interval);
  }, [folded, serviceName, serviceMessages, maxVisibleLogs]);

  // Auto-scroll: when new logs arrive and at bottom, reset offset
  useEffect(() => {
    if (isAutoScroll) {
      setScrollOffset(0);
    }
  }, [logs.length, isAutoScroll]);

  // Handle fold
  const handleToggleFold = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setFolded(!folded);
      onToggleFold?.(node.id);
    },
    [folded, node.id, onToggleFold],
  );

  // Handle scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.stopPropagation();
      const totalLogs = logs.length;
      const maxOffset = Math.max(0, totalLogs - maxVisibleLogs);

      setScrollOffset((prev) => {
        const newOffset = prev + (e.deltaY > 0 ? -1 : 1);
        const clamped = Math.max(-maxOffset, Math.min(0, newOffset));

        // If scrolled to bottom, re-enable auto-scroll
        if (clamped === 0) {
          setIsAutoScroll(true);
        } else {
          setIsAutoScroll(false);
        }

        return clamped;
      });
    },
    [logs.length, maxVisibleLogs],
  );

  // Copy all logs
  const handleCopyAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const text = logs.map((l) => `${l.timestamp} [${l.level.toUpperCase()}] ${l.message}`).join('\n');
      navigator.clipboard.writeText(text).catch(() => {});
    },
    [logs],
  );

  // Copy single line
  const handleCopyLine = useCallback((log: LogEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedLine(log.id);
    setTimeout(() => setCopiedLine(null), 1000);
  }, []);

  // Visible logs based on scroll
  const startIndex = Math.max(0, logs.length - maxVisibleLogs + scrollOffset);
  const visibleLogs = logs.slice(startIndex, startIndex + maxVisibleLogs);

  // Scroll indicator
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
      {/* Selection indicator */}
      {isSelected && (
        <rect
          x={x - 3}
          y={y - 3}
          width={nodeWidth + 6}
          height={nodeHeight + 6}
          rx={CORNER_RADIUS + 3}
          fill="none"
          stroke="#22c55e"
          strokeWidth={2}
          strokeDasharray="6 3"
        />
      )}

      {/* Terminal background */}
      <rect
        x={x}
        y={y}
        width={nodeWidth}
        height={nodeHeight}
        rx={CORNER_RADIUS}
        fill={TERMINAL.bg}
        stroke={isSelected ? '#22c55e' : isHovered ? '#4ade80' : TERMINAL.border}
        strokeWidth={isSelected ? 2 : 1}
      />

      {/* Header */}
      <defs>
        <clipPath id={`log-shape-${node.id}`}>
          <rect x={x} y={y} width={nodeWidth} height={nodeHeight} rx={CORNER_RADIUS} />
        </clipPath>
      </defs>
      <rect
        x={x}
        y={y}
        width={nodeWidth}
        height={headerHeight}
        fill={TERMINAL.headerBg}
        clipPath={`url(#log-shape-${node.id})`}
      />
      <line
        x1={x}
        y1={y + headerHeight}
        x2={x + nodeWidth}
        y2={y + headerHeight}
        stroke={TERMINAL.border}
        strokeWidth={1}
      />

      {/* Terminal icon */}
      <text
        x={x + 12}
        y={y + 17}
        dominantBaseline="middle"
        fill="#22c55e"
        fontSize="11"
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
      >
        &gt;_
      </text>

      {/* Title */}
      <text
        x={x + 36}
        y={y + 17}
        dominantBaseline="middle"
        fill={TERMINAL.text}
        fontSize="12"
        fontWeight="500"
        fontFamily="ui-monospace, 'SF Mono', monospace"
      >
        {label || 'Logs'}
      </text>

      {/* Copy all button */}
      {!folded && isHovered && (
        <g style={{ cursor: 'pointer' }} onClick={handleCopyAll}>
          <rect
            x={x + nodeWidth - 70}
            y={y + 7}
            width={42}
            height={18}
            rx={4}
            fill="var(--ice-border-strong)"
            opacity={0.8}
          />
          <text
            x={x + nodeWidth - 49}
            y={y + 17}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--ice-text-tertiary)"
            fontSize="9"
            fontWeight="600"
            fontFamily="ui-monospace, monospace"
          >
            COPY
          </text>
        </g>
      )}

      {/* Fold button */}
      <g style={{ cursor: 'pointer' }} onClick={handleToggleFold} opacity={isHovered ? 0.8 : 0.5}>
        <rect x={x + nodeWidth - 24} y={y + 7} width={18} height={18} fill="transparent" />
        {folded ? (
          <path
            d={`M ${x + nodeWidth - 18} ${y + 12} l 5 4 -5 4`}
            fill="none"
            stroke="var(--ice-text-tertiary)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d={`M ${x + nodeWidth - 19} ${y + 14} l 4 4 4 -4`}
            fill="none"
            stroke="var(--ice-text-tertiary)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </g>

      {/* Live indicator */}
      {!folded && isAutoScroll && (
        <g className="live-indicator">
          <circle cx={x + nodeWidth - 88} cy={y + 16} r={3} fill="#22c55e">
            <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <text
            x={x + nodeWidth - 80}
            y={y + 17}
            dominantBaseline="middle"
            fill="#22c55e"
            fontSize="8"
            fontWeight="600"
            fontFamily="ui-monospace, monospace"
          >
            LIVE
          </text>
        </g>
      )}

      {/* Paused indicator */}
      {!folded && !isAutoScroll && (
        <text
          x={x + nodeWidth - 88}
          y={y + 17}
          dominantBaseline="middle"
          fill="#f59e0b"
          fontSize="8"
          fontWeight="600"
          fontFamily="ui-monospace, monospace"
        >
          PAUSED
        </text>
      )}

      {/* Log content */}
      {!folded && (
        <g className="log-content">
          <defs>
            <clipPath id={`log-clip-${node.id}`}>
              <rect x={x + 4} y={y + headerHeight + 2} width={nodeWidth - 16} height={logAreaHeight} />
            </clipPath>
          </defs>

          <g clipPath={`url(#log-clip-${node.id})`}>
            {visibleLogs.map((log, index) => {
              const logY = y + headerHeight + 6 + index * lineHeight;
              const levelConfig = LOG_COLORS[log.level];
              const isCopied = copiedLine === log.id;

              return (
                <g
                  key={log.id}
                  className="log-entry"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => handleCopyLine(log, e)}
                >
                  {/* Line background for errors/warnings */}
                  {(log.level === 'error' || log.level === 'warn') && (
                    <rect
                      x={x + 4}
                      y={logY - 1}
                      width={nodeWidth - 16}
                      height={lineHeight}
                      fill={levelConfig.bg}
                      rx={2}
                    />
                  )}

                  {/* Copied feedback */}
                  {isCopied && (
                    <rect
                      x={x + 4}
                      y={logY - 1}
                      width={nodeWidth - 16}
                      height={lineHeight}
                      fill="#22c55e"
                      opacity={0.15}
                      rx={2}
                    />
                  )}

                  {/* Timestamp */}
                  <text
                    x={x + 8}
                    y={logY + 10}
                    fill={TERMINAL.textDim}
                    fontSize="10"
                    fontFamily="ui-monospace, 'SF Mono', monospace"
                  >
                    {log.timestamp}
                  </text>

                  {/* Level */}
                  <text
                    x={x + 78}
                    y={logY + 10}
                    fill={levelConfig.text}
                    fontSize="9"
                    fontWeight="600"
                    fontFamily="ui-monospace, monospace"
                  >
                    [{levelConfig.label}]
                  </text>

                  {/* Message */}
                  <text
                    x={x + 130}
                    y={logY + 10}
                    fill={log.level === 'error' ? '#fca5a5' : log.level === 'warn' ? '#fcd34d' : TERMINAL.text}
                    fontSize="10"
                    fontFamily="ui-monospace, 'SF Mono', monospace"
                    opacity={index === visibleLogs.length - 1 ? 1 : 0.85}
                  >
                    {log.message.length > 38 ? log.message.substring(0, 38) + '...' : log.message}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Fade at top */}
          <defs>
            <linearGradient id={`fade-top-${node.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TERMINAL.bg} stopOpacity="1" />
              <stop offset="100%" stopColor={TERMINAL.bg} stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect
            x={x + 4}
            y={y + headerHeight + 2}
            width={nodeWidth - 16}
            height={16}
            fill={`url(#fade-top-${node.id})`}
            pointerEvents="none"
          />

          {/* Scroll indicator bar (right side) */}
          {maxOffset > 0 && (
            <g>
              <rect
                x={x + nodeWidth - 6}
                y={y + headerHeight + 4}
                width={3}
                height={logAreaHeight - 4}
                rx={1.5}
                fill="var(--ice-bg-raised)"
              />
              <rect
                x={x + nodeWidth - 6}
                y={y + headerHeight + 4 + (1 - scrollProgress) * (logAreaHeight - 4 - 30)}
                width={3}
                height={30}
                rx={1.5}
                fill={isAutoScroll ? '#22c55e' : 'var(--ice-border-strong)'}
                opacity={0.7}
              />
            </g>
          )}

          {/* Cursor blink at bottom */}
          {isAutoScroll && (
            <rect
              x={x + 4}
              y={y + nodeHeight - 5}
              width={nodeWidth - 16}
              height={1.5}
              fill={TERMINAL.cursor}
              rx={0.5}
              opacity={0.6}
            >
              <animate attributeName="opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
            </rect>
          )}
        </g>
      )}

      {/* Folded badge */}
      {folded && (
        <g>
          <rect
            x={x + nodeWidth - 80}
            y={y + 7}
            width={70}
            height={18}
            rx={4}
            fill="#22c55e22"
            stroke="#22c55e"
            strokeWidth={0.5}
          />
          <text
            x={x + nodeWidth - 45}
            y={y + 16}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#22c55e"
            fontSize="9"
            fontWeight="600"
            fontFamily="ui-monospace, monospace"
          >
            {logs.length} logs
          </text>
        </g>
      )}
    </g>
  );
});

SvgLogNode.displayName = 'SvgLogNode';

export default SvgLogNode;

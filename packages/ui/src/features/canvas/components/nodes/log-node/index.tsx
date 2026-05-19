/**
 * SVG Log Node Component
 *
 * Terminal-style node tailing Cloud Logging output for the Compute /
 * Database block it's connected to. Subscribes via `useLogStream` (LT-5),
 * which manages the HTTP subscribe + Socket.IO room lifecycle. Renders
 * either the live entries or a status-driven placeholder row.
 *
 * Pure UI state (scroll, autoscroll, copy feedback, fold) stays local;
 * data state (entries, status, source, lastError) comes from the hook.
 */

import React, { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { FoldedBadge } from './folded-badge';
import { LogContent } from './log-content';
import { LogHeader } from './log-header';
import { useLogStream } from '../../../../../shared/hooks/use-log-stream';
import type { LogStreamStatus, LogEntry as StreamLogEntry } from '../../../../../store/slices/logs-slice';
import { CORNER_RADIUS } from '../../../../../config/canvas-constants';
import { t } from '../../../../../i18n';
import { ConnectionDragGlow } from '../_shared/connection-drag-glow';
import { ConnectionPorts } from '../_shared/connection-ports';
import { useIsNodeOrphan } from '../_shared/orphan-context';
import type { SvgLogNodeProps, LogEntry } from './types';

// Map a Cloud Logging level onto the row component's level. Cloud Logging
// has 'notice' between info and warn; the row only knows info/warn/error/
// debug, so notice collapses into info for v1.
function mapLevel(level: StreamLogEntry['level']): LogEntry['level'] {
  if (level === 'notice') return 'info';
  return level;
}

// HH:MM:SS only — the LogEntryRow's timestamp column is sized for that.
function formatTs(ts: string): string {
  // Defensive: if `ts` isn't a well-formed ISO string, fall back to it
  // verbatim so the row still renders.
  if (!ts || typeof ts !== 'string') return '';
  const tIdx = ts.indexOf('T');
  if (tIdx < 0) return ts.slice(0, 8);
  const after = ts.slice(tIdx + 1);
  const dotIdx = after.indexOf('.');
  return dotIdx > 0 ? after.slice(0, dotIdx) : after.slice(0, 8);
}

function placeholderText(status: LogStreamStatus, lastError: string | null): string {
  switch (status) {
    case 'pre-deploy':
      return t('canvas.logNode.preDeploy');
    case 'no-source':
      return t('canvas.logNode.noSource');
    case 'ambiguous':
      return t('canvas.logNode.ambiguous');
    case 'unsupported':
      return t('canvas.logNode.unsupported');
    case 'permission-denied':
      return lastError || t('canvas.logNode.permissionDenied');
    case 'error':
      return lastError || t('canvas.logNode.error');
    case 'connecting':
      return t('canvas.logNode.connecting');
    case 'idle':
      return t('canvas.logNode.idle');
    default:
      return '';
  }
}

export const SvgLogNode: React.FC<SvgLogNodeProps> = memo(({
  node,
  isSelected,
  onToggleFold,
  connectionDragState = null,
}) => {
  const { x, y, width, height, data, label } = node;
  const [isHovered, setIsHovered] = useState(false);
  const [folded, setFolded] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [copiedLine, setCopiedLine] = useState<string | null>(null);
  const lastEntryCountRef = useRef(0);

  const isSource = connectionDragState === 'source';
  const isValidTarget = connectionDragState === 'valid-target';
  const isInvalidTarget = connectionDragState === 'invalid-target';
  // Hide the orphan border while any drag is in progress so the
  // amber dashed ring doesn't compete with the green/red drop signal.
  const isOrphan = useIsNodeOrphan(node.id) && connectionDragState === null;
  const portOpacity = isInvalidTarget
    ? 0.12
    : isHovered || isSelected || isValidTarget || isSource
      ? 1
      : 0.35;

  // ── Live data via the LT-5 hook ─────────────────────────────────────
  // The hook manages subscribe → room-join → unsubscribe and dispatches
  // appendEntry on every `logs:entry`. We only consume the slice state.
  const { entries, status, lastError } = useLogStream(node.id);

  // ── Dimensions ──────────────────────────────────────────────────────
  const headerHeight = 32;
  const nodeWidth = Math.max(width || 400, 320);
  const nodeHeight = folded ? headerHeight : Math.max(height || 240, 160);
  const logAreaHeight = nodeHeight - headerHeight - 8;
  const lineHeight = 18;
  const maxVisibleLogs = Math.floor(logAreaHeight / lineHeight);

  // ── Map stream entries → LogEntryRow shape ──────────────────────────
  // The row component takes { id, timestamp, level, service, message }.
  // service is truncated to 12 chars to fit the existing column width.
  const serviceName = ((data?.label as string) || (label as string) || 'logs').slice(0, 12);

  const logs = useMemo<LogEntry[]>(
    () =>
      entries.map((e) => ({
        id: e.insertId,
        timestamp: formatTs(e.ts),
        level: mapLevel(e.level),
        service: serviceName,
        message: e.message,
      })),
    [entries, serviceName],
  );

  // ── Auto-scroll on new entries ──────────────────────────────────────
  // Only snap to bottom when entries actually grew (not on a re-render
  // that didn't add anything), so the user's manual scroll position is
  // preserved across unrelated re-renders.
  useEffect(() => {
    if (entries.length !== lastEntryCountRef.current) {
      lastEntryCountRef.current = entries.length;
      if (isAutoScroll) setScrollOffset(0);
    }
  }, [entries.length, isAutoScroll]);

  // ── Status placeholder row ─────────────────────────────────────────
  // For any non-streaming status (or streaming but empty), surface a
  // single muted row inside the LogContent container. This is the only
  // UX affordance for permission/source/connectivity errors — the user's
  // standing rule (`feedback_no_canvas_inputs`) keeps it non-interactive.
  const showPlaceholder = entries.length === 0 && status !== 'streaming';
  const placeholder = showPlaceholder
    ? ([
        {
          id: `placeholder-${status}`,
          timestamp: '',
          level: 'debug',
          service: serviceName,
          message: placeholderText(status, lastError),
        },
      ] as LogEntry[])
    : null;

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

  // Visible logs (or single placeholder row when there's nothing live yet)
  const renderRows = placeholder ?? logs;
  const startIndex = Math.max(0, renderRows.length - maxVisibleLogs + scrollOffset);
  const visibleLogs = renderRows.slice(startIndex, startIndex + maxVisibleLogs);

  // Scroll progress (placeholder is single-row, so always pinned)
  const totalLogs = renderRows.length;
  const maxOffset = Math.max(0, totalLogs - maxVisibleLogs);
  const scrollProgress = maxOffset > 0 ? (maxOffset + scrollOffset) / maxOffset : 1;

  return (
    <g
      className="svg-log-node"
      data-node-id={node.id}
      data-ice-type={(node.data?.iceType as string) || ''}
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
            status={status}
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
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', flex: 1 }}
            >
              <FoldedBadge logCount={logs.length} />
            </div>
          )}
        </div>
      </foreignObject>
      {isValidTarget && <ConnectionDragGlow x={x} y={y} width={nodeWidth} height={nodeHeight} />}
      {isInvalidTarget && (
        <rect
          x={x - 3}
          y={y - 3}
          width={nodeWidth + 6}
          height={nodeHeight + 6}
          rx={CORNER_RADIUS + 3}
          fill="none"
          stroke="#ef4444"
          strokeWidth={2}
          strokeDasharray="4 3"
          opacity={0.85}
          pointerEvents="none"
        />
      )}
      {isOrphan && (
        <rect
          x={x - 2}
          y={y - 2}
          width={nodeWidth + 4}
          height={nodeHeight + 4}
          rx={CORNER_RADIUS + 2}
          fill="none"
          stroke="#d97706"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          opacity={0.6}
          pointerEvents="none"
        />
      )}
      <ConnectionPorts
        nodeId={node.id}
        x={x}
        y={y}
        width={nodeWidth}
        height={nodeHeight}
        color="#22c55e"
        isValidTarget={isValidTarget}
        opacity={portOpacity}
      />
    </g>
  );
});

SvgLogNode.displayName = 'SvgLogNode';

// ─── Re-exports ────────────────────────────────────────────────────────────

export type { SvgLogNodeProps, LogEntry } from './types';

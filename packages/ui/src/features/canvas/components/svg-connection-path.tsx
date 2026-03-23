/**
 * SVG Connection Path Component
 *
 * Clean bezier curves between nodes:
 * - Default: very subtle thin lines (1px, low opacity)
 * - Hover: brighter line, no animated dots
 * - Arrow markers (small)
 * - Edge labels for protocol/port info
 * - Delete button on hover
 */

import React, { memo, useMemo, useState, useCallback, useRef } from 'react';
import {
  inferConnectionMeta,
  CATEGORY_LABELS,
  type ConnectionCategory,
} from '../utils/connection-rules';
import type { CanvasNode, CanvasConnection } from './svg-canvas';

// ─── Tooltip info passed up to canvas ───────────────────────────────────────

export interface ConnectionTooltipInfo {
  connectionId: string;
  mouseX: number;
  mouseY: number;
  fromLabel: string;
  toLabel: string;
  relationship: string;
  port?: string;
  protocol?: string;
  bundleCount: number;
  latency?: string;
  throughput?: string;
  bandwidth?: string;
  securityRule?: string;
}

interface SvgConnectionPathProps {
  connection: CanvasConnection;
  nodes: CanvasNode[];
  allNodes?: CanvasNode[];
  isSelected: boolean;
  isHighlighted?: boolean;
  direction?: 'incoming' | 'outgoing' | null;
  sourcePortIndex?: number;
  sourcePortCount?: number;
  targetPortIndex?: number;
  targetPortCount?: number;
  onConnectionHover?: (info: ConnectionTooltipInfo | null) => void;
  /** Delete this edge */
  onDelete?: (connectionId: string) => void;
  /** Select this edge */
  onSelect?: (connectionId: string) => void;
  /** Right-click on this edge */
  onContextMenu?: (connectionId: string, position: { x: number; y: number }) => void;
  /** When true, shows a flowing animation on the edge (pipeline deploying) */
  pipelineActive?: boolean;
  /** Level of detail: 3=full, 2=compact, 1=iconic */
  lod?: number;
}

// Edge colors by relationship type
export const EDGE_COLORS: Record<string, string> = {
  default: '#475569',
  selected: '#3b82f6',
  hover: '#60a5fa',
  depends_on: '#f59e0b',
  connects_to: '#22c55e',
  references: '#8b5cf6',
  logs_to: '#22c55e',
  bundled: '#60a5fa',
  outgoing: '#22d3ee',
  incoming: '#f97316',
};

// =============================================================================
// Bezier Curve Routing
// =============================================================================

type Side = 'left' | 'right' | 'top' | 'bottom';
interface Point {
  x: number;
  y: number;
}

function chooseSides(from: CanvasNode, to: CanvasNode): { exitSide: Side; entrySide: Side } {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { exitSide: 'right', entrySide: 'left' } : { exitSide: 'left', entrySide: 'right' };
  }
  return dy > 0 ? { exitSide: 'bottom', entrySide: 'top' } : { exitSide: 'top', entrySide: 'bottom' };
}

function getEdgePoint(node: CanvasNode, side: Side, portIndex = 0, portCount = 1): Point {
  const r = (portIndex + 1) / (portCount + 1);
  switch (side) {
    case 'left':
      return { x: node.x, y: node.y + node.height * r };
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height * r };
    case 'top':
      return { x: node.x + node.width * r, y: node.y };
    case 'bottom':
      return { x: node.x + node.width * r, y: node.y + node.height };
  }
}

function buildBezierPath(
  start: Point,
  end: Point,
  exitSide: Side,
  entrySide: Side,
): { pathD: string; midX: number; midY: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(Math.max(dist * 0.35, 40), 200);

  const cp1 = getControlPoint(start, exitSide, offset);
  const cp2 = getControlPoint(end, entrySide, offset);

  const pathD = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;

  const midX = 0.125 * start.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * end.x;
  const midY = 0.125 * start.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * end.y;

  return { pathD, midX, midY };
}

function getControlPoint(point: Point, side: Side, offset: number): Point {
  switch (side) {
    case 'left':
      return { x: point.x - offset, y: point.y };
    case 'right':
      return { x: point.x + offset, y: point.y };
    case 'top':
      return { x: point.x, y: point.y - offset };
    case 'bottom':
      return { x: point.x, y: point.y + offset };
  }
}

// =============================================================================
// Component
// =============================================================================

export const SvgConnectionPath: React.FC<SvgConnectionPathProps> = memo(
  ({
    connection,
    nodes,
    allNodes: _allNodes = [],
    isSelected,
    isHighlighted = false,
    direction = null,
    sourcePortIndex = 0,
    sourcePortCount = 1,
    targetPortIndex = 0,
    targetPortCount = 1,
    onConnectionHover,
    onDelete,
    onSelect,
    onContextMenu: onEdgeContextMenu,
    pipelineActive = false,
    lod = 3,
  }) => {
    const [isHover, setIsHover] = useState(false);
    const isActive = isSelected || isHighlighted;
    const gRef = useRef<SVGGElement>(null);

    const relationship = useMemo(() => {
      return (connection.data?.relationship as string) || 'default';
    }, [connection]);

    // Derive smart connection metadata from connected node iceTypes when not
    // explicitly stored on the edge. This makes existing edges render with
    // the correct visual style and env var label without needing data migration.
    const fromNode = useMemo(() => nodes.find((n) => n.id === connection.from), [nodes, connection.from]);
    const toNode = useMemo(() => nodes.find((n) => n.id === connection.to), [nodes, connection.to]);

    const derivedMeta = useMemo(() => {
      const srcType = (fromNode?.data?.iceType as string) || '';
      const tgtType = (toNode?.data?.iceType as string) || '';
      if (!srcType && !tgtType) return null;
      return inferConnectionMeta(srcType, tgtType);
    }, [fromNode, toNode]);

    const connCategory = (connection.data?.connectionCategory as ConnectionCategory) || derivedMeta?.category || null;
    const lineStyle = (connection.data?.lineStyle as string) || derivedMeta?.lineStyle || null;
    const derivedEnvVar = (connection.data?.envVarName as string) || derivedMeta?.envVarName || null;
    const categoryColor = (connection.data?.color as string) || derivedMeta?.color || null;
    const trafficType = (connection.data?.trafficType as string) || derivedMeta?.trafficType || null;
    const isLogEdge = relationship === 'logs_to' || trafficType === 'stream';
    const isDashedEdge = lineStyle === 'dashed' || isLogEdge;
    const isDottedEdge = lineStyle === 'dotted';
    const isThinEdge = lineStyle === 'thin';
    const hasArrow = false; // Arrows removed — line style communicates connection type
    const bundleCount = (connection.data?.bundleCount as number) || 0;

    const buildTooltip = useCallback(
      (mouseX: number, mouseY: number): ConnectionTooltipInfo => {
        const d = connection.data || {};
        return {
          connectionId: connection.id,
          mouseX,
          mouseY,
          fromLabel: fromNode?.label || connection.from,
          toLabel: toNode?.label || connection.to,
          relationship,
          port: d.port != null ? String(d.port) : undefined,
          protocol: d.protocol != null ? String(d.protocol) : undefined,
          bundleCount: bundleCount || 1,
          latency: d.latency != null ? String(d.latency) : undefined,
          throughput: d.throughput != null ? String(d.throughput) : undefined,
          bandwidth: d.bandwidth != null ? String(d.bandwidth) : undefined,
          securityRule: d.securityRule != null ? String(d.securityRule) : undefined,
        };
      },
      [connection, fromNode, toNode, relationship, bundleCount],
    );

    const handleMouseEnter = useCallback(() => {
      setIsHover(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
      setIsHover(false);
      onConnectionHover?.(null);
    }, [onConnectionHover]);

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (!onConnectionHover) return;
        onConnectionHover(buildTooltip(e.clientX, e.clientY));
      },
      [onConnectionHover, buildTooltip],
    );

    // Calculate bezier path
    const pathData = useMemo(() => {
      if (!fromNode || !toNode) return null;
      const { exitSide, entrySide } = chooseSides(fromNode, toNode);
      const start = getEdgePoint(fromNode, exitSide, sourcePortIndex, sourcePortCount);
      const end = getEdgePoint(toNode, entrySide, targetPortIndex, targetPortCount);
      return buildBezierPath(start, end, exitSide, entrySide);
    }, [fromNode, toNode, sourcePortIndex, sourcePortCount, targetPortIndex, targetPortCount]);

    if (!pathData) return null;

    const { pathD, midX, midY } = pathData;

    // Styling — subtle by default, just brighten on hover
    const directionColor = direction ? EDGE_COLORS[direction] : null;
    // Use category color as the base, fall back to relationship color
    const baseColor = categoryColor || EDGE_COLORS[relationship] || EDGE_COLORS.default;
    const strokeColor = isSelected
      ? EDGE_COLORS.selected
      : isHighlighted
        ? directionColor || baseColor || EDGE_COLORS.hover
        : isHover
          ? EDGE_COLORS.hover
          : baseColor;

    const baseWidth = isThinEdge ? 0.6 : 1;
    const strokeWidth = lod <= 1 ? 0.5 : isSelected ? 2.5 : isHover || isHighlighted ? 2 : lod <= 2 ? 0.8 : baseWidth;
    const strokeOpacity =
      lod <= 1
        ? 0.3
        : isSelected
          ? 0.7
          : isHighlighted
            ? 0.6
            : isHover
              ? 0.7
              : lod <= 2
                ? 0.25
                : isThinEdge
                  ? 0.12
                  : 0.15;
    const showLabels = lod >= 3;
    const showArrow = lod >= 2 && hasArrow;

    const markerId = `arrow-${connection.id.replace(/[^a-zA-Z0-9]/g, '-')}`;

    return (
      <g
        ref={gRef}
        className="connection-path cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        <defs>
          {hasArrow && (
            <marker
              id={markerId}
              markerWidth="5"
              markerHeight="3.5"
              refX="4"
              refY="1.75"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <polygon points="0 0, 5 1.75, 0 3.5" fill={strokeColor} opacity={isHover || isActive ? 0.8 : 0.4} />
            </marker>
          )}
        </defs>

        {/* Invisible wider path for easier hover targeting + click-to-select */}
        <path
          d={pathD}
          stroke="transparent"
          strokeWidth={16}
          fill="none"
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(connection.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdgeContextMenu?.(connection.id, { x: e.clientX, y: e.clientY });
          }}
        />

        {/* Main bezier path */}
        <path
          d={pathD}
          stroke={pipelineActive ? '#3b82f6' : strokeColor}
          strokeWidth={pipelineActive ? 2 : strokeWidth}
          fill="none"
          strokeDasharray={isDashedEdge ? '6 4' : isDottedEdge ? '2 3' : undefined}
          markerEnd={showArrow ? `url(#${markerId})` : undefined}
          strokeLinecap="round"
          opacity={pipelineActive ? 0.6 : strokeOpacity}
        />

        {/* Pipeline flow animation — animated dashes flowing along the path */}
        {pipelineActive && (
          <path
            d={pathD}
            stroke="#3b82f6"
            strokeWidth={2}
            fill="none"
            strokeDasharray="8 12"
            strokeLinecap="round"
            opacity={0.9}
          >
            <animate attributeName="stroke-dashoffset" values="0;-40" dur="1s" repeatCount="indefinite" />
          </path>
        )}

        {/* Edge label pill — protocol/port info (hidden at lower LOD) */}
        {showLabels &&
          !isHover &&
          bundleCount <= 1 &&
          (() => {
            const envVarName = derivedEnvVar || undefined;
            const port = connection.data?.port != null ? String(connection.data.port) : undefined;

            let labelText = '';
            // Priority: envVarName > :port > category label (for non-traffic)
            if (envVarName) labelText = envVarName;
            else if (port) labelText = `:${port}`;
            else if (connCategory && connCategory !== 'traffic') {
              labelText = CATEGORY_LABELS[connCategory] || '';
            }

            if (!labelText) return null;

            const labelWidth = labelText.length * 5.5 + 12;
            const labelHeight = 16;
            const labelX = midX - labelWidth / 2;
            const labelY = midY - 12 - labelHeight / 2;

            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect
                  x={labelX}
                  y={labelY}
                  width={labelWidth}
                  height={labelHeight}
                  rx={8}
                  fill="var(--ice-bg-raised)"
                  opacity={0.8}
                />
                <text
                  x={midX}
                  y={labelY + labelHeight / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--ice-text-tertiary)"
                  fontSize="9"
                  fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                  fontWeight="500"
                >
                  {labelText}
                </text>
              </g>
            );
          })()}

        {/* Bundle count badge (hidden at lower LOD) */}
        {showLabels && bundleCount > 1 && (
          <g>
            <circle cx={midX} cy={midY} r={10} fill="var(--ice-bg-raised)" stroke={strokeColor} strokeWidth={1} />
            <text
              x={midX}
              y={midY}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--ice-text-primary)"
              fontSize="10"
              fontWeight="600"
              fontFamily="'JetBrains Mono Variable', monospace"
            >
              {bundleCount}
            </text>
          </g>
        )}

        {/* Delete button on hover (only at full LOD) */}
        {showLabels && isHover && bundleCount <= 1 && (
          <g
            className="delete-button"
            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(connection.id);
            }}
          >
            <circle cx={midX} cy={midY} r={8} fill="#ef4444" opacity={0.9} />
            <line
              x1={midX - 2.5}
              y1={midY - 2.5}
              x2={midX + 2.5}
              y2={midY + 2.5}
              stroke="white"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <line
              x1={midX + 2.5}
              y1={midY - 2.5}
              x2={midX - 2.5}
              y2={midY + 2.5}
              stroke="white"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
    );
  },
);

SvgConnectionPath.displayName = 'SvgConnectionPath';

export default SvgConnectionPath;

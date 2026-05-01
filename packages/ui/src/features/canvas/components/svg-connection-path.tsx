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
import { EDGE_COLORS } from '../../../config/color-palette';
import { useReducedMotion } from '../../../shared/hooks/use-reduced-motion';
import { inferConnectionMeta, type ConnectionCategory } from '../utils/connection-rules';
import { getCustomDomainRoutePortY } from './nodes/custom-domain';
import type { CanvasNode, CanvasConnection } from './svg-canvas';
import type { EdgeStyle } from '../../../store/slices/ui-slice';
import type { Point, Side } from './path/types';
import { chooseSides, getEdgePoint, getEffectiveBounds } from './path/bounds-and-sides';
import { buildBezierPath } from './path/builders/bezier';
import { buildStraightPath } from './path/builders/straight';

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
  /** Current zoom level — used for inverse-zoom scaling at low LOD */
  zoom?: number;
  /** Edge routing style */
  edgeStyle?: EdgeStyle;
}

// Re-export for backwards compatibility
export { EDGE_COLORS } from '../../../config/color-palette';

// =============================================================================
// Bezier Curve Routing
// =============================================================================

/**
 * Draw a polyline through dagre's routed waypoints, orthogonalizing each
 * segment into horizontal/vertical moves with rounded corners. We replace
 * dagre's first/last point (which are at node centers) with the actual
 * port-adjusted endpoints, so port disambiguation still works.
 *
 * Returns null if the route has too few points to justify routing — caller
 * falls back to the plain rectangular path in that case.
 */
function buildDagreRoutedPath(
  waypoints: Point[],
  start: Point,
  end: Point,
): { pathD: string; midX: number; midY: number } | null {
  if (!waypoints || waypoints.length < 3) return null;

  const middle = waypoints.slice(1, -1);
  const raw: Point[] = [start, ...middle, end];

  // Orthogonalize: insert an elbow point wherever a segment is diagonal.
  const ortho: Point[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const prev = ortho[ortho.length - 1];
    const cur = raw[i];
    if (Math.abs(prev.x - cur.x) > 0.5 && Math.abs(prev.y - cur.y) > 0.5) {
      ortho.push({ x: cur.x, y: prev.y });
    }
    ortho.push(cur);
  }

  // Collapse any duplicate points caused by the elbow insertion.
  const pts = ortho.filter(
    (p, i) => i === 0 || Math.abs(p.x - ortho[i - 1].x) > 0.5 || Math.abs(p.y - ortho[i - 1].y) > 0.5,
  );
  if (pts.length < 2) return null;

  const R = 8;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const dxIn = cur.x - prev.x;
    const dyIn = cur.y - prev.y;
    const dxOut = next.x - cur.x;
    const dyOut = next.y - cur.y;
    const lenIn = Math.sqrt(dxIn * dxIn + dyIn * dyIn);
    const lenOut = Math.sqrt(dxOut * dxOut + dyOut * dyOut);
    const r = Math.min(R, lenIn / 2, lenOut / 2);
    if (r < 1 || lenIn < 1 || lenOut < 1) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const beforeX = cur.x - (dxIn / lenIn) * r;
    const beforeY = cur.y - (dyIn / lenIn) * r;
    const afterX = cur.x + (dxOut / lenOut) * r;
    const afterY = cur.y + (dyOut / lenOut) * r;
    d += ` L ${beforeX} ${beforeY} Q ${cur.x} ${cur.y} ${afterX} ${afterY}`;
  }
  d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;

  const mid = pts[Math.floor(pts.length / 2)];
  return { pathD: d, midX: mid.x, midY: mid.y };
}

function buildRectangularPath(
  start: Point,
  end: Point,
  exitSide: Side,
  entrySide: Side,
): { pathD: string; midX: number; midY: number } {
  const GAP = 20; // offset before first turn
  const points: Point[] = [start];

  // Build orthogonal waypoints based on exit/entry sides
  if ((exitSide === 'right' && entrySide === 'left') || (exitSide === 'left' && entrySide === 'right')) {
    const midX = (start.x + end.x) / 2;
    points.push({ x: midX, y: start.y }, { x: midX, y: end.y });
  } else if ((exitSide === 'bottom' && entrySide === 'top') || (exitSide === 'top' && entrySide === 'bottom')) {
    const midY = (start.y + end.y) / 2;
    points.push({ x: start.x, y: midY }, { x: end.x, y: midY });
  } else if ((exitSide === 'right' || exitSide === 'left') && (entrySide === 'top' || entrySide === 'bottom')) {
    const outX = exitSide === 'right' ? start.x + GAP : start.x - GAP;
    points.push({ x: outX, y: start.y }, { x: outX, y: end.y });
  } else {
    const outY = exitSide === 'bottom' ? start.y + GAP : start.y - GAP;
    points.push({ x: start.x, y: outY }, { x: end.x, y: outY });
  }
  points.push(end);

  // Build rounded-corner polyline using small arc segments
  const R = 8; // corner radius
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    // Direction vectors
    const dxIn = cur.x - prev.x,
      dyIn = cur.y - prev.y;
    const dxOut = next.x - cur.x,
      dyOut = next.y - cur.y;
    const lenIn = Math.sqrt(dxIn * dxIn + dyIn * dyIn);
    const lenOut = Math.sqrt(dxOut * dxOut + dyOut * dyOut);
    const r = Math.min(R, lenIn / 2, lenOut / 2);
    if (r < 1 || lenIn < 1 || lenOut < 1) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const beforeX = cur.x - (dxIn / lenIn) * r;
    const beforeY = cur.y - (dyIn / lenIn) * r;
    const afterX = cur.x + (dxOut / lenOut) * r;
    const afterY = cur.y + (dyOut / lenOut) * r;
    d += ` L ${beforeX} ${beforeY} Q ${cur.x} ${cur.y} ${afterX} ${afterY}`;
  }
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;

  const mid = points[Math.floor(points.length / 2)];
  return { pathD: d, midX: mid.x, midY: mid.y };
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
    zoom = 1,
    edgeStyle = 'bezier',
  }) => {
    const [isHover, setIsHover] = useState(false);
    const reducedMotion = useReducedMotion();
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

    // Safety timer: auto-dismiss tooltip if no new pointer events within 300ms
    const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTooltipTimer = useCallback(() => {
      if (tooltipTimer.current) {
        clearTimeout(tooltipTimer.current);
        tooltipTimer.current = null;
      }
    }, []);

    const scheduleTooltipDismiss = useCallback(() => {
      clearTooltipTimer();
      tooltipTimer.current = setTimeout(() => {
        setIsHover(false);
        onConnectionHover?.(null);
      }, 300);
    }, [onConnectionHover, clearTooltipTimer]);

    const handleMouseEnter = useCallback(() => {
      clearTooltipTimer();
      setIsHover(true);
    }, [clearTooltipTimer]);

    const handleMouseLeave = useCallback(() => {
      clearTooltipTimer();
      setIsHover(false);
      onConnectionHover?.(null);
    }, [onConnectionHover, clearTooltipTimer]);

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (!onConnectionHover) return;
        clearTooltipTimer();
        scheduleTooltipDismiss();
        onConnectionHover(buildTooltip(e.clientX, e.clientY));
      },
      [onConnectionHover, buildTooltip, clearTooltipTimer, scheduleTooltipDismiss],
    );

    // Calculate path — symmetric port distribution with sorted order.
    //
    // Special case: when the source node is a `Network.CustomDomain`
    // block AND the edge has a `routeId`, anchor the start point to
    // the EXACT row port position on the source node (computed via
    // `getCustomDomainRoutePortY`). The exit side is forced to 'right'
    // so the bezier curls outward from the row, not from the block's
    // generic midpoint. Without this override, edges from a multi-row
    // Custom Domain block would all converge at the right midpoint and
    // visually obscure which row they belong to.
    const pathData = useMemo(() => {
      if (!fromNode || !toNode) return null;
      const effFrom = getEffectiveBounds(fromNode, lod, zoom);
      const effTo = getEffectiveBounds(toNode, lod, zoom);

      const fromIce = (fromNode.data?.iceType as string) || '';
      const routeId = (connection.data as any)?.routeId as string | undefined;
      // Network.CustomDomain exposes per-row connection ports that the
      // path should anchor to EXACTLY (not at the generic right-side
      // midpoint). Works for standalone and nested-inside-PrivateNetwork
      // usage alike — the CD's routes are always on its own right edge.
      const isCustomDomainSource = fromIce === 'Network.CustomDomain' && !!routeId;
      const isRowSource = isCustomDomainSource;

      let exitSide: Side;
      let entrySide: Side;
      let start: Point;

      if (isRowSource) {
        const routes = (fromNode.data?.routes as Array<{ id: string; subdomain: string }> | undefined) || [];
        const rowIndex = routes.findIndex((r) => r.id === routeId);
        if (rowIndex >= 0) {
          exitSide = 'right';
          start = {
            x: effFrom.x + effFrom.width,
            y: effFrom.y + getCustomDomainRoutePortY(rowIndex),
          };
          // Entry side picked relative to where the start point sits,
          // not the source bounds midpoint, so the curve doesn't loop
          // back if the target is above/below the row.
          const dx = effTo.x + effTo.width / 2 - start.x;
          const dy = effTo.y + effTo.height / 2 - start.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            entrySide = dx > 0 ? 'left' : 'right';
          } else {
            entrySide = dy > 0 ? 'top' : 'bottom';
          }
        } else {
          // Route was deleted but the edge still references it — fall
          // back to the generic side selection.
          const sides = chooseSides(effFrom, effTo);
          exitSide = sides.exitSide;
          entrySide = sides.entrySide;
          start = getEdgePoint(effFrom, exitSide, sourcePortIndex, sourcePortCount);
        }
      } else {
        const sides = chooseSides(effFrom, effTo);
        exitSide = sides.exitSide;
        entrySide = sides.entrySide;
        start = getEdgePoint(effFrom, exitSide, sourcePortIndex, sourcePortCount);
      }

      const end = getEdgePoint(effTo, entrySide, targetPortIndex, targetPortCount);
      if (edgeStyle === 'straight') return buildStraightPath(start, end);
      if (edgeStyle === 'rectangular') {
        // If auto-layout left us a routed polyline on this edge, follow it —
        // dagre already bent the path around obstacles. Fall back to a plain
        // L when the route is absent or too short.
        const routePoints = (connection.data as { routePoints?: Point[] } | undefined)?.routePoints;
        if (routePoints && routePoints.length >= 3) {
          const routed = buildDagreRoutedPath(routePoints, start, end);
          if (routed) return routed;
        }
        return buildRectangularPath(start, end, exitSide, entrySide);
      }
      return buildBezierPath(start, end, exitSide, entrySide);
    }, [
      fromNode,
      toNode,
      sourcePortIndex,
      sourcePortCount,
      targetPortIndex,
      targetPortCount,
      edgeStyle,
      lod,
      zoom,
      connection.data,
    ]);

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

    // Inverse-zoom scale factor — keeps strokes visible at low zoom
    const invZoom = 1 / Math.max(zoom, 0.1);
    const baseWidth = isThinEdge ? 0.6 : 1;
    const strokeWidth = isSelected
      ? 2.5 * (lod < 3 ? invZoom : 1)
      : isHover || isHighlighted
        ? 2 * (lod < 3 ? invZoom : 1)
        : lod <= 1
          ? 1.5 * invZoom
          : lod <= 2
            ? 1.2 * invZoom
            : baseWidth;
    const strokeOpacity = isSelected
      ? 0.7
      : isHighlighted
        ? 0.6
        : isHover
          ? 0.7
          : lod <= 1
            ? 0.4
            : lod <= 2
              ? 0.35
              : isThinEdge
                ? 0.12
                : 0.15;
    // Hover target must stay large enough on screen
    const hoverTargetWidth = lod < 3 ? Math.max(16, 24 * invZoom) : 16;
    const showLabels = lod >= 3;
    const showArrow = lod >= 2 && hasArrow;

    const markerId = `arrow-${connection.id.replace(/[^a-zA-Z0-9]/g, '-')}`;

    return (
      <g
        ref={gRef}
        className="connection-path cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerLeave={handleMouseLeave}
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
          strokeWidth={hoverTargetWidth}
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
          strokeWidth={pipelineActive ? 2 * (lod < 3 ? invZoom : 1) : strokeWidth}
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
            strokeWidth={2 * (lod < 3 ? invZoom : 1)}
            fill="none"
            strokeDasharray="8 12"
            strokeLinecap="round"
            opacity={0.9}
          >
            {!reducedMotion && (
              <animate attributeName="stroke-dashoffset" values="0;-40" dur="1s" repeatCount="indefinite" />
            )}
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
              labelText = connCategory;
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

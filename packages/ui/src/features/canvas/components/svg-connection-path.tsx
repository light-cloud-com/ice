/**
 * SVG Connection Path Component
 *
 * Clean bezier curves between nodes:
 * - Default: very subtle thin lines (1px, low opacity)
 * - Hover: brighter line, no animated dots
 * - Edge labels for protocol/port info
 * - Delete button on hover
 *
 * Arrow markers were removed (findings #31) — direction is implied by
 * the data model and line style (dashed / dotted / thin) carries the
 * connection type.
 */

import { CATEGORY_COLORS } from '@ice/constants';
import { findPort, getPortsForNode, hasPort, inferEdgePorts, ROLE_CATEGORY, type PortDef } from '@ice/types';
import React, { memo, useMemo, useState, useCallback, useRef } from 'react';
import { CATEGORY_STYLE } from '../../../config/canvas-constants';
import { EDGE_COLORS } from '../../../config/color-palette';
import { useReducedMotion } from '../../../shared/hooks/use-reduced-motion';
import { inferConnectionMeta, type ConnectionCategory } from '../utils/connection-rules';
import { computePath } from './path/compute-path';
import type { CanvasNode, CanvasConnection } from './svg-canvas';
import type { EdgeStyle } from '../../../store/slices/ui-slice';

/** Resolve a wire color from a typed port — prefers the peer block's
 *  category accent (matches the socket dot), falls back to the abstract
 *  connection-category color. */
function portColor(port: PortDef): string {
  if (port.peerStyle) {
    const style = CATEGORY_STYLE[port.peerStyle];
    if (style?.glow) return style.glow;
  }
  return CATEGORY_COLORS[ROLE_CATEGORY[port.role]];
}

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
    const _isActive = isSelected || isHighlighted;
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

    // Dangling edge: the edge references a typed socket that no longer
    // exists on its source or target node (because a property toggle
    // removed it). Render orange dashed so the user can decide whether
    // to clean it up — see properties-panel dangling sweep affordance.
    const sourceSocketId = (connection.data?.sourceSocket as string) || '';
    const targetSocketId = (connection.data?.targetSocket as string) || '';

    // Socket-derived wire color. The wire visually inherits the same
    // color as the socket dots it joins — a repository wire is grey
    // (Source), a domain wire is rose (Network), a database wire is
    // green (Database). Falls back to the abstract category color when
    // no typed sockets are present (legacy edges).
    const socketColor = useMemo(() => {
      let port: PortDef | undefined;
      if (sourceSocketId && fromNode) {
        port = findPort({ id: fromNode.id, type: fromNode.type, data: fromNode.data }, sourceSocketId);
      }
      if (!port && targetSocketId && toNode) {
        port = findPort({ id: toNode.id, type: toNode.type, data: toNode.data }, targetSocketId);
      }
      if (!port && fromNode && toNode) {
        const inferred = inferEdgePorts(
          getPortsForNode({ id: fromNode.id, type: fromNode.type, data: fromNode.data }),
          getPortsForNode({ id: toNode.id, type: toNode.type, data: toNode.data }),
          connCategory,
        );
        port = inferred.sourcePort ?? inferred.targetPort;
      }
      return port ? portColor(port) : null;
    }, [sourceSocketId, targetSocketId, fromNode, toNode, connCategory]);
    const isDangling = useMemo(() => {
      if (
        sourceSocketId &&
        fromNode &&
        !hasPort({ id: fromNode.id, type: fromNode.type, data: fromNode.data }, sourceSocketId)
      )
        return true;
      if (targetSocketId && toNode && !hasPort({ id: toNode.id, type: toNode.type, data: toNode.data }, targetSocketId))
        return true;
      return false;
    }, [sourceSocketId, targetSocketId, fromNode, toNode]);
    const isDashedEdge = lineStyle === 'dashed' || isLogEdge;
    const isDottedEdge = lineStyle === 'dotted';
    const isThinEdge = lineStyle === 'thin';
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

    // Calculate path — see `./path/compute-path.ts` for the full
    // dispatch table (CustomDomain row-port override, dagre-routed
    // polylines, edge-style switch, etc).
    const pathData = useMemo(
      () =>
        computePath({
          connection,
          fromNode,
          toNode,
          sourcePortIndex,
          sourcePortCount,
          targetPortIndex,
          targetPortCount,
          edgeStyle,
          lod,
          zoom,
        }),
      [
        connection,
        fromNode,
        toNode,
        sourcePortIndex,
        sourcePortCount,
        targetPortIndex,
        targetPortCount,
        edgeStyle,
        lod,
        zoom,
      ],
    );

    if (!pathData) return null;

    const { pathD, midX, midY } = pathData;

    // Styling — subtle by default, just brighten on hover
    const directionColor = direction ? EDGE_COLORS[direction] : null;
    // Socket-derived color wins so the wire matches the dots it joins.
    // Category color (from inferConnectionMeta) is the legacy fallback.
    const baseColor = socketColor || categoryColor || EDGE_COLORS[relationship] || EDGE_COLORS.default;
    // Dangling edges render in warning amber so the user can spot them
    // even at idle. Selection / hover still take priority for affordance.
    const danglingColor = '#d97706';
    const strokeColor = isSelected
      ? EDGE_COLORS.selected
      : isHighlighted
        ? directionColor || baseColor || EDGE_COLORS.hover
        : isHover
          ? EDGE_COLORS.hover
          : isDangling
            ? danglingColor
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
    // Connections are first-class — they represent the architecture's
    // data flow. Render them fully visible at idle so the user can
    // read the graph without hovering each wire. Thin edges (e.g. log
    // streams) still sit a notch quieter so they don't compete with
    // primary traffic.
    const strokeOpacity = isSelected
      ? 1
      : isHighlighted
        ? 0.95
        : isHover
          ? 1
          : lod <= 1
            ? 0.7
            : lod <= 2
              ? 0.8
              : isThinEdge
                ? 0.6
                : 0.9;
    // Hover target must stay large enough on screen
    const hoverTargetWidth = lod < 3 ? Math.max(16, 24 * invZoom) : 16;
    const showLabels = lod >= 3;

    return (
      <g
        ref={gRef}
        className="connection-path cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
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

        {/* Main bezier path. Arrow markers removed — line style
            (dashed / dotted / thin) carries the connection type. */}
        <path
          d={pathD}
          stroke={pipelineActive ? '#3b82f6' : strokeColor}
          strokeWidth={pipelineActive ? 2 * (lod < 3 ? invZoom : 1) : strokeWidth}
          fill="none"
          strokeDasharray={isDangling ? '5 4' : isDashedEdge ? '6 4' : isDottedEdge ? '2 3' : undefined}
          strokeLinecap="round"
          opacity={pipelineActive ? 0.6 : isDangling ? 0.7 : strokeOpacity}
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

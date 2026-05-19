/**
 * rf-canv-13 — `ConnectionLayer` subcomponent.
 *
 * Connection rendering layer used twice by `svg-canvas.tsx`:
 *   - Once **behind** the nodes layer (`mode='background'`) for the
 *     non-highlighted connections — the bulk of edges in the diagram, plus
 *     any pipeline-active edges that need the entrance-animation overlay.
 *   - Once **on top** of the nodes layer (`mode='highlighted'`) for the
 *     hovered/selected connections — fewer edges, different styling, with a
 *     `direction` prop ('incoming' / 'outgoing' / null) so the renderer can
 *     point arrows the right way relative to the active node.
 *
 * The two layers iterate the same `canvasConnections` list but apply
 * **opposite gates** (`isHighlighted` vs `!isHighlighted`) so each connection
 * lands in exactly one layer per frame. `mode` selects:
 *   1. The gate (highlighted vs not).
 *   2. Whether the per-conn entrance-animation `<g>` wrap is applied
 *      (background only — highlighted connections never animate in).
 *   3. Whether the pipeline-edge derivation runs (background only —
 *      highlighted connections don't render the flowing pipeline animation).
 *   4. Whether the `direction` prop is computed (highlighted only —
 *      background connections never need it).
 *
 * Per blueprint risk #4, the inner-vs-outer key shape — outer wrap key
 * `anim-edge-${conn.id}`, inner `<SvgConnectionPath>` key `${conn.id}` — is
 * preserved verbatim. The two keys live at different tree levels (outer wrap
 * vs. its single child), so React reconciliation treats them independently;
 * `SvgConnectionPath`'s internal hover state survives the wrap toggling on
 * and off as `animatingEdges` entries appear and expire.
 *
 * Cite `dispatch-factory-must-return-innerkey-when-call-site-derives-outer-wrapper-key`
 * (rf-canv-12): the rf-canv-10/12 wrapperKey hazard does NOT apply here
 * because the per-conn animation wrap stays *internal* to this component —
 * the call site never derives a wrapper key, so we don't need to hand one
 * back. The map produces sibling elements with stable per-conn keys directly.
 */

import React, { type CSSProperties } from 'react';

import { SvgConnectionPath, type ConnectionTooltipInfo } from './svg-connection-path';
import type { CanvasNode, CanvasConnection } from './types';
import type { EdgeStyle } from '../../../store/slices/ui-slice';
import type { NodePipelineStatus } from '../../../store/slices/pipeline-slice';

export interface ConnectionLayerProps {
  /** 'background' renders non-highlighted connections behind nodes (with the
   * pipeline-edge derivation and the entrance-animation wrap). 'highlighted'
   * renders the hovered/selected subset on top of nodes (with the direction
   * prop, no animation wrap, no pipeline-edge derivation). */
  mode: 'background' | 'highlighted';
  canvasConnections: CanvasConnection[];
  effectiveNodes: CanvasNode[];
  portMap: Map<string, { index: number; count: number }>;
  /** Per-edge ms delay; presence opts the edge into the entrance animation
   * (background mode only). */
  animatingEdges: Record<string, number>;
  pipelineNodeStatus: Record<string, NodePipelineStatus>;
  selectedNodes: string[];
  selectedEdges: string[];
  hoveredNodeId: string | null;
  lod: number;
  viewport: { zoom: number };
  edgeStyle: EdgeStyle;
  handleConnectionHover: (info: ConnectionTooltipInfo | null) => void;
  handleEdgeDelete: (connectionId: string) => void;
  handleEdgeSelect: (connectionId: string) => void;
  handleContextMenu: (
    position: { x: number; y: number },
    type: 'canvas' | 'node' | 'edge',
    targetId?: string,
  ) => void;
}

export const ConnectionLayer: React.FC<ConnectionLayerProps> = ({
  mode,
  canvasConnections,
  effectiveNodes,
  portMap,
  animatingEdges,
  pipelineNodeStatus,
  selectedNodes,
  selectedEdges,
  hoveredNodeId,
  lod,
  viewport,
  edgeStyle,
  handleConnectionHover,
  handleEdgeDelete,
  handleEdgeSelect,
  handleContextMenu,
}) => {
  if (mode === 'background') {
    // Non-highlighted connections — the bulk of edges, plus any pipeline-
    // active edges that need the entrance-animation overlay.
    return (
      <g className="connections-layer">
        {canvasConnections.map((conn) => {
          const isHighlighted =
            (hoveredNodeId !== null && (conn.from === hoveredNodeId || conn.to === hoveredNodeId)) ||
            (selectedNodes.length > 0 && (selectedNodes.includes(conn.from) || selectedNodes.includes(conn.to)));
          if (isHighlighted) return null; // rendered in top layer
          const srcPort = portMap.get(`${conn.id}:source`);
          const tgtPort = portMap.get(`${conn.id}:target`);
          const edgeAnimDelay = animatingEdges[conn.id];
          const edgeAnimStyle: CSSProperties | undefined =
            edgeAnimDelay !== undefined
              ? { animation: `ice-edge-entrance 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${edgeAnimDelay}ms both` }
              : undefined;
          // Check if this edge connects a Source.Repository to a node with active pipeline
          const srcNode = effectiveNodes.find((n) => n.id === conn.from);
          const tgtNode = effectiveNodes.find((n) => n.id === conn.to);
          const srcIsSource =
            (srcNode?.data?.iceType as string) === 'Source.Repository' || srcNode?.data?.behavior === 'source';
          const tgtIsSource =
            (tgtNode?.data?.iceType as string) === 'Source.Repository' || tgtNode?.data?.behavior === 'source';
          const serviceNodeId = srcIsSource ? conn.to : tgtIsSource ? conn.from : null;
          const isPipelineEdge = !!(srcIsSource || tgtIsSource) && !!serviceNodeId;
          const pipelineStatus = serviceNodeId ? pipelineNodeStatus[serviceNodeId] : null;
          const edgePipelineActive =
            isPipelineEdge &&
            pipelineStatus != null &&
            (pipelineStatus.status === 'queued' ||
              pipelineStatus.status === 'building' ||
              pipelineStatus.status === 'deploying');

          const connectionEl = (
            <SvgConnectionPath
              key={conn.id}
              connection={conn}
              nodes={effectiveNodes}
              allNodes={effectiveNodes}
              isSelected={selectedEdges.includes(conn.id)}
              isHighlighted={false}
              sourcePortIndex={srcPort?.index || 0}
              sourcePortCount={srcPort?.count || 1}
              targetPortIndex={tgtPort?.index || 0}
              targetPortCount={tgtPort?.count || 1}
              onConnectionHover={handleConnectionHover}
              onDelete={handleEdgeDelete}
              onSelect={handleEdgeSelect}
              onContextMenu={(edgeId, pos) => handleContextMenu(pos, 'edge', edgeId)}
              lod={lod}
              zoom={viewport.zoom}
              pipelineActive={edgePipelineActive}
              edgeStyle={edgeStyle}
            />
          );
          return edgeAnimStyle ? (
            <g key={`anim-edge-${conn.id}`} style={edgeAnimStyle}>
              {connectionEl}
            </g>
          ) : (
            connectionEl
          );
        })}
      </g>
    );
  }

  // mode === 'highlighted' — hovered/selected connections rendered on top of
  // nodes with a direction prop relative to the active node.
  return (
    <g className="connections-highlighted-layer">
      {canvasConnections.map((conn) => {
        // The "active" node is the hovered node, or first selected node
        const activeNodeId = hoveredNodeId || (selectedNodes.length > 0 ? selectedNodes[0] : null);
        const isHighlighted =
          (hoveredNodeId !== null && (conn.from === hoveredNodeId || conn.to === hoveredNodeId)) ||
          (selectedNodes.length > 0 && (selectedNodes.includes(conn.from) || selectedNodes.includes(conn.to)));
        if (!isHighlighted) return null; // already rendered behind nodes

        // Determine direction relative to the active node
        let direction: 'incoming' | 'outgoing' | null = null;
        if (activeNodeId) {
          if (conn.from === activeNodeId) direction = 'outgoing';
          else if (conn.to === activeNodeId) direction = 'incoming';
        }

        const srcPort = portMap.get(`${conn.id}:source`);
        const tgtPort = portMap.get(`${conn.id}:target`);
        return (
          <SvgConnectionPath
            key={conn.id}
            connection={conn}
            nodes={effectiveNodes}
            allNodes={effectiveNodes}
            isSelected={selectedEdges.includes(conn.id)}
            isHighlighted={true}
            direction={direction}
            sourcePortIndex={srcPort?.index || 0}
            sourcePortCount={srcPort?.count || 1}
            targetPortIndex={tgtPort?.index || 0}
            targetPortCount={tgtPort?.count || 1}
            onConnectionHover={handleConnectionHover}
            onDelete={handleEdgeDelete}
            onSelect={handleEdgeSelect}
            onContextMenu={(edgeId, pos) => handleContextMenu(pos, 'edge', edgeId)}
            lod={lod}
            zoom={viewport.zoom}
            edgeStyle={edgeStyle}
          />
        );
      })}
    </g>
  );
};

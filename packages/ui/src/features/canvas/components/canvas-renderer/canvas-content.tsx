/**
 * CanvasContent
 *
 * The inner pan/zoom transform group (`<g transform="translate(x,y) scale(z)">`)
 * previously inlined in `svg-canvas.tsx` (rf-svgcv2-1). Wraps the entire
 * pan/zoom-transformed render tree:
 *
 *   1. CanvasGrid (background grid)
 *   2. SelectionFrame
 *   3. ParentClipDefs
 *   4. NodesLayer
 *   5. ConnectionLayer (mode='background')   — ABOVE nodes per user feedback
 *   6. ConnectionPreviewOverlay (drag-to-connect ghost)
 *   7. UserTrafficOverlay
 *   8. ConnectionLayer (mode='highlighted')
 *   9. GhostOverlay
 *
 * The background ConnectionLayer was previously rendered BEFORE the
 * NodesLayer (under the original "edges sandwich nodes" model). User
 * feedback flagged that as broken — containers and groups overlapped
 * the wires, making the data flow unreadable at idle. Both connection
 * layers now render after NodesLayer so wires are first-class.
 *
 * Earlier rf-canv units (rf-canv-13/14/15/etc.) extracted the leaf
 * components; this unit extracts only their composition and the
 * surrounding `<g>` transform.
 *
 * rf-svgcv2-1.
 */

import React from 'react';
import { CanvasGrid } from '../canvas-grid';
import { ConnectionLayer, type ConnectionLayerProps } from '../connection-layer';
import { ConnectionPreviewOverlay, type ConnectionPreviewOverlayProps } from '../connection-preview-overlay';
import { ConnectionRejectionOverlay, type ConnectionRejection } from '../connection-rejection-overlay';
import { GhostOverlay, type GhostOverlayProps } from '../ghost/ghost-overlay';
import { UserTrafficOverlay, type UserTrafficOverlayProps } from '../user-traffic-overlay';
import { NodesLayer } from './nodes-layer';
import { ParentClipDefs } from './parent-clip-defs';
import { SelectionFrame } from '../selection-frame';
import type { RenderCtx } from './node-renderer-registry';
import type { CanvasNode } from '../types';

export interface CanvasContentProps {
  // Viewport / dimensions
  viewport: { x: number; y: number; zoom: number };
  dimensions: { width: number; height: number };

  // Connection layers (shared between background + highlighted)
  canvasConnections: ConnectionLayerProps['canvasConnections'];
  effectiveNodes: CanvasNode[];
  portMap: ConnectionLayerProps['portMap'];
  animatingEdges: ConnectionLayerProps['animatingEdges'];
  pipelineNodeStatus: ConnectionLayerProps['pipelineNodeStatus'];
  selectedNodes: ConnectionLayerProps['selectedNodes'];
  selectedEdges: ConnectionLayerProps['selectedEdges'];
  hoveredNodeId: ConnectionLayerProps['hoveredNodeId'];
  lod: ConnectionLayerProps['lod'];
  edgeStyle: ConnectionLayerProps['edgeStyle'];
  handleConnectionHover: ConnectionLayerProps['handleConnectionHover'];
  handleEdgeDelete: ConnectionLayerProps['handleEdgeDelete'];
  handleEdgeSelect: ConnectionLayerProps['handleEdgeSelect'];
  handleContextMenu: ConnectionLayerProps['handleContextMenu'];

  // Nodes layer
  sortedNodes: CanvasNode[];
  animatingNodes: Record<string, number>;
  shiftDraggingNodeIds: Set<string>;
  dragOverGroupId: string | null;
  renderCtx: RenderCtx;

  // Connection drawing preview
  drawingConnection: ConnectionPreviewOverlayProps['drawingConnection'] | null;
  connectionDragTargets: ConnectionPreviewOverlayProps['connectionDragTargets'];
  /** Floating rejection tooltip, set when a drop is rejected. */
  connectionRejection: ConnectionRejection | null;

  // User-traffic overlay
  showVirtualUserNode: boolean;
  userConnections: UserTrafficOverlayProps['userConnections'];
  nodesWithUserNode: UserTrafficOverlayProps['nodesWithUserNode'];
  pinnedUserPos: UserTrafficOverlayProps['pinnedUserPos'];
  setUserNodePos: UserTrafficOverlayProps['setUserNodePos'];

  // Ghost suggestions
  ghosts: GhostOverlayProps['ghosts'];
  nodes: GhostOverlayProps['nodes'];
  onAcceptGhost: GhostOverlayProps['onAccept'];
  onDismissGhost: GhostOverlayProps['onDismiss'];
}

export const CanvasContent: React.FC<CanvasContentProps> = ({
  viewport,
  dimensions,
  canvasConnections,
  effectiveNodes,
  portMap,
  animatingEdges,
  pipelineNodeStatus,
  selectedNodes,
  selectedEdges,
  hoveredNodeId,
  lod,
  edgeStyle,
  handleConnectionHover,
  handleEdgeDelete,
  handleEdgeSelect,
  handleContextMenu,
  sortedNodes,
  animatingNodes,
  shiftDraggingNodeIds,
  dragOverGroupId,
  renderCtx,
  drawingConnection,
  connectionDragTargets,
  connectionRejection,
  showVirtualUserNode,
  userConnections,
  nodesWithUserNode,
  pinnedUserPos,
  setUserNodePos,
  ghosts,
  nodes,
  onAcceptGhost,
  onDismissGhost,
}) => {
  return (
    <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
      {/* Grid background */}
      <CanvasGrid
        viewState={{ scale: viewport.zoom, panX: viewport.x, panY: viewport.y }}
        width={dimensions.width}
        height={dimensions.height}
      />

      {/* Selection frame */}
      <SelectionFrame />

      {/* VPC/Subnet now render as SvgGroupNode in the nodes layer */}

      {/* rf-canv-11: <defs> block (shift-drag-shadow filter +
          per-container clipPaths) extracted to ParentClipDefs. */}
      <ParentClipDefs nodes={sortedNodes} />

      {/* Nodes layer — Groups, Blocks, Resources, or Log terminals.
          rf-canv-12: per-node dispatch (iceType + node.type → component
          choice) lives in `./node-renderer-registry`.
          rf-canv2-7: the wrap-and-key loop lives in `./nodes-layer`; the
          wrapper's outer-key priority chain (rf-canv-10) is preserved
          verbatim. */}
      <NodesLayer
        sortedNodes={sortedNodes}
        animatingNodes={animatingNodes}
        shiftDraggingNodeIds={shiftDraggingNodeIds}
        dragOverGroupId={dragOverGroupId}
        renderCtx={renderCtx}
      />

      {/* Connections layer — ABOVE the nodes layer so containers and
          groups never occlude the wires. Per user feedback: connections
          are the architecture's data flow and must be fully visible at
          idle. Previously rendered before NodesLayer (mode='background')
          which let group tints overlap them. */}
      <ConnectionLayer
        mode="background"
        canvasConnections={canvasConnections}
        effectiveNodes={effectiveNodes}
        portMap={portMap}
        animatingEdges={animatingEdges}
        pipelineNodeStatus={pipelineNodeStatus}
        selectedNodes={selectedNodes}
        selectedEdges={selectedEdges}
        hoveredNodeId={hoveredNodeId}
        lod={lod}
        viewport={viewport}
        edgeStyle={edgeStyle}
        handleConnectionHover={handleConnectionHover}
        handleEdgeDelete={handleEdgeDelete}
        handleEdgeSelect={handleEdgeSelect}
        handleContextMenu={handleContextMenu}
      />

      {/* Connection drawing preview — extracted to ConnectionPreviewOverlay (rf-canv-14).
          Bezier math + color picker live in `../utils/connection-preview` (rf-canv-8). */}
      {drawingConnection && (
        <ConnectionPreviewOverlay
          drawingConnection={drawingConnection}
          effectiveNodes={effectiveNodes}
          connectionDragTargets={connectionDragTargets}
        />
      )}

      {/* Floating rejection tooltip — shown for ~2.5s after a failed
          drop (invalid pair, special-rule conflict, or hard validation
          error). State lives in `useConnectionDrawing`. */}
      {connectionRejection && <ConnectionRejectionOverlay rejection={connectionRejection} />}

      {/* User traffic icon + outbound connections to exposed services —
          extracted to UserTrafficOverlay (rf-canv-15). Both render only
          when no explicit Network.PublicEndpoint block is on the canvas. */}
      <UserTrafficOverlay
        show={showVirtualUserNode}
        userConnections={userConnections}
        nodesWithUserNode={nodesWithUserNode}
        pinnedUserPos={pinnedUserPos}
        zoom={viewport.zoom}
        setUserNodePos={setUserNodePos}
        edgeStyle={edgeStyle}
      />

      {/* Highlighted connections layer — ON TOP of nodes.
          rf-canv-13: extracted to ConnectionLayer in mode='highlighted'.
          No animation wrap; computes the direction prop relative to the
          active node (hovered, falling back to first selected). */}
      <ConnectionLayer
        mode="highlighted"
        canvasConnections={canvasConnections}
        effectiveNodes={effectiveNodes}
        portMap={portMap}
        animatingEdges={animatingEdges}
        pipelineNodeStatus={pipelineNodeStatus}
        selectedNodes={selectedNodes}
        selectedEdges={selectedEdges}
        hoveredNodeId={hoveredNodeId}
        lod={lod}
        viewport={viewport}
        edgeStyle={edgeStyle}
        handleConnectionHover={handleConnectionHover}
        handleEdgeDelete={handleEdgeDelete}
        handleEdgeSelect={handleEdgeSelect}
        handleContextMenu={handleContextMenu}
      />

      {/* Ghost-mode suggestions (AI-Native #1) — rf-canv2-7: extracted
          to `./ghost/ghost-overlay`. Returns null when ghosts is empty
          so the orchestrator's JSX surface stays compact. */}
      <GhostOverlay ghosts={ghosts} nodes={nodes} onAccept={onAcceptGhost} onDismiss={onDismissGhost} />
    </g>
  );
};

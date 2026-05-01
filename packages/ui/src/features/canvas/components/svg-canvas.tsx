/**
 * SVG Canvas Component
 *
 * Custom SVG-based canvas with pan/zoom and node interactions.
 * All nodes use the unified Mac-style component.
 *
 * Mouse controls:
 * - Left click on node: drag/resize the node
 * - Left click on empty space: clear selection
 * - Middle mouse button: pan the canvas
 * - Scroll wheel: zoom in/out
 */

import React, { useRef, type CSSProperties } from 'react';
import { useSelector, useDispatch } from 'react-redux';
// Note: Graph actions no longer used - all node operations go through cardsSlice
// Viewport is now stored per-pane in uiSlice (for split view support)
import { CanvasGrid } from './canvas-grid';
import { CanvasContextMenu } from './context/canvas-context-menu';
import { ControlsHelpModal } from './controls-help-modal';
// ConnectionTypePopover removed — connections are fully auto-configured
import { SvgGhostEdge } from './ghost/svg-ghost-edge';
import { SelectionFrame } from './selection-frame';
import { ConnectionLayer } from './connection-layer';
import { ConnectionPreviewOverlay } from './connection-preview-overlay';
import { ConnectionTooltip } from './connection-tooltip';
import { UserTrafficOverlay } from './user-traffic-overlay';
import { CanvasDeployBanner } from './deploy-banner';
import { selectActiveCard } from '../../../store/slices/cards-slice';
import { SvgGhostNode } from './ghost/svg-ghost-node';
import { NodeLiftWrapper } from './canvas-renderer/lift-wrapper';
import { ParentClipDefs } from './canvas-renderer/parent-clip-defs';
import { renderCanvasNode, type RenderCtx } from './canvas-renderer/node-renderer-registry';
// Bespoke-from-day-one nodes with inline editing
import {
  GRID_SIZE,
} from '../../../config/canvas-constants';
import { useClipboard } from '../../../shared/hooks/use-clipboard';
import { useExposedServices } from '../../../shared/hooks/use-exposed-services';
import { useUndoRedo } from '../../../shared/hooks/use-undo-redo';
import {
  setSelectedNodes,
  setSelectedEdges,
  toggleNodeSelection,
  setSelectionRect,
} from '../../../store/slices/selection-slice';
import { useCanvasInteractions } from '../hooks/use-canvas-interactions';
import { useCanvasValidation } from '../hooks/use-canvas-validation';
import { useComputingFlows } from '../hooks/use-computing-flows';
import { useCanvasDimensions } from '../hooks/use-canvas-resize';
import { useCanvasViewport } from '../hooks/use-canvas-viewport';
import { usePinnedUserNode } from '../hooks/use-pinned-user-node';
import { useRenameState } from '../hooks/use-rename-state';
import { useCanvasSideEffects } from '../hooks/use-canvas-side-effects';
import { useGhostMode } from '../hooks/use-ghost-mode';
import { useCanvasDrop } from '../hooks/use-canvas-drop';
import { useContainerResize } from '../hooks/use-container-resize';
import { useContainerMove } from '../hooks/use-container-move';
import { useDragTargetHighlight } from '../hooks/use-drag-target-highlight';
import { useConnectionDrawing } from '../hooks/use-connection-drawing';
import { useCanvasData } from '../hooks/use-canvas-data';
import { useCanvasTraversal } from '../hooks/use-canvas-traversal';
import { useCanvasHandlers } from '../hooks/use-canvas-handlers';
import { useCanvasEffects } from '../hooks/use-canvas-effects';
import { getConnectedPipelineStatuses } from '../utils/get-connected-pipeline-statuses';
import type { RootState, AppDispatch } from '../../../store';

// rf-canv-1: re-export shim — the canonical home for these three types is
// `./types`. 11+ consumers still import them from this file; keep the shim
// so they continue to resolve. `export type` makes this a type-only forward
// (no runtime cost). rf-canv2-6: with all canvas-data-shape memos and
// traversal callbacks now living in sub-hooks, the orchestrator no longer
// references `CanvasNode` / `CanvasConnection` directly — the paired
// `import type` line that used to follow this re-export was dropped.
export type { CanvasNode, ViewState, CanvasConnection } from './types';

// =============================================================================
// Per-concept block renderer table
// =============================================================================
//
// rf-canv-12: `CONCEPT_NODE_RENDERERS` (the iceType → bespoke per-block
// renderer dispatch table) and the per-node `renderCanvasNode(node, ctx)`
// factory now live in `./canvas-renderer/node-renderer-registry`. The
// orchestrator wraps the factory's element in `<NodeLiftWrapper>` and
// derives the wrapper's outer `key` from the per-call-site `innerKey` the
// factory returns — see the rf-canv-10 learning on outer-key chains.

// =============================================================================
// Types
// =============================================================================
// `CanvasNode`, `ViewState`, and `CanvasConnection` live in `./types` (rf-canv-1).
// The re-export at the top of this file keeps the public path stable for
// consumers that still import them from `'./svg-canvas'`.

// =============================================================================
// Constants - Unified sizes
// =============================================================================
// rf-canv-4: `CONTAINER_HEADER_H` and `CONTAINER_PAD` (the readability
// aliases for HEADER_HEIGHT / CONTAINER_PADDING) now live in
// `../utils/container-bounds` alongside the calculate/recalculate utils
// that consume them. They're imported above.

// =============================================================================
// Canvas Component
// =============================================================================

export interface SvgCanvasProps {
  cardId?: string; // Optional - if not provided, uses activeCardId
  paneId?: string; // Optional - if provided, uses pane's viewport instead of card's
  onFocus?: () => void; // Called when canvas is focused/clicked
}

export const SvgCanvas: React.FC<SvgCanvasProps> = ({ cardId, paneId, onFocus }) => {
  const dispatch = useDispatch<AppDispatch>();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Redux state - use specified card or active card for nodes/edges
  const activeCard = useSelector(selectActiveCard);
  const allCards = useSelector((state: RootState) => state.cards.cards);
  // rf-canv-17: the canvas-level deploy banner (status text +
  // terminal-of-total count + active-node line + progress bar) lives in
  // `./deploy-banner` as `<CanvasDeployBanner cardId={...} />`. It owns
  // its own `state.deploy.{status, currentDeployCardId, nodesById}`
  // selectors + `deriveRollup` / `bannerActiveNode` / `bannerPct` memos
  // — the orchestrator only threads the active-card id.
  const card = cardId ? allCards.find((c) => c.id === cardId) : activeCard;
  const selectedNodes = useSelector((state: RootState) => state.selection.selectedNodes);
  const selectedEdges = useSelector((state: RootState) => state.selection.selectedEdges);
  const viewLevel = useSelector((state: RootState) => state.view.viewLevel);
  const animatingNodes = useSelector((state: RootState) => state.ai.animatingNodes);
  const animatingEdges = useSelector((state: RootState) => state.ai.animatingEdges);
  const aiCurrentIntent = useSelector((state: RootState) => state.ai.currentIntent);
  const pipelineNodeStatus = useSelector((state: RootState) => state.pipeline.nodeStatus);
  const edgeStyle = useSelector((state: RootState) => state.ui.edgeStyle);
  const validationIssues = useSelector((state: RootState) => state.validation.issues);
  // Clipboard (Ctrl+C/V/X) and Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
  useClipboard();
  useUndoRedo();
  // Canvas validation — runs on debounced timer after node/edge changes
  useCanvasValidation();
  // Computing flows — reactive property propagation across connected blocks
  useComputingFlows();

  // Ghost-mode suggestions (AI-Native Feature #1) — rf-canv-23: selector,
  // accept/dismiss callbacks, and the 10s auto-dismiss timer are owned by
  // `useGhostMode`. rf-canv-24: the blueprint-drop / new-block paths that
  // dispatch `setGhosts(generateGhostSuggestions(...))` now live inside
  // `useCanvasDrop` (called below).
  const { ghosts, handleAcceptGhost, handleDismissGhost } = useGhostMode();

  // ── Reactive propagation (domain sync, routeId backfill, orphan cleanup,
  // network policy, secret injection, etc.) is now handled by useComputingFlows()
  // called above. See packages/core/src/compute/ for the rule definitions.

  // Viewport hook (rf-canv-19): pane-or-card viewport selection, LOD
  // threshold dispatch, autoOrganizeOnZoom debounce + scaleLayoutForZoom
  // effect, and the persistViewport callback that picks the right
  // setPaneViewport / setCardViewportById / setCardViewport action creator.
  const { viewport, lod, persistViewport } = useCanvasViewport({ cardId, paneId });

  const snapToGrid = useSelector((state: RootState) => state.ui.snapToGrid);
  const canvasLocked = useSelector((state: RootState) => state.ui.canvasLocked);

  // Canvas dimensions — ResizeObserver-tracked, default 800x600 until first
  // measurement. rf-canv-18: extracted to `../hooks/use-canvas-resize`.
  const dimensions = useCanvasDimensions(containerRef);

  // rf-canv2-1: every `useMemo`-derived data-shape (nodes, edges, canvasNodes,
  // visibleNodes, foldedRemap, effectiveNodes, canvasConnections, canvasItems,
  // nodeValidationMap, nodeDepthMap, sortedNodes, portMap) plus the internal
  // `hasCollapsedAncestor` callback live in `useCanvasData`.
  const {
    nodes,
    edges,
    canvasNodes,
    visibleNodes,
    foldedRemap,
    effectiveNodes,
    canvasConnections,
    canvasItems,
    nodeValidationMap,
    nodeDepthMap,
    sortedNodes,
    portMap,
  } = useCanvasData({
    card,
    pipelineNodeStatus,
    viewLevel,
    validationIssues,
    selectedNodes,
  });

  // rf-canv2-2: the three external traversal callbacks
  // (getDescendantIds, getAllDescendantIds, findContainerAtPosition) live in
  // `useCanvasTraversal`. Each consumer below threads them in as deps.
  const { getDescendantIds, getAllDescendantIds, findContainerAtPosition } =
    useCanvasTraversal({ visibleNodes, canvasNodes });

  // rf-canv-22: bundled side-effects — install inspector once,
  // updateInspectorState + inspectLayout on viewport/lod/nodes/edges,
  // auto-organize on bulk node-count delta (threshold > 10 — blueprint
  // risk #7), logCanvasRender on render-shape changes, overlay-dismiss
  // reset on card change + AI intent. Per blueprint risk #8 the
  // setOverlayDismissed setter is preserved verbatim despite no
  // current reader — a future unit will surface the boolean.
  useCanvasSideEffects({
    card,
    nodes,
    edges,
    canvasNodes,
    effectiveNodes,
    viewport,
    lod,
    viewLevel,
    aiCurrentIntent,
    dispatch,
  });

  // Detect publicly-exposed entry-point services for user traffic icon
  // Uses edge topology to find true graph sources (no incoming connects_to)
  const exposedServices = useExposedServices(effectiveNodes, edges, canvasNodes);

  // Suppress virtual user traffic icon when an explicit Network.PublicEndpoint block exists on canvas
  const hasExplicitTrafficBlock = canvasNodes.some((n) => (n.data?.iceType as string) === 'Network.PublicEndpoint');
  const showVirtualUserNode = !hasExplicitTrafficBlock;

  // Virtual user-traffic node — pinned-center, drag setter, derived virtual
  // node + connections + merged-node-list. rf-canv-21: extracted to
  // `../hooks/use-pinned-user-node`. Per blueprint RISK #10 the setter
  // (`setUserNodePos`) flows through to `<UserTrafficOverlay>` (rf-canv-15)
  // so SvgUserNode's drag handler can write the user-dragged top-left back
  // into local state without resetting the pinned center.
  const { pinnedUserPos, setUserNodePos, userConnections, nodesWithUserNode } =
    usePinnedUserNode(effectiveNodes, exposedServices);

  // rf-canv-25a: container-resize machinery — `recalculateAncestorBounds`,
  // `calculateMinimumContainerSize`, and `handleNodeResize` are owned by
  // `useContainerResize`. Only `handleNodeResize` is consumed by the
  // orchestrator (threaded into `useCanvasInteractions` as `onItemResize`);
  // the other two are kept on the hook's return surface for future consumers
  // but trimmed from this destructure. See rf-canv-28+29 cleanup pass.
  const { handleNodeResize } = useContainerResize({ visibleNodes });

  // rf-canv-26: shift-drag highlight + reparent-on-Ctrl-drop machinery —
  // `exitingGroupId` / `dragOverGroupId` / `shiftDraggingNodeIds` state +
  // `handleDragOverGroup` + `handleDragEnd` callbacks live in
  // `useDragTargetHighlight`. Per blueprint risk #2 the `setExitingGroupId`
  // setter is threaded DOWN into `useContainerMove` (rf-canv-25b) so its
  // drag-time edge detection writes into the same React state slot the
  // shift-drag rubber-band reads — the two stay synchronized without
  // either hook owning the other.
  const {
    exitingGroupId,
    dragOverGroupId,
    shiftDraggingNodeIds,
    setExitingGroupId,
    handleDragOverGroup,
    handleDragEnd,
  } = useDragTargetHighlight({ visibleNodes, nodes, selectedNodes, getDescendantIds });

  // rf-canv-25b: `handleNodeMove` (drag with ancestor-expansion + clamp +
  // descendant translation + edge-detection) and `handleToggleFold` (fold-
  // time self+ancestor expansion) are owned by `useContainerMove`. The
  // setter for `exitingGroupId` is threaded in as a callback prop so the
  // hook stays loosely coupled to rf-canv-26's drag-highlight ownership.
  const { handleNodeMove, handleToggleFold } = useContainerMove({
    visibleNodes,
    canvasNodes,
    nodes,
    getAllDescendantIds,
    setExitingGroupId,
  });

  // Inline rename state — extracted to useRenameState (rf-canv-20).
  const { renamingNodeId, handleNodeDoubleClick, handleRenameCommit, handleRenameCancel } =
    useRenameState();

  // rf-canv2-3: the nine event-handler callbacks plus the two pieces of
  // orchestrator-private state (`hoveredNodeId`, `connTooltip`) live in
  // `useCanvasHandlers`. Both setters are exposed because the JSX surface
  // dismisses tooltips on `onMouseDown` / `onMouseLeave`.
  const {
    hoveredNodeId,
    connTooltip,
    setConnTooltip,
    handleDeleteSelected,
    handleNodeHover,
    handleConnectionHover,
    handleEdgeDelete,
    handleEdgeSelect,
    handleUpdateNodeData,
    handlePipelineClick,
    handleContextMenu,
    handleCanvasClick,
  } = useCanvasHandlers({ selectedNodes, viewport, svgRef, onFocus });

  // Canvas interactions
  const { bindCanvas, cursor, screenToCanvas } = useCanvasInteractions({
    svgRef,
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    items: canvasItems,
    selectedIds: selectedNodes,
    onViewportChange: persistViewport,
    onItemMove: handleNodeMove,
    onItemResize: handleNodeResize,
    onSelect: (ids) => {
      dispatch(setSelectedNodes(ids));
      dispatch(setSelectedEdges([]));
    },
    onToggleSelect: (id) => {
      dispatch(toggleNodeSelection(id));
      dispatch(setSelectedEdges([]));
    },
    onBoxSelect: (rect) => {
      dispatch(setSelectionRect(rect));
    },
    onContextMenu: handleContextMenu,
    onDelete: handleDeleteSelected,
    onDragOverGroup: handleDragOverGroup,
    onDragEnd: handleDragEnd,
    gridSize: snapToGrid ? GRID_SIZE : 0,
    locked: canvasLocked,
  });

  // rf-canv2-4: the pipeline-subscription useEffect + the non-passive wheel
  // listener useEffect live in `useCanvasEffects`. Both close over the live
  // `bindCanvas` so the listener re-installs when interactions inputs change.
  useCanvasEffects({
    cardId: card?.id,
    svgRef,
    bindCanvas,
    setConnTooltip,
  });

  // rf-canv-24: palette drop dispatcher (group/block/resource branches,
  // canContain validation, blueprint expansion, ghost suggestions) and the
  // surface-level dragOver preventDefault + dropEffect setter live in
  // `../hooks/use-canvas-drop`. The orchestrator threads in `screenToCanvas`,
  // the bound `findContainerAtPosition` callback, and the active card's
  // `nodes` / `edges` for ghost-suggestion generation.
  const { handleDrop, handleDragOver } = useCanvasDrop({
    screenToCanvas,
    findContainerAtPosition,
    nodes,
    edges,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Connection Drawing — port-to-port drag to create edges
  // ═══════════════════════════════════════════════════════════════════════════
  // rf-canv-27: state + memo + the three event callbacks live in
  // `useConnectionDrawing`. Per blueprint risk #3 the hook keeps `card` in
  // its `handleConnectionEnd` dep array verbatim (no ref). Per risk #5 the
  // orchestrator's onMouseDown gate (the `target.classList.contains('connection-port')`
  // sniff a few hundred lines down) routes the mousedown event between
  // port-drag and pan-canvas — the hook owns only the post-classList work.
  const {
    drawingConnection,
    connectionDragTargets,
    handleConnectionPortDown,
    handleConnectionMove,
    handleConnectionEnd,
  } = useConnectionDrawing({ effectiveNodes, card, screenToCanvas });

  // Connection popover handlers removed — connections are auto-configured

  // rf-canv-12: bundle every dependency the per-node renderer dispatch
  // consumes into a single object so the `sortedNodes.map(...)` body stays
  // a one-liner. Field shapes mirror the local declarations verbatim — see
  // `RenderCtx` in `./canvas-renderer/node-renderer-registry.tsx`.
  // rf-canv2-5: `getConnectedPipelineStatuses` is bound here from the pure
  // util in `../utils/get-connected-pipeline-statuses` so the renderCtx
  // surface stays a single-arg function.
  const renderCtx: RenderCtx = {
    sortedNodes,
    selectedNodes,
    lod,
    zoom: viewport.zoom,
    pipelineNodeStatus,
    dragOverGroupId,
    exitingGroupId,
    renamingNodeId,
    connectionDragTargets,
    nodeValidationMap,
    handleToggleFold,
    handleNodeHover,
    handleNodeDoubleClick,
    handleRenameCommit,
    handleRenameCancel,
    handleUpdateNodeData,
    handlePipelineClick,
    getConnectedPipelineStatuses: (node) =>
      getConnectedPipelineStatuses(node, card, pipelineNodeStatus),
  };

  return (
    <div
      ref={containerRef}
      className="h-full w-full relative bg-ice-base"
      id="ice-canvas-svg"
      data-testid="svg-canvas"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onMouseDown={handleCanvasClick}
    >
      <CanvasDeployBanner cardId={activeCard?.id} />
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ cursor: drawingConnection ? 'crosshair' : cursor }}
        onMouseDown={(e) => {
          // Dismiss any lingering connection tooltip on interaction start
          setConnTooltip(null);
          // Check if click is on a connection port first
          const target = e.target as SVGElement;
          if (target.classList.contains('connection-port')) {
            handleConnectionPortDown(e);
            return;
          }
          // Otherwise delegate to normal canvas interactions
          bindCanvas.onMouseDown(e);
        }}
        onMouseMove={(e) => {
          if (drawingConnection) {
            handleConnectionMove(e);
            return;
          }
          bindCanvas.onMouseMove(e);
        }}
        onMouseUp={(e) => {
          if (drawingConnection) {
            handleConnectionEnd(e);
            return;
          }
          bindCanvas.onMouseUp(e);
        }}
        onMouseLeave={(e) => {
          setConnTooltip(null);
          bindCanvas.onMouseLeave(e);
        }}
        onAuxClick={bindCanvas.onAuxClick}
        onContextMenu={bindCanvas.onContextMenu}
      >
        <defs />

        {/* Transform group for pan/zoom */}
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

          {/* Connections layer — non-highlighted (behind nodes).
              rf-canv-13: extracted to ConnectionLayer in mode='background'.
              Inner-vs-outer key shape (`anim-edge-${id}` outer wrap,
              `${id}` SvgConnectionPath inner) preserved verbatim per
              blueprint risk #4 — SvgConnectionPath's internal hover state
              survives reconciliation when the wrap toggles. */}
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

          {/* rf-canv-11: <defs> block (shift-drag-shadow filter +
              per-container clipPaths) extracted to ParentClipDefs. */}
          <ParentClipDefs nodes={sortedNodes} />

          {/* Nodes layer — Groups, Blocks, Resources, or Log terminals.
              rf-canv-12: per-node dispatch (iceType + node.type → component
              choice) lives in `./canvas-renderer/node-renderer-registry`.
              The orchestrator wraps the factory's element in
              `<NodeLiftWrapper>` (rf-canv-10) and derives the wrapper's
              outer `key` from a priority chain that mirrors the original
              `wrapLift` closure: lifted → bare id, parentId → clipped-id,
              animating → anim-id, else the per-call-site `innerKey` the
              factory hands back. */}
          <g className="nodes-layer">
            {sortedNodes.map((node) => {
              // Entrance animation for AI-generated nodes
              const animDelay = animatingNodes[node.id];
              const isAnimating = animDelay !== undefined;
              const animStyle: CSSProperties | undefined = isAnimating
                ? {
                    animation: `ice-node-entrance 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${animDelay}ms both`,
                    transformOrigin: `${node.x + node.width / 2}px ${node.y + node.height / 2}px`,
                  }
                : undefined;

              // Shift-drag highlight: colored border + shadow for all dragged nodes
              const isLifted = shiftDraggingNodeIds.has(node.id);

              const { element, innerKey } = renderCanvasNode(node, renderCtx);

              // Wrapper key derivation — mirrors the original `wrapLift` outer-key
              // priority chain so React reconciliation behavior is preserved when
              // the (isLifted, parentId, isAnimating) tuple changes between renders.
              // Falls back to the per-call-site inner key (e.g. `${id}-lod${lod}`)
              // when no wrapper-level branch applies (rf-canv-10).
              const wrapperKey = isLifted
                ? node.id
                : node.parentId
                  ? `clipped-${node.id}`
                  : isAnimating
                    ? `anim-${node.id}`
                    : innerKey;

              return (
                <NodeLiftWrapper
                  key={wrapperKey}
                  node={node}
                  isAnimating={isAnimating}
                  animStyle={animStyle}
                  isLifted={isLifted}
                  dragOverGroupId={dragOverGroupId}
                >
                  {element}
                </NodeLiftWrapper>
              );
            })}
          </g>

          {/* Connection drawing preview — extracted to ConnectionPreviewOverlay (rf-canv-14).
              Bezier math + color picker live in `../utils/connection-preview` (rf-canv-8). */}
          {drawingConnection && (
            <ConnectionPreviewOverlay
              drawingConnection={drawingConnection}
              effectiveNodes={effectiveNodes}
              connectionDragTargets={connectionDragTargets}
            />
          )}

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

          {/* Ghost-mode suggestions (AI-Native #1) */}
          {ghosts.length > 0 && (
            <g pointerEvents="auto">
              {ghosts.map((ghost) => {
                const sourceNode = nodes.find((n) => n.id === ghost.sourceNodeId);
                return (
                  <React.Fragment key={ghost.id}>
                    {sourceNode && <SvgGhostEdge ghost={ghost} sourceNode={sourceNode} />}
                    <SvgGhostNode ghost={ghost} onAccept={handleAcceptGhost} onDismiss={handleDismissGhost} />
                  </React.Fragment>
                );
              })}
            </g>
          )}
        </g>
      </svg>

      {/* Connection tooltip — follows mouse, rendered as HTML overlay */}
      <ConnectionTooltip info={connTooltip} />

      {/* Controls help button — bottom-right */}
      <ControlsHelpModal />

      {/* Context Menu overlay */}
      <CanvasContextMenu />
    </div>
  );
};

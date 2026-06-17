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

import React, { useMemo, useRef } from 'react';
import { useDispatch } from 'react-redux';
// Note: Graph actions no longer used - all node operations go through cardsSlice
// Viewport is now stored per-pane in uiSlice (for split view support)
import { CanvasContent } from './canvas-renderer/canvas-content';
// ConnectionTypePopover removed — connections are fully auto-configured
import { ConnectionTooltip } from './connection-tooltip';
import { CanvasContextMenu } from './context/canvas-context-menu';
import { ControlsHelpModal } from './controls-help-modal';
import { CanvasDeployBanner } from './deploy-banner';
import { EmptyCanvasOverlay } from './empty-canvas-overlay';
// Bespoke-from-day-one nodes with inline editing
import { useClipboard } from '../../../shared/hooks/use-clipboard';
import { useExposedServices } from '../../../shared/hooks/use-exposed-services';
import { useUndoRedo } from '../../../shared/hooks/use-undo-redo';
import { useCanvasData } from '../hooks/use-canvas-data';
import { useCanvasDrop } from '../hooks/use-canvas-drop';
import { useCanvasEffects } from '../hooks/use-canvas-effects';
import { useCanvasHandlers } from '../hooks/use-canvas-handlers';
import { useCanvasInteractionsBindings } from '../hooks/use-canvas-interactions-bindings';
import { Spotlight } from './add-menu/spotlight';
import { useSpotlightShortcut } from './add-menu/use-spotlight-state';
import { useCanvasMouseRouting } from '../hooks/use-canvas-mouse-routing';
import { useCanvasDimensions } from '../hooks/use-canvas-resize';
import { useCanvasSelectors } from '../hooks/use-canvas-selectors';
import { useCanvasSideEffects } from '../hooks/use-canvas-side-effects';
import { useCanvasTraversal } from '../hooks/use-canvas-traversal';
import { useCanvasValidation } from '../hooks/use-canvas-validation';
import { useCanvasViewport } from '../hooks/use-canvas-viewport';
import { useComputingFlows } from '../hooks/use-computing-flows';
import { useConnectionDrawing } from '../hooks/use-connection-drawing';
import { useContainerMove } from '../hooks/use-container-move';
import { useContainerResize } from '../hooks/use-container-resize';
import { useDragTargetHighlight } from '../hooks/use-drag-target-highlight';
import { useGhostMode } from '../hooks/use-ghost-mode';
import { useGroupShortcut } from '../hooks/use-group-shortcut';
import { usePinnedUserNode } from '../hooks/use-pinned-user-node';
import { useRenameState } from '../hooks/use-rename-state';
import { useRenderCtx } from '../hooks/use-render-ctx';
import { isContainerNode } from '../utils/node-classification';
import { ConnectionDragProvider } from './nodes/_shared/connection-drag-context';
import { NodeValidationProvider } from './nodes/_shared/node-validation-context';
import { OrphanNodesProvider } from './nodes/_shared/orphan-context';
import { SocketHoverTooltip } from './nodes/_shared/socket-hover-tooltip';
import type { AppDispatch } from '../../../store';

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

  // rf-canv2-7: the eleven cross-slice useSelector calls + the derived
  // `card` lookup (explicit cardId vs active card) live in
  // `useCanvasSelectors`. rf-canv-17: the canvas-level deploy banner
  // owns its own deploy-slice selectors — the orchestrator only threads
  // the activeCard.id below.
  const {
    card,
    activeCard,
    selectedNodes,
    selectedEdges,
    viewLevel,
    animatingNodes,
    animatingEdges,
    aiCurrentIntent,
    pipelineNodeStatus,
    edgeStyle,
    validationIssues,
    snapToGrid,
    canvasLocked,
  } = useCanvasSelectors({ cardId });
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
    foldedRemap: _foldedRemap,
    effectiveNodes,
    canvasConnections,
    canvasItems,
    nodeValidationMap,
    nodeDepthMap: _nodeDepthMap,
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
  const { getDescendantIds, getAllDescendantIds, findContainerAtPosition } = useCanvasTraversal({
    visibleNodes,
    canvasNodes,
  });

  // rf-canv-22: bundled side-effects — install inspector once,
  // updateInspectorState + inspectLayout on viewport/lod/nodes/edges,
  // auto-organize on bulk node-count delta (threshold > 10 — blueprint
  // risk #7), logCanvasRender on render-shape changes, overlay-dismiss
  // reset on card change + AI intent. Per blueprint risk #8 the
  // setOverlayDismissed setter is preserved verbatim despite no
  // current reader — a future unit will surface the boolean.
  const { overlayDismissed, dismissOverlay } = useCanvasSideEffects({
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
  const { pinnedUserPos, setUserNodePos, userConnections, nodesWithUserNode } = usePinnedUserNode(
    effectiveNodes,
    exposedServices,
  );

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
  const { renamingNodeId, handleNodeDoubleClick, handleRenameCommit, handleRenameCancel } = useRenameState();

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

  // rf-svgcv2-3: the three inline selection-dispatch callbacks
  // (onSelect/onToggleSelect/onBoxSelect) and the snapToGrid ternary
  // live in `useCanvasInteractionsBindings`. The wrapper hook calls
  // `useCanvasInteractions` internally; the orchestrator just threads
  // its remaining args through.
  const { bindCanvas, cursor, screenToCanvas } = useCanvasInteractionsBindings({
    svgRef,
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    items: canvasItems,
    selectedIds: selectedNodes,
    onViewportChange: persistViewport,
    onItemMove: handleNodeMove,
    onItemResize: handleNodeResize,
    onContextMenu: handleContextMenu,
    onDelete: handleDeleteSelected,
    onDragOverGroup: handleDragOverGroup,
    onDragEnd: handleDragEnd,
    snapToGrid,
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
    connectionDragInfo,
    rejection: connectionRejection,
    handleConnectionPortDown,
    handleConnectionMove,
    handleConnectionEnd,
  } = useConnectionDrawing({ effectiveNodes, card, screenToCanvas });

  // rf-svgcv2-2: SVG mouse-event routing — port-drag vs connection-drag
  // vs canvas pan/select. The classList sniff for `.connection-port` on
  // onMouseDown stays in the hook (orchestrator-side per blueprint risk
  // #5 — keeps port-drag and pan/select disjoint at the dispatch seam).
  const svgMouseHandlers = useCanvasMouseRouting({
    bindCanvas,
    drawingConnection,
    handleConnectionPortDown,
    handleConnectionMove,
    handleConnectionEnd,
    setConnTooltip,
  });

  // Connection popover handlers removed — connections are auto-configured

  // rf-svgcv2-4: the eighteen-field `RenderCtx` bundle (every dep the
  // per-node renderer dispatch consumes) is constructed by `useRenderCtx`.
  // The hook also binds `getConnectedPipelineStatuses` to the live
  // `card` + `pipelineNodeStatus` slot so renderers call it as a
  // single-arg function (rf-canv2-5).
  const renderCtx = useRenderCtx({
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
    card,
  });

  // Precompute the set of "orphan" block ids — non-container, non-log
  // blocks with zero edges connected to them. Broadcast via
  // OrphanNodesProvider so CardShell does an O(1) Set.has() lookup
  // instead of every block taking its own Redux subscription.
  const orphanNodeIds = useMemo(() => {
    const connected = new Set<string>();
    for (const e of edges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    const result = new Set<string>();
    for (const n of effectiveNodes) {
      if (connected.has(n.id)) continue;
      // Log / observability blocks ARE meant to be connected to a
      // service — they're not display-only — so they belong in the
      // orphan signal too. Only containers are excluded.
      if (isContainerNode(n)) continue;
      result.add(n.id);
    }
    return result;
  }, [edges, effectiveNodes]);

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
        {...svgMouseHandlers}
      >
        <defs />

        {/* rf-svgcv2-1: the entire pan/zoom transform `<g>` body — grid +
            selection frame + background ConnectionLayer + clipPaths +
            NodesLayer + connection-drawing preview + UserTrafficOverlay +
            highlighted ConnectionLayer + GhostOverlay — lives in
            `./canvas-renderer/canvas-content`. Visual draw order, prop
            flow, and dep arrays are preserved verbatim. */}
        <OrphanNodesProvider value={orphanNodeIds}>
          <NodeValidationProvider value={nodeValidationMap}>
            <ConnectionDragProvider value={connectionDragInfo}>
              <CanvasContent
                viewport={viewport}
                dimensions={dimensions}
                canvasConnections={canvasConnections}
                effectiveNodes={effectiveNodes}
                portMap={portMap}
                animatingEdges={animatingEdges}
                pipelineNodeStatus={pipelineNodeStatus}
                selectedNodes={selectedNodes}
                selectedEdges={selectedEdges}
                hoveredNodeId={hoveredNodeId}
                lod={lod}
                edgeStyle={edgeStyle}
                handleConnectionHover={handleConnectionHover}
                handleEdgeDelete={handleEdgeDelete}
                handleEdgeSelect={handleEdgeSelect}
                handleContextMenu={handleContextMenu}
                sortedNodes={sortedNodes}
                animatingNodes={animatingNodes}
                shiftDraggingNodeIds={shiftDraggingNodeIds}
                dragOverGroupId={dragOverGroupId}
                renderCtx={renderCtx}
                drawingConnection={drawingConnection}
                connectionDragTargets={connectionDragTargets}
                connectionRejection={connectionRejection}
                showVirtualUserNode={showVirtualUserNode}
                userConnections={userConnections}
                nodesWithUserNode={nodesWithUserNode}
                pinnedUserPos={pinnedUserPos}
                setUserNodePos={setUserNodePos}
                ghosts={ghosts}
                nodes={nodes}
                onAcceptGhost={handleAcceptGhost}
                onDismissGhost={handleDismissGhost}
              />
            </ConnectionDragProvider>
          </NodeValidationProvider>
        </OrphanNodesProvider>
      </svg>

      {/* Connection tooltip — follows mouse, rendered as HTML overlay */}
      <ConnectionTooltip info={connTooltip} />

      {/* Socket hover chip — instant styled tooltip on socket dot hover. */}
      <SocketHoverTooltip />

      {/* Empty-canvas quick-start hint — only on a card with zero nodes,
          until dismissed (resets per card / on AI intent). */}
      {card && nodes.length === 0 && !overlayDismissed && <EmptyCanvasOverlay onDismiss={dismissOverlay} />}

      {/* Controls help button — bottom-right */}
      <ControlsHelpModal />

      {/* Context Menu overlay */}
      <CanvasContextMenu />

      {/* Shift+A spotlight add-block menu + the key listener that opens it. */}
      <SpotlightMount screenToCanvas={screenToCanvas} />
    </div>
  );
};

const SpotlightMount: React.FC<{ screenToCanvas: (cx: number, cy: number) => { x: number; y: number } }> = ({
  screenToCanvas,
}) => {
  useSpotlightShortcut({ screenToCanvas });
  useGroupShortcut();
  return <Spotlight />;
};

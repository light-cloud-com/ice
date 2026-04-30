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

import React, { useRef, useEffect, useMemo, useCallback, useState, type CSSProperties } from 'react';
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
import { type ConnectionTooltipInfo } from './svg-connection-path';
import { isContainer } from '../../../config/containment-rules';
import { isTypeVisibleAtLevel } from '../../../config/visualization-config';
import { useUndoRedo } from '../../../shared/hooks/use-undo-redo';
import {
  selectActiveCard,
  updateCardNodeData,
  deleteCardNode,
  deleteCardEdge,
  type CardEdge,
} from '../../../store/slices/cards-slice';
import {
  isNodeFolded as isNodeFoldedUtil,
  hasCollapsedAncestor as hasCollapsedAncestorUtil,
  buildFoldedRemap,
  descendants,
} from '../utils/folded-remap';
import { computeNodeSizes, toLocalCanvasNode } from '../utils/canvas-node-sizing';
import {
  calculateContainerBounds as calculateContainerBoundsUtil,
} from '../utils/container-bounds';
import {
  findContainerAtPosition as findContainerAtPositionUtil,
} from '../utils/drop-target';
import { buildVisibleConnections, computePortMap } from '../utils/canvas-connections';
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
import { calculateZIndex } from '../../../shared/utils/auto-layout';
import { receiveCardPipelineUpdate } from '../../../store/slices/pipeline-slice';
import {
  setSelectedNodes,
  setSelectedEdges,
  toggleNodeSelection,
  setSelectionRect,
} from '../../../store/slices/selection-slice';
import { openContextMenu } from '../../../store/slices/ui-slice';
import { useCanvasInteractions, type CanvasItem } from '../hooks/use-canvas-interactions';
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
import type { RootState, AppDispatch } from '../../../store';

// rf-canv-1: re-export shim — the canonical home for these three types is
// `./types`. 11+ consumers still import them from this file; keep the shim
// so they continue to resolve. `export type` makes this a type-only forward
// (no runtime cost). Internal usages of `CanvasNode` / `CanvasConnection`
// rely on the import below; the re-export alone would not bring them into
// scope.
export type { CanvasNode, ViewState, CanvasConnection } from './types';
import type { CanvasNode, CanvasConnection } from './types';

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

// Alias for internal use
type LocalCanvasNode = CanvasNode;

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

  // Get nodes and edges from the card
  const nodes = useMemo(() => card?.nodes || [], [card?.nodes]);
  const edges = useMemo(() => card?.edges || [], [card?.edges]);

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

  // Convert Redux nodes to canvas format with type-based sizing.
  // Uses VISUAL dimensions: folded nodes get their collapsed height (36-38px)
  // so hit-testing, container expansion, and rendering all use consistent bounds.
  // rf-canv-5: per-node sizing dispatch + projection live in
  // `../utils/canvas-node-sizing` (`computeNodeSizes` + `toLocalCanvasNode`).
  const canvasNodes: LocalCanvasNode[] = useMemo(() => {
    return nodes.map((node) => {
      const hasPipelineStatus = !!(pipelineNodeStatus[node.id] && pipelineNodeStatus[node.id].status !== 'idle');
      const sizes = computeNodeSizes(node, hasPipelineStatus);
      return toLocalCanvasNode(node, hasPipelineStatus, sizes);
    });
  }, [nodes, pipelineNodeStatus]);

  // Filter nodes by view level, promoting children of hidden parents to root
  const visibleNodes: LocalCanvasNode[] = useMemo(() => {
    const visible = canvasNodes.filter((node) => {
      const iceType = (node.data.iceType as string) || '';
      if (!isTypeVisibleAtLevel(iceType, viewLevel)) return false;
      return true;
    });
    const visibleIds = new Set(visible.map((n) => n.id));

    return visible.map((node) => {
      // Promote children whose parent was filtered out
      let updated = node;
      if (node.parentId && !visibleIds.has(node.parentId)) {
        updated = { ...updated, parentId: null };
      }
      return updated;
    });
  }, [canvasNodes, viewLevel]);

  // Check if a node is collapsed/folded.
  // rf-canv-3: thin wrapper binding to the pure util in ../utils/folded-remap.
  const isNodeFolded = useCallback(
    (nodeId: string): boolean => isNodeFoldedUtil(visibleNodes, nodeId),
    [visibleNodes],
  );

  // Check if any ancestor is folded (node should be hidden).
  // rf-canv-3: thin wrapper binding to the pure util in ../utils/folded-remap.
  const hasCollapsedAncestor = useCallback(
    (nodeId: string): boolean => hasCollapsedAncestorUtil(visibleNodes, nodeId),
    [visibleNodes],
  );

  // Build remap for folded children: hidden node ID → first visible ancestor ID.
  // rf-canv-3: pure walk lives in ../utils/folded-remap; the orchestrator just
  // memoizes the result for downstream effective-node / edge-routing memos.
  const foldedRemap = useMemo(
    () => buildFoldedRemap(canvasNodes, visibleNodes),
    [canvasNodes, visibleNodes],
  );

  // Nodes as they appear visually — hidden children removed, folded groups at compact height.
  // Used for connection routing so paths match what's actually rendered.
  const effectiveNodes: LocalCanvasNode[] = useMemo(() => {
    const FOLDED_HEIGHT = 38; // collapsed pill height for all node types
    return visibleNodes
      .filter((node) => !hasCollapsedAncestor(node.id))
      .map((node) => {
        if (node.data?.folded) {
          return { ...node, height: FOLDED_HEIGHT };
        }
        return node;
      });
  }, [visibleNodes, hasCollapsedAncestor]);

  // Convert edges to canvas format
  // - Filters out 'contains' edges (groups are visual only)
  // - Remaps connections to folded children → their visible parent group
  // - Deduplicates and bundles remapped connections (shows count badge)
  // - At Level 1: aggregates child resource edges into block-to-block inferred edges
  const canvasConnections: CanvasConnection[] = useMemo(
    () => buildVisibleConnections({ edges, effectiveNodes, foldedRemap, viewLevel }),
    [edges, effectiveNodes, foldedRemap, viewLevel],
  );

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

  // Nodes are draggable unless they have a collapsed ancestor
  // Sorted by z-index so hit-testing (reverse iteration) finds children before parents
  const canvasItems: CanvasItem[] = useMemo(() => {
    // Compute nesting depth for each node so children always render above parents
    const depthMap = new Map<string, number>();
    const getDepth = (nodeId: string | undefined): number => {
      if (!nodeId) return 0;
      if (depthMap.has(nodeId)) return depthMap.get(nodeId)!;
      const node = visibleNodes.find((n) => n.id === nodeId);
      const d = node?.parentId ? getDepth(node.parentId) + 1 : 0;
      depthMap.set(nodeId, d);
      return d;
    };

    // Build items with z-index for sorting
    const items = visibleNodes
      .filter((node) => !hasCollapsedAncestor(node.id))
      .map((node) => {
        const iceType = (node.data?.iceType as string) || '';
        const depth = getDepth(node.id);
        return {
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          parentId: node.parentId,
          _z: calculateZIndex(iceType, depth),
        };
      });
    items.sort((a, b) => a._z - b._z);
    // Strip the _z field for the CanvasItem type
    return items.map(({ _z, ...item }) => item);
  }, [visibleNodes, hasCollapsedAncestor]);

  // Get descendant IDs from VISIBLE nodes only (for box selection, reparenting).
  // rf-canv-3: thin wrapper binding to the pure descendants() walk.
  const getDescendantIds = useCallback(
    (nodeId: string): string[] => descendants(visibleNodes, nodeId),
    [visibleNodes],
  );

  // Get ALL descendant IDs including hidden children (searches canvasNodes, not visibleNodes).
  // Used by handleNodeMove so hidden block children at L1 move with their parent.
  // rf-canv-3: thin wrapper binding to the same pure descendants() walk, fed canvasNodes.
  const getAllDescendantIds = useCallback(
    (nodeId: string): string[] => descendants(canvasNodes, nodeId),
    [canvasNodes],
  );

  // rf-canv-4: thin wrapper binding `visibleNodes` to the pure
  // calculateContainerBounds util. Hook identity preserved so downstream
  // useCallback / useMemo consumers see no change.
  const calculateContainerBounds = useCallback(
    (containerId: string, nodeStates: Map<string, { x: number; y: number; width: number; height: number }>) =>
      calculateContainerBoundsUtil(visibleNodes, containerId, nodeStates),
    [visibleNodes],
  );

  // rf-canv-25a: container-resize half — `recalculateAncestorBounds` thin
  // wrapper, `calculateMinimumContainerSize`, and `handleNodeResize` are
  // owned by `useContainerResize`. The two helpers are kept in this
  // destructure even though the orchestrator currently has no callsite for
  // them — they're held for a future reparent-machinery extraction (rf-
  // canv-26 + beyond). See learnings.md `brief-vs-rf-canv-21-trim-rule-when-
  // the-planner-knows-the-future-callsite`.
  const { recalculateAncestorBounds, calculateMinimumContainerSize, handleNodeResize } =
    useContainerResize({ visibleNodes });

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

  // Handle delete selected nodes
  const handleDeleteSelected = useCallback(() => {
    for (const nodeId of selectedNodes) {
      dispatch(deleteCardNode(nodeId));
    }
    dispatch(setSelectedNodes([]));
  }, [selectedNodes, dispatch]);

  // Track which node is hovered (for highlighting connected edges)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // Inline rename state — extracted to useRenameState (rf-canv-20).
  const { renamingNodeId, handleNodeDoubleClick, handleRenameCommit, handleRenameCancel } =
    useRenameState();
  // Track connection tooltip (follows mouse)
  const [connTooltip, setConnTooltip] = useState<ConnectionTooltipInfo | null>(null);
  // rf-canv-22: empty-canvas overlay dismiss state + the two effects that
  // toggle it (per-card-id reset + per-AI-intent dismiss) are owned by
  // useCanvasSideEffects. Per blueprint risk #8 the getter is destructured-
  // discarded; a future unit will surface the boolean to the overlay child.

  const handleNodeHover = useCallback((nodeId: string | null) => {
    setHoveredNodeId(nodeId);
  }, []);

  const handleConnectionHover = useCallback((info: ConnectionTooltipInfo | null) => {
    setConnTooltip(info);
  }, []);

  const handleEdgeDelete = useCallback(
    (connectionId: string) => {
      dispatch(deleteCardEdge(connectionId));
    },
    [dispatch],
  );

  const handleEdgeSelect = useCallback(
    (connectionId: string) => {
      dispatch(setSelectedNodes([]));
      dispatch(setSelectedEdges([connectionId]));
    },
    [dispatch],
  );

  // Update node data fields (for inline controls like +/- scaling).
  // Property propagation (repo sync, domain sync, etc.) is handled
  // reactively by useComputingFlows() — no manual forwarding needed.
  const handleUpdateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      dispatch(updateCardNodeData({ nodeId, data }));
    },
    [dispatch],
  );

  // Select node to show pipeline in properties panel
  const handlePipelineClick = useCallback(
    (nodeId: string) => {
      dispatch(setSelectedNodes([nodeId]));
      dispatch(setSelectedEdges([]));
    },
    [dispatch],
  );

  // Get pipeline statuses for all service nodes connected to a Source.Repository block
  const getConnectedPipelineStatuses = useCallback(
    (node: CanvasNode) => {
      const iceType = (node.data?.iceType as string) || '';
      if (iceType !== 'Source.Repository' && node.data?.behavior !== 'source') return [];
      if (!card) return [];

      const cardEdges = card.edges as CardEdge[];
      const connectedEdges = cardEdges.filter((e) => e.source === node.id || e.target === node.id);
      const statuses: Array<{ status: 'idle' | 'queued' | 'building' | 'deploying' | 'success' | 'failed' }> = [];

      for (const edge of connectedEdges) {
        const serviceId = edge.source === node.id ? edge.target : edge.source;
        const ps = pipelineNodeStatus[serviceId];
        if (ps) statuses.push(ps);
      }
      return statuses;
    },
    [card, pipelineNodeStatus],
  );

  // Build per-node validation lookup from validation issues
  const nodeValidationMap = useMemo(() => {
    const map = new Map<string, { severity: 'error' | 'warning' | 'info'; count: number }>();
    for (const issue of validationIssues) {
      if (!issue.nodeId) continue;
      const existing = map.get(issue.nodeId);
      const count = (existing?.count ?? 0) + 1;
      // Keep highest severity: error > warning > info
      const severityRank = { error: 3, warning: 2, info: 1 } as const;
      const currentRank = existing ? severityRank[existing.severity] : 0;
      const issueRank = severityRank[issue.severity as keyof typeof severityRank] ?? 0;
      const severity =
        issueRank > currentRank ? (issue.severity as 'error' | 'warning' | 'info') : (existing?.severity ?? 'info');
      map.set(issue.nodeId, { severity, count });
    }
    return map;
  }, [validationIssues]);

  // Subscribe to card-level pipeline Socket.IO events
  useEffect(() => {
    if (!card?.id) return;
    let unsubCard: (() => void) | undefined;
    let cleanupCard: (() => void) | undefined;

    import('../../../shared/api/api-adapter')
      .then(({ getApi }) => {
        const api = getApi();
        unsubCard = api.subscribeCardPipeline?.(card!.id);
        cleanupCard = api.onCardPipelineUpdate?.((event: any) => {
          dispatch(receiveCardPipelineUpdate(event));
        });
      })
      .catch(() => {});

    return () => {
      unsubCard?.();
      cleanupCard?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use card?.id only to avoid re-subscribing on every card mutation
  }, [card?.id, dispatch]);

  // rf-canv-26: `handleDragOverGroup` (shift-drag highlight + exit-indicator)
  // and `handleDragEnd` (Ctrl/Cmd reparent with canContain validation +
  // post-reparent ancestor expansion) live in `useDragTargetHighlight` —
  // destructured above near `useContainerMove`. The `isContainerNode`
  // memoized predicate that wrapped `isContainerNodeUtil` for the inline
  // hit-test moved into the hook with them.

  // Handle context menu
  const handleContextMenu = useCallback(
    (position: { x: number; y: number }, type: 'canvas' | 'node' | 'edge', targetId?: string) => {
      // Compute canvas position from viewport (avoids dependency on screenToCanvas)
      const rect = svgRef.current?.getBoundingClientRect();
      const canvasPos = rect
        ? {
            x: (position.x - rect.left - viewport.x) / viewport.zoom,
            y: (position.y - rect.top - viewport.y) / viewport.zoom,
          }
        : { x: 0, y: 0 };
      dispatch(openContextMenu({ position, canvasPosition: canvasPos, type, targetId }));
    },
    [dispatch, viewport.x, viewport.y, viewport.zoom],
  );

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

  // Non-passive wheel listener for zoom (React onWheel is passive, preventDefault fails)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setConnTooltip(null);
      bindCanvas.onWheel(e as any);
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, [bindCanvas]);

  // Find container at position for drop handling. Predicate matches the
  // verbatim L1635 inline rule: containment-rules `isContainer`, plus any
  // iceType beginning with `Group.` or `Network.` (broader than the
  // node-classification `isContainerNode` predicate other sites use).
  const findContainerAtPosition = useCallback(
    (x: number, y: number): LocalCanvasNode | null =>
      findContainerAtPositionUtil(visibleNodes, x, y, (n) => {
        const iceType = (n.data.iceType as string) || '';
        return isContainer(iceType) || iceType.startsWith('Group.') || iceType.startsWith('Network.');
      }),
    [visibleNodes],
  );

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

  // rf-canv-23: ghost accept/dismiss callbacks and the 10s auto-dismiss
  // timer now live in `useGhostMode` (called above).

  // Sort nodes by z-index for proper rendering (containers behind resources)
  // Exclude nodes whose parent is collapsed
  // Compute nesting depth for rendering z-order
  const nodeDepthMap = useMemo(() => {
    const map = new Map<string, number>();
    const getDepth = (nodeId: string | undefined): number => {
      if (!nodeId) return 0;
      if (map.has(nodeId)) return map.get(nodeId)!;
      const node = visibleNodes.find((n) => n.id === nodeId);
      const d = node?.parentId ? getDepth(node.parentId) + 1 : 0;
      map.set(nodeId, d);
      return d;
    };
    for (const node of visibleNodes) {
      getDepth(node.id);
    }
    return map;
  }, [visibleNodes]);

  const sortedNodes = useMemo(() => {
    return [...visibleNodes]
      .filter((node) => !hasCollapsedAncestor(node.id))
      .sort((a, b) => {
        const aIceType = (a.data.iceType as string) || '';
        const bIceType = (b.data.iceType as string) || '';
        const aZIndex = calculateZIndex(aIceType, nodeDepthMap.get(a.id) || 0);
        const bZIndex = calculateZIndex(bIceType, nodeDepthMap.get(b.id) || 0);

        if (aZIndex !== bZIndex) return aZIndex - bZIndex;

        // Selected nodes on top
        const aSelected = selectedNodes.includes(a.id);
        const bSelected = selectedNodes.includes(b.id);
        if (aSelected && !bSelected) return 1;
        if (!aSelected && bSelected) return -1;
        return 0;
      });
  }, [visibleNodes, selectedNodes, hasCollapsedAncestor, nodeDepthMap]);

  // Compute port map for connection distribution
  // For each node+side, sort connections by the OTHER endpoint's position
  // so that ports fan out in natural order without crossings.
  const portMap = useMemo(
    () => computePortMap(canvasConnections, effectiveNodes),
    [canvasConnections, effectiveNodes],
  );

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

  // Handle focus/click on canvas
  const handleCanvasClick = useCallback(() => {
    onFocus?.();
  }, [onFocus]);

  // rf-canv-12: bundle every dependency the per-node renderer dispatch
  // consumes into a single object so the `sortedNodes.map(...)` body stays
  // a one-liner. Field shapes mirror the local declarations verbatim — see
  // `RenderCtx` in `./canvas-renderer/node-renderer-registry.tsx`.
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
    getConnectedPipelineStatuses,
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

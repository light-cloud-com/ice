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
import { getBlueprint, expandBlueprint } from '../../../config/blocks';
import { canContain, isContainer } from '../../../config/containment-rules';
import { isTypeVisibleAtLevel } from '../../../config/visualization-config';
import { useUndoRedo } from '../../../shared/hooks/use-undo-redo';
import {
  selectActiveCard,
  addNodeToCard,
  addEdgeToCard,
  expandBlueprintToCard,
  updateCardNodePosition,
  updateCardNodePositions,
  resizeCardNode,
  toggleCardNodeFold,
  updateCardNodeParent,
  updateCardNodeData,
  deleteCardNode,
  deleteCardEdge,
  autoOrganizeCard,
  type CardNode,
  type CardEdge,
} from '../../../store/slices/cards-slice';
import { setGhosts, dismissGhost, clearGhosts, type GhostNode } from '../../../store/slices/ghost-slice';
import { generateGhostSuggestions } from '../utils/ghost-suggestions';
import {
  isContainerNode as isContainerNodeUtil,
  isGroupOrBlock,
} from '../utils/node-classification';
import {
  isNodeFolded as isNodeFoldedUtil,
  hasCollapsedAncestor as hasCollapsedAncestorUtil,
  buildFoldedRemap,
  descendants,
} from '../utils/folded-remap';
import { computeNodeSizes, toLocalCanvasNode } from '../utils/canvas-node-sizing';
import {
  calculateContainerBounds as calculateContainerBoundsUtil,
  recalculateAncestorBounds as recalculateAncestorBoundsUtil,
  CONTAINER_HEADER_H,
  CONTAINER_PAD,
} from '../utils/container-bounds';
import {
  findContainerAtPosition as findContainerAtPositionUtil,
  findSmallestContainerHit,
} from '../utils/drop-target';
import { findExistingSpecialConnection } from '../utils/connection-special-rules';
import { buildVisibleConnections, computePortMap } from '../utils/canvas-connections';
import { SvgGhostNode } from './ghost/svg-ghost-node';
import {
  inferConnectionMeta,
  validateConnection,
  wouldCreateCycle,
  canConnect,
  CATEGORY_TO_RELATIONSHIP,
} from '../utils/connection-rules';
import { computeCompactNodeHeight, computeCompactNodeWidth } from './nodes/compact-node';
import { NodeLiftWrapper } from './canvas-renderer/lift-wrapper';
import { ParentClipDefs } from './canvas-renderer/parent-clip-defs';
import { renderCanvasNode, type RenderCtx } from './canvas-renderer/node-renderer-registry';
// Bespoke-from-day-one nodes with inline editing
import {
  MIN_CONTAINER_WIDTH,
  MIN_CONTAINER_HEIGHT,
  GRID_SIZE,
} from '../../../config/canvas-constants';
import { useClipboard } from '../../../shared/hooks/use-clipboard';
import { useExposedServices } from '../../../shared/hooks/use-exposed-services';
import { calculateZIndex } from '../../../shared/utils/auto-layout';
import { logCanvasRender, logDrop, logBlueprint } from '../../../shared/utils/debug-logger';
import { inspectLayout, updateInspectorState, installInspector } from '../../../shared/utils/layout-inspector';
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

  // Ghost-mode suggestions (AI-Native Feature #1)
  const ghosts = useSelector((state: RootState) => state.ghosts.ghosts);

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

  // ── Layout Inspector: feed state on every zoom/layout change ──────────
  useEffect(() => {
    installInspector();
  }, []);

  useEffect(() => {
    const inspectNodes = nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: (n.data?.label as string) || n.id,
      iceType: (n.data?.iceType as string) || '',
      x: n.position.x,
      y: n.position.y,
      width: n.width,
      height: n.height,
      parentId: n.parentId,
      folded: !!n.data?.folded,
    }));
    const inspectEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      relationship: e.data?.relationship as string | undefined,
    }));
    const state = { zoom: viewport.zoom, lod, nodes: inspectNodes, edges: inspectEdges };
    updateInspectorState(state);

    // Auto-log when ice-debug is enabled
    try {
      if (localStorage.getItem('ice-debug') === 'true') {
        inspectLayout(state);
      }
    } catch {
      /* ignore */
    }
  }, [viewport.zoom, lod, nodes, edges]);

  // Canvas dimensions — ResizeObserver-tracked, default 800x600 until first
  // measurement. rf-canv-18: extracted to `../hooks/use-canvas-resize`.
  const dimensions = useCanvasDimensions(containerRef);

  // Track previous node count for auto-organize on import
  const prevNodeCountRef = useRef(0);

  useEffect(() => {
    const currentCount = nodes.length;
    const prevCount = prevNodeCountRef.current;

    // Auto-organize when nodes are imported (0 → many, or large bulk add)
    // Threshold >10 avoids triggering on blueprint drops (container + 1-3 children = 2-4 nodes)
    if (currentCount > 0 && (prevCount === 0 || currentCount - prevCount > 10)) {
      const timer = setTimeout(() => {
        dispatch(autoOrganizeCard({ zoom: viewport.zoom }));
      }, 100);
      prevNodeCountRef.current = currentCount;
      return () => clearTimeout(timer);
    }

    prevNodeCountRef.current = currentCount;
    // viewport.zoom intentionally omitted — re-running on zoom changes would
    // trigger spurious auto-organize calls; we only care about node-count jumps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, dispatch]);

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

  // Debug: log canvas state on render
  useEffect(() => {
    logCanvasRender({
      nodeCount: canvasNodes.length,
      edgeCount: edges.length,
      visibleCount: effectiveNodes.length,
      viewLevel,
    });
  }, [canvasNodes.length, edges.length, effectiveNodes.length, viewLevel]);

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

  // rf-canv-4: thin wrapper binding `visibleNodes` to the pure
  // recalculateAncestorBounds util.
  const recalculateAncestorBounds = useCallback(
    (
      startNodeId: string,
      nodeStates: Map<string, { x: number; y: number; width: number; height: number }>,
    ) => recalculateAncestorBoundsUtil(visibleNodes, startNodeId, nodeStates),
    [visibleNodes],
  );

  // Handle moving a node and all its children, then expand ancestor containers.
  // skipAncestorResize: when Shift is held (reparent mode), don't resize the parent container.
  // Uses getAllDescendantIds so hidden block children at L1 also move with their parent.
  const handleNodeMove = useCallback(
    (id: string, newX: number, newY: number, skipAncestorResize?: boolean) => {
      const node = visibleNodes.find((n) => n.id === id);
      if (!node) return;

      const deltaX = newX - node.x;
      const deltaY = newY - node.y;

      // Collect all position updates
      const positionUpdates: Array<{ id: string; position: { x: number; y: number } }> = [];
      const sizeUpdates: Array<{ id: string; width: number; height: number }> = [];

      // 1. Move the dragged node
      positionUpdates.push({ id, position: { x: newX, y: newY } });

      // 2. Move ALL descendants (including hidden children at L1)
      const descendantIds = getAllDescendantIds(id);
      for (const descId of descendantIds) {
        const desc = canvasNodes.find((n) => n.id === descId);
        if (desc) {
          positionUpdates.push({ id: descId, position: { x: desc.x + deltaX, y: desc.y + deltaY } });
        }
      }

      // 3. Expand ancestor containers if child overflows their bounds.
      //    Walk up the parent chain: for each ancestor, check if the moved node
      //    (or its siblings) extend beyond the container. If so, shift position
      //    and increase size directly.
      if (!skipAncestorResize && node.parentId) {
        let currentNode = node;

        while (currentNode.parentId) {
          const parent = visibleNodes.find((n) => n.id === currentNode.parentId);
          if (!parent || parent.data?.folded) break;

          // Get parent's latest state (may have been updated in a previous iteration)
          const existingPosUpdate = positionUpdates.find((u) => u.id === parent.id);
          const existingSizeUpdate = sizeUpdates.find((u) => u.id === parent.id);
          let px = existingPosUpdate?.position.x ?? parent.x;
          let py = existingPosUpdate?.position.y ?? parent.y;
          let pw = existingSizeUpdate?.width ?? parent.width;
          let ph = existingSizeUpdate?.height ?? parent.height;

          // Compute bounding box of ALL children of this parent
          const siblings = visibleNodes.filter((n) => n.parentId === parent.id);
          let childMinX = Infinity,
            childMinY = Infinity;
          let childMaxR = -Infinity,
            childMaxB = -Infinity;

          for (const sib of siblings) {
            // Use updated position if this sibling was moved
            const sibUpdate = positionUpdates.find((u) => u.id === sib.id);
            const sx = sibUpdate?.position.x ?? sib.x;
            const sy = sibUpdate?.position.y ?? sib.y;
            childMinX = Math.min(childMinX, sx);
            childMinY = Math.min(childMinY, sy);
            childMaxR = Math.max(childMaxR, sx + sib.width);
            childMaxB = Math.max(childMaxB, sy + sib.height);
          }

          if (!isFinite(childMinX)) break;

          // Check each edge and expand toward the child
          const padL = CONTAINER_PAD;
          const padT = CONTAINER_PAD + CONTAINER_HEADER_H;
          const padR = CONTAINER_PAD;
          const padB = CONTAINER_PAD;

          let changed = false;

          // Left overflow: child extends past left edge
          const overflowL = px + padL - childMinX;
          if (overflowL > 0) {
            px -= overflowL;
            pw += overflowL;
            changed = true;
          }

          // Top overflow: child extends past top edge
          const overflowT = py + padT - childMinY;
          if (overflowT > 0) {
            py -= overflowT;
            ph += overflowT;
            changed = true;
          }

          // Right overflow: child extends past right edge
          const overflowR = childMaxR - (px + pw - padR);
          if (overflowR > 0) {
            pw += overflowR;
            changed = true;
          }

          // Bottom overflow: child extends past bottom edge
          const overflowB = childMaxB - (py + ph - padB);
          if (overflowB > 0) {
            ph += overflowB;
            changed = true;
          }

          if (changed) {
            pw = Math.max(MIN_CONTAINER_WIDTH, pw);
            ph = Math.max(MIN_CONTAINER_HEIGHT, ph);

            // Update or add position entry
            if (existingPosUpdate) {
              existingPosUpdate.position.x = px;
              existingPosUpdate.position.y = py;
            } else {
              positionUpdates.push({ id: parent.id, position: { x: px, y: py } });
            }

            // Update or add size entry
            if (existingSizeUpdate) {
              existingSizeUpdate.width = pw;
              existingSizeUpdate.height = ph;
            } else {
              sizeUpdates.push({ id: parent.id, width: pw, height: ph });
            }
          }

          // Walk up to grandparent
          currentNode = parent as any;
        }
      }

      // BND-1/BND-3: After expansion, clamp the dragged node to its parent's
      // (now expanded) bounds so it never ends up outside the container.
      // This also catches snap-to-grid rounding that might push a node past the edge.
      if (node.parentId && !skipAncestorResize) {
        const parent = visibleNodes.find((n) => n.id === node.parentId);
        if (parent && !parent.data?.folded) {
          const parentPosUpdate = positionUpdates.find((u) => u.id === parent.id);
          const parentSizeUpdate = sizeUpdates.find((u) => u.id === parent.id);
          const px = parentPosUpdate?.position.x ?? parent.x;
          const py = parentPosUpdate?.position.y ?? parent.y;
          const pw = parentSizeUpdate?.width ?? parent.width;
          const ph = parentSizeUpdate?.height ?? parent.height;

          const minX = px + CONTAINER_PAD;
          const minY = py + CONTAINER_PAD + CONTAINER_HEADER_H;
          const maxX = px + pw - CONTAINER_PAD - node.width;
          const maxY = py + ph - CONTAINER_PAD - node.height;

          const nodeUpdate = positionUpdates.find((u) => u.id === id);
          if (nodeUpdate) {
            const clampedX = Math.max(minX, Math.min(maxX, nodeUpdate.position.x));
            const clampedY = Math.max(minY, Math.min(maxY, nodeUpdate.position.y));

            if (clampedX !== nodeUpdate.position.x || clampedY !== nodeUpdate.position.y) {
              const adjustX = clampedX - nodeUpdate.position.x;
              const adjustY = clampedY - nodeUpdate.position.y;
              nodeUpdate.position.x = clampedX;
              nodeUpdate.position.y = clampedY;

              // Also adjust all descendants by the same delta
              for (const descId of descendantIds) {
                const descUpdate = positionUpdates.find((u) => u.id === descId);
                if (descUpdate) {
                  descUpdate.position.x += adjustX;
                  descUpdate.position.y += adjustY;
                }
              }
            }
          }
        }
      }

      // Skip clamping when:
      // 1. Shift+drag (reparent mode) — node needs to escape its container
      // 2. Dragging a container with descendants — children are rigidly translated
      //    with the parent, so clamping would disturb their relative positions
      //    (auto-layout uses different padding than the clamp bounds)
      const hasDescendants = descendantIds.length > 0;
      const shouldSkipClamp = skipAncestorResize || hasDescendants;
      dispatch(
        updateCardNodePositions(shouldSkipClamp ? { updates: positionUpdates, skipClamp: true } : positionUpdates),
      );
      for (const su of sizeUpdates) {
        dispatch(resizeCardNode(su));
      }

      // Detect if dragged node is near its parent's edge (exit indicator)
      if (node.parentId) {
        const parent = visibleNodes.find((n) => n.id === node.parentId);
        if (parent) {
          const margin = 30;
          const isNearEdge =
            newX < parent.x + margin ||
            newY < parent.y + margin ||
            newX + node.width > parent.x + parent.width - margin ||
            newY + node.height > parent.y + parent.height - margin;
          setExitingGroupId(isNearEdge ? parent.id : null);
        }
      } else {
        setExitingGroupId(null);
      }
    },
    [visibleNodes, canvasNodes, getAllDescendantIds, dispatch],
  );

  // Handle fold/unfold with ancestor container expansion.
  // When unfolding a node near a parent's edge, the expanded height may overflow —
  // so we expand ancestor containers to keep the unfolded node fully contained.
  const handleToggleFold = useCallback(
    (nodeId: string) => {
      const node = visibleNodes.find((n) => n.id === nodeId);
      if (!node) {
        dispatch(toggleCardNodeFold(nodeId));
        return;
      }

      const wasFolded = !!node.data?.folded;
      dispatch(toggleCardNodeFold(nodeId));

      // Only need to resize when UNFOLDING (node gets taller, must fit children)
      if (!wasFolded) return;

      const positionUpdates: Array<{ id: string; position: { x: number; y: number } }> = [];
      const sizeUpdates: Array<{ id: string; width: number; height: number }> = [];

      // Step 1: Resize the unfolded node itself to encompass its children.
      // Children may have been moved while hidden, or this is the first unfold
      // after auto-organize. Use the FULL canvas nodes (not visibleNodes which
      // has folded height) to find children positions.
      const childrenOfNode = canvasNodes.filter((n) => n.parentId === nodeId);
      let selfW = node.width;
      let selfH = node.height; // This is the folded visual height (36px)
      let selfX = node.x;
      let selfY = node.y;

      if (childrenOfNode.length > 0) {
        let cMinX = Infinity,
          cMinY = Infinity;
        let cMaxR = -Infinity,
          cMaxB = -Infinity;

        for (const child of childrenOfNode) {
          cMinX = Math.min(cMinX, child.x);
          cMinY = Math.min(cMinY, child.y);
          cMaxR = Math.max(cMaxR, child.x + child.width);
          cMaxB = Math.max(cMaxB, child.y + child.height);
        }

        // Expand self to fit children
        const overL = selfX + CONTAINER_PAD - cMinX;
        if (overL > 0) {
          selfX -= overL;
          selfW += overL;
        }

        const overT = selfY + CONTAINER_PAD + CONTAINER_HEADER_H - cMinY;
        if (overT > 0) {
          selfY -= overT;
          selfH += overT;
        }

        const overR = cMaxR - (selfX + selfW - CONTAINER_PAD);
        if (overR > 0) {
          selfW += overR;
        }

        const overB = cMaxB - (selfY + selfH - CONTAINER_PAD);
        if (overB > 0) {
          selfH += overB;
        }

        selfW = Math.max(MIN_CONTAINER_WIDTH, selfW);
        selfH = Math.max(MIN_CONTAINER_HEIGHT, selfH);
      } else {
        // No children — use the stored expanded height from Redux
        const reduxNode = nodes.find((n: any) => n.id === nodeId);
        const defaultH = computeCompactNodeHeight(
          node.data as Record<string, unknown>,
          isGroupOrBlock(node),
          false,
        );
        selfH = Math.max(reduxNode?.height || 0, defaultH, MIN_CONTAINER_HEIGHT);
      }

      // Apply self resize
      if (selfX !== node.x || selfY !== node.y) {
        positionUpdates.push({ id: nodeId, position: { x: selfX, y: selfY } });
      }
      if (selfW !== node.width || selfH !== node.height) {
        sizeUpdates.push({ id: nodeId, width: selfW, height: selfH });
      }

      // Step 2: Walk up ancestors and expand them to fit the resized node
      if (node.parentId) {
        let current = node;
        while (current.parentId) {
          const parent = visibleNodes.find((n) => n.id === current.parentId);
          if (!parent || parent.data?.folded) break;

          const existingPosUpdate = positionUpdates.find((u) => u.id === parent.id);
          const existingSizeUpdate = sizeUpdates.find((u) => u.id === parent.id);
          let px = existingPosUpdate?.position.x ?? parent.x;
          let py = existingPosUpdate?.position.y ?? parent.y;
          let pw = existingSizeUpdate?.width ?? parent.width;
          let ph = existingSizeUpdate?.height ?? parent.height;

          // Compute children bounds, using the expanded size for the unfolded node
          const siblings = visibleNodes.filter((n) => n.parentId === parent.id);
          let childMinX = Infinity,
            childMinY = Infinity;
          let childMaxR = -Infinity,
            childMaxB = -Infinity;

          for (const sib of siblings) {
            // Use the computed expanded bounds for the just-unfolded node
            const sx = sib.id === nodeId ? selfX : sib.x;
            const sy = sib.id === nodeId ? selfY : sib.y;
            const sw = sib.id === nodeId ? selfW : sib.width;
            const sh = sib.id === nodeId ? selfH : sib.height;
            childMinX = Math.min(childMinX, sx);
            childMinY = Math.min(childMinY, sy);
            childMaxR = Math.max(childMaxR, sx + sw);
            childMaxB = Math.max(childMaxB, sy + sh);
          }

          if (!isFinite(childMinX)) break;

          let changed = false;

          const overflowL = px + CONTAINER_PAD - childMinX;
          if (overflowL > 0) {
            px -= overflowL;
            pw += overflowL;
            changed = true;
          }

          const overflowT = py + CONTAINER_PAD + CONTAINER_HEADER_H - childMinY;
          if (overflowT > 0) {
            py -= overflowT;
            ph += overflowT;
            changed = true;
          }

          const overflowR = childMaxR - (px + pw - CONTAINER_PAD);
          if (overflowR > 0) {
            pw += overflowR;
            changed = true;
          }

          const overflowB = childMaxB - (py + ph - CONTAINER_PAD);
          if (overflowB > 0) {
            ph += overflowB;
            changed = true;
          }

          if (changed) {
            pw = Math.max(MIN_CONTAINER_WIDTH, pw);
            ph = Math.max(MIN_CONTAINER_HEIGHT, ph);
            if (existingPosUpdate) {
              existingPosUpdate.position.x = px;
              existingPosUpdate.position.y = py;
            } else {
              positionUpdates.push({ id: parent.id, position: { x: px, y: py } });
            }
            if (existingSizeUpdate) {
              existingSizeUpdate.width = pw;
              existingSizeUpdate.height = ph;
            } else {
              sizeUpdates.push({ id: parent.id, width: pw, height: ph });
            }
          }

          current = parent as any;
        }
      }

      // Dispatch all expansions
      if (positionUpdates.length > 0) {
        dispatch(updateCardNodePositions(positionUpdates));
      }
      for (const su of sizeUpdates) {
        dispatch(resizeCardNode(su));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canvasNodes derived from visibleNodes
    [visibleNodes, dispatch],
  );

  // Calculate minimum size required for a container to fit its children
  const calculateMinimumContainerSize = useCallback(
    (nodeId: string): { minWidth: number; minHeight: number } => {
      const node = visibleNodes.find((n) => n.id === nodeId);
      const children = visibleNodes.filter((n) => n.parentId === nodeId);

      // If no children, use unified minimum
      if (!node || children.length === 0) {
        return { minWidth: MIN_CONTAINER_WIDTH, minHeight: MIN_CONTAINER_HEIGHT };
      }

      // Child positions are absolute, so convert to relative by subtracting parent position
      let maxRelativeRight = 0;
      let maxRelativeBottom = 0;

      for (const child of children) {
        const relativeX = child.x - node.x;
        const relativeY = child.y - node.y;
        maxRelativeRight = Math.max(maxRelativeRight, relativeX + child.width);
        maxRelativeBottom = Math.max(maxRelativeBottom, relativeY + child.height);
      }

      // Minimum size = children bounding box + padding
      const minWidth = Math.max(MIN_CONTAINER_WIDTH, maxRelativeRight + CONTAINER_PAD);
      const minHeight = Math.max(MIN_CONTAINER_HEIGHT, maxRelativeBottom + CONTAINER_PAD);

      return { minWidth, minHeight };
    },
    [visibleNodes],
  );

  // Handle resizing a node, then recursively update ancestors
  // Prevents resizing containers below the bounds of their children
  const handleNodeResize = useCallback(
    (id: string, newWidth: number, newHeight: number) => {
      const node = visibleNodes.find((n) => n.id === id);
      if (!node) return;

      // Check if this node has children (is a container)
      const { minWidth, minHeight } = calculateMinimumContainerSize(id);

      // Constrain resize to minimum bounds required by children
      const constrainedWidth = Math.max(minWidth, newWidth);
      const constrainedHeight = Math.max(minHeight, newHeight);

      // Resize the node with constrained dimensions
      dispatch(resizeCardNode({ id, width: constrainedWidth, height: constrainedHeight }));

      // Build a map of pending node states
      const nodeStates = new Map<string, { x: number; y: number; width: number; height: number }>();
      nodeStates.set(id, {
        x: node.x,
        y: node.y,
        width: constrainedWidth,
        height: constrainedHeight,
      });

      // Recursively calculate ancestor bounds
      const ancestorUpdates = recalculateAncestorBounds(id, nodeStates);

      // Apply ancestor updates
      for (const update of ancestorUpdates) {
        if (update.position) {
          dispatch(
            updateCardNodePosition({
              nodeId: update.id,
              x: update.position.x,
              y: update.position.y,
            }),
          );
        }
        if (update.size) {
          dispatch(resizeCardNode({ id: update.id, width: update.size.width, height: update.size.height }));
        }
      }
    },
    [visibleNodes, calculateMinimumContainerSize, recalculateAncestorBounds, dispatch],
  );

  // Handle delete selected nodes
  const handleDeleteSelected = useCallback(() => {
    for (const nodeId of selectedNodes) {
      dispatch(deleteCardNode(nodeId));
    }
    dispatch(setSelectedNodes([]));
  }, [selectedNodes, dispatch]);

  // Track which group is being hovered during drag (for visual feedback)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  // Track all nodes being Shift-dragged (reparent mode) — for visual highlight
  const [shiftDraggingNodeIds, setShiftDraggingNodeIds] = useState<Set<string>>(new Set());
  // Track which group has a child being dragged near its edge (exit indicator)
  const [exitingGroupId, setExitingGroupId] = useState<string | null>(null);
  // Track which node is hovered (for highlighting connected edges)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // Inline rename state — extracted to useRenameState (rf-canv-20).
  const { renamingNodeId, handleNodeDoubleClick, handleRenameCommit, handleRenameCancel } =
    useRenameState();
  // Track connection tooltip (follows mouse)
  const [connTooltip, setConnTooltip] = useState<ConnectionTooltipInfo | null>(null);
  // Dismiss state for the empty canvas overlay
  const [, setOverlayDismissed] = useState(false);
  // Reset when card changes
  const prevCardIdRef = useRef(card?.id);
  useEffect(() => {
    if (card?.id !== prevCardIdRef.current) {
      prevCardIdRef.current = card?.id;
      setOverlayDismissed(false);
    }
  }, [card?.id]);
  // Dismiss when user sends an AI command (they expect to see the canvas)
  useEffect(() => {
    if (aiCurrentIntent) {
      setOverlayDismissed(true);
    }
  }, [aiCurrentIntent]);

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

  // Check if a node is a container type
  const isContainerNode = useCallback((node: LocalCanvasNode) => isContainerNodeUtil(node), []);

  // Handle drag-over group detection + shift-drag visual state.
  // Uses the same smallest-container search as handleDragEnd so highlighting
  // matches the actual drop target at every nesting level.
  const handleDragOverGroup = useCallback(
    (_groupId: string | null, draggedNodeId?: string | null, centerX?: number, centerY?: number) => {
      // When Shift-drag ends (draggedNodeId becomes null), clear everything
      if (!draggedNodeId) {
        setShiftDraggingNodeIds(new Set());
        setExitingGroupId(null);
        setDragOverGroupId(null);
        return;
      }

      // Track all selected nodes being Shift-dragged (for highlight effect)
      const draggedIds = new Set(selectedNodes);
      draggedIds.add(draggedNodeId);
      setShiftDraggingNodeIds(draggedIds);

      // Find the parent group that dragged nodes are leaving
      let exitingParent: string | null = null;
      for (const nodeId of draggedIds) {
        const node = visibleNodes.find((n) => n.id === nodeId);
        if (node?.parentId && !draggedIds.has(node.parentId)) {
          exitingParent = node.parentId;
          break;
        }
      }

      // Find the best (smallest) container at the drag center position,
      // excluding dragged nodes, their descendants, and the current parent.
      // This mirrors the exact logic in handleDragEnd so the highlight always
      // matches what will actually happen on drop.
      let resolvedTargetId: string | null = null;

      if (centerX !== undefined && centerY !== undefined) {
        // Build full exclusion set: dragged nodes + all their descendants +
        // the current parent (Shift-drag means "move to a NEW parent").
        const excludeIds = new Set(draggedIds);
        for (const id of draggedIds) {
          for (const desc of getDescendantIds(id)) {
            excludeIds.add(desc);
          }
        }
        if (exitingParent) excludeIds.add(exitingParent);

        const hit = findSmallestContainerHit(visibleNodes, centerX, centerY, isContainerNode, excludeIds);
        resolvedTargetId = hit?.id ?? null;
      }

      setDragOverGroupId(resolvedTargetId);

      // Show orange exit indicator on parent group when dragging out,
      // but not when hovering over a different valid target (green takes priority)
      setExitingGroupId(resolvedTargetId ? null : exitingParent);
    },
    [visibleNodes, selectedNodes, isContainerNode, getDescendantIds],
  );

  // Handle drag end — re-parent node only when Ctrl/Cmd is held.
  // Normal drag: node stays at current parent (or becomes top-level if dragged out).
  // Ctrl/Cmd + drag: explicitly reparent into the container at drop position.
  const handleDragEnd = useCallback(
    (itemId: string, x: number, y: number, forceReparent?: boolean) => {
      const draggedNode = visibleNodes.find((n) => n.id === itemId);
      if (!draggedNode) return;

      let bestContainer: LocalCanvasNode | null = null;

      // Only search for a container when Shift is held (explicit reparent)
      if (forceReparent) {
        const centerX = x + draggedNode.width / 2;
        const centerY = y + draggedNode.height / 2;

        // Find the best container at the drop position. Exclude the dragged
        // node, its descendants, all other selected nodes (multi-drag), and
        // the dragged node's current parent (Shift-drag means "move to a NEW
        // parent" — without this, dropping a child within the parent's bounds
        // would re-select the same parent and no reparent happens).
        const descendantIds = new Set(getDescendantIds(itemId));
        descendantIds.add(itemId);
        for (const id of selectedNodes) {
          descendantIds.add(id);
        }
        const currentParent = draggedNode.parentId || null;
        if (currentParent) descendantIds.add(currentParent);

        bestContainer = findSmallestContainerHit(visibleNodes, centerX, centerY, isContainerNodeUtil, descendantIds);
      }

      // Without Ctrl/Cmd, keep the node's current parent — no reparenting on normal drag
      if (!forceReparent) {
        setDragOverGroupId(null);
        setExitingGroupId(null);
        setShiftDraggingNodeIds(new Set());
        return;
      }

      const currentParentId = draggedNode.parentId || null;
      const newParentId = bestContainer?.id || null;

      // Only re-parent if the parent actually changed
      if (currentParentId !== newParentId) {
        // Validate containment if there's a new parent
        if (newParentId && bestContainer) {
          const parentIceType = (bestContainer.data.iceType as string) || '';
          const childIceType = (draggedNode.data.iceType as string) || '';
          // For groups, allow anything. For blocks/VPCs, validate via canContain.
          if (bestContainer.type !== 'container') {
            if (!canContain(parentIceType, childIceType)) {
              return; // Invalid containment, don't re-parent
            }
          }
        }

        dispatch(updateCardNodeParent({ nodeId: itemId, parentId: newParentId }));

        // After reparenting, expand the new parent to encompass the child.
        // Uses the stored (expanded) height for the dropped node — not the visual
        // (folded) height — so the container is large enough when the node is unfolded.
        if (newParentId && bestContainer) {
          // Get the full expanded height from Redux (not the visual folded height)
          const reduxNode = nodes.find((n: any) => n.id === itemId);
          const droppedIceType = (draggedNode.data?.iceType as string) || '';
          const droppedIsGroup = draggedNode.type === 'container' || droppedIceType.startsWith('Group.');
          const droppedIsBlock = draggedNode.type === 'block';
          const droppedDefaultH = computeCompactNodeHeight(
            draggedNode.data as Record<string, unknown>,
            droppedIsGroup || droppedIsBlock,
            false,
          );
          const droppedExpandedH = Math.max(reduxNode?.height || 0, droppedDefaultH);

          const existingChildren = visibleNodes.filter((n) => n.parentId === newParentId);

          // Compute bounding box including the dropped node at its expanded size
          let childMinX = x;
          let childMinY = y;
          let childMaxR = x + draggedNode.width;
          let childMaxB = y + droppedExpandedH;

          for (const child of existingChildren) {
            childMinX = Math.min(childMinX, child.x);
            childMinY = Math.min(childMinY, child.y);
            childMaxR = Math.max(childMaxR, child.x + child.width);
            childMaxB = Math.max(childMaxB, child.y + child.height);
          }

          // Per-edge overflow expansion (same logic as handleNodeMove)
          let px = bestContainer.x;
          let py = bestContainer.y;
          let pw = bestContainer.width;
          let ph = bestContainer.height;
          let changed = false;

          const overflowL = px + CONTAINER_PAD - childMinX;
          if (overflowL > 0) {
            px -= overflowL;
            pw += overflowL;
            changed = true;
          }

          const overflowT = py + CONTAINER_PAD + CONTAINER_HEADER_H - childMinY;
          if (overflowT > 0) {
            py -= overflowT;
            ph += overflowT;
            changed = true;
          }

          const overflowR = childMaxR - (px + pw - CONTAINER_PAD);
          if (overflowR > 0) {
            pw += overflowR;
            changed = true;
          }

          const overflowB = childMaxB - (py + ph - CONTAINER_PAD);
          if (overflowB > 0) {
            ph += overflowB;
            changed = true;
          }

          if (changed) {
            pw = Math.max(MIN_CONTAINER_WIDTH, pw);
            ph = Math.max(MIN_CONTAINER_HEIGHT, ph);
            dispatch(updateCardNodePositions([{ id: newParentId, position: { x: px, y: py } }]));
            dispatch(resizeCardNode({ id: newParentId, width: pw, height: ph }));
          }
        }
      }

      setDragOverGroupId(null);
      setExitingGroupId(null);
      setShiftDraggingNodeIds(new Set());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nodes/selectedNodes accessed via visibleNodes
    [visibleNodes, getDescendantIds, dispatch],
  );

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

  // Handle drop from palette
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const groupType = event.dataTransfer.getData('application/ice-group');
      const blockType = event.dataTransfer.getData('application/ice-block');
      const resourceType = event.dataTransfer.getData('application/ice-resource');

      if (!groupType && !blockType && !resourceType) return;

      const canvasPos = screenToCanvas(event.clientX, event.clientY);
      const targetContainer = findContainerAtPosition(canvasPos.x, canvasPos.y);

      logDrop({
        position: canvasPos,
        targetContainer: targetContainer?.id,
        nodeType: groupType ? `Group.${groupType}` : blockType || resourceType,
      });

      // --- Group drop: create empty organizational container ---
      if (groupType) {
        const iceType = `Group.${groupType}`;
        const label = event.dataTransfer.getData('application/ice-group-name') || 'New Group';
        const groupColor = event.dataTransfer.getData('application/ice-group-color') || '#3b82f6';
        const newNode: CardNode = {
          id: `group-${Date.now()}`,
          type: 'container',
          position: { x: canvasPos.x, y: canvasPos.y },
          width: 400,
          height: 300,
          data: {
            label,
            iceType,
            groupColor,
            behavior: 'container',
            status: 'active',
            folded: false,
          },
        };
        dispatch(addNodeToCard(newNode));
        return;
      }

      // --- Blueprint expansion for blocks (flat cards) ---
      if (blockType) {
        const provider = event.dataTransfer.getData('application/ice-block-provider') || 'all';
        const blueprint = getBlueprint(blockType, provider !== 'all' ? provider : undefined);
        if (blueprint) {
          // Validate containment for the node's iceType
          const nodeIceType = (blueprint.nodeData.iceType as string) || '';
          const targetIceType = targetContainer ? (targetContainer.data.iceType as string) : '';
          const canContainNode = targetContainer ? canContain(targetIceType, nodeIceType) : true;

          const expanded = expandBlueprint(blueprint, {
            position: canvasPos,
            provider: provider as any,
            parentContainerId: canContainNode && targetContainer ? targetContainer.id : undefined,
          });

          // Merge any palette-level data overrides (e.g. runtime selection)
          const blockDataRaw = event.dataTransfer.getData('application/ice-block-data');
          if (blockDataRaw) {
            try {
              const overrides = JSON.parse(blockDataRaw);
              Object.assign(expanded.node.data, overrides);
            } catch {
              /* ignore bad JSON */
            }
          }

          logBlueprint({
            type: blueprint.iceType,
            provider: provider !== 'all' ? provider : undefined,
            childCount: 0,
            containerWidth: expanded.node.width,
            containerHeight: expanded.node.height,
          });

          dispatch(expandBlueprintToCard(expanded));
          dispatch(setGhosts(generateGhostSuggestions(expanded.node as unknown as CardNode, nodes, edges)));
          return;
        }
        // fallback: no blueprint found — create empty resource node
      }

      const iceType = resourceType || 'Resource.Unknown';

      const label =
        event.dataTransfer.getData('application/ice-block-name') ||
        event.dataTransfer.getData('application/ice-resource-name') ||
        iceType;

      // Validate containment
      const targetIceType = targetContainer ? (targetContainer.data.iceType as string) : '';
      const canContainNode = targetContainer ? canContain(targetIceType, iceType) : true;

      const newNodeData = {
        label,
        iceType,
        behavior: 'singleton',
        status: 'active',
        folded: false,
      };
      const newNode: CardNode = {
        id: `node-${Date.now()}`,
        type: 'resource',
        position: { x: canvasPos.x, y: canvasPos.y },
        width: computeCompactNodeWidth(false),
        height: computeCompactNodeHeight(newNodeData as Record<string, unknown>, false),
        data: newNodeData,
        ...(canContainNode &&
          targetContainer && {
            parentId: targetContainer.id,
          }),
      };

      // Add node to active card
      dispatch(addNodeToCard(newNode));
      dispatch(setGhosts(generateGhostSuggestions(newNode, nodes, edges)));
    },
    [screenToCanvas, findContainerAtPosition, dispatch, nodes, edges],
  );

  // ── Ghost-mode handlers ────────────────────────────────────────────────────
  // Accept: expand blueprint at ghost position, wire edge to source node,
  // remove ghost. Dismiss: just remove ghost.
  const handleAcceptGhost = useCallback(
    (ghost: GhostNode) => {
      const blueprint = getBlueprint(ghost.iceType);
      if (!blueprint) {
        dispatch(dismissGhost(ghost.id));
        return;
      }
      const expanded = expandBlueprint(blueprint, { position: ghost.position });
      dispatch(expandBlueprintToCard(expanded));

      const [source, target] =
        ghost.edgeDirection === 'to' ? [ghost.sourceNodeId, expanded.node.id] : [expanded.node.id, ghost.sourceNodeId];

      dispatch(
        addEdgeToCard({
          id: `edge-${Date.now()}`,
          source,
          target,
          data: { relationship: ghost.edgeRelationship },
        }),
      );
      dispatch(dismissGhost(ghost.id));
    },
    [dispatch],
  );

  const handleDismissGhost = useCallback(
    (ghostId: string) => {
      dispatch(dismissGhost(ghostId));
    },
    [dispatch],
  );

  // Auto-dismiss all ghosts after 10 seconds.
  useEffect(() => {
    if (ghosts.length === 0) return;
    const newest = Math.max(...ghosts.map((g) => g.createdAt));
    const elapsed = Date.now() - newest;
    const remaining = Math.max(0, 10_000 - elapsed);
    const timer = setTimeout(() => dispatch(clearGhosts()), remaining);
    return () => clearTimeout(timer);
  }, [ghosts, dispatch]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

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

  const [drawingConnection, setDrawingConnection] = useState<{
    sourceId: string;
    /** Route id when the drag started from a Network.CustomDomain row port. */
    sourceRouteId?: string;
    sourcePoint: { x: number; y: number };
    currentPoint: { x: number; y: number };
  } | null>(null);

  /** Compute valid/invalid target states for all nodes during connection drag */
  const connectionDragTargets = useMemo(() => {
    if (!drawingConnection) return null;
    const sourceNode = effectiveNodes.find((n) => n.id === drawingConnection.sourceId);
    if (!sourceNode) return null;
    const srcIceType = (sourceNode.data?.iceType as string) || '';
    const srcNodeType = sourceNode.type;

    const targets = new Map<string, 'valid-target' | 'invalid-target' | 'source'>();
    targets.set(drawingConnection.sourceId, 'source');

    for (const node of effectiveNodes) {
      if (node.id === drawingConnection.sourceId) continue;
      const tgtIceType = (node.data?.iceType as string) || '';
      const isValid = canConnect(srcIceType, tgtIceType, srcNodeType, node.type, {
        srcNode: sourceNode,
        tgtNode: node,
        allNodes: effectiveNodes,
      });
      targets.set(node.id, isValid ? 'valid-target' : 'invalid-target');
    }
    return targets;
  }, [drawingConnection, effectiveNodes]);

  /** Start drawing a connection from a port */
  const handleConnectionPortDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as SVGElement;
      if (!target.classList.contains('connection-port')) return;

      e.stopPropagation();
      e.preventDefault();

      const nodeId = target.getAttribute('data-node-id');
      if (!nodeId) return;

      // Network.CustomDomain ports carry `data-route-id` so we know
      // which route slot this drag started from. Other nodes don't set
      // this attribute, in which case sourceRouteId stays undefined and
      // the resulting edge gets no routeId.
      const routeId = target.getAttribute('data-route-id') || undefined;

      const canvasPos = screenToCanvas(e.clientX, e.clientY);

      setDrawingConnection({
        sourceId: nodeId,
        sourceRouteId: routeId,
        sourcePoint: canvasPos,
        currentPoint: canvasPos,
      });
    },
    [screenToCanvas],
  );

  /** Track mouse during connection drawing */
  const handleConnectionMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawingConnection) return;
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setDrawingConnection((prev) => (prev ? { ...prev, currentPoint: canvasPos } : null));
    },
    [drawingConnection, screenToCanvas],
  );

  /** Complete connection drawing — find target node, create edge, show popover */
  const handleConnectionEnd = useCallback(
    (e: React.MouseEvent) => {
      if (!drawingConnection) return;

      const canvasPos = screenToCanvas(e.clientX, e.clientY);

      // Find node at drop position (excluding source).
      //
      // Pick the SMALLEST containing node, not the first hit. The
      // canvas allows nesting (Container inside Subnet inside VPC), and
      // the drop position can be inside multiple stacked rectangles.
      // First-hit-wins fails when the parent group happens to be later
      // in the node array than its children — which is order-dependent
      // on how the user dragged things around. The smallest area is
      // always the most-specific (deepest) target, which is what the
      // user means by "drop on this block."
      //
      // NOTE (rf-canv-6): kept inline because no predicate filters anything
      // here — connection drops target ANY node, not just containers. Folding
      // through `findSmallestContainerHit(... , () => true, ...)` would bury
      // the no-predicate semantics. Flagged for follow-up consolidation.
      let targetNode: LocalCanvasNode | null = null;
      let targetArea = Number.POSITIVE_INFINITY;
      for (const node of effectiveNodes) {
        if (node.id === drawingConnection.sourceId) continue;
        if (
          canvasPos.x >= node.x &&
          canvasPos.x <= node.x + node.width &&
          canvasPos.y >= node.y &&
          canvasPos.y <= node.y + node.height
        ) {
          const area = node.width * node.height;
          if (area < targetArea) {
            targetNode = node;
            targetArea = area;
          }
        }
      }

      if (targetNode) {
        const sourceNode = effectiveNodes.find((n) => n.id === drawingConnection.sourceId);
        const srcIceTypeCheck = (sourceNode?.data?.iceType as string) || '';
        const tgtIceTypeCheck = (targetNode.data?.iceType as string) || '';

        // ── Block invalid connections based on CONNECTION_RULES ──
        if (
          !canConnect(srcIceTypeCheck, tgtIceTypeCheck, sourceNode?.type, targetNode.type, {
            srcNode: sourceNode,
            tgtNode: targetNode,
            allNodes: effectiveNodes,
          })
        ) {
          setDrawingConnection(null);
          return;
        }

        // ── Connection constraints: one Source and one EnvVars per service ──
        if (sourceNode && card) {
          const { specialType, conflict } = findExistingSpecialConnection(
            sourceNode,
            targetNode,
            card.edges as CardEdge[],
            effectiveNodes,
          );
          if (specialType && conflict) {
            const label = specialType === 'source' ? 'GitHub Repo' : 'Env Variables';
            console.warn(`[Canvas] Only one ${label} block can be connected to a service`);
            setDrawingConnection(null);
            return;
          }
        }

        // ── Smart connection: auto-detect type, validate, and create ──
        const srcIceType = (sourceNode?.data?.iceType as string) || '';
        const tgtIceType = (targetNode.data?.iceType as string) || '';
        const cardEdgesArr = (card?.edges || []) as CardEdge[];

        // Validate — check for anti-patterns and duplicates
        const warnings = validateConnection(
          srcIceType,
          tgtIceType,
          cardEdgesArr.map((e) => ({ source: e.source, target: e.target })),
          drawingConnection.sourceId,
          targetNode.id,
          sourceNode?.type,
          targetNode.type,
        );

        // Block hard errors (self-connection)
        if (warnings.some((w) => w.level === 'error')) {
          console.warn(
            '[Canvas] Connection blocked:',
            warnings
              .filter((w) => w.level === 'error')
              .map((w) => w.message)
              .join('; '),
          );
          setDrawingConnection(null);
          return;
        }

        // Circular dependency check
        if (
          wouldCreateCycle(
            drawingConnection.sourceId,
            targetNode.id,
            cardEdgesArr.map((e) => ({ source: e.source, target: e.target })),
          )
        ) {
          console.warn('[Canvas] Connection would create a circular dependency');
          // Still allow it — just log the warning (cycles aren't always wrong)
        }

        // Log soft warnings (user sees them as console hints for now)
        for (const w of warnings.filter((w) => w.level === 'warning')) {
          console.warn(`[Canvas] ${w.message}${w.suggestion ? ` — ${w.suggestion}` : ''}`);
        }

        // Infer connection metadata from block types
        const meta = inferConnectionMeta(srcIceType, tgtIceType);

        // Normalize direction — flip source/target when semantically wrong
        // e.g. EnvVars → Service becomes Service → EnvVars (service depends_on envvars)
        const edgeSource = meta.flip ? targetNode.id : drawingConnection.sourceId;
        const edgeTarget = meta.flip ? drawingConnection.sourceId : targetNode.id;

        // When the drag started from a Network.CustomDomain row port,
        // the edge carries the source route id so the translator + the
        // target's properties panel can resolve the subdomain. The
        // direction never flips here (CustomDomain → service is the
        // canonical orientation per the connection rules).
        const sourceRouteId = drawingConnection.sourceRouteId;

        const edgeId = `edge-${Date.now()}`;
        const newEdge: CardEdge = {
          id: edgeId,
          source: edgeSource,
          target: edgeTarget,
          data: {
            relationship: CATEGORY_TO_RELATIONSHIP[meta.category],
            connectionCategory: meta.category,
            ...(meta.trafficType && { trafficType: meta.trafficType }),
            ...(meta.port && { port: meta.port }),
            ...(meta.envVarName && { envVarName: meta.envVarName }),
            ...(meta.lineStyle !== 'solid' && { lineStyle: meta.lineStyle }),
            ...(meta.color && { color: meta.color }),
            ...(sourceRouteId && { routeId: sourceRouteId }),
          },
        };
        dispatch(addEdgeToCard(newEdge));

        // All property propagation (repo sync, domain sync, secrets, env vars,
        // network policy) is handled reactively by useComputingFlows() — no
        // one-shot logic needed here. The hook picks up the new edge on the
        // next render and applies all matching PROPAGATION_RULES.

        // Connection is fully auto-configured — no popover needed
      }

      setDrawingConnection(null);
    },
    [drawingConnection, screenToCanvas, effectiveNodes, card, dispatch],
  );

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

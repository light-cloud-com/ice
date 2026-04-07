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
import { EmptyCanvasOverlay } from './empty-canvas-overlay';
import { SvgLogNode } from './nodes/log-node';
import { getBlueprint, expandBlueprint } from '../../../config/blocks';
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
  scaleLayoutForZoom,
  setCardViewport,
  setCardViewportById,
  type CardNode,
  type CardEdge,
} from '../../../store/slices/cards-slice';
import {
  inferConnectionMeta,
  validateConnection,
  wouldCreateCycle,
  canConnect,
  CATEGORY_TO_RELATIONSHIP,
} from '../utils/connection-rules';
import { SvgCompactNode, computeCompactNodeHeight, computeCompactNodeWidth } from './nodes/compact-node';
import { SvgGroupNode } from './nodes/group-node';
import { SelectionFrame } from './selection-frame';
import { SvgConnectionPath, EDGE_COLORS, type ConnectionTooltipInfo } from './svg-connection-path';
import {
  CORNER_RADIUS,
  HEADER_HEIGHT,
  CONTAINER_PADDING,
  MIN_CONTAINER_WIDTH,
  MIN_CONTAINER_HEIGHT,
  LOD_THRESHOLD_L3,
  LOD_THRESHOLD_L2,
  ZOOM_STEP,
  GRID_SIZE,
} from '../../../config/canvas-constants';
import { canContain, isContainer } from '../../../config/containment-rules';
import { isTypeVisibleAtLevel, isEdgeVisibleAtLevel } from '../../../config/visualization-config';
import { SvgUserNode, USER_NODE_WIDTH, USER_NODE_HEIGHT, USER_NODE_ID } from '../../../shared/components/svg-user-node';
import { useClipboard } from '../../../shared/hooks/use-clipboard';
import { useExposedServices } from '../../../shared/hooks/use-exposed-services';
import { useUndoRedo } from '../../../shared/hooks/use-undo-redo';
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
import { setPaneViewport, openContextMenu } from '../../../store/slices/ui-slice';
import { useCanvasInteractions, type CanvasItem } from '../hooks/use-canvas-interactions';
import { useCanvasValidation } from '../hooks/use-canvas-validation';
import type { RootState, AppDispatch } from '../../../store';

// =============================================================================
// Types
// =============================================================================

// Canvas node type - exported for use by other components
export interface CanvasNode {
  id: string;
  type: 'block' | 'resource' | 'container';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  data: Record<string, unknown>;
  parentId?: string | null;
}

// Alias for internal use
type LocalCanvasNode = CanvasNode;

export interface ViewState {
  scale: number;
  panX: number;
  panY: number;
}

export interface CanvasConnection {
  id: string;
  from: string;
  to: string;
  type?: 'default' | 'contains';
  data?: {
    relationship?: string;
    [key: string]: unknown;
  };
}

// =============================================================================
// Constants - Unified sizes
// =============================================================================

// Aliases for readability in canvas layout logic
const CONTAINER_HEADER_H = HEADER_HEIGHT;
const CONTAINER_PAD = CONTAINER_PADDING;

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

  // Get pane viewport if paneId provided
  const splitView = useSelector((state: RootState) => state.ui.splitView);
  const pane = paneId ? splitView.panes.find((p) => p.id === paneId) : null;

  // Get nodes and edges from the card
  const nodes = useMemo(() => card?.nodes || [], [card?.nodes]);
  const edges = useMemo(() => card?.edges || [], [card?.edges]);

  // Use pane viewport if available, otherwise fall back to card viewport
  const paneViewport = pane?.viewport;
  const cardViewport = card?.viewport || { panX: 0, panY: 0, scale: 1 };
  const sourceViewport = paneViewport || cardViewport;

  // Convert to format expected by canvas interactions
  const viewport = {
    x: sourceViewport.panX,
    y: sourceViewport.panY,
    zoom: sourceViewport.scale,
  };

  // Semantic zoom: Level of Detail based on zoom level
  // L3 (full): > 95% — default experience, all details visible
  // L2 (compact): 50-95% — bigger icon + label + status only, no metadata
  // L1 (iconic): < 50% — large centered icon + bold label + status dot
  const lod = viewport.zoom > LOD_THRESHOLD_L3 ? 3 : viewport.zoom > LOD_THRESHOLD_L2 ? 2 : 1;

  // Proportional zoom scaling: when autoOrganizeOnZoom is enabled, scale
  // positions and sizes proportionally instead of re-running the full layout.
  // This keeps the relative arrangement identical — blocks just grow/shrink
  // in place around the diagram centroid.  No topology rearrangement = no jumps.
  // Full re-layout only happens on manual organize button clicks.
  const autoOrganizeOnZoom = useSelector((state: RootState) => state.ui.autoOrganizeOnZoom);
  const snapToGrid = useSelector((state: RootState) => state.ui.snapToGrid);
  const gridSize = useSelector((state: RootState) => state.ui.gridSize);
  const canvasLocked = useSelector((state: RootState) => state.ui.canvasLocked);
  const prevAutoZoomRef = useRef(viewport.zoom);

  useEffect(() => {
    if (!autoOrganizeOnZoom) {
      prevAutoZoomRef.current = viewport.zoom;
      return;
    }

    const prevZoom = prevAutoZoomRef.current;
    const delta = Math.abs(viewport.zoom - prevZoom);
    if (delta < ZOOM_STEP * 0.5) return;

    prevAutoZoomRef.current = viewport.zoom;
    dispatch(scaleLayoutForZoom({ zoom: viewport.zoom, prevZoom }));
  }, [viewport.zoom, autoOrganizeOnZoom, dispatch]);

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

  // Canvas dimensions
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });

  // Update dimensions on resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

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
  }, [nodes.length, dispatch]);

  // Convert Redux nodes to canvas format with type-based sizing.
  // Uses VISUAL dimensions: folded nodes get their collapsed height (36-38px)
  // so hit-testing, container expansion, and rendering all use consistent bounds.
  const canvasNodes: LocalCanvasNode[] = useMemo(() => {
    return nodes.map((node) => {
      const iceType = (node.data?.iceType as string) || 'Resource.Unknown';

      const isGroup = iceType.startsWith('Group.') || node.type === 'container' || node.type === ('group' as any);
      const isBlock = node.type === 'block';
      const folded = !!node.data?.folded;
      const defaultWidth = computeCompactNodeWidth(isBlock || isGroup);
      const nodeData = (node.data as Record<string, unknown>) || {};
      const hasPipelineStatus = !!(pipelineNodeStatus[node.id] && pipelineNodeStatus[node.id].status !== 'idle');
      const defaultHeight = computeCompactNodeHeight(nodeData, isBlock || isGroup, hasPipelineStatus);

      // Visual height: folded groups = 36px, folded blocks/resources = 38px
      const expandedHeight = Math.max(node.height || 0, defaultHeight);
      const visualHeight = folded ? (isGroup ? 36 : 38) : expandedHeight;

      return {
        id: node.id,
        type: (node.type as 'block' | 'resource' | 'container') || 'resource',
        x: node.position?.x || 0,
        y: node.position?.y || 0,
        width: Math.max(node.width || 0, defaultWidth),
        height: visualHeight,
        label: (node.data?.name as string) || (node.data?.label as string) || node.id,
        data: { ...(node.data as Record<string, unknown>), iceType },
        parentId: node.parentId || null,
      };
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

  // Check if a node is collapsed/folded
  const isNodeFolded = useCallback(
    (nodeId: string): boolean => {
      const node = visibleNodes.find((n) => n.id === nodeId);
      return node?.data?.folded === true;
    },
    [visibleNodes],
  );

  // Check if any ancestor is folded (node should be hidden)
  const hasCollapsedAncestor = useCallback(
    (nodeId: string): boolean => {
      const node = visibleNodes.find((n) => n.id === nodeId);
      if (!node?.parentId) return false;
      if (isNodeFolded(node.parentId)) return true;
      return hasCollapsedAncestor(node.parentId);
    },
    [visibleNodes, isNodeFolded],
  );

  // Build remap for folded children: hidden node ID → first visible ancestor ID
  const foldedRemap = useMemo(() => {
    const remap = new Map<string, string>();
    for (const node of canvasNodes) {
      if (hasCollapsedAncestor(node.id)) {
        // Walk up to find the first ancestor that is NOT hidden
        let ancestorId = node.parentId;
        while (ancestorId && hasCollapsedAncestor(ancestorId)) {
          const ancestor = canvasNodes.find((n) => n.id === ancestorId);
          ancestorId = ancestor?.parentId || null;
        }
        if (ancestorId) {
          remap.set(node.id, ancestorId);
        }
      }
    }
    return remap;
  }, [canvasNodes, hasCollapsedAncestor]);

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
  const canvasConnections: CanvasConnection[] = useMemo(() => {
    const visibleNodeIds = new Set(effectiveNodes.map((n) => n.id));

    // Build a set of container node IDs — edges to/from containers are never rendered
    const containerIds = new Set(
      effectiveNodes
        .filter(
          (n) =>
            n.type === 'container' ||
            n.type === ('group' as any) ||
            ((n.data?.iceType as string) || '').startsWith('Group.') ||
            (n.data?.iceType as string) === 'Network.VPC' ||
            (n.data?.iceType as string) === 'Network.Subnet',
        )
        .map((n) => n.id),
    );

    // First pass: remap and filter
    const remapped = edges
      .filter((edge) => {
        if (edge.data?.relationship === 'contains') return false;
        // Never render edges to/from containers (VPC, Subnet, Group)
        if (containerIds.has(edge.source) || containerIds.has(edge.target)) return false;
        const relationship = edge.data?.relationship || 'connects_to';
        if (!isEdgeVisibleAtLevel(relationship, false, viewLevel)) return false;
        return true;
      })
      .map((edge) => {
        // Apply folded remap
        const from = foldedRemap.get(edge.source) || edge.source;
        const to = foldedRemap.get(edge.target) || edge.target;
        return { ...edge, source: from, target: to };
      })
      .filter((edge) => {
        if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return false;
        if (edge.source === edge.target) return false;
        return true;
      });

    // Second pass: bundle connections with same from→to pair
    const bundleMap = new Map<string, { edge: (typeof remapped)[0]; count: number }>();
    for (const edge of remapped) {
      const key = `${edge.source}->${edge.target}`;
      const existing = bundleMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        bundleMap.set(key, { edge, count: 1 });
      }
    }

    return Array.from(bundleMap.values()).map(({ edge, count }) => ({
      id: edge.id,
      from: edge.source,
      to: edge.target,
      data: {
        ...(edge.data as CanvasConnection['data']),
        bundleCount: count,
      },
    }));
  }, [edges, effectiveNodes, foldedRemap, viewLevel]);

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

  // Suppress virtual user traffic icon when an explicit Network.Internet block exists on canvas
  const hasExplicitTrafficBlock = canvasNodes.some((n) => (n.data?.iceType as string) === 'Network.Internet');
  const showVirtualUserNode = !hasExplicitTrafficBlock;

  // Pinned position for user traffic node — independent of connected node positions.
  // `pinnedUserPos` is the stable center-point passed to SvgUserNode's position prop.
  // Only recalculates when the set of exposed node IDs changes (structural graph change).
  // `userNodePos` is the top-left reported by SvgUserNode drag — used only for connection routing.
  const [userNodePos, setUserNodePos] = useState<{ x: number; y: number } | null>(null);
  const pinnedUserPosRef = useRef<{ x: number; y: number } | null>(null);
  const prevExposedIdsRef = useRef<string>('');

  // Pin position: only update from auto-computed position when exposed node IDs change
  const exposedIdsKey = exposedServices.nodeIds.slice().sort().join(',');
  if (exposedIdsKey !== prevExposedIdsRef.current) {
    prevExposedIdsRef.current = exposedIdsKey;
    pinnedUserPosRef.current = exposedServices.userIconPosition;
    // Structure changed — SvgUserNode will reset its internal drag offset
  }
  // Stable center point for SvgUserNode — does NOT change when user drags
  const pinnedUserPos = pinnedUserPosRef.current;

  // Virtual CanvasNode representing the user traffic icon (for connection routing).
  // Uses userNodePos (top-left from SvgUserNode drag) for accurate connection endpoints,
  // or falls back to pinnedUserPos (center) converted to top-left.
  const userCanvasNode: LocalCanvasNode | null = useMemo(() => {
    const pos =
      userNodePos ||
      (pinnedUserPos ? { x: pinnedUserPos.x - USER_NODE_WIDTH / 2, y: pinnedUserPos.y - USER_NODE_HEIGHT / 2 } : null);
    if (!pos) return null;
    return {
      id: USER_NODE_ID,
      type: 'resource' as const,
      x: pos.x,
      y: pos.y,
      width: USER_NODE_WIDTH,
      height: USER_NODE_HEIGHT,
      label: 'Public Traffic',
      data: { iceType: 'Virtual.UserTraffic' },
    };
  }, [userNodePos, pinnedUserPos]);

  // Virtual connections from user node to each exposed service
  const userConnections: CanvasConnection[] = useMemo(() => {
    if (!userCanvasNode || exposedServices.nodeIds.length === 0) return [];
    return exposedServices.nodeIds.map((nodeId, _i) => ({
      id: `${USER_NODE_ID}->${nodeId}`,
      from: USER_NODE_ID,
      to: nodeId,
      data: { relationship: 'connects_to' },
    }));
  }, [userCanvasNode, exposedServices.nodeIds]);

  // Merged node list including the virtual user node (for connection path lookups)
  const nodesWithUserNode: LocalCanvasNode[] = useMemo(() => {
    if (!userCanvasNode) return effectiveNodes;
    return [...effectiveNodes, userCanvasNode];
  }, [effectiveNodes, userCanvasNode]);

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

  // Get descendant IDs from VISIBLE nodes only (for box selection, reparenting)
  const getDescendantIds = useCallback(
    (nodeId: string): string[] => {
      const descendants: string[] = [];
      const children = visibleNodes.filter((n) => n.parentId === nodeId);
      for (const child of children) {
        descendants.push(child.id);
        descendants.push(...getDescendantIds(child.id));
      }
      return descendants;
    },
    [visibleNodes],
  );

  // Get ALL descendant IDs including hidden children (searches canvasNodes, not visibleNodes).
  // Used by handleNodeMove so hidden block children at L1 move with their parent.
  const getAllDescendantIds = useCallback(
    (nodeId: string): string[] => {
      const descendants: string[] = [];
      const children = canvasNodes.filter((n) => n.parentId === nodeId);
      for (const child of children) {
        descendants.push(child.id);
        descendants.push(...getAllDescendantIds(child.id));
      }
      return descendants;
    },
    [canvasNodes],
  );

  // Calculate bounds for a container based on its children's absolute positions.
  // Uses a nodeStates map to get pending changes that haven't been committed yet.
  // Expands the container when children extend beyond its current bounds.
  const calculateContainerBounds = useCallback(
    (containerId: string, nodeStates: Map<string, { x: number; y: number; width: number; height: number }>) => {
      const container = visibleNodes.find((n) => n.id === containerId);
      if (!container) return null;

      // If container is folded, don't resize based on children
      if (container.data?.folded) return null;

      const children = visibleNodes.filter((n) => n.parentId === containerId);
      if (children.length === 0) return null;

      // Compute the bounding box of all children (absolute coords)
      let childMinX = Infinity;
      let childMinY = Infinity;
      let childMaxRight = -Infinity;
      let childMaxBottom = -Infinity;

      for (const child of children) {
        // Use pending state if available, otherwise current state
        const state = nodeStates.get(child.id) || {
          x: child.x,
          y: child.y,
          width: child.width,
          height: child.height,
        };

        childMinX = Math.min(childMinX, state.x);
        childMinY = Math.min(childMinY, state.y);
        childMaxRight = Math.max(childMaxRight, state.x + state.width);
        childMaxBottom = Math.max(childMaxBottom, state.y + state.height);
      }

      // Required container bounds to encompass all children + padding
      const requiredLeft = childMinX - CONTAINER_PAD;
      const requiredTop = childMinY - CONTAINER_PAD - CONTAINER_HEADER_H;
      const requiredRight = childMaxRight + CONTAINER_PAD;
      const requiredBottom = childMaxBottom + CONTAINER_PAD;

      // Current container bounds
      const currentState = nodeStates.get(containerId) || {
        x: container.x,
        y: container.y,
        width: container.width,
        height: container.height,
      };
      const curLeft = currentState.x;
      const curTop = currentState.y;
      const curRight = currentState.x + currentState.width;
      const curBottom = currentState.y + currentState.height;

      // Expand container to encompass children (union of current + required bounds)
      const newLeft = Math.min(curLeft, requiredLeft);
      const newTop = Math.min(curTop, requiredTop);
      const newRight = Math.max(curRight, requiredRight);
      const newBottom = Math.max(curBottom, requiredBottom);

      const newX = newLeft;
      const newY = newTop;
      const newWidth = Math.max(MIN_CONTAINER_WIDTH, newRight - newLeft);
      const newHeight = Math.max(MIN_CONTAINER_HEIGHT, newBottom - newTop);

      return {
        width: newWidth,
        height: newHeight,
        x: newX,
        y: newY,
        changed:
          newWidth !== currentState.width ||
          newHeight !== currentState.height ||
          newX !== currentState.x ||
          newY !== currentState.y,
      };
    },
    [visibleNodes],
  );

  // Recursively recalculate all ancestor containers
  const recalculateAncestorBounds = useCallback(
    (
      startNodeId: string,
      nodeStates: Map<string, { x: number; y: number; width: number; height: number }>,
    ): Array<{
      id: string;
      position?: { x: number; y: number };
      size?: { width: number; height: number };
    }> => {
      const updates: Array<{
        id: string;
        position?: { x: number; y: number };
        size?: { width: number; height: number };
      }> = [];

      // Find the node and its parent
      const node = visibleNodes.find((n) => n.id === startNodeId);
      if (!node || !node.parentId) return updates;

      // Calculate new bounds for the parent
      const parentBounds = calculateContainerBounds(node.parentId, nodeStates);
      if (!parentBounds || !parentBounds.changed) return updates;

      // Update the parent's state in our map
      nodeStates.set(node.parentId, {
        x: parentBounds.x,
        y: parentBounds.y,
        width: parentBounds.width,
        height: parentBounds.height,
      });

      // Add parent update
      updates.push({
        id: node.parentId,
        position: { x: parentBounds.x, y: parentBounds.y },
        size: { width: parentBounds.width, height: parentBounds.height },
      });

      // Recursively update grandparent, great-grandparent, etc.
      const ancestorUpdates = recalculateAncestorBounds(node.parentId, nodeStates);
      updates.push(...ancestorUpdates);

      return updates;
    },
    [visibleNodes, calculateContainerBounds],
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
        const iceType = (node.data?.iceType as string) || '';
        const isGroupOrBlock = node.type === 'container' || node.type === 'block' || iceType.startsWith('Group.');
        const defaultH = computeCompactNodeHeight(node.data as Record<string, unknown>, isGroupOrBlock, false);
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
  // Inline rename state
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  // Track connection tooltip (follows mouse)
  const [connTooltip, setConnTooltip] = useState<ConnectionTooltipInfo | null>(null);
  // Dismiss state for the empty canvas overlay
  const [overlayDismissed, setOverlayDismissed] = useState(false);
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

  // Inline rename: double-click on any node label starts editing
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    setRenamingNodeId(nodeId);
  }, []);

  const handleRenameCommit = useCallback(
    (nodeId: string, newLabel: string) => {
      if (newLabel.trim()) {
        dispatch(updateCardNodeData({ nodeId, data: { name: newLabel.trim() } }));
      }
      setRenamingNodeId(null);
    },
    [dispatch],
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingNodeId(null);
  }, []);

  // Update node data fields (for inline controls like +/- scaling)
  // Also propagates repo changes from Source.Repository nodes to connected services.
  const handleUpdateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      dispatch(updateCardNodeData({ nodeId, data }));

      // If this is a Source.Repository node and repository changed, propagate to connected services
      if (data.repository && card) {
        const cardNodes = card.nodes as CardNode[];
        const cardEdges = card.edges as CardEdge[];
        const sourceNode = cardNodes.find((n) => n.id === nodeId);
        const iceType = (sourceNode?.data?.iceType as string) || '';
        const isSourceRepo = iceType === 'Source.Repository' || sourceNode?.data?.behavior === 'source';

        if (isSourceRepo) {
          // Find all service nodes connected to this source via edges
          const connectedEdges = cardEdges.filter((e) => e.source === nodeId || e.target === nodeId);
          for (const edge of connectedEdges) {
            const serviceNodeId = edge.source === nodeId ? edge.target : edge.source;
            const serviceNode = cardNodes.find((n) => n.id === serviceNodeId);
            const serviceIceType = (serviceNode?.data?.iceType as string) || '';
            if (serviceNode && serviceNode.type === 'resource' && !serviceIceType.startsWith('Source.')) {
              const repoData: Record<string, unknown> = { repository: data.repository };
              if (data.branch) repoData.branch = data.branch;
              dispatch(updateCardNodeData({ nodeId: serviceNodeId, data: repoData }));
            }
          }
        }
      }
    },
    [dispatch, card],
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
  const isContainerNode = useCallback((node: LocalCanvasNode) => {
    const iceType = (node.data.iceType as string) || '';
    return (
      node.type === 'container' ||
      node.type === ('group' as any) ||
      iceType === 'Network.VPC' ||
      iceType === 'Network.Subnet'
    );
  }, []);

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
        // Build full exclusion set: dragged nodes + all their descendants
        const excludeIds = new Set(draggedIds);
        for (const id of draggedIds) {
          for (const desc of getDescendantIds(id)) {
            excludeIds.add(desc);
          }
        }

        let smallestArea = Infinity;

        for (const node of visibleNodes) {
          if (excludeIds.has(node.id)) continue;
          // Skip current parent — Shift-drag means "move to a NEW parent"
          if (node.id === exitingParent) continue;

          if (!isContainerNode(node)) continue;

          // Check if drag center is inside this container
          if (
            centerX >= node.x &&
            centerX <= node.x + node.width &&
            centerY >= node.y &&
            centerY <= node.y + node.height
          ) {
            const area = node.width * node.height;
            if (area < smallestArea) {
              smallestArea = area;
              resolvedTargetId = node.id;
            }
          }
        }
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

        // Find the best container at the drop position (excluding the dragged node and its descendants)
        const descendantIds = new Set(getDescendantIds(itemId));
        descendantIds.add(itemId);
        // Also exclude all other selected nodes (multi-drag)
        for (const id of selectedNodes) {
          descendantIds.add(id);
        }

        // Exclude the dragged node's current parent so it can escape.
        // Without this, dropping a child within the parent's bounds re-selects
        // the same parent and no reparent happens.
        const currentParent = draggedNode.parentId || null;

        let smallestArea = Infinity;

        for (const node of visibleNodes) {
          if (descendantIds.has(node.id)) continue;
          // Skip the current parent — Shift-drag means "move to a NEW parent"
          if (node.id === currentParent) continue;
          const nodeIceType = (node.data.iceType as string) || '';
          const isNodeContainer =
            node.type === 'container' ||
            node.type === ('group' as any) ||
            nodeIceType === 'Network.VPC' ||
            nodeIceType === 'Network.Subnet';
          if (!isNodeContainer) continue;

          // Check if the center of the dragged node is inside this container
          if (
            centerX >= node.x &&
            centerX <= node.x + node.width &&
            centerY >= node.y &&
            centerY <= node.y + node.height
          ) {
            const area = node.width * node.height;
            // Pick the smallest matching container (most specific/nested)
            if (area < smallestArea) {
              smallestArea = area;
              bestContainer = node;
            }
          }
        }
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
      dispatch(openContextMenu({ position, type, targetId }));
    },
    [dispatch],
  );

  // Canvas interactions
  const { bindCanvas, cursor, screenToCanvas } = useCanvasInteractions({
    svgRef,
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    items: canvasItems,
    selectedIds: selectedNodes,
    onViewportChange: (vp) => {
      if (paneId) {
        dispatch(setPaneViewport({ paneId, viewport: { panX: vp.x, panY: vp.y, scale: vp.zoom } }));
      } else if (cardId) {
        dispatch(setCardViewportById({ cardId, viewport: { panX: vp.x, panY: vp.y, scale: vp.zoom } }));
      } else {
        dispatch(setCardViewport({ panX: vp.x, panY: vp.y, scale: vp.zoom }));
      }
    },
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

  // Find container at position for drop handling
  const findContainerAtPosition = useCallback(
    (x: number, y: number): LocalCanvasNode | null => {
      const containers = visibleNodes
        .filter((n) => {
          const iceType = (n.data.iceType as string) || '';
          return isContainer(iceType) || iceType.startsWith('Group.') || iceType.startsWith('Network.');
        })
        .sort((a, b) => {
          const aIceType = (a.data.iceType as string) || '';
          const bIceType = (b.data.iceType as string) || '';
          return calculateZIndex(bIceType, 0) - calculateZIndex(aIceType, 0);
        });

      for (const container of containers) {
        if (
          x >= container.x &&
          x <= container.x + container.width &&
          y >= container.y &&
          y <= container.y + container.height
        ) {
          return container;
        }
      }
      return null;
    },
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
    },
    [screenToCanvas, findContainerAtPosition, dispatch],
  );

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
  const portMap = useMemo(() => {
    const map = new Map<string, { index: number; count: number }>();
    const nodeById = new Map<string, LocalCanvasNode>();
    for (const n of effectiveNodes) nodeById.set(n.id, n);

    const getSide = (fromNode: LocalCanvasNode, toNode: LocalCanvasNode): { exitSide: string; entrySide: string } => {
      const dx = toNode.x + toNode.width / 2 - (fromNode.x + fromNode.width / 2);
      const dy = toNode.y + toNode.height / 2 - (fromNode.y + fromNode.height / 2);
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? { exitSide: 'right', entrySide: 'left' } : { exitSide: 'left', entrySide: 'right' };
      }
      return dy > 0 ? { exitSide: 'bottom', entrySide: 'top' } : { exitSide: 'top', entrySide: 'bottom' };
    };

    // Collect all connections per side-key, with the "other" node for sorting
    interface SideEntry {
      connId: string;
      role: 'source' | 'target';
      otherCx: number;
      otherCy: number;
    }
    const sideGroups = new Map<string, SideEntry[]>();

    for (const conn of canvasConnections) {
      const fromNode = nodeById.get(conn.from);
      const toNode = nodeById.get(conn.to);
      if (!fromNode || !toNode) continue;

      const { exitSide, entrySide } = getSide(fromNode, toNode);
      const sourceKey = `${conn.from}:${exitSide}`;
      const targetKey = `${conn.to}:${entrySide}`;

      const toCx = toNode.x + toNode.width / 2;
      const toCy = toNode.y + toNode.height / 2;
      const fromCx = fromNode.x + fromNode.width / 2;
      const fromCy = fromNode.y + fromNode.height / 2;

      if (!sideGroups.has(sourceKey)) sideGroups.set(sourceKey, []);
      sideGroups.get(sourceKey)!.push({ connId: conn.id, role: 'source', otherCx: toCx, otherCy: toCy });

      if (!sideGroups.has(targetKey)) sideGroups.set(targetKey, []);
      sideGroups.get(targetKey)!.push({ connId: conn.id, role: 'target', otherCx: fromCx, otherCy: fromCy });
    }

    // Sort each group by the other endpoint's position to minimize crossings:
    // left/right sides → sort by other node's Y (top-to-bottom)
    // top/bottom sides → sort by other node's X (left-to-right)
    for (const [key, entries] of sideGroups) {
      const side = key.split(':').pop()!;
      if (side === 'left' || side === 'right') {
        entries.sort((a, b) => a.otherCy - b.otherCy);
      } else {
        entries.sort((a, b) => a.otherCx - b.otherCx);
      }
      const count = entries.length;
      for (let i = 0; i < count; i++) {
        map.set(`${entries[i].connId}:${entries[i].role}`, { index: i, count });
      }
    }

    return map;
  }, [canvasConnections, effectiveNodes]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Connection Drawing — port-to-port drag to create edges
  // ═══════════════════════════════════════════════════════════════════════════

  const [drawingConnection, setDrawingConnection] = useState<{
    sourceId: string;
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
      const isValid = canConnect(srcIceType, tgtIceType, srcNodeType, node.type);
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

      const canvasPos = screenToCanvas(e.clientX, e.clientY);

      setDrawingConnection({
        sourceId: nodeId,
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

      // Find node at drop position (excluding source)
      let targetNode: LocalCanvasNode | null = null;
      for (let i = effectiveNodes.length - 1; i >= 0; i--) {
        const node = effectiveNodes[i];
        if (node.id === drawingConnection.sourceId) continue;
        if (
          canvasPos.x >= node.x &&
          canvasPos.x <= node.x + node.width &&
          canvasPos.y >= node.y &&
          canvasPos.y <= node.y + node.height
        ) {
          targetNode = node;
          break;
        }
      }

      if (targetNode) {
        const sourceNode = effectiveNodes.find((n) => n.id === drawingConnection.sourceId);
        const srcIceTypeCheck = (sourceNode?.data?.iceType as string) || '';
        const tgtIceTypeCheck = (targetNode.data?.iceType as string) || '';

        // ── Block invalid connections based on CONNECTION_RULES ──
        if (!canConnect(srcIceTypeCheck, tgtIceTypeCheck, sourceNode?.type, targetNode.type)) {
          setDrawingConnection(null);
          return;
        }

        // ── Connection constraints: one Source and one EnvVars per service ──
        if (sourceNode && card) {
          const srcType = (sourceNode.data?.iceType as string) || '';
          const tgtType = (targetNode.data?.iceType as string) || '';

          // Check both directions: which node is the "special" block, which is the service
          const specialType =
            srcType === 'Source.Repository' || sourceNode.data?.behavior === 'source'
              ? 'Source.Repository'
              : srcType === 'Config.Environment'
                ? 'Config.Environment'
                : tgtType === 'Source.Repository' || targetNode.data?.behavior === 'source'
                  ? 'Source.Repository'
                  : tgtType === 'Config.Environment'
                    ? 'Config.Environment'
                    : null;

          if (specialType) {
            const serviceNodeId =
              specialType === srcType || (specialType === 'Source.Repository' && sourceNode.data?.behavior === 'source')
                ? targetNode.id
                : sourceNode.id;
            const cardEdges = card.edges as CardEdge[];

            // Find existing connections of the same special type to this service
            const existingSpecial = cardEdges.filter((e) => {
              const otherId = e.source === serviceNodeId ? e.target : e.source === serviceNodeId ? e.source : null;
              if (!otherId || (e.source !== serviceNodeId && e.target !== serviceNodeId)) return false;
              const otherNode = effectiveNodes.find((n) => n.id === (e.source === serviceNodeId ? e.target : e.source));
              if (!otherNode) return false;
              const otherType = (otherNode.data?.iceType as string) || '';
              if (specialType === 'Source.Repository') {
                return otherType === 'Source.Repository' || otherNode.data?.behavior === 'source';
              }
              return otherType === specialType;
            });

            if (existingSpecial.length > 0) {
              const label = specialType === 'Source.Repository' ? 'GitHub Repo' : 'Env Variables';
              console.warn(`[Canvas] Only one ${label} block can be connected to a service`);
              setDrawingConnection(null);
              return;
            }
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
          },
        };
        dispatch(addEdgeToCard(newEdge));

        // ── Pipeline: auto-configure when Source.Repository connects to a service ──
        if (sourceNode && targetNode) {
          const sourceIsRepo = srcIceType === 'Source.Repository' || sourceNode.data?.behavior === 'source';
          const targetIsService = targetNode.type === 'resource' && !tgtIceType.startsWith('Source.');

          // Source → Service: copy repo data to service and open pipeline
          if (sourceIsRepo && targetIsService) {
            const repo = (sourceNode.data?.repository as string) || '';
            const branch = (sourceNode.data?.branch as string) || 'main';
            if (repo) {
              const repoData: Record<string, unknown> = { repository: repo, branch };
              if (sourceNode.data?.buildCommand) repoData.buildCommand = sourceNode.data.buildCommand;
              if (sourceNode.data?.outputDirectory) repoData.outputDirectory = sourceNode.data.outputDirectory;
              dispatch(updateCardNodeData({ nodeId: targetNode.id, data: repoData }));
              dispatch(setSelectedNodes([targetNode.id]));
            }
          }

          // Service → Source (reversed direction): same behavior
          const targetIsRepo = tgtIceType === 'Source.Repository' || targetNode.data?.behavior === 'source';
          const sourceIsService = sourceNode.type === 'resource' && !srcIceType.startsWith('Source.');
          if (targetIsRepo && sourceIsService) {
            const repo = (targetNode.data?.repository as string) || '';
            const branch = (targetNode.data?.branch as string) || 'main';
            if (repo) {
              const repoData: Record<string, unknown> = { repository: repo, branch };
              if (targetNode.data?.buildCommand) repoData.buildCommand = targetNode.data.buildCommand;
              if (targetNode.data?.outputDirectory) repoData.outputDirectory = targetNode.data.outputDirectory;
              dispatch(updateCardNodeData({ nodeId: sourceNode.id, data: repoData }));
              dispatch(setSelectedNodes([sourceNode.id]));
            }
          }
        }

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
      {/* Empty canvas overlay — shown when active card has 0 nodes and not dismissed */}
      {canvasNodes.length === 0 && !overlayDismissed && (
        <EmptyCanvasOverlay onDismiss={() => setOverlayDismissed(true)} />
      )}

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

          {/* Connections layer — non-highlighted (behind nodes) */}
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

          {/* SVG filter for Shift-drag lift shadow */}
          <defs>
            <filter id="shift-drag-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.35" />
            </filter>
            {/* BND-5: ClipPaths for parent containment — prevents children from
                visually overflowing their parent group/block boundaries */}
            {sortedNodes
              .filter((n) => {
                const t = (n.data?.iceType as string) || '';
                return n.type === 'container' || n.type === 'block' || t === 'Network.VPC' || t === 'Network.Subnet';
              })
              .map((n) => (
                <clipPath key={`parent-clip-${n.id}`} id={`parent-clip-${n.id}`}>
                  <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={CORNER_RADIUS} />
                </clipPath>
              ))}
          </defs>

          {/* Nodes layer — Groups, Blocks, Resources, or Log terminals */}
          <g className="nodes-layer">
            {sortedNodes.map((node) => {
              const iceType = (node.data?.iceType as string) || '';

              const isLogNode =
                iceType === 'Monitoring.Terminal' || iceType === 'Observability.Logs' || iceType.startsWith('Log.');
              const isVpcOrSubnet = iceType === 'Network.VPC' || iceType === 'Network.Subnet';
              const isGroup = node.type === 'container' || node.type === ('group' as any) || isVpcOrSubnet;
              const isBlock = node.type === 'block';

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

              const wrapLift = (content: React.ReactNode) => {
                // Wrap with entrance animation if needed
                const animated = isAnimating ? (
                  <g key={`anim-${node.id}`} style={animStyle}>
                    {content}
                  </g>
                ) : (
                  content
                );

                // Shift-dragged nodes: show lift shadow, skip clip (user is reparenting)
                if (isLifted) {
                  // Determine highlight color: green if dragging INTO a group, orange if leaving
                  const isEntering = !!dragOverGroupId;
                  const highlightColor = isEntering ? '#22c55e' : '#f97316';

                  return (
                    <g key={node.id} filter="url(#shift-drag-shadow)" opacity={0.9}>
                      {animated}
                      {/* Highlight border around the dragged node */}
                      <rect
                        x={node.x - 2}
                        y={node.y - 2}
                        width={node.width + 4}
                        height={node.height + 4}
                        rx={8}
                        fill="none"
                        stroke={highlightColor}
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        opacity={0.8}
                      >
                        <animate
                          attributeName="stroke-dashoffset"
                          from="0"
                          to="-18"
                          dur="0.8s"
                          repeatCount="indefinite"
                        />
                      </rect>
                    </g>
                  );
                }

                // BND-5/BND-6: Clip children to parent bounds so they never
                // visually overflow the parent group/block rectangle.
                if (node.parentId) {
                  return (
                    <g key={`clipped-${node.id}`} clipPath={`url(#parent-clip-${node.parentId})`}>
                      {animated}
                    </g>
                  );
                }

                return animated;
              };

              if (isLogNode) {
                return wrapLift(
                  <SvgLogNode
                    key={isLifted ? undefined : `${node.id}-lod${lod}`}
                    node={node}
                    isSelected={selectedNodes.includes(node.id)}
                    onToggleFold={handleToggleFold}
                  />,
                );
              }

              // Groups always render as containers
              if (isGroup) {
                return wrapLift(
                  <SvgGroupNode
                    key={isLifted ? undefined : `${node.id}-lod${lod}`}
                    node={node}
                    isSelected={selectedNodes.includes(node.id)}
                    childNodes={sortedNodes.filter((n) => n.parentId === node.id)}
                    onToggleFold={handleToggleFold}
                    isDragOver={dragOverGroupId === node.id}
                    isChildExiting={exitingGroupId === node.id}
                    isRenaming={renamingNodeId === node.id}
                    onDoubleClickLabel={() => handleNodeDoubleClick(node.id)}
                    onRenameCommit={(newLabel) => handleRenameCommit(node.id, newLabel)}
                    onRenameCancel={handleRenameCancel}
                    lod={lod}
                    zoom={viewport.zoom}
                    connectionDragState={connectionDragTargets?.get(node.id) ?? null}
                    validationSeverity={nodeValidationMap.get(node.id)?.severity ?? null}
                    validationCount={nodeValidationMap.get(node.id)?.count ?? 0}
                  />,
                );
              }

              // Blocks: render as flat compact cards (no container)
              if (isBlock) {
                return wrapLift(
                  <SvgCompactNode
                    key={isLifted ? undefined : `${node.id}-lod${lod}`}
                    node={node}
                    isSelected={selectedNodes.includes(node.id)}
                    childNodes={sortedNodes.filter((n) => n.parentId === node.id)}
                    onToggleFold={handleToggleFold}
                    isDragOver={dragOverGroupId === node.id}
                    onNodeHover={handleNodeHover}
                    isRenaming={renamingNodeId === node.id}
                    onDoubleClickLabel={() => handleNodeDoubleClick(node.id)}
                    onRenameCommit={(newLabel) => handleRenameCommit(node.id, newLabel)}
                    onRenameCancel={handleRenameCancel}
                    onUpdateData={handleUpdateNodeData}
                    pipelineStatus={pipelineNodeStatus[node.id]}
                    onPipelineClick={handlePipelineClick}
                    connectedPipelineStatuses={getConnectedPipelineStatuses(node)}
                    lod={lod}
                    zoom={viewport.zoom}
                    connectionDragState={connectionDragTargets?.get(node.id) ?? null}
                    validationSeverity={nodeValidationMap.get(node.id)?.severity ?? null}
                    validationCount={nodeValidationMap.get(node.id)?.count ?? 0}
                  />,
                );
              }

              return wrapLift(
                <SvgCompactNode
                  key={isLifted ? undefined : `${node.id}-lod${lod}`}
                  node={node}
                  isSelected={selectedNodes.includes(node.id)}
                  childNodes={sortedNodes.filter((n) => n.parentId === node.id)}
                  onToggleFold={handleToggleFold}
                  isDragOver={dragOverGroupId === node.id}
                  onNodeHover={handleNodeHover}
                  isRenaming={renamingNodeId === node.id}
                  onDoubleClickLabel={() => handleNodeDoubleClick(node.id)}
                  onRenameCommit={(newLabel) => handleRenameCommit(node.id, newLabel)}
                  onRenameCancel={handleRenameCancel}
                  onUpdateData={handleUpdateNodeData}
                  pipelineStatus={pipelineNodeStatus[node.id]}
                  onPipelineClick={handlePipelineClick}
                  connectedPipelineStatuses={getConnectedPipelineStatuses(node)}
                  lod={lod}
                  zoom={viewport.zoom}
                  connectionDragState={connectionDragTargets?.get(node.id) ?? null}
                  validationSeverity={nodeValidationMap.get(node.id)?.severity ?? null}
                  validationCount={nodeValidationMap.get(node.id)?.count ?? 0}
                />,
              );
            })}
          </g>

          {/* Connection drawing preview — temporary bezier from source to cursor */}
          {drawingConnection &&
            (() => {
              const { sourcePoint, currentPoint } = drawingConnection;
              const dx = currentPoint.x - sourcePoint.x;
              const dy = currentPoint.y - sourcePoint.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const offset = Math.min(Math.max(dist * 0.35, 40), 200);
              // Choose control point direction based on dominant axis
              let cp1, cp2;
              if (Math.abs(dx) >= Math.abs(dy)) {
                const sign = dx >= 0 ? 1 : -1;
                cp1 = { x: sourcePoint.x + offset * sign, y: sourcePoint.y };
                cp2 = { x: currentPoint.x - offset * sign, y: currentPoint.y };
              } else {
                const sign = dy >= 0 ? 1 : -1;
                cp1 = { x: sourcePoint.x, y: sourcePoint.y + offset * sign };
                cp2 = { x: currentPoint.x, y: currentPoint.y - offset * sign };
              }
              const pathD = `M ${sourcePoint.x} ${sourcePoint.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${currentPoint.x} ${currentPoint.y}`;

              // Determine preview color based on what's under the cursor
              let previewColor = '#22d3ee'; // cyan default (empty space)
              if (connectionDragTargets) {
                for (let i = effectiveNodes.length - 1; i >= 0; i--) {
                  const node = effectiveNodes[i];
                  if (node.id === drawingConnection.sourceId) continue;
                  if (
                    currentPoint.x >= node.x &&
                    currentPoint.x <= node.x + node.width &&
                    currentPoint.y >= node.y &&
                    currentPoint.y <= node.y + node.height
                  ) {
                    const state = connectionDragTargets.get(node.id);
                    previewColor = state === 'valid-target' ? '#22c55e' : '#ef4444'; // green or red
                    break;
                  }
                }
              }

              return (
                <g className="connection-preview" style={{ pointerEvents: 'none' }}>
                  <path
                    d={pathD}
                    stroke={previewColor}
                    strokeWidth={2}
                    fill="none"
                    strokeDasharray="8 4"
                    opacity={0.7}
                  />
                  <circle cx={sourcePoint.x} cy={sourcePoint.y} r={4} fill={previewColor} opacity={0.9} />
                  <circle cx={currentPoint.x} cy={currentPoint.y} r={4} fill={previewColor} opacity={0.6} />
                </g>
              );
            })()}

          {/* User traffic connections (same styling as regular connections) — only when no explicit Network.Internet block */}
          {showVirtualUserNode && userConnections.length > 0 && (
            <g className="user-traffic-connections-layer">
              {userConnections.map((conn) => (
                <SvgConnectionPath
                  key={conn.id}
                  connection={conn}
                  nodes={nodesWithUserNode}
                  allNodes={nodesWithUserNode}
                  isSelected={false}
                  isHighlighted={false}
                  direction="outgoing"
                  sourcePortIndex={0}
                  sourcePortCount={1}
                  targetPortIndex={0}
                  targetPortCount={1}
                  edgeStyle={edgeStyle}
                />
              ))}
            </g>
          )}

          {/* User traffic icon for exposed services — only when no explicit Network.Internet block */}
          {showVirtualUserNode && pinnedUserPos && (
            <SvgUserNode position={pinnedUserPos} scale={viewport.zoom} onPositionChange={setUserNodePos} />
          )}

          {/* Highlighted connections layer — ON TOP of nodes */}
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
        </g>
      </svg>

      {/* Connection tooltip — follows mouse, rendered as HTML overlay */}
      {connTooltip && (
        <div
          style={{
            position: 'fixed',
            left: connTooltip.mouseX + 14,
            top: connTooltip.mouseY + 14,
            pointerEvents: 'none',
            zIndex: 9999,
            background: 'var(--ice-bg-base)',
            border: '1px solid var(--ice-border-strong)',
            borderRadius: 8,
            padding: '10px 14px',
            minWidth: 180,
            maxWidth: 320,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            fontFamily: "'JetBrains Mono Variable', monospace",
            fontSize: 11,
            color: 'var(--ice-text-primary)',
            lineHeight: 1.5,
          }}
        >
          {/* Origin → Destination */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--ice-text-primary)' }}>{connTooltip.fromLabel}</span>
            <span style={{ color: 'var(--ice-border-strong)' }}>→</span>
            <span style={{ fontWeight: 600, color: 'var(--ice-text-primary)' }}>{connTooltip.toLabel}</span>
          </div>

          {/* Relationship badge */}
          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '1px 8px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                background: (EDGE_COLORS[connTooltip.relationship] || EDGE_COLORS.default) + '1a',
                color: EDGE_COLORS[connTooltip.relationship] || EDGE_COLORS.default,
                border: `1px solid ${EDGE_COLORS[connTooltip.relationship] || EDGE_COLORS.default}33`,
              }}
            >
              {connTooltip.relationship.replace(/_/g, ' ')}
            </span>
            {connTooltip.bundleCount > 1 && (
              <span
                style={{
                  display: 'inline-block',
                  marginLeft: 6,
                  padding: '1px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  background: '#3b82f61a',
                  color: '#60a5fa',
                  border: '1px solid #3b82f633',
                }}
              >
                {connTooltip.bundleCount} connections
              </span>
            )}
          </div>

          {/* Metadata rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {connTooltip.protocol && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ice-text-secondary)' }}>Protocol</span>
                <span
                  style={{
                    fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                    color: 'var(--ice-text-tertiary)',
                  }}
                >
                  {connTooltip.protocol.toUpperCase()}
                </span>
              </div>
            )}
            {connTooltip.port && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ice-text-secondary)' }}>Port</span>
                <span
                  style={{
                    fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                    color: 'var(--ice-text-tertiary)',
                  }}
                >
                  {connTooltip.port}
                </span>
              </div>
            )}
            {connTooltip.latency && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ice-text-secondary)' }}>Latency</span>
                <span
                  style={{
                    fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                    color: 'var(--ice-text-tertiary)',
                  }}
                >
                  {connTooltip.latency}
                </span>
              </div>
            )}
            {connTooltip.throughput && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ice-text-secondary)' }}>Throughput</span>
                <span
                  style={{
                    fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                    color: 'var(--ice-text-tertiary)',
                  }}
                >
                  {connTooltip.throughput}
                </span>
              </div>
            )}
            {connTooltip.bandwidth && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ice-text-secondary)' }}>Bandwidth</span>
                <span
                  style={{
                    fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                    color: 'var(--ice-text-tertiary)',
                  }}
                >
                  {connTooltip.bandwidth}
                </span>
              </div>
            )}
            {connTooltip.securityRule && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#f59e0b' }}>Security</span>
                <span
                  style={{
                    fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                    color: '#f59e0b',
                  }}
                >
                  {connTooltip.securityRule}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls help button — bottom-right */}
      <ControlsHelpModal />

      {/* Context Menu overlay */}
      <CanvasContextMenu />
    </div>
  );
};

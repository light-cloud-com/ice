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
import type { RootState, AppDispatch } from '../../../store';
// Note: Graph actions no longer used - all node operations go through cardsSlice
// Viewport is now stored per-pane in uiSlice (for split view support)
import {
  selectActiveCard,
  addNodeToCard,
  addEdgeToCard,
  updateCardEdgeData,
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
  setCardViewport,
  setCardViewportById,
  type CardNode,
  type CardEdge,
} from '../../../store/slices/cards-slice';
import { getBlueprint, expandBlueprint } from '../../../config/blocks';
import { setPaneViewport, openContextMenu } from '../../../store/slices/ui-slice';
import {
  setSelectedNodes,
  setSelectedEdges,
  toggleNodeSelection,
  setSelectionRect,
} from '../../../store/slices/selection-slice';
import { useCanvasInteractions, type CanvasItem } from '../hooks/use-canvas-interactions';
import { useClipboard } from '../../../shared/hooks/use-clipboard';
import { useUndoRedo } from '../../../shared/hooks/use-undo-redo';
import { CanvasGrid } from './canvas-grid';
import { getIcon, DEFAULT_ICON, type Provider } from '../../../assets/icons';
import { getBrandIcon } from '../../../assets/icons/brand-registry';
import {
  SvgCompactNode,
  computeCompactNodeHeight,
  computeCompactNodeWidth,
} from './nodes/svg-compact-node';
import { receiveCardPipelineUpdate } from '../../../store/slices/pipeline-slice';
import { SvgGroupNode } from './nodes/svg-group-node';
import { SvgRegionLabel } from './nodes/svg-region-label';
import { SvgLogNode } from './svg-log-node';
import { SvgConnectionPath, EDGE_COLORS, type ConnectionTooltipInfo } from './svg-connection-path';
import { SelectionFrame } from './selection-frame';
import {
  SvgUserNode,
  USER_NODE_WIDTH,
  USER_NODE_HEIGHT,
  USER_NODE_ID,
} from '../../../shared/components/svg-user-node';
import { useExposedServices } from '../../../shared/hooks/use-exposed-services';
import { CanvasContextMenu } from './context/canvas-context-menu';
import { ControlsHelpModal } from './controls-help-modal';
// ConnectionTypePopover removed — connections are fully auto-configured
import { inferConnectionMeta, validateConnection, wouldCreateCycle, CATEGORY_TO_RELATIONSHIP } from '../utils/connection-rules';
import { EmptyCanvasOverlay } from './empty-canvas-overlay';
import { isTypeVisibleAtLevel, isEdgeVisibleAtLevel } from '../../../config/visualization-config';
import { canContain, isContainer } from '../../../config/containment-rules';
import { calculateZIndex } from '../../../shared/utils/auto-layout';
import { logCanvasRender, logDrop, logBlueprint } from '../../../shared/utils/debug-logger';

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

// Container layout — padding/gaps for parent nodes that hold children
const CONTAINER_HEADER_H = 36; // header height (matches SvgGroupNode HEADER_HEIGHT)
const CONTAINER_PAD = 20; // inner padding around children

// Minimum container size (used for bounds calculations)
const MIN_CONTAINER_WIDTH = 240;
const MIN_CONTAINER_HEIGHT = 150;

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
  const pipelineNodeStatus = useSelector((state: RootState) => state.pipeline.nodeStatus);
  // Clipboard (Ctrl+C/V/X) and Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
  useClipboard();
  useUndoRedo();

  // Get pane viewport if paneId provided
  const splitView = useSelector((state: RootState) => state.ui.splitView);
  const pane = paneId ? splitView.panes.find((p) => p.id === paneId) : null;

  // Get nodes and edges from the card
  const nodes = card?.nodes || [];
  const edges = card?.edges || [];

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
  const lod = viewport.zoom > 0.95 ? 3 : viewport.zoom > 0.50 ? 2 : 1;

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
        dispatch(autoOrganizeCard());
      }, 100);
      prevNodeCountRef.current = currentCount;
      return () => clearTimeout(timer);
    }

    prevNodeCountRef.current = currentCount;
  }, [nodes.length, dispatch]);

  // Convert Redux nodes to canvas format with type-based sizing.
  const canvasNodes: LocalCanvasNode[] = useMemo(() => {
    return nodes.map((node) => {
      const iceType =
        (node.data?.iceType as string) ||
        (node.data?.blockType ? `Block.${node.data.blockType}` : 'Resource.Unknown');

      const isGroup = iceType.startsWith('Group.') || node.type === 'container' || node.type === ('group' as any);
      const isBlock = iceType.startsWith('Block.') || node.type === 'block';
      const defaultWidth = computeCompactNodeWidth(isBlock || isGroup);
      const nodeData = (node.data as Record<string, unknown>) || {};
      const hasPipelineStatus = !!(pipelineNodeStatus[node.id] && pipelineNodeStatus[node.id].status !== 'idle');
      const defaultHeight = computeCompactNodeHeight(nodeData, isBlock || isGroup, hasPipelineStatus);

      return {
        id: node.id,
        type: (node.type as 'block' | 'resource' | 'container') || 'resource',
        x: node.position?.x || 0,
        y: node.position?.y || 0,
        width: Math.max(node.width || 0, defaultWidth),
        height: Math.max(node.height || 0, defaultHeight),
        label: (node.data?.label as string) || node.id,
        data: { ...(node.data as Record<string, unknown>), iceType },
        parentId: node.parentId || null,
      };
    });
  }, [nodes]);

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
    [visibleNodes]
  );

  // Check if any ancestor is folded (node should be hidden)
  const hasCollapsedAncestor = useCallback(
    (nodeId: string): boolean => {
      const node = visibleNodes.find((n) => n.id === nodeId);
      if (!node?.parentId) return false;
      if (isNodeFolded(node.parentId)) return true;
      return hasCollapsedAncestor(node.parentId);
    },
    [visibleNodes, isNodeFolded]
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
        .filter((n) => n.type === 'container' || n.type === ('group' as any) ||
          ((n.data?.iceType as string) || '').startsWith('Group.') ||
          (n.data?.iceType as string) === 'Network.VPC' || (n.data?.iceType as string) === 'Network.Subnet')
        .map((n) => n.id)
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
  const hasExplicitTrafficBlock = canvasNodes.some(
    (n) => (n.data?.iceType as string) === 'Network.Internet'
  );
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
      (pinnedUserPos
        ? { x: pinnedUserPos.x - USER_NODE_WIDTH / 2, y: pinnedUserPos.y - USER_NODE_HEIGHT / 2 }
        : null);
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
    // Build items with z-index for sorting
    const items = visibleNodes
      .filter((node) => !hasCollapsedAncestor(node.id))
      .map((node) => {
        const iceType = (node.data?.iceType as string) || '';
        return {
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          parentId: node.parentId,
          _z: calculateZIndex(iceType, 0),
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
    [visibleNodes]
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
    [canvasNodes]
  );

  // Calculate bounds for a container based on its children's absolute positions.
  // Uses a nodeStates map to get pending changes that haven't been committed yet.
  // Expands the container when children extend beyond its current bounds.
  const calculateContainerBounds = useCallback(
    (
      containerId: string,
      nodeStates: Map<string, { x: number; y: number; width: number; height: number }>
    ) => {
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
    [visibleNodes]
  );

  // Recursively recalculate all ancestor containers
  const recalculateAncestorBounds = useCallback(
    (
      startNodeId: string,
      nodeStates: Map<string, { x: number; y: number; width: number; height: number }>
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
    [visibleNodes, calculateContainerBounds]
  );

  // Handle moving a node and all its children, then recursively update ancestors.
  // skipAncestorResize: when Shift is held (reparent mode), don't resize the parent container.
  // Uses getAllDescendantIds so hidden block children at L1 also move with their parent.
  const handleNodeMove = useCallback(
    (id: string, newX: number, newY: number, skipAncestorResize?: boolean) => {
      const node = visibleNodes.find((n) => n.id === id);
      if (!node) return;

      const deltaX = newX - node.x;
      const deltaY = newY - node.y;

      // Build a map of all pending node states
      const nodeStates = new Map<string, { x: number; y: number; width: number; height: number }>();

      // Update the moved node
      nodeStates.set(id, { x: newX, y: newY, width: node.width, height: node.height });

      // Update ALL descendants (including hidden children at L1) using canvasNodes
      const descendantIds = getAllDescendantIds(id);
      for (const descendantId of descendantIds) {
        const descendant = canvasNodes.find((n) => n.id === descendantId);
        if (descendant) {
          nodeStates.set(descendantId, {
            x: descendant.x + deltaX,
            y: descendant.y + deltaY,
            width: descendant.width,
            height: descendant.height,
          });
        }
      }

      // Build position updates array
      const positionUpdates: Array<{ id: string; position: { x: number; y: number } }> = [];

      // Add moved node and descendants
      for (const [nodeId, state] of nodeStates) {
        positionUpdates.push({ id: nodeId, position: { x: state.x, y: state.y } });
      }

      // Recalculate ancestor bounds (skip when Shift held)
      if (!skipAncestorResize) {
        const ancestorUpdates = recalculateAncestorBounds(id, nodeStates);

        // Add ancestor position updates
        for (const update of ancestorUpdates) {
          if (update.position && !nodeStates.has(update.id)) {
            positionUpdates.push({ id: update.id, position: update.position });
          }
        }

        // Dispatch all position updates to active card
        dispatch(updateCardNodePositions(positionUpdates));

        // Dispatch ancestor size updates
        for (const update of ancestorUpdates) {
          if (update.size) {
            dispatch(
              resizeCardNode({
                id: update.id,
                width: update.size.width,
                height: update.size.height,
              })
            );
          }
        }
      } else {
        // Just move the node and descendants, no ancestor resizing
        dispatch(updateCardNodePositions(positionUpdates));
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
    [visibleNodes, canvasNodes, getAllDescendantIds, recalculateAncestorBounds, dispatch]
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
    [visibleNodes]
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
            })
          );
        }
        if (update.size) {
          dispatch(
            resizeCardNode({ id: update.id, width: update.size.width, height: update.size.height })
          );
        }
      }
    },
    [visibleNodes, calculateMinimumContainerSize, recalculateAncestorBounds, dispatch]
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
  // Track whether the user is Shift-dragging (reparent mode) — for visual lift effect
  const [shiftDraggingNodeId, setShiftDraggingNodeId] = useState<string | null>(null);
  // Track which group has a child being dragged near its edge (exit indicator)
  const [exitingGroupId, setExitingGroupId] = useState<string | null>(null);
  // Track which node is hovered (for highlighting connected edges)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // Inline rename state
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  // Track connection tooltip (follows mouse)
  const [connTooltip, setConnTooltip] = useState<ConnectionTooltipInfo | null>(null);
  // Dismiss state for the empty canvas overlay (reset when card changes)
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const prevCardIdRef = useRef(card?.id);
  if (card?.id !== prevCardIdRef.current) {
    prevCardIdRef.current = card?.id;
    setOverlayDismissed(false);
  }

  const handleNodeHover = useCallback((nodeId: string | null) => {
    setHoveredNodeId(nodeId);
  }, []);

  const handleConnectionHover = useCallback((info: ConnectionTooltipInfo | null) => {
    setConnTooltip(info);
  }, []);

  const handleEdgeDelete = useCallback((connectionId: string) => {
    dispatch(deleteCardEdge(connectionId));
  }, [dispatch]);

  const handleEdgeSelect = useCallback((connectionId: string) => {
    dispatch(setSelectedNodes([]));
    dispatch(setSelectedEdges([connectionId]));
  }, [dispatch]);

  // Inline rename: double-click on any node label starts editing
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    setRenamingNodeId(nodeId);
  }, []);

  const handleRenameCommit = useCallback(
    (nodeId: string, newLabel: string) => {
      if (newLabel.trim()) {
        dispatch(updateCardNodeData({ nodeId, data: { label: newLabel.trim() } }));
      }
      setRenamingNodeId(null);
    },
    [dispatch]
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
          const connectedEdges = cardEdges.filter(
            (e) => e.source === nodeId || e.target === nodeId,
          );
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
    [dispatch, card]
  );

  // Select node to show pipeline in properties panel
  const handlePipelineClick = useCallback(
    (nodeId: string) => {
      dispatch(setSelectedNodes([nodeId]));
      dispatch(setSelectedEdges([]));
    },
    [dispatch]
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

  // Subscribe to card-level pipeline Socket.IO events
  useEffect(() => {
    if (!card?.id) return;
    let unsubCard: (() => void) | undefined;
    let cleanupCard: (() => void) | undefined;

    import('../../../shared/api/api-adapter').then(({ getApi }) => {
      const api = getApi();
      unsubCard = api.subscribeCardPipeline?.(card!.id);
      cleanupCard = api.onCardPipelineUpdate?.((event: any) => {
        dispatch(receiveCardPipelineUpdate(event));
      });
    }).catch(() => {});

    return () => {
      unsubCard?.();
      cleanupCard?.();
    };
  }, [card?.id, dispatch]);

  // Handle drag-over group detection + shift-drag visual state
  const handleDragOverGroup = useCallback(
    (groupId: string | null, draggedNodeId?: string | null) => {
      // Track which node is being Shift-dragged (for lift effect)
      setShiftDraggingNodeId(draggedNodeId || null);

      if (!groupId) {
        setDragOverGroupId(null);
        return;
      }
      // Highlight groups and VPC/Subnet as valid containers (blocks are flat cards)
      const groupNode = visibleNodes.find((n) => n.id === groupId);
      if (groupNode) {
        const nodeIceType = (groupNode.data.iceType as string) || '';
        const isNodeContainer =
          groupNode.type === 'container' || groupNode.type === ('group' as any) ||
          nodeIceType === 'Network.VPC' ||
          nodeIceType === 'Network.Subnet';
        setDragOverGroupId(isNodeContainer ? groupId : null);
      } else {
        setDragOverGroupId(null);
      }
    },
    [visibleNodes]
  );

  // Handle drag end — re-parent node only when Ctrl/Cmd is held.
  // Normal drag: node stays at current parent (or becomes top-level if dragged out).
  // Ctrl/Cmd + drag: explicitly reparent into the container at drop position.
  const handleDragEnd = useCallback(
    (itemId: string, x: number, y: number, forceReparent?: boolean) => {
      const draggedNode = visibleNodes.find((n) => n.id === itemId);
      if (!draggedNode) return;

      let bestContainer: LocalCanvasNode | null = null;

      // Only search for a container when Ctrl/Cmd is held (explicit reparent)
      if (forceReparent) {
        const centerX = x + draggedNode.width / 2;
        const centerY = y + draggedNode.height / 2;

        // Find the best container at the drop position (excluding the dragged node and its descendants)
        const descendantIds = new Set(getDescendantIds(itemId));
        descendantIds.add(itemId);

        let smallestArea = Infinity;

        for (const node of visibleNodes) {
          if (descendantIds.has(node.id)) continue;
          const nodeIceType = (node.data.iceType as string) || '';
          const isNodeContainer =
            node.type === 'container' || node.type === ('group' as any) ||
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
        // Uses the same "expand only" logic as calculateContainerBounds: union of
        // current container bounds with required bounds from all children.
        if (newParentId && bestContainer) {
          const existingChildren = visibleNodes.filter((n) => n.parentId === newParentId);
          // Include the just-reparented node as a child
          const allChildren = [
            ...existingChildren,
            { ...draggedNode, x, y, width: draggedNode.width, height: draggedNode.height },
          ];

          let minCX = Infinity,
            minCY = Infinity,
            maxCR = -Infinity,
            maxCB = -Infinity;
          for (const child of allChildren) {
            minCX = Math.min(minCX, child.x);
            minCY = Math.min(minCY, child.y);
            maxCR = Math.max(maxCR, child.x + child.width);
            maxCB = Math.max(maxCB, child.y + child.height);
          }

          // Required bounds from children + padding
          const reqLeft = minCX - CONTAINER_PAD;
          const reqTop = minCY - CONTAINER_PAD - CONTAINER_HEADER_H;
          const reqRight = maxCR + CONTAINER_PAD;
          const reqBottom = maxCB + CONTAINER_PAD;

          // Current container bounds
          const curLeft = bestContainer.x;
          const curTop = bestContainer.y;
          const curRight = bestContainer.x + bestContainer.width;
          const curBottom = bestContainer.y + bestContainer.height;

          // Expand (union of current + required)
          const newPX = Math.min(curLeft, reqLeft);
          const newPY = Math.min(curTop, reqTop);
          const newW = Math.max(MIN_CONTAINER_WIDTH, Math.max(curRight, reqRight) - newPX);
          const newH = Math.max(MIN_CONTAINER_HEIGHT, Math.max(curBottom, reqBottom) - newPY);

          if (newPX !== curLeft || newPY !== curTop) {
            dispatch(
              updateCardNodePositions([{ id: newParentId, position: { x: newPX, y: newPY } }])
            );
          }
          if (newW !== bestContainer.width || newH !== bestContainer.height) {
            dispatch(resizeCardNode({ id: newParentId, width: newW, height: newH }));
          }
        }
      }

      setDragOverGroupId(null);
      setExitingGroupId(null);
    },
    [visibleNodes, getDescendantIds, dispatch]
  );

  // Handle context menu
  const handleContextMenu = useCallback(
    (position: { x: number; y: number }, type: 'canvas' | 'node' | 'edge', targetId?: string) => {
      dispatch(openContextMenu({ position, type, targetId }));
    },
    [dispatch]
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
        dispatch(
          setCardViewportById({ cardId, viewport: { panX: vp.x, panY: vp.y, scale: vp.zoom } })
        );
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
  });

  // Non-passive wheel listener for zoom (React onWheel is passive, preventDefault fails)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      bindCanvas.onWheel(e as any);
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, [bindCanvas.onWheel]);

  // Find container at position for drop handling
  const findContainerAtPosition = useCallback(
    (x: number, y: number): LocalCanvasNode | null => {
      const containers = visibleNodes
        .filter((n) => {
          const iceType = (n.data.iceType as string) || '';
          return (
            isContainer(iceType) ||
            iceType.startsWith('Group.') ||
            iceType.startsWith('Block.') ||
            iceType.startsWith('Network.')
          );
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
    [visibleNodes]
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
            type: blueprint.blockType,
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
    [screenToCanvas, findContainerAtPosition, nodes, dispatch]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Sort nodes by z-index for proper rendering (containers behind resources)
  // Exclude nodes whose parent is collapsed
  const sortedNodes = useMemo(() => {
    return [...visibleNodes]
      .filter((node) => !hasCollapsedAncestor(node.id))
      .sort((a, b) => {
        const aIceType = (a.data.iceType as string) || '';
        const bIceType = (b.data.iceType as string) || '';
        const aZIndex = calculateZIndex(aIceType, 0);
        const bZIndex = calculateZIndex(bIceType, 0);

        if (aZIndex !== bZIndex) return aZIndex - bZIndex;

        // Selected nodes on top
        const aSelected = selectedNodes.includes(a.id);
        const bSelected = selectedNodes.includes(b.id);
        if (aSelected && !bSelected) return 1;
        if (!aSelected && bSelected) return -1;
        return 0;
      });
  }, [visibleNodes, selectedNodes, hasCollapsedAncestor]);

  // Compute port map for connection distribution
  // For each node+side, track how many connections use it and assign indices
  const portMap = useMemo(() => {
    const map = new Map<string, { index: number; count: number }>();

    // Helper: determine which side a connection uses on a node
    const getSide = (
      fromNode: LocalCanvasNode,
      toNode: LocalCanvasNode
    ): { exitSide: string; entrySide: string } => {
      const dx = toNode.x + toNode.width / 2 - (fromNode.x + fromNode.width / 2);
      const dy = toNode.y + toNode.height / 2 - (fromNode.y + fromNode.height / 2);
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0
          ? { exitSide: 'right', entrySide: 'left' }
          : { exitSide: 'left', entrySide: 'right' };
      } else {
        return dy > 0
          ? { exitSide: 'bottom', entrySide: 'top' }
          : { exitSide: 'top', entrySide: 'bottom' };
      }
    };

    // First pass: count connections per node+side
    const sideCounts = new Map<string, number>();
    const connSides: Array<{ connId: string; sourceKey: string; targetKey: string }> = [];

    for (const conn of canvasConnections) {
      const fromNode = effectiveNodes.find((n) => n.id === conn.from);
      const toNode = effectiveNodes.find((n) => n.id === conn.to);
      if (!fromNode || !toNode) continue;

      const { exitSide, entrySide } = getSide(fromNode, toNode);
      const sourceKey = `${conn.from}:${exitSide}`;
      const targetKey = `${conn.to}:${entrySide}`;

      sideCounts.set(sourceKey, (sideCounts.get(sourceKey) || 0) + 1);
      sideCounts.set(targetKey, (sideCounts.get(targetKey) || 0) + 1);
      connSides.push({ connId: conn.id, sourceKey, targetKey });
    }

    // Second pass: assign indices
    const sideIndices = new Map<string, number>();
    for (const { connId, sourceKey, targetKey } of connSides) {
      const srcIdx = sideIndices.get(sourceKey) || 0;
      const tgtIdx = sideIndices.get(targetKey) || 0;
      sideIndices.set(sourceKey, srcIdx + 1);
      sideIndices.set(targetKey, tgtIdx + 1);

      map.set(`${connId}:source`, { index: srcIdx, count: sideCounts.get(sourceKey) || 1 });
      map.set(`${connId}:target`, { index: tgtIdx, count: sideCounts.get(targetKey) || 1 });
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
    [screenToCanvas]
  );

  /** Track mouse during connection drawing */
  const handleConnectionMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawingConnection) return;
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setDrawingConnection((prev) => (prev ? { ...prev, currentPoint: canvasPos } : null));
    },
    [drawingConnection, screenToCanvas]
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

        // ── Connection constraints: one Source and one EnvVars per service ──
        if (sourceNode && card) {
          const srcType = (sourceNode.data?.iceType as string) || '';
          const tgtType = (targetNode.data?.iceType as string) || '';

          // Check both directions: which node is the "special" block, which is the service
          const specialType =
            (srcType === 'Source.Repository' || sourceNode.data?.behavior === 'source') ? 'Source.Repository' :
            srcType === 'Config.EnvVars' ? 'Config.EnvVars' :
            (tgtType === 'Source.Repository' || targetNode.data?.behavior === 'source') ? 'Source.Repository' :
            tgtType === 'Config.EnvVars' ? 'Config.EnvVars' :
            null;

          if (specialType) {
            const serviceNodeId = specialType === srcType || (specialType === 'Source.Repository' && sourceNode.data?.behavior === 'source')
              ? targetNode.id : sourceNode.id;
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
          srcIceType, tgtIceType,
          cardEdgesArr.map((e) => ({ source: e.source, target: e.target })),
          drawingConnection.sourceId, targetNode.id,
          sourceNode?.type, targetNode.type,
        );

        // Block hard errors (self-connection)
        if (warnings.some((w) => w.level === 'error')) {
          console.warn('[Canvas] Connection blocked:', warnings.filter((w) => w.level === 'error').map((w) => w.message).join('; '));
          setDrawingConnection(null);
          return;
        }

        // Circular dependency check
        if (wouldCreateCycle(drawingConnection.sourceId, targetNode.id, cardEdgesArr.map((e) => ({ source: e.source, target: e.target })))) {
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
          const sourceIsRepo = srcIceType === 'Source.Repository' || (sourceNode.data?.behavior === 'source');
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
          const targetIsRepo = tgtIceType === 'Source.Repository' || (targetNode.data?.behavior === 'source');
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
    [drawingConnection, screenToCanvas, effectiveNodes, dispatch]
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
        onMouseLeave={bindCanvas.onMouseLeave}
        onAuxClick={bindCanvas.onAuxClick}
        onContextMenu={bindCanvas.onContextMenu}
      >
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

          {/* Region labels layer — subtle VPC/Subnet backgrounds */}
          <g className="regions-layer">
            {sortedNodes
              .filter((node) => {
                const iceType = (node.data?.iceType as string) || '';
                return iceType === 'Network.VPC' || iceType === 'Network.Subnet';
              })
              .map((node) => {
                const regionAnimDelay = animatingNodes[node.id];
                const regionAnimStyle: CSSProperties | undefined = regionAnimDelay !== undefined
                  ? {
                      animation: `ice-node-entrance 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${regionAnimDelay}ms both`,
                      transformOrigin: `${node.x + node.width / 2}px ${node.y + node.height / 2}px`,
                    }
                  : undefined;
                return regionAnimStyle ? (
                  <g key={`region-anim-${node.id}`} style={regionAnimStyle}>
                    <SvgRegionLabel key={`region-${node.id}`} node={node} />
                  </g>
                ) : (
                  <SvgRegionLabel key={`region-${node.id}`} node={node} />
                );
              })}
          </g>

          {/* Connections layer — non-highlighted (behind nodes) */}
          <g className="connections-layer">
            {canvasConnections.map((conn) => {
              const isHighlighted =
                (hoveredNodeId !== null &&
                  (conn.from === hoveredNodeId || conn.to === hoveredNodeId)) ||
                (selectedNodes.length > 0 &&
                  (selectedNodes.includes(conn.from) || selectedNodes.includes(conn.to)));
              if (isHighlighted) return null; // rendered in top layer
              const srcPort = portMap.get(`${conn.id}:source`);
              const tgtPort = portMap.get(`${conn.id}:target`);
              const edgeAnimDelay = animatingEdges[conn.id];
              const edgeAnimStyle: CSSProperties | undefined = edgeAnimDelay !== undefined
                ? { animation: `ice-edge-entrance 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${edgeAnimDelay}ms both` }
                : undefined;
              // Check if this edge connects a Source.Repository to a node with active pipeline
              const srcNode = effectiveNodes.find((n) => n.id === conn.from);
              const tgtNode = effectiveNodes.find((n) => n.id === conn.to);
              const srcIsSource = (srcNode?.data?.iceType as string) === 'Source.Repository' || srcNode?.data?.behavior === 'source';
              const tgtIsSource = (tgtNode?.data?.iceType as string) === 'Source.Repository' || tgtNode?.data?.behavior === 'source';
              const serviceNodeId = srcIsSource ? conn.to : tgtIsSource ? conn.from : null;
              const isPipelineEdge = !!(srcIsSource || tgtIsSource) && !!serviceNodeId;
              const pipelineStatus = serviceNodeId ? pipelineNodeStatus[serviceNodeId] : null;
              const edgePipelineActive = isPipelineEdge && pipelineStatus != null &&
                (pipelineStatus.status === 'queued' || pipelineStatus.status === 'building' || pipelineStatus.status === 'deploying');

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
                  lod={lod}
                  pipelineActive={edgePipelineActive}
                />
              );
              return edgeAnimStyle ? (
                <g key={`anim-edge-${conn.id}`} style={edgeAnimStyle}>
                  {connectionEl}
                </g>
              ) : connectionEl;
            })}
          </g>

          {/* SVG filter for Shift-drag lift shadow */}
          <defs>
            <filter id="shift-drag-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="#000" floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Nodes layer — Groups, Blocks, Resources, or Log terminals */}
          <g className="nodes-layer">
            {sortedNodes.map((node) => {
              const iceType = (node.data?.iceType as string) || '';

              // VPC/Subnet rendered as region labels above, skip here
              if (iceType === 'Network.VPC' || iceType === 'Network.Subnet') {
                return null;
              }

              const isLogNode =
                iceType === 'Log.Terminal' ||
                iceType === 'Observability.Logs' ||
                iceType.startsWith('Log.');
              const isGroup = node.type === 'container' || node.type === ('group' as any);
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

              // Shift-drag lift effect: scale(1.2) + shadow
              const isLifted = shiftDraggingNodeId === node.id;
              const cx = node.x + node.width / 2;
              const cy = node.y + node.height / 2;
              const liftTransform = isLifted
                ? `translate(${cx}, ${cy}) scale(1.4) translate(${-cx}, ${-cy})`
                : undefined;
              const liftFilter = isLifted ? 'url(#shift-drag-shadow)' : undefined;
              const liftOpacity = isLifted ? 0.85 : undefined;

              const wrapLift = (content: React.ReactNode) => {
                // Wrap with entrance animation if needed
                const animated = isAnimating ? (
                  <g key={`anim-${node.id}`} style={animStyle}>
                    {content}
                  </g>
                ) : content;

                return isLifted ? (
                  <g
                    key={node.id}
                    transform={liftTransform}
                    filter={liftFilter}
                    opacity={liftOpacity}
                  >
                    {animated}
                  </g>
                ) : (
                  animated
                );
              };

              // ── Semantic Zoom: LOD 1 & 2 — same position/size, simplified content, bigger text/icons ──
              // Cards stay at their exact original canvas position and size.
              // Content is stripped down and remaining elements are scaled up for readability.
              if (lod < 3 && !isLogNode && !isGroup) {
                const W = node.width;
                const H = node.height;
                const iconUrl = (() => {
                  const runtime = (node.data?.runtime as string) || '';
                  const provider = ((node.data?.provider as string) || 'aws').toLowerCase() as Provider;
                  const bi = getBrandIcon(runtime) || getBrandIcon(iceType) || getBrandIcon(node.label);
                  if (bi) return bi.url;
                  const pi = getIcon(iceType, provider);
                  return pi?.icon || DEFAULT_ICON;
                })();

                const statusColor = node.data?.status === 'failed' || node.data?.status === 'error' ? '#ef4444'
                  : node.data?.status === 'active' || node.data?.status === 'running' ? '#22c55e' : '#64748b';
                const pipeStatus = pipelineNodeStatus[node.id];
                const dotColor = pipeStatus?.status === 'success' ? '#22c55e'
                  : pipeStatus?.status === 'failed' ? '#ef4444'
                  : pipeStatus?.status === 'building' || pipeStatus?.status === 'deploying' ? '#3b82f6'
                  : statusColor;
                const isNodeSelected = selectedNodes.includes(node.id);
                const borderColor = isNodeSelected ? '#3b82f6' : 'var(--ice-border)';

                if (lod <= 1) {
                  // L1 — Same card rect, large centered icon, big status dot, bold label
                  const iconSize = Math.min(W * 0.5, H * 0.45);
                  const fontSize = Math.max(16, W * 0.08);
                  const dotR = Math.max(6, W * 0.03);

                  return wrapLift(
                    <g key={`${node.id}-lod1`} data-node-id={node.id} style={{ cursor: 'move' }}>
                      {isNodeSelected && <rect x={node.x - 3} y={node.y - 3} width={W + 6} height={H + 6} rx={11} fill="none" stroke="#3b82f6" strokeWidth={2} opacity={0.5} />}
                      <rect x={node.x} y={node.y} width={W} height={H} rx={8} fill="var(--ice-bg-surface)" stroke={borderColor} strokeWidth={isNodeSelected ? 2 : 1} />
                      {/* Large centered icon */}
                      <image x={node.x + (W - iconSize) / 2} y={node.y + H * 0.1} width={iconSize} height={iconSize}
                        href={iconUrl} preserveAspectRatio="xMidYMid meet" />
                      {/* Bold label below icon */}
                      <text x={node.x + W / 2} y={node.y + H * 0.1 + iconSize + fontSize * 0.9} textAnchor="middle" dominantBaseline="middle"
                        fill="var(--ice-text-primary)" fontSize={fontSize} fontWeight="700"
                        fontFamily="'JetBrains Mono Variable', monospace" style={{ pointerEvents: 'none' }}>
                        {(node.label || '').length > 10 ? (node.label || '').slice(0, 10) + '…' : (node.label || '')}
                      </text>
                      {/* Status dot */}
                      <circle cx={node.x + W / 2} cy={node.y + H - dotR * 2} r={dotR} fill={dotColor} opacity={0.9} />
                    </g>
                  );
                }

                // L2 — Same card rect, bigger icon + label, status dot. No metadata/scaling/cost
                const iconSize = Math.min(28, H * 0.35);
                const fontSize = Math.max(14, W * 0.065);
                const dotR = Math.max(4, W * 0.02);

                return wrapLift(
                  <g key={`${node.id}-lod2`} data-node-id={node.id} style={{ cursor: 'move' }}>
                    {isNodeSelected && <rect x={node.x - 3} y={node.y - 3} width={W + 6} height={H + 6} rx={11} fill="none" stroke="#3b82f6" strokeWidth={2} opacity={0.5} />}
                    <rect x={node.x} y={node.y} width={W} height={H} rx={8} fill="var(--ice-bg-surface)" stroke={borderColor} strokeWidth={isNodeSelected ? 1.5 : 1} />
                    {/* Larger icon */}
                    <image x={node.x + 12} y={node.y + (H - iconSize) / 2 - 4} width={iconSize} height={iconSize}
                      href={iconUrl} preserveAspectRatio="xMidYMid meet" />
                    {/* Bigger label */}
                    <text x={node.x + 12 + iconSize + 8} y={node.y + H / 2 - 6} dominantBaseline="middle"
                      fill="var(--ice-text-primary)" fontSize={fontSize} fontWeight="600"
                      fontFamily="'JetBrains Mono Variable', monospace" style={{ pointerEvents: 'none' }}>
                      {(node.label || '').length > 12 ? (node.label || '').slice(0, 12) + '…' : (node.label || '')}
                    </text>
                    {/* Status dot + label */}
                    <circle cx={node.x + 12 + iconSize + 8} cy={node.y + H / 2 + fontSize * 0.7} r={dotR} fill={dotColor} opacity={0.9} />
                    <text x={node.x + 12 + iconSize + 8 + dotR * 2 + 4} y={node.y + H / 2 + fontSize * 0.7} dominantBaseline="middle"
                      fill="var(--ice-text-secondary)" fontSize={Math.max(10, fontSize * 0.7)}
                      fontFamily="ui-monospace, 'SFMono-Regular', monospace" opacity={0.7} style={{ pointerEvents: 'none' }}>
                      {(node.data?.status as string) || ''}
                    </text>
                  </g>
                );
              }

              if (isLogNode) {
                return wrapLift(
                  <SvgLogNode
                    key={isLifted ? undefined : `${node.id}-lod${lod}`}
                    node={node}
                    isSelected={selectedNodes.includes(node.id)}
                    onToggleFold={(nodeId) => dispatch(toggleCardNodeFold(nodeId))}
                  />
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
                    onToggleFold={(nodeId) => dispatch(toggleCardNodeFold(nodeId))}
                    isDragOver={dragOverGroupId === node.id}
                    isChildExiting={exitingGroupId === node.id}
                    isRenaming={renamingNodeId === node.id}
                    onDoubleClickLabel={() => handleNodeDoubleClick(node.id)}
                    onRenameCommit={(newLabel) => handleRenameCommit(node.id, newLabel)}
                    onRenameCancel={handleRenameCancel}
                    lod={lod}
                  />
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
                    onToggleFold={(nodeId) => dispatch(toggleCardNodeFold(nodeId))}
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
                  />
                );
              }

              return wrapLift(
                <SvgCompactNode
                  key={isLifted ? undefined : `${node.id}-lod${lod}`}
                  node={node}
                  isSelected={selectedNodes.includes(node.id)}
                  childNodes={sortedNodes.filter((n) => n.parentId === node.id)}
                  onToggleFold={(nodeId) => dispatch(toggleCardNodeFold(nodeId))}
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
                />
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
              return (
                <g className="connection-preview" style={{ pointerEvents: 'none' }}>
                  <path
                    d={pathD}
                    stroke="#22d3ee"
                    strokeWidth={2}
                    fill="none"
                    strokeDasharray="8 4"
                    opacity={0.7}
                  />
                  <circle
                    cx={sourcePoint.x}
                    cy={sourcePoint.y}
                    r={4}
                    fill="#22d3ee"
                    opacity={0.9}
                  />
                  <circle
                    cx={currentPoint.x}
                    cy={currentPoint.y}
                    r={4}
                    fill="#22d3ee"
                    opacity={0.6}
                  />
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
                />
              ))}
            </g>
          )}

          {/* User traffic icon for exposed services — only when no explicit Network.Internet block */}
          {showVirtualUserNode && pinnedUserPos && (
            <SvgUserNode
              position={pinnedUserPos}
              scale={viewport.zoom}
              onPositionChange={setUserNodePos}
            />
          )}

          {/* Highlighted connections layer — ON TOP of nodes */}
          <g className="connections-highlighted-layer">
            {canvasConnections.map((conn) => {
              // The "active" node is the hovered node, or first selected node
              const activeNodeId =
                hoveredNodeId || (selectedNodes.length > 0 ? selectedNodes[0] : null);
              const isHighlighted =
                (hoveredNodeId !== null &&
                  (conn.from === hoveredNodeId || conn.to === hoveredNodeId)) ||
                (selectedNodes.length > 0 &&
                  (selectedNodes.includes(conn.from) || selectedNodes.includes(conn.to)));
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
                  lod={lod}
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

export default SvgCanvas;

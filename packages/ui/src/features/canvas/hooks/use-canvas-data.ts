/**
 * useCanvasData
 *
 * Bundles every `useMemo`-derived data-shape that the canvas orchestrator
 * (`svg-canvas.tsx`) computes from the active card + its ambient Redux
 * inputs (pipelineNodeStatus, viewLevel, validationIssues, selectedNodes).
 * Twelve memos in dependency order, plus an internal `hasCollapsedAncestor`
 * useCallback that several of them close over:
 *
 *  1. `nodes`             — `card?.nodes || []`
 *  2. `edges`             — `card?.edges || []`
 *  3. `canvasNodes`       — Redux node → CanvasNode projection with
 *                            type-based sizing (computeNodeSizes /
 *                            toLocalCanvasNode); folded nodes use their
 *                            collapsed visual height.
 *  4. `visibleNodes`      — view-level filter + parent-promotion for
 *                            hidden ancestors.
 *  5. `hasCollapsedAncestor` (internal) — bound walk over `visibleNodes`.
 *  6. `foldedRemap`       — hidden-id → first-visible-ancestor-id map.
 *  7. `effectiveNodes`    — visible nodes minus collapsed-descendant
 *                            subtrees, with folded groups at compact height.
 *  8. `canvasConnections` — edge → CanvasConnection projection with
 *                            folded-remap, dedup/bundle, and L1 aggregation.
 *  9. `canvasItems`       — drag/hit-test items, sorted by z-index so
 *                            children sit above parents.
 * 10. `nodeValidationMap` — issue → per-node {severity, count} lookup.
 * 11. `nodeDepthMap`      — nesting depth per node id.
 * 12. `sortedNodes`       — render-order list (z-index + selected-on-top).
 * 13. `portMap`           — connection → fan-out port assignment.
 *
 * Behavior preserved verbatim from the inline cluster previously in
 * `svg-canvas.tsx` L166-637 (rf-canv2-1).
 *
 * The `hasCollapsedAncestor` useCallback is internal because the memos
 * that depend on it are all in this hook — no consumer reaches in from
 * outside. The other three traversal callbacks
 * (`getDescendantIds`, `getAllDescendantIds`, `findContainerAtPosition`)
 * have external consumers (drag-target-highlight, container-move,
 * canvas-drop) and live in a sibling hook (`useCanvasTraversal`).
 *
 * rf-canv2-1.
 */

import { useCallback, useMemo } from 'react';
import { isTypeVisibleAtLevel, type ViewLevel } from '../../../config/visualization-config';
import { calculateZIndex } from '../../../shared/utils/auto-layout';
import {
  hasCollapsedAncestor as hasCollapsedAncestorUtil,
  buildFoldedRemap,
} from '../utils/folded-remap';
import { computeNodeSizes, toLocalCanvasNode } from '../utils/canvas-node-sizing';
import { buildVisibleConnections, computePortMap } from '../utils/canvas-connections';
import type { Card, CardNode, CardEdge } from '../../../store/slices/cards-slice';
import type { NodePipelineStatus } from '../../../store/slices/pipeline-slice';
import type { CanvasIssue } from '../../../store/slices/validation-slice';
import type { CanvasNode, CanvasConnection } from '../components/types';
import type { CanvasItem } from './use-canvas-interactions';

export interface UseCanvasDataArgs {
  card: Card | undefined;
  pipelineNodeStatus: Record<string, NodePipelineStatus>;
  viewLevel: ViewLevel;
  validationIssues: readonly CanvasIssue[];
  selectedNodes: string[];
}

export interface UseCanvasDataResult {
  nodes: CardNode[];
  edges: CardEdge[];
  canvasNodes: CanvasNode[];
  visibleNodes: CanvasNode[];
  foldedRemap: Map<string, string>;
  effectiveNodes: CanvasNode[];
  canvasConnections: CanvasConnection[];
  canvasItems: CanvasItem[];
  nodeValidationMap: Map<string, { severity: 'error' | 'warning' | 'info'; count: number }>;
  nodeDepthMap: Map<string, number>;
  sortedNodes: CanvasNode[];
  portMap: ReturnType<typeof computePortMap>;
}

export function useCanvasData(args: UseCanvasDataArgs): UseCanvasDataResult {
  const { card, pipelineNodeStatus, viewLevel, validationIssues, selectedNodes } = args;

  // (1) Get nodes and edges from the card
  const nodes = useMemo<CardNode[]>(() => card?.nodes || [], [card?.nodes]);
  const edges = useMemo<CardEdge[]>(() => card?.edges || [], [card?.edges]);

  // (3) Convert Redux nodes to canvas format with type-based sizing.
  // Uses VISUAL dimensions: folded nodes get their collapsed height (36-38px)
  // so hit-testing, container expansion, and rendering all use consistent bounds.
  const canvasNodes: CanvasNode[] = useMemo(() => {
    return nodes.map((node) => {
      const hasPipelineStatus = !!(
        pipelineNodeStatus[node.id] && pipelineNodeStatus[node.id].status !== 'idle'
      );
      const sizes = computeNodeSizes(node, hasPipelineStatus);
      return toLocalCanvasNode(node, hasPipelineStatus, sizes);
    });
  }, [nodes, pipelineNodeStatus]);

  // (4) Filter nodes by view level, promoting children of hidden parents to root
  const visibleNodes: CanvasNode[] = useMemo(() => {
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

  // (5) Internal: check if any ancestor is folded (node should be hidden).
  // Thin wrapper binding to the pure util in ../utils/folded-remap.
  // Kept private because only internal memos use it; the cross-hook
  // traversal callbacks live in `useCanvasTraversal`.
  const hasCollapsedAncestor = useCallback(
    (nodeId: string): boolean => hasCollapsedAncestorUtil(visibleNodes, nodeId),
    [visibleNodes],
  );

  // (6) Build remap for folded children: hidden node ID → first visible ancestor ID.
  const foldedRemap = useMemo(
    () => buildFoldedRemap(canvasNodes, visibleNodes),
    [canvasNodes, visibleNodes],
  );

  // (7) Nodes as they appear visually — hidden children removed, folded groups at compact height.
  // Used for connection routing so paths match what's actually rendered.
  const effectiveNodes: CanvasNode[] = useMemo(() => {
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

  // (8) Convert edges to canvas format
  const canvasConnections: CanvasConnection[] = useMemo(
    () => buildVisibleConnections({ edges, effectiveNodes, foldedRemap, viewLevel }),
    [edges, effectiveNodes, foldedRemap, viewLevel],
  );

  // (9) Nodes are draggable unless they have a collapsed ancestor.
  // Sorted by z-index so hit-testing (reverse iteration) finds children before parents.
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

  // (10) Build per-node validation lookup from validation issues
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
        issueRank > currentRank
          ? (issue.severity as 'error' | 'warning' | 'info')
          : (existing?.severity ?? 'info');
      map.set(issue.nodeId, { severity, count });
    }
    return map;
  }, [validationIssues]);

  // (11) Compute nesting depth for rendering z-order
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

  // (12) Sort nodes by z-index for proper rendering (containers behind resources)
  // Exclude nodes whose parent is collapsed
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

  // (13) Compute port map for connection distribution.
  // For each node+side, sort connections by the OTHER endpoint's position
  // so that ports fan out in natural order without crossings.
  const portMap = useMemo(
    () => computePortMap(canvasConnections, effectiveNodes),
    [canvasConnections, effectiveNodes],
  );

  return {
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
  };
}

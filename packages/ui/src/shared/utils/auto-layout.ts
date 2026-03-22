/**
 * Auto-Layout Utility
 *
 * Automatically arranges nodes in a hierarchical, non-overlapping layout.
 * All nodes use the unified Mac-style component with consistent sizing.
 *
 * Layout Strategy:
 * 1. Group nodes by category (VPCs, Blocks, Resources)
 * 2. Calculate actual sizes including children
 * 3. Position nodes in rows without overlapping
 * 4. Maintain hierarchy (children positioned relative to parents)
 */

import { isContainer as isContainerType } from '../../config/containment-rules';
import {
  computeCompactNodeHeight,
  computeCompactNodeWidth,
} from '../../features/canvas/components/nodes/svg-compact-node';

// =============================================================================
// Constants - Unified Node Sizes (Mac-style)
// =============================================================================

/** Minimum width for container nodes (blocks/VPCs) */
const MIN_BLOCK_WIDTH = 240;

/** Minimum height for collapsed nodes */
const MIN_NODE_HEIGHT_COLLAPSED = 36;

/** Minimum height for container nodes */
const MIN_BLOCK_HEIGHT = 150;

/** Gap between top-level nodes */
const NODE_GAP = 80;

/** Gap between child nodes inside containers */
const CHILD_GAP = 24;

/** Padding inside containers */
const CONTAINER_PADDING = 20;

/** Header height for all nodes */
const HEADER_HEIGHT = 36;

/** Extra padding for VPCs and large containers */
const VPC_EXTRA_PADDING = 20;

// =============================================================================
// Types
// =============================================================================

export interface LayoutNode {
  id: string;
  type: string;
  iceType: string;
  label: string;
  parentId?: string | null;
  width: number;
  height: number;
  x: number;
  y: number;
  children?: LayoutNode[];
  data: Record<string, unknown>;
  folded?: boolean;
}

export interface LayoutOptions {
  /** Starting X position */
  startX?: number;
  /** Starting Y position */
  startY?: number;
  /** Gap between nodes */
  nodeGap?: number;
  /** Maximum nodes per row */
  nodesPerRow?: number;
  /** Padding inside containers */
  containerPadding?: number;
  /** Layout mode: 'flow' (left-to-right data flow) or 'grid' (category-based grid) */
  layout?: 'flow' | 'grid';
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  startX: 50,
  startY: 50,
  nodeGap: NODE_GAP,
  nodesPerRow: 3,
  containerPadding: CONTAINER_PADDING,
  layout: 'flow',
};

// =============================================================================
// Layout Algorithm
// =============================================================================

/**
 * Auto-layout nodes using the selected strategy.
 * 'flow' (default): left-to-right data flow using topological ordering from edges.
 * 'grid': category-based grid (VPCs → Subnets → Blocks → Resources).
 */
export function autoLayout(
  nodes: LayoutNode[],
  edges: Array<{ source: string; target: string; relationship?: string }>,
  options: LayoutOptions = {},
): LayoutNode[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (nodes.length === 0) return [];

  // Build parent-child relationships (shared by both layouts)
  const parentMap = new Map<string, string>();
  const childrenMap = new Map<string, string[]>();

  for (const edge of edges) {
    if (edge.relationship === 'contains') {
      parentMap.set(edge.target, edge.source);
      const children = childrenMap.get(edge.source) || [];
      if (!children.includes(edge.target)) {
        children.push(edge.target);
        childrenMap.set(edge.source, children);
      }
    }
  }

  for (const node of nodes) {
    if (node.parentId) {
      if (!parentMap.has(node.id)) {
        parentMap.set(node.id, node.parentId);
      }
      const children = childrenMap.get(node.parentId) || [];
      if (!children.includes(node.id)) {
        children.push(node.id);
        childrenMap.set(node.parentId, children);
      }
    }
  }

  // Create node lookup with copies
  const nodeMap = new Map<string, LayoutNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, { ...node });
  }

  // Identify top-level nodes (no parent or parent not in our node set)
  const topLevelNodes = nodes.filter((n) => {
    if (!parentMap.has(n.id)) return true;
    const parentId = parentMap.get(n.id)!;
    return !nodeMap.has(parentId);
  });

  // ── Shared helpers ──────────────────────────────────────────────────────

  const calculateNodeSize = (node: LayoutNode): { width: number; height: number } => {
    const childIds = childrenMap.get(node.id) || [];
    const isFolded = node.folded || (node.data?.folded as boolean) || false;
    const iceType = node.iceType || '';
    const isVPC = iceType === 'Network.VPC';
    const isSubnet = iceType === 'Network.Subnet';
    const isLargeContainer = isVPC || isSubnet;
    const isGroup = iceType.startsWith('Group.') || node.type === 'container' || node.type === ('group' as any);
    const isBlock = iceType.startsWith('Block.') || node.type === 'block';

    if (isFolded || childIds.length === 0) {
      const contentH = computeCompactNodeHeight(node.data || {}, isBlock || isGroup);
      const contentW = computeCompactNodeWidth(isBlock || isGroup);
      return {
        width: Math.max(node.width || contentW, contentW),
        height: isFolded ? MIN_NODE_HEIGHT_COLLAPSED : Math.max(node.height || 0, contentH),
      };
    }

    const children = childIds.map((id) => nodeMap.get(id)).filter((n): n is LayoutNode => !!n);
    for (const child of children) {
      const childSize = calculateNodeSize(child);
      child.width = childSize.width;
      child.height = childSize.height;
    }

    const containerPadding = isLargeContainer ? opts.containerPadding + VPC_EXTRA_PADDING : opts.containerPadding;
    const childGap = CHILD_GAP;
    const childrenPerRow = isVPC ? 3 : 2;
    let maxRowWidth = 0;
    let totalHeight = HEADER_HEIGHT + containerPadding;
    let rowWidth = 0;
    let rowHeight = 0;
    let itemsInRow = 0;

    for (const child of children) {
      if (itemsInRow >= childrenPerRow) {
        maxRowWidth = Math.max(maxRowWidth, rowWidth - childGap);
        totalHeight += rowHeight + childGap;
        rowWidth = 0;
        rowHeight = 0;
        itemsInRow = 0;
      }
      rowWidth += child.width + childGap;
      rowHeight = Math.max(rowHeight, child.height);
      itemsInRow++;
    }

    if (itemsInRow > 0) {
      maxRowWidth = Math.max(maxRowWidth, rowWidth - childGap);
      totalHeight += rowHeight;
    }
    totalHeight += containerPadding;

    const calculatedWidth = maxRowWidth + containerPadding * 2;
    const minContainerWidth = isVPC ? 600 : isSubnet ? 400 : MIN_BLOCK_WIDTH;
    const minContainerHeight = isVPC ? 400 : isSubnet ? 300 : MIN_BLOCK_HEIGHT;

    return {
      width: Math.max(minContainerWidth, calculatedWidth),
      height: Math.max(minContainerHeight, totalHeight),
    };
  };

  const positionChildren = (parent: LayoutNode): void => {
    const childIds = childrenMap.get(parent.id) || [];
    if (childIds.length === 0) return;

    const children = childIds.map((id) => nodeMap.get(id)).filter((n): n is LayoutNode => !!n);
    const iceType = parent.iceType || '';
    const isVPC = iceType === 'Network.VPC';
    const isSubnet = iceType === 'Network.Subnet';
    const isLargeContainer = isVPC || isSubnet;

    const containerPadding = isLargeContainer ? opts.containerPadding + VPC_EXTRA_PADDING : opts.containerPadding;
    const childGap = CHILD_GAP;
    const childrenPerRow = isVPC ? 3 : 2;

    let currentX = containerPadding;
    let currentY = HEADER_HEIGHT + containerPadding;
    let rowHeight = 0;
    let itemsInRow = 0;

    for (const child of children) {
      if (itemsInRow >= childrenPerRow) {
        currentX = containerPadding;
        currentY += rowHeight + childGap;
        rowHeight = 0;
        itemsInRow = 0;
      }
      child.x = currentX;
      child.y = currentY;
      child.parentId = parent.id;
      currentX += child.width + childGap;
      rowHeight = Math.max(rowHeight, child.height);
      itemsInRow++;
      positionChildren(child);
    }
  };

  // ── Dispatch to layout strategy ─────────────────────────────────────────

  if (opts.layout === 'flow') {
    return flowLayout(
      nodes,
      edges,
      topLevelNodes,
      nodeMap,
      parentMap,
      childrenMap,
      calculateNodeSize,
      positionChildren,
      opts,
    );
  }

  return gridLayout(topLevelNodes, nodeMap, childrenMap, calculateNodeSize, positionChildren, opts);
}

// =============================================================================
// Flow Layout — Edge-based topological ordering, left-to-right columns
// =============================================================================

function flowLayout(
  _allNodes: LayoutNode[],
  edges: Array<{ source: string; target: string; relationship?: string }>,
  topLevelNodes: LayoutNode[],
  nodeMap: Map<string, LayoutNode>,
  parentMap: Map<string, string>,
  childrenMap: Map<string, string[]>,
  calculateNodeSize: (node: LayoutNode) => { width: number; height: number },
  positionChildren: (parent: LayoutNode) => void,
  opts: Required<LayoutOptions>,
): LayoutNode[] {
  const layoutResults: LayoutNode[] = [];

  // Build dependency graph from non-containment edges among top-level nodes.
  // Edges targeting child nodes are resolved to their top-level ancestor group,
  // so Gateway → WebApp (child of Frontend Group) becomes Gateway → Frontend Group.
  const topIds = new Set(topLevelNodes.map((n) => n.id));
  const adj = new Map<string, string[]>(); // source → targets
  const inDeg = new Map<string, number>();

  // Resolve any node ID to its top-level ancestor
  const toTopLevel = (id: string): string | null => {
    if (topIds.has(id)) return id;
    const p = parentMap.get(id);
    if (!p) return null;
    return toTopLevel(p);
  };

  for (const id of topIds) {
    adj.set(id, []);
    inDeg.set(id, 0);
  }

  // Track added edges to avoid duplicates from multiple children
  const addedEdges = new Set<string>();

  for (const edge of edges) {
    if (edge.relationship === 'contains') continue;
    const s = toTopLevel(edge.source);
    const t = toTopLevel(edge.target);
    if (s && t && s !== t && topIds.has(s) && topIds.has(t)) {
      const key = `${s}->${t}`;
      if (!addedEdges.has(key)) {
        addedEdges.add(key);
        adj.get(s)!.push(t);
        inDeg.set(t, (inDeg.get(t) || 0) + 1);
      }
    }
  }

  // BFS topological sort to assign layers
  const layerOf = new Map<string, number>();
  const queue: string[] = [];

  for (const id of topIds) {
    if ((inDeg.get(id) || 0) === 0) {
      queue.push(id);
      layerOf.set(id, 0);
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const curLayer = layerOf.get(cur)!;
    for (const next of adj.get(cur) || []) {
      const newLayer = curLayer + 1;
      const existingLayer = layerOf.get(next);
      if (existingLayer === undefined || newLayer > existingLayer) {
        layerOf.set(next, newLayer);
      }
      inDeg.set(next, (inDeg.get(next) || 0) - 1);
      if (inDeg.get(next) === 0) {
        queue.push(next);
      }
    }
  }

  // Assign any unvisited nodes (cycles or disconnected) to layer 0
  for (const id of topIds) {
    if (!layerOf.has(id)) {
      layerOf.set(id, 0);
    }
  }

  // Group top-level nodes into layer buckets
  const maxLayer = Math.max(...Array.from(layerOf.values()), 0);
  const layers: LayoutNode[][] = Array.from({ length: maxLayer + 1 }, () => []);

  for (const node of topLevelNodes) {
    const n = nodeMap.get(node.id)!;
    const layer = layerOf.get(node.id) || 0;
    layers[layer].push(n);
  }

  // Sort within each layer: groups first, then blocks, then resources, then by label
  for (const layer of layers) {
    layer.sort((a, b) => {
      const aIsGroup =
        a.iceType?.startsWith('Group.') || a.type === 'container' || a.type === ('group' as any)
          ? 0
          : a.iceType?.startsWith('Block.') || a.type === 'block'
            ? 1
            : 2;
      const bIsGroup =
        b.iceType?.startsWith('Group.') || b.type === 'container' || b.type === ('group' as any)
          ? 0
          : b.iceType?.startsWith('Block.') || b.type === 'block'
            ? 1
            : 2;
      if (aIsGroup !== bIsGroup) return aIsGroup - bIsGroup;
      return a.label.localeCompare(b.label);
    });
  }

  // Calculate sizes for all top-level nodes
  for (const layer of layers) {
    for (const node of layer) {
      const size = calculateNodeSize(node);
      node.width = size.width;
      node.height = size.height;
      positionChildren(node);
    }
  }

  // Position: columns left-to-right, nodes stacked top-to-bottom per column
  const absolutizeChildren = (parent: LayoutNode, parentX: number, parentY: number): void => {
    const childIds = childrenMap.get(parent.id) || [];
    for (const childId of childIds) {
      const child = nodeMap.get(childId);
      if (child) {
        const absX = parentX + child.x;
        const absY = parentY + child.y;
        child.x = absX;
        child.y = absY;
        layoutResults.push(child);
        absolutizeChildren(child, absX, absY);
      }
    }
  };

  let columnX = opts.startX;

  for (const layer of layers) {
    if (layer.length === 0) continue;

    let nodeY = opts.startY;
    let maxWidthInCol = 0;

    for (const node of layer) {
      node.x = columnX;
      node.y = nodeY;

      layoutResults.push(node);
      absolutizeChildren(node, node.x, node.y);

      maxWidthInCol = Math.max(maxWidthInCol, node.width);
      nodeY += node.height + opts.nodeGap;
    }

    columnX += maxWidthInCol + opts.nodeGap;
  }

  // Collision detection pass — push apart any overlapping top-level nodes
  resolveOverlaps(topLevelNodes.map((n) => nodeMap.get(n.id)!).filter(Boolean), opts.nodeGap);

  return layoutResults;
}

// =============================================================================
// Grid Layout — Original category-based layout (fallback)
// =============================================================================

function gridLayout(
  topLevelNodes: LayoutNode[],
  nodeMap: Map<string, LayoutNode>,
  childrenMap: Map<string, string[]>,
  calculateNodeSize: (node: LayoutNode) => { width: number; height: number },
  positionChildren: (parent: LayoutNode) => void,
  opts: Required<LayoutOptions>,
): LayoutNode[] {
  const layoutResults: LayoutNode[] = [];

  // Categorize
  const vpcs: LayoutNode[] = [];
  const subnets: LayoutNode[] = [];
  const groups: LayoutNode[] = [];
  const blocks: LayoutNode[] = [];
  const resources: LayoutNode[] = [];

  for (const node of topLevelNodes) {
    const iceType = node.iceType || '';
    const n = nodeMap.get(node.id)!;

    if (iceType === 'Network.VPC') {
      vpcs.push(n);
    } else if (iceType === 'Network.Subnet') {
      subnets.push(n);
    } else if (iceType.startsWith('Group.') || node.type === 'container' || node.type === ('group' as any)) {
      groups.push(n);
    } else if (iceType.startsWith('Block.') || node.type === 'block') {
      blocks.push(n);
    } else {
      resources.push(n);
    }
  }

  vpcs.sort((a, b) => a.label.localeCompare(b.label));
  subnets.sort((a, b) => a.label.localeCompare(b.label));
  groups.sort((a, b) => a.label.localeCompare(b.label));
  blocks.sort((a, b) => a.label.localeCompare(b.label));
  resources.sort((a, b) => a.label.localeCompare(b.label));

  const absolutizeChildren = (parent: LayoutNode, parentX: number, parentY: number): void => {
    const childIds = childrenMap.get(parent.id) || [];
    for (const childId of childIds) {
      const child = nodeMap.get(childId);
      if (child) {
        const absX = parentX + child.x;
        const absY = parentY + child.y;
        child.x = absX;
        child.y = absY;
        layoutResults.push(child);
        absolutizeChildren(child, absX, absY);
      }
    }
  };

  const layoutCategory = (
    categoryNodes: LayoutNode[],
    startX: number,
    startY: number,
    nodesPerRow: number,
  ): { maxY: number; maxX: number } => {
    let currentX = startX;
    let currentY = startY;
    let rowMaxHeight = 0;
    let maxX = startX;
    let maxY = startY;
    let colIndex = 0;

    for (const node of categoryNodes) {
      const size = calculateNodeSize(node);
      node.width = size.width;
      node.height = size.height;
      positionChildren(node);

      if (colIndex >= nodesPerRow && colIndex > 0) {
        currentX = startX;
        currentY += rowMaxHeight + opts.nodeGap;
        rowMaxHeight = 0;
        colIndex = 0;
      }

      node.x = currentX;
      node.y = currentY;
      layoutResults.push(node);
      absolutizeChildren(node, node.x, node.y);

      currentX += node.width + opts.nodeGap;
      rowMaxHeight = Math.max(rowMaxHeight, node.height);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
      colIndex++;
    }

    return { maxY, maxX };
  };

  let currentY = opts.startY;

  if (vpcs.length > 0) {
    const result = layoutCategory(vpcs, opts.startX, currentY, 2);
    currentY = result.maxY + opts.nodeGap * 2;
  }
  if (subnets.length > 0) {
    const result = layoutCategory(subnets, opts.startX, currentY, 2);
    currentY = result.maxY + opts.nodeGap * 2;
  }
  if (groups.length > 0) {
    const result = layoutCategory(groups, opts.startX, currentY, opts.nodesPerRow);
    currentY = result.maxY + opts.nodeGap * 2;
  }
  if (blocks.length > 0) {
    const result = layoutCategory(blocks, opts.startX, currentY, opts.nodesPerRow);
    currentY = result.maxY + opts.nodeGap * 2;
  }
  if (resources.length > 0) {
    layoutCategory(resources, opts.startX, currentY, opts.nodesPerRow);
  }

  return layoutResults;
}

// =============================================================================
// Collision Resolution
// =============================================================================

/**
 * Resolve overlapping nodes by pushing them apart.
 * Iterates until no overlaps remain (max 50 iterations to avoid infinite loops).
 */
function resolveOverlaps(nodes: LayoutNode[], gap: number): void {
  const MAX_ITERATIONS = 50;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let hadOverlap = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (rectsOverlap(a, b, gap)) {
          hadOverlap = true;
          // Push apart in the direction of least displacement
          const overlapX = Math.min(a.x + a.width + gap - b.x, b.x + b.width + gap - a.x);
          const overlapY = Math.min(a.y + a.height + gap - b.y, b.y + b.height + gap - a.y);
          if (overlapX < overlapY) {
            // Push horizontally
            const pushX = overlapX / 2 + 1;
            if (a.x < b.x) {
              a.x -= pushX;
              b.x += pushX;
            } else {
              a.x += pushX;
              b.x -= pushX;
            }
          } else {
            // Push vertically
            const pushY = overlapY / 2 + 1;
            if (a.y < b.y) {
              a.y -= pushY;
              b.y += pushY;
            } else {
              a.y += pushY;
              b.y -= pushY;
            }
          }
        }
      }
    }
    if (!hadOverlap) break;
  }
}

/**
 * Calculate z-index for proper rendering order.
 * Lower values render behind higher values.
 */
export function calculateZIndex(iceType: string, depth: number = 0): number {
  // VPCs at the very bottom
  if (iceType === 'Network.VPC') {
    return 0 + depth;
  }

  // Subnets above VPCs
  if (iceType === 'Network.Subnet') {
    return 10 + depth;
  }

  // Groups (organizational containers) — render behind blocks
  if (iceType.startsWith('Group.')) {
    return 15 + depth;
  }

  // Blocks and other containers
  if (iceType.startsWith('Block.') || isContainerType(iceType)) {
    return 20 + depth;
  }

  // Regular resources on top
  return 100 + depth;
}

/**
 * Sort nodes for proper rendering order (containers first, then resources).
 */
export function sortNodesForRendering(nodes: LayoutNode[]): LayoutNode[] {
  return [...nodes].sort((a, b) => {
    const zIndexA = calculateZIndex(a.iceType || '', getParentDepth(a, nodes));
    const zIndexB = calculateZIndex(b.iceType || '', getParentDepth(b, nodes));
    return zIndexA - zIndexB;
  });
}

/**
 * Get the depth of a node in the parent hierarchy.
 */
function getParentDepth(node: LayoutNode, allNodes: LayoutNode[]): number {
  let depth = 0;
  let current = node;

  while (current.parentId) {
    depth++;
    const parent = allNodes.find((n) => n.id === current.parentId);
    if (!parent) break;
    current = parent;
  }

  return depth;
}

/**
 * Check if two rectangles overlap.
 */
export function rectsOverlap(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number },
  padding: number = 0,
): boolean {
  return !(
    r1.x + r1.width + padding < r2.x ||
    r2.x + r2.width + padding < r1.x ||
    r1.y + r1.height + padding < r2.y ||
    r2.y + r2.height + padding < r1.y
  );
}

/**
 * Find a non-overlapping position for a node.
 */
export function findNonOverlappingPosition(
  node: { width: number; height: number },
  existingNodes: Array<{ x: number; y: number; width: number; height: number }>,
  startX: number = 50,
  startY: number = 50,
  gap: number = NODE_GAP,
): { x: number; y: number } {
  // Try positions in a grid until we find a non-overlapping one
  for (let row = 0; row < 100; row++) {
    for (let col = 0; col < 10; col++) {
      const testX = startX + col * (MIN_BLOCK_WIDTH + gap);
      const testY = startY + row * (MIN_BLOCK_HEIGHT + gap);

      const testRect = { x: testX, y: testY, width: node.width, height: node.height };
      const overlaps = existingNodes.some((existing) => rectsOverlap(testRect, existing, gap));

      if (!overlaps) {
        return { x: testX, y: testY };
      }
    }
  }

  // Fallback: place below all existing nodes
  const maxY = existingNodes.reduce((max, n) => Math.max(max, n.y + n.height), 0);
  return { x: startX, y: maxY + gap };
}

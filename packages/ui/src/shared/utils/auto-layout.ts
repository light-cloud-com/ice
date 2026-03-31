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

import {
  HEADER_HEIGHT,
  CONTAINER_PADDING,
  MIN_CONTAINER_WIDTH,
  MIN_CONTAINER_HEIGHT,
} from '../../config/canvas-constants';
import { isContainer as isContainerType } from '../../config/containment-rules';
import {
  computeCompactNodeHeight,
  computeCompactNodeWidth,
} from '../../features/canvas/components/nodes/svg-compact-node';

// =============================================================================
// Constants - Layout-Specific
// =============================================================================

const MIN_NODE_HEIGHT_COLLAPSED = 36;
const NODE_GAP = 36;
const CHILD_GAP = 16;
const VPC_EXTRA_PADDING = 8;

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

interface LayoutOptions {
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
  /** Flow direction: 'vertical' (top-to-bottom) or 'horizontal' (left-to-right) */
  direction?: 'vertical' | 'horizontal';
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  startX: 50,
  startY: 50,
  nodeGap: NODE_GAP,
  nodesPerRow: 3,
  containerPadding: CONTAINER_PADDING,
  layout: 'flow',
  direction: 'vertical',
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

  // Standard sizes for auto-layout: main-flow nodes get a uniform size,
  // helper/utility nodes get a compact size so they don't dominate the diagram.
  const MAIN_NODE_WIDTH = 220;
  const MAIN_NODE_HEIGHT = 72;
  const HELPER_NODE_WIDTH = 170;
  const HELPER_NODE_HEIGHT = 56;

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
      const helper = isHelperNode(iceType);
      const contentH = computeCompactNodeHeight(node.data || {}, isBlock || isGroup);
      const contentW = computeCompactNodeWidth(isBlock || isGroup);
      const targetW = helper ? HELPER_NODE_WIDTH : MAIN_NODE_WIDTH;
      const targetH = helper ? HELPER_NODE_HEIGHT : MAIN_NODE_HEIGHT;
      return {
        width: Math.max(targetW, contentW),
        height: isFolded ? MIN_NODE_HEIGHT_COLLAPSED : Math.max(targetH, contentH),
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
    // VPCs: subnets side-by-side (2 per row — subnets are wide)
    // Subnets: children stacked vertically (1 per row) to follow data flow
    // Groups: 2 per row
    const childrenPerRow = isVPC ? 2 : isSubnet ? 1 : 2;
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
    const minContainerWidth = isVPC ? 280 : isSubnet ? 260 : MIN_CONTAINER_WIDTH;
    const minContainerHeight = isVPC ? 180 : isSubnet ? 150 : MIN_CONTAINER_HEIGHT;

    return {
      width: Math.max(minContainerWidth, calculatedWidth),
      height: Math.max(minContainerHeight, totalHeight),
    };
  };

  const positionChildren = (parent: LayoutNode): void => {
    const childIds = childrenMap.get(parent.id) || [];
    if (childIds.length === 0) return;

    // Don't reposition children of folded containers — they're hidden
    const parentFolded = parent.folded || (parent.data?.folded as boolean) || false;
    if (parentFolded) return;

    const children = childIds.map((id) => nodeMap.get(id)).filter((n): n is LayoutNode => !!n);
    const iceType = parent.iceType || '';
    const isVPC = iceType === 'Network.VPC';
    const isSubnet = iceType === 'Network.Subnet';
    const isLargeContainer = isVPC || isSubnet;

    const containerPadding = isLargeContainer ? opts.containerPadding + VPC_EXTRA_PADDING : opts.containerPadding;
    const childGap = CHILD_GAP;
    const childrenPerRow = isVPC ? 3 : isSubnet ? 1 : 2;

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
// Semantic Node Classification
// =============================================================================

/**
 * Map iceType to a semantic infrastructure tier.
 * Lower tier = closer to the user, appears higher in the diagram.
 *
 *   Tier 0 — Frontend / CDN / entry points
 *   Tier 1 — Routing (Gateway, Load Balancer)
 *   Tier 2 — Compute / Application (Backend, Worker, Functions)
 *   Tier 3 — Messaging (Queues, Streams, Pub/Sub)
 *   Tier 4 — Data / Storage (Databases, Cache, Object Storage)
 *
 * Actual iceType values (from blocks registry):
 *   Application.StaticSite, Application.SSRSite, Network.Internet,
 *   Network.Gateway, Application.Container, Application.Worker,
 *   Application.ServerlessFunction, Application.CronJob,
 *   Messaging.RabbitMQ, Messaging.CloudPubSub, Messaging.Topic,
 *   Database.PostgreSQL, Database.MySQL, Database.MongoDB, Database.Redis,
 *   Database.Firestore, Storage.Bucket, Analytics.DataWarehouse,
 *   Analytics.Search, AI.VectorDB, AI.LLMGateway, AI.ModelServing,
 *   Security.Identity, Security.Secret, Monitoring.Log, Log.Terminal,
 *   Source.Repository, Config.EnvVars
 */
function getSemanticTier(iceType: string): number {
  const t = iceType.toLowerCase();
  // Tier 0 — Frontend / entry points
  if (/staticsite|ssrsite|network\.internet|frontend|cdn/.test(t)) return 0;
  // Tier 1 — Routing / gateway (but not AI.LLMGateway — that's compute)
  if (/network\.gateway/.test(t)) return 1;
  // Tier 2 — Compute / application (includes AI services)
  if (/container|backend|worker|function|serverless|cron|modelserving|llmgateway|ai\./.test(t)) return 2;
  // Tier 3 — Messaging / events
  if (/messaging|rabbitmq|pubsub|topic|queue|stream|kafka|event/.test(t)) return 3;
  // Tier 4 — Data / storage / analytics
  if (/database|postgres|mysql|mongo|firestore|redis|storage|bucket|warehouse|search|vector/.test(t)) return 4;
  // Groups and VPCs default to compute tier
  if (/group\.|block\.|network\.vpc|network\.subnet/.test(t)) return 2;
  return 2; // default to compute layer
}

/**
 * Helper/utility nodes placed on the SIDE of the diagram, not in the main
 * vertical/horizontal data flow. They support the main flow but aren't part
 * of the user-facing request path.
 *
 * Matched iceTypes: Security.Identity, Security.Secret, Monitoring.Log,
 * Log.Terminal, Observability.Logs, Source.Repository, Config.EnvVars
 */
function isHelperNode(iceType: string): boolean {
  const t = iceType.toLowerCase();
  return /security\.|monitoring\.|log\.|observ|source\.repository|config\.env|envvars/.test(t);
}

// =============================================================================
// Flow Layout — Semantic tier ordering, top-to-bottom with side helpers
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

  // Resolve any node ID to its top-level ancestor
  const topIds = new Set(topLevelNodes.map((n) => n.id));
  const toTopLevel = (id: string): string | null => {
    if (topIds.has(id)) return id;
    const p = parentMap.get(id);
    if (!p) return null;
    return toTopLevel(p);
  };

  // ── Step 1: Separate main-flow nodes from helpers ────────────────────────

  const mainNodes: LayoutNode[] = [];
  const helperNodes: LayoutNode[] = [];

  for (const node of topLevelNodes) {
    const n = nodeMap.get(node.id)!;
    if (isHelperNode(n.iceType || '')) {
      helperNodes.push(n);
    } else {
      mainNodes.push(n);
    }
  }

  // ── Step 2: Build layers using topological depth + semantic tier floor ────
  //
  // The topological depth (longest-path from a source) gives each node in a
  // chain its own row: Static Site(0) → Public Traffic(1) → Gateway(2) → ...
  //
  // The semantic tier acts as a FLOOR — a database (tier 4) can never appear
  // above a gateway (tier 1), even if the topo sort would place it earlier.
  // Final layer = max(topoDepth, semanticTier).

  // Build adjacency for topological sort (main + helper IDs, among top-level only)
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const id of topIds) {
    adj.set(id, []);
    inDeg.set(id, 0);
  }
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

  // BFS longest-path to assign topological depth
  const topoDepth = new Map<string, number>();
  const queue: string[] = [];
  for (const id of topIds) {
    if ((inDeg.get(id) || 0) === 0) {
      queue.push(id);
      topoDepth.set(id, 0);
    }
  }
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const d = topoDepth.get(cur)!;
    for (const next of adj.get(cur) || []) {
      if (!topoDepth.has(next) || d + 1 > topoDepth.get(next)!) {
        topoDepth.set(next, d + 1);
      }
      inDeg.set(next, (inDeg.get(next) || 0) - 1);
      if (inDeg.get(next) === 0) queue.push(next);
    }
  }
  for (const id of topIds) {
    if (!topoDepth.has(id)) topoDepth.set(id, 0);
  }

  // Compute final layer for each main node: max(topoDepth, semanticTier)
  const mainIds = new Set(mainNodes.map((n) => n.id));
  const layerOf = new Map<string, number>();
  for (const node of mainNodes) {
    const topo = topoDepth.get(node.id) || 0;
    const tier = getSemanticTier(node.iceType || '');
    layerOf.set(node.id, Math.max(topo, tier));
  }

  // Group into layer buckets
  const maxLayer = mainNodes.length > 0 ? Math.max(...Array.from(layerOf.values())) : 0;
  const layers: LayoutNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const node of mainNodes) {
    layers[layerOf.get(node.id)!].push(node);
  }

  // Sort within each layer to minimize edge crossings (barycenter heuristic).
  // For each node, compute the average position of its connected nodes in the
  // previous layer. Then sort by that average — nodes whose parents are on the
  // left appear on the left, nodes whose parents are on the right appear on the
  // right. This keeps connections roughly parallel instead of crossing.
  //
  // Build reverse adjacency: for each node, which nodes in the previous layer connect to it?
  const revAdj = new Map<string, string[]>(); // target → sources
  for (const [src, targets] of adj) {
    for (const tgt of targets) {
      const list = revAdj.get(tgt) || [];
      list.push(src);
      revAdj.set(tgt, list);
    }
  }

  // First pass: sort layer 0 by groups-first then label (no previous layer to reference)
  if (layers.length > 0) {
    layers[0].sort((a, b) => {
      const aGroup = a.type === 'container' || a.iceType?.startsWith('Group.') ? 0 : 1;
      const bGroup = b.type === 'container' || b.iceType?.startsWith('Group.') ? 0 : 1;
      if (aGroup !== bGroup) return aGroup - bGroup;
      return a.label.localeCompare(b.label);
    });
  }

  // Assign initial indices to layer 0 for barycenter calculation
  const positionIndex = new Map<string, number>();
  for (let i = 0; i < (layers[0]?.length || 0); i++) {
    positionIndex.set(layers[0][i].id, i);
  }

  // For subsequent layers, sort by barycenter of connected nodes in previous layers
  for (let li = 1; li < layers.length; li++) {
    const layer = layers[li];
    if (layer.length <= 1) {
      if (layer.length === 1) positionIndex.set(layer[0].id, 0);
      continue;
    }

    // Compute barycenter for each node in this layer
    const bary = new Map<string, number>();
    for (const node of layer) {
      // Gather positions of all connected nodes in any previous layer
      const neighbors: number[] = [];
      // Check incoming edges (from previous layers)
      for (const src of revAdj.get(node.id) || []) {
        if (positionIndex.has(src)) neighbors.push(positionIndex.get(src)!);
      }
      // Check outgoing edges to previous layers (for bidirectional connections)
      for (const tgt of adj.get(node.id) || []) {
        if (positionIndex.has(tgt)) neighbors.push(positionIndex.get(tgt)!);
      }

      if (neighbors.length > 0) {
        bary.set(node.id, neighbors.reduce((a, b) => a + b, 0) / neighbors.length);
      } else {
        // No connections to previous layers — keep in middle
        bary.set(node.id, layer.length / 2);
      }
    }

    layer.sort((a, b) => {
      const aGroup = a.type === 'container' || a.iceType?.startsWith('Group.') ? 0 : 1;
      const bGroup = b.type === 'container' || b.iceType?.startsWith('Group.') ? 0 : 1;
      if (aGroup !== bGroup) return aGroup - bGroup;
      return (bary.get(a.id) || 0) - (bary.get(b.id) || 0);
    });

    // Update position indices for this layer
    for (let i = 0; i < layer.length; i++) {
      positionIndex.set(layer[i].id, i);
    }
  }

  // ── Step 3: Calculate sizes ──────────────────────────────────────────────

  for (const layer of layers) {
    for (const node of layer) {
      const size = calculateNodeSize(node);
      node.width = size.width;
      node.height = size.height;
      positionChildren(node);
    }
  }
  for (const node of helperNodes) {
    const size = calculateNodeSize(node);
    node.width = size.width;
    node.height = size.height;
    positionChildren(node);
  }

  // ── Step 4: Position nodes — vertical (top-to-bottom) or horizontal (left-to-right) ──

  const absolutizeChildren = (parent: LayoutNode, parentX: number, parentY: number): void => {
    const parentFolded = parent.folded || (parent.data?.folded as boolean) || false;
    if (parentFolded) return;
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

  const isHorizontal = opts.direction === 'horizontal';

  // Track position of each main node (for helper placement)
  const nodePosMap = new Map<string, { x: number; y: number }>();

  if (isHorizontal) {
    // ── HORIZONTAL: layers are columns left-to-right, nodes stacked top-to-bottom per column
    // Helpers placed above/below their connected column node.

    // Find tallest column for vertical centering
    let maxColHeight = 0;
    for (const layer of layers) {
      if (layer.length === 0) continue;
      let h = 0;
      for (const node of layer) h += node.height;
      h += (layer.length - 1) * opts.nodeGap;
      maxColHeight = Math.max(maxColHeight, h);
    }

    let colX = opts.startX;
    for (const layer of layers) {
      if (layer.length === 0) continue;

      let colHeight = 0;
      for (const node of layer) colHeight += node.height;
      colHeight += (layer.length - 1) * opts.nodeGap;

      // Center column vertically
      let nodeY = opts.startY + (maxColHeight - colHeight) / 2;
      let maxWidthInCol = 0;

      for (const node of layer) {
        node.x = colX;
        node.y = nodeY;
        nodePosMap.set(node.id, { x: colX, y: nodeY });
        layoutResults.push(node);
        absolutizeChildren(node, node.x, node.y);
        maxWidthInCol = Math.max(maxWidthInCol, node.width);
        nodeY += node.height + opts.nodeGap;
      }

      colX += maxWidthInCol + opts.nodeGap;
    }
  } else {
    // ── VERTICAL: layers are rows top-to-bottom, nodes arranged left-to-right per row
    // Helpers placed left/right of their connected row node.

    // Find widest row for horizontal centering
    let maxRowWidth = 0;
    for (const layer of layers) {
      if (layer.length === 0) continue;
      let w = 0;
      for (const node of layer) w += node.width;
      w += (layer.length - 1) * opts.nodeGap;
      maxRowWidth = Math.max(maxRowWidth, w);
    }

    let rowY = opts.startY;
    for (const layer of layers) {
      if (layer.length === 0) continue;

      let rowWidth = 0;
      for (const node of layer) rowWidth += node.width;
      rowWidth += (layer.length - 1) * opts.nodeGap;

      // Center row horizontally
      let nodeX = opts.startX + (maxRowWidth - rowWidth) / 2;
      let maxHeightInRow = 0;

      for (const node of layer) {
        node.x = nodeX;
        node.y = rowY;
        nodePosMap.set(node.id, { x: nodeX, y: rowY });
        layoutResults.push(node);
        absolutizeChildren(node, node.x, node.y);
        nodeX += node.width + opts.nodeGap;
        maxHeightInRow = Math.max(maxHeightInRow, node.height);
      }

      rowY += maxHeightInRow + opts.nodeGap;
    }
  }

  // ── Step 5: Position helper nodes beside their connected main node ───────
  //
  // Vertical: helpers placed LEFT/RIGHT of the spine.
  // Horizontal: helpers placed ABOVE/BELOW the spine.

  // Find bounding box of all main nodes
  let mainRight = opts.startX;
  let mainLeft = Infinity;
  let mainBottom = opts.startY;
  let mainTop = Infinity;
  for (const node of mainNodes) {
    mainRight = Math.max(mainRight, node.x + node.width);
    mainLeft = Math.min(mainLeft, node.x);
    mainBottom = Math.max(mainBottom, node.y + node.height);
    mainTop = Math.min(mainTop, node.y);
  }

  const helpersPerNode = new Map<string, number>();

  for (const helper of helperNodes) {
    let connectedMainNode: LayoutNode | null = null;

    for (const edge of edges) {
      if (edge.relationship === 'contains') continue;
      const s = toTopLevel(edge.source);
      const t = toTopLevel(edge.target);
      if (s === helper.id && mainIds.has(t!)) {
        connectedMainNode = nodeMap.get(t!)!;
        break;
      }
      if (t === helper.id && mainIds.has(s!)) {
        connectedMainNode = nodeMap.get(s!)!;
        break;
      }
    }

    if (connectedMainNode) {
      const count = helpersPerNode.get(connectedMainNode.id) || 0;
      helpersPerNode.set(connectedMainNode.id, count + 1);

      if (isHorizontal) {
        // Place helpers above/below the spine, aligned with connected node's X
        helper.x = connectedMainNode.x;
        if (count % 2 === 0) {
          helper.y = mainBottom + opts.nodeGap;
        } else {
          helper.y = mainTop - opts.nodeGap - helper.height;
        }
      } else {
        // Place helpers left/right of the spine, aligned with connected node's Y
        helper.y = connectedMainNode.y;
        if (count % 2 === 0) {
          helper.x = mainRight + opts.nodeGap;
        } else {
          helper.x = mainLeft - opts.nodeGap - helper.width;
        }
      }
    } else {
      // Disconnected helper — place after the spine
      if (isHorizontal) {
        helper.x = mainRight + opts.nodeGap;
        helper.y = opts.startY;
        mainRight += helper.width + opts.nodeGap;
      } else {
        helper.x = opts.startX;
        helper.y = mainBottom + opts.nodeGap;
        mainBottom += helper.height + opts.nodeGap;
      }
    }

    layoutResults.push(helper);
    absolutizeChildren(helper, helper.x, helper.y);
  }

  // Collision detection pass — push apart any overlapping top-level nodes
  const allTopLevel = [...mainNodes, ...helperNodes].map((n) => nodeMap.get(n.id)!).filter(Boolean);
  resolveOverlaps(allTopLevel, opts.nodeGap / 2);

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
    // Skip children of folded containers — they stay at their current positions
    const parentFolded = parent.folded || (parent.data?.folded as boolean) || false;
    if (parentFolded) return;

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
 * Check if two rectangles overlap.
 */
function rectsOverlap(
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

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
  SCALE_MIN,
  CARD_WIDTH,
  CARD_HEIGHT,
} from '../../config/canvas-constants';
import { isContainer as isContainerType } from '../../config/containment-rules';
import { computeCompactNodeHeight, computeCompactNodeWidth } from '../../features/canvas/components/nodes/compact-node';

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
  /** Layout mode: 'flow' (data flow), 'grid' (category-based), or 'circular' (concentric rings) */
  layout?: 'flow' | 'grid' | 'circular';
  /** Flow direction: 'vertical' (top-to-bottom) or 'horizontal' (left-to-right) */
  direction?: 'vertical' | 'horizontal';
  /** Current viewport zoom — when provided, layout adapts spacing for LOD */
  zoom?: number;
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  startX: 50,
  startY: 50,
  nodeGap: NODE_GAP,
  nodesPerRow: 3,
  containerPadding: CONTAINER_PADDING,
  layout: 'flow',
  direction: 'vertical',
  zoom: 1,
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

  // ── Fixed block sizing (all LOD levels use the same canvas dimensions) ──
  // Blocks are always CARD_WIDTH × CARD_HEIGHT (240 × 160, 3:2 ratio)
  // regardless of zoom level. Only content detail adapts via LOD.

  const zoom = opts.zoom || 1;
  const lod = zoom > 0.7 ? 3 : zoom > 0.35 ? 2 : 1;

  // Node dimensions — fixed size at all zoom levels
  const MAIN_NODE_WIDTH = CARD_WIDTH;
  const MAIN_NODE_HEIGHT = CARD_HEIGHT;
  const HELPER_NODE_WIDTH = CARD_WIDTH;
  const HELPER_NODE_HEIGHT = CARD_HEIGHT;

  // Lerp helper for gaps/padding that smoothly scale with zoom
  const t = Math.max(0, Math.min(1, (zoom - SCALE_MIN) / (1.0 - SCALE_MIN)));
  const lerp = (min: number, max: number): number => min + t * (max - min);

  opts.nodeGap = Math.round(lerp(20, opts.nodeGap));

  /**
   * Assign children of a container to flow-layout layers.
   * Uses semantic tier as floor + topological depth from edges.
   * Sorts within layers by barycenter heuristic to minimize edge crossings.
   */
  const assignChildLayers = (childIds: string[], children: LayoutNode[]) => {
    const childIdSet = new Set(childIds);

    // Build internal adjacency
    const childAdj = new Map<string, string[]>();
    const childRevAdj = new Map<string, string[]>();
    const freshInDeg = new Map<string, number>();
    for (const id of childIds) {
      childAdj.set(id, []);
      childRevAdj.set(id, []);
      freshInDeg.set(id, 0);
    }
    for (const edge of edges) {
      if (edge.relationship === 'contains') continue;
      const s = childIdSet.has(edge.source) ? edge.source : null;
      const t = childIdSet.has(edge.target) ? edge.target : null;
      if (s && t && s !== t) {
        childAdj.get(s)!.push(t);
        childRevAdj.get(t)!.push(s);
        freshInDeg.set(t, (freshInDeg.get(t) || 0) + 1);
      }
    }

    // Separate helpers from main children
    const mainChildren: LayoutNode[] = [];
    const helperChildren: LayoutNode[] = [];
    for (const child of children) {
      if (isHelperNode(child.iceType || '')) helperChildren.push(child);
      else mainChildren.push(child);
    }

    // BFS longest-path for topological depth
    const topoDepth = new Map<string, number>();
    const queue: string[] = [];
    const bfsInDeg = new Map<string, number>();
    for (const id of childIds) bfsInDeg.set(id, freshInDeg.get(id) || 0);
    for (const id of childIds) {
      if ((bfsInDeg.get(id) || 0) === 0) {
        queue.push(id);
        topoDepth.set(id, 0);
      }
    }
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      const d = topoDepth.get(cur)!;
      for (const next of childAdj.get(cur) || []) {
        if (!topoDepth.has(next) || d + 1 > topoDepth.get(next)!) {
          topoDepth.set(next, d + 1);
        }
        bfsInDeg.set(next, (bfsInDeg.get(next) || 0) - 1);
        if (bfsInDeg.get(next) === 0) queue.push(next);
      }
    }
    for (const id of childIds) {
      if (!topoDepth.has(id)) topoDepth.set(id, 0);
    }

    // Layer = max(topoDepth, semanticTier)
    const layerOf = new Map<string, number>();
    for (const child of mainChildren) {
      const topo = topoDepth.get(child.id) || 0;
      const tier = getSemanticTier(child.iceType || '');
      layerOf.set(child.id, Math.max(topo, tier));
    }

    const maxLayer = mainChildren.length > 0 ? Math.max(...Array.from(layerOf.values())) : 0;
    const layers: LayoutNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
    for (const child of mainChildren) {
      layers[layerOf.get(child.id)!].push(child);
    }

    // Barycenter sort within layers to minimize edge crossings
    const posIdx = new Map<string, number>();
    if (layers.length > 0 && layers[0].length > 0) {
      layers[0].sort((a, b) => {
        const aG = a.type === 'container' || a.iceType?.startsWith('Group.') ? 0 : 1;
        const bG = b.type === 'container' || b.iceType?.startsWith('Group.') ? 0 : 1;
        if (aG !== bG) return aG - bG;
        return a.label.localeCompare(b.label);
      });
      for (let i = 0; i < layers[0].length; i++) posIdx.set(layers[0][i].id, i);
    }

    for (let li = 1; li < layers.length; li++) {
      const layer = layers[li];
      if (layer.length <= 1) {
        if (layer.length === 1) posIdx.set(layer[0].id, 0);
        continue;
      }
      const bary = new Map<string, number>();
      for (const node of layer) {
        const neighbors: number[] = [];
        for (const src of childRevAdj.get(node.id) || []) {
          if (posIdx.has(src)) neighbors.push(posIdx.get(src)!);
        }
        for (const tgt of childAdj.get(node.id) || []) {
          if (posIdx.has(tgt)) neighbors.push(posIdx.get(tgt)!);
        }
        bary.set(
          node.id,
          neighbors.length > 0 ? neighbors.reduce((a, b) => a + b, 0) / neighbors.length : layer.length / 2,
        );
      }
      layer.sort((a, b) => (bary.get(a.id) || 0) - (bary.get(b.id) || 0));
      for (let i = 0; i < layer.length; i++) posIdx.set(layer[i].id, i);
    }

    return { layers, helperChildren };
  };

  const calculateNodeSize = (node: LayoutNode): { width: number; height: number } => {
    const childIds = childrenMap.get(node.id) || [];
    const isFolded = node.folded || (node.data?.folded as boolean) || false;
    const iceType = node.iceType || '';
    const isVPC = iceType === 'Network.VPC';
    const isSubnet = iceType === 'Network.Subnet';
    const isLargeContainer = isVPC || isSubnet;
    const isGroup = iceType.startsWith('Group.') || node.type === 'container' || node.type === ('group' as any);
    const isBlock = node.type === 'block';

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

    const basePad = CHILD_GAP;
    const containerPadding = isLargeContainer ? opts.containerPadding + VPC_EXTRA_PADDING : basePad;
    const childGap = basePad;
    const direction = opts.direction || 'vertical';

    // Flow layout sizing: assign children to semantic tier layers
    const { layers, helperChildren: helpers } = assignChildLayers(childIds, children);

    // Circular sizing: all main children on ONE ring, helpers on outer ring
    // Compute width/height separately (nodes are typically wider than tall)
    if (opts.layout === 'circular') {
      const circPad = Math.max(containerPadding, opts.containerPadding);
      const HELPER_RING_GAP = 40;
      const MIN_RADIUS_CHILD = 80;
      const allMain = layers.flat();
      let mainMaxDim = 0,
        mainMaxW = 0,
        mainMaxH = 0;
      for (const c of allMain) {
        mainMaxDim = Math.max(mainMaxDim, c.width, c.height);
        mainMaxW = Math.max(mainMaxW, c.width);
        mainMaxH = Math.max(mainMaxH, c.height);
      }

      let mainR: number;
      if (allMain.length <= 1) mainR = 0;
      else {
        const circ = allMain.length * (mainMaxDim + opts.nodeGap);
        mainR = Math.max(MIN_RADIUS_CHILD, circ / (2 * Math.PI));
      }

      let contentW = allMain.length <= 1 ? mainMaxW : 2 * mainR + mainMaxW;
      let contentH = allMain.length <= 1 ? mainMaxH : 2 * mainR + mainMaxH;

      let hMaxDim = 0,
        hMaxW = 0,
        hMaxH = 0;
      for (const h of helpers) {
        hMaxDim = Math.max(hMaxDim, h.width, h.height);
        hMaxW = Math.max(hMaxW, h.width);
        hMaxH = Math.max(hMaxH, h.height);
      }
      if (helpers.length > 0) {
        const hR = mainR + mainMaxDim / 2 + HELPER_RING_GAP + hMaxDim / 2;
        contentW = Math.max(contentW, 2 * hR + hMaxW);
        contentH = Math.max(contentH, 2 * hR + hMaxH);
      }

      const minW = isVPC ? 280 : isSubnet ? 260 : MIN_CONTAINER_WIDTH;
      const minH = isVPC ? 180 : isSubnet ? 150 : MIN_CONTAINER_HEIGHT;
      return {
        width: Math.max(minW, contentW + circPad * 2),
        height: Math.max(minH, contentH + circPad * 2),
      };
    }

    let mainWidth = 0;
    let mainHeight = 0;

    if (direction === 'horizontal') {
      // Layers are columns left-to-right
      for (const layer of layers) {
        if (layer.length === 0) continue;
        let colH = 0,
          maxW = 0;
        for (const c of layer) {
          colH += c.height + childGap;
          maxW = Math.max(maxW, c.width);
        }
        if (colH > 0) colH -= childGap;
        mainWidth += maxW + childGap;
        mainHeight = Math.max(mainHeight, colH);
      }
      if (mainWidth > 0) mainWidth -= childGap;
    } else {
      // Layers are rows top-to-bottom
      for (const layer of layers) {
        if (layer.length === 0) continue;
        let rowW = 0,
          maxH = 0;
        for (const c of layer) {
          rowW += c.width + childGap;
          maxH = Math.max(maxH, c.height);
        }
        if (rowW > 0) rowW -= childGap;
        mainWidth = Math.max(mainWidth, rowW);
        mainHeight += maxH + childGap;
      }
      if (mainHeight > 0) mainHeight -= childGap;
    }

    // Compute helper space: helpers run PERPENDICULAR to the main flow so they
    // don't stretch the diagram in the flow direction.
    // Horizontal flow → helpers in a VERTICAL column to the right.
    // Vertical flow   → helpers in a HORIZONTAL row below.
    let helperRowW = 0,
      helperRowH = 0;
    for (const h of helpers) {
      if (direction === 'horizontal') {
        helperRowH += h.height + childGap;
        helperRowW = Math.max(helperRowW, h.width);
      } else {
        helperRowW += h.width + childGap;
        helperRowH = Math.max(helperRowH, h.height);
      }
    }
    if (helpers.length > 0) {
      if (direction === 'horizontal') helperRowH -= childGap;
      else helperRowW -= childGap;
    }

    let totalW: number, totalH: number;
    if (direction === 'horizontal') {
      totalW = mainWidth + (helpers.length > 0 ? childGap + helperRowW : 0);
      totalH = Math.max(mainHeight, helperRowH);
    } else {
      totalW = Math.max(mainWidth, helperRowW);
      totalH = mainHeight + (helpers.length > 0 ? childGap + helperRowH : 0);
    }

    const calculatedWidth = totalW + containerPadding * 2;
    const calculatedHeight = totalH + containerPadding * 2 + HEADER_HEIGHT;
    const minContainerWidth = isVPC ? 280 : isSubnet ? 260 : MIN_CONTAINER_WIDTH;
    const minContainerHeight = isVPC ? 180 : isSubnet ? 150 : MIN_CONTAINER_HEIGHT;

    return {
      width: Math.max(minContainerWidth, calculatedWidth),
      height: Math.max(minContainerHeight, calculatedHeight),
    };
  };

  const positionChildren = (parent: LayoutNode): void => {
    const childIds = childrenMap.get(parent.id) || [];
    if (childIds.length === 0) return;

    const parentFolded = parent.folded || (parent.data?.folded as boolean) || false;
    if (parentFolded) return;

    const children = childIds.map((id) => nodeMap.get(id)).filter((n): n is LayoutNode => !!n);
    const iceType = parent.iceType || '';
    const isVPC = iceType === 'Network.VPC';
    const isSubnet = iceType === 'Network.Subnet';
    const isLargeContainer = isVPC || isSubnet;

    const basePad = CHILD_GAP;
    const containerPadding = isLargeContainer ? opts.containerPadding + VPC_EXTRA_PADDING : basePad;
    const childGap = basePad;
    const direction = opts.direction || 'vertical';

    // Flow layout: assign children to layers using semantic tiers + topological ordering
    const { layers, helperChildren: helpers } = assignChildLayers(childIds, children);

    const mainIdSet = new Set<string>();
    for (const layer of layers) for (const n of layer) mainIdSet.add(n.id);

    // ── Circular positioning: all main children on ONE ring ──
    // Position relative to origin, then shift for uniform padding on all sides.
    if (opts.layout === 'circular') {
      const circPad = Math.max(containerPadding, opts.containerPadding);
      const HELPER_RING_GAP = 40;
      const MIN_RADIUS_CHILD = 80;
      const allMain = layers.flat();
      const startAngle = -Math.PI / 2;
      const mainAngle = new Map<string, number>();

      // First pass: position children and let recursive positionChildren finalise sizes
      let mainMaxDim = 0;
      for (const c of allMain) mainMaxDim = Math.max(mainMaxDim, c.width, c.height);

      let mainR: number;
      if (allMain.length <= 1) mainR = 0;
      else {
        const circ = allMain.length * (mainMaxDim + opts.nodeGap);
        mainR = Math.max(MIN_RADIUS_CHILD, circ / (2 * Math.PI));
      }

      for (let i = 0; i < allMain.length; i++) {
        const angle = allMain.length === 1 ? 0 : startAngle + (i / allMain.length) * 2 * Math.PI;
        const node = allMain[i];
        node.x = mainR * Math.cos(angle) - node.width / 2;
        node.y = mainR * Math.sin(angle) - node.height / 2;
        mainAngle.set(node.id, angle);
        node.parentId = parent.id;
        positionChildren(node); // may resize node
      }

      for (const h of helpers) {
        h.parentId = parent.id;
        positionChildren(h); // finalise helper sizes
      }

      // Second pass: recompute radius from FINAL sizes and re-centre every node
      mainMaxDim = 0;
      for (const c of allMain) mainMaxDim = Math.max(mainMaxDim, c.width, c.height);

      if (allMain.length <= 1) mainR = 0;
      else {
        const circ = allMain.length * (mainMaxDim + opts.nodeGap);
        mainR = Math.max(MIN_RADIUS_CHILD, circ / (2 * Math.PI));
      }

      for (const node of allMain) {
        const angle = mainAngle.get(node.id)!;
        node.x = mainR * Math.cos(angle) - node.width / 2;
        node.y = mainR * Math.sin(angle) - node.height / 2;
      }

      // Position helpers on outer ring using final sizes
      let hMaxDim = 0;
      for (const h of helpers) hMaxDim = Math.max(hMaxDim, h.width, h.height);
      const helperRingR = helpers.length > 0 ? mainR + mainMaxDim / 2 + HELPER_RING_GAP + hMaxDim / 2 : 0;

      if (helpers.length > 0) {
        const usedAngles: number[] = [];
        let disconnectedIdx = 0;
        for (const helper of helpers) {
          let connectedId: string | null = null;
          for (const edge of edges) {
            if (edge.relationship === 'contains') continue;
            if (edge.source === helper.id && mainIdSet.has(edge.target)) {
              connectedId = edge.target;
              break;
            }
            if (edge.target === helper.id && mainIdSet.has(edge.source)) {
              connectedId = edge.source;
              break;
            }
          }
          let angle: number;
          if (connectedId && mainAngle.has(connectedId)) {
            angle = mainAngle.get(connectedId)!;
            while (usedAngles.some((a) => Math.abs(a - angle) < 0.3)) angle += 0.35;
          } else {
            angle = startAngle + ((disconnectedIdx + 0.5) / Math.max(helpers.length, 1)) * 2 * Math.PI;
            disconnectedIdx++;
          }
          usedAngles.push(angle);
          helper.x = helperRingR * Math.cos(angle) - helper.width / 2;
          helper.y = helperRingR * Math.sin(angle) - helper.height / 2;
        }
      }

      // Compute actual bounding box, then shift so content has uniform padding
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const c of children) {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.width);
        maxY = Math.max(maxY, c.y + c.height);
      }
      if (!isFinite(minX)) {
        minX = 0;
        minY = 0;
        maxX = 0;
        maxY = 0;
      }

      const shiftX = circPad - minX;
      const shiftY = circPad - minY;
      for (const c of children) {
        c.x += shiftX;
        c.y += shiftY;
      }

      const contentW = maxX - minX;
      const contentH = maxY - minY;
      const minW = isVPC ? 280 : isSubnet ? 260 : MIN_CONTAINER_WIDTH;
      const minH = isVPC ? 180 : isSubnet ? 150 : MIN_CONTAINER_HEIGHT;
      parent.width = Math.max(minW, contentW + circPad * 2);
      parent.height = Math.max(minH, contentH + circPad * 2);
      return;
    }

    // ── Position main layers — symmetric padding on all sides ──────────
    // Children start below the header (HEADER_HEIGHT) with equal padding.
    const topOffset = containerPadding + HEADER_HEIGHT;

    if (direction === 'horizontal') {
      let colX = containerPadding;
      for (const layer of layers) {
        if (layer.length === 0) continue;
        let nodeY = topOffset;
        let maxW = 0;
        for (const node of layer) {
          node.x = colX;
          node.y = nodeY;
          node.parentId = parent.id;
          nodeY += node.height + childGap;
          maxW = Math.max(maxW, node.width);
          positionChildren(node);
        }
        colX += maxW + childGap;
      }
    } else {
      let rowY = topOffset;
      for (const layer of layers) {
        if (layer.length === 0) continue;
        let nodeX = containerPadding;
        let maxH = 0;
        for (const node of layer) {
          node.x = nodeX;
          node.y = rowY;
          node.parentId = parent.id;
          nodeX += node.width + childGap;
          maxH = Math.max(maxH, node.height);
          positionChildren(node);
        }
        rowY += maxH + childGap;
      }
    }

    // ── Pass 2: Position helpers relative to the centered main content ──
    let mainRight = containerPadding;
    let mainBottom = topOffset;
    for (const layer of layers) {
      for (const n of layer) {
        mainRight = Math.max(mainRight, n.x + n.width);
        mainBottom = Math.max(mainBottom, n.y + n.height);
      }
    }

    // Barycenter: average position of ALL connected main nodes
    const helperPref = new Map<string, number>();
    for (const helper of helpers) {
      let sum = 0,
        cnt = 0;
      for (const edge of edges) {
        if (edge.relationship === 'contains') continue;
        let connId: string | null = null;
        if (edge.source === helper.id && mainIdSet.has(edge.target)) connId = edge.target;
        if (edge.target === helper.id && mainIdSet.has(edge.source)) connId = edge.source;
        if (connId) {
          const conn = nodeMap.get(connId);
          if (conn) {
            // Horizontal flow → vertical column → barycenter on Y
            // Vertical flow   → horizontal row  → barycenter on X
            sum += direction === 'horizontal' ? conn.y + conn.height / 2 : conn.x + conn.width / 2;
            cnt++;
          }
        }
      }
      if (cnt > 0) {
        const center = sum / cnt;
        helperPref.set(helper.id, center - (direction === 'horizontal' ? helper.height / 2 : helper.width / 2));
      }
    }

    // Sort helpers by preferred position (connected first, then disconnected)
    const sortedH = [...helpers].sort((a, b) => {
      const ap = helperPref.get(a.id);
      const bp = helperPref.get(b.id);
      if (ap != null && bp != null) return ap - bp;
      if (ap != null) return -1;
      if (bp != null) return 1;
      return 0;
    });

    if (direction === 'horizontal') {
      // Horizontal flow → helpers in a VERTICAL column to the right
      let nextY = topOffset;
      const helperX = mainRight + childGap;
      for (const helper of sortedH) {
        const pref = helperPref.get(helper.id);
        helper.y = Math.max(nextY, pref ?? nextY);
        helper.x = helperX;
        nextY = helper.y + helper.height + childGap;
        helper.parentId = parent.id;
        positionChildren(helper);
      }
    } else {
      // Vertical flow → helpers in a HORIZONTAL row below
      let nextX = containerPadding;
      const helperY = mainBottom + childGap;
      for (const helper of sortedH) {
        const pref = helperPref.get(helper.id);
        helper.x = Math.max(nextX, pref ?? nextX);
        helper.y = helperY;
        nextX = helper.x + helper.width + childGap;
        helper.parentId = parent.id;
        positionChildren(helper);
      }
    }

    // Center narrower rows/columns relative to the widest/tallest one
    if (direction === 'horizontal') {
      let maxColH = 0;
      for (const layer of layers) {
        if (layer.length === 0) continue;
        let colH = 0;
        for (const n of layer) colH += n.height + childGap;
        if (colH > 0) colH -= childGap;
        maxColH = Math.max(maxColH, colH);
      }
      for (const layer of layers) {
        if (layer.length === 0) continue;
        let colH = 0;
        for (const n of layer) colH += n.height + childGap;
        if (colH > 0) colH -= childGap;
        const dy = (maxColH - colH) / 2;
        if (dy > 1) for (const n of layer) n.y += dy;
      }
    } else {
      let maxRowW = 0;
      for (const layer of layers) {
        if (layer.length === 0) continue;
        let rowW = 0;
        for (const n of layer) rowW += n.width + childGap;
        if (rowW > 0) rowW -= childGap;
        maxRowW = Math.max(maxRowW, rowW);
      }
      for (const layer of layers) {
        if (layer.length === 0) continue;
        let rowW = 0;
        for (const n of layer) rowW += n.width + childGap;
        if (rowW > 0) rowW -= childGap;
        const dx = (maxRowW - rowW) / 2;
        if (dx > 1) for (const n of layer) n.x += dx;
      }
    }

    // Resize parent to tightly fit ALL content with symmetric padding.
    // Left padding = containerPadding (built into child x positions).
    // Right padding = containerPadding (added here to match).
    // Top = HEADER_HEIGHT + containerPadding (built into child y positions).
    // Bottom = containerPadding (added here to match).
    let contentRight = 0,
      contentBottom = 0;
    for (const c of children) {
      contentRight = Math.max(contentRight, c.x + c.width);
      contentBottom = Math.max(contentBottom, c.y + c.height);
    }
    const minW = isVPC ? 280 : isSubnet ? 260 : MIN_CONTAINER_WIDTH;
    const minH = isVPC ? 180 : isSubnet ? 150 : MIN_CONTAINER_HEIGHT;
    parent.width = Math.max(minW, contentRight + containerPadding);
    parent.height = Math.max(minH, contentBottom + containerPadding);
  };

  // ── Dispatch to layout strategy ─────────────────────────────────────────

  if (opts.layout === 'circular') {
    return circularLayout(
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
 *   Application.StaticSite, Application.SSRSite, Network.PublicEndpoint,
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

  // Compute barycenter: average position of ALL connected main nodes.
  // Placing helpers at their barycenter minimizes total connection length
  // and reduces edge crossings.
  const helperPreferred = new Map<string, number>();
  for (const helper of helperNodes) {
    let sum = 0,
      count = 0;
    for (const edge of edges) {
      if (edge.relationship === 'contains') continue;
      const s = toTopLevel(edge.source);
      const t = toTopLevel(edge.target);
      let connId: string | null = null;
      if (s === helper.id && mainIds.has(t!)) connId = t!;
      if (t === helper.id && mainIds.has(s!)) connId = s!;
      if (connId) {
        const pos = nodePosMap.get(connId);
        if (pos) {
          // Horizontal flow → vertical column → barycenter on Y axis
          // Vertical flow   → horizontal row  → barycenter on X axis
          sum += isHorizontal
            ? pos.y + (nodeMap.get(connId)?.height || 0) / 2
            : pos.x + (nodeMap.get(connId)?.width || 0) / 2;
          count++;
        }
      }
    }
    if (count > 0) {
      const center = sum / count;
      helperPreferred.set(helper.id, center - (isHorizontal ? helper.height / 2 : helper.width / 2));
    }
  }

  // Sort helpers: connected ones first (by preferred position), disconnected last
  const sortedHelpers = [...helperNodes].sort((a, b) => {
    const ap = helperPreferred.get(a.id);
    const bp = helperPreferred.get(b.id);
    if (ap != null && bp != null) return ap - bp;
    if (ap != null) return -1;
    if (bp != null) return 1;
    return 0;
  });

  if (isHorizontal) {
    // Horizontal flow → helpers in a VERTICAL column to the right
    let nextY = mainTop;
    const helperX = mainRight + opts.nodeGap;
    for (const helper of sortedHelpers) {
      const preferred = helperPreferred.get(helper.id);
      helper.y = Math.max(nextY, preferred ?? nextY);
      helper.x = helperX;
      nextY = helper.y + helper.height + opts.nodeGap;
      layoutResults.push(helper);
      absolutizeChildren(helper, helper.x, helper.y);
    }
  } else {
    // Vertical flow → helpers in a HORIZONTAL row below
    let nextX = mainLeft;
    const helperY = mainBottom + opts.nodeGap;
    for (const helper of sortedHelpers) {
      const preferred = helperPreferred.get(helper.id);
      helper.x = Math.max(nextX, preferred ?? nextX);
      helper.y = helperY;
      nextX = helper.x + helper.width + opts.nodeGap;
      layoutResults.push(helper);
      absolutizeChildren(helper, helper.x, helper.y);
    }
  }

  // Collision detection pass — push apart any overlapping top-level nodes
  const allTopLevel = [...mainNodes, ...helperNodes].map((n) => nodeMap.get(n.id)!).filter(Boolean);
  resolveOverlaps(allTopLevel, opts.nodeGap / 2);

  return layoutResults;
}

// =============================================================================
// Circular Layout — Concentric rings by semantic tier
// =============================================================================

function circularLayout(
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
    if (isHelperNode(n.iceType || '')) helperNodes.push(n);
    else mainNodes.push(n);
  }

  // ── Step 2: Build layers using topological depth + semantic tier ──────────

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

  const mainIds = new Set(mainNodes.map((n) => n.id));
  const layerOf = new Map<string, number>();
  for (const node of mainNodes) {
    const topo = topoDepth.get(node.id) || 0;
    const tier = getSemanticTier(node.iceType || '');
    layerOf.set(node.id, Math.max(topo, tier));
  }

  const maxLayer = mainNodes.length > 0 ? Math.max(...Array.from(layerOf.values())) : 0;
  const layers: LayoutNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const node of mainNodes) {
    layers[layerOf.get(node.id)!].push(node);
  }

  // Barycenter sort within layers
  const revAdj = new Map<string, string[]>();
  for (const [src, targets] of adj) {
    for (const tgt of targets) {
      const list = revAdj.get(tgt) || [];
      list.push(src);
      revAdj.set(tgt, list);
    }
  }

  if (layers.length > 0) {
    layers[0].sort((a, b) => {
      const aG = a.type === 'container' || a.iceType?.startsWith('Group.') ? 0 : 1;
      const bG = b.type === 'container' || b.iceType?.startsWith('Group.') ? 0 : 1;
      if (aG !== bG) return aG - bG;
      return a.label.localeCompare(b.label);
    });
  }

  const positionIndex = new Map<string, number>();
  for (let i = 0; i < (layers[0]?.length || 0); i++) {
    positionIndex.set(layers[0][i].id, i);
  }

  for (let li = 1; li < layers.length; li++) {
    const layer = layers[li];
    if (layer.length <= 1) {
      if (layer.length === 1) positionIndex.set(layer[0].id, 0);
      continue;
    }
    const bary = new Map<string, number>();
    for (const node of layer) {
      const neighbors: number[] = [];
      for (const src of revAdj.get(node.id) || []) {
        if (positionIndex.has(src)) neighbors.push(positionIndex.get(src)!);
      }
      for (const tgt of adj.get(node.id) || []) {
        if (positionIndex.has(tgt)) neighbors.push(positionIndex.get(tgt)!);
      }
      bary.set(
        node.id,
        neighbors.length > 0 ? neighbors.reduce((a, b) => a + b, 0) / neighbors.length : layer.length / 2,
      );
    }
    layer.sort((a, b) => (bary.get(a.id) || 0) - (bary.get(b.id) || 0));
    for (let i = 0; i < layer.length; i++) positionIndex.set(layer[i].id, i);
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

  // ── Step 4: Position nodes on concentric rings ───────────────────────────

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

  const RING_GAP = 80;
  const MIN_RADIUS = 180;
  const nonEmptyLayers = layers.filter((l) => l.length > 0);

  // Compute radius for each ring
  const ringRadii: number[] = [];
  let prevRadius = 0;
  let prevMaxDim = 0;

  for (let i = 0; i < nonEmptyLayers.length; i++) {
    const layer = nonEmptyLayers[i];
    let maxDim = 0;
    for (const node of layer) maxDim = Math.max(maxDim, node.width, node.height);

    // Minimum circumference to fit all nodes without overlap
    const circumNeeded = layer.length * (maxDim + opts.nodeGap);
    const radiusFromCircum = circumNeeded / (2 * Math.PI);

    let radius: number;
    if (i === 0 && layer.length === 1) {
      radius = 0; // single node at center
    } else if (i === 0) {
      radius = Math.max(MIN_RADIUS, radiusFromCircum);
    } else {
      const minFromPrev = prevRadius + prevMaxDim / 2 + RING_GAP + maxDim / 2;
      radius = Math.max(minFromPrev, radiusFromCircum);
    }

    ringRadii.push(radius);
    prevRadius = radius;
    prevMaxDim = maxDim;
  }

  // Center point: offset so all nodes stay in positive coordinate space
  const outerRadius = ringRadii.length > 0 ? ringRadii[ringRadii.length - 1] : 0;
  const margin = 300;
  const centerX = opts.startX + outerRadius + margin;
  const centerY = opts.startY + outerRadius + margin;

  // Track each main node's angle for helper alignment
  const mainAngle = new Map<string, number>();

  for (let ri = 0; ri < nonEmptyLayers.length; ri++) {
    const layer = nonEmptyLayers[ri];
    const radius = ringRadii[ri];
    const n = layer.length;
    const startAngle = -Math.PI / 2; // start at top

    if (radius === 0 && n === 1) {
      // Single center node
      const node = layer[0];
      node.x = centerX - node.width / 2;
      node.y = centerY - node.height / 2;
      mainAngle.set(node.id, 0);
      layoutResults.push(node);
      absolutizeChildren(node, node.x, node.y);
      continue;
    }

    for (let i = 0; i < n; i++) {
      const angle = startAngle + (i / n) * 2 * Math.PI;
      const node = layer[i];
      node.x = centerX + radius * Math.cos(angle) - node.width / 2;
      node.y = centerY + radius * Math.sin(angle) - node.height / 2;
      mainAngle.set(node.id, angle);
      layoutResults.push(node);
      absolutizeChildren(node, node.x, node.y);
    }
  }

  // ── Step 5: Position helpers on an outer ring ────────────────────────────

  if (helperNodes.length > 0) {
    let helperMaxDim = 0;
    for (const h of helperNodes) helperMaxDim = Math.max(helperMaxDim, h.width, h.height);

    const helperRadius = (prevRadius || MIN_RADIUS) + prevMaxDim / 2 + RING_GAP + helperMaxDim / 2;
    const usedAngles: number[] = [];
    let disconnectedIdx = 0;

    for (const helper of helperNodes) {
      let connectedMainId: string | null = null;
      for (const edge of edges) {
        if (edge.relationship === 'contains') continue;
        const s = toTopLevel(edge.source);
        const t = toTopLevel(edge.target);
        if (s === helper.id && mainIds.has(t!)) {
          connectedMainId = t!;
          break;
        }
        if (t === helper.id && mainIds.has(s!)) {
          connectedMainId = s!;
          break;
        }
      }

      let angle: number;
      if (connectedMainId && mainAngle.has(connectedMainId)) {
        angle = mainAngle.get(connectedMainId)!;
        // Nudge if angle too close to an already-used one
        while (usedAngles.some((a) => Math.abs(a - angle) < 0.3)) angle += 0.35;
      } else {
        angle = -Math.PI / 2 + ((disconnectedIdx + 0.5) / Math.max(helperNodes.length, 1)) * 2 * Math.PI;
        disconnectedIdx++;
      }
      usedAngles.push(angle);

      helper.x = centerX + helperRadius * Math.cos(angle) - helper.width / 2;
      helper.y = centerY + helperRadius * Math.sin(angle) - helper.height / 2;
      layoutResults.push(helper);
      absolutizeChildren(helper, helper.x, helper.y);
    }
  }

  // Collision resolution — after pushing parents apart, shift their
  // descendants by the same delta so absolute positions stay consistent.
  const allTopLevel = [...mainNodes, ...helperNodes].map((n) => nodeMap.get(n.id)!).filter(Boolean);
  const prePos = new Map<string, { x: number; y: number }>();
  for (const n of allTopLevel) prePos.set(n.id, { x: n.x, y: n.y });

  resolveOverlaps(allTopLevel, opts.nodeGap / 2);

  for (const n of allTopLevel) {
    const pre = prePos.get(n.id)!;
    const dx = n.x - pre.x;
    const dy = n.y - pre.y;
    if (dx === 0 && dy === 0) continue;
    const shiftDescendants = (parentId: string) => {
      for (const childId of childrenMap.get(parentId) || []) {
        const child = nodeMap.get(childId);
        if (child) {
          child.x += dx;
          child.y += dy;
          shiftDescendants(childId);
        }
      }
    };
    shiftDescendants(n.id);
  }

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
    } else if (node.type === 'block') {
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

// =============================================================================
// Force-directed collision resolution
// =============================================================================
//
// Inspired by D3's forceCollide — nodes are treated as rigid rectangular bodies
// that repel each other when overlapping.  Parent-child containment is excluded
// (overlap there is intentional).  When a node moves, all its descendants shift
// with it so internal layout is preserved.
//
// The simulation uses velocity-Verlet integration with damping so nodes spread
// naturally rather than oscillating.

interface ForceBody {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string | null;
  /** Internal – velocity */
  vx?: number;
  vy?: number;
  /** Internal – descendant ids (filled by the resolver) */
  _descIds?: Set<string>;
}

/**
 * Force-directed rectangular collision resolution.
 *
 * Works on any array of objects with {id, x, y, width, height, parentId?}.
 * Mutates x/y in place.  `allNodes` is the full list (including children);
 * collision is only checked between nodes that don't share an ancestry chain.
 * When a node is pushed, all its descendants in `allNodes` move with it.
 *
 * @param allNodes  Every node (parents + children)
 * @param gap       Minimum gap between non-related nodes
 * @param ticks     Number of simulation ticks (default 60)
 * @param strength  Repulsion strength multiplier (default 0.8)
 */
export function forceResolveOverlaps<T extends ForceBody>(
  allNodes: T[],
  gap: number = 12,
  ticks: number = 60,
  strength: number = 0.8,
): void {
  if (allNodes.length < 2) return;

  // ── Build ancestry index ─────────────────────────────────────────────
  const nodeById = new Map<string, T>();
  for (const n of allNodes) nodeById.set(n.id, n);

  // Collect ALL descendant ids for each node (transitive)
  const descOf = new Map<string, Set<string>>();
  const getDesc = (id: string): Set<string> => {
    if (descOf.has(id)) return descOf.get(id)!;
    const s = new Set<string>();
    descOf.set(id, s); // set early to avoid cycles
    for (const n of allNodes) {
      if (n.parentId === id) {
        s.add(n.id);
        for (const d of getDesc(n.id)) s.add(d);
      }
    }
    return s;
  };
  for (const n of allNodes) getDesc(n.id);

  // Two nodes are "related" if one is an ancestor of the other
  const isRelated = (a: T, b: T): boolean => descOf.get(a.id)!.has(b.id) || descOf.get(b.id)!.has(a.id);

  // ── Identify top-level nodes (the bodies we simulate) ────────────────
  const topLevel = allNodes.filter((n) => !n.parentId || !nodeById.has(n.parentId));

  if (topLevel.length < 2) return;

  // Init velocities
  for (const n of topLevel) {
    n.vx = 0;
    n.vy = 0;
  }

  // Shift a node and all its descendants by (dx, dy)
  const shiftTree = (node: T, dx: number, dy: number) => {
    node.x += dx;
    node.y += dy;
    const desc = descOf.get(node.id);
    if (desc) {
      for (const did of desc) {
        const d = nodeById.get(did);
        if (d) {
          d.x += dx;
          d.y += dy;
        }
      }
    }
  };

  // ── Simulation loop ──────────────────────────────────────────────────
  const damping = 0.4; // velocity retention per tick (0 = full damping)

  for (let tick = 0; tick < ticks; tick++) {
    // Decay strength over time to help convergence
    const alpha = strength * (1 - tick / ticks);
    if (alpha < 0.01) break;

    // Apply collision forces between all non-related top-level pairs
    for (let i = 0; i < topLevel.length; i++) {
      for (let j = i + 1; j < topLevel.length; j++) {
        const a = topLevel[i];
        const b = topLevel[j];

        if (isRelated(a, b)) continue;

        // Rectangle overlap with gap
        const ax2 = a.x + a.width + gap;
        const ay2 = a.y + a.height + gap;
        const bx2 = b.x + b.width + gap;
        const by2 = b.y + b.height + gap;

        if (a.x >= bx2 || b.x >= ax2 || a.y >= by2 || b.y >= ay2) continue;

        // Compute overlap on each axis
        const ox = Math.min(ax2 - b.x, bx2 - a.x);
        const oy = Math.min(ay2 - b.y, by2 - a.y);

        // Push along the axis of least overlap (minimum translation vector)
        if (ox < oy) {
          const force = ox * alpha;
          if (a.x + a.width / 2 < b.x + b.width / 2) {
            a.vx! -= force / 2;
            b.vx! += force / 2;
          } else {
            a.vx! += force / 2;
            b.vx! -= force / 2;
          }
        } else {
          const force = oy * alpha;
          if (a.y + a.height / 2 < b.y + b.height / 2) {
            a.vy! -= force / 2;
            b.vy! += force / 2;
          } else {
            a.vy! += force / 2;
            b.vy! -= force / 2;
          }
        }
      }
    }

    // Integrate: apply velocity → position, then damp
    for (const n of topLevel) {
      if (n.vx! !== 0 || n.vy! !== 0) {
        shiftTree(n, n.vx!, n.vy!);
        n.vx! *= damping;
        n.vy! *= damping;
      }
    }
  }

  // Clean up temp fields
  for (const n of allNodes) {
    delete n.vx;
    delete n.vy;
    delete n._descIds;
  }
}

/** Legacy wrapper for internal auto-layout calls */
function resolveOverlaps(nodes: LayoutNode[], gap: number): void {
  forceResolveOverlaps(nodes, gap);
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
  if (isContainerType(iceType)) {
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

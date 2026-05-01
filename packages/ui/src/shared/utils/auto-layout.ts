/**
 * Auto-Layout — Dagre-based hierarchical tree layout.
 *
 * Nested containers are handled bottom-up: each container's children are laid
 * out with dagre first, the container is then sized to fit them, and the sized
 * container surfaces as a single node in its parent's dagre graph.
 *
 * Modes:
 *   'flow'     — dagre hierarchical tree (vertical=TB, horizontal=LR)
 *   'circular' — concentric-ring fallback (children arranged around parent center)
 *   'grid'     — alias of 'flow' (legacy — routed through dagre)
 */

import {
  LAYOUT_NODE_SEP as NODE_SEP,
  LAYOUT_RANK_SEP as RANK_SEP,
  LAYOUT_MARGIN as MARGIN,
  LAYOUT_GRID_STEP as GRID_STEP,
} from '@ice/constants';
import dagre from 'dagre';
import { MIN_CONTAINER_WIDTH, MIN_CONTAINER_HEIGHT } from '../../config/canvas-constants';
import { isContainer as isContainerType } from '../../config/containment-rules';
import {
  DEFAULT_OPTIONS,
  type LayoutNode,
  type LayoutEdge,
  type Point,
  type LayoutResult,
  type LayoutOptions,
} from './auto-layout/types';
import { intrinsicContainerMin, resolveVisualSize } from './auto-layout/visual-size';
import { buildHierarchy, collectRootIds, buildPostOrder } from './auto-layout/hierarchy';

export type { LayoutNode, LayoutEdge, Point, LayoutResult } from './auto-layout/types';

// =============================================================================
// Public entry point
// =============================================================================

export function autoLayout(nodes: LayoutNode[], edges: LayoutEdge[], options: LayoutOptions = {}): LayoutResult {
  if (nodes.length === 0) return { nodes: [], edgeRoutes: new Map() };
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (opts.layout === 'circular') {
    return circularLayout(nodes, edges, opts);
  }
  return dagreTreeLayout(nodes, edges, opts);
}

// =============================================================================
// Dagre hierarchical tree layout
// =============================================================================

function dagreTreeLayout(nodes: LayoutNode[], edges: LayoutEdge[], opts: Required<LayoutOptions>): LayoutResult {
  const rankdir = opts.direction === 'horizontal' ? 'LR' : 'TB';
  const nodeGap = opts.nodeGap || NODE_SEP;

  const { childrenOf } = buildHierarchy(nodes, edges);

  // Working copy of every node. Use *visual* size (what the renderer will
  // actually draw) so dagre doesn't overlap specialty blocks like
  // Private Network or Custom Domain that ignore the stored 240×160.
  const nodeMap = new Map<string, LayoutNode>();
  for (const n of nodes) {
    const visual = resolveVisualSize(n);
    nodeMap.set(n.id, { ...n, width: visual.width, height: visual.height });
  }

  const rootIds = collectRootIds(nodes, nodeMap);
  const flowEdges = edges.filter((e) => e.relationship !== 'contains');

  // Split top-level nodes into flow participants vs. isolated singletons.
  // Dagre only sees flow nodes — isolated ones are placed by `repack…` after
  // the flow is done. Without this split, dagre spreads all 20+ isolated
  // components across a huge bounding box and pushes the actual flow far
  // from (0,0), producing ~300px rank gaps instead of the 80px we set.
  const flowTouched = new Set<string>();
  for (const e of flowEdges) {
    flowTouched.add(e.source);
    flowTouched.add(e.target);
  }
  const topHasFlow = new Map<string, boolean>();
  const checkFlowSubtree = (id: string): boolean => {
    const cached = topHasFlow.get(id);
    if (cached !== undefined) return cached;
    if (flowTouched.has(id)) {
      topHasFlow.set(id, true);
      return true;
    }
    for (const k of childrenOf.get(id) ?? []) {
      if (checkFlowSubtree(k)) {
        topHasFlow.set(id, true);
        return true;
      }
    }
    topHasFlow.set(id, false);
    return false;
  };
  const flowRootSet = new Set(rootIds.filter(checkFlowSubtree));

  // Post-order traversal of the containment tree: inner containers are laid
  // out and sized before outer containers consume them as fixed-size nodes.
  const groupOrder = buildPostOrder(rootIds, childrenOf);

  const containerSize = new Map<string, { width: number; height: number }>();
  const relPos = new Map<string, { x: number; y: number }>();
  // Edge waypoints stored in group-local coordinates, tagged by owner so the
  // absolutize pass can offset them by the container's absolute position.
  const relEdgeRoutes: Array<{ ownerId: string | null; key: string; points: Point[] }> = [];

  for (const ownerId of groupOrder) {
    // At top-level, only feed dagre the flow-connected roots — isolated ones
    // are placed by repackIsolatedTopLevel. Inside a container we still lay
    // out every direct child.
    const kids = ownerId === null ? rootIds.filter((id) => flowRootSet.has(id)) : (childrenOf.get(ownerId) ?? []);
    if (kids.length === 0) continue;

    // When a container's children have no internal flow edges, dagre puts each
    // node in its own rank — yielding a single 1×N row (or column) of cards.
    // Pack them into a roughly-square grid instead so containers with many
    // isolated kids stay compact and read at a glance.
    if (ownerId !== null && kids.length >= 2) {
      const kidSet = new Set(kids);
      const hasInternalEdge = flowEdges.some(
        (e) => e.source !== e.target && kidSet.has(e.source) && kidSet.has(e.target),
      );
      if (!hasInternalEdge) {
        gridPackKids(kids, ownerId, nodeMap, containerSize, relPos);
        continue;
      }
    }

    const g = new dagre.graphlib.Graph({ compound: false, multigraph: false });
    g.setGraph({
      rankdir,
      nodesep: nodeGap,
      ranksep: RANK_SEP,
      edgesep: 20,
      marginx: MARGIN,
      marginy: MARGIN,
      ranker: 'tight-tree',
      // Default (omit align) — dagre balances siblings around their median
      // parent, which looks symmetric. 'UL' left-pins children and makes
      // multi-child trees look lopsided.
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const kid of kids) {
      const kidNode = nodeMap.get(kid)!;
      const sized = containerSize.get(kid) ?? { width: kidNode.width, height: kidNode.height };
      g.setNode(kid, { width: sized.width, height: sized.height });
    }

    const kidSet = new Set(kids);
    for (const e of flowEdges) {
      if (e.source === e.target) continue;
      if (kidSet.has(e.source) && kidSet.has(e.target)) {
        g.setEdge(e.source, e.target);
      }
    }

    dagre.layout(g);

    // Dagre reports node centers — convert to top-left and find bounding box.
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const kid of kids) {
      const gn = g.node(kid);
      const x = gn.x - gn.width / 2;
      const y = gn.y - gn.height / 2;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + gn.width > maxX) maxX = x + gn.width;
      if (y + gn.height > maxY) maxY = y + gn.height;
    }

    // Inside a container, place children using grid-aligned padding so the
    // post-layout snapToGrid pass is a no-op for the inset and the bottom
    // padding doesn't get eaten when snap rounds the first child up.
    // CONTAINER_PADDING (20) and HEADER_HEIGHT (36) sum to 56 — neither a
    // multiple of GRID_STEP — so snap turns "56" into "80" while the
    // container's pre-snap height was sized for 56, leaving 0px of bottom
    // padding. We use the next grid multiples (40 side, 80 top) and a
    // matching 40 bottom padding so the bookkeeping holds through snap.
    const originX = ownerId === null ? opts.startX : GRID_STEP;
    const originY = ownerId === null ? opts.startY : GRID_STEP * 2;
    const shiftX = originX - minX;
    const shiftY = originY - minY;

    for (const kid of kids) {
      const gn = g.node(kid);
      relPos.set(kid, {
        x: gn.x - gn.width / 2 + shiftX,
        y: gn.y - gn.height / 2 + shiftY,
      });
    }

    // Capture dagre's edge routing — these become group-local polylines that
    // the renderer will draw through. Shifted to match node positions.
    for (const edgeRef of g.edges()) {
      const dagreEdge = g.edge(edgeRef) as { points?: Array<{ x: number; y: number }> };
      if (!dagreEdge?.points || dagreEdge.points.length === 0) continue;
      const points = dagreEdge.points.map((p) => ({ x: p.x + shiftX, y: p.y + shiftY }));
      relEdgeRoutes.push({ ownerId, key: `${edgeRef.v}::${edgeRef.w}`, points });
    }

    if (ownerId !== null) {
      const contentW = maxX - minX;
      const contentH = maxY - minY;
      // Shrink-wrap the container to its content. Floor only to the iceType's
      // intrinsic visual minimum (Private Network = 560×320) — NOT to the
      // container's previously stored size, which would prevent any shrink.
      const ownerIce = (nodeMap.get(ownerId)!.iceType as string) || '';
      const visualMin = intrinsicContainerMin(ownerIce);
      // Size the container using the same grid-aligned paddings used to
      // place children (40 each side horizontally; 80 top header zone + 40
      // bottom padding = 3 grid steps vertically).
      containerSize.set(ownerId, {
        width: Math.max(contentW + GRID_STEP * 2, visualMin.width),
        height: Math.max(contentH + GRID_STEP * 3, visualMin.height),
      });
    }
  }

  // Repack isolated top-level nodes into a tight grid. Dagre places every
  // weakly-connected component side-by-side — with a single main flow and
  // several isolated blocks, this stretches the canvas hundreds of px to the
  // side for no layout reason. Instead, keep the flow where it is and pack
  // isolated components into a grid under it (TB) or beside it (LR).
  repackIsolatedTopLevel(rootIds, flowEdges, childrenOf, nodeMap, containerSize, relPos, rankdir, nodeGap);

  // Walk the tree top-down, accumulating container origins to resolve
  // every descendant to absolute coordinates.
  absolutizeAll(rootIds, nodeMap, childrenOf, relPos, containerSize);

  // Snap every position and dimension to GRID_STEP so the canvas reads as a
  // clean grid at any zoom. Children are snapped before parents' positions
  // are widened, so the inside padding may vary by a few pixels but stays
  // consistent.
  snapToGrid(nodeMap);

  // Now that every container has an absolute position, offset each edge's
  // group-local polyline by its owning container's absolute position.
  const edgeRoutes = absolutizeEdgeRoutes(relEdgeRoutes, nodeMap);

  return { nodes: Array.from(nodeMap.values()), edgeRoutes };
}

// =============================================================================
// Circular (concentric rings) layout
// =============================================================================

function circularLayout(nodes: LayoutNode[], edges: LayoutEdge[], opts: Required<LayoutOptions>): LayoutResult {
  const { childrenOf } = buildHierarchy(nodes, edges);

  const nodeMap = new Map<string, LayoutNode>();
  for (const n of nodes) {
    const visual = resolveVisualSize(n);
    nodeMap.set(n.id, { ...n, width: visual.width, height: visual.height });
  }

  const rootIds = collectRootIds(nodes, nodeMap);
  const groupOrder = buildPostOrder(rootIds, childrenOf);

  const containerSize = new Map<string, { width: number; height: number }>();
  const relPos = new Map<string, { x: number; y: number }>();

  for (const ownerId of groupOrder) {
    const kids = ownerId === null ? rootIds : (childrenOf.get(ownerId) ?? []);
    if (kids.length === 0) continue;

    const sizes = kids.map((kid) => {
      const kidNode = nodeMap.get(kid)!;
      return containerSize.get(kid) ?? { width: kidNode.width, height: kidNode.height };
    });
    const maxW = Math.max(...sizes.map((s) => s.width));
    const maxH = Math.max(...sizes.map((s) => s.height));

    // Radius so that adjacent siblings don't overlap on the ring.
    const minArc = Math.max(maxW, maxH) + opts.nodeGap;
    const radius = kids.length === 1 ? 0 : Math.max((minArc * kids.length) / (2 * Math.PI), minArc);

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    kids.forEach((kid, i) => {
      const size = sizes[i];
      const angle = kids.length === 1 ? 0 : (i / kids.length) * 2 * Math.PI - Math.PI / 2;
      const cx = Math.cos(angle) * radius;
      const cy = Math.sin(angle) * radius;
      const x = cx - size.width / 2;
      const y = cy - size.height / 2;
      relPos.set(kid, { x, y });
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + size.width > maxX) maxX = x + size.width;
      if (y + size.height > maxY) maxY = y + size.height;
    });

    // Mirror the dagre path: grid-aligned padding so snap is a no-op for the
    // inset (and bottom padding doesn't get eaten).
    const originX = ownerId === null ? opts.startX : GRID_STEP;
    const originY = ownerId === null ? opts.startY : GRID_STEP * 2;
    const dx = originX - minX;
    const dy = originY - minY;
    for (const kid of kids) {
      const p = relPos.get(kid)!;
      relPos.set(kid, { x: p.x + dx, y: p.y + dy });
    }

    if (ownerId !== null) {
      const contentW = maxX - minX;
      const contentH = maxY - minY;
      const owner = nodeMap.get(ownerId)!;
      containerSize.set(ownerId, {
        width: Math.max(contentW + GRID_STEP * 2, MIN_CONTAINER_WIDTH, owner.width),
        height: Math.max(contentH + GRID_STEP * 3, MIN_CONTAINER_HEIGHT, owner.height),
      });
    }
  }

  absolutizeAll(rootIds, nodeMap, childrenOf, relPos, containerSize);
  snapToGrid(nodeMap);
  return { nodes: Array.from(nodeMap.values()), edgeRoutes: new Map() };
}

/**
/**
 * Pack a container's isolated children into a roughly-square grid, written
 * back as group-local positions in `relPos` and the resulting bounds as
 * `containerSize[ownerId]`. Used in place of dagre when no kid pair shares
 * a flow edge — dagre would otherwise stretch the children into a 1×N rank.
 *
 * Padding mirrors the dagre branch: GRID_STEP each side, GRID_STEP*2 on top
 * (header zone), GRID_STEP at the bottom — all snap-no-op friendly.
 */
function gridPackKids(
  kids: string[],
  ownerId: string,
  nodeMap: Map<string, LayoutNode>,
  containerSize: Map<string, { width: number; height: number }>,
  relPos: Map<string, { x: number; y: number }>,
): void {
  const sizeOf = (id: string) => {
    const cs = containerSize.get(id);
    if (cs) return cs;
    const n = nodeMap.get(id)!;
    return { width: n.width, height: n.height };
  };
  const sizes = kids.map(sizeOf);
  const avgW = sizes.reduce((s, x) => s + x.width, 0) / kids.length;
  const avgH = sizes.reduce((s, x) => s + x.height, 0) / kids.length;

  // Aim for a roughly-square content box. cols ≈ sqrt(N * avgH/avgW) yields
  // a layout whose width-to-height matches the average card aspect ratio.
  const cols = Math.max(1, Math.round(Math.sqrt(kids.length * (avgH / avgW))));

  const ownerIce = (nodeMap.get(ownerId)!.iceType as string) || '';
  const visualMin = intrinsicContainerMin(ownerIce);

  let cursorX = GRID_STEP; // left padding
  let cursorY = GRID_STEP * 2; // header zone
  let rowHeight = 0;
  let maxRightEdge = 0; // rightmost block edge across all rows

  for (let i = 0; i < kids.length; i++) {
    if (i > 0 && i % cols === 0) {
      cursorX = GRID_STEP;
      cursorY += rowHeight + GRID_STEP;
      rowHeight = 0;
    }
    const s = sizes[i];
    relPos.set(kids[i], { x: cursorX, y: cursorY });
    const rightEdge = cursorX + s.width;
    if (rightEdge > maxRightEdge) maxRightEdge = rightEdge;
    cursorX = rightEdge + GRID_STEP;
    if (s.height > rowHeight) rowHeight = s.height;
  }
  const lastBottom = cursorY + rowHeight;

  containerSize.set(ownerId, {
    width: Math.max(maxRightEdge + GRID_STEP, visualMin.width),
    height: Math.max(lastBottom + GRID_STEP, visualMin.height),
  });
}

/**
 * Keep the main flow where dagre put it, then pack every top-level node
 * whose whole subtree is untouched by flow edges into a tight grid below
 * (TB) or beside (LR) the flow. Without this, dagre spreads singleton
 * components alongside the main flow and the canvas stretches absurdly wide.
 */
function repackIsolatedTopLevel(
  rootIds: string[],
  flowEdges: LayoutEdge[],
  childrenOf: Map<string, string[]>,
  nodeMap: Map<string, LayoutNode>,
  containerSize: Map<string, { width: number; height: number }>,
  relPos: Map<string, { x: number; y: number }>,
  rankdir: 'TB' | 'LR',
  gap: number,
): void {
  const touched = new Set<string>();
  for (const e of flowEdges) {
    touched.add(e.source);
    touched.add(e.target);
  }

  const hasFlowDescendant = new Map<string, boolean>();
  const checkFlow = (id: string): boolean => {
    const cached = hasFlowDescendant.get(id);
    if (cached !== undefined) return cached;
    if (touched.has(id)) {
      hasFlowDescendant.set(id, true);
      return true;
    }
    for (const kid of childrenOf.get(id) ?? []) {
      if (checkFlow(kid)) {
        hasFlowDescendant.set(id, true);
        return true;
      }
    }
    hasFlowDescendant.set(id, false);
    return false;
  };

  const flowRoots: string[] = [];
  const isolatedRoots: string[] = [];
  for (const id of rootIds) (checkFlow(id) ? flowRoots : isolatedRoots).push(id);

  if (isolatedRoots.length === 0 || flowRoots.length === 0) return;

  const sizeOf = (id: string): { width: number; height: number } => {
    const n = nodeMap.get(id)!;
    const cs = containerSize.get(id);
    // containerSize is authoritative for containers that have been laid out —
    // it's the shrink-wrapped post-layout size (e.g. 320 for an empty
    // Private Network, even though its pre-layout stored height was 706).
    // Using `Math.max(cs, n)` here would leak stale nodeMap values into the
    // packing loop and leave huge vertical gaps between rows.
    if (cs) return { width: cs.width, height: cs.height };
    return { width: n.width, height: n.height };
  };

  // Bounding box of the flow in top-level coordinates.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const id of flowRoots) {
    const rel = relPos.get(id);
    if (!rel) continue;
    const s = sizeOf(id);
    if (rel.x < minX) minX = rel.x;
    if (rel.y < minY) minY = rel.y;
    if (rel.x + s.width > maxX) maxX = rel.x + s.width;
    if (rel.y + s.height > maxY) maxY = rel.y + s.height;
  }
  if (!isFinite(minX)) return;

  // Sort isolated nodes tallest-to-shortest (TB) / widest-first (LR) so a
  // giant Private Network doesn't leave a ragged row.
  const sorted = [...isolatedRoots].sort((a, b) => {
    const sa = sizeOf(a);
    const sb = sizeOf(b);
    return rankdir === 'TB' ? sb.height - sa.height : sb.width - sa.width;
  });

  // Target a roughly-square grid so 20+ isolated blocks don't stack into a
  // narrow, multi-screen-tall column. `flowWidth` is a floor — we use the
  // larger of (flow bounding box) and (sqrt(count) × typical node width)
  // so the grid gets wide enough to visually breathe.
  const avgW = sorted.reduce((s, id) => s + sizeOf(id).width, 0) / Math.max(sorted.length, 1);
  const avgH = sorted.reduce((s, id) => s + sizeOf(id).height, 0) / Math.max(sorted.length, 1);
  const gridCols = Math.max(3, Math.ceil(Math.sqrt(sorted.length)));
  const targetGridWidth = gridCols * (avgW + gap);
  const targetGridHeight = Math.max(3, Math.ceil(sorted.length / gridCols)) * (avgH + gap);

  if (rankdir === 'TB') {
    const gridWidth = Math.max(maxX - minX, targetGridWidth);
    let cursorX = minX;
    let cursorY = maxY + RANK_SEP;
    let rowHeight = 0;
    for (const id of sorted) {
      const s = sizeOf(id);
      if (cursorX > minX && cursorX + s.width > minX + gridWidth) {
        cursorX = minX;
        cursorY += rowHeight + gap;
        rowHeight = 0;
      }
      relPos.set(id, { x: cursorX, y: cursorY });
      cursorX += s.width + gap;
      if (s.height > rowHeight) rowHeight = s.height;
    }
  } else {
    const gridHeight = Math.max(maxY - minY, targetGridHeight);
    let cursorX = maxX + RANK_SEP;
    let cursorY = minY;
    let colWidth = 0;
    for (const id of sorted) {
      const s = sizeOf(id);
      if (cursorY > minY && cursorY + s.height > minY + gridHeight) {
        cursorY = minY;
        cursorX += colWidth + gap;
        colWidth = 0;
      }
      relPos.set(id, { x: cursorX, y: cursorY });
      cursorY += s.height + gap;
      if (s.width > colWidth) colWidth = s.width;
    }
  }
}

/**
 * Convert group-local edge polylines into absolute canvas coordinates by
 * offsetting each route by its owning container's now-absolute position.
 * Top-level routes (ownerId === null) are already in absolute space.
 */
function absolutizeEdgeRoutes(
  relEdgeRoutes: Array<{ ownerId: string | null; key: string; points: Point[] }>,
  nodeMap: Map<string, LayoutNode>,
): Map<string, Point[]> {
  const result = new Map<string, Point[]>();
  for (const { ownerId, key, points } of relEdgeRoutes) {
    let dx = 0;
    let dy = 0;
    if (ownerId !== null) {
      const owner = nodeMap.get(ownerId);
      if (owner) {
        dx = owner.x;
        dy = owner.y;
      }
    }
    result.set(
      key,
      points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    );
  }
  return result;
}

/**
 * Snap every node's x, y, width, height to a multiple of GRID_STEP so the
 * final canvas reads as a clean grid — positions line up, sizes align, and
 * visible gaps stay uniform at every zoom level.
 */
function snapToGrid(nodeMap: Map<string, LayoutNode>): void {
  const snap = (v: number) => Math.round(v / GRID_STEP) * GRID_STEP;
  for (const n of nodeMap.values()) {
    n.x = snap(n.x);
    n.y = snap(n.y);
    n.width = Math.max(GRID_STEP, snap(n.width));
    n.height = Math.max(GRID_STEP, snap(n.height));
  }
}

function absolutizeAll(
  rootIds: string[],
  nodeMap: Map<string, LayoutNode>,
  childrenOf: Map<string, string[]>,
  relPos: Map<string, { x: number; y: number }>,
  containerSize: Map<string, { width: number; height: number }>,
): void {
  const walk = (id: string, parentAbsX: number, parentAbsY: number) => {
    const n = nodeMap.get(id);
    if (!n) return;
    const rel = relPos.get(id);
    if (rel) {
      n.x = parentAbsX + rel.x;
      n.y = parentAbsY + rel.y;
    }
    const size = containerSize.get(id);
    if (size) {
      n.width = size.width;
      n.height = size.height;
    }
    for (const cid of childrenOf.get(id) ?? []) {
      walk(cid, n.x, n.y);
    }
  };
  for (const rid of rootIds) walk(rid, 0, 0);
}

// =============================================================================
// Z-Index (used by svg-canvas.tsx and z-index-depth.test.ts)
// =============================================================================

export function calculateZIndex(iceType: string, depth: number = 0): number {
  if (iceType === 'Network.VPC') return 0 + depth;
  if (iceType === 'Network.Subnet') return 10 + depth;
  if (iceType.startsWith('Group.')) return 15 + depth;
  if (isContainerType(iceType)) return 20 + depth;
  return 100 + depth;
}

// =============================================================================
// Force-directed collision resolution (post-layout safety net)
// =============================================================================

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
}

/**
 * Resolves rectangular overlaps between top-level nodes by applying a short
 * velocity-damped simulation. Mutates x/y in place. Descendants move with
 * their top-level ancestor. Nodes sharing an ancestry chain never collide.
 */
export function forceResolveOverlaps<T extends ForceBody>(
  allNodes: T[],
  gap: number = 12,
  ticks: number = 60,
  strength: number = 0.8,
): void {
  if (allNodes.length < 2) return;

  const nodeById = new Map<string, T>();
  for (const n of allNodes) nodeById.set(n.id, n);

  const descOf = new Map<string, Set<string>>();
  const getDesc = (id: string): Set<string> => {
    const cached = descOf.get(id);
    if (cached) return cached;
    const s = new Set<string>();
    descOf.set(id, s);
    for (const n of allNodes) {
      if (n.parentId === id) {
        s.add(n.id);
        for (const d of getDesc(n.id)) s.add(d);
      }
    }
    return s;
  };
  for (const n of allNodes) getDesc(n.id);

  const isRelated = (a: T, b: T): boolean => descOf.get(a.id)!.has(b.id) || descOf.get(b.id)!.has(a.id);

  const topLevel = allNodes.filter((n) => !n.parentId || !nodeById.has(n.parentId));
  if (topLevel.length < 2) return;

  for (const n of topLevel) {
    n.vx = 0;
    n.vy = 0;
  }

  const shiftTree = (node: T, dx: number, dy: number) => {
    node.x += dx;
    node.y += dy;
    const desc = descOf.get(node.id);
    if (!desc) return;
    for (const did of desc) {
      const d = nodeById.get(did);
      if (d) {
        d.x += dx;
        d.y += dy;
      }
    }
  };

  const damping = 0.4;

  for (let tick = 0; tick < ticks; tick++) {
    const alpha = strength * (1 - tick / ticks);
    if (alpha < 0.01) break;

    for (let i = 0; i < topLevel.length; i++) {
      for (let j = i + 1; j < topLevel.length; j++) {
        const a = topLevel[i];
        const b = topLevel[j];
        if (isRelated(a, b)) continue;

        const ax2 = a.x + a.width + gap;
        const ay2 = a.y + a.height + gap;
        const bx2 = b.x + b.width + gap;
        const by2 = b.y + b.height + gap;
        if (a.x >= bx2 || b.x >= ax2 || a.y >= by2 || b.y >= ay2) continue;

        const ox = Math.min(ax2 - b.x, bx2 - a.x);
        const oy = Math.min(ay2 - b.y, by2 - a.y);

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

    for (const n of topLevel) {
      if (n.vx !== 0 || n.vy !== 0) {
        shiftTree(n, n.vx!, n.vy!);
        n.vx! *= damping;
        n.vy! *= damping;
      }
    }
  }

  for (const n of allNodes) {
    delete n.vx;
    delete n.vy;
  }
}

/**
 * Dagre-based hierarchical tree layout.
 *
 * Nested containers are handled bottom-up: each container's children are
 * laid out with dagre first, the container is then sized to fit them, and
 * the sized container surfaces as a single node in its parent's dagre
 * graph. The traversal order is post-order over the containment tree
 * (`buildPostOrder`), so inner containers always have authoritative sizes
 * before their owners pack them.
 *
 * Top-level: only flow-connected roots feed into the per-owner dagre
 * graph; isolated subtrees are placed by `repackIsolatedTopLevel` after
 * the flow is laid out.
 */

import {
  LAYOUT_NODE_SEP as NODE_SEP,
  LAYOUT_RANK_SEP as RANK_SEP,
  LAYOUT_MARGIN as MARGIN,
  LAYOUT_GRID_STEP as GRID_STEP,
} from '@ice/constants';
import dagre from 'dagre';
import { buildHierarchy, collectRootIds, buildPostOrder } from '../hierarchy';
import { gridPackKids, repackIsolatedTopLevel } from '../packing';
import { absolutizeAll, absolutizeEdgeRoutes, snapToGrid } from '../transformers';
import { intrinsicContainerMin, resolveVisualSize } from '../visual-size';
import type { LayoutEdge, LayoutNode, LayoutOptions, LayoutResult, Point } from '../types';

export function dagreTreeLayout(nodes: LayoutNode[], edges: LayoutEdge[], opts: Required<LayoutOptions>): LayoutResult {
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

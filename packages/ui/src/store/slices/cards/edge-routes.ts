/**
 * Cards slice — edge-route management + container reflow utilities.
 *
 * Pure functions over `CardEdge[]` / `CardNode[]` payloads that manage the
 * cached `routePoints` polylines dagre produces during auto-layout, and the
 * legacy cascading container reflow helper kept as intentional dead code.
 *
 * The two live exports are imported by the position-update and import /
 * auto-organize reducers in the orchestrator. `cascadeContainerReflow` is
 * exported for symmetry but is no longer wired into any reducer (auto-layout
 * already sizes containers correctly — see L887 comment block in the
 * orchestrator's `autoOrganizeCard` reducer for the full rationale).
 *
 * @see rf-cards-3
 * @see blueprint risk #6 — the eslint-disable comment for
 *      `cascadeContainerReflow` must stay on the line immediately preceding
 *      the function declaration.
 */

import type { CardEdge, CardNode } from './types';
import {
  CONTAINER_PADDING,
  HEADER_HEIGHT,
  MIN_CONTAINER_WIDTH,
  MIN_CONTAINER_HEIGHT,
} from '../../../config/canvas-constants';

/**
 * Drop the cached `routePoints` on any edge incident to this node — once a
 * node has moved, its dagre-computed route is stale and would render as a
 * polyline through empty space until the next auto-organize.
 */
export function invalidateEdgeRoutesTouching(edges: CardEdge[], nodeId: string): void {
  for (const edge of edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    if (edge.data?.routePoints) delete edge.data.routePoints;
  }
}

/**
 * Copy each edge's routed polyline (produced by dagre during auto-layout)
 * onto the edge's data so SvgConnectionPath can draw through it. Absent
 * routes clear the stored waypoints so stale paths don't linger.
 */
export function applyEdgeRoutes(
  edges: CardEdge[],
  edgeRoutes: Map<string, Array<{ x: number; y: number }>>,
): void {
  for (const edge of edges) {
    const route = edgeRoutes.get(`${edge.source}::${edge.target}`);
    if (!edge.data) edge.data = {};
    if (route && route.length >= 2) {
      edge.data.routePoints = route.map((p) => ({ x: p.x, y: p.y }));
    } else {
      delete edge.data.routePoints;
    }
  }
}

/**
 * After an organize action, propagate container size changes upward.
 * Process deepest containers first (leaf-up) so children are sized before parents.
 *
 * Intentional dead code — `autoOrganizeCard` no longer calls this (see the
 * comment block in the orchestrator at the L887 area). Kept for reference;
 * exported so any future re-wiring has the helper available.
 */
// eslint-disable-next-line unused-imports/no-unused-vars
export function cascadeContainerReflow(nodes: CardNode[]): void {
  const containers = nodes.filter((n) => n.type === 'container');
  if (containers.length === 0) return;

  const depthOf = (nodeId: string): number => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node?.parentId) return 0;
    return 1 + depthOf(node.parentId);
  };
  const depths = new Map(containers.map((c) => [c.id, depthOf(c.id)]));
  const sorted = [...containers].sort((a, b) => (depths.get(b.id) || 0) - (depths.get(a.id) || 0));

  for (const container of sorted) {
    const children = nodes.filter((n) => n.parentId === container.id);
    if (children.length === 0) continue;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const child of children) {
      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxX = Math.max(maxX, child.position.x + child.width);
      maxY = Math.max(maxY, child.position.y + child.height);
    }

    // Symmetric padding: equal on all sides. HEADER_HEIGHT is added to top
    // only for the label bar, so top padding = CONTAINER_PADDING + HEADER_HEIGHT.
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const newW = Math.max(contentW + CONTAINER_PADDING * 2, MIN_CONTAINER_WIDTH);
    const newH = Math.max(contentH + CONTAINER_PADDING * 2 + HEADER_HEIGHT, MIN_CONTAINER_HEIGHT);

    // Center the container around its children (symmetric L/R padding)
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    container.width = newW;
    container.height = newH;
    container.position.x = contentCenterX - newW / 2;
    // Vertically: shift up by half the header to keep content visually centered
    container.position.y = contentCenterY - (newH - HEADER_HEIGHT) / 2 - HEADER_HEIGHT;
  }
}

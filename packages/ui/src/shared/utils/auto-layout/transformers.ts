/**
 * Coordinate transformers for auto-layout.
 *
 *  - `absolutizeEdgeRoutes` offsets each group-local edge polyline by its
 *    owning container's now-absolute position. Top-level routes
 *    (ownerId=null) are already in absolute space and pass through.
 *  - `absolutizeAll` walks the containment tree top-down, accumulating
 *    container origins to resolve every descendant to absolute coordinates.
 *  - `snapToGrid` rounds every node's x/y/width/height to a multiple of
 *    GRID_STEP so the final canvas reads as a clean grid at any zoom level.
 *
 * Order matters: in dagreTreeLayout we call `absolutizeAll` BEFORE
 * `absolutizeEdgeRoutes` so each container's `n.x` / `n.y` is the absolute
 * position the edge offset reads. Then `snapToGrid` finalizes the visuals.
 */

import { LAYOUT_GRID_STEP as GRID_STEP } from '@ice/constants';
import type { LayoutNode, Point } from './types';

/**
 * Convert group-local edge polylines into absolute canvas coordinates by
 * offsetting each route by its owning container's now-absolute position.
 * Top-level routes (ownerId === null) are already in absolute space.
 */
export function absolutizeEdgeRoutes(
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
export function snapToGrid(nodeMap: Map<string, LayoutNode>): void {
  const snap = (v: number) => Math.round(v / GRID_STEP) * GRID_STEP;
  for (const n of nodeMap.values()) {
    n.x = snap(n.x);
    n.y = snap(n.y);
    n.width = Math.max(GRID_STEP, snap(n.width));
    n.height = Math.max(GRID_STEP, snap(n.height));
  }
}

/**
 * Walk the tree top-down, accumulating container origins to resolve every
 * descendant to absolute coordinates. Mutates `nodeMap` entries in place:
 * `n.x`, `n.y` get parent-relative + parent-absolute; if the node is a
 * sized container, `n.width`, `n.height` get the post-layout dimensions.
 */
export function absolutizeAll(
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

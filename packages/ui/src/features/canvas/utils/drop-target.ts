/**
 * Pure container hit-testing helpers for drop-target detection.
 *
 * Two helpers share a lineage but answer different questions:
 *
 * - `findContainerAtPosition` matches by descending z-index sort. It mirrors
 *   the visual stacking order — the container whose `<g>` would be painted
 *   on top wins, regardless of nesting depth. Used by `handleDrop` for the
 *   palette-drop drop-target check at the canvas root level.
 *
 * - `findSmallestContainerHit` picks the deepest-nested container at a point
 *   by minimum bounding-box area. Two visibly-stacked containers with equal
 *   z-index would tie under the primary helper; the smallest-area tiebreaker
 *   gives the user the "most specific" target (e.g. a Subnet inside a VPC).
 *   Used by Shift-drag highlight + reparent + (currently inline) connection
 *   end / preview-color sites.
 *
 * Both helpers are predicate-generic: the caller decides which iceType / type
 * combinations count as a container at THIS callsite. The rf-canv-2 learning
 * `inline-classification-duplications-are-not-actually-duplicates` documents
 * why no single "isContainer" predicate fits every drop-target site.
 *
 * Hit-test rectangle is **inclusive on all four edges** (`>=` and `<=`) — a
 * point exactly on the container's right or bottom edge counts as inside.
 * Preserve verbatim; the orchestrator's hit logic depends on it.
 */

import type { CanvasNode } from '../components/types';
import { calculateZIndex } from '../../../shared/utils/auto-layout';

/** Inclusive-edge axis-aligned bounding box test. */
function pointInNode(node: CanvasNode, x: number, y: number): boolean {
  return x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height;
}

/**
 * Find the container at `(x, y)` whose iceType has the highest z-index, among
 * nodes that pass `predicate`. Mirrors the inline `handleDrop` lookup at the
 * orchestrator's L1630 — z-index DESC sort, then linear "first hit wins."
 *
 * `predicate` receives the full node so callers can mix iceType-based and
 * type-based rules. Returns `null` when no container matches.
 */
export function findContainerAtPosition(
  visibleNodes: CanvasNode[],
  x: number,
  y: number,
  predicate: (node: CanvasNode) => boolean,
): CanvasNode | null {
  const containers = visibleNodes.filter(predicate).sort((a, b) => {
    const aIceType = (a.data.iceType as string) || '';
    const bIceType = (b.data.iceType as string) || '';
    return calculateZIndex(bIceType, 0) - calculateZIndex(aIceType, 0);
  });
  for (const container of containers) {
    if (pointInNode(container, x, y)) return container;
  }
  return null;
}

/**
 * Find the smallest-area container at `(x, y)` matching `predicate`, skipping
 * any node whose id is in `excludeIds`. Mirrors the inline Shift-drag /
 * reparent loops at the orchestrator's L1369 + L1431 — linear scan, smallest
 * area wins (most-nested = most-specific).
 *
 * Returns `null` when nothing matches. Callers that need a different selection
 * rule (e.g. reverse-iteration first-hit, no predicate at all) should iterate
 * inline; folding them through this helper buries the rule and risks breakage.
 */
export function findSmallestContainerHit(
  nodes: CanvasNode[],
  x: number,
  y: number,
  predicate: (node: CanvasNode) => boolean,
  excludeIds?: ReadonlySet<string>,
): CanvasNode | null {
  let best: CanvasNode | null = null;
  let smallestArea = Infinity;
  for (const node of nodes) {
    if (excludeIds && excludeIds.has(node.id)) continue;
    if (!predicate(node)) continue;
    if (!pointInNode(node, x, y)) continue;
    const area = node.width * node.height;
    if (area < smallestArea) {
      smallestArea = area;
      best = node;
    }
  }
  return best;
}

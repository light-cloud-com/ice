/**
 * Pure geometry helpers for resolving where an edge enters/exits a node.
 *
 * Extracted as the rf-conpath-2 leaf of the svg-connection-path
 * decomposition. Three small helpers, all pure functions of their args
 * (no React, no DOM, no canvas-feature imports beyond the path/types
 * leaf):
 *
 *   - `getEffectiveBounds(node, _lod, _zoom)` — currently a pass-through
 *     that just returns the node's `{ x, y, width, height }`. The `_lod`
 *     / `_zoom` args are intentionally underscored to mark them as
 *     "reserved for future shrink-at-low-LOD logic" without breaking the
 *     orchestrator's existing call site. Don't drop them — the
 *     orchestrator passes them and the signature is the public contract.
 *   - `chooseSides(from, to)` — picks a `(exitSide, entrySide)` pair
 *     based on the dominant axis between the two bounds' centers.
 *     **Tie-break note (cite `dominant-axis-tie-breaks-are-load-bearing-
 *     do-not-cross-port`):** uses strict `>` so equal-magnitude `|dx|` /
 *     `|dy|` ties resolve to the vertical branch (`exitSide:'bottom'` or
 *     `'top'`). The sibling helper in `connection-preview.ts` uses `>=`
 *     and resolves ties to the horizontal branch — DO NOT cross-port.
 *   - `getEdgePoint(bounds, side, portIndex, portCount)` — places the
 *     point along the named side at fractional position
 *     `(portIndex + 1) / (portCount + 1)`. The default `portIndex=0,
 *     portCount=1` puts it at the midpoint, matching the orchestrator's
 *     fallback when port disambiguation is off.
 *
 * `_lod` and `_zoom` are unused at the runtime level today; ESLint's
 * unused-args rule respects the leading underscore. Keep that convention
 * if you change the signature so the next refactorer doesn't strip them.
 */

import type { Bounds, Point, Side } from './types';
import type { CanvasNode } from '../svg-canvas';

/**
 * Returns the visual bounds of a node at the current LOD/zoom.
 *
 * Today this is a pass-through. The `_lod` and `_zoom` parameters are
 * placeholders for future per-LOD shrink/grow logic — keep them on the
 * signature so the orchestrator's call site (which passes them) doesn't
 * have to change when that logic lands.
 */
export function getEffectiveBounds(node: CanvasNode, _lod: number, _zoom: number): Bounds {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

/**
 * Chooses which side of `from` the edge exits and which side of `to` it
 * enters, based on the dominant axis between the two bounds' centers.
 *
 * Tie-break: when `|dx| === |dy|`, the strict `>` comparison falls
 * through to the vertical branch (returns `bottom`/`top`). This
 * intentionally diverges from `connection-preview.ts`'s `>=`; do not
 * cross-port.
 */
export function chooseSides(from: Bounds, to: Bounds): { exitSide: Side; entrySide: Side } {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { exitSide: 'right', entrySide: 'left' } : { exitSide: 'left', entrySide: 'right' };
  }
  return dy > 0 ? { exitSide: 'bottom', entrySide: 'top' } : { exitSide: 'top', entrySide: 'bottom' };
}

/**
 * Resolves a `Point` on the named side of `bounds`, distributed along
 * that side based on the (1-indexed) port slot. Defaulting both port
 * args produces the midpoint — the standard single-port case.
 */
export function getEdgePoint(bounds: Bounds, side: Side, portIndex = 0, portCount = 1): Point {
  const r = (portIndex + 1) / (portCount + 1);
  switch (side) {
    case 'left':
      return { x: bounds.x, y: bounds.y + bounds.height * r };
    case 'right':
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height * r };
    case 'top':
      return { x: bounds.x + bounds.width * r, y: bounds.y };
    case 'bottom':
      return { x: bounds.x + bounds.width * r, y: bounds.y + bounds.height };
  }
}

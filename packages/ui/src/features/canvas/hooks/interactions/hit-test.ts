/**
 * rf-canvint-2: Pure hit-test helpers for the canvas-interactions hook
 * group.
 *
 * The original `useCanvasInteractions` had three closures —
 * `screenToCanvas`, `isInResizeHandle`/`isInItem`, and `findItemAtPosition`
 * — that each captured a `useRef` for the live viewport / item list /
 * locked flag. Extracting them as pure functions taking primitives keeps
 * the live-by-ref behavior at the orchestrator (the orchestrator reads
 * `viewportRef.current` and `itemsRef.current` and threads the snapshot
 * into these helpers per call), and makes them testable without a
 * Provider.
 *
 * Discovered: rf-canv-3
 * `extracted-helper-must-keep-the-orchestrators-two-array-pattern` —
 * helpers that look like one-arg list scans often actually need both the
 * ref-current snapshot AND the calling-frame primitives. Here the inputs
 * are pure (rect, viewport, item-list, point) so no asymmetry, but the
 * planner brief flagged "state refs are read by ALL handlers" so the
 * orchestrator must KEEP the refs and snapshot at call time.
 */

import type { CanvasItem, CanvasViewport } from './types.js';

/**
 * Convert a screen-space (clientX, clientY) to canvas-space, given the
 * SVG element's bounding rect and the current viewport. Returns
 * `{ x: 0, y: 0 }` if the rect is null (no SVG yet) — matches the
 * verbatim early-return of the original closure when `svgRef.current`
 * is null.
 */
export function screenToCanvas(
  screenX: number,
  screenY: number,
  rect: { left: number; top: number } | null,
  viewport: CanvasViewport,
): { x: number; y: number } {
  if (!rect) return { x: 0, y: 0 };
  return {
    x: (screenX - rect.left - viewport.x) / viewport.zoom,
    y: (screenY - rect.top - viewport.y) / viewport.zoom,
  };
}

/**
 * Predicate: is the (canvasX, canvasY) point inside the bottom-right
 * resize handle of `item`? Handle size is in screen pixels but the
 * predicate operates in canvas coords, so the handle size is divided
 * by the current zoom.
 */
export function isInResizeHandle(
  item: CanvasItem,
  canvasX: number,
  canvasY: number,
  resizeHandleSize: number,
  zoom: number,
): boolean {
  const handleSize = resizeHandleSize / zoom;
  return (
    canvasX >= item.x + item.width - handleSize &&
    canvasX <= item.x + item.width &&
    canvasY >= item.y + item.height - handleSize &&
    canvasY <= item.y + item.height
  );
}

/**
 * Predicate: is the (canvasX, canvasY) point inside the item's bounding
 * box? Inclusive on all four sides — matches the verbatim original.
 */
export function isInItem(item: CanvasItem, canvasX: number, canvasY: number): boolean {
  return (
    canvasX >= item.x && canvasX <= item.x + item.width && canvasY >= item.y && canvasY <= item.y + item.height
  );
}

/**
 * Linear-scan the items in REVERSE (so top-most rendered items win) for
 * the first item whose resize handle OR bounding box contains the point.
 * Resize handle wins over body — same item, but `isResize: true` if the
 * point hit the corner handle first.
 *
 * Returns `{ item: null, isResize: false }` if no item matches.
 */
export function findItemAtPosition(
  items: CanvasItem[],
  canvasX: number,
  canvasY: number,
  resizeHandleSize: number,
  zoom: number,
): { item: CanvasItem | null; isResize: boolean } {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (isInResizeHandle(item, canvasX, canvasY, resizeHandleSize, zoom)) {
      return { item, isResize: true };
    }
    if (isInItem(item, canvasX, canvasY)) {
      return { item, isResize: false };
    }
  }
  return { item: null, isResize: false };
}

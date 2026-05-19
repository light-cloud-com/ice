/**
 * tour-3 — Pure rect helpers for the target resolver and downstream
 * overlay/popover positioning math.
 *
 * Two helpers, both side-effect-free:
 *   - `expandRect(rect, pad)` — outward padding in CSS pixels. Negative
 *     pad collapses inward (zero-min on width/height).
 *   - `clampRectToViewport(rect, viewport)` — clip negative origins,
 *     clamp width/height to viewport bounds. Useful for the overlay
 *     spotlight when the target is partially offscreen.
 *
 * Returns a DOMRect-LOOKALIKE (`{ x, y, width, height, top, right,
 * bottom, left, toJSON }`), NOT a real `DOMRect`. Constructing a real
 * DOMRect requires `globalThis.DOMRect` which isn't available under
 * vitest's default node env, and would force every consumer to ship
 * a polyfill. The lookalike covers the same readable surface; consumers
 * that need a true DOMRect can do `DOMRect.fromRect(result)` at the
 * boundary.
 */

/** DOMRect-shaped read-only view; superset for both real DOMRect and the lookalike. */
export interface RectLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Snapshot returned by both helpers — DOMRect-shaped + serializable. */
export interface SerializableRect extends RectLike {
  toJSON(): RectLike;
}

interface ViewportSize {
  width: number;
  height: number;
}

function makeRect(x: number, y: number, width: number, height: number): SerializableRect {
  // Clamp width/height to non-negative (matching DOMRectReadOnly semantics
  // when constructed from negative-input `DOMRect.fromRect({ width: -10 })`
  // → `width: -10` would persist; we deliberately diverge to keep
  // downstream `getBoundingClientRect`-like math simpler).
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const snapshot: RectLike = {
    x,
    y,
    width: w,
    height: h,
    top: y,
    right: x + w,
    bottom: y + h,
    left: x,
  };
  return {
    ...snapshot,
    toJSON: () => ({ ...snapshot }),
  };
}

/**
 * Expand a rect outward by `pad` on every side. Negative pad collapses
 * inward; zero pad returns a fresh snapshot (caller can mutate without
 * touching the input). Width/height are clamped at 0 — a -100 pad on a
 * 50px-wide rect doesn't go to negative width.
 */
export function expandRect(rect: RectLike, pad: number): SerializableRect {
  const x = rect.x - pad;
  const y = rect.y - pad;
  const width = rect.width + pad * 2;
  const height = rect.height + pad * 2;
  return makeRect(x, y, width, height);
}

/**
 * Clip a rect to lie within `[0, viewport.width] × [0, viewport.height]`.
 * Negative origins are pulled to zero (and the corresponding side's
 * extent is reduced). Width/height that exceed the viewport are clamped.
 * Fully-offscreen rects collapse to zero-area at the nearest edge.
 */
export function clampRectToViewport(rect: RectLike, viewport: ViewportSize): SerializableRect {
  // Compute the clipped left/top first — the right/bottom edges shift
  // accordingly to avoid producing a rect that extends past its
  // pre-clip far edge.
  const left = Math.max(0, Math.min(rect.x, viewport.width));
  const top = Math.max(0, Math.min(rect.y, viewport.height));

  // Right/bottom of the input clamped to viewport bounds. If the rect
  // was entirely off the negative side, right/bottom may end up below
  // left/top — `makeRect`'s width clamp folds that to zero.
  const right = Math.max(0, Math.min(rect.x + rect.width, viewport.width));
  const bottom = Math.max(0, Math.min(rect.y + rect.height, viewport.height));

  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return makeRect(left, top, width, height);
}

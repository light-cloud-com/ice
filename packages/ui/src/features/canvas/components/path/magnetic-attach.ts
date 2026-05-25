/**
 * Magnetic perimeter attach.
 *
 * Given a node's bounds and a "preferred" side (the visible socket's
 * default anchor), pick the actual perimeter attach point for a wire
 * heading to (or from) a target. The attach migrates around the
 * perimeter to the side facing the target, then slides along that side
 * to the closest projection of the target's center — clamped to a
 * margin inside the corners so wires never collide with the block's
 * rounded edges.
 *
 * This is what makes wires read like geometry nodes: typed sockets live
 * on the L/R sides by default, but the actual wire endpoint takes the
 * shortest visual path. Pair with `getAnchorPoint` (idle drag-start dot
 * at the socket's declared side) — the two diverge whenever the
 * partner is in a half-plane other than the one the anchor side faces.
 *
 * Diverges intentionally from `bounds-and-sides.chooseSides` only in
 * what it returns: `chooseSides` is bounds-to-bounds, this is
 * bounds-to-arbitrary-point and includes the slid attach point. The
 * tie-break (strict `>`) is identical so the two helpers agree on
 * dominant-axis classification — DO NOT cross-port from
 * `connection-preview.ts` which uses `>=`.
 */

import type { Bounds, Point, Side } from './types';

/** Pixels reserved at each end of a side so wires don't collide with the corner radius. */
export const DEFAULT_PERIMETER_MARGIN = 12;

export interface MagneticAttachResult {
  /** Where the wire actually attaches to the node perimeter. */
  attach: Point;
  /** Which side of the node the wire exits/enters. */
  side: Side;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Picks the side of `bounds` facing `targetCenter`, then slides the
 * attach point along that side to the nearest projection of the target.
 *
 * `preferredSide` biases the choice: when the target is in the
 * half-plane on the preferred side (or on the axis perpendicular to
 * it), the attach stays on the preferred side. Otherwise it migrates
 * to whichever side faces the target. This gives smooth behavior —
 * sockets stay where the schema put them most of the time, but step
 * around the perimeter to keep wires short when geometry demands it.
 */
export function getMagneticAttach(
  bounds: Bounds,
  preferredSide: Side,
  targetCenter: Point,
  margin = DEFAULT_PERIMETER_MARGIN,
): MagneticAttachResult {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const dx = targetCenter.x - cx;
  const dy = targetCenter.y - cy;

  const facing: Side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';

  // Honor `preferredSide` when geometry doesn't strongly disagree —
  // i.e. only override the preference when the target is in the
  // opposite half-plane. Sliding within the preferred side handles
  // small angle differences; only large ones flip to the facing side.
  const opposite: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
  const side: Side = facing === opposite[preferredSide] ? facing : preferredSide;

  return { attach: slideAlong(bounds, side, targetCenter, margin), side };
}

/** Where on `side` is the closest point to `targetCenter`, clamped to a corner margin. */
export function slideAlong(bounds: Bounds, side: Side, targetCenter: Point, margin = DEFAULT_PERIMETER_MARGIN): Point {
  switch (side) {
    case 'left':
      return {
        x: bounds.x,
        y: clamp(targetCenter.y, bounds.y + margin, bounds.y + bounds.height - margin),
      };
    case 'right':
      return {
        x: bounds.x + bounds.width,
        y: clamp(targetCenter.y, bounds.y + margin, bounds.y + bounds.height - margin),
      };
    case 'top':
      return {
        x: clamp(targetCenter.x, bounds.x + margin, bounds.x + bounds.width - margin),
        y: bounds.y,
      };
    case 'bottom':
      return {
        x: clamp(targetCenter.x, bounds.x + margin, bounds.x + bounds.width - margin),
        y: bounds.y + bounds.height,
      };
  }
}

/** Resolves the visible idle dot point at the side's midpoint — drag-start affordance. */
export function getAnchorPoint(bounds: Bounds, side: Side): Point {
  switch (side) {
    case 'left':
      return { x: bounds.x, y: bounds.y + bounds.height / 2 };
    case 'right':
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
    case 'top':
      return { x: bounds.x + bounds.width / 2, y: bounds.y };
    case 'bottom':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
  }
}

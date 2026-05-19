/**
 * Bezier path builder — the default edge style for the canvas.
 *
 * Extracted as the rf-conpath-3 leaf of the svg-connection-path
 * decomposition. Two pure functions, no React / DOM:
 *
 *   - `buildBezierPath(start, end, exitSide, entrySide)` — emits a
 *     cubic-bezier `d` attribute (`M x y C cp1x cp1y, cp2x cp2y, ex
 *     ey`) plus the cubic's midpoint at `t=0.5` (computed in closed
 *     form: 0.125 * P0 + 0.375 * cp1 + 0.375 * cp2 + 0.125 * P3).
 *   - `getControlPoint(point, side, offset)` — places a control point
 *     `offset` units away from `point` on the named side. File-private:
 *     only `buildBezierPath` calls it; not exported because no other
 *     module needs the inverse-side offset math.
 *
 * **String format is load-bearing**: the path-`d` attribute is rendered
 * directly into SVG. The exact `M ${x} ${y} C ${x} ${y}, ${x} ${y},
 * ${x} ${y}` form (single spaces, comma after each control pair, no
 * leading/trailing whitespace) is preserved byte-for-byte from the
 * original `svg-connection-path.tsx` so visual snapshots and
 * regression tests around the SVG output don't diverge.
 *
 * Offset is clamped to `[40, 200]` of `0.35 * dist` — short edges still
 * curve enough to read as bezier; long edges don't bulge to absurdity.
 */

import type { PathResult, Point, Side } from '../types';

/**
 * Builds a cubic bezier between `start` and `end`, with control points
 * shot perpendicular from each endpoint along the named side.
 */
export function buildBezierPath(start: Point, end: Point, exitSide: Side, entrySide: Side): PathResult {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(Math.max(dist * 0.35, 40), 200);

  const cp1 = getControlPoint(start, exitSide, offset);
  const cp2 = getControlPoint(end, entrySide, offset);

  const pathD = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;

  const midX = 0.125 * start.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * end.x;
  const midY = 0.125 * start.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * end.y;

  return { pathD, midX, midY };
}

/**
 * Pushes the control point `offset` units away from `point` perpendicular
 * to the named side. File-private — only `buildBezierPath` uses it.
 */
function getControlPoint(point: Point, side: Side, offset: number): Point {
  switch (side) {
    case 'left':
      return { x: point.x - offset, y: point.y };
    case 'right':
      return { x: point.x + offset, y: point.y };
    case 'top':
      return { x: point.x, y: point.y - offset };
    case 'bottom':
      return { x: point.x, y: point.y + offset };
  }
}

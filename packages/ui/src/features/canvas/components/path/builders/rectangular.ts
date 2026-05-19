/**
 * Rectangular path builder — emitted when the user picks the
 * `'rectangular'` edge style AND no dagre route is available (or the
 * route was too short to follow). The orchestrator's dispatch falls
 * through here when `buildDagreRoutedPath(routePoints, ...)` returns
 * `null`.
 *
 * Extracted as the rf-conpath-6 leaf of the svg-connection-path
 * decomposition. Single pure function, no React / DOM:
 *
 *   - Synthesizes 4 waypoints (start + 2 turn points + end) based on
 *     the exit/entry side combination:
 *       * right↔left or left↔right → vertical-then-horizontal-then-
 *         vertical bend at the horizontal midpoint of the two
 *         endpoints (`midX`).
 *       * bottom↔top or top↔bottom → mirror, vertical midpoint
 *         (`midY`).
 *       * mixed (right/left + top/bottom): elbow with `GAP=20` units
 *         offset from the source side, then turn into the target.
 *       * fallback (top/bottom + right/left): uses `GAP=20` on the
 *         source's exit side (vertical), then turns into the target.
 *   - Emits the same rounded-corner polyline as the dagre-routed
 *     builder (corner radius `R = 8`; `L (before) Q (corner) (after)`
 *     triples, falling through to plain `L cur` when a corner is too
 *     short for chamfering).
 *   - Midpoint is `points[Math.floor(points.length / 2)]` — the
 *     waypoint at the floor of the array's halfway index.
 *
 * **String format is load-bearing**: bytes match the original
 * `svg-connection-path.tsx` source verbatim.
 */

import type { PathResult, Point, Side } from '../types';

const GAP = 20; // offset before first turn for mixed-axis dispatches
const R = 8; // corner radius for rounded elbows

/**
 * Builds a rectangular polyline between two endpoints based on which
 * sides of the source/target nodes the edge enters/exits. The waypoint
 * shape depends on the side combination — same horizontal axis,
 * same vertical axis, or mixed.
 */
export function buildRectangularPath(start: Point, end: Point, exitSide: Side, entrySide: Side): PathResult {
  const points: Point[] = [start];

  // Build orthogonal waypoints based on exit/entry sides.
  if ((exitSide === 'right' && entrySide === 'left') || (exitSide === 'left' && entrySide === 'right')) {
    const midX = (start.x + end.x) / 2;
    points.push({ x: midX, y: start.y }, { x: midX, y: end.y });
  } else if ((exitSide === 'bottom' && entrySide === 'top') || (exitSide === 'top' && entrySide === 'bottom')) {
    const midY = (start.y + end.y) / 2;
    points.push({ x: start.x, y: midY }, { x: end.x, y: midY });
  } else if ((exitSide === 'right' || exitSide === 'left') && (entrySide === 'top' || entrySide === 'bottom')) {
    const outX = exitSide === 'right' ? start.x + GAP : start.x - GAP;
    points.push({ x: outX, y: start.y }, { x: outX, y: end.y });
  } else {
    const outY = exitSide === 'bottom' ? start.y + GAP : start.y - GAP;
    points.push({ x: start.x, y: outY }, { x: end.x, y: outY });
  }
  points.push(end);

  // Build rounded-corner polyline using small arc segments.
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const dxIn = cur.x - prev.x,
      dyIn = cur.y - prev.y;
    const dxOut = next.x - cur.x,
      dyOut = next.y - cur.y;
    const lenIn = Math.sqrt(dxIn * dxIn + dyIn * dyIn);
    const lenOut = Math.sqrt(dxOut * dxOut + dyOut * dyOut);
    const r = Math.min(R, lenIn / 2, lenOut / 2);
    if (r < 1 || lenIn < 1 || lenOut < 1) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const beforeX = cur.x - (dxIn / lenIn) * r;
    const beforeY = cur.y - (dyIn / lenIn) * r;
    const afterX = cur.x + (dxOut / lenOut) * r;
    const afterY = cur.y + (dyOut / lenOut) * r;
    d += ` L ${beforeX} ${beforeY} Q ${cur.x} ${cur.y} ${afterX} ${afterY}`;
  }
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;

  const mid = points[Math.floor(points.length / 2)];
  return { pathD: d, midX: mid.x, midY: mid.y };
}

/**
 * Dagre-routed path builder — emits a rounded-corner polyline that
 * follows the waypoints dagre laid down on an edge during auto-layout.
 *
 * Extracted as the rf-conpath-5 leaf of the svg-connection-path
 * decomposition. Single pure function, no React / DOM. The orchestrator
 * dispatches to this builder ONLY for the rectangular edge style AND
 * only when `connection.data.routePoints` carries a dagre route with
 * 3+ points; the shorter-than-3 case falls back to the plain
 * rectangular path builder (rf-conpath-6).
 *
 *   - Replaces dagre's first/last waypoint (which sit at node centers)
 *     with the actual port-adjusted `start` / `end` so port
 *     disambiguation still works.
 *   - Orthogonalizes each segment: if a segment is diagonal (both
 *     `|dx| > 0.5` AND `|dy| > 0.5`), an elbow point is inserted at
 *     `(cur.x, prev.y)` so the polyline reads as horizontal/vertical
 *     legs only.
 *   - Collapses near-duplicate points (within 0.5 px on each axis) that
 *     the elbow insertion can introduce.
 *   - Returns `null` when the cleaned point list has fewer than 2
 *     points — the orchestrator falls through to the rectangular
 *     builder in that case.
 *   - Otherwise emits an `M ... L ... Q cx cy ax ay ... L end` SVG
 *     path with corner radius `R = 8`. Each interior corner becomes a
 *     `L (before-corner) Q (corner) (after-corner)` triple; corners
 *     too short for an 8-unit chamfer collapse to a plain `L cur`.
 *
 * **String format is load-bearing**: bytes match the source verbatim.
 * The midpoint is `pts[Math.floor(pts.length / 2)]` — the waypoint at
 * the floor of the array's halfway index, NOT the geometric arc
 * midpoint. The orchestrator uses it to anchor the edge label and
 * bundle badge, and the simple "pick the middle waypoint" heuristic
 * has been good enough in practice.
 */

import type { PathResult, Point } from '../types';

const R = 8; // corner radius for rounded elbows

/**
 * Returns a rounded-corner polyline through `waypoints` (orthogonalized
 * with dagre's first/last replaced by `start` / `end`), or `null` when
 * the cleaned point list isn't long enough to bother routing.
 */
export function buildDagreRoutedPath(waypoints: Point[], start: Point, end: Point): PathResult | null {
  if (!waypoints || waypoints.length < 3) return null;

  const middle = waypoints.slice(1, -1);
  const raw: Point[] = [start, ...middle, end];

  // Orthogonalize: insert an elbow point wherever a segment is diagonal.
  const ortho: Point[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const prev = ortho[ortho.length - 1];
    const cur = raw[i];
    if (Math.abs(prev.x - cur.x) > 0.5 && Math.abs(prev.y - cur.y) > 0.5) {
      ortho.push({ x: cur.x, y: prev.y });
    }
    ortho.push(cur);
  }

  // Collapse any duplicate points caused by the elbow insertion.
  const pts = ortho.filter(
    (p, i) => i === 0 || Math.abs(p.x - ortho[i - 1].x) > 0.5 || Math.abs(p.y - ortho[i - 1].y) > 0.5,
  );
  if (pts.length < 2) return null;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const dxIn = cur.x - prev.x;
    const dyIn = cur.y - prev.y;
    const dxOut = next.x - cur.x;
    const dyOut = next.y - cur.y;
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
  d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;

  const mid = pts[Math.floor(pts.length / 2)];
  return { pathD: d, midX: mid.x, midY: mid.y };
}

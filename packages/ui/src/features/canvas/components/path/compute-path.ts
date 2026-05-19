/**
 * Top-level path-builder dispatcher: turns a (connection, from-node,
 * to-node, port slot, edge style, lod/zoom) bundle into the
 * `{ pathD, midX, midY }` triple the orchestrator hands to its `<path>`.
 *
 * Extracted as the rf-conpath-7 (orchestrator slim-down) helper of the
 * svg-connection-path decomposition. The orchestrator's `useMemo` body
 * was a ~70-LOC pure function over its arguments (no DOM, no React
 * state) and lifted cleanly. Pulling it out gives the orchestrator one
 * import in place of an inline branch tree, and exposes the dispatch
 * to fixture-style tests without rendering the React tree.
 *
 * Dispatch order (preserved verbatim from the original orchestrator):
 *   1. If either node is missing, return `null` (orchestrator renders
 *      nothing).
 *   2. Determine `(exitSide, entrySide, start)`:
 *      a. Special case: `Network.CustomDomain` source AND the edge
 *         carries a `routeId` AND the source has a matching route in
 *         `data.routes` → anchor the start point to the row's port-Y
 *         (computed via `getCustomDomainRoutePortY`), force exit side
 *         to `'right'`, pick entry side relative to where the start
 *         point sits (NOT the source's bounds midpoint, so the curve
 *         doesn't loop back if the target is above/below the row).
 *      b. The "route was deleted but the edge still references it"
 *         fallback path runs `chooseSides(effFrom, effTo)` like the
 *         general case.
 *      c. General case: `chooseSides(effFrom, effTo)` + a
 *         `getEdgePoint`-based start computed from the source's port
 *         index/count.
 *   3. Compute `end = getEdgePoint(effTo, entrySide, ...)`.
 *   4. Dispatch on `edgeStyle`:
 *      - `'straight'` → `buildStraightPath`.
 *      - `'rectangular'` → if `connection.data.routePoints` has 3+
 *        points, try `buildDagreRoutedPath`; if that returns null,
 *        fall back to `buildRectangularPath`.
 *      - default (`'bezier'`) → `buildBezierPath`.
 *
 * The CustomDomain-row tie-break uses strict `>` for the
 * `Math.abs(dx) > Math.abs(dy)` axis pick, mirroring `chooseSides`'s
 * tie-break (vertical wins on equal-magnitude). DO NOT cross-port
 * with `connection-preview.ts`'s `>=` — see the dominant-axis-tie-
 * breaks-are-load-bearing-do-not-cross-port learning.
 */

import { chooseSides, getEdgePoint, getEffectiveBounds } from './bounds-and-sides';
import { getCustomDomainRoutePortY } from '../nodes/custom-domain';
import { buildBezierPath } from './builders/bezier';
import { buildDagreRoutedPath } from './builders/dagre-routed';
import { buildRectangularPath } from './builders/rectangular';
import { buildStraightPath } from './builders/straight';
import type { PathResult, Point, Side } from './types';
import type { EdgeStyle } from '../../../../store/slices/ui-slice';
import type { CanvasConnection, CanvasNode } from '../svg-canvas';

export interface ComputePathArgs {
  connection: CanvasConnection;
  fromNode: CanvasNode | undefined;
  toNode: CanvasNode | undefined;
  sourcePortIndex: number;
  sourcePortCount: number;
  targetPortIndex: number;
  targetPortCount: number;
  edgeStyle: EdgeStyle;
  lod: number;
  zoom: number;
}

/**
 * Picks the right path builder, runs it, and returns its result. See
 * the module-level JSDoc for the full dispatch table.
 */
export function computePath(args: ComputePathArgs): PathResult | null {
  const {
    connection,
    fromNode,
    toNode,
    sourcePortIndex,
    sourcePortCount,
    targetPortIndex,
    targetPortCount,
    edgeStyle,
    lod,
    zoom,
  } = args;

  if (!fromNode || !toNode) return null;
  const effFrom = getEffectiveBounds(fromNode, lod, zoom);
  const effTo = getEffectiveBounds(toNode, lod, zoom);

  const fromIce = (fromNode.data?.iceType as string) || '';
  const routeId = (connection.data as { routeId?: string } | undefined)?.routeId;
  // Network.CustomDomain exposes per-row connection ports that the path
  // should anchor to EXACTLY (not at the generic right-side midpoint).
  // Works for standalone and nested-inside-PrivateNetwork usage alike —
  // the CD's routes are always on its own right edge.
  const isCustomDomainSource = fromIce === 'Network.CustomDomain' && !!routeId;
  const isRowSource = isCustomDomainSource;

  let exitSide: Side;
  let entrySide: Side;
  let start: Point;

  if (isRowSource) {
    const routes = (fromNode.data?.routes as Array<{ id: string; subdomain: string }> | undefined) || [];
    const rowIndex = routes.findIndex((r) => r.id === routeId);
    if (rowIndex >= 0) {
      exitSide = 'right';
      start = {
        x: effFrom.x + effFrom.width,
        y: effFrom.y + getCustomDomainRoutePortY(rowIndex),
      };
      // Entry side picked relative to where the start point sits, not
      // the source bounds midpoint, so the curve doesn't loop back if
      // the target is above/below the row.
      const dx = effTo.x + effTo.width / 2 - start.x;
      const dy = effTo.y + effTo.height / 2 - start.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        entrySide = dx > 0 ? 'left' : 'right';
      } else {
        entrySide = dy > 0 ? 'top' : 'bottom';
      }
    } else {
      // Route was deleted but the edge still references it — fall back
      // to the generic side selection.
      const sides = chooseSides(effFrom, effTo);
      exitSide = sides.exitSide;
      entrySide = sides.entrySide;
      start = getEdgePoint(effFrom, exitSide, sourcePortIndex, sourcePortCount);
    }
  } else {
    const sides = chooseSides(effFrom, effTo);
    exitSide = sides.exitSide;
    entrySide = sides.entrySide;
    start = getEdgePoint(effFrom, exitSide, sourcePortIndex, sourcePortCount);
  }

  const end = getEdgePoint(effTo, entrySide, targetPortIndex, targetPortCount);
  if (edgeStyle === 'straight') return buildStraightPath(start, end);
  if (edgeStyle === 'rectangular') {
    // If auto-layout left us a routed polyline on this edge, follow
    // it — dagre already bent the path around obstacles. Fall back to
    // a plain L when the route is absent or too short.
    const routePoints = (connection.data as { routePoints?: Point[] } | undefined)?.routePoints;
    if (routePoints && routePoints.length >= 3) {
      const routed = buildDagreRoutedPath(routePoints, start, end);
      if (routed) return routed;
    }
    return buildRectangularPath(start, end, exitSide, entrySide);
  }
  return buildBezierPath(start, end, exitSide, entrySide);
}

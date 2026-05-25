/**
 * Top-level path-builder dispatcher: turns a (connection, from-node,
 * to-node, edge style, lod/zoom) bundle into the `{ pathD, midX, midY,
 * start, end, exitSide, entrySide }` result the orchestrator hands to
 * its `<path>`.
 *
 * Unified resolution model (post-`socket-position`):
 *
 *   1. Resolve both endpoints' `PortDef` from `edge.data.sourceSocket`
 *      / `targetSocket`. If either is missing, fill in via
 *      `inferEdgePorts` so legacy edges still anchor to the right
 *      typed dots without a data migration.
 *   2. Look up each end's canvas-space position via
 *      `getSocketCanvasPosition` — the SINGLE function the canvas uses
 *      to know "where does this socket dot live?" Custom Domain row
 *      ports, standard typed-socket distribution, and any future
 *      bespoke renderer all route through it.
 *   3. Fall back to chooseSides + magnetic-attach only when neither end
 *      has a socket id AND inference produced no port.
 *   4. Dispatch on `edgeStyle` (bezier / straight / rectangular) and
 *      enrich the result with the resolved start/end/sides.
 *
 * Why one path instead of three: the canvas had distinct branches for
 * the CustomDomain row case, the typed-socket case, and the legacy
 * case, each with its own end-Y math. They disagreed in subtle ways —
 * e.g. CustomDomain-row pinned the source Y but used the side midpoint
 * for the target, so wires "landed at the wrong socket" on multi-port
 * blocks. Funnel everything through `getSocketCanvasPosition` and the
 * wires and the dots agree by construction.
 */

import { findPort, getPortsForNode, inferEdgePorts, type PortDef } from '@ice/types';
import { chooseSides, getEdgePoint, getEffectiveBounds } from './bounds-and-sides';
import { buildBezierPath } from './builders/bezier';
import { buildDagreRoutedPath } from './builders/dagre-routed';
import { buildRectangularPath } from './builders/rectangular';
import { buildStraightPath } from './builders/straight';
import { getMagneticAttach } from './magnetic-attach';
import { getSocketCanvasPosition } from './socket-position';
import type { PathResult, Point, Side } from './types';
import type { EdgeStyle } from '../../../../store/slices/ui-slice';
import type { CanvasConnection, CanvasNode } from '../svg-canvas';
import type { ConnectionCategory } from '@ice/constants';

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

  // ── Resolve socket endpoints ───────────────────────────────────────
  //
  // When the edge carries socket ids, fetch each end's PortDef so we
  // know its declared anchor side. For pre-port-aware edges, infer the
  // best pair from the schemas + category — purely visual, the storage
  // stays untouched until the user explicitly locks in.
  const edgeData = (connection.data ?? {}) as {
    sourceSocket?: string;
    targetSocket?: string;
    connectionCategory?: ConnectionCategory;
  };
  let sourceSocket: PortDef | undefined = edgeData.sourceSocket ? findPort(fromNode, edgeData.sourceSocket) : undefined;
  let targetSocket: PortDef | undefined = edgeData.targetSocket ? findPort(toNode, edgeData.targetSocket) : undefined;
  if (!sourceSocket || !targetSocket) {
    const inferred = inferEdgePorts(
      sourceSocket ? [sourceSocket] : getPortsForNode(fromNode),
      targetSocket ? [targetSocket] : getPortsForNode(toNode),
      edgeData.connectionCategory ?? null,
    );
    if (!sourceSocket) sourceSocket = inferred.sourcePort;
    if (!targetSocket) targetSocket = inferred.targetPort;
  }

  // ── Position each end via the unified socket-position helper ───────
  let exitSide: Side;
  let entrySide: Side;
  let start: Point;
  let end: Point;

  const sourcePos = sourceSocket ? getSocketCanvasPosition(fromNode, sourceSocket.id) : null;
  const targetPos = targetSocket ? getSocketCanvasPosition(toNode, targetSocket.id) : null;

  if (sourcePos && sourceSocket) {
    start = sourcePos;
    exitSide = sourceSocket.side;
  } else if (sourceSocket) {
    // Schema knew the side but the position lookup failed (rare —
    // e.g. dangling port). Use the side midpoint as a safe fallback.
    exitSide = sourceSocket.side;
    start = getEdgePoint(effFrom, exitSide, sourcePortIndex, sourcePortCount);
  } else {
    // Fully untyped edge — chooseSides + magnetic-attach for the
    // legacy "anonymous wire" feel.
    const sides = chooseSides(effFrom, effTo);
    exitSide = sides.exitSide;
    const toCenter: Point = { x: effTo.x + effTo.width / 2, y: effTo.y + effTo.height / 2 };
    start = getMagneticAttach(effFrom, exitSide, toCenter).attach;
  }

  if (targetPos && targetSocket) {
    end = targetPos;
    entrySide = targetSocket.side;
  } else if (targetSocket) {
    entrySide = targetSocket.side;
    end = getEdgePoint(effTo, entrySide, targetPortIndex, targetPortCount);
  } else {
    const sides = chooseSides(effFrom, effTo);
    entrySide = sides.entrySide;
    const fromCenter: Point = { x: effFrom.x + effFrom.width / 2, y: effFrom.y + effFrom.height / 2 };
    end = getMagneticAttach(effTo, entrySide, fromCenter).attach;
  }

  const enrich = (r: PathResult): PathResult => ({ ...r, start, end, exitSide, entrySide });

  if (edgeStyle === 'straight') return enrich(buildStraightPath(start, end));
  if (edgeStyle === 'rectangular') {
    const routePoints = (connection.data as { routePoints?: Point[] } | undefined)?.routePoints;
    if (routePoints && routePoints.length >= 3) {
      const routed = buildDagreRoutedPath(routePoints, start, end);
      if (routed) return enrich(routed);
    }
    return enrich(buildRectangularPath(start, end, exitSide, entrySide));
  }
  return enrich(buildBezierPath(start, end, exitSide, entrySide));
}

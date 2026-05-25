/**
 * Port position math — shared by the canvas renderer and the connection-
 * drawing hook so both agree where a port dot sits in canvas space.
 *
 * Ports are distributed evenly along their declared side (left / right /
 * top / bottom). Distributing within a side means side-N is the N-th of
 * all ports on that same side, in declaration order. This matches the
 * `TypedSockets` SVG layout and keeps the snap-target math honest.
 */

import type { PortDef } from './types';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Returns the (x, y) canvas-space coordinate of `port` on a node with
 * the given `bounds`, accounting for sibling ports on the same side.
 *
 * `allPorts` is the full port list from `getPortsForNode(node)`. The
 * helper finds the port's side group and computes its slot index.
 */
export function getPortAnchorPoint(bounds: Bounds, port: PortDef, allPorts: PortDef[]): Point {
  const sideGroup = allPorts.filter((p) => p.side === port.side);
  const idx = sideGroup.findIndex((p) => p.id === port.id);
  const count = sideGroup.length;
  const safeIdx = idx >= 0 ? idx : 0;
  const r = (safeIdx + 1) / (count + 1);
  const { x, y, width: w, height: h } = bounds;
  switch (port.side) {
    case 'top':
      return { x: x + w * r, y };
    case 'right':
      return { x: x + w, y: y + h * r };
    case 'bottom':
      return { x: x + w * r, y: y + h };
    case 'left':
    default:
      return { x, y: y + h * r };
  }
}

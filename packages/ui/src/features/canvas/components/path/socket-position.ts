/**
 * Socket position — the single source of truth for where a socket dot
 * lives in canvas space.
 *
 * Both `compute-path` (drawing the persistent edge) AND any renderer
 * that places socket dots MUST go through this function so the wire
 * endpoints and the visible dots agree pixel-for-pixel. Otherwise
 * you get the "wire ends at a different socket than the one the user
 * wired" bug — silently visually misleading.
 *
 * Position resolution is layered:
 *   1. **Bespoke per-iceType resolvers** registered in
 *      `BESPOKE_SOCKET_POSITIONS`. Each entry returns a `Point` or
 *      `null` (signalling "not my socket, fall through"). Cardinal
 *      rule: dispatch reads the table generically — NO `if (iceType
 *      === 'X')` branches in this resolver. New bespoke layouts are
 *      added by registering an entry.
 *   2. **Standard schema-driven layout** via `getPortAnchorPoint` —
 *      evenly distributes ports along their declared side, in
 *      declaration order. Covers every block that uses
 *      `<TypedSockets>` for its sockets.
 */

import { getPortAnchorPoint, getPortsForNode, type PortDef } from '@ice/types';
import { getCustomDomainRoutePortY } from '../nodes/custom-domain';
import type { CanvasNode } from '../types';
import type { Point } from './types';

/**
 * Resolver contract for a bespoke socket-position table entry.
 * Returns `null` when the socket id doesn't match this resolver's
 * domain (the dispatcher then falls through to the standard layout).
 */
export type BespokeSocketResolver = (node: CanvasNode, socketId: string) => Point | null;

/**
 * Schema-shaped table of bespoke socket layouts. Dispatch iterates
 * this generically — no iceType-specific branches in the resolver
 * function. New bespoke renderers (e.g. a future multi-row block)
 * register here; the dispatcher stays untouched.
 */
export const BESPOKE_SOCKET_POSITIONS: Record<string, BespokeSocketResolver> = {
  // Network.CustomDomain — per-route right-edge ports. The bespoke
  // renderer (`SvgCustomDomainNode`) places one dot per route at a
  // hand-computed Y via `getCustomDomainRoutePortY`; resolve back to
  // the same Y so the wire and the dot share coordinates.
  'Network.CustomDomain': (node, socketId) => {
    if (!socketId.startsWith('domain-out-')) return null;
    const routeId = socketId.slice('domain-out-'.length);
    const routes = (node.data?.routes as Array<{ id: string }> | undefined) ?? [];
    const rowIndex = routes.findIndex((r) => r.id === routeId);
    if (rowIndex < 0) return null;
    return { x: node.x + node.width, y: node.y + getCustomDomainRoutePortY(rowIndex) };
  },
};

/**
 * Returns the canvas-space center of a specific socket on `node`.
 * Returns `null` when the socket id doesn't resolve to a known port
 * (e.g. dangling edge from a removed port — the caller falls back to
 * a perimeter midpoint).
 */
export function getSocketCanvasPosition(node: CanvasNode, socketId: string): Point | null {
  const iceType = (node.data?.iceType as string) || '';

  // ── Bespoke resolvers — generic dispatch via the schema-shaped table.
  const bespoke = BESPOKE_SOCKET_POSITIONS[iceType];
  if (bespoke) {
    const point = bespoke(node, socketId);
    if (point) return point;
  }

  // ── Standard typed-socket layout ─────────────────────────────────
  const ports = getPortsForNode({ id: node.id, type: node.type, data: node.data });
  const port = ports.find((p) => p.id === socketId);
  if (!port) return null;
  return getPortAnchorPoint({ x: node.x, y: node.y, width: node.width, height: node.height }, port, ports);
}

/**
 * Convenience — find the port shape from a node's schema. Used by
 * compute-path to know each endpoint's anchor side without having to
 * call `findPort` separately.
 */
export function findPortOnNode(node: CanvasNode, socketId: string): PortDef | undefined {
  const ports = getPortsForNode({ id: node.id, type: node.type, data: node.data });
  return ports.find((p) => p.id === socketId);
}

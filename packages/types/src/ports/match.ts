/**
 * Port matching — does this OUT port accept that IN port (or vice versa)?
 *
 * Identity by default: same role + opposite direction. The `any` role
 * is the reroute escape hatch — it accepts everything and is accepted
 * by everything, so wires can flow through a Reroute node without
 * the role check rejecting them.
 *
 * No cross-role aliases beyond `any`. Keep the model boring so users
 * can predict it: a `repository` out connects to a `repository` in,
 * never to a `database` in.
 */

import type { PeerKind, PortDef, PortRole } from './types';

/**
 * Returns true if a wire can be drawn between these two ports.
 *
 * Three gates, in order:
 *   1. Opposite directions (out↔in).
 *   2. Roles compatible (identity match, or either side is `any`).
 *   3. Optional peer-kind cross-check — if `a.peerKind` is set and the
 *      caller passes the partner's block kind, the partner must be of
 *      that kind. This is what stops two Backends from accidentally
 *      wiring up via `queue-out` ↔ `queue-in` (both endpoints are
 *      `service` kind; both ports declare `peerKind: 'queue'`).
 *
 * Callers without iceType context (e.g. drag start before a target
 * exists) can omit the kind args — the peer-kind gate then short-
 * circuits to true and the model degrades to role-only matching,
 * matching the prior contract.
 */
export function canPortsConnect(a: PortDef, b: PortDef, aPeerKind?: PeerKind, bPeerKind?: PeerKind): boolean {
  if (a.direction === b.direction) return false;
  if (!rolesCompatible(a.role, b.role)) return false;
  if (!peerKindAccepts(a.peerKind, bPeerKind)) return false;
  if (!peerKindAccepts(b.peerKind, aPeerKind)) return false;
  return true;
}

/**
 * Checks one side of the peer-kind constraint: a port declaring
 * `expected` must see a partner of that kind. `'any'` on either side
 * is the wildcard. Reroute nodes are universally compatible too.
 */
function peerKindAccepts(expected: PeerKind | undefined, actual: PeerKind | undefined): boolean {
  if (!expected || expected === 'any') return true;
  if (!actual) return true; // caller didn't provide context — degrade to permissive
  if (actual === 'any' || actual === 'reroute' || expected === 'reroute') return true;
  return expected === actual;
}

/** Compatibility check on roles alone — used when only role info is known. */
export function rolesCompatible(a: PortRole, b: PortRole): boolean {
  if (a === 'any' || b === 'any') return true;
  return a === b;
}

/**
 * Given a source port and a target node's ports, return all target
 * ports that the source could connect to. Used by the drag-target
 * highlight to decide if a node is a valid drop target at all.
 *
 * Pass `sourceKind` + `targetKind` (the iceType's `getBlockKind`
 * result) to enforce the peer-kind cross-check; omit for permissive
 * role-only matching.
 */
export function findMatchingPorts(
  source: PortDef,
  candidates: PortDef[],
  sourceKind?: PeerKind,
  targetKind?: PeerKind,
): PortDef[] {
  return candidates.filter((c) => canPortsConnect(source, c, sourceKind, targetKind));
}

/**
 * When the drop target is the *node* rather than a specific port (the
 * user dropped on the block body), pick the best target port: the
 * first IN port matching the source's role + peer-kind, preferring
 * exact-role over `any`-role matches.
 */
export function chooseBestTargetPort(
  source: PortDef,
  candidates: PortDef[],
  sourceKind?: PeerKind,
  targetKind?: PeerKind,
): PortDef | undefined {
  const matching = candidates.filter((c) => canPortsConnect(source, c, sourceKind, targetKind));
  if (matching.length === 0) return undefined;
  // Prefer an exact-role match over a wildcard (`any`) one — keeps
  // reroute passthroughs from outranking a real semantic match.
  return matching.find((c) => c.role === source.role) ?? matching[0];
}

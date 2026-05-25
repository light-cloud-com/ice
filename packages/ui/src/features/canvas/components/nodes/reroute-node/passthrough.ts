/**
 * Reroute color derivation.
 *
 * A reroute is a passthrough — it has no semantic category of its own.
 * We pick a color by looking at the wire(s) flowing through it: the
 * first incoming (or outgoing, if no incoming) edge donates its
 * connection category. If the reroute is disconnected, callers fall
 * back to TRAFFIC (the most common wire type) so the dot stays visible.
 */

import type { CanvasConnection } from '../../types';
import type { ConnectionCategory } from '@ice/constants';

export function findPassthroughCategory(nodeId: string, connections: CanvasConnection[]): ConnectionCategory | null {
  // Prefer an incoming edge so the color flows in the direction of data.
  const incoming = connections.find((c) => c.to === nodeId);
  const outgoing = connections.find((c) => c.from === nodeId);
  const cat = (incoming?.data?.connectionCategory ?? outgoing?.data?.connectionCategory) as
    | ConnectionCategory
    | undefined;
  return cat ?? null;
}

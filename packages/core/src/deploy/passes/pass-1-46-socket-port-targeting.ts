/**
 * Pass 1.46 — Socket-driven target-port routing.
 *
 * When an edge's `targetSocket` (or `sourceSocket`) id encodes a
 * specific listener port (e.g. `port-8080-in`, `port-8443-out`), the
 * deployer needs to know which port to wire the LB / DNS at. Without
 * this pass the deployer falls back to `data.port` (a single scalar),
 * which is what every multi-port wiring would collapse to.
 *
 * Naming convention (must match the port-schema authoring in
 * `@ice/types/ports/schemas/compute.ts`):
 *   - `port-<N>-out` — HTTP/TCP listener N exposed by the service
 *   - `port-<N>-in` — explicit "route traffic to listener N" target
 *
 * For a wire `CustomDomain.domain-out-<routeId>` → `Backend.port-8080-in`,
 * this pass writes `target_port = 8080` onto the Backend graph node.
 * Pass 1.45 (domain propagation) already wrote `domain` — together they
 * give the LB enough to bind subdomain → backend port.
 *
 * Mutates `graph` node properties in place. Lives next to
 * `pass-1-45-domain-propagation` because the two are commonly read
 * together by provider deployers.
 */

import type { MutableGraph } from '../../graph/mutable-graph';
import type { CardEdgeInput, CardNodeInput } from '../card-translator';

/** Pulls `<N>` out of `port-<N>-(in|out)` ids. Returns `null` if the id isn't a port id. */
function extract_port_from_socket_id(socketId: string | undefined): number | null {
  if (!socketId) return null;
  const match = socketId.match(/^port-(\d+)-(?:in|out)$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function propagate_socket_port_targets(
  edges: CardEdgeInput[],
  nodes: CardNodeInput[],
  card_id_to_name: Map<string, string>,
  graph: MutableGraph,
): void {
  for (const edge of edges) {
    const data = edge.data ?? {};
    const sourceSocket = (data as { sourceSocket?: string }).sourceSocket;
    const targetSocket = (data as { targetSocket?: string }).targetSocket;

    // Either end may encode the port. The TARGET-side socket is the
    // common case (e.g. CustomDomain.domain-out-r1 → Backend.port-8080-in):
    // the "8080" is on the target. But a Backend's `port-8080-out` →
    // Gateway.upstream-in also has the port on the SOURCE side, so we
    // handle both — the port goes to whichever end is the compute
    // node being routed to.
    const targetPort = extract_port_from_socket_id(targetSocket);
    const sourcePort = extract_port_from_socket_id(sourceSocket);

    if (targetPort !== null) {
      // Wire ends ON a port socket — that node's compute listener is
      // the LB target.
      writePortToNode(edge.target, targetPort, nodes, card_id_to_name, graph);
    }
    if (sourcePort !== null) {
      // Wire emanates FROM a port socket — that source's listener is
      // what the downstream block (gateway / LB / domain) routes to.
      writePortToNode(edge.source, sourcePort, nodes, card_id_to_name, graph);
    }
  }
}

function writePortToNode(
  cardNodeId: string,
  port: number,
  nodes: CardNodeInput[],
  card_id_to_name: Map<string, string>,
  graph: MutableGraph,
): void {
  const node = nodes.find((n) => n.id === cardNodeId);
  if (!node) return;
  const graphName = card_id_to_name.get(node.id);
  if (!graphName) return;
  const graphNode = graph.get_node_by_name(graphName);
  if (!graphNode) return;
  const props = graphNode.properties as Record<string, unknown>;
  // Don't clobber an explicit user-set value. The socket-encoded port
  // is a hint from the wiring; if the user manually set `port` in the
  // properties panel, that wins (consistent with Pass 1.4's "explicit
  // override always wins" rule).
  if (props.port == null || props.port === 8080) {
    props.port = port;
  }
  // Always record the LB target port — separate from the container
  // listener port — so providers that distinguish (e.g. Container App
  // ingress targetPort vs application port) can read both.
  props.target_port = port;
}

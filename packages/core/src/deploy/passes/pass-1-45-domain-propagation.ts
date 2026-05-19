/**
 * Pass 1.45 — Network.CustomDomain → target host propagation.
 *
 * Lifted verbatim from `card-translator.ts` (rf-ctrans-11). Mutates the
 * in-progress graph in place by writing a `domain` property onto each
 * compute target connected to a Network.CustomDomain block. See the
 * docstring on `propagate_custom_domain_hosts` below for the full
 * contract.
 */

import type { MutableGraph } from '../../graph/mutable-graph';
import type { CardEdgeInput, CardNodeInput } from '../card-translator';

/**
 * Pass 1.45 — Network.CustomDomain → target host propagation.
 *
 * CustomDomain blocks are UI-only — they don't compile to a deployable
 * resource. Their job is to carry a root domain plus per-edge
 * subdomains, and propagate the resulting `<subdomain>.<domain>` (or
 * bare `<domain>` for blank subdomain) onto each connected target's
 * `domain` property. The provider handlers then pick up the domain
 * from the target's properties and register it natively (Firebase
 * Hosting custom domain registration, AWS Amplify domain associations,
 * etc.).
 *
 * CustomDomain ALWAYS wins over the target block's own `domain`
 * field. Connecting a service to a CustomDomain block is a clear
 * declarative statement: "this service's hostname is governed by
 * that domain block." If the user later disconnects the edge, the
 * target block's own `domain` field becomes authoritative again.
 *
 * Subdomain resolution priority (RISK #6):
 *   1. edge.data.routeId → look up the route on the source block
 *      (the new per-row port model where each route is a slot)
 *   2. edge.data.subdomain → legacy single-subdomain edge field
 *      (kept for back-compat with edges created before routes existed)
 *   3. blank → root domain
 *
 * Mutates `graph` node properties in place; returns void.
 */
export function propagate_custom_domain_hosts(
  edges: CardEdgeInput[],
  nodes: CardNodeInput[],
  card_id_to_name: Map<string, string>,
  graph: MutableGraph,
): void {
  for (const edge of edges) {
    const src = nodes.find((n) => n.id === edge.source);
    const dst = nodes.find((n) => n.id === edge.target);
    if (!src || !dst) continue;
    const srcIce = (src.data?.iceType as string) || '';
    const dstIce = (dst.data?.iceType as string) || '';
    let domainNode: typeof src;
    let targetNode: typeof src;
    if (srcIce === 'Network.CustomDomain') {
      domainNode = src;
      targetNode = dst;
    } else if (dstIce === 'Network.CustomDomain') {
      domainNode = dst;
      targetNode = src;
    } else {
      continue;
    }
    const targetIce = (targetNode.data?.iceType as string) || '';
    if (!/^Compute\./.test(targetIce)) continue;

    const targetName = card_id_to_name.get(targetNode.id);
    if (!targetName) continue;
    const targetGraphNode = graph.get_node_by_name(targetName);
    if (!targetGraphNode) continue;

    const rootDomain = String(domainNode.data?.domain || '').trim();
    if (!rootDomain || rootDomain === 'example.com') continue;

    // Subdomain resolution priority:
    //   1. edge.data.routeId → look up the route on the source block
    //      (the new per-row port model where each route is a slot)
    //   2. edge.data.subdomain → legacy single-subdomain edge field
    //      (kept for back-compat with edges created before routes existed)
    //   3. blank → root domain
    let subdomain: string;
    const routeId = (edge.data as any)?.routeId as string | undefined;
    if (routeId) {
      const routes = (domainNode.data?.routes as Array<{ id: string; subdomain: string }> | undefined) || [];
      const route = routes.find((r) => r.id === routeId);
      subdomain = (route?.subdomain || '').trim();
    } else {
      subdomain = ((edge.data as any)?.subdomain as string | undefined)?.trim() || '';
    }
    const fullHost = subdomain ? `${subdomain}.${rootDomain}` : rootDomain;

    const targetProps = targetGraphNode.properties as Record<string, unknown>;
    targetProps.domain = fullHost;
  }
}

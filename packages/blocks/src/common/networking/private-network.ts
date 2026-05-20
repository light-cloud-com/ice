/**
 * Private Network Block
 *
 * A walled VPC bubble. Drop compute blocks inside to put them on a
 * private network. Drop a Custom Domain inside if you want a public
 * gateway — its per-route ports wire to sibling services inside the
 * network.
 *
 * ## Mental model
 *
 * "Everything inside this box is on a private network. A Custom
 * Domain inside the box is the gateway that exposes specific
 * subdomains to the public."
 *
 * ## Network policies (configured in properties panel)
 *
 * Inbound internet (ingress):
 *   - `'all'`       — public reachable (Open). External traffic can
 *                      hit a nested Custom Domain's route ports.
 *   - `'allowlist'` — Restricted. Only listed source ranges/IPs can
 *                      reach inside.
 *   - `'none'`      — Sealed. No public entry. Services inside are
 *                      reachable only by each other (east-west).
 *
 * Outbound internet (egress):
 *   - `'all'`       — services can call any public URL (default)
 *   - `'allowlist'` — only listed destinations are reachable
 *   - `'none'`      — air-gapped, no outbound traffic
 *
 * Both policies are independent — a Sealed network can still have
 * outbound access, and an Open one can still be egress-restricted.
 *
 * ## What it compiles to
 *
 *   gcp.compute.network              ← VPC
 *   gcp.compute.subnetwork           ← Subnet (children's deploy-graph
 *                                       parent points here)
 *   gcp.compute.firewall (ingress)   ← When ingress != 'all'
 *   gcp.compute.firewall (egress)    ← When egress != 'all'
 *
 * The nested Custom Domain (if present) compiles to the full LB chain
 * (forwarding rule + URL map + target proxy + backend services) on its
 * own, wiring its per-route ports to the sibling services inside the
 * parent Private Network's VPC.
 *
 * ## Why it replaces Secure Group
 *
 * The previous "Secure Group" block bundled VPC + LB + subdomain
 * routing into one frame with a left sidebar of routes. That was
 * confusing (users didn't know if it was a firewall, VPC, or gateway)
 * and the sidebar broke drop-zone hit-testing. Private Network is a
 * pure container — routing lives in a nested Custom Domain (optional),
 * which the user already understands from its standalone use.
 */

import type { BlockBlueprint } from '../../types';

export type PrivateNetworkIngress = 'all' | 'allowlist' | 'none';
export type PrivateNetworkEgress = 'all' | 'allowlist' | 'none';

export const privateNetworkBlueprint: BlockBlueprint = {
  iceType: 'Network.PrivateNetwork',
  resourceId: 'private-network',
  name: 'Private Network',
  description:
    'A walled VPC bubble. Drop compute blocks inside to keep them private. ' +
    'Inbound and outbound internet access are configured in properties.',
  icon: 'Shield',
  category: 'networking',
  providers: ['gcp', 'aws', 'azure'],
  nodeData: {
    iceType: 'Network.PrivateNetwork',
    behavior: 'container',
    label: 'Private Network',
    // Inbound internet policy. 'all' = public reachable (Open);
    // 'allowlist' = Restricted to listed sources; 'none' = Sealed.
    ingress: 'all' as PrivateNetworkIngress,
    // When ingress = 'allowlist', the source ranges/IPs allowed to
    // reach services inside. Compiler emits allow-ingress firewall
    // rules keyed on these.
    ingressAllowlist: [] as string[],
    // Outbound internet policy. 'all' = no egress firewall rules;
    // 'allowlist' = deny-all + allow entries; 'none' = air-gapped.
    egress: 'all' as PrivateNetworkEgress,
    // When egress = 'allowlist', the destinations allowed to egress
    // (hostnames or IP ranges). Compiler emits allow-egress firewall
    // rules keyed on these.
    egressAllowlist: [] as string[],
    // Visual — shield + soft red tint to signal "security boundary"
    // without overwhelming the canvas.
    groupColor: '#dc2626',
    groupOpacity: 0.08,
  },
};

/**
 * Edge / node deployability classifiers for the card-to-graph translator.
 *
 * Bundles the predicates and constants the translator uses to decide
 * which canvas nodes compile to real cloud resources, which act as
 * backends behind a Private Network override, and how raw edge
 * relationship strings resolve to typed `EdgeRelationship` values.
 */

import type { EdgeRelationship } from '../types/graph';

// iceTypes that are UI-only and should not be deployed
// Non-deployable canvas annotations. These blocks live on the canvas to
// document intent or wire source/config relationships visually but never
// compile to a cloud resource. Matches the special-case list in
// `packages/core/src/validation/deploy-rules.ts:173` and
// `packages/core/src/validation/schema-bridge.ts:71` so all three layers
// agree on what counts as a deployable node.
// Genuinely non-deployable canvas annotations. Everything else (VPC,
// Subnet, PrivateNetwork, WAF, etc.) is expected to compile to a real
// provider resource — if a deployer mapping is missing for those, fix
// the type map / handler registry rather than adding the type here.
//
// Network.PublicTraffic is the only "Network." type that lives here:
// it represents the public internet on the diagram, not a provisioned
// resource. Everything else under Network.* should map to something.
export const UI_ONLY_TYPES = new Set(['Source.Repository', 'Config.Environment', 'Network.PublicTraffic']);

/**
 * iceTypes whose compute is treated as a service backend. Shared between
 * the LB-wiring path (line ~1059) and the Private Network ingress-override
 * logic below.
 */
export const SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS = new Set([
  'Compute.Container',
  'Compute.BackendAPI',
  'Compute.SSRSite',
  'Compute.Worker',
  'Compute.ServerlessFunction',
]);

/**
 * Walk the parent chain to check whether any ancestor is a Private Network.
 *
 * When a service backend (Compute.Container / SSR / Worker / etc.) is nested
 * inside a Network.PrivateNetwork, the compiler should emit the internal-only
 * variant of the underlying compute resource:
 *   - GCP Cloud Run:      ingress = 'internal-and-cloud-load-balancing'
 *   - AWS ECS:            no public ALB; rely on nested Custom Domain for ingress
 *   - Azure Container App: internal ingress
 *
 * The nested Custom Domain (if present) acts as the sole external entry
 * point via its own LB chain — see lines 957-970 for that path.
 */
export function hasPrivateNetworkAncestor(
  node: { id: string; parentId?: string | null },
  allNodes: Array<{ id: string; parentId?: string | null; data: Record<string, unknown> }>,
): boolean {
  let currentParentId = node.parentId;
  const visited = new Set<string>();
  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = allNodes.find((n) => n.id === currentParentId);
    if (!parent) return false;
    if (parent.data?.iceType === 'Network.PrivateNetwork') return true;
    currentParentId = parent.parentId;
  }
  return false;
}

/**
 * Network.CustomDomain has two modes:
 *
 *   1. STANDALONE (no parent, or parent is not a PrivateNetwork):
 *      metadata-only — it carries a root domain + per-edge subdomains
 *      and is consumed by Pass 1.6 to propagate the full host onto
 *      each connected target's `domain` property. Firebase Hosting
 *      (et al.) then registers the custom domain via its native API.
 *      NO dedicated resource is deployed.
 *
 *   2. NESTED inside a Network.PrivateNetwork: the CD is that
 *      network's public ingress gateway. It compiles to the full LB
 *      chain (forwarding rule + URL map + backend services) targeting
 *      sibling services inside the parent VPC.
 */
export function isCustomDomainStandalone(
  node: { data: Record<string, unknown>; parentId?: string | null },
  allNodes: Array<{ id: string; data: Record<string, unknown> }>,
): boolean {
  if (node.data?.iceType !== 'Network.CustomDomain') return false;
  if (!node.parentId) return true;
  const parent = allNodes.find((n) => n.id === node.parentId);
  return parent?.data?.iceType !== 'Network.PrivateNetwork';
}

// iceTypes that are external services (not GCP-managed)
export const EXTERNAL_TYPES = new Set(['Database.MongoDB']);

export function map_edge_relationship(relationship?: string): EdgeRelationship {
  switch (relationship) {
    case 'depends_on':
      return 'depends_on';
    case 'contains':
      return 'contains';
    case 'references':
      return 'references';
    case 'connects_to':
      return 'connects_to';
    case 'talks_to':
      return 'talks_to';
    default:
      return 'connects_to';
  }
}

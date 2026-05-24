/**
 * Edge / node deployability classifiers for the card-to-graph translator.
 *
 * Bundles the predicates and constants the translator uses to decide
 * which canvas nodes compile to real cloud resources, which act as
 * backends behind a network-isolation override, and how raw edge
 * relationship strings resolve to typed `EdgeRelationship` values.
 *
 * Cardinal rule: the ancestor walk + standalone-mode predicates read
 * `BLOCK_DEPLOY_CLASSIFIERS` (a per-iceType flag table) instead of
 * naming specific iceTypes. Adding a new isolation container or a new
 * block with standalone/nested duality adds a table entry; the
 * classifier functions stay unchanged.
 */

import { getBlockDeployClassifiers } from './block-deploy-classifiers';
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
 * Walk the parent chain to check whether any ancestor is a network-
 * isolation container (today: Network.PrivateNetwork; tomorrow: any
 * iceType the schema-shaped table declares with
 * `isolatesNetworkContext: true`).
 *
 * When a service backend is nested inside one, the compiler emits the
 * internal-only variant of the underlying compute resource:
 *   - GCP Cloud Run:       ingress = 'internal-and-cloud-load-balancing'
 *   - AWS ECS:             no public ALB; rely on nested ingress block
 *   - Azure Container App: internal ingress
 */
export function hasNetworkIsolatingAncestor(
  node: { id: string; parentId?: string | null },
  allNodes: Array<{ id: string; parentId?: string | null; data: Record<string, unknown> }>,
): boolean {
  let currentParentId = node.parentId;
  const visited = new Set<string>();
  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = allNodes.find((n) => n.id === currentParentId);
    if (!parent) return false;
    const parentIceType = (parent.data?.iceType as string) || '';
    if (getBlockDeployClassifiers(parentIceType).isolatesNetworkContext) return true;
    currentParentId = parent.parentId;
  }
  return false;
}

/**
 * Blocks declared with `metadataOnlyWhenStandalone: true` have TWO
 * deploy modes:
 *
 *   1. STANDALONE (no parent, or parent is NOT a network-isolation
 *      container): metadata-only. The node is consumed by downstream
 *      propagation passes but does NOT emit a cloud resource.
 *
 *   2. NESTED inside an isolation container: compiles to the real
 *      cloud resource (full LB chain in the Custom-Domain-in-Private-
 *      Network case).
 *
 * Returns true ONLY when both conditions hold: the node's iceType
 * has the duality flag AND there is no isolation-container parent.
 */
export function isStandaloneMetadataOnly(
  node: { data: Record<string, unknown>; parentId?: string | null },
  allNodes: Array<{ id: string; data: Record<string, unknown> }>,
): boolean {
  const iceType = (node.data?.iceType as string) || '';
  if (!getBlockDeployClassifiers(iceType).metadataOnlyWhenStandalone) return false;
  if (!node.parentId) return true;
  const parent = allNodes.find((n) => n.id === node.parentId);
  if (!parent) return true;
  const parentIceType = (parent.data?.iceType as string) || '';
  return !getBlockDeployClassifiers(parentIceType).isolatesNetworkContext;
}

// Kept temporarily for callers that haven't switched names — both
// re-export the same body so the rename is risk-free.
/** @deprecated Use `hasNetworkIsolatingAncestor`. */
export const hasPrivateNetworkAncestor = hasNetworkIsolatingAncestor;
/** @deprecated Use `isStandaloneMetadataOnly`. */
export const isCustomDomainStandalone = isStandaloneMetadataOnly;

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

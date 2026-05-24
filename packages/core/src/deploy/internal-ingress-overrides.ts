/**
 * Per-provider-resource overrides applied when a service backend is
 * nested inside a network-isolation container (see
 * `hasNetworkIsolatingAncestor`). Each entry knows how to mutate the
 * extractor's property dict so the deployed resource serves traffic
 * internally instead of from the public internet.
 *
 * Cardinal-rule schema-driven: the translator iterates this table
 * generically. Adding a new provider's internal-mode override means
 * registering an entry; the translator stays unchanged. Replaces the
 * inline `if (gcp_type === 'gcp.run.service') ... else if (gcp_type
 * === 'aws.ecs.service') ...` branches that mixed provider-specific
 * logic into a provider-agnostic file.
 */

export type InternalIngressOverride = (properties: Record<string, unknown>) => void;

export const INTERNAL_INGRESS_OVERRIDES: Record<string, InternalIngressOverride> = {
  // GCP Cloud Run — only reachable via VPC or internal LB.
  'gcp.run.service': (p) => {
    p.allow_unauthenticated = false;
    p.ingress = 'internal-and-cloud-load-balancing';
  },
  // AWS ECS — no public ALB; rely on nested ingress block.
  'aws.ecs.service': (p) => {
    p.assign_public_ip = false;
    p.internal = true;
  },
  // Azure Container App — disable external ingress.
  'azure.containerapp.containerApp': (p) => {
    p.ingress_external = false;
  },
};

/**
 * Apply the registered override (if any) for `resourceType` in place.
 * No-op when no entry exists — the resource doesn't have an internal
 * variant on this provider, or the override hasn't been declared yet.
 */
export function applyInternalIngressOverride(resourceType: string, properties: Record<string, unknown>): void {
  const override = INTERNAL_INGRESS_OVERRIDES[resourceType];
  if (override) override(properties);
}

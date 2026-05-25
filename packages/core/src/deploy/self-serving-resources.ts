/**
 * Provider resource types that serve public traffic on their own and
 * therefore need NO load-balancer chain in front of them. The
 * endpoint-wiring pass propagates the upstream PublicEndpoint's domain
 * onto these nodes but skips backend bucket / backend service
 * synthesis entirely; if every backend behind a PublicEndpoint turns
 * out to be self-serving, the forwarding rule itself is removed (no
 * point provisioning an empty LB).
 *
 * Cardinal-rule schema-driven: keyed by resolved provider resource
 * type (the same key shape used by `INTERNAL_INGRESS_OVERRIDES` and
 * the extractor / handler tables). Adding a new self-serving resource
 * on any provider — AWS Amplify, Azure Static Web Apps, Vercel-style
 * managed front-ends — adds one entry; the pass stays unchanged.
 */

export const SELF_SERVING_PUBLIC_RESOURCES: ReadonlySet<string> = new Set<string>([
  // GCP — Firebase Hosting gives a public HTTPS URL out of the box
  // with its own CDN + managed cert + optional custom domain.
  'gcp.firebase.hosting',
  // Future entries:
  //   'aws.amplify.app'
  //   'azure.staticwebapps.staticSite'
]);

export function isSelfServingPublicResource(resourceType: string): boolean {
  return SELF_SERVING_PUBLIC_RESOURCES.has(resourceType);
}

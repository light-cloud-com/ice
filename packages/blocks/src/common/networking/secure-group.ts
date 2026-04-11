/**
 * Secure Group Block
 *
 * A composite, container-shaped block that bundles **VPC + Subnet + Public
 * Endpoint (load balancer)** into a single primitive. Drop one of these on
 * the canvas, drag your compute blocks inside it, define routes at the top,
 * and you have a private network with a public entry point — no need to
 * assemble Network.VPC + Network.Subnet + Network.PublicEndpoint by hand.
 *
 * ## Mental model
 *
 * "Everything inside this box is in a private network. The top of the box
 * is how the public reaches in." Children of a Secure Group:
 *
 *   - Are deployed inside the synthesized VPC subnet (handlers receive
 *     the VPC + subnet refs and configure their resources accordingly)
 *   - For Cloud Run / containers / functions: get
 *     `ingress=internal-and-cloud-load-balancing` so they're only
 *     reachable through the LB, never directly
 *   - Get a Serverless NEG + backend service auto-created by the LB chain
 *
 * Routes on the Secure Group header map subdomains to specific child
 * services. Each route is a slot with its own connection port — drag from
 * the row's port to a child block to wire that route to that service.
 *
 * ## What it compiles to
 *
 *   gcp.compute.network              ← VPC
 *   gcp.compute.subnetwork           ← Subnet (children's parentId in
 *                                       the deploy graph points here)
 *   gcp.compute.globalForwardingRule ← LB entry point (and the LB handler
 *                                       expands this into URL map +
 *                                       target proxy + Serverless NEGs +
 *                                       backend services)
 *   gcp.compute.managedSslCertificate ← when enableHttps + autoProvisionCert
 *
 * ## When NOT to use
 *
 * Use Network.CustomDomain (not Secure Group) for services that ALREADY
 * have their own public URL — Firebase Hosting, AWS Amplify, public Cloud
 * Run, Azure Static Web Apps. Custom Domain is just DNS routing; Secure
 * Group is a full LB chain with cost (~$18/mo for the global LB).
 *
 * Use the standalone Network.VPC / Network.Subnet / Network.PublicEndpoint
 * blocks if you need fine-grained control over the topology (multiple
 * subnets in one VPC, peering, custom routes, etc.). Secure Group is the
 * "easy mode" primitive for the common case.
 */

import type { BlockBlueprint } from '../../types';

export const secureGroupBlueprint: BlockBlueprint = {
  iceType: 'Network.SecureGroup',
  resourceId: 'secure-group',
  name: 'Secure Group',
  description:
    'Private VPC + subnet with a built-in public load balancer. Drop your compute blocks inside, ' +
    'add routes at the top to expose subdomains. HTTPS + managed SSL automatic.',
  icon: 'Shield',
  category: 'networking',
  providers: ['gcp', 'aws', 'azure'],
  nodeData: {
    iceType: 'Network.SecureGroup',
    behavior: 'container',
    label: 'Secure Group',
    // Root domain (e.g. example.com). Empty = IP-only deploy.
    domain: '',
    // Per-row routes — same shape as Network.CustomDomain. Each route is
    // one slot the user can connect to a child compute block via the
    // header's row port.
    routes: [{ id: 'route-default', subdomain: '' }] as Array<{ id: string; subdomain: string }>,
    // Load balancer / SSL options
    enableHttps: true,
    autoProvisionCert: true,
    redirectHttpToHttps: true,
    sslCertificateId: '',
    // Visual treatment — the renderer reads these to apply the
    // "secure area" red-orange palette and shield icon.
    groupColor: '#dc2626', // red-600
    groupOpacity: 0.08,
  },
};

/**
 * Public Endpoint Block
 *
 * The single block for "make my services reachable from the public internet".
 * Replaces the previous split between `Network.Internet` (load balancer /
 * public traffic entry point) and `Network.CustomDomain` (managed SSL cert)
 * — users found having two separate blocks confusing when what they
 * actually wanted was "expose my sites to the world on a domain, with
 * HTTPS, maybe on multiple subdomains".
 *
 * ## What it compiles to
 *
 * A single `gcp.compute.globalForwardingRule` (which the load balancer
 * handler expands into the full backend bucket / URL map / target
 * HTTPS proxy / global forwarding rule chain), plus an optional
 * `gcp.compute.managedSslCertificate` when `enableHttps` is true.
 *
 * The URL map is populated with host-based routing rules derived from
 * the subdomain on each outgoing edge — so one block can fan out to
 * `api.example.com → api-service`, `app.example.com → static-site`,
 * and `example.com → landing-page` in a single deploy.
 *
 * ## Data model
 *
 * - `domain`: the root domain (e.g. `example.com`). Optional — leave
 *   blank for HTTP-only deploys that just expose an IP.
 * - `enableHttps`: checkbox to enable HTTPS with a managed SSL cert.
 *   Default true. When false, the block only creates an HTTP listener.
 * - `autoProvisionCert`: default true. When false, the user brings
 *   their own cert via `sslCertificateId`.
 * - `sslCertificateId`: optional — existing cert resource name to use.
 * - `redirectHttpToHttps`: default true. Adds an extra HTTP forwarding
 *   rule that 301s to HTTPS.
 *
 * ## Edge data model
 *
 * Every edge FROM this block to a compute target carries an optional
 * `subdomain` field on `edge.data`. Blank = root domain. Multiple
 * non-blank subdomains generate a multi-host URL map with `hostRules`.
 *
 * Example:
 *   PublicEndpoint(example.com) → StaticSite    (edge.subdomain = '', root)
 *   PublicEndpoint(example.com) → BackendAPI    (edge.subdomain = 'api')
 *   PublicEndpoint(example.com) → AdminPanel    (edge.subdomain = 'admin')
 *
 * Compiles to:
 *   - managedSslCert(domains=[example.com, api.example.com, admin.example.com])
 *   - URL map hostRules: example.com → bucket-A, api.example.com → service-B, admin.example.com → bucket-C
 *   - One global forwarding rule
 */

import type { BlockBlueprint } from '../../types';

export const publicEndpointBlueprint: BlockBlueprint = {
  iceType: 'Network.PublicEndpoint',
  resourceId: 'public-endpoint',
  name: 'Public Endpoint',
  description:
    'Public HTTPS entry point with managed SSL certificate. Connect to one or more services and route traffic by subdomain.',
  icon: 'Globe',
  category: 'networking',
  providers: ['gcp', 'aws', 'azure'],
  nodeData: {
    iceType: 'Network.PublicEndpoint',
    behavior: 'connector',
    label: 'Public Endpoint',
    // Root domain. Empty = IP-only, no cert, HTTP listener.
    domain: '',
    // Enable HTTPS with a Google-managed SSL certificate. The user gets
    // a checkbox in the properties panel to toggle this. When off, the
    // endpoint is HTTP-only and the cert resource is never created.
    enableHttps: true,
    // When `enableHttps` is true, auto-provision a managed cert using
    // the list of hosts derived from edges. Set to false to bring an
    // existing cert via `sslCertificateId`.
    autoProvisionCert: true,
    sslCertificateId: '',
    // Add an extra HTTP forwarding rule on port 80 that redirects to
    // HTTPS. Only takes effect when `enableHttps` is true.
    redirectHttpToHttps: true,
  },
};

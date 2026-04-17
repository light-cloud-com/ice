import type { InfoContent } from '../_shared/types';

export const customDomainInfo: InfoContent = {
  overview: {
    markdown: `
# Custom Domain

Your own hostname with HTTPS, wired to one or more services. Handles DNS,
SSL certificate provisioning, and subdomain routing in one block.

## What it does

- DNS record management for your domain
- Automatic SSL/TLS certificate (managed, auto-renewing)
- Host-based routing: \`api.example.com\` → Backend, \`example.com\` → Static Site

## Connecting

Drag one or more connections from Custom Domain to **Static Site**, **SSR Site**,
**Scalable Backend**, or **API Gateway**. Each edge carries an optional subdomain —
multiple subdomains on one domain route via a shared load balancer.

## Inside a Private Network

If placed **inside a Private Network**, this becomes the only public entry
point to the sealed network. Outside traffic hits Custom Domain, which routes
to nested services. The rest of the network stays private.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'ACM Certificate', type: 'aws_acm_certificate' },
      { name: 'Route 53 Record', type: 'aws_route53_record' },
      { name: 'ALB Listener', type: 'aws_lb_listener' },
    ],
    gcp: [
      { name: 'Managed SSL Certificate', type: 'google_compute_managed_ssl_certificate' },
      { name: 'URL Map', type: 'google_compute_url_map' },
      { name: 'Target HTTPS Proxy', type: 'google_compute_target_https_proxy' },
      { name: 'Global Forwarding Rule', type: 'google_compute_global_forwarding_rule' },
    ],
    azure: [
      { name: 'DNS Zone', type: 'azurerm_dns_zone' },
      { name: 'Front Door / App Gateway', type: 'azurerm_cdn_frontdoor_profile' },
    ],
  },
  relatedConcepts: ['Compute.StaticSite', 'Compute.SSRSite', 'Compute.Container', 'Network.PrivateNetwork'],
};

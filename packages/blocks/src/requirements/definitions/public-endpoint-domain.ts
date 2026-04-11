/**
 * Requirement: prompt the user to set a domain on every Public Endpoint
 * block that doesn't have one yet.
 *
 * This is a before-deploy, NON-blocking requirement (deploy proceeds even
 * without a domain — you'll just get an IP-only HTTP endpoint). The point
 * is to make the next configuration step DISCOVERABLE: users were creating
 * a Public Endpoint, deploying, and then asking "where's the URL? what
 * about HTTPS?" because nothing in the UI told them they needed to set
 * a domain to get a real public endpoint with a managed cert.
 */

import type { RequirementDefinition } from '../types';

export const publicEndpointDomainRequirement: RequirementDefinition = {
  id: 'public-endpoint-domain',
  scope: 'block',
  timing: 'before-deploy',
  blocking: false,
  applies: (ctx) => {
    if ((ctx.block.data?.iceType as string) !== 'Network.PublicEndpoint') return false;
    const domain = String(ctx.block.data?.domain || '').trim();
    return !domain;
  },
  title: () => 'Set a custom domain (optional)',
  description: () =>
    'Without a domain, this Public Endpoint will only be reachable via its raw load balancer IP address — no HTTPS, no friendly URL. Set a domain you own (e.g. example.com) on the block to enable managed SSL certificates and per-subdomain routing.',
  check: async () => {
    const now = new Date().toISOString();
    return {
      status: 'unmet',
      message:
        'No domain set. The block will deploy as IP-only HTTP. To enable HTTPS, set the Domain field on the Public Endpoint and redeploy.',
      lastCheckedAt: now,
    };
  },
};

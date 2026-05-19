/**
 * Requirement: post-deploy DNS A record for blocks with a custom domain.
 *
 * This is the canonical example of a post-deploy requirement whose values
 * depend on outputs we don't know until after the deploy runs. After the
 * forwarding rule exists, ICE can tell the user exactly what record to add
 * where, and then poll DNS to automatically verify the record.
 */

import type { RequirementDefinition } from '../types';

async function resolveDns4(domain: string): Promise<string[]> {
  // Runs in the backend (Node) — dynamic import keeps the frontend bundle clean.
  const dns = await import('dns/promises');
  return dns.resolve4(domain).catch(() => []);
}

export const dnsARecordRequirement: RequirementDefinition = {
  id: 'dns-a-record',
  scope: 'block',
  timing: 'post-deploy',
  blocking: false,
  applies: (ctx) => {
    // Only fires on the Public Endpoint block — that's the only one
    // that compiles to a load balancer with a real IP. The legacy
    // `domain` field on Compute.StaticSite (left over from the old
    // Network.Domain block) is no longer wired to anything and would
    // surface a "DNS not configured" requirement that the user can't
    // act on.
    if ((ctx.block.data?.iceType as string) !== 'Network.PublicEndpoint') return false;
    const domain = String(ctx.block.data?.domain || '').trim();
    return Boolean(domain) && domain !== 'example.com';
  },
  title: (ctx) => `Add DNS A record for ${ctx.block.data?.domain}`,
  description: (ctx) =>
    `Your site at https://${ctx.block.data?.domain} will be reachable once this DNS record is live. ICE can't configure your registrar automatically, but it will verify the record once you add it.`,
  check: async (ctx) => {
    const now = new Date().toISOString();
    const domain = ctx.block.data?.domain as string;
    const expectedIp =
      (ctx.deployedOutputs?.ip_address as string | undefined) || (ctx.deployedOutputs?.IPAddress as string | undefined);
    if (!expectedIp) {
      return {
        status: 'unknown',
        message: 'Deployment output not available yet — deploy must complete first.',
        lastCheckedAt: now,
      };
    }
    const resolved = await resolveDns4(domain);
    if (resolved.includes(expectedIp)) {
      return {
        status: 'verified',
        message: `Resolves to ${expectedIp}`,
        lastCheckedAt: now,
      };
    }
    return {
      status: 'unmet',
      message: resolved.length
        ? `Currently resolves to ${resolved.join(', ')}, expected ${expectedIp}.`
        : `Domain does not resolve yet. Add the A record and ICE will retry.`,
      details: { expected: expectedIp, actual: resolved },
      lastCheckedAt: now,
    };
  },
  action: (ctx) => {
    const domain = ctx.block.data?.domain as string | undefined;
    const ip =
      (ctx.deployedOutputs?.ip_address as string | undefined) || (ctx.deployedOutputs?.IPAddress as string | undefined);
    if (!domain || !ip) return null;
    return {
      type: 'copy-dns-record',
      label: 'Copy DNS record',
      payload: {
        record_type: 'A',
        name: domain,
        value: ip,
        ttl: 300,
      },
    };
  },
  verifyPollIntervalMs: 30_000,
  verifyTimeoutMs: 60 * 60 * 1000,
};

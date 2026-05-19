/**
 * Requirement: Google-managed SSL certificate issuance progress (Phase 8).
 *
 * Post-deploy requirement that polls the managed cert resource until it
 * transitions from PROVISIONING to ACTIVE. Cert issuance can take anywhere
 * from 10 minutes to a few hours depending on how fast DNS propagates and
 * how quickly Google's ACME workflow runs, so this requirement MUST be
 * post-deploy and non-blocking.
 */

import type { RequirementDefinition } from '../types';

export const managedCertIssuanceRequirement: RequirementDefinition = {
  id: 'managed-cert-issuance',
  scope: 'block',
  timing: 'post-deploy',
  blocking: false,
  applies: (ctx) => {
    const iceType = ctx.block.data?.iceType as string | undefined;
    // PublicEndpoint and CustomDomain (nested inside a PrivateNetwork)
    // both compile to a forwarding rule + managed SSL cert chain. The
    // cert issuance lifecycle is identical — same resource type, same
    // status enum, same poll cadence.
    if (iceType !== 'Network.PublicEndpoint' && iceType !== 'Network.CustomDomain') return false;
    const domain = (ctx.block.data?.domain as string | undefined) || '';
    if (!domain.trim()) return false;
    return ctx.block.data?.autoProvisionCert !== false;
  },
  title: (ctx) => `SSL certificate issuance for ${ctx.block.data?.domain}`,
  description: () =>
    "Google is issuing the managed SSL certificate. This takes 15-60 minutes after domain verification and DNS propagation complete. ICE polls automatically — you don't have to stay on this page.",
  check: async (ctx) => {
    const now = new Date().toISOString();
    const domain = String(ctx.block.data?.domain || '').trim();

    // The resolver injects a `certStatusChecker` onto the context with
    // runtime access to the deployed cert resource and the scoped GCP
    // credentials. Without it the check can only return 'unknown'.
    const checker = (ctx as any).certStatusChecker as
      | {
          fetchStatus(
            orgId: string,
            gcpProject: string,
            certName: string,
          ): Promise<{ status: string; domain_statuses?: Record<string, string> }>;
        }
      | undefined;

    const certName = (ctx as any).certResourceName as string | undefined;
    if (!checker || !certName || !ctx.gcpProject) {
      return {
        status: 'unknown',
        message: 'Certificate not yet deployed. This requirement activates after the first successful deploy.',
        lastCheckedAt: now,
      };
    }

    try {
      const { status, domain_statuses } = await checker.fetchStatus(ctx.org.id, ctx.gcpProject, certName);
      if (status === 'ACTIVE') {
        return {
          status: 'verified',
          message: `Certificate is live for ${domain}.`,
          lastCheckedAt: now,
          details: { managed_status: status, domain_statuses },
        };
      }
      if (status === 'FAILED_NOT_VISIBLE') {
        return {
          status: 'unmet',
          message:
            'Google cannot see your DNS pointing at the load balancer yet. Check that the A record is live, then wait a few minutes.',
          lastCheckedAt: now,
          details: { managed_status: status, domain_statuses },
        };
      }
      if (status === 'FAILED_CAA_FORBIDDEN' || status === 'FAILED_CAA_CHECKING') {
        return {
          status: 'unmet',
          message:
            'Your domain has a CAA record that prevents Google from issuing a certificate. Check your DNS CAA records.',
          lastCheckedAt: now,
          details: { managed_status: status, domain_statuses },
        };
      }
      return {
        status: 'unmet',
        message: `Status: ${status}. Google is still working on it.`,
        lastCheckedAt: now,
        details: { managed_status: status, domain_statuses },
      };
    } catch (err: any) {
      return {
        status: 'unmet',
        message: `Failed to fetch cert status: ${err?.message || err}`,
        lastCheckedAt: now,
      };
    }
  },
  verifyPollIntervalMs: 60_000,
  verifyTimeoutMs: 2 * 60 * 60 * 1000,
};

/**
 * Requirement: Google Search Console domain verification (Phase 8).
 *
 * Before Google will issue a managed SSL certificate for a domain, the
 * domain owner must prove control via the Site Verification API. The API
 * returns a TXT record that has to be present on the domain; once the
 * TXT record is live, calling the verify endpoint marks the domain as
 * verified for the project's service account.
 *
 * This requirement is before-deploy but non-blocking — the deploy can
 * still run (creating the cert resource), but GCP's cert issuance will
 * stay in PROVISIONING until verification completes.
 */

import type { RequirementDefinition } from '../types';

export const domainVerificationRequirement: RequirementDefinition = {
  id: 'domain-verification',
  scope: 'block',
  timing: 'before-deploy',
  blocking: false,
  applies: (ctx) => {
    const iceType = ctx.block.data?.iceType as string | undefined;
    if (iceType !== 'Network.PublicEndpoint') return false;
    const domain = (ctx.block.data?.domain as string | undefined) || '';
    if (!domain || domain.trim() === '') return false;
    return ctx.block.data?.autoProvisionCert !== false;
  },
  title: (ctx) => `Verify domain ownership: ${ctx.block.data?.domain}`,
  description: () =>
    'Google Cloud needs to confirm you own this domain before issuing a managed SSL certificate. Add the TXT record below at your DNS provider, then click Verify.',
  check: async (ctx) => {
    const now = new Date().toISOString();
    const domain = String(ctx.block.data?.domain || '').trim();
    if (!domain) {
      return { status: 'unmet', message: 'No domain set on the Custom Domain block.', lastCheckedAt: now };
    }
    try {
      // Runtime dependency injection: the deploy service attaches the
      // verification helper onto the context so the block-layer code
      // doesn't have to import backend-only modules.
      const verifier = (ctx as any).googleVerifier as
        | { checkVerification(orgId: string, domain: string): Promise<boolean> }
        | undefined;
      if (!verifier) {
        return {
          status: 'unknown',
          message: 'Verification service not available — cannot check status.',
          lastCheckedAt: now,
        };
      }
      const verified = await verifier.checkVerification(ctx.org.id, domain);
      return {
        status: verified ? 'verified' : 'unmet',
        message: verified ? `Verified for ${domain}` : `Add the TXT record below at your registrar, then click Verify.`,
        lastCheckedAt: now,
      };
    } catch (err: any) {
      return {
        status: 'unmet',
        message: `Verification check failed: ${err?.message || err}`,
        lastCheckedAt: now,
      };
    }
  },
  action: (ctx) => {
    const domain = String(ctx.block.data?.domain || '').trim();
    if (!domain) return null;
    // The TXT token is fetched from the Site Verification API at resolver
    // time — the service provides it via context extension so we don't
    // make a separate round-trip per render.
    const token = ((ctx as any).verificationTokens as Record<string, string> | undefined)?.[domain] || '';
    return {
      type: 'copy-dns-record',
      label: 'Copy TXT record',
      payload: {
        record_type: 'TXT',
        name: domain,
        value: token ? `google-site-verification=${token}` : 'pending — ICE is requesting a token',
        ttl: 300,
      },
    };
  },
  verifyPollIntervalMs: 60_000,
  verifyTimeoutMs: 24 * 60 * 60 * 1000,
};

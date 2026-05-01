/**
 * SSL managed certificate status fetcher. Extracted from
 * `load-balancer.ts` (rf-lbal-2) — the create path and the update path
 * both need to surface `cert_status` + `cert_domain_statuses` so the
 * Custom Domain header on the canvas reflects the current provisioning
 * state.
 *
 * Two distinct semantics:
 *   - `fetch_initial_status` (create) — falls back to 'PROVISIONING' on
 *     read failure since the cert may not yet be readable post-create.
 *   - `fetch_current_status` (update) — leaves the status undefined on
 *     failure, since update reflects an existing cert.
 */
import { BASE_URL } from './result-helpers.js';
import type { GCPHandlerContext } from '../../types.js';

export interface CertStatus {
  cert_status?: string;
  cert_domain_statuses?: Record<string, string>;
}

/**
 * Fetch the cert status used by the create path. On the create path the
 * cert was JUST referenced by the target proxy and may not be readable
 * back yet — we default to `PROVISIONING` so the UI immediately shows
 * the spinner instead of looking blank.
 */
export async function fetch_initial_status(
  ctx: GCPHandlerContext,
  sslCertificateName: string,
): Promise<CertStatus> {
  if (!sslCertificateName) return {};
  try {
    const cert = (await ctx.rest_client.get(
      `${BASE_URL}/projects/${ctx.project}/global/sslCertificates/${sslCertificateName}`,
    )) as any;
    return {
      cert_status: cert?.managed?.status || 'PROVISIONING',
      cert_domain_statuses: cert?.managed?.domainStatus,
    };
  } catch {
    // Cert might not be ready to read yet; the requirement poll will
    // pick it up shortly.
    return { cert_status: 'PROVISIONING' };
  }
}

/**
 * Fetch the cert status used by the update path. On update we don't
 * fall back to PROVISIONING — if the GET fails, leave both fields
 * undefined so the canvas keeps the most recent cached status.
 */
export async function fetch_current_status(
  ctx: GCPHandlerContext,
  sslCertificateName: string,
): Promise<CertStatus> {
  if (!sslCertificateName) return {};
  try {
    const cert = (await ctx.rest_client.get(
      `${BASE_URL}/projects/${ctx.project}/global/sslCertificates/${sslCertificateName}`,
    )) as any;
    return {
      cert_status: cert?.managed?.status,
      cert_domain_statuses: cert?.managed?.domainStatus,
    };
  } catch {
    // Cert was deleted or unreadable — leave undefined.
    return {};
  }
}

/**
 * Read a forwarding rule's IP address back. Returns `undefined` when
 * the GET fails — neither create nor update treats the IP as
 * load-bearing for success, but having it materially improves the UX
 * (it powers the canvas pill, the DNS requirement check, and the
 * "open in browser" deep-link).
 */
export async function fetch_ip_address(
  ctx: GCPHandlerContext,
  forwardingRuleName: string,
): Promise<string | undefined> {
  try {
    const rule = (await ctx.rest_client.get(
      `${BASE_URL}/projects/${ctx.project}/global/forwardingRules/${forwardingRuleName}`,
    )) as any;
    return rule?.IPAddress || rule?.ipAddress;
  } catch {
    return undefined;
  }
}

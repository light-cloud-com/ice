/**
 * Primary URL composition for load-balancer outputs. Extracted from
 * `load-balancer.ts` (rf-lbal-2) — the same priority order is used by
 * both create and update so the canvas pill / "open in browser" link
 * always picks the most user-meaningful URL available.
 *
 * Priority:
 *   1. Custom domain (the user's intended public URL)
 *   2. HTTPS IP (works but not normally what the user wants to share)
 *   3. HTTP IP (fallback for non-TLS deploys)
 */

export interface PrimaryUrlInput {
  customDomain: string;
  /** True iff protocol === HTTPS AND ssl_certificate_name is set. */
  wantsHttps: boolean;
  ipAddress?: string;
}

/**
 * Build the user-facing URL given a custom domain (preferred), the
 * HTTPS readiness flag, and the load balancer's current IP address.
 * Returns `undefined` if none of the inputs yield a meaningful URL —
 * the caller should not surface a partial URL.
 */
export function compute_primary_url(input: PrimaryUrlInput): string | undefined {
  const { customDomain, wantsHttps, ipAddress } = input;
  if (customDomain) return `https://${customDomain}`;
  if (wantsHttps && ipAddress) return `https://${ipAddress}`;
  if (ipAddress) return `http://${ipAddress}`;
  return undefined;
}

/**
 * Helper: build a backend-service or backend-bucket reference URL for
 * the URL map. Same shape used in both create and the multi-host path.
 */
export function backend_ref(project: string, backendName: string, backendType: 'bucket' | 'service'): string {
  return backendType === 'bucket'
    ? `projects/${project}/global/backendBuckets/${backendName}`
    : `projects/${project}/global/backendServices/${backendName}`;
}

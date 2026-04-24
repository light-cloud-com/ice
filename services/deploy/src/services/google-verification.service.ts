/**
 * Google Site Verification Service (Phase 8)
 *
 * Thin wrapper around the Google Site Verification API. Used by the
 * `domainVerificationRequirement` to generate the TXT record users need
 * to add at their registrar, and to check whether Google considers the
 * domain verified for the org's service account.
 *
 * Both calls authenticate with the org's stored GCP credentials via the
 * same path the deploy service uses for cert operations — we don't need
 * a separate token flow.
 */

import * as providerService from '@ice/service-credentials';
import { enableGcpApi } from './deploy.service.js';

const API_BASE = 'https://www.googleapis.com/siteVerification/v1';
const SITE_VERIFICATION_API = 'siteverification.googleapis.com';

// Simple in-process cache so rapid re-polls don't burn through quota.
// Keyed by (orgId, domain). 5-minute TTL.
const verificationCache = new Map<string, { verified: boolean; expiresAt: number }>();
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Remember which (project) combos we've already tried to enable the API for,
// so we only attempt the enable once per process lifetime per project.
const enableAttempted = new Set<string>();

function cacheKey(orgId: string, domain: string): string {
  return `${orgId}:${domain}`;
}

async function getAccessTokenAndProject(orgId: string): Promise<{ accessToken: string; project: string } | null> {
  const credentials = await providerService.getDecryptedCredentials(orgId, 'gcp');
  if (!credentials) return null;

  const project = (credentials as any).project_id as string | undefined;
  if (!project) return null;

  if (credentials._auth_type === 'oauth') {
    const token = await providerService.getValidGCPAccessToken(orgId, credentials);
    if (!token) return null;
    return { accessToken: token, project };
  }

  const key = (credentials as any).service_account_key || (credentials as any).key;
  if (!key) return null;
  try {
    const parsed = typeof key === 'string' ? JSON.parse(key) : key;
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      credentials: parsed,
      scopes: [
        'https://www.googleapis.com/auth/siteverification',
        'https://www.googleapis.com/auth/cloud-platform', // needed for serviceusage to enable the API
      ],
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token?.token) return null;
    return { accessToken: token.token, project };
  } catch {
    return null;
  }
}

/**
 * Legacy single-value helper kept so the rest of this file can stay small.
 * Internally delegates to the tuple version.
 */
async function getAccessToken(orgId: string): Promise<string | null> {
  const result = await getAccessTokenAndProject(orgId);
  return result?.accessToken || null;
}

/**
 * If the Site Verification API is disabled for the project, attempt to
 * enable it via the Service Usage API and wait briefly for propagation.
 * Idempotent per (orgId, project) — only tries once per process lifetime
 * to avoid loops when the user lacks the permission to enable APIs.
 */
async function ensureSiteVerificationApiEnabled(
  orgId: string,
  ctx: { accessToken: string; project: string },
): Promise<boolean> {
  const key = `${orgId}:${ctx.project}`;
  if (enableAttempted.has(key)) return false;
  enableAttempted.add(key);

  console.warn(
    `[google-verification] Site Verification API is disabled for project ${ctx.project}. Attempting to auto-enable…`,
  );
  const ok = await enableGcpApi(ctx.project, SITE_VERIFICATION_API, ctx.accessToken);
  if (!ok) {
    console.warn(
      `[google-verification] Failed to auto-enable ${SITE_VERIFICATION_API}. ` +
        `User must enable it manually at https://console.cloud.google.com/apis/library/${SITE_VERIFICATION_API}?project=${ctx.project}`,
    );
    return false;
  }
  // Google advises "wait a few minutes" after enabling. 5 seconds is usually
  // enough in practice, and the caller will retry on the next poll anyway
  // if it still isn't ready.
  console.log(`[google-verification] ${SITE_VERIFICATION_API} enable request accepted, waiting 5s for propagation…`);
  await new Promise((r) => setTimeout(r, 5000));
  return true;
}

/**
 * Ask Google to generate a DNS TXT record token for this domain. Users add
 * this TXT record at their registrar, then call verifySite to mark the
 * domain as owned by the service account's identity.
 */
export async function generateVerificationToken(orgId: string, domain: string): Promise<string | null> {
  const key = cacheKey(orgId, domain);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const ctx = await getAccessTokenAndProject(orgId);
  if (!ctx) return null;

  const attempt = async (): Promise<{ status: number; text: string; body?: any }> => {
    const res = await fetch(`${API_BASE}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        verificationMethod: 'DNS_TXT',
        site: { type: 'INET_DOMAIN', identifier: domain },
      }),
    });
    if (res.ok) {
      return { status: 200, text: '', body: await res.json() };
    }
    return { status: res.status, text: await res.text() };
  };

  try {
    let result = await attempt();

    // Detect SERVICE_DISABLED (API not enabled) and auto-enable + retry.
    if (
      result.status === 403 &&
      (result.text.includes('SERVICE_DISABLED') || result.text.includes('has not been used in project'))
    ) {
      const enabled = await ensureSiteVerificationApiEnabled(orgId, ctx);
      if (enabled) {
        result = await attempt();
      }
    }

    if (result.status !== 200) {
      console.warn(`[google-verification] generate token failed: ${result.status}`, result.text.slice(0, 500));
      return null;
    }

    const value = (result.body?.token as string) || '';
    if (value) {
      tokenCache.set(key, { token: value, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return value;
  } catch (err) {
    console.warn('[google-verification] generate token error:', err);
    return null;
  }
}

/**
 * Check whether the org's service account has verified ownership of the
 * domain. Attempts to insert the verification resource — 200 means already
 * verified, 403 means the TXT record isn't present yet.
 */
export async function checkSearchConsoleVerification(orgId: string, domain: string): Promise<boolean> {
  const key = cacheKey(orgId, domain);
  const cached = verificationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.verified;

  const ctx = await getAccessTokenAndProject(orgId);
  if (!ctx) return false;

  const attempt = async (): Promise<Response> =>
    fetch(`${API_BASE}/webResource?verificationMethod=DNS_TXT`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ site: { type: 'INET_DOMAIN', identifier: domain } }),
    });

  try {
    let res = await attempt();

    // SERVICE_DISABLED detection + auto-enable + retry, same as the token path.
    if (res.status === 403) {
      const body = await res.clone().text().catch(() => '');
      if (body.includes('SERVICE_DISABLED') || body.includes('has not been used in project')) {
        const enabled = await ensureSiteVerificationApiEnabled(orgId, ctx);
        if (enabled) {
          res = await attempt();
        }
      }
    }

    // 200 = verified; 400 = already verified by this account (treat as true);
    // 403 = TXT record not yet live; 403 SERVICE_DISABLED = API still off (not verified yet).
    const verified = res.ok || res.status === 400;
    verificationCache.set(key, { verified, expiresAt: Date.now() + CACHE_TTL_MS });
    return verified;
  } catch {
    return false;
  }
}

/**
 * Fetch the current status of a managed SSL certificate. Used by the
 * post-deploy `managedCertIssuanceRequirement` to track issuance progress.
 */
export async function fetchSslCertificateStatus(
  orgId: string,
  gcpProject: string,
  certName: string,
): Promise<{ status: string; domain_statuses?: Record<string, string> }> {
  const token = await getAccessToken(orgId);
  if (!token) return { status: 'UNKNOWN' };

  try {
    const res = await fetch(
      `https://compute.googleapis.com/compute/v1/projects/${gcpProject}/global/sslCertificates/${certName}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return { status: 'UNKNOWN' };
    const body = (await res.json()) as { managed?: { status?: string; domainStatus?: Record<string, string> } };
    return {
      status: body.managed?.status || 'UNKNOWN',
      domain_statuses: body.managed?.domainStatus,
    };
  } catch {
    return { status: 'UNKNOWN' };
  }
}

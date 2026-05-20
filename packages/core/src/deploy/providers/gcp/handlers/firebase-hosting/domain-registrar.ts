/**
 * Firebase Hosting custom-domain registration (rf-fbh-9).
 *
 * Registers a custom domain on a Firebase Hosting site and surfaces the
 * DNS records the registrant needs to add. Idempotent — re-running this
 * against an already-registered domain returns the existing record set.
 *
 * Why this is its own module: the registration flow walks a three-tier
 * fallback (GET adopt -> POST customDomains -> POST legacy domains),
 * each with its own 409 re-fetch, and each leg's request shape and URL
 * pin must stay verbatim (RISK #13/#14 in `state/blueprints/rf-fbh.md`).
 * Keeping it isolated from the orchestrator lets us pin all three legs
 * with focused unit tests instead of spinning up the full create/update
 * harness.
 */
import { extractDnsRecords, type FirebaseHostingDnsRecord } from './dns-extractor';
import { FIREBASE_HOSTING_API, restRequest } from './rest-client';
import type { GCPHandlerContext } from '../../types';

/**
 * Register a custom domain on a Firebase Hosting site and extract the
 * DNS records the user needs to add. Idempotent — if the domain already
 * exists (409), we re-fetch and return the existing records.
 *
 * Firebase Hosting's domain provisioning has two phases:
 *   1. Verification — user adds a TXT record proving they own the domain
 *   2. Activation — user adds A records pointing at Firebase's IPs
 * Both sets of records come back from the same API. The `requiredAction`
 * field on each record tells us which step it belongs to.
 */
export async function registerHostingDomain(
  ctx: GCPHandlerContext,
  siteId: string,
  customDomain: string,
): Promise<{
  ok: boolean;
  domainName?: string;
  status?: string;
  dnsRecords?: FirebaseHostingDnsRecord[];
  error?: string;
  rawResponse?: any;
}> {
  // All Firebase Hosting custom domain endpoints are PROJECT-SCOPED.
  // Without `projects/{project}/` in the path the API returns 404
  // because the resource lookup happens under the user's default
  // project instead of the canvas project. The site itself is created
  // at `projects/{project}/sites/{siteId}` so its custom domains live
  // under the same prefix.
  const projectScopedSitePath = `projects/${ctx.project}/sites/${siteId}`;

  // Try to fetch first — if we already registered this domain we just
  // return the existing records (the user might be re-running deploy
  // to copy them again).
  const getRes = await restRequest(
    ctx,
    'GET',
    `${FIREBASE_HOSTING_API}/${projectScopedSitePath}/customDomains/${encodeURIComponent(customDomain)}`,
    undefined,
    { acceptStatuses: [404] },
  );
  if (getRes.ok && getRes.status !== 404 && getRes.data?.name) {
    const records = extractDnsRecords(getRes.data);
    const requiredDnsKeys = Object.keys(getRes.data?.requiredDnsUpdates || {}).join(',');
    ctx.on_log?.(
      `[firebase-hosting] Adopted existing customDomain ${customDomain} (status=${getRes.data?.hostState || 'unknown'}, dnsRecordCount=${records.length}, requiredDnsUpdates.keys=[${requiredDnsKeys}], topKeys=[${Object.keys(getRes.data || {}).join(',')}])`,
    );
    return {
      ok: true,
      domainName: customDomain,
      status: getRes.data?.hostState || 'pending',
      dnsRecords: records,
      rawResponse: getRes.data,
    };
  }

  // Create the custom domain. Firebase Hosting customDomains is the
  // current API; the legacy `sites/{site}/domains` is kept as a
  // fallback for older sites.
  const createUrl = `${FIREBASE_HOSTING_API}/${projectScopedSitePath}/customDomains?customDomainId=${encodeURIComponent(customDomain)}`;
  ctx.on_log?.(`[firebase-hosting] POST ${createUrl}`);
  const createRes = await restRequest(ctx, 'POST', createUrl, {}, { acceptStatuses: [409, 400] });
  if (createRes.ok && (createRes.status < 300 || createRes.status === 409)) {
    // 409 = ALREADY_EXISTS — re-fetch to get the records
    let domainData = createRes.data;
    if (createRes.status === 409) {
      const refetch = await restRequest(
        ctx,
        'GET',
        `${FIREBASE_HOSTING_API}/${projectScopedSitePath}/customDomains/${encodeURIComponent(customDomain)}`,
      );
      if (refetch.ok) domainData = refetch.data;
    }
    const records = extractDnsRecords(domainData);
    ctx.on_log?.(
      `[firebase-hosting] customDomains create returned status=${createRes.status}, dnsRecordCount=${records.length}, ` +
        `keys=${Object.keys(domainData || {}).join(',')}`,
    );
    return {
      ok: true,
      domainName: customDomain,
      status: domainData?.hostState || 'pending',
      dnsRecords: records,
      rawResponse: domainData,
    };
  }

  ctx.on_log?.(
    `[firebase-hosting] customDomains create failed (status=${createRes.status}): ${createRes.data?.error?.message || JSON.stringify(createRes.data)}. Trying legacy domains endpoint...`,
  );

  // Fall back to the legacy domains endpoint (also project-scoped).
  const legacyUrl = `${FIREBASE_HOSTING_API}/${projectScopedSitePath}/domains`;
  const legacyRes = await restRequest(
    ctx,
    'POST',
    legacyUrl,
    {
      domainName: customDomain,
      domainRedirect: { type: 'TEMPORARY', domainName: '' },
      provisioning: { certStatus: 'CERT_PREPARING' },
    },
    { acceptStatuses: [409] },
  );
  if (legacyRes.ok) {
    let domainData = legacyRes.data;
    if (legacyRes.status === 409) {
      const refetch = await restRequest(
        ctx,
        'GET',
        `${FIREBASE_HOSTING_API}/${projectScopedSitePath}/domains/${encodeURIComponent(customDomain)}`,
      );
      if (refetch.ok) domainData = refetch.data;
    }
    const records = extractDnsRecords(domainData);
    ctx.on_log?.(
      `[firebase-hosting] legacy domains create returned status=${legacyRes.status}, dnsRecordCount=${records.length}, ` +
        `keys=${Object.keys(domainData || {}).join(',')}`,
    );
    return {
      ok: true,
      domainName: customDomain,
      status: domainData?.provisioning?.certStatus || 'pending',
      dnsRecords: records,
      rawResponse: domainData,
    };
  }
  return {
    ok: false,
    error: String(createRes.data?.error?.message || legacyRes.data?.error?.message || JSON.stringify(legacyRes.data)),
  };
}

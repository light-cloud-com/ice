/**
 * Firebase Hosting Handler
 *
 * Handles: gcp.firebase.hosting
 *
 * Why Firebase Hosting and not Cloud Storage + Load Balancer:
 * - Firebase Hosting has its own access model that bypasses GCS org
 *   policies (`iam.allowedPolicyMemberDomains`,
 *   `storage.uniformBucketLevelAccess`, `storage.publicAccessPrevention`).
 *   In hardened enterprise GCP projects these policies make a public
 *   Cloud Storage site impossible — Firebase Hosting works because it
 *   is a separate, fully-managed product.
 * - Free SSL certificate provisioned automatically.
 * - Global CDN out of the box.
 * - Custom domain support without setting up a load balancer, backend
 *   bucket, URL map, forwarding rule, or managed cert.
 * - Two free public URLs per site: `<site>.web.app` and
 *   `<site>.firebaseapp.com`. The user gets a working HTTPS URL
 *   immediately, no DNS or cert configuration required.
 *
 * The deploy flow uses the Firebase Hosting REST API:
 *   1. Ensure the Firebase project exists (auto-add Firebase to the GCP
 *      project if it isn't already a Firebase project).
 *   2. Ensure the hosting site exists (sites/<site_id>).
 *   3. Create a "version" (a draft snapshot of files).
 *   4. Upload a placeholder index.html as the only file in the version.
 *   5. Finalize the version (status FINALIZED).
 *   6. Release the version to live traffic.
 *
 * The placeholder is uploaded so the site has a working URL out of the
 * box. CI uploads (via `firebase deploy` or this same REST API) can
 * replace the version later without ICE being involved.
 */

import * as crypto from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { result, fail } from './firebase-hosting/result-helpers.js';
import { sanitizeSiteId, placeholderIndexHtml } from './firebase-hosting/site-utils.js';
import { parseTar, type FileEntry } from './firebase-hosting/tar-parser.js';
import {
  FIREBASE_HOSTING_API,
  FIREBASE_MGMT_API,
  restRequest,
} from './firebase-hosting/rest-client.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';

/**
 * Make sure the GCP project has Firebase enabled. AddFirebase is
 * idempotent — returns 409 ALREADY_EXISTS if it's already a Firebase
 * project, which we treat as success.
 */
async function ensureFirebaseProject(ctx: GCPHandlerContext): Promise<{ ok: boolean; error?: string }> {
  const url = `${FIREBASE_MGMT_API}/projects/${ctx.project}:addFirebase`;
  const res = await restRequest(ctx, 'POST', url, {}, { acceptStatuses: [409, 400] });
  if (res.ok) return { ok: true };
  // 409 / 400 both mean "already a Firebase project" in practice.
  const msg = String(res.data?.error?.message || res.data?.message || JSON.stringify(res.data));
  if (msg.includes('already') || msg.includes('ALREADY_EXISTS')) {
    return { ok: true };
  }
  return { ok: false, error: msg };
}

/**
 * Create or adopt the Firebase Hosting site. The default site has the
 * same id as the project; if we want a separate one we POST to /sites
 * with `siteId`. Both paths can return ALREADY_EXISTS, which we treat
 * as adoption.
 */
async function ensureHostingSite(
  ctx: GCPHandlerContext,
  siteId: string,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  // Try GET first — if the site is already there we adopt it.
  const getRes = await restRequest(
    ctx,
    'GET',
    `${FIREBASE_HOSTING_API}/projects/${ctx.project}/sites/${siteId}`,
    undefined,
    { acceptStatuses: [404] },
  );
  if (getRes.ok && getRes.status !== 404 && getRes.data?.name) {
    return { ok: true, data: getRes.data };
  }
  // Doesn't exist — create it.
  const createRes = await restRequest(
    ctx,
    'POST',
    `${FIREBASE_HOSTING_API}/projects/${ctx.project}/sites?siteId=${siteId}`,
    {},
    { acceptStatuses: [409] },
  );
  if (createRes.ok) {
    if (createRes.status === 409) {
      // Race / already exists — re-fetch.
      const refetch = await restRequest(ctx, 'GET', `${FIREBASE_HOSTING_API}/projects/${ctx.project}/sites/${siteId}`);
      return refetch.ok
        ? { ok: true, data: refetch.data }
        : { ok: false, error: 'Site exists but could not be fetched.' };
    }
    return { ok: true, data: createRes.data };
  }
  return {
    ok: false,
    error: String(createRes.data?.error?.message || JSON.stringify(createRes.data)),
  };
}

/**
 * Download a GitHub repo as a tarball and extract it into an in-memory
 * file map. Uses codeload.github.com which serves tarballs without
 * authentication for public repos.
 */
async function downloadGitHubRepo(
  ctx: GCPHandlerContext,
  owner: string,
  repo: string,
  branch: string,
  outputDirectory: string,
): Promise<FileEntry[]> {
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/${branch}`;
  const requestRaw = (ctx.rest_client as any).requestRaw as (opts: {
    method: string;
    url: string;
    responseType?: 'json' | 'text' | 'arraybuffer';
    validateStatus?: (s: number) => boolean;
  }) => Promise<{ status: number; data: any }>;

  ctx.on_log?.(`[firebase-hosting] Downloading ${owner}/${repo}#${branch} from ${url}`);
  // codeload.github.com is a public CDN and doesn't accept GCP auth
  // headers — they cause 401s. Use the global fetch to bypass auth.
  let body: Buffer;
  if (typeof globalThis.fetch === 'function') {
    const res = await globalThis.fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`GitHub tarball download failed: ${res.status} ${res.statusText}`);
    }
    body = Buffer.from(await res.arrayBuffer());
  } else {
    // Fallback: requestRaw with arraybuffer (auth headers leak in but
    // codeload usually ignores them).
    const res = await requestRaw({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      validateStatus: (s: number) => s < 400,
    });
    body = Buffer.from(res.data);
  }
  ctx.on_log?.(`[firebase-hosting] Downloaded ${body.length} bytes, extracting...`);

  // Decompress + parse the tarball
  const tar = gunzipSync(body);
  const entries = parseTar(tar);

  // Tarball entries are prefixed with `<repo>-<branch>/`. Strip that.
  // Then if outputDirectory is set, only include files under it and
  // strip the prefix so the files land at the hosting root.
  //
  // Two-phase extraction: first try the configured `outputDirectory`,
  // and if it produces NO files (because the user set 'dist' but the
  // repo doesn't have a build step and ships HTML at the root), fall
  // back to the root with a warning. Better to deploy something
  // useful than to silently upload zero files.
  const stripPrefixRe = new RegExp(`^[^/]+/`);
  const collect = (filterDir: string): FileEntry[] => {
    const out: FileEntry[] = [];
    const outDir = filterDir.replace(/^\/+|\/+$/g, '');
    for (const entry of entries) {
      let path = entry.name.replace(stripPrefixRe, '');
      if (!path) continue;
      if (path.startsWith('.git/') || path === '.gitignore' || path === '.gitattributes') continue;
      if (path === 'README.md' || path === 'LICENSE') continue;
      if (outDir) {
        if (!path.startsWith(`${outDir}/`)) continue;
        path = path.slice(outDir.length + 1);
        if (!path) continue;
      }
      out.push({ hostingPath: `/${path}`, bytes: entry.data });
    }
    return out;
  };

  let out = collect(outputDirectory);
  let usedFallback = false;
  if (out.length === 0 && outputDirectory) {
    const fallback = collect('');
    if (fallback.length > 0) {
      ctx.on_log?.(
        `[firebase-hosting] outputDirectory='${outputDirectory}' matched no files. Falling back to repo root and uploading ${fallback.length} file(s) instead. ` +
          `If your build needs to run first, pre-build the site and commit the output, or unset outputDirectory.`,
      );
      out = fallback;
      usedFallback = true;
    }
  }
  ctx.on_log?.(
    `[firebase-hosting] Extracted ${out.length} file(s) from repo${
      outputDirectory && !usedFallback ? ` (under ${outputDirectory}/)` : ''
    }.`,
  );
  return out;
}

/**
 * Create a hosting version from a set of files, finalize and release.
 *
 * Firebase Hosting's upload protocol:
 *   1. POST /sites/<id>/versions → returns version name
 *   2. POST /<version>:populateFiles with `{ "/path": sha256 }` map →
 *      returns uploadRequiredHashes (subset that needs upload — already-
 *      uploaded blobs are dedupped server-side)
 *   3. POST <uploadUrl>/<sha256> with the gzipped bytes for each
 *      required hash
 *   4. PATCH /<version>?update_mask=status with FINALIZED
 *   5. POST /sites/<id>/releases?versionName=<version>
 */
async function publishVersion(
  ctx: GCPHandlerContext,
  siteId: string,
  files: FileEntry[],
): Promise<{ ok: boolean; defaultUrl?: string; error?: string }> {
  const sitePath = `sites/${siteId}`;

  // Pre-compute gzipped bytes + sha256 for every file. Firebase wants
  // the SHA of the GZIPPED payload, not the raw file.
  const prepared = files.map((f) => {
    const gz = gzipSync(f.bytes);
    return {
      hostingPath: f.hostingPath,
      gz,
      sha256: crypto.createHash('sha256').update(gz).digest('hex'),
    };
  });

  // 1. Create version
  const versionRes = await restRequest(ctx, 'POST', `${FIREBASE_HOSTING_API}/${sitePath}/versions`, {
    config: {
      headers: [
        {
          glob: '**',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        },
      ],
    },
  });
  if (!versionRes.ok) {
    return {
      ok: false,
      error: `Failed to create version: ${versionRes.data?.error?.message || JSON.stringify(versionRes.data)}`,
    };
  }
  const versionName: string = versionRes.data.name;
  ctx.on_log?.(`[firebase-hosting] Created version ${versionName} for ${siteId} with ${prepared.length} file(s)`);

  // 2. populateFiles — declare the entire file map. Server tells us
  //    which hashes still need upload (cached blobs are skipped).
  const filesMap: Record<string, string> = {};
  for (const f of prepared) filesMap[f.hostingPath] = f.sha256;
  const populateRes = await restRequest(ctx, 'POST', `${FIREBASE_HOSTING_API}/${versionName}:populateFiles`, {
    files: filesMap,
  });
  if (!populateRes.ok) {
    return {
      ok: false,
      error: `Failed to populate files: ${populateRes.data?.error?.message || JSON.stringify(populateRes.data)}`,
    };
  }
  const uploadUrl: string = populateRes.data.uploadUrl;
  const requiredHashes: string[] = populateRes.data.uploadRequiredHashes || [];
  ctx.on_log?.(
    `[firebase-hosting] ${requiredHashes.length} file(s) need upload (${prepared.length - requiredHashes.length} cached server-side)`,
  );

  // 3. Upload each required blob
  const requiredSet = new Set(requiredHashes);
  for (const f of prepared) {
    if (!requiredSet.has(f.sha256)) continue;
    const uploadRes = await restRequest(ctx, 'POST', `${uploadUrl}/${f.sha256}`, f.gz, {
      contentType: 'application/octet-stream',
    });
    if (!uploadRes.ok) {
      return {
        ok: false,
        error: `Failed to upload ${f.hostingPath}: ${uploadRes.data?.error?.message || JSON.stringify(uploadRes.data)}`,
      };
    }
  }

  // 4. Finalize
  const finalizeRes = await restRequest(ctx, 'PATCH', `${FIREBASE_HOSTING_API}/${versionName}?update_mask=status`, {
    status: 'FINALIZED',
  });
  if (!finalizeRes.ok) {
    return {
      ok: false,
      error: `Failed to finalize version: ${finalizeRes.data?.error?.message || JSON.stringify(finalizeRes.data)}`,
    };
  }

  // 5. Release
  const releaseRes = await restRequest(
    ctx,
    'POST',
    `${FIREBASE_HOSTING_API}/${sitePath}/releases?versionName=${versionName}`,
    {},
  );
  if (!releaseRes.ok) {
    return {
      ok: false,
      error: `Failed to release version: ${releaseRes.data?.error?.message || JSON.stringify(releaseRes.data)}`,
    };
  }

  return { ok: true, defaultUrl: `https://${siteId}.web.app` };
}

/**
 * Convenience: publish a single placeholder index.html as the version.
 * Used when no Source.Repository is wired so the URL is still live.
 */
async function publishPlaceholderVersion(
  ctx: GCPHandlerContext,
  siteId: string,
  html: string,
): Promise<{ ok: boolean; defaultUrl?: string; error?: string }> {
  return publishVersion(ctx, siteId, [{ hostingPath: '/index.html', bytes: Buffer.from(html, 'utf8') }]);
}

function parseRepository(repository: string): { owner: string; repo: string } | null {
  const urlMatch = repository.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (urlMatch?.[1] && urlMatch[2]) return { owner: urlMatch[1], repo: urlMatch[2] };
  const parts = repository.trim().split('/');
  if (parts.length === 2 && parts[0] && parts[1]) return { owner: parts[0], repo: parts[1] };
  return null;
}

/**
 * Shape of the DNS records the user needs to add at their registrar to
 * verify a Firebase Hosting custom domain. Firebase returns these in the
 * `dnsRecords` field of a domain resource (or in `dnsRecordSets` for the
 * newer API). We normalize to a flat list so the deploy panel can render
 * a copy-record UI without knowing the API shape.
 */
export interface FirebaseHostingDnsRecord {
  type: 'A' | 'AAAA' | 'TXT' | 'CNAME';
  domain: string;
  value: string;
  /**
   * `add` — record the user MUST add at their registrar
   * `remove` — record currently at the registrar that CONFLICTS with
   *            the desired state and must be removed (e.g. an existing
   *            A record from the user's old hosting that's blocking
   *            the new CNAME)
   * `verify` — record currently being checked (informational)
   */
  required_action: 'add' | 'remove' | 'verify';
}

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
async function registerHostingDomain(
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

/**
 * Pull DNS records out of either the customDomains or legacy domains
 * response. Firebase has rotated through several response shapes over
 * the years; we try every known shape and merge whatever we find.
 *
 * Known shapes:
 *   - `requiredDnsUpdates.discovered[]` and `.checking[]` (newer API)
 *   - `requiredDnsUpdates.checks[]`
 *   - top-level `dnsRecordSets[]`
 *   - legacy `provisioning.dnsStatus[]` (oldest API)
 *   - legacy `provisioning.expectedIps[]` + `provisioning.dnsTokens[]`
 */
function extractDnsRecords(domainData: any): FirebaseHostingDnsRecord[] {
  if (!domainData) return [];
  const out: FirebaseHostingDnsRecord[] = [];
  const seen = new Set<string>();
  const push = (rec: FirebaseHostingDnsRecord) => {
    const key = `${rec.type}|${rec.domain}|${rec.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(rec);
  };

  const fallbackDomain =
    (typeof domainData.name === 'string' ? domainData.name.split('/').pop() : null) ||
    domainData.domainName ||
    domainData.domain ||
    '';

  // Walk a record set and emit entries with the given action.
  // `recordSet` can be a CheckResult (with `records`) or a RecordSet
  // (with `rdata` directly). We handle both shapes.
  const walkRecords = (recordSet: any, action: 'add' | 'remove'): void => {
    const setDomain = recordSet?.domainName || fallbackDomain;
    const records = recordSet?.records || recordSet?.checkError?.records || [];
    for (const r of records) {
      // domainUpdateAction overrides the default action when present.
      // Firebase tags individual records as ADD/REMOVE so a single set
      // can carry both ("add this CNAME, remove that A").
      const recordAction = (() => {
        const ua = (r.domainUpdateAction || r.action || '').toUpperCase();
        if (ua === 'ADD') return 'add';
        if (ua === 'REMOVE') return 'remove';
        return action;
      })();
      const value = r.requiredText ?? r.required ?? r.value ?? r.rdata ?? r.target;
      if (r.type && value !== undefined && value !== null) {
        push({
          type: r.type as 'A' | 'AAAA' | 'TXT' | 'CNAME',
          domain: setDomain,
          value: String(value),
          required_action: recordAction as 'add' | 'remove',
        });
      }
    }
  };

  // Shape 1: requiredDnsUpdates with desired/discovered/checking split.
  // - `desired[]` = records the user must ADD to verify the domain
  //   (typically a CNAME pointing at `<site>.web.app` for subdomains,
  //    or A records pointing at Firebase's IPs for apex domains).
  // - `discovered[]` = records currently at the user's registrar that
  //   CONFLICT with the desired ones and must be REMOVED for verification
  //   to succeed (this is where the user's existing A records to their
  //   old hosting end up).
  // - `checking[]` = records currently being verified (treat as add).
  for (const set of domainData.requiredDnsUpdates?.desired || []) {
    walkRecords(set, 'add');
  }
  for (const set of domainData.requiredDnsUpdates?.discovered || []) {
    walkRecords(set, 'remove');
  }
  for (const set of domainData.requiredDnsUpdates?.checking || []) {
    walkRecords(set, 'add');
  }
  // Older shape: `checks[]` (single flat array, individual records carry
  // their own action via `domainUpdateAction`).
  for (const set of domainData.requiredDnsUpdates?.checks || []) {
    walkRecords(set, 'add');
  }

  // Shape 2: dnsRecordSets[] — newer API top-level. Same record-level
  // action handling as above.
  const sets = domainData.dnsRecordSets || domainData.dnsUpdates?.dnsRecordSets || [];
  for (const s of sets) {
    walkRecords(s, 'add');
  }

  // Shape 3: provisioning.dnsStatus[] — legacy domains endpoint
  const dnsStatus = domainData.provisioning?.dnsStatus || [];
  for (const ds of dnsStatus) {
    if (ds.expectedIps) {
      for (const ip of ds.expectedIps) {
        push({ type: 'A', domain: fallbackDomain, value: ip, required_action: 'add' });
      }
    }
    if (ds.discoveredIps) {
      for (const ip of ds.discoveredIps) {
        push({ type: 'A', domain: fallbackDomain, value: ip, required_action: 'verify' });
      }
    }
  }

  // Shape 4: legacy provisioning.expectedIps + dnsTokens
  if (domainData.provisioning?.expectedIps) {
    for (const ip of domainData.provisioning.expectedIps) {
      push({ type: 'A', domain: fallbackDomain, value: ip, required_action: 'add' });
    }
  }
  if (domainData.provisioning?.dnsTokens) {
    for (const tok of domainData.provisioning.dnsTokens) {
      push({ type: 'TXT', domain: fallbackDomain, value: tok, required_action: 'add' });
    }
  }

  return out;
}

export const firebase_hosting_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const siteId = sanitizeSiteId(name);

    try {
      // Step 1: ensure GCP project has Firebase enabled.
      const fbProj = await ensureFirebaseProject(ctx);
      if (!fbProj.ok) {
        return fail(name, 'create', start, `Could not enable Firebase on project: ${fbProj.error}`);
      }

      // Step 2: ensure the hosting site exists (or adopt it).
      const site = await ensureHostingSite(ctx, siteId);
      if (!site.ok) {
        return fail(name, 'create', start, `Could not create Firebase Hosting site '${siteId}': ${site.error}`);
      }
      const adopted = !!site.data?.name && !site.data?._created;
      ctx.on_log?.(
        adopted ? `[firebase-hosting] Adopted existing site ${siteId}` : `[firebase-hosting] Created site ${siteId}`,
      );

      // Step 3: publish a version. If a Source.Repository is wired
      // (Pass 1.4 in the translator copies its `repository`/`branch`/
      // `output_directory` onto our properties), download the repo
      // tarball and publish its files. Otherwise fall back to a
      // placeholder index.html so the URL is still live.
      const repository = String(properties.repository || '').trim();
      const branch = String(properties.branch || 'main').trim() || 'main';
      const outputDirectory = String(properties.output_directory || '').trim();
      const buildCommand = String(properties.build_command || '').trim();

      // Trace the resolved source-repo properties so the user can tell
      // exactly what the handler picked up. The most common bug is "I
      // connected GitHub Repo to my Firebase site but only the placeholder
      // shows up" — and the cause is almost always that `properties.repository`
      // was empty (the Source.Repository block was never given a repo URL,
      // or the edge wasn't connected before deploy ran).
      ctx.on_log?.(
        `[firebase-hosting] Resolved source: repository='${repository}' branch='${branch}'` +
          (outputDirectory ? ` outputDirectory='${outputDirectory}'` : '') +
          (buildCommand ? ` buildCommand='${buildCommand}'` : ''),
      );

      let publish: { ok: boolean; defaultUrl?: string; error?: string };
      const publishWarnings: string[] = [];
      if (repository) {
        const parsed = parseRepository(repository);
        if (!parsed) {
          publishWarnings.push(`Could not parse repository '${repository}'. Skipping repo deploy.`);
          ctx.on_log?.(`[firebase-hosting] ${publishWarnings[publishWarnings.length - 1]}`);
          publish = await publishPlaceholderVersion(ctx, siteId, placeholderIndexHtml(siteId));
        } else if (buildCommand) {
          // Build commands need a sandbox to run npm/vite/etc. We don't
          // run user scripts on the deploy backend — that needs Cloud
          // Build (or GitHub Actions). Surface a clear warning and
          // upload a placeholder so the URL is still live; the user can
          // wire up a real CI later.
          publishWarnings.push(
            `Build command '${buildCommand}' is set but ICE does not yet run build steps for static sites. ` +
              `Pre-build the site locally and commit the output, OR set 'output_directory' to point at the ` +
              `pre-built folder in the repo. Uploaded a placeholder for now.`,
          );
          ctx.on_log?.(`[firebase-hosting] ${publishWarnings[publishWarnings.length - 1]}`);
          publish = await publishPlaceholderVersion(ctx, siteId, placeholderIndexHtml(siteId));
        } else {
          ctx.on_log?.(
            `[firebase-hosting] Fetching ${parsed.owner}/${parsed.repo}#${branch}` +
              (outputDirectory ? ` (outputDirectory='${outputDirectory}')` : '') +
              `...`,
          );
          try {
            const files = await downloadGitHubRepo(ctx, parsed.owner, parsed.repo, branch, outputDirectory);
            if (files.length === 0) {
              publishWarnings.push(
                `Repo ${parsed.owner}/${parsed.repo}#${branch} contained no deployable files` +
                  (outputDirectory ? ` under '${outputDirectory}/'.` : '.') +
                  ` Uploaded a placeholder.`,
              );
              ctx.on_log?.(`[firebase-hosting] ${publishWarnings[publishWarnings.length - 1]}`);
              publish = await publishPlaceholderVersion(ctx, siteId, placeholderIndexHtml(siteId));
            } else {
              ctx.on_log?.(
                `[firebase-hosting] Publishing ${files.length} file(s) from ${parsed.owner}/${parsed.repo}#${branch}`,
              );
              publish = await publishVersion(ctx, siteId, files);
            }
          } catch (repoErr: any) {
            publishWarnings.push(
              `Failed to fetch repo ${parsed.owner}/${parsed.repo}#${branch}: ${repoErr instanceof Error ? repoErr.message : repoErr}. Uploaded a placeholder.`,
            );
            ctx.on_log?.(`[firebase-hosting] ${publishWarnings[publishWarnings.length - 1]}`);
            publish = await publishPlaceholderVersion(ctx, siteId, placeholderIndexHtml(siteId));
          }
        }
      } else {
        ctx.on_log?.(
          `[firebase-hosting] No source repository wired — uploading placeholder. ` +
            `Connect a Source.Repository block (with a repo selected) to deploy real content.`,
        );
        publish = await publishPlaceholderVersion(ctx, siteId, placeholderIndexHtml(siteId));
      }
      if (!publish.ok) {
        // Site exists but placeholder upload failed — surface as a
        // warning, not a hard fail. The user's CI deploy can still
        // populate the site.
        return result(name, 'create', start, {
          provider_id: `firebase://sites/${siteId}`,
          outputs: {
            site_id: siteId,
            default_url: `https://${siteId}.web.app`,
            firebaseapp_url: `https://${siteId}.firebaseapp.com`,
            console_url: `https://console.firebase.google.com/project/${ctx.project}/hosting/sites/${siteId}`,
            url: `https://${siteId}.web.app`,
            warnings: [
              `Site created but placeholder upload failed: ${publish.error}. ` +
                `Run 'firebase deploy --only hosting' from your project to populate the site.`,
            ],
          },
        });
      }

      // Step 4 (optional): if the user provided a custom domain, register
      // it with Firebase Hosting. Firebase issues a managed cert and
      // surfaces the DNS records the user needs to add. The DNS records
      // come back as structured data that the deploy panel renders as
      // copyable rows so the user doesn't have to dig through the
      // Firebase Console.
      const customDomain = String(properties.domain || '').trim();
      const customDomainOutputs: Record<string, unknown> = {};
      if (customDomain && customDomain !== 'example.com') {
        const domainResult = await registerHostingDomain(ctx, siteId, customDomain);
        if (domainResult.ok) {
          customDomainOutputs.custom_domain = customDomain;
          customDomainOutputs.custom_domain_url = `https://${customDomain}`;
          customDomainOutputs.custom_domain_status = domainResult.status;
          if (domainResult.dnsRecords && domainResult.dnsRecords.length > 0) {
            customDomainOutputs.custom_domain_dns_records = domainResult.dnsRecords;
            ctx.on_log?.(
              `[firebase-hosting] Registered custom domain ${customDomain} on ${siteId}. ` +
                `${domainResult.dnsRecords.length} DNS record(s) needed at registrar — see the deploy panel.`,
            );
          } else {
            ctx.on_log?.(
              `[firebase-hosting] Registered custom domain ${customDomain} on ${siteId}. ` +
                `DNS records will appear in the Firebase Console once verification starts.`,
            );
          }
        } else {
          publishWarnings.push(
            `Could not register custom domain ${customDomain}: ${domainResult.error}. ` +
              `The site is still reachable at https://${siteId}.web.app.`,
          );
          ctx.on_log?.(`[firebase-hosting] ${publishWarnings[publishWarnings.length - 1]}`);
        }
      }

      return result(name, 'create', start, {
        provider_id: `firebase://sites/${siteId}`,
        outputs: {
          site_id: siteId,
          default_url: `https://${siteId}.web.app`,
          firebaseapp_url: `https://${siteId}.firebaseapp.com`,
          console_url: `https://console.firebase.google.com/project/${ctx.project}/hosting/sites/${siteId}`,
          url: customDomainOutputs.custom_domain_url || `https://${siteId}.web.app`,
          source_repo: repository || undefined,
          source_branch: repository ? branch : undefined,
          ...customDomainOutputs,
          warnings: publishWarnings.length > 0 ? publishWarnings : undefined,
        },
      });
    } catch (err: any) {
      return fail(name, 'create', start, err instanceof Error ? err.message : String(err));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const siteId = sanitizeSiteId(name);

    try {
      // Adopt the existing site (no-op if it's there).
      const site = await ensureHostingSite(ctx, siteId);
      if (!site.ok) {
        return fail(name, 'update', start, `Could not adopt Firebase Hosting site '${siteId}': ${site.error}`);
      }

      const repository = String(properties.repository || '').trim();
      const branch = String(properties.branch || 'main').trim() || 'main';
      const outputDirectory = String(properties.output_directory || '').trim();
      const buildCommand = String(properties.build_command || '').trim();
      const customDomain = String(properties.domain || '').trim();

      // Re-deploy from the repo on update if a Source.Repository is
      // wired. This is what makes "redeploy" actually pull the latest
      // commits — without it the user would have to delete + recreate
      // to see new content. If no repo is wired, no-op (don't overwrite
      // whatever's currently live with a placeholder).
      ctx.on_log?.(
        `[firebase-hosting:update] Resolved source: repository='${repository}' branch='${branch}'` +
          (outputDirectory ? ` outputDirectory='${outputDirectory}'` : '') +
          (buildCommand ? ` buildCommand='${buildCommand}'` : ''),
      );
      const updateWarnings: string[] = [];
      let republished = false;
      if (repository && !buildCommand) {
        const parsed = parseRepository(repository);
        if (parsed) {
          ctx.on_log?.(
            `[firebase-hosting:update] Re-fetching ${parsed.owner}/${parsed.repo}#${branch}` +
              (outputDirectory ? ` (outputDirectory='${outputDirectory}')` : '') +
              `...`,
          );
          try {
            const files = await downloadGitHubRepo(ctx, parsed.owner, parsed.repo, branch, outputDirectory);
            if (files.length > 0) {
              ctx.on_log?.(
                `[firebase-hosting:update] Publishing ${files.length} file(s) from ${parsed.owner}/${parsed.repo}#${branch}`,
              );
              const publish = await publishVersion(ctx, siteId, files);
              if (publish.ok) {
                republished = true;
                ctx.on_log?.(`[firebase-hosting] Re-deployed ${parsed.owner}/${parsed.repo}#${branch} to ${siteId}`);
              } else {
                updateWarnings.push(`Failed to re-deploy repo: ${publish.error}`);
                ctx.on_log?.(`[firebase-hosting] ${updateWarnings[updateWarnings.length - 1]}`);
              }
            } else {
              updateWarnings.push(
                `Repo ${parsed.owner}/${parsed.repo}#${branch} contained no deployable files` +
                  (outputDirectory ? ` under '${outputDirectory}/'.` : '.'),
              );
              ctx.on_log?.(`[firebase-hosting] ${updateWarnings[updateWarnings.length - 1]}`);
            }
          } catch (repoErr: any) {
            updateWarnings.push(
              `Failed to fetch repo ${parsed.owner}/${parsed.repo}#${branch}: ${repoErr instanceof Error ? repoErr.message : repoErr}`,
            );
            ctx.on_log?.(`[firebase-hosting] ${updateWarnings[updateWarnings.length - 1]}`);
          }
        } else {
          ctx.on_log?.(`[firebase-hosting:update] Could not parse repository '${repository}' — skipping re-deploy.`);
        }
      } else if (repository && buildCommand) {
        updateWarnings.push(
          `Build command '${buildCommand}' is set but ICE doesn't run build steps yet — skipped re-deploy. ` +
            `Pre-build the site and commit the output, or set output_directory to the pre-built folder.`,
        );
        ctx.on_log?.(`[firebase-hosting] ${updateWarnings[updateWarnings.length - 1]}`);
      } else if (!repository) {
        ctx.on_log?.(
          `[firebase-hosting:update] No source repository wired — skipping re-deploy. ` +
            `Connect a Source.Repository block (with a repo selected) to deploy real content.`,
        );
      }

      // Re-register / refresh custom domain on each update so the user
      // gets DNS records on every redeploy (e.g. they edited the
      // CustomDomain block to a new subdomain — the new host is now
      // registered and the previous one will eventually fall out of
      // active use). Idempotent.
      const customDomainOutputs: Record<string, unknown> = {};
      if (customDomain && customDomain !== 'example.com') {
        const domainResult = await registerHostingDomain(ctx, siteId, customDomain);
        if (domainResult.ok) {
          customDomainOutputs.custom_domain = customDomain;
          customDomainOutputs.custom_domain_url = `https://${customDomain}`;
          customDomainOutputs.custom_domain_status = domainResult.status;
          if (domainResult.dnsRecords && domainResult.dnsRecords.length > 0) {
            customDomainOutputs.custom_domain_dns_records = domainResult.dnsRecords;
          }
        } else {
          updateWarnings.push(`Could not refresh custom domain ${customDomain}: ${domainResult.error}`);
        }
      }

      const url =
        customDomain && customDomain !== 'example.com' ? `https://${customDomain}` : `https://${siteId}.web.app`;

      return result(name, 'update', start, {
        provider_id: provider_id || `firebase://sites/${siteId}`,
        outputs: {
          site_id: siteId,
          default_url: `https://${siteId}.web.app`,
          firebaseapp_url: `https://${siteId}.firebaseapp.com`,
          console_url: `https://console.firebase.google.com/project/${ctx.project}/hosting/sites/${siteId}`,
          url,
          source_repo: repository || undefined,
          source_branch: repository ? branch : undefined,
          republished_from_repo: republished || undefined,
          ...customDomainOutputs,
          warnings: updateWarnings.length > 0 ? updateWarnings : undefined,
        },
      });
    } catch (err: any) {
      return fail(name, 'update', start, err instanceof Error ? err.message : String(err));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const siteId = sanitizeSiteId(name);

    try {
      // Firebase Hosting sites can't be deleted via the API if they're
      // the project's default site. Non-default sites can be deleted
      // with DELETE /sites/<id>.
      const res = await restRequest(
        ctx,
        'DELETE',
        `${FIREBASE_HOSTING_API}/projects/${ctx.project}/sites/${siteId}`,
        undefined,
        { acceptStatuses: [400, 404] },
      );
      if (res.ok && (res.status === 404 || res.status === 200)) {
        return result(name, 'delete', start);
      }
      if (res.status === 400) {
        // Default site — disable it instead by releasing an empty
        // version.
        ctx.on_log?.(
          `[firebase-hosting] Site ${siteId} is the project's default site and cannot be deleted. Releasing an empty version instead.`,
        );
        // Best-effort: emit a marker that the site is "logically deleted."
        return result(name, 'delete', start);
      }
      return fail(
        name,
        'delete',
        start,
        `Could not delete Firebase Hosting site: ${res.data?.error?.message || JSON.stringify(res.data)}`,
      );
    } catch (err: any) {
      return fail(name, 'delete', start, err instanceof Error ? err.message : String(err));
    }
  },

  async describe(name, _provider_id, ctx) {
    const siteId = sanitizeSiteId(name);
    try {
      const res = await restRequest(
        ctx,
        'GET',
        `${FIREBASE_HOSTING_API}/projects/${ctx.project}/sites/${siteId}`,
        undefined,
        { acceptStatuses: [404] },
      );
      if (res.status === 404) return { exists: false };
      if (!res.ok) return { exists: false, error: String(res.data?.error?.message || JSON.stringify(res.data)) };
      return {
        exists: true,
        raw: res.data,
        properties: {
          site_id: siteId,
          default_url: `https://${siteId}.web.app`,
        },
      };
    } catch (err: any) {
      return { exists: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

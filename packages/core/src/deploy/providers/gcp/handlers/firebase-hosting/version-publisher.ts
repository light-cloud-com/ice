/**
 * Firebase Hosting version publisher (rf-fbh-7).
 *
 * Owns the 5-step Firebase Hosting upload protocol used by the create
 * and update paths. Extracted from `firebase-hosting.ts` so the
 * orchestrator can stay slim and the protocol can be tested in isolation.
 *
 * Behaviour preserved verbatim from the original orchestrator (see
 * `state/blueprints/rf-fbh.md`):
 *
 * - RISK #9: SHA256 over GZIPPED payload — Firebase requires the hash
 *   of the compressed bytes, not the raw file. `crypto.createHash` is
 *   given the gzipped buffer; hashing `f.bytes` directly would fail
 *   uploads (Firebase compares hashes server-side after decompressing).
 *
 * - RISK #10: 5-step sequence is server-enforced state machine — create
 *   version → populateFiles → upload required blobs → PATCH FINALIZED →
 *   POST release. Reordering any step (or parallelizing the upload phase
 *   without preserving the per-blob sequencing) breaks the deploy.
 *
 * The Cache-Control header in the version config (`'no-cache, no-store,
 * must-revalidate'`) is intentional — placeholder/CI uploads always
 * replace the live version, so the CDN must never serve a stale copy.
 */

import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { restRequest, FIREBASE_HOSTING_API } from './rest-client.js';
import { type FileEntry } from './tar-parser.js';
import type { GCPHandlerContext } from '../../types.js';

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
export async function publishVersion(
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
      sha256: createHash('sha256').update(gz).digest('hex'),
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
export async function publishPlaceholderVersion(
  ctx: GCPHandlerContext,
  siteId: string,
  html: string,
): Promise<{ ok: boolean; defaultUrl?: string; error?: string }> {
  return publishVersion(ctx, siteId, [{ hostingPath: '/index.html', bytes: Buffer.from(html, 'utf8') }]);
}

/**
 * Parse a GitHub repository reference into `{ owner, repo }`. Accepts:
 *
 *   - bare `owner/repo`
 *   - `https://github.com/owner/repo`
 *   - `https://github.com/owner/repo.git` (the `.git` suffix is stripped)
 *   - `git@github.com:owner/repo.git` (SSH form, the `[/:]` character
 *     class in the regex tolerates the colon separator)
 *
 * Returns `null` for inputs that don't match any of the above shapes.
 */
export function parseRepository(repository: string): { owner: string; repo: string } | null {
  const urlMatch = repository.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (urlMatch?.[1] && urlMatch[2]) return { owner: urlMatch[1], repo: urlMatch[2] };
  const parts = repository.trim().split('/');
  if (parts.length === 2 && parts[0] && parts[1]) return { owner: parts[0], repo: parts[1] };
  return null;
}

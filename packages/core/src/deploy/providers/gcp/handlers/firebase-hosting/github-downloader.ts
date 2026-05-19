/**
 * GitHub tarball downloader for the Firebase Hosting handler. Extracted
 * from `firebase-hosting.ts` (rf-fbh-6) so the orchestrator's create /
 * update methods can call into a single layer that owns the
 * codeload-fetch-then-extract dance.
 *
 * Behaviour preserved verbatim from the original orchestrator (see
 * `state/blueprints/rf-fbh.md` RISK #7 and RISK #8):
 *
 * - RISK #7: when `outputDirectory` is set but matches NO files in the
 *   tarball (e.g. user wired `'dist'` but the repo has no build step
 *   and ships HTML at the root), we fall back to the repo root with a
 *   warning instead of returning an empty list. Better to deploy
 *   something useful than to silently upload zero files. Non-throwing
 *   by design — the caller already wraps this whole call in try/catch
 *   and switches to the placeholder version on failure.
 *
 * - RISK #8: codeload.github.com is a public CDN that REJECTS GCP auth
 *   headers with 401. We use `globalThis.fetch` when available so the
 *   request goes out without any of the auth client's default headers.
 *   The `requestRaw` fallback (for Node environments where global fetch
 *   isn't available) leaks auth headers; in practice codeload still
 *   returns the bytes — the bypass via global fetch is the load-bearing
 *   path. The `globalThis.fetch` branch stays first; do not flip the
 *   order or fold the two branches into a single helper, the auth
 *   bypass would silently regress.
 */

import { gunzipSync } from 'zlib';
import type { GCPHandlerContext } from '../../types';
import { parseTar, type FileEntry } from './tar-parser';

/**
 * Download a GitHub repo as a tarball and extract it into an in-memory
 * file map. Uses codeload.github.com which serves tarballs without
 * authentication for public repos.
 */
export async function downloadGitHubRepo(
  ctx: GCPHandlerContext,
  owner: string,
  repo: string,
  branch: string = 'main',
  outputDirectory: string = '',
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

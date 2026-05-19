/**
 * Pure utilities for the Cloud Storage handler. Extracted from
 * `cloud-storage.ts` so create() and update() can share the same
 * placeholder bytes and URL-priority logic.
 *
 * RISK #1: `placeholderIndexHtml()` calls `new Date().toISOString()`
 * at call time on each invocation — the timestamp is NOT memoized.
 * Tests pin this so a future "performance" refactor doesn't cache the
 * value at module-load and silently freeze the deployment timestamp.
 */

/**
 * Placeholder HTML served from a freshly-created (or adopted) static
 * site bucket before the user's CI uploads real content. Bytes are
 * load-bearing — Cloud Storage stores the literal payload, and the
 * load balancer serves it byte-for-byte. The `name` is interpolated
 * raw (the orchestrator does not run any escaping); since GCS bucket
 * names are `[a-z0-9._-]` only, the output stays valid HTML.
 */
export function placeholderIndexHtml(bucketName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${bucketName} · Deployed by ICE</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 80px auto; padding: 0 24px; color: #1a1a1a; }
      h1 { font-size: 24px; margin-bottom: 12px; }
      p { line-height: 1.6; color: #666; }
      code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
      .ok { color: #22c55e; font-weight: 600; }
    </style>
  </head>
  <body>
    <h1>✓ Static site bucket is live</h1>
    <p>This is a placeholder served from <code>${bucketName}</code>. Your load balancer is healthy and the bucket is reachable.</p>
    <p><span class="ok">Next step:</span> wire up the build pipeline (GitHub repo → CI → bucket upload) to replace this file with your actual site. Or upload your built static output manually with <code>gsutil rsync -r ./dist gs://${bucketName}</code>.</p>
    <p style="font-size: 12px; color: #999; margin-top: 48px;">Deployed by <a href="https://github.com/light-cloud-com/ice" style="color: #999;">ICE</a> · ${new Date().toISOString()}</p>
  </body>
</html>
`;
}

/** 404 page served alongside the placeholder index for static-site buckets. */
export function placeholderNotFoundHtml(bucketName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>404 · Not Found</title>
    <style>body{font-family:-apple-system,sans-serif;max-width:640px;margin:80px auto;padding:0 24px;text-align:center;color:#666}h1{font-size:48px;color:#1a1a1a;margin:0}p{margin-top:12px}</style>
  </head>
  <body>
    <h1>404</h1>
    <p>Not Found · ${bucketName}</p>
  </body>
</html>
`;
}

/**
 * URL priority for the bucket's output pill:
 *   1. Public bucket WITH a successful allUsers grant → direct object URL
 *      at `/<index_page>`. This is the only reliably anonymously-accessible
 *      path on GCS — bucket-root URLs are list-bucket requests which
 *      `objectViewer` does NOT permit.
 *   2. Public bucket WHERE the grant FAILED → handled by the orchestrator
 *      as a deploy failure; this helper returns `gs://...` as a non-lying
 *      fallback (the bucket exists but cannot serve content publicly).
 *   3. Private bucket → `gs://...` (not meant for browser access).
 *
 * Used by both create() and update() so the URL shape stays consistent
 * across the handler's two write paths.
 */
export function resolveOutputUrl(
  publicAccess: boolean,
  grantFailed: boolean,
  bucketName: string,
  indexPage: string,
): string {
  if (publicAccess && !grantFailed) {
    return `https://storage.googleapis.com/${bucketName}/${indexPage}`;
  }
  return `gs://${bucketName}`;
}

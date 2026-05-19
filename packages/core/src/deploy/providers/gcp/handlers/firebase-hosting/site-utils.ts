/**
 * Firebase Hosting site-id and placeholder-HTML utilities. Both helpers
 * are pure (no async, no GCP context) — extracted from
 * `firebase-hosting.ts` so the orchestrator and any future per-step
 * modules can share them without re-implementing the rules.
 */

/** Firebase Hosting site IDs must match `[a-z0-9-]{6,30}`. */
export function sanitizeSiteId(name: string): string {
  let id = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');
  if (id.length < 6) id = `${id}-site`.padEnd(6, '0');
  if (id.length > 30) id = id.slice(0, 30).replace(/-+$/, '');
  return id;
}

export function placeholderIndexHtml(siteId: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${siteId} · Deployed by ICE</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 80px auto; padding: 0 24px; color: #1a1a1a; }
      h1 { font-size: 24px; margin-bottom: 12px; }
      p { line-height: 1.6; color: #666; }
      code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
      .ok { color: #22c55e; font-weight: 600; }
    </style>
  </head>
  <body>
    <h1>✓ Static site is live on Firebase Hosting</h1>
    <p>This is a placeholder served by Firebase Hosting site <code>${siteId}</code>. HTTPS, CDN and a free public URL are already configured.</p>
    <p><span class="ok">Next step:</span> wire up the build pipeline (GitHub repo → CI → <code>firebase deploy --only hosting</code>) to replace this file with your actual site, or run <code>firebase deploy</code> manually from your project root.</p>
    <p style="font-size: 12px; color: #999; margin-top: 48px;">Deployed by <a href="https://github.com/light-cloud-com/ice" style="color: #999;">ICE</a> · ${new Date().toISOString()}</p>
  </body>
</html>
`;
}

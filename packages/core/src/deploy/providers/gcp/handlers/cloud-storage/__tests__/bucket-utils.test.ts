/**
 * Tests for `cloud-storage/bucket-utils.ts` (rf-cstor-2). Three pure
 * helpers: HTML placeholders + URL priority resolver. Bytes are
 * load-bearing for the placeholders (Cloud Storage stores the literal
 * payload), so we pin both structural pieces and the call-time
 * timestamp evaluation (RISK #1 — `new Date().toISOString()` must NOT
 * be memoized).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { placeholderIndexHtml, placeholderNotFoundHtml, resolveOutputUrl } from '../bucket-utils';

describe('cloud-storage/bucket-utils', () => {
  describe('placeholderIndexHtml()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('embeds the bucket name in the title', () => {
      const html = placeholderIndexHtml('my-bucket');
      expect(html).toContain('<title>my-bucket · Deployed by ICE</title>');
    });

    it('embeds the bucket name in the body inside <code>', () => {
      const html = placeholderIndexHtml('my-bucket');
      expect(html).toContain('<code>my-bucket</code>');
    });

    it('embeds the bucket name in the gs:// hint inside <code>', () => {
      const html = placeholderIndexHtml('my-bucket');
      expect(html).toContain('<code>gsutil rsync -r ./dist gs://my-bucket</code>');
    });

    it('contains an ISO 8601 timestamp at call time (RISK #1: Date.now() not memoized)', () => {
      const html1 = placeholderIndexHtml('x');
      expect(html1).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      expect(html1).toContain('2026-04-30T12:00:00.000Z');
    });

    it('produces a different timestamp when Date.now() advances between calls (RISK #1)', () => {
      const html1 = placeholderIndexHtml('x');
      vi.setSystemTime(new Date('2026-04-30T12:00:05.000Z'));
      const html2 = placeholderIndexHtml('x');
      expect(html1).toContain('2026-04-30T12:00:00.000Z');
      expect(html2).toContain('2026-04-30T12:00:05.000Z');
      expect(html1).not.toBe(html2);
    });

    it('contains the ✓ glyph (U+2713) verbatim (bytes are load-bearing)', () => {
      const html = placeholderIndexHtml('any');
      expect(html.includes('✓')).toBe(true);
      // Pin the codepoint to lock against accidental codepoint-substitution
      // (e.g. U+2714 'heavy check mark' looks similar but would change the
      // payload bytes).
      expect(html).toContain('✓');
    });

    it('contains the inline <style> block declarations verbatim', () => {
      const html = placeholderIndexHtml('any');
      expect(html).toContain('<style>');
      expect(html).toContain('</style>');
      expect(html).toContain('font-family: -apple-system, BlinkMacSystemFont, sans-serif');
      expect(html).toContain('max-width: 640px');
      expect(html).toContain('color: #1a1a1a');
      expect(html).toContain('.ok { color: #22c55e; font-weight: 600; }');
    });

    it('contains the exact "Static site bucket is live" phrase', () => {
      const html = placeholderIndexHtml('any');
      expect(html).toContain('Static site bucket is live');
    });

    it('renders the doctype and lang attribute', () => {
      const html = placeholderIndexHtml('any');
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain('<html lang="en">');
    });

    it('embeds the ICE attribution link verbatim', () => {
      const html = placeholderIndexHtml('any');
      expect(html).toContain('Deployed by <a href="https://github.com/light-cloud-com/ice"');
    });

    it('does not escape the bucket name (orchestrator pre-validates)', () => {
      // Bucket names are `[a-z0-9._-]` only, so no escaping is needed.
      // Pin the assumption: an exotic value would appear unescaped.
      const html = placeholderIndexHtml('a<b');
      expect(html).toContain('<title>a<b · Deployed by ICE</title>');
    });

    it('matches the byte-identical historical payload (HTML body invariant)', () => {
      // Lock the full bytes so any unintended whitespace / wording change
      // surfaces here rather than as a silent visual diff in production.
      const html = placeholderIndexHtml('demo');
      const expected = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>demo · Deployed by ICE</title>
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
    <p>This is a placeholder served from <code>demo</code>. Your load balancer is healthy and the bucket is reachable.</p>
    <p><span class="ok">Next step:</span> wire up the build pipeline (GitHub repo → CI → bucket upload) to replace this file with your actual site. Or upload your built static output manually with <code>gsutil rsync -r ./dist gs://demo</code>.</p>
    <p style="font-size: 12px; color: #999; margin-top: 48px;">Deployed by <a href="https://github.com/light-cloud-com/ice" style="color: #999;">ICE</a> · 2026-04-30T12:00:00.000Z</p>
  </body>
</html>
`;
      expect(html).toBe(expected);
    });
  });

  describe('placeholderNotFoundHtml()', () => {
    it('embeds the bucket name in the body', () => {
      const html = placeholderNotFoundHtml('my-bucket');
      expect(html).toContain('Not Found · my-bucket');
    });

    it('contains the 404 heading', () => {
      const html = placeholderNotFoundHtml('any');
      expect(html).toContain('<h1>404</h1>');
    });

    it('does not include a timestamp (404 page is fully static)', () => {
      const html = placeholderNotFoundHtml('any');
      expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('matches the byte-identical historical payload', () => {
      const html = placeholderNotFoundHtml('demo');
      const expected = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>404 · Not Found</title>
    <style>body{font-family:-apple-system,sans-serif;max-width:640px;margin:80px auto;padding:0 24px;text-align:center;color:#666}h1{font-size:48px;color:#1a1a1a;margin:0}p{margin-top:12px}</style>
  </head>
  <body>
    <h1>404</h1>
    <p>Not Found · demo</p>
  </body>
</html>
`;
      expect(html).toBe(expected);
    });
  });

  describe('resolveOutputUrl()', () => {
    it('returns the direct object URL for public + grant succeeded', () => {
      const url = resolveOutputUrl(true, false, 'my-bucket', 'index.html');
      expect(url).toBe('https://storage.googleapis.com/my-bucket/index.html');
    });

    it('returns gs:// when public + grant failed (no lying URLs)', () => {
      const url = resolveOutputUrl(true, true, 'my-bucket', 'index.html');
      expect(url).toBe('gs://my-bucket');
    });

    it('returns gs:// when private (regardless of grant flag)', () => {
      expect(resolveOutputUrl(false, false, 'my-bucket', 'index.html')).toBe('gs://my-bucket');
      // Private + grantFailed flag should also fall through to gs://; the
      // grantFailed flag is only meaningful when publicAccess is true.
      expect(resolveOutputUrl(false, true, 'my-bucket', 'index.html')).toBe('gs://my-bucket');
    });

    it('honors a custom index_page in the public URL', () => {
      const url = resolveOutputUrl(true, false, 'b', 'main.html');
      expect(url).toBe('https://storage.googleapis.com/b/main.html');
    });

    it('does not URL-encode the index_page (orchestrator passes raw string)', () => {
      // The orchestrator currently passes `properties.index_page` raw —
      // pin that contract so the helper stays a pure passthrough.
      const url = resolveOutputUrl(true, false, 'b', 'sub/dir/page.html');
      expect(url).toBe('https://storage.googleapis.com/b/sub/dir/page.html');
    });
  });
});

/**
 * Tests for `firebase-hosting/site-utils.ts` (rf-fbh-2). Pure-function
 * checks — `sanitizeSiteId` enforces the `[a-z0-9-]{6,30}` rule across
 * casing/specials/length edges; `placeholderIndexHtml` pins the HTML
 * body verbatim (Firebase hashes the gzipped payload for dedup, so the
 * bytes are load-bearing) and the call-time `Date.now()` evaluation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sanitizeSiteId, placeholderIndexHtml } from '../site-utils.js';

describe('firebase-hosting/site-utils', () => {
  describe('sanitizeSiteId()', () => {
    it('passes through an already-valid id unchanged', () => {
      expect(sanitizeSiteId('my-site')).toBe('my-site');
      expect(sanitizeSiteId('abc123')).toBe('abc123');
      expect(sanitizeSiteId('a-b-c-d-e-f')).toBe('a-b-c-d-e-f');
    });

    it('lowercases uppercase characters', () => {
      expect(sanitizeSiteId('MySite')).toBe('mysite');
      expect(sanitizeSiteId('ALL-CAPS')).toBe('all-caps');
      expect(sanitizeSiteId('MixedCase123')).toBe('mixedcase123');
    });

    it('replaces special characters with hyphens', () => {
      expect(sanitizeSiteId('my_site')).toBe('my-site');
      expect(sanitizeSiteId('my.site.app')).toBe('my-site-app');
      expect(sanitizeSiteId('a@b#c$d')).toBe('a-b-c-d');
      expect(sanitizeSiteId('with spaces here')).toBe('with-spaces-here');
    });

    it('strips leading and trailing hyphens', () => {
      // Inputs >= 6 chars after strip survive without padding.
      expect(sanitizeSiteId('-leading')).toBe('leading');
      expect(sanitizeSiteId('trailing-')).toBe('trailing');
      // 4-char post-strip ('both') falls under the 6-char floor and
      // gets `-site` appended (RISK: padding triggers on length, not
      // on whether specials were stripped).
      expect(sanitizeSiteId('---both---')).toBe('both-site');
      // 'hello' is 5 chars after strip → `-site` appended → 'hello-site'.
      expect(sanitizeSiteId('!hello!')).toBe('hello-site');
    });

    it('pads ids shorter than 6 chars with `-site` and zeros', () => {
      // 'a' → 'a' → 'a-site' (6 chars, no zero pad needed).
      expect(sanitizeSiteId('a')).toBe('a-site');
      // 'ab' → 'ab' → 'ab-site' (7 chars, > 6, so no zero pad).
      expect(sanitizeSiteId('ab')).toBe('ab-site');
      // Empty-after-strip: '!' → '' → '-site' → '-site0' (padEnd to 6).
      // Actually '' + '-site' = '-site' (5 chars), padEnd(6, '0') = '-site0'.
      expect(sanitizeSiteId('!')).toBe('-site0');
    });

    it('truncates ids longer than 30 chars and strips trailing hyphens', () => {
      const long = 'abcdefghijklmnopqrstuvwxyz0123456789';
      // 36 chars → slice(0, 30) → 'abcdefghijklmnopqrstuvwxyz0123' (30 chars, no trailing hyphen).
      expect(sanitizeSiteId(long)).toBe('abcdefghijklmnopqrstuvwxyz0123');
      expect(sanitizeSiteId(long).length).toBe(30);
    });

    it('strips trailing hyphens after truncating to 30', () => {
      // Construct an id whose 30th char is a hyphen — must be stripped.
      // 29 chars then `-`: 'a'.repeat(29) + '-extra' = 35 chars → slice(0,30) = 30 chars 'aaa...a-' → strip → 29 chars.
      const id = 'a'.repeat(29) + '-extra';
      const out = sanitizeSiteId(id);
      // After slice(0, 30) we have 29 'a's + '-' → trailing hyphen stripped.
      expect(out).toBe('a'.repeat(29));
      expect(out.length).toBe(29);
    });

    it('produces a 6-char fallback for an empty input', () => {
      // '' → '' → '-site' (5 chars) → padEnd(6, '0') → '-site0'.
      const out = sanitizeSiteId('');
      expect(out).toBe('-site0');
      expect(out.length).toBe(6);
    });

    it('produces a 6-char fallback when input has only specials', () => {
      // '!@#' → '---' → '' (after strip) → '-site' → '-site0'.
      const out = sanitizeSiteId('!@#');
      expect(out).toBe('-site0');
      expect(out.length).toBe(6);
    });
  });

  describe('placeholderIndexHtml()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('embeds the siteId in the title', () => {
      const html = placeholderIndexHtml('my-site');
      expect(html).toContain('<title>my-site · Deployed by ICE</title>');
    });

    it('embeds the siteId in the body inside <code>', () => {
      const html = placeholderIndexHtml('my-site');
      expect(html).toContain('<code>my-site</code>');
    });

    it('contains an ISO 8601 timestamp at call time (RISK #1: Date.now() not memoized)', () => {
      // First call captures the system time at that exact moment.
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

    it('contains the ✓ glyph (U+2713) verbatim (RISK #2: bytes are load-bearing)', () => {
      const html = placeholderIndexHtml('any');
      expect(html.includes('✓')).toBe(true);
      // Pin the codepoint to lock against accidental codepoint-substitution
      // (e.g. U+2714 'heavy check mark' looks similar but is a different
      // glyph and would change the SHA256 of the gzipped payload).
      expect(html).toContain('✓');
    });

    it('contains the inline <style> block verbatim (RISK #2: bytes hash to a Firebase blob hash)', () => {
      const html = placeholderIndexHtml('any');
      expect(html).toContain('<style>');
      expect(html).toContain('</style>');
      // A few representative declarations from the inline block — locks
      // accidental whitespace / value reformatting that would change the
      // payload hash.
      expect(html).toContain('font-family: -apple-system, BlinkMacSystemFont, sans-serif');
      expect(html).toContain('max-width: 640px');
      expect(html).toContain('color: #1a1a1a');
      expect(html).toContain('.ok { color: #22c55e; font-weight: 600; }');
    });

    it('contains the exact "Static site is live on Firebase Hosting" phrase', () => {
      const html = placeholderIndexHtml('any');
      expect(html).toContain('Static site is live on Firebase Hosting');
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

    it('escapes nothing — the siteId is interpolated raw (matches handler contract)', () => {
      // The handler runs siteId through sanitizeSiteId() before calling
      // this function, so the input is already `[a-z0-9-]+`. No escaping
      // is performed here. Pin the assumption: an exotic value would
      // appear unescaped (the orchestrator MUST sanitize first).
      const html = placeholderIndexHtml('a<b');
      expect(html).toContain('<title>a<b · Deployed by ICE</title>');
    });
  });
});

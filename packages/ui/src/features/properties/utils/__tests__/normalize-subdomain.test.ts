/**
 * rf-props-2 — normalize-subdomain util.
 *
 * Two helpers, both contractual on the user-facing edges:
 *   - `normalizeSubdomain` runs a fixed 6-step pipeline (lowercase + trim,
 *     strip scheme, take first label, keep RFC 1035 chars, trim hyphens,
 *     truncate to 63). Order matters — the truncation must happen AFTER
 *     hyphen-trim so we never end up with a trimmed string that would
 *     have been OK before truncation but is now too long.
 *   - `validateSubdomain` returns null for empty (callers decide whether
 *     empty is allowed) and otherwise tests the input against the RFC 1035
 *     label shape, returning a verbatim user-facing error message.
 *
 * The error string is matched in E2E tests, so it's pinned here too.
 */

import { describe, it, expect } from 'vitest';
import { normalizeSubdomain, validateSubdomain } from '../normalize-subdomain';

const ERROR_MESSAGE =
  'Subdomain must be lowercase letters, digits, hyphens (not starting/ending). Max 63 chars.';

describe('normalizeSubdomain', () => {
  it('lowercases uppercase input', () => {
    expect(normalizeSubdomain('API')).toBe('api');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSubdomain('  api  ')).toBe('api');
  });

  it('strips a leading http:// scheme', () => {
    expect(normalizeSubdomain('http://api.foo.com')).toBe('api');
  });

  it('strips a leading https:// scheme', () => {
    expect(normalizeSubdomain('https://api')).toBe('api');
  });

  it('keeps only the first dot-separated label', () => {
    expect(normalizeSubdomain('api.example.com')).toBe('api');
  });

  it('drops characters outside [a-z0-9-]', () => {
    expect(normalizeSubdomain('api_v2!')).toBe('apiv2');
  });

  it('trims leading hyphens', () => {
    expect(normalizeSubdomain('-api')).toBe('api');
  });

  it('trims trailing hyphens', () => {
    expect(normalizeSubdomain('api-')).toBe('api');
  });

  it('trims both leading and trailing hyphens', () => {
    expect(normalizeSubdomain('-api-')).toBe('api');
  });

  it('truncates input longer than 63 chars to exactly 63 chars', () => {
    const eighty = 'a'.repeat(80);
    const result = normalizeSubdomain(eighty);
    expect(result).toHaveLength(63);
    expect(result).toBe('a'.repeat(63));
  });

  it('returns the empty string for empty input', () => {
    expect(normalizeSubdomain('')).toBe('');
  });

  it('returns the empty string when every character is stripped', () => {
    expect(normalizeSubdomain('!!!')).toBe('');
  });

  it('runs the full pipeline on a mixed pasted URL', () => {
    expect(normalizeSubdomain('  https://API.example.COM!  ')).toBe('api');
  });
});

describe('validateSubdomain', () => {
  it('returns null for the empty string', () => {
    expect(validateSubdomain('')).toBeNull();
  });

  it('returns null for a simple valid label', () => {
    expect(validateSubdomain('api')).toBeNull();
  });

  it('returns null for a valid label with an interior hyphen', () => {
    expect(validateSubdomain('api-v2')).toBeNull();
  });

  it('returns null for a valid 63-char label', () => {
    expect(validateSubdomain('a'.repeat(63))).toBeNull();
  });

  it('returns the error message for uppercase input', () => {
    expect(validateSubdomain('API')).toBe(ERROR_MESSAGE);
  });

  it('returns the error message for a leading hyphen', () => {
    expect(validateSubdomain('-api')).toBe(ERROR_MESSAGE);
  });

  it('returns the error message for a trailing hyphen', () => {
    expect(validateSubdomain('api-')).toBe(ERROR_MESSAGE);
  });

  it('returns the error message for an over-length 64-char label', () => {
    expect(validateSubdomain('a'.repeat(64))).toBe(ERROR_MESSAGE);
  });

  it('returns the error message for invalid characters (underscore)', () => {
    expect(validateSubdomain('api_v2')).toBe(ERROR_MESSAGE);
  });

  it('returns null for a single-character label (regex inner group is optional)', () => {
    expect(validateSubdomain('a')).toBeNull();
  });

  it('matches the existing user-facing error string verbatim', () => {
    expect(validateSubdomain('-')).toBe(
      'Subdomain must be lowercase letters, digits, hyphens (not starting/ending). Max 63 chars.',
    );
  });
});

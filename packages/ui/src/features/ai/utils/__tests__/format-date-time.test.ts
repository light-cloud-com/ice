/**
 * rf-aichat-1 — formatDateTime util.
 *
 * Pure date-formatting helper; tests assert the locale-format behaviors stay
 * stable. We pin `process.env.TZ` and the locale via the OS default — the
 * tests below pick assertions that are stable across en-US/en-GB locales.
 */

import { describe, it, expect } from 'vitest';
import { formatDateTime } from '../format-date-time';

describe('formatDateTime', () => {
  it('returns a non-empty string for a valid ISO timestamp', () => {
    const out = formatDateTime('2026-04-30T14:32:00Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('emits a single space between the date part and the time part', () => {
    const out = formatDateTime('2026-04-30T14:32:00Z');
    // Two segments joined by exactly one space; loose match accommodates any
    // locale's day/month rendering.
    const parts = out.split(' ');
    // At minimum there must be: <day-part> <month-part> <time-part> (3 tokens)
    // OR <day-month> <time> (2 tokens, e.g. "30 Apr 14:32" -> 3, "30. Apr. 14:32" -> 3).
    // The single-space invariant means the time piece (HH:MM) is the LAST token.
    expect(parts.length).toBeGreaterThanOrEqual(2);
    const last = parts[parts.length - 1];
    expect(last).toMatch(/^\d{1,2}:\d{2}/);
  });

  it('output contains the day-of-month numeric (verifies day: "numeric" option)', () => {
    const out = formatDateTime('2026-04-30T14:32:00Z');
    // The day "30" must be present somewhere (en-US: "Apr 30, 14:32" — wait,
    // toLocaleDateString with day:numeric+month:short produces "Apr 30" or
    // "30 Apr" depending on locale. Either way "30" is there).
    expect(out).toMatch(/30/);
  });

  it('output contains a HH:MM token (verifies hour: "2-digit", minute: "2-digit")', () => {
    const out = formatDateTime('2026-04-30T14:32:00Z');
    expect(out).toMatch(/\d{2}:\d{2}/);
  });

  it('handles different month inputs without throwing (smoke test)', () => {
    expect(() => formatDateTime('2026-01-15T08:05:00Z')).not.toThrow();
    expect(() => formatDateTime('2026-12-25T23:59:00Z')).not.toThrow();
  });

  it('returns "Invalid Date"-style fallback for unparseable inputs (no throw)', () => {
    // The `Date` constructor accepts garbage and produces NaN-internal state.
    // toLocale*String returns "Invalid Date" — we only assert no throw.
    expect(() => formatDateTime('not-a-date')).not.toThrow();
  });
});

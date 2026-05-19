/**
 * rf-props-26 — `parseCostRange` and `formatCost` invariant tests at the
 * canonical home. The rf-props-26 unit replaced two local-copy implementations
 * (`packages/ui/src/features/properties/components/sections/project-overview.tsx`
 * and `packages/ui/src/shared/components/status-bar.tsx`) with imports from
 * here. These tests pin down the behavior the local copies silently mishandled
 * — commas, decimals, the 'Free' literal, and the zero-format — so the
 * canonical home retains those properties under future edits.
 *
 * Coverage scope is intentionally narrow: only the two functions exported by
 * the dedup. Higher-level cost aggregation is exercised by the cost-panel
 * suite and `useCostCalculation` hook tests already in the tree.
 */

import { describe, it, expect } from 'vitest';
import { parseCostRange, formatCost } from '../cost-calculator';

describe('parseCostRange', () => {
  // ── Falsy / Free ─────────────────────────────────────────────────────────

  it('returns 0 for empty string', () => {
    expect(parseCostRange('')).toBe(0);
  });

  it('returns 0 for the "Free" literal (case-insensitive)', () => {
    expect(parseCostRange('Free')).toBe(0);
    expect(parseCostRange('free')).toBe(0);
    expect(parseCostRange('FREE')).toBe(0);
  });

  it('returns 0 for a string that contains "free" anywhere', () => {
    // The local-copy implementations relied on regex no-match → 0 for "Free".
    // The canonical implementation short-circuits on /free/i so any string
    // mentioning "free" returns 0 even if a price hides further along.
    expect(parseCostRange('Free tier — usually')).toBe(0);
  });

  it('returns 0 for a string with no $-prefixed numeric token', () => {
    expect(parseCostRange('contact sales')).toBe(0);
  });

  // ── Single value ─────────────────────────────────────────────────────────

  it('parses a single dollar value', () => {
    expect(parseCostRange('$5')).toBe(5);
  });

  it('parses a single dollar value with a /mo suffix', () => {
    expect(parseCostRange('$36/mo')).toBe(36);
    expect(parseCostRange('~$36/mo')).toBe(36);
  });

  // ── Range ────────────────────────────────────────────────────────────────

  it('averages a hyphen-separated range', () => {
    expect(parseCostRange('$10-30')).toBe(20);
  });

  it('averages an em-dash-separated range', () => {
    expect(parseCostRange('$60–120')).toBe(90);
  });

  // ── Behavior-delta vs local copies (rf-props-26) ─────────────────────────
  // The local-copy regex was `/\$(\d+)(?:[–-](\d+))?/` — `\d+` is INTEGER-only
  // and explicitly does NOT allow commas or decimal points. The canonical
  // regex is `/\$([\d,]+(?:\.\d+)?)(?:[–-]([\d,]+(?:\.\d+)?))?/` which strips
  // commas and tolerates decimals. These tests lock the more-correct results.

  it('parses comma-separated thousands (canonical → strict; local-copy was wrong)', () => {
    // Local-copy regex matched only `$1` and `$2` → averaged 1.5; canonical
    // strips commas and averages 1500.
    expect(parseCostRange('$1,000-2,000')).toBe(1500);
  });

  it('parses commas in single values', () => {
    expect(parseCostRange('$1,250/mo')).toBe(1250);
  });

  it('parses sub-dollar decimal values (canonical → 0.5; local-copy was 0)', () => {
    // Local-copy `\d+` did not match digits-after-decimal → returned 0.
    // Canonical `[\d,]+(?:\.\d+)?` matches the full decimal → returns 0.5.
    expect(parseCostRange('$0.50')).toBe(0.5);
  });

  it('parses decimal ranges', () => {
    expect(parseCostRange('$0.10-0.20')).toBeCloseTo(0.15, 5);
  });

  it('parses a per-unit rate cost string by extracting the numeric prefix', () => {
    // The function intentionally strips the suffix during regex match; per-unit
    // resolution is a separate concern handled by `resolvePerUnitCost`.
    expect(parseCostRange('$0.023/GB/mo')).toBeCloseTo(0.023, 5);
  });
});

describe('formatCost', () => {
  it('returns "Free" for a zero value (canonical; local-copy returned empty string)', () => {
    expect(formatCost(0)).toBe('Free');
  });

  it('returns "< $0.01/mo" for very small positive values', () => {
    expect(formatCost(0.001)).toBe('< $0.01/mo');
    expect(formatCost(0.009)).toBe('< $0.01/mo');
  });

  it('returns "~$X.XX/mo" for sub-dollar values (canonical → "~$0.50/mo"; local-copy rounded to "~$1/mo")', () => {
    expect(formatCost(0.5)).toBe('~$0.50/mo');
    expect(formatCost(0.99)).toBe('~$0.99/mo');
  });

  it('returns "~$X/mo" for whole-dollar values between 1 and 999', () => {
    expect(formatCost(1)).toBe('~$1/mo');
    expect(formatCost(25)).toBe('~$25/mo');
    expect(formatCost(999)).toBe('~$999/mo');
  });

  it('returns "~$Xk/mo" for values 1000 and above (canonical denser display; local-copy was "~$1500/mo")', () => {
    expect(formatCost(1000)).toBe('~$1.0k/mo');
    expect(formatCost(1500)).toBe('~$1.5k/mo');
    expect(formatCost(12000)).toBe('~$12.0k/mo');
  });

  it('rounds non-whole values in the regular range', () => {
    expect(formatCost(25.4)).toBe('~$25/mo');
    expect(formatCost(25.6)).toBe('~$26/mo');
  });
});

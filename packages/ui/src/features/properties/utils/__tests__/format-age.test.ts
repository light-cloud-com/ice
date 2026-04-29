/**
 * rf-props-4 — format-age util.
 *
 * Boundary thresholds (1, 60, 60, 24) and unit suffixes ('now', 'm',
 * 'h', 'd') are preserved verbatim from the inline definitions in
 * properties-panel.tsx (PipelineSection + RepoDeployList).
 *
 * `vi.useFakeTimers()` + `vi.setSystemTime(...)` freeze `Date.now()`
 * so age math is deterministic. Without fake timers the tests would
 * race the wall clock at the 1m / 1h / 1d boundaries.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatAge } from '../format-age';

const FROZEN_NOW = new Date('2026-04-29T12:00:00Z');
const NOW_MS = FROZEN_NOW.getTime();

const minutesAgoIso = (mins: number) => new Date(NOW_MS - mins * 60_000).toISOString();
const secondsAgoIso = (secs: number) => new Date(NOW_MS - secs * 1000).toISOString();
const hoursAgoIso = (hours: number) => new Date(NOW_MS - hours * 3_600_000).toISOString();
const daysAgoIso = (days: number) => new Date(NOW_MS - days * 86_400_000).toISOString();

describe('formatAge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'now' when the date is the current frozen instant (diff < 1 minute)", () => {
    expect(formatAge(FROZEN_NOW.toISOString())).toBe('now');
  });

  it("returns 'now' for 30 seconds ago — still under the 1-minute floor", () => {
    expect(formatAge(secondsAgoIso(30))).toBe('now');
  });

  it("returns '1m' for exactly 1 minute ago", () => {
    expect(formatAge(minutesAgoIso(1))).toBe('1m');
  });

  it("returns '5m' for 5 minutes ago", () => {
    expect(formatAge(minutesAgoIso(5))).toBe('5m');
  });

  it("returns '59m' at the upper minute boundary (just under 1 hour)", () => {
    expect(formatAge(minutesAgoIso(59))).toBe('59m');
  });

  it("returns '1h' at exactly 60 minutes ago — boundary flips to hours", () => {
    expect(formatAge(minutesAgoIso(60))).toBe('1h');
  });

  it("returns '5h' for 5 hours ago", () => {
    expect(formatAge(hoursAgoIso(5))).toBe('5h');
  });

  it("returns '23h' at the upper hour boundary (just under 1 day)", () => {
    expect(formatAge(hoursAgoIso(23))).toBe('23h');
  });

  it("returns '1d' at exactly 24 hours ago — boundary flips to days", () => {
    expect(formatAge(hoursAgoIso(24))).toBe('1d');
  });

  it("returns '7d' for 7 days ago", () => {
    expect(formatAge(daysAgoIso(7))).toBe('7d');
  });

  it("returns '30d' for 30 days ago", () => {
    expect(formatAge(daysAgoIso(30))).toBe('30d');
  });

  it("returns 'now' for a future date (negative diff floors to 0 minutes via Math.floor)", () => {
    // Math.floor(negative / 60000) is <= -1, which is < 1, so the function
    // takes the 'now' branch. Documenting the original behavior verbatim.
    const futureIso = new Date(NOW_MS + 5 * 60_000).toISOString();
    expect(formatAge(futureIso)).toBe('now');
  });

  it("accepts ISO date strings directly ('2026-04-29T11:00:00.000Z' against frozen now → '1h')", () => {
    expect(formatAge('2026-04-29T11:00:00.000Z')).toBe('1h');
  });
});

/**
 * rf-ppanel-1 — Pipeline format utils.
 *
 * `formatRelativeTime` reads `Date.now()` at call-time so tests must freeze
 * the system clock — without `vi.setSystemTime` the assertions race the wall
 * clock at the 1m / 1h / 1d boundaries.
 *
 * `formatFramework`'s switch table is pinned branch-by-branch (12 known
 * mappings + an unknown-pass-through), and `formatDuration`'s sub-60 / 60+
 * boundaries are pinned at 0, 1, 59, 60, and 3661s.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime, formatDuration, formatFramework } from '../format';

const FROZEN_NOW = new Date('2026-04-29T12:00:00.000Z');
const NOW_MS = FROZEN_NOW.getTime();

const minutesAgoIso = (mins: number) => new Date(NOW_MS - mins * 60_000).toISOString();
const secondsAgoIso = (secs: number) => new Date(NOW_MS - secs * 1000).toISOString();
const hoursAgoIso = (hours: number) => new Date(NOW_MS - hours * 3_600_000).toISOString();
const daysAgoIso = (days: number) => new Date(NOW_MS - days * 86_400_000).toISOString();

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for the frozen instant (diff = 0)", () => {
    expect(formatRelativeTime(FROZEN_NOW.toISOString())).toBe('just now');
  });

  it("returns 'just now' for 30 seconds ago — under the 1-minute floor", () => {
    expect(formatRelativeTime(secondsAgoIso(30))).toBe('just now');
  });

  it("returns '1m ago' at exactly 1 minute ago", () => {
    expect(formatRelativeTime(minutesAgoIso(1))).toBe('1m ago');
  });

  it("returns '5m ago' for 5 minutes ago", () => {
    expect(formatRelativeTime(minutesAgoIso(5))).toBe('5m ago');
  });

  it("returns '59m ago' just under the hour boundary", () => {
    expect(formatRelativeTime(minutesAgoIso(59))).toBe('59m ago');
  });

  it("returns '1h ago' at exactly 60 minutes ago — boundary flips to hours", () => {
    expect(formatRelativeTime(minutesAgoIso(60))).toBe('1h ago');
  });

  it("returns '5h ago' for 5 hours ago", () => {
    expect(formatRelativeTime(hoursAgoIso(5))).toBe('5h ago');
  });

  it("returns '23h ago' just under the day boundary", () => {
    expect(formatRelativeTime(hoursAgoIso(23))).toBe('23h ago');
  });

  it("returns '1d ago' at exactly 24 hours ago — boundary flips to days", () => {
    expect(formatRelativeTime(hoursAgoIso(24))).toBe('1d ago');
  });

  it("returns '7d ago' for 7 days ago", () => {
    expect(formatRelativeTime(daysAgoIso(7))).toBe('7d ago');
  });

  it("returns '30d ago' for 30 days ago", () => {
    expect(formatRelativeTime(daysAgoIso(30))).toBe('30d ago');
  });

  it("returns 'just now' for a future date (negative diff floors to <= -1 min, which is < 1)", () => {
    const future = new Date(NOW_MS + 5 * 60_000).toISOString();
    expect(formatRelativeTime(future)).toBe('just now');
  });
});

describe('formatDuration', () => {
  it("returns '0s' for zero seconds", () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it("returns '1s' for one second", () => {
    expect(formatDuration(1)).toBe('1s');
  });

  it("returns '59s' just under the minute boundary", () => {
    expect(formatDuration(59)).toBe('59s');
  });

  it("returns '1m 0s' at exactly 60 seconds — boundary flips to minutes", () => {
    expect(formatDuration(60)).toBe('1m 0s');
  });

  it("returns '1m 1s' for 61 seconds", () => {
    expect(formatDuration(61)).toBe('1m 1s');
  });

  it("returns '2m 30s' for 150 seconds", () => {
    expect(formatDuration(150)).toBe('2m 30s');
  });

  it("returns '61m 1s' for 3661 seconds — minutes does NOT roll into hours (verbatim)", () => {
    // Original implementation does not bucket into hours; pin so a future
    // refactor that adds an hours bucket has to update this expectation.
    expect(formatDuration(3661)).toBe('61m 1s');
  });
});

describe('formatFramework', () => {
  it("maps 'nextjs' to 'Next.js'", () => {
    expect(formatFramework('nextjs')).toBe('Next.js');
  });

  it("maps 'nuxt' to 'Nuxt'", () => {
    expect(formatFramework('nuxt')).toBe('Nuxt');
  });

  it("maps 'sveltekit' to 'SvelteKit'", () => {
    expect(formatFramework('sveltekit')).toBe('SvelteKit');
  });

  it("maps 'react' to 'React'", () => {
    expect(formatFramework('react')).toBe('React');
  });

  it("maps 'vue' to 'Vue'", () => {
    expect(formatFramework('vue')).toBe('Vue');
  });

  it("maps 'angular' to 'Angular'", () => {
    expect(formatFramework('angular')).toBe('Angular');
  });

  it("maps 'express' to 'Express'", () => {
    expect(formatFramework('express')).toBe('Express');
  });

  it("maps 'fastify' to 'Fastify'", () => {
    expect(formatFramework('fastify')).toBe('Fastify');
  });

  it("maps 'docker' to 'Docker'", () => {
    expect(formatFramework('docker')).toBe('Docker');
  });

  it("maps 'python' to 'Python'", () => {
    expect(formatFramework('python')).toBe('Python');
  });

  it("maps 'go' to 'Go'", () => {
    expect(formatFramework('go')).toBe('Go');
  });

  it("maps 'node' to 'Node.js'", () => {
    expect(formatFramework('node')).toBe('Node.js');
  });

  it('passes through an unknown framework slug verbatim', () => {
    expect(formatFramework('rust')).toBe('rust');
  });

  it('passes through an empty string verbatim', () => {
    expect(formatFramework('')).toBe('');
  });

  it('is case-sensitive — uppercase keys do NOT hit the table', () => {
    expect(formatFramework('NextJS')).toBe('NextJS');
  });
});

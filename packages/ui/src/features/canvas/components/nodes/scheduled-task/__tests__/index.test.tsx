/**
 * Tests for `SvgScheduledTaskNode` + `describeCron` + `computeScheduledTaskHeight`.
 *
 * Behavior pinned by these tests:
 *   - describeCron: common patterns (every-minute, hourly, daily-at-H,
 *     weekly, custom fallback).
 *   - computeScheduledTaskHeight: header + body + footer arithmetic.
 *   - SvgScheduledTaskNode: renders a CardShell with Clock icon, the cron
 *     expression in mono, the human description, and a liveConfig footer
 *     built from runtime + timeout.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const passthrough: React.FC<Record<string, unknown>> = (props) =>
    React.createElement('div', null, (props as { children?: React.ReactNode }).children);
  passthrough.displayName = 'MockCardShell';
  return { CardShell: passthrough };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
}));

vi.mock('lucide-react', () => ({
  Clock: ((_props: Record<string, unknown>) => null) as React.FC,
}));

// The renderer uses `useState` + `useEffect` to drive the live countdown.
// We render through a plain function call (no React tree), so stub the
// hooks: useState returns the initial value, useEffect is a no-op.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initial = typeof init === 'function' ? (init as () => T)() : init;
      return [initial, vi.fn()];
    }),
    useEffect: vi.fn(),
  };
});

import {
  SvgScheduledTaskNode,
  computeScheduledTaskHeight,
  describeCron,
  formatCountdown,
  frequencyToCron,
  nextFireFromCron,
  resolveSchedule,
  ST_HEADER_HEIGHT,
  ST_BODY_HEIGHT,
  ST_PADDING,
} from '..';
import { CARD_FOOTER_HEIGHT } from '@ice/constants';
import type { CanvasNode } from '../../../svg-canvas';

type ReactNodeLike = React.ReactNode;
function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}
function findByTestId(tree: React.ReactNode, testId: string): React.ReactElement | undefined {
  for (const el of walk(tree)) {
    if ((el.props as { 'data-testid'?: string })['data-testid'] === testId) return el;
  }
  return undefined;
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'st-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'Nightly Backup',
  data: {},
  ...overrides,
});

const renderInner = (
  props: Partial<React.ComponentProps<typeof SvgScheduledTaskNode>> = {},
): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgScheduledTaskNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgScheduledTaskNode({ ...defaults, ...props }) as React.ReactElement;
};

// ─── describeCron ─────────────────────────────────────────────────────────

describe('describeCron', () => {
  it('returns "no schedule" for empty string', () => {
    expect(describeCron('')).toBe('no schedule');
  });

  it('recognises every-minute', () => {
    expect(describeCron('* * * * *')).toBe('every minute');
  });

  it('recognises every-N-minutes', () => {
    expect(describeCron('*/5 * * * *')).toBe('every 5 min');
    expect(describeCron('*/15 * * * *')).toBe('every 15 min');
  });

  it('recognises every-hour', () => {
    expect(describeCron('0 * * * *')).toBe('every hour');
  });

  it('recognises every-N-hours', () => {
    expect(describeCron('0 */6 * * *')).toBe('every 6 hours');
  });

  it('recognises daily-at-H:M', () => {
    expect(describeCron('0 3 * * *')).toBe('daily at 03:00');
    expect(describeCron('30 14 * * *')).toBe('daily at 14:30');
  });

  it('recognises weekly day-of-week', () => {
    expect(describeCron('0 9 * * 1')).toBe('weekly Mon 09:00');
    expect(describeCron('0 8 * * 0')).toBe('weekly Sun 08:00');
    expect(describeCron('0 17 * * 5')).toBe('weekly Fri 17:00');
  });

  it('falls back to "custom schedule" for anything else', () => {
    expect(describeCron('15 14 * * 3,5')).toBe('custom schedule');
    expect(describeCron('0 0 1 * *')).toBe('custom schedule');
  });

  it('trims whitespace before matching', () => {
    expect(describeCron('  0 * * * *  ')).toBe('every hour');
  });
});

// ─── frequencyToCron ──────────────────────────────────────────────────────

describe('frequencyToCron', () => {
  it.each([
    // Canonical (current) labels.
    ['Every 5 minutes', '*/5 * * * *'],
    ['Every 15 minutes', '*/15 * * * *'],
    ['Every 30 minutes', '*/30 * * * *'],
    ['Every hour', '0 * * * *'],
    ['Every 6 hours', '0 */6 * * *'],
    ['Every 12 hours', '0 */12 * * *'],
    ['Daily at midnight', '0 0 * * *'],
    ['Daily at 9 AM', '0 9 * * *'],
    ['Weekdays at 9 AM', '0 9 * * 1-5'],
    ['Weekly on Monday', '0 0 * * 1'],
    ['Monthly on the 1st', '0 0 1 * *'],
  ])('translates %s → %s', (input, expected) => {
    expect(frequencyToCron(input)).toBe(expected);
  });

  it.each([
    // Legacy labels still in the wild on already-dropped nodes.
    ['Every minute', '* * * * *'],
    ['Every day at midnight', '0 0 * * *'],
    ['Every Monday', '0 0 * * 1'],
    ['Every 1st of the month', '0 0 1 * *'],
  ])('keeps the legacy label %s mapped to %s for backward compat', (input, expected) => {
    expect(frequencyToCron(input)).toBe(expected);
  });

  it('returns null for "Custom" so the caller falls back to schedule_expression', () => {
    expect(frequencyToCron('Custom')).toBeNull();
  });

  it('returns null for the legacy "Custom schedule" label too', () => {
    expect(frequencyToCron('Custom schedule')).toBeNull();
  });

  it('returns null for unknown labels', () => {
    expect(frequencyToCron('Every full moon')).toBeNull();
  });
});

// ─── resolveSchedule ──────────────────────────────────────────────────────

describe('resolveSchedule', () => {
  it('returns schedule_expression when set', () => {
    expect(resolveSchedule({ schedule_expression: '15 4 * * *' })).toBe('15 4 * * *');
  });

  it('schedule_expression takes priority over frequency and legacy schedule', () => {
    expect(
      resolveSchedule({ schedule_expression: '15 4 * * *', frequency: 'Every hour', schedule: '0 0 * * *' }),
    ).toBe('15 4 * * *');
  });

  it('falls through to frequency when schedule_expression is empty', () => {
    expect(resolveSchedule({ frequency: 'Every hour' })).toBe('0 * * * *');
  });

  it('falls through to the legacy schedule field when nothing else resolves', () => {
    expect(resolveSchedule({ schedule: '0 6 * * *' })).toBe('0 6 * * *');
  });

  it('returns empty string when no field is set', () => {
    expect(resolveSchedule({})).toBe('');
  });

  it('handles undefined data without throwing', () => {
    expect(resolveSchedule(undefined)).toBe('');
  });
});

// ─── nextFireFromCron ─────────────────────────────────────────────────────

describe('nextFireFromCron', () => {
  const NOW = new Date('2026-05-16T12:34:56Z');

  it('returns null for an empty expression', () => {
    expect(nextFireFromCron('', NOW)).toBeNull();
  });

  it('returns null for unrecognised expressions', () => {
    expect(nextFireFromCron('15 14 * * 3,5', NOW)).toBeNull();
  });

  it('rounds up to the next minute for "* * * * *"', () => {
    const fire = nextFireFromCron('* * * * *', NOW)!;
    expect(fire.toISOString()).toBe('2026-05-16T12:35:00.000Z');
  });

  it('rounds up to the next 5-minute multiple', () => {
    const fire = nextFireFromCron('*/5 * * * *', NOW)!;
    expect(fire.toISOString()).toBe('2026-05-16T12:35:00.000Z');
  });

  it('rounds up to the next hour boundary for "0 * * * *"', () => {
    const fire = nextFireFromCron('0 * * * *', NOW)!;
    expect(fire.toISOString()).toBe('2026-05-16T13:00:00.000Z');
  });

  it('rolls to tomorrow for a daily schedule already past today', () => {
    const fire = nextFireFromCron('0 9 * * *', NOW)!;
    expect(fire.toISOString()).toBe('2026-05-17T09:00:00.000Z');
  });

  it('lands later today for a daily schedule still ahead', () => {
    const fire = nextFireFromCron('0 18 * * *', NOW)!;
    expect(fire.toISOString()).toBe('2026-05-16T18:00:00.000Z');
  });

  it('finds the next monday for a weekly Monday schedule', () => {
    // 2026-05-16 is a Saturday — next Monday is 2026-05-18.
    const fire = nextFireFromCron('0 0 * * 1', NOW)!;
    expect(fire.toISOString()).toBe('2026-05-18T00:00:00.000Z');
  });

  it('skips weekends for "Weekdays at 9 AM"', () => {
    // Sat 12:34 → next weekday is Monday 09:00.
    const fire = nextFireFromCron('0 9 * * 1-5', NOW)!;
    expect(fire.toISOString()).toBe('2026-05-18T09:00:00.000Z');
  });

  it('rolls to next month for a monthly schedule already past', () => {
    // 2026-05-16 has already passed the 1st → next is June 1.
    const fire = nextFireFromCron('0 0 1 * *', NOW)!;
    expect(fire.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

// ─── formatCountdown ──────────────────────────────────────────────────────

describe('formatCountdown', () => {
  it('returns "now" for past or current durations', () => {
    expect(formatCountdown(0)).toBe('now');
    expect(formatCountdown(-1000)).toBe('now');
  });

  it.each([
    [5_000, '5s'],
    [59_000, '59s'],
    [60_000, '1m'],
    [125_000, '2m 5s'],
    [3_600_000, '1h'],
    [3_900_000, '1h 5m'],
    [86_400_000, '24h'],
    [172_800_000, '2d'],
    [180_000_000, '2d 2h'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatCountdown(ms)).toBe(expected);
  });
});

// ─── height ───────────────────────────────────────────────────────────────

describe('computeScheduledTaskHeight', () => {
  it('returns header + padding*2 + body + footer', () => {
    const expected = ST_HEADER_HEIGHT + ST_PADDING + ST_BODY_HEIGHT + ST_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeScheduledTaskHeight()).toBe(expected);
  });

  it('exports the layout constants for the canvas sizer', () => {
    expect(ST_HEADER_HEIGHT).toBe(48);
    expect(ST_BODY_HEIGHT).toBe(60);
    expect(ST_PADDING).toBe(12);
  });
});

// ─── SvgScheduledTaskNode ─────────────────────────────────────────────────

describe('SvgScheduledTaskNode', () => {
  it('carries displayName', () => {
    expect(SvgScheduledTaskNode.displayName).toBe('SvgScheduledTaskNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('uses node.label as title', () => {
    const tree = renderInner({ node: makeNode({ label: 'Custom Cron' }) });
    expect((tree.props as { title: string }).title).toBe('Custom Cron');
  });

  it('falls back to "Scheduled Task" title when label empty', () => {
    const tree = renderInner({ node: makeNode({ label: '' }) });
    expect((tree.props as { title: string }).title).toBe('Scheduled Task');
  });

  it('renders the cron expression from data.schedule_expression', () => {
    const tree = renderInner({ node: makeNode({ data: { schedule_expression: '0 3 * * *' } }) });
    const cronEl = findByTestId(tree, 'st-cron-st-1');
    expect(cronEl).toBeDefined();
    expect((cronEl!.props as { children: string }).children).toBe('0 3 * * *');
  });

  it('derives the cron from data.frequency when schedule_expression is unset', () => {
    const tree = renderInner({ node: makeNode({ data: { frequency: 'Every day at midnight' } }) });
    const cronEl = findByTestId(tree, 'st-cron-st-1');
    expect((cronEl!.props as { children: string }).children).toBe('0 0 * * *');
  });

  it('schedule_expression wins over frequency when both are set', () => {
    const tree = renderInner({
      node: makeNode({ data: { schedule_expression: '15 4 * * *', frequency: 'Every hour' } }),
    });
    const cronEl = findByTestId(tree, 'st-cron-st-1');
    expect((cronEl!.props as { children: string }).children).toBe('15 4 * * *');
  });

  it('falls back to the legacy data.schedule field when neither newer field is set', () => {
    const tree = renderInner({ node: makeNode({ data: { schedule: '0 12 * * *' } }) });
    const cronEl = findByTestId(tree, 'st-cron-st-1');
    expect((cronEl!.props as { children: string }).children).toBe('0 12 * * *');
  });

  it('renders a placeholder when no schedule is set', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    const cronEl = findByTestId(tree, 'st-cron-st-1');
    expect((cronEl!.props as { children: string }).children).toBe('— — — — —');
  });

  it('renders the human-readable description', () => {
    const tree = renderInner({ node: makeNode({ data: { schedule_expression: '0 */6 * * *' } }) });
    const descEl = findByTestId(tree, 'st-description-st-1');
    expect((descEl!.props as { children: string }).children).toBe('every 6 hours');
  });

  it('builds liveConfig from timezone + frequency (user-editable fields)', () => {
    const tree = renderInner({
      node: makeNode({ data: { timezone: 'US/Pacific', frequency: 'Every day at midnight' } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('US/Pacific · Every day at midnight');
  });

  it('omits the "Custom" frequency literal from liveConfig (canonical label)', () => {
    const tree = renderInner({
      node: makeNode({
        data: { timezone: 'UTC', frequency: 'Custom', schedule_expression: '0 12 * * *' },
      }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('UTC');
  });

  it('omits the legacy "Custom schedule" frequency literal too', () => {
    const tree = renderInner({
      node: makeNode({
        data: { timezone: 'UTC', frequency: 'Custom schedule', schedule_expression: '0 12 * * *' },
      }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('UTC');
  });

  it('falls back to "cron schedule" when only a schedule is set', () => {
    const tree = renderInner({ node: makeNode({ data: { schedule_expression: '0 12 * * *' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('cron schedule');
  });

  it('falls back to "no schedule" when nothing is configured', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('no schedule');
  });

  it('ignores legacy runtime/timeout blueprint defaults (not user-editable)', () => {
    const tree = renderInner({ node: makeNode({ data: { runtime: 'node20', timeout: 300 } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('no schedule');
  });

  it('passes ST_HEADER_HEIGHT to CardShell', () => {
    const tree = renderInner();
    expect((tree.props as { headerHeight: number }).headerHeight).toBe(ST_HEADER_HEIGHT);
  });
});

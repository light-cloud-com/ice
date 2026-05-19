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
import { beforeEach, describe, it, expect, vi } from 'vitest';

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

// Selector stub so the renderer's `useSelector(selectActiveCard)` returns
// a controllable card. Tests mutate `selectorMock.value` before rendering
// when they need a specific block-target lookup.
const selectorMock = vi.hoisted(() => ({
  value: { nodes: [] as Array<{ id: string; data?: Record<string, unknown> }> },
}));

vi.mock('react-redux', () => ({
  useSelector: vi.fn(<T,>(_sel: unknown) => selectorMock.value as unknown as T),
}));

// The renderer uses `useState` + `useEffect` to drive the live countdown
// and `useMemo` to build the block-label lookup map. We render through a
// plain function call (no React tree), so stub the hooks accordingly.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initial = typeof init === 'function' ? (init as () => T)() : init;
      return [initial, vi.fn()];
    }),
    useEffect: vi.fn(),
    useMemo: vi.fn(<T,>(fn: () => T) => fn()),
  };
});

import {
  SvgScheduledTaskNode,
  computeCronJobHeight,
  describeCron,
  formatCountdown,
  frequencyToCron,
  nextFireFromCron,
  resolveSchedule,
  CRON_HEADER_HEIGHT,
  CRON_TASK_ROW_HEIGHT,
  CRON_TASK_ROW_GAP,
  CRON_BODY_PADDING_TOP,
  CRON_BODY_PADDING_BOTTOM,
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

const renderInner = (props: Partial<React.ComponentProps<typeof SvgScheduledTaskNode>> = {}): React.ReactElement => {
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
    expect(resolveSchedule({ schedule_expression: '15 4 * * *', frequency: 'Every hour', schedule: '0 0 * * *' })).toBe(
      '15 4 * * *',
    );
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

// ─── height + per-task port geometry ─────────────────────────────────────

describe('computeCronJobHeight', () => {
  const bodyFor = (rows: number) =>
    CRON_BODY_PADDING_TOP + rows * CRON_TASK_ROW_HEIGHT + (rows - 1) * CRON_TASK_ROW_GAP + CRON_BODY_PADDING_BOTTOM;

  it('returns header + 1-row body + footer when no tasks set', () => {
    expect(computeCronJobHeight({})).toBe(CRON_HEADER_HEIGHT + bodyFor(1) + CARD_FOOTER_HEIGHT);
  });

  it('grows linearly per task row', () => {
    const tasks = [JSON.stringify({ id: 'a' }), JSON.stringify({ id: 'b' })];
    expect(computeCronJobHeight({ tasks })).toBe(CRON_HEADER_HEIGHT + bodyFor(2) + CARD_FOOTER_HEIGHT);
  });

  it('treats undefined data without throwing', () => {
    expect(computeCronJobHeight(undefined)).toBe(CRON_HEADER_HEIGHT + bodyFor(1) + CARD_FOOTER_HEIGHT);
  });

  it('synthesises a 1-row body for legacy single-task data', () => {
    expect(computeCronJobHeight({ schedule_expression: '0 9 * * *' })).toBe(
      CRON_HEADER_HEIGHT + bodyFor(1) + CARD_FOOTER_HEIGHT,
    );
  });
});

// ─── SvgScheduledTaskNode — surface ───────────────────────────────────────

// ─── action display ───────────────────────────────────────────────────────

describe('SvgScheduledTaskNode — action display', () => {
  const stringifyTask = (task: {
    id?: string;
    name?: string;
    frequency?: string;
    action_type?: 'block' | 'http';
    action_target_node_id?: string;
    action_url?: string;
    action_http_method?: string;
  }) => JSON.stringify(task);

  beforeEach(() => {
    selectorMock.value = { nodes: [] };
  });

  it('shows the target block label when action_type is block', () => {
    selectorMock.value = {
      nodes: [{ id: 'fn-a', data: { label: 'video-encoder' } }],
    };
    const tree = renderInner({
      node: makeNode({
        data: {
          tasks: [
            stringifyTask({
              id: 't1',
              name: 'Nightly',
              frequency: 'Daily at midnight',
              action_type: 'block',
              action_target_node_id: 'fn-a',
            }),
          ],
        },
      }),
    });
    const action = findByTestId(tree, 'st-task-action-st-1-0');
    expect(action).toBeDefined();
    expect((action!.props as { children: string }).children).toBe('video-encoder');
  });

  it('falls back to "(deleted)" when the target block id no longer exists', () => {
    selectorMock.value = { nodes: [] };
    const tree = renderInner({
      node: makeNode({
        data: {
          tasks: [
            stringifyTask({
              id: 't1',
              name: 'Nightly',
              frequency: 'Daily at midnight',
              action_type: 'block',
              action_target_node_id: 'missing-id',
            }),
          ],
        },
      }),
    });
    const action = findByTestId(tree, 'st-task-action-st-1-0');
    expect((action!.props as { children: string }).children).toBe('(deleted)');
  });

  it('shows "METHOD url-without-protocol" when action_type is http', () => {
    const tree = renderInner({
      node: makeNode({
        data: {
          tasks: [
            stringifyTask({
              id: 't1',
              name: 'Heartbeat',
              frequency: 'Every hour',
              action_type: 'http',
              action_url: 'https://api.example.com/cron-tick',
              action_http_method: 'POST',
            }),
          ],
        },
      }),
    });
    const action = findByTestId(tree, 'st-task-action-st-1-0');
    expect((action!.props as { children: string }).children).toBe('POST api.example.com/cron-tick');
  });

  it('defaults to GET when http method is unset', () => {
    const tree = renderInner({
      node: makeNode({
        data: {
          tasks: [
            stringifyTask({
              id: 't1',
              name: 'Ping',
              frequency: 'Every hour',
              action_type: 'http',
              action_url: 'https://api.example.com/ping',
            }),
          ],
        },
      }),
    });
    const action = findByTestId(tree, 'st-task-action-st-1-0');
    expect((action!.props as { children: string }).children).toBe('GET api.example.com/ping');
  });

  it('shows the "set action in properties" amber hint when block action has no target', () => {
    const tree = renderInner({
      node: makeNode({
        data: {
          tasks: [
            stringifyTask({
              id: 't1',
              name: 'Nightly',
              frequency: 'Daily at midnight',
              action_type: 'block',
            }),
          ],
        },
      }),
    });
    expect(findByTestId(tree, 'st-task-no-action-st-1-0')).toBeDefined();
    expect(findByTestId(tree, 'st-task-action-st-1-0')).toBeUndefined();
  });

  it('shows the amber hint when http action has no URL', () => {
    const tree = renderInner({
      node: makeNode({
        data: {
          tasks: [
            stringifyTask({
              id: 't1',
              name: 'Ping',
              frequency: 'Every hour',
              action_type: 'http',
            }),
          ],
        },
      }),
    });
    expect(findByTestId(tree, 'st-task-no-action-st-1-0')).toBeDefined();
  });

  it('omits the amber hint when block action has a target', () => {
    selectorMock.value = { nodes: [{ id: 'fn-a', data: { label: 'fn-a' } }] };
    const tree = renderInner({
      node: makeNode({
        data: {
          tasks: [
            stringifyTask({
              id: 't1',
              name: 'Nightly',
              frequency: 'Daily at midnight',
              action_type: 'block',
              action_target_node_id: 'fn-a',
            }),
          ],
        },
      }),
    });
    expect(findByTestId(tree, 'st-task-no-action-st-1-0')).toBeUndefined();
  });
});

describe('SvgScheduledTaskNode — surface', () => {
  it('carries displayName', () => {
    expect(SvgScheduledTaskNode.displayName).toBe('SvgScheduledTaskNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('uses node.label as the CardShell title', () => {
    const tree = renderInner({ node: makeNode({ label: 'Custom Cron' }) });
    expect((tree.props as { title: string }).title).toBe('Custom Cron');
  });

  it('falls back to "Scheduled Task" title when label empty', () => {
    const tree = renderInner({ node: makeNode({ label: '' }) });
    expect((tree.props as { title: string }).title).toBe('Scheduled Task');
  });

  it('passes CRON_HEADER_HEIGHT to CardShell', () => {
    const tree = renderInner();
    expect((tree.props as { headerHeight: number }).headerHeight).toBe(CRON_HEADER_HEIGHT);
  });
});

// ─── SvgScheduledTaskNode — multi-task body ──────────────────────────────

describe('SvgScheduledTaskNode — tasks list', () => {
  const stringifyTask = (task: { id?: string; name?: string; frequency?: string; schedule_expression?: string }) =>
    JSON.stringify(task);

  it('renders an empty-state hint when no tasks are configured', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    expect(findByTestId(tree, 'st-empty-st-1')).toBeDefined();
  });

  it('renders one row per task entry from data.tasks', () => {
    const tasks = [
      stringifyTask({ id: 't1', name: 'Nightly backup', frequency: 'Daily at midnight' }),
      stringifyTask({ id: 't2', name: 'Hourly sync', frequency: 'Every hour' }),
    ];
    const tree = renderInner({ node: makeNode({ data: { tasks } }) });
    expect(findByTestId(tree, 'st-task-st-1-0')).toBeDefined();
    expect(findByTestId(tree, 'st-task-st-1-1')).toBeDefined();
    expect(findByTestId(tree, 'st-empty-st-1')).toBeUndefined();
  });

  it('accepts object-shaped task entries (not just JSON-strings)', () => {
    const tree = renderInner({
      node: makeNode({
        data: {
          tasks: [
            { id: 't1', name: 'Cleanup', frequency: 'Every hour' },
            { id: 't2', name: 'Report', frequency: 'Daily at 9 AM' },
          ],
        },
      }),
    });
    expect(findByTestId(tree, 'st-task-st-1-0')).toBeDefined();
    expect(findByTestId(tree, 'st-task-st-1-1')).toBeDefined();
  });

  it('synthesises a legacy task from data.schedule_expression', () => {
    const tree = renderInner({ node: makeNode({ data: { schedule_expression: '0 3 * * *' } }) });
    expect(findByTestId(tree, 'st-task-st-1-0')).toBeDefined();
  });

  it('synthesises a legacy task from data.frequency', () => {
    const tree = renderInner({ node: makeNode({ data: { frequency: 'Every hour' } }) });
    expect(findByTestId(tree, 'st-task-st-1-0')).toBeDefined();
  });

  it('synthesises a legacy task from data.schedule (older field)', () => {
    const tree = renderInner({ node: makeNode({ data: { schedule: '0 12 * * *' } }) });
    expect(findByTestId(tree, 'st-task-st-1-0')).toBeDefined();
  });

  it('prefers data.tasks over legacy fields when both are present', () => {
    const tree = renderInner({
      node: makeNode({
        data: {
          frequency: 'Every hour', // would synthesise a legacy task
          tasks: [stringifyTask({ id: 't1', name: 'Real task', frequency: 'Daily at midnight' })],
        },
      }),
    });
    // Only one task row should render (from data.tasks, not the legacy fallback).
    expect(findByTestId(tree, 'st-task-st-1-0')).toBeDefined();
    expect(findByTestId(tree, 'st-task-st-1-1')).toBeUndefined();
  });
});

// ─── SvgScheduledTaskNode — liveConfig ───────────────────────────────────

describe('SvgScheduledTaskNode — liveConfig', () => {
  const stringifyTask = (task: { id?: string; name?: string; frequency?: string }) => JSON.stringify(task);

  it('shows the task count when tasks are present', () => {
    const tree = renderInner({
      node: makeNode({
        data: {
          tasks: [
            stringifyTask({ id: 't1', name: 'A', frequency: 'Every hour' }),
            stringifyTask({ id: 't2', name: 'B', frequency: 'Daily at midnight' }),
          ],
        },
      }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('2 tasks');
  });

  it('uses singular "1 task" for one entry', () => {
    const tree = renderInner({
      node: makeNode({ data: { tasks: [stringifyTask({ id: 't1', name: 'A', frequency: 'Every hour' })] } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('1 task');
  });

  it('appends timezone when set', () => {
    const tree = renderInner({
      node: makeNode({
        data: { timezone: 'US/Pacific', tasks: [stringifyTask({ id: 't1', name: 'A', frequency: 'Every hour' })] },
      }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('1 task · US/Pacific');
  });

  it('falls back to "no tasks" when none are configured', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('no tasks');
  });

  it('counts the synthesised legacy task in liveConfig', () => {
    const tree = renderInner({ node: makeNode({ data: { frequency: 'Every hour' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('1 task');
  });
});

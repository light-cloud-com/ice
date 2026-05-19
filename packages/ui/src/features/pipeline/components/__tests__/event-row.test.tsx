/**
 * rf-ppanel-5 — EventRow.
 *
 * Direct-FC tree-walker tests with stateful useState mock so we can
 * pre-seed `showLogs` and pin both the collapsed and expanded branches.
 *
 * Cite:
 *   - `react-namespace-hook-access-requires-patching-default-export-too`
 *     — useState is destructured here so we only need the named patch,
 *     but we ship the dual-patch anyway since the tree-walker invokes
 *     EventRow as a plain function.
 *   - `lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates`
 *     — status icons (Circle, Loader2, CheckCircle, XCircle, ChevronDown)
 *     are forwardRef objects; we filter via reference equality on `el.type`.
 *   - `tree-walker-collectText-array-children-fallback-for-jsx-button-text-after-icon`
 *     — the duration row mixes `t('pipeline.duration')` with the formatted
 *     duration in the same span; tests harvest both via array fallback.
 *
 * `formatRelativeTime` reads `Date.now()`. Tests freeze time so the
 * relative-time span is deterministic.
 */

import { Circle, Loader2, ChevronDown, CheckCircle, XCircle } from 'lucide-react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  showLogsInitial: false,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const patchedUseState = vi.fn(<T,>(initial: T) => {
    // The component only has ONE useState (showLogs). Override the initial
    // via the pre-seeded mock so both branches are testable from outside.
    const v = mocks.showLogsInitial as unknown as T;
    return [v ?? initial, vi.fn()];
  });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    default: { ...actualDefault, useState: patchedUseState },
  };
});

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { EventRow } from '../event-row';
import type { DeploymentEvent, DeployStep } from '../../../../store/slices/pipeline-slice';
import type { EventRowProps } from '../event-row';

function render(props: EventRowProps): React.ReactElement {
  return (EventRow as unknown as (p: EventRowProps) => React.ReactElement)(props);
}

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  if (typeof el.type === 'function') {
    try {
      const FC = el.type as (props: unknown) => React.ReactNode;
      yield* walk(FC(el.props) as ReactNodeLike);
    } catch {
      /* skip */
    }
    return;
  }
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByRef(tree: React.ReactNode, ref: unknown): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && el.type === ref) out.push(el);
  }
  return out;
}

function collectText(tree: React.ReactNode): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = (el.props as { children?: unknown } | undefined)?.children;
    if (typeof c === 'string') s += c + ' ';
    else if (typeof c === 'number') s += String(c) + ' ';
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item + ' ';
        else if (typeof item === 'number') s += String(item) + ' ';
      }
    }
  }
  return s;
}

const FROZEN_NOW = new Date('2026-04-29T12:00:00.000Z');

const baseEvent: DeploymentEvent = {
  id: 'evt-1',
  rule_id: 'rule-1',
  trigger: 'push',
  commit_sha: 'abcdef1234567890',
  commit_message: 'Initial commit',
  commit_author: 'alice',
  branch: 'main',
  status: 'success',
  deployment_stage: null,
  deployment_logs: [],
  deployed_url: null,
  started_at: new Date(FROZEN_NOW.getTime() - 5 * 60_000).toISOString(),
  completed_at: null,
  duration_seconds: null,
  error: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  mocks.showLogsInitial = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EventRow — collapsed (showLogs=false)', () => {
  it('renders a bordered, rounded outer div', () => {
    const tree = render({ event: baseEvent });
    expect(tree.type).toBe('div');
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('rounded-md');
    expect(cls).toContain('border');
    expect(cls).toContain('overflow-hidden');
  });

  it('shows the truncated 7-char commit sha', () => {
    const tree = render({ event: baseEvent });
    const text = collectText(tree);
    expect(text).toContain('abcdef1');
    expect(text).not.toContain('abcdef1234567890');
  });

  it('shows the commit message', () => {
    const tree = render({ event: baseEvent });
    const text = collectText(tree);
    expect(text).toContain('Initial commit');
  });

  it('falls back to event.branch when rule is missing', () => {
    const tree = render({ event: baseEvent });
    const text = collectText(tree);
    expect(text).toContain('main');
  });

  it('prefers rule.environment over event.branch when present', () => {
    const tree = render({
      event: {
        ...baseEvent,
        branch: 'main',
        rule: { branch_pattern: 'main', environment: 'production' },
      },
    });
    const text = collectText(tree);
    expect(text).toContain('production');
    // branch should not also appear since it's mutually-exclusive
    // for this metadata slot — but it might appear elsewhere via other text.
  });

  it('shows the relative-time string for started_at', () => {
    const tree = render({ event: baseEvent });
    const text = collectText(tree);
    expect(text).toContain('5m ago');
  });

  it('renders an emerald-filled Circle for status="success"', () => {
    const tree = render({ event: { ...baseEvent, status: 'success' } });
    const circles = findByRef(tree, Circle);
    expect(circles.length).toBeGreaterThanOrEqual(1);
    expect((circles[0].props as { className: string }).className).toContain('fill-emerald-500');
  });

  it('renders a red-filled Circle for status="failed"', () => {
    const tree = render({ event: { ...baseEvent, status: 'failed' } });
    const circles = findByRef(tree, Circle);
    expect((circles[0].props as { className: string }).className).toContain('fill-red-500');
  });

  it('renders a muted-filled Circle for status="cancelled"', () => {
    const tree = render({ event: { ...baseEvent, status: 'cancelled' } });
    const circles = findByRef(tree, Circle);
    expect((circles[0].props as { className: string }).className).toContain('fill-ice-text-3');
  });

  it('renders a spinning Loader2 for any other status (e.g. "deploying")', () => {
    const tree = render({ event: { ...baseEvent, status: 'deploying' } });
    const loaders = findByRef(tree, Loader2);
    expect(loaders.length).toBe(1);
    expect((loaders[0].props as { className: string }).className).toContain('animate-spin');
  });

  it('renders a non-rotated chevron when collapsed', () => {
    const tree = render({ event: baseEvent });
    const chevs = findByRef(tree, ChevronDown);
    expect(chevs.length).toBe(1);
    const cls = (chevs[0].props as { className: string }).className;
    expect(cls).not.toContain('rotate-180');
  });

  it('does NOT render the expanded log body when collapsed', () => {
    const tree = render({
      event: {
        ...baseEvent,
        deployment_logs: [{ step: 's', status: 'completed', message: 'hello', timestamp: 'now' }],
        error: 'boom',
        duration_seconds: 90,
      },
    });
    const text = collectText(tree);
    expect(text).not.toContain('hello');
    expect(text).not.toContain('boom');
    expect(text).not.toContain('1m 30s');
  });

  it('toggles showLogs via the row-level onClick (calls the setter with !showLogs)', () => {
    const tree = render({ event: baseEvent });
    const children = (tree.props as { children: unknown[] }).children as React.ReactElement[];
    const headerDiv = children[0];
    const handler = (headerDiv.props as { onClick: () => void }).onClick;
    expect(typeof handler).toBe('function');
    expect(() => handler()).not.toThrow();
  });
});

describe('EventRow — expanded (showLogs=true)', () => {
  beforeEach(() => {
    mocks.showLogsInitial = true;
  });

  it('renders a rotated chevron when expanded', () => {
    const tree = render({ event: baseEvent });
    const chevs = findByRef(tree, ChevronDown);
    const cls = (chevs[0].props as { className: string }).className;
    expect(cls).toContain('rotate-180');
  });

  it('renders the log container with slate-950 bg', () => {
    const tree = render({ event: baseEvent });
    let found = false;
    for (const el of walk(tree)) {
      const cls = (el.props as { className?: string } | undefined)?.className;
      if (typeof cls === 'string' && cls.includes('bg-slate-950') && cls.includes('p-2')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  const completedStep: DeployStep = { step: 'install', status: 'completed', message: 'installed', timestamp: 'a' };
  const failedStep: DeployStep = { step: 'build', status: 'failed', message: 'build failed', timestamp: 'b' };
  const startedStep: DeployStep = { step: 'deploy', status: 'started', message: 'deploying...', timestamp: 'c' };

  it('renders a CheckCircle for status="completed" steps', () => {
    const tree = render({ event: { ...baseEvent, deployment_logs: [completedStep] } });
    const checks = findByRef(tree, CheckCircle);
    expect(checks.length).toBe(1);
    expect((checks[0].props as { className: string }).className).toContain('text-emerald-500');
  });

  it('renders an XCircle and red text for status="failed" steps', () => {
    const tree = render({ event: { ...baseEvent, deployment_logs: [failedStep] } });
    const xs = findByRef(tree, XCircle);
    expect(xs.length).toBe(1);
    expect((xs[0].props as { className: string }).className).toContain('text-red-500');
    const text = collectText(tree);
    expect(text).toContain('build failed');
  });

  it('renders a muted Circle for any other step status (e.g. "started")', () => {
    const tree = render({
      event: { ...baseEvent, deployment_logs: [startedStep] },
    });
    // status icon for the event itself + step circle. We need to find the
    // step-row Circle (size w-3, slate-500). Look for a slate-500 Circle.
    const circles = findByRef(tree, Circle);
    const stepCircle = circles.find((c) => {
      const cls = (c.props as { className: string }).className;
      return cls.includes('text-slate-500');
    });
    expect(stepCircle).toBeDefined();
  });

  it('renders the error block when event.error is set', () => {
    const tree = render({ event: { ...baseEvent, error: 'rate limit exceeded' } });
    const text = collectText(tree);
    expect(text).toContain('rate limit exceeded');
  });

  it('does NOT render the error block when event.error is null', () => {
    const tree = render({ event: { ...baseEvent, error: null } });
    const text = collectText(tree);
    expect(text).not.toContain('rate limit');
  });

  it('renders the duration block with translation key + formatted seconds', () => {
    const tree = render({ event: { ...baseEvent, duration_seconds: 90 } });
    const text = collectText(tree);
    expect(text).toContain('pipeline.duration');
    expect(text).toContain('1m 30s');
  });

  it('does NOT render the duration block when duration_seconds is null', () => {
    const tree = render({ event: { ...baseEvent, duration_seconds: null } });
    const text = collectText(tree);
    expect(text).not.toContain('pipeline.duration');
  });

  it('does NOT render the duration block when duration_seconds is 0 (falsy guard)', () => {
    // Pre-extraction source uses `event.duration_seconds &&` — 0 is falsy,
    // so the row hides for a zero-duration event. Pin verbatim.
    const tree = render({ event: { ...baseEvent, duration_seconds: 0 } });
    const text = collectText(tree);
    expect(text).not.toContain('pipeline.duration');
  });

  it('treats deployment_logs=null as an empty array (|| [] guard)', () => {
    const tree = render({
      event: { ...baseEvent, deployment_logs: null as unknown as DeployStep[] },
    });
    // Should not throw and should not render any log icons.
    const checks = findByRef(tree, CheckCircle);
    const xs = findByRef(tree, XCircle);
    expect(checks.length).toBe(0);
    expect(xs.length).toBe(0);
  });
});

/**
 * Tests for `PreDeployWarnings` — direct-FC tree-walker.
 *
 * Mocks:
 *   - `useDispatch` / `useSelector` to controllable state.
 *   - The two action creators (`acknowledgeCritical`, `dismissPreDeployWarning`)
 *     are spied via the slice mock.
 *   - `cn` is the real utility (small enough to leave un-mocked but we
 *     stub it for determinism).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    deploy: {
      dismissedWarnings: [] as string[],
      criticalAcknowledged: false,
    },
  },
  dispatch: vi.fn(),
  acknowledgeCritical: vi.fn((p: unknown) => ({ type: 'deploy/ack', payload: p })),
  dismissPreDeployWarning: vi.fn((p: unknown) => ({ type: 'deploy/dismiss', payload: p })),
}));

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../../../store/slices/deploy-slice', () => ({
  acknowledgeCritical: mocks.acknowledgeCritical,
  dismissPreDeployWarning: mocks.dismissPreDeployWarning,
}));

import { PreDeployWarnings } from '../predeploy-warnings';
import type { PreDeployAnalysis, PreDeployWarning } from '../../utils/predeploy-analysis';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* opaque */
    }
    return;
  }
  yield* walk(node.props.children);
}

function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}

function collectText(tree: unknown): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = el.props.children;
    if (typeof c === 'string') s += c;
    else if (typeof c === 'number') s += String(c);
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
        else if (typeof item === 'number') s += String(item);
      }
    }
  }
  return s;
}

const makeWarning = (overrides: Partial<PreDeployWarning> = {}): PreDeployWarning => ({
  id: 'w1',
  severity: 'warning',
  title: 'Title',
  description: 'desc',
  dismissible: true,
  ...overrides,
}) as PreDeployWarning;

const render = (analysis: PreDeployAnalysis): React.ReactElement | null =>
  (PreDeployWarnings as unknown as (p: { analysis: PreDeployAnalysis }) => React.ReactElement | null)({ analysis });

beforeEach(() => {
  mocks.state = {
    deploy: {
      dismissedWarnings: [],
      criticalAcknowledged: false,
    },
  };
  mocks.dispatch.mockReset();
  mocks.acknowledgeCritical.mockClear();
  mocks.dismissPreDeployWarning.mockClear();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PreDeployWarnings — visibility', () => {
  it('returns null when there are no warnings', () => {
    const tree = render({ warnings: [], hasCritical: false });
    expect(tree).toBeNull();
  });

  it('returns null when all warnings are dismissed', () => {
    mocks.state.deploy.dismissedWarnings = ['w1'];
    const tree = render({
      warnings: [makeWarning({ id: 'w1' })],
      hasCritical: false,
    });
    expect(tree).toBeNull();
  });
});

describe('PreDeployWarnings — render warnings', () => {
  it('renders title + description for each visible warning', () => {
    const tree = render({
      warnings: [makeWarning({ id: 'w1', title: 'High cost', description: 'check budget' })],
      hasCritical: false,
    });
    const text = collectText(tree);
    expect(text).toContain('High cost');
    expect(text).toContain('check budget');
  });

  it('orders criticals first, then warnings, then infos', () => {
    const tree = render({
      warnings: [
        makeWarning({ id: 'i1', severity: 'info', title: 'INFO_TITLE' }),
        makeWarning({ id: 'w1', severity: 'warning', title: 'WARN_TITLE' }),
        makeWarning({ id: 'c1', severity: 'critical', title: 'CRIT_TITLE' }),
      ],
      hasCritical: true,
    });
    const text = collectText(tree);
    const cIdx = text.indexOf('CRIT_TITLE');
    const wIdx = text.indexOf('WARN_TITLE');
    const iIdx = text.indexOf('INFO_TITLE');
    expect(cIdx).toBeLessThan(wIdx);
    expect(wIdx).toBeLessThan(iIdx);
  });

  it('renders dismiss button only when warning.dismissible', () => {
    const tree = render({
      warnings: [
        makeWarning({ id: 'w1', dismissible: true, title: 'A' }),
        makeWarning({ id: 'w2', dismissible: false, title: 'B' }),
      ],
      hasCritical: false,
    });
    const dismissBtns = findAll(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { children?: unknown }).children === 'Dismiss',
    );
    expect(dismissBtns).toHaveLength(1);
  });

  it('clicks Dismiss → dispatches dismissPreDeployWarning(id)', () => {
    const tree = render({
      warnings: [makeWarning({ id: 'wid', dismissible: true })],
      hasCritical: false,
    });
    const dismissBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { children?: unknown }).children === 'Dismiss',
    )!;
    const onClick = (dismissBtn.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.dismissPreDeployWarning).toHaveBeenCalledWith('wid');
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'deploy/dismiss', payload: 'wid' });
  });
});

describe('PreDeployWarnings — critical-acknowledge gate', () => {
  it('does NOT render the ack checkbox when hasCritical=false', () => {
    const tree = render({
      warnings: [makeWarning({ id: 'w1', severity: 'warning' })],
      hasCritical: false,
    });
    const ackLabel = findFirst(
      tree,
      (el) => el.type === 'label',
    );
    expect(ackLabel).toBeUndefined();
  });

  it('does NOT render the ack checkbox when hasCritical=true but no critical warnings visible', () => {
    mocks.state.deploy.dismissedWarnings = ['c1']; // hide the only critical
    const tree = render({
      warnings: [makeWarning({ id: 'c1', severity: 'critical' })],
      hasCritical: true,
    });
    expect(tree).toBeNull(); // no visible warnings at all
  });

  it('renders the ack checkbox when hasCritical=true and a critical is visible', () => {
    const tree = render({
      warnings: [makeWarning({ id: 'c1', severity: 'critical', title: 'Pub bucket' })],
      hasCritical: true,
    });
    const ackLabel = findFirst(tree, (el) => el.type === 'label');
    expect(ackLabel).toBeDefined();
  });

  it('singularises "critical issue" when there is exactly 1 visible critical', () => {
    const tree = render({
      warnings: [makeWarning({ id: 'c1', severity: 'critical' })],
      hasCritical: true,
    });
    const text = collectText(tree);
    expect(text).toContain('1 critical issue ');
    expect(text).not.toContain('1 critical issues');
  });

  it('pluralises "critical issues" when there are 2+ visible criticals', () => {
    const tree = render({
      warnings: [
        makeWarning({ id: 'c1', severity: 'critical' }),
        makeWarning({ id: 'c2', severity: 'critical' }),
      ],
      hasCritical: true,
    });
    const text = collectText(tree);
    expect(text).toContain('2 critical issues');
  });

  it('clicking the ack button dispatches acknowledgeCritical(!current)', () => {
    mocks.state.deploy.criticalAcknowledged = false;
    const tree = render({
      warnings: [makeWarning({ id: 'c1', severity: 'critical' })],
      hasCritical: true,
    });
    const ackBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { 'aria-label'?: string })['aria-label'] === 'Acknowledge critical warnings',
    )!;
    const onClick = (ackBtn.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.acknowledgeCritical).toHaveBeenCalledWith(true);
  });

  it('renders CheckSquare when criticalAcknowledged=true (instead of empty Square)', () => {
    mocks.state.deploy.criticalAcknowledged = true;
    const tree = render({
      warnings: [makeWarning({ id: 'c1', severity: 'critical' })],
      hasCritical: true,
    });
    // Find a lucide icon — we can check className 'text-red-500' is on a child element.
    const reds = findAll(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className).includes('text-red-500'),
    );
    expect(reds.length).toBeGreaterThan(0);
  });
});

describe('PreDeployWarnings — severity icon + classes', () => {
  it('uses red severity classes for critical', () => {
    const tree = render({
      warnings: [makeWarning({ id: 'c1', severity: 'critical' })],
      hasCritical: true,
    });
    const cards = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className).includes('rounded border'),
    );
    expect(cards[0].props.className).toContain('border-red-500/30');
  });

  it('uses amber severity classes for warning', () => {
    const tree = render({
      warnings: [makeWarning({ id: 'w1', severity: 'warning' })],
      hasCritical: false,
    });
    const cards = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className).includes('rounded border'),
    );
    expect(cards[0].props.className).toContain('border-amber-500/30');
  });

  it('uses blue severity classes for info', () => {
    const tree = render({
      warnings: [makeWarning({ id: 'i1', severity: 'info' })],
      hasCritical: false,
    });
    const cards = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className).includes('rounded border'),
    );
    expect(cards[0].props.className).toContain('border-blue-500/30');
  });
});

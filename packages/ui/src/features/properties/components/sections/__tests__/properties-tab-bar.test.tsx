/**
 * rf-npsec-3 — PropertiesTabBar tests.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cnSpy: vi.fn((...args: unknown[]) => args.filter((a) => typeof a === 'string' && a).join(' ')),
}));

vi.mock('../../../../../shared/utils/cn', () => ({
  cn: mocks.cnSpy,
}));

import { PropertiesTabBar, TabIssueBadge } from '../properties-tab-bar';
import type { VisibleTab } from '../../../utils/build-visible-tabs';

interface ReactElementLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isElement(x: unknown): x is ReactElementLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ReactElementLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isElement(node)) return;
  yield node;
  yield* walk(node.props.children);
}
function findAllByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}

const callRender = (props: React.ComponentProps<typeof PropertiesTabBar>): unknown =>
  (PropertiesTabBar as (p: React.ComponentProps<typeof PropertiesTabBar>) => unknown)(props);

beforeEach(() => mocks.cnSpy.mockClear());

describe('PropertiesTabBar', () => {
  it('returns null when only one tab is visible', () => {
    const tabs: VisibleTab[] = [{ id: 'a', label: 'A', show: true }];
    expect(callRender({ visibleTabs: tabs, activeTab: 'a', onSelect: vi.fn() })).toBe(null);
  });

  it('returns null when zero tabs are visible', () => {
    expect(callRender({ visibleTabs: [], activeTab: '', onSelect: vi.fn() })).toBe(null);
  });

  it('renders one button per visible tab when >1 tab', () => {
    const tabs: VisibleTab[] = [
      { id: 'a', label: 'A', show: true },
      { id: 'b', label: 'B', show: true },
      { id: 'c', label: 'C', show: true },
    ];
    const tree = callRender({ visibleTabs: tabs, activeTab: 'a', onSelect: vi.fn() });
    const buttons = findAllByPredicate(tree, (el) => el.type === 'button');
    expect(buttons.length).toBe(3);
  });

  it('clicking a tab calls onSelect with that tab id', () => {
    const onSelect = vi.fn();
    const tabs: VisibleTab[] = [
      { id: 'a', label: 'A', show: true },
      { id: 'b', label: 'B', show: true },
    ];
    const tree = callRender({ visibleTabs: tabs, activeTab: 'a', onSelect });
    const buttons = findAllByPredicate(tree, (el) => el.type === 'button');
    (buttons[1].props.onClick as () => void)?.();
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('uses border-emerald-500 for active deploy tab', () => {
    const tabs: VisibleTab[] = [
      { id: 'config', label: 'C', show: true },
      { id: 'deploy', label: 'D', show: true, dot: true },
    ];
    callRender({ visibleTabs: tabs, activeTab: 'deploy', onSelect: vi.fn() });
    const cnArgs = mocks.cnSpy.mock.calls.find(
      (args) => typeof args[0] === 'string' && (args[0] as string).includes('flex-1'),
    );
    // Last call's branch result is the active deploy class
    expect(mocks.cnSpy.mock.calls.some((args) => args[1] === 'text-ice-text-1 border-b-2 border-emerald-500')).toBe(
      true,
    );
  });

  it('uses border-ice-accent for active non-deploy tab', () => {
    const tabs: VisibleTab[] = [
      { id: 'a', label: 'A', show: true },
      { id: 'b', label: 'B', show: true },
    ];
    callRender({ visibleTabs: tabs, activeTab: 'a', onSelect: vi.fn() });
    expect(mocks.cnSpy.mock.calls.some((args) => args[1] === 'text-ice-text-1 border-b-2 border-ice-accent')).toBe(
      true,
    );
  });

  it('uses muted style for inactive tabs', () => {
    const tabs: VisibleTab[] = [
      { id: 'a', label: 'A', show: true },
      { id: 'b', label: 'B', show: true },
    ];
    callRender({ visibleTabs: tabs, activeTab: 'a', onSelect: vi.fn() });
    expect(mocks.cnSpy.mock.calls.some((args) => args[1] === 'text-ice-text-3 hover:text-ice-text-2')).toBe(true);
  });

  it('renders the dot only for tabs with dot=true', () => {
    const tabs: VisibleTab[] = [
      { id: 'a', label: 'A', show: true },
      { id: 'b', label: 'B', show: true, dot: true },
    ];
    const tree = callRender({ visibleTabs: tabs, activeTab: 'a', onSelect: vi.fn() });
    const dots = findAllByPredicate(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('rounded-full bg-emerald-500'),
    );
    expect(dots.length).toBe(1);
  });
});

// PE2 — a tab's error/warning counts are shown as a badge so they're visible
// from any tab (not trapped in Config).
describe('PropertiesTabBar — issue badges (PE2)', () => {
  const tabs: VisibleTab[] = [
    { id: 'config', label: 'Config', show: true },
    { id: 'scaling', label: 'Scaling', show: true },
  ];

  it('passes the config issue counts to that tab’s badge', () => {
    const tree = callRender({
      visibleTabs: tabs,
      activeTab: 'scaling',
      onSelect: vi.fn(),
      issueCounts: { config: { errors: 2, warnings: 1 } },
    });
    // Every tab renders a TabIssueBadge; the config one carries the counts.
    const badges = findAllByPredicate(tree, (el) => el.type === TabIssueBadge).map(
      (el) => (el.props as { badge?: unknown }).badge,
    );
    expect(badges).toContainEqual({ errors: 2, warnings: 1 });
    // the scaling tab has no entry → undefined badge
    expect(badges).toContain(undefined);
  });

  it('renders no badge content when issueCounts is omitted', () => {
    const tree = callRender({ visibleTabs: tabs, activeTab: 'config', onSelect: vi.fn() });
    const badges = findAllByPredicate(tree, (el) => el.type === TabIssueBadge).map(
      (el) => (el.props as { badge?: unknown }).badge,
    );
    expect(badges.every((b) => b === undefined)).toBe(true);
  });
});

describe('TabIssueBadge (PE2)', () => {
  const render = (badge?: { errors: number; warnings: number }) =>
    (TabIssueBadge as (p: { badge?: { errors: number; warnings: number } }) => unknown)({ badge });

  it('renders a red error pill with the count + accessible label when errors > 0', () => {
    const el = render({ errors: 2, warnings: 3 }) as ReactElementLike;
    expect(el.type).toBe('span');
    expect(el.props.children).toBe(2);
    expect(el.props.className as string).toContain('text-red-400');
    expect(el.props['aria-label']).toBe('2 blocking');
  });

  it('renders an amber warning pill when there are warnings but no errors', () => {
    const el = render({ errors: 0, warnings: 1 }) as ReactElementLike;
    expect(el.type).toBe('span');
    expect(el.props.children).toBe(1);
    expect(el.props.className as string).toContain('text-amber-400');
    expect(el.props['aria-label']).toBe('1 warning');
  });

  it('renders nothing when there are no errors or warnings', () => {
    expect(render({ errors: 0, warnings: 0 })).toBeNull();
  });

  it('renders nothing when no badge is supplied', () => {
    expect(render(undefined)).toBeNull();
  });
});

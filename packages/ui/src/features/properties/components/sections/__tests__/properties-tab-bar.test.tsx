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

import { PropertiesTabBar } from '../properties-tab-bar';
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

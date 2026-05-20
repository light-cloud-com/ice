/**
 * rf-cost-7 — CategoryRow.
 *
 * Direct-FC tree-walker. `useState` patched via vi.mock('react') so we can
 * control `expanded` per test.
 */

import { Server, Package } from 'lucide-react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  expandedRef: { current: false as boolean },
  setExpandedSpy: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const patchedUseState = vi.fn(() => [mocks.expandedRef.current, mocks.setExpandedSpy] as const);
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    default: {
      ...actualDefault,
      useState: patchedUseState,
    },
  };
});

import { CategoryRow, type CategoryRowProps } from '../category-row';
import type { CategoryCost, NodeCostInfo } from '../../utils/cost-calculator';

// ─── Tree-walker helpers ──────────────────────────────────────────────────

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
  if (Array.isArray(children)) {
    for (const c of children) yield* walk(c as ReactNodeLike);
    return;
  }
  yield* walk(children);
}

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function collectText(tree: React.ReactNode): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = (el.props as { children?: React.ReactNode } | undefined)?.children;
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

function buildNode(over: Partial<NodeCostInfo> = {}): NodeCostInfo {
  return {
    nodeId: 'n',
    label: 'My Node',
    iceType: 'Compute.Function',
    category: 'Compute',
    provider: 'aws',
    monthlyCost: 0,
    isScalable: false,
    minInstances: 1,
    maxInstances: 1,
    activeInstances: 1,
    perInstanceCost: 0,
    ...over,
  };
}

function buildCategory(over: Partial<CategoryCost> = {}): CategoryCost {
  return {
    category: 'Compute',
    label: 'Compute',
    totalCost: 0,
    nodes: [],
    ...over,
  };
}

function render(props: CategoryRowProps): React.ReactElement {
  return (CategoryRow as unknown as (p: CategoryRowProps) => React.ReactElement)(props);
}

beforeEach(() => {
  mocks.expandedRef.current = false;
  mocks.setExpandedSpy.mockReset();
});

// ─── Header & icon lookup ────────────────────────────────────────────────

describe('CategoryRow — header', () => {
  it('renders the label inside a flex-1 span', () => {
    const tree = render({ category: buildCategory({ label: 'Compute' }), totalCost: 100 });
    const labelSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        ((el.props as { className?: string }).className ?? '').includes('flex-1') &&
        (el.props as { children?: unknown }).children === 'Compute',
    );
    expect(labelSpans).toHaveLength(1);
  });

  it('looks up icon by label first (Compute → Server)', () => {
    const tree = render({ category: buildCategory({ label: 'Compute', category: 'Compute' }), totalCost: 100 });
    const servers = findByPredicate(tree, (el) => el.type === Server);
    expect(servers).toHaveLength(1);
  });

  it('falls back to category when label is unknown ("Compute" via category)', () => {
    const tree = render({ category: buildCategory({ label: 'Unknown', category: 'Compute' }), totalCost: 100 });
    const servers = findByPredicate(tree, (el) => el.type === Server);
    expect(servers).toHaveLength(1);
  });

  it('falls back to Package icon when neither label nor category is known', () => {
    const tree = render({
      category: buildCategory({ label: 'NoSuch', category: 'NoSuch' }),
      totalCost: 100,
    });
    const packages = findByPredicate(tree, (el) => el.type === Package);
    expect(packages.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Percent math ────────────────────────────────────────────────────────

describe('CategoryRow — percent math', () => {
  it('computes a rounded percent when totalCost > 0', () => {
    const tree = render({
      category: buildCategory({ totalCost: 25 }),
      totalCost: 100,
    });
    const text = collectText(tree);
    expect(text).toContain('25%');
  });

  it('rounds non-integer percents (33.33% → 33%)', () => {
    const tree = render({
      category: buildCategory({ totalCost: 1 }),
      totalCost: 3,
    });
    const text = collectText(tree);
    expect(text).toContain('33%');
  });

  it('returns 0% when totalCost is 0 (avoid NaN)', () => {
    const tree = render({
      category: buildCategory({ totalCost: 5 }),
      totalCost: 0,
    });
    const text = collectText(tree);
    expect(text).toContain('0%');
  });

  it('bar fill width matches percent', () => {
    const tree = render({
      category: buildCategory({ totalCost: 40 }),
      totalCost: 100,
    });
    const fills = findByPredicate(
      tree,
      (el) => el.type === 'div' && ((el.props as { style?: { width?: string } }).style?.width ?? '').endsWith('%'),
    );
    expect(fills).toHaveLength(1);
    expect((fills[0].props as { style: { width: string } }).style.width).toBe('40%');
  });
});

// ─── Color lookup ────────────────────────────────────────────────────────

describe('CategoryRow — bar color lookup', () => {
  it('uses the per-label color when available (Compute → bg-blue-500)', () => {
    const tree = render({ category: buildCategory({ label: 'Compute' }), totalCost: 100 });
    const fills = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        ((el.props as { className?: string }).className ?? '').includes('h-full') &&
        ((el.props as { className?: string }).className ?? '').includes('rounded-full') &&
        ((el.props as { className?: string }).className ?? '').includes('transition-all'),
    );
    expect(fills).toHaveLength(1);
    expect((fills[0].props as { className: string }).className).toContain('bg-blue-500');
  });

  it('falls through to bg-gray-500 for unknown buckets', () => {
    const tree = render({
      category: buildCategory({ label: 'NoSuch', category: 'NoSuch' }),
      totalCost: 100,
    });
    const fills = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        ((el.props as { className?: string }).className ?? '').includes('h-full') &&
        ((el.props as { className?: string }).className ?? '').includes('transition-all'),
    );
    const cls = (fills[0].props as { className: string }).className;
    expect(cls).toContain('bg-gray-500');
  });
});

// ─── Expanded node list ──────────────────────────────────────────────────

describe('CategoryRow — expanded list', () => {
  it('does NOT render node rows when collapsed', () => {
    mocks.expandedRef.current = false;
    const tree = render({
      category: buildCategory({
        nodes: [buildNode({ label: 'A' }), buildNode({ label: 'B' })],
      }),
      totalCost: 100,
    });
    const text = collectText(tree);
    expect(text).not.toContain('A');
    expect(text).not.toContain('B');
  });

  it('renders one row per node when expanded', () => {
    mocks.expandedRef.current = true;
    const tree = render({
      category: buildCategory({
        label: 'Compute',
        nodes: [
          buildNode({ nodeId: 'a', label: 'NodeA', monthlyCost: 25 }),
          buildNode({ nodeId: 'b', label: 'NodeB', monthlyCost: 50 }),
        ],
      }),
      totalCost: 100,
    });
    const text = collectText(tree);
    expect(text).toContain('NodeA');
    expect(text).toContain('NodeB');
  });
});

// ─── Toggle wiring ───────────────────────────────────────────────────────

describe('CategoryRow — toggle', () => {
  it('button onClick toggles expanded via setExpanded', () => {
    mocks.expandedRef.current = false;
    const tree = render({ category: buildCategory(), totalCost: 100 });
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    expect(buttons).toHaveLength(1);
    const onClick = (buttons[0].props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.setExpandedSpy).toHaveBeenCalledWith(true);
  });

  it('button onClick toggles to false when starting expanded', () => {
    mocks.expandedRef.current = true;
    const tree = render({ category: buildCategory(), totalCost: 100 });
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    const onClick = (buttons[0].props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.setExpandedSpy).toHaveBeenCalledWith(false);
  });
});

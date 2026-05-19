/**
 * Tests for `inline-table-view/table-footer.tsx` (rf-itab-2).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, unknown>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
  }),
}));

import { TableFooter, type TableFooterProps } from '../table-footer';
import type { RowStatus } from '../../inline-table-view-helpers';

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  if (typeof el.type === 'function') return;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

const baseProps: TableFooterProps = {
  sortedCount: 5,
  totalCount: 5,
  selectedCount: 0,
  counts: { live: 3, drifted: 0, deploying: 0, building: 0, queued: 0, failed: 2, idle: 0 } as Record<
    RowStatus,
    number
  >,
  statusFilter: new Set<RowStatus>(),
  onToggleStatus: vi.fn(),
};

function render(overrides: Partial<TableFooterProps> = {}): React.ReactNode {
  return (TableFooter as unknown as (p: TableFooterProps) => React.ReactNode)({ ...baseProps, ...overrides });
}

describe('inline-table-view/table-footer', () => {
  it('renders total count when sortedCount === totalCount', () => {
    const tree = render({ sortedCount: 7, totalCount: 7 });
    let foundTotal = false;
    for (const el of walk(tree)) {
      const c = (el.props as any)?.children;
      if (typeof c === 'string' && c.startsWith('table.footer.total:')) foundTotal = true;
    }
    expect(foundTotal).toBe(true);
  });

  it('renders filtered count when sortedCount < totalCount', () => {
    const tree = render({ sortedCount: 2, totalCount: 7 });
    let foundFiltered = false;
    for (const el of walk(tree)) {
      const c = (el.props as any)?.children;
      if (typeof c === 'string' && c.startsWith('table.footer.filtered:')) foundFiltered = true;
    }
    expect(foundFiltered).toBe(true);
  });

  it('does NOT render the selected count span when selectedCount === 0', () => {
    const tree = render({ selectedCount: 0 });
    let foundSelected = false;
    for (const el of walk(tree)) {
      const c = (el.props as any)?.children;
      if (typeof c === 'string' && c.startsWith('table.footer.selected:')) foundSelected = true;
    }
    expect(foundSelected).toBe(false);
  });

  it('renders the selected count span when selectedCount > 0', () => {
    const tree = render({ selectedCount: 2 });
    let foundSelected = false;
    for (const el of walk(tree)) {
      const c = (el.props as any)?.children;
      if (typeof c === 'string' && c.startsWith('table.footer.selected:')) foundSelected = true;
    }
    expect(foundSelected).toBe(true);
  });

  it('renders one mini-count button per non-zero status', () => {
    const tree = render();
    const buttons: React.ReactElement[] = [];
    for (const el of walk(tree)) {
      if (el.type === 'button') buttons.push(el);
    }
    // counts has live=3, failed=2 → 2 buttons
    expect(buttons).toHaveLength(2);
  });

  it('marks active class on a status button when its status is in the filter', () => {
    const tree = render({ statusFilter: new Set<RowStatus>(['live']) });
    const buttons: React.ReactElement[] = [];
    for (const el of walk(tree)) {
      if (el.type === 'button') buttons.push(el);
    }
    // buttons rendered in order of ALL_STATUSES filtered by counts > 0:
    // live (idx 0), failed (idx 1)
    // Active state appends 'text-ice-text-1' to the class string. Inactive
    // string already contains 'hover:text-ice-text-1' so we test class
    // membership via split-on-space rather than substring.
    const classes0 = ((buttons[0]!.props as any).className as string).split(' ');
    expect(classes0).toContain('text-ice-text-1');
    const classes1 = ((buttons[1]!.props as any).className as string).split(' ');
    expect(classes1).not.toContain('text-ice-text-1');
  });

  it('invokes onToggleStatus when a status button is clicked', () => {
    const onToggleStatus = vi.fn();
    const tree = render({ onToggleStatus });
    const buttons: React.ReactElement[] = [];
    for (const el of walk(tree)) {
      if (el.type === 'button') buttons.push(el);
    }
    (buttons[0]!.props as any).onClick();
    expect(onToggleStatus).toHaveBeenCalledWith('live');
    (buttons[1]!.props as any).onClick();
    expect(onToggleStatus).toHaveBeenCalledWith('failed');
  });
});

/**
 * Tests for `inline-table-view/column-header.tsx` (rf-itab-2).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { ColumnHeader } from '../column-header';
import type { SortCol, SortDir } from '../types';

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

function render(props: { sortCol: SortCol; sortDir: SortDir; onToggleSort: (col: SortCol) => void }) {
  return (ColumnHeader as unknown as (p: typeof props) => React.ReactNode)(props);
}

describe('inline-table-view/column-header', () => {
  it('renders six SortHeader buttons + 1 endpoints span + 2 spacer spans', () => {
    const tree = render({ sortCol: 'label', sortDir: 'asc', onToggleSort: vi.fn() });
    const buttons: React.ReactElement[] = [];
    const spans: React.ReactElement[] = [];
    for (const el of walk(tree)) {
      if (el.type === 'button') buttons.push(el);
      if (el.type === 'span') spans.push(el);
    }
    // 6 SortHeader → 6 button elements
    expect(buttons).toHaveLength(6);
    // 2 spacer spans + 1 Endpoints label span
    expect(spans).toHaveLength(3);
  });

  it('passes sortCol and sortDir down so the active column shows the right arrow', () => {
    const tree = render({ sortCol: 'status', sortDir: 'desc', onToggleSort: vi.fn() });
    // Find the button whose label is 'table.columns.status'
    const buttons: React.ReactElement[] = [];
    for (const el of walk(tree)) {
      if (el.type === 'button') buttons.push(el);
    }
    const statusButton = buttons.find((b) => {
      const c = (b.props as any).children;
      return Array.isArray(c) && c[0] === 'table.columns.status';
    });
    expect(statusButton).toBeDefined();
    // Active button has text-ice-text-1 in className
    expect((statusButton!.props as any).className).toContain('text-ice-text-1');
  });

  it('threads onToggleSort through to each SortHeader', () => {
    const onToggleSort = vi.fn();
    const tree = render({ sortCol: 'label', sortDir: 'asc', onToggleSort });
    const buttons: React.ReactElement[] = [];
    for (const el of walk(tree)) {
      if (el.type === 'button') buttons.push(el);
    }
    // Click each — should fire toggleSort with the right col arg
    const expectedCols: SortCol[] = ['label', 'typeLabel', 'provider', 'status', 'providerId', 'updatedAt'];
    for (let i = 0; i < buttons.length; i++) {
      (buttons[i]!.props as any).onClick();
    }
    expect(onToggleSort.mock.calls.map((c) => c[0])).toEqual(expectedCols);
  });
});

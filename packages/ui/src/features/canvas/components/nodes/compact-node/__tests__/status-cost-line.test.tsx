/**
 * Tests for `StatusCostLine` — the bottom row of the compact node:
 * status dot + label on the left, optional cost on the right.
 *
 * Branches:
 *   - statusLabel non-empty: render dot + label, statusColor on dot.
 *   - statusLabel empty: render placeholder <span /> (preserves
 *     space-between layout).
 *   - estimatedCost non-empty: render cost span on the right; otherwise omit.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { StatusCostLine } from '../status-cost-line';

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
function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}
function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  const visit = (n: ReactNodeLike): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    visit(((n as React.ReactElement).props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join('');
}

const renderSCL = (
  props: Partial<React.ComponentProps<typeof StatusCostLine>> = {},
): React.ReactElement => {
  const Inner = (StatusCostLine as unknown as {
    type: (p: React.ComponentProps<typeof StatusCostLine>) => React.ReactElement;
  }).type;
  const defaults: React.ComponentProps<typeof StatusCostLine> = {
    statusLabel: '',
    statusColor: '#22c55e',
    estimatedCost: '',
  };
  return Inner({ ...defaults, ...props });
};

describe('StatusCostLine — React.memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    expect(typeof (StatusCostLine as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
  });

  it('carries displayName "StatusCostLine"', () => {
    expect((StatusCostLine as unknown as { displayName: string }).displayName).toBe('StatusCostLine');
  });
});

describe('StatusCostLine — status pill', () => {
  it('renders dot + label when statusLabel set', () => {
    const tree = renderSCL({ statusLabel: 'Active', statusColor: '#cafe22' });
    expect(collectText(tree)).toContain('Active');
    const dot = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { width?: number; height?: number; background?: string } }).style;
      return style?.width === 5 && style?.height === 5 && style?.background === '#cafe22';
    });
    expect(dot).toHaveLength(1);
  });

  it('renders empty placeholder span when statusLabel empty', () => {
    const tree = renderSCL({ statusLabel: '', estimatedCost: '$0.42' });
    // The empty span is at the LEFT of the row; cost is on the right.
    expect(collectText(tree)).toContain('$0.42');
    expect(collectText(tree)).not.toContain('Active');
    // The empty span has no children.
    const empties = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const c = (el.props as { children?: unknown }).children;
      return c === undefined;
    });
    expect(empties.length).toBeGreaterThan(0);
  });
});

describe('StatusCostLine — cost', () => {
  it('renders cost span when estimatedCost non-empty', () => {
    const tree = renderSCL({ statusLabel: 'X', estimatedCost: '$1.00/h' });
    expect(collectText(tree)).toContain('$1.00/h');
  });

  it('omits cost span when estimatedCost empty', () => {
    const tree = renderSCL({ statusLabel: 'X', estimatedCost: '' });
    // Only the status label appears; no cost text.
    expect(collectText(tree)).toBe('X');
  });
});

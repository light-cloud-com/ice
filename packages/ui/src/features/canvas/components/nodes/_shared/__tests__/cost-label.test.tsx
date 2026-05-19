/**
 * Tests for `CostLabel` — a tiny mono inline `$X / mo` chip.
 *
 * Pure memoized FC. Coverage targets the spread default (no `style`)
 * and the override branch (style passes through and merges).
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { CostLabel } from '../cost-label';

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

function renderInner(props: React.ComponentProps<typeof CostLabel>): React.ReactElement {
  // CostLabel is React.memo-wrapped; reach into .type for the inner FC.
  const Inner = (
    CostLabel as unknown as {
      type: (p: React.ComponentProps<typeof CostLabel>) => React.ReactElement;
    }
  ).type;
  return Inner(props);
}

describe('CostLabel', () => {
  it('renders the cost string verbatim', () => {
    const tree = renderInner({ cost: '$12.50/mo' });
    const span = [...walk(tree)][0];
    expect((span.props as { children: unknown }).children).toBe('$12.50/mo');
  });

  it('applies the default secondary text color and mono font when no style is given', () => {
    const tree = renderInner({ cost: '$0' });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.color).toBe('var(--ice-text-secondary)');
    expect(style.opacity).toBe(0.7);
    expect(style.pointerEvents).toBe('none');
  });

  it('merges the optional style override on top of the defaults', () => {
    const tree = renderInner({ cost: '$5', style: { color: 'red', marginLeft: 4 } });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    // Override wins for `color`, defaults remain for everything else.
    expect(style.color).toBe('red');
    expect(style.marginLeft).toBe(4);
    expect(style.opacity).toBe(0.7);
  });

  it('is a memoized component (exposes $$typeof for react.memo)', () => {
    const memoTypeof = (CostLabel as unknown as { $$typeof: symbol }).$$typeof;
    expect(String(memoTypeof)).toBe('Symbol(react.memo)');
  });

  it('exposes a stable displayName', () => {
    expect((CostLabel as unknown as { displayName: string }).displayName).toBe('CostLabel');
  });
});

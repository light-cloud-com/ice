/**
 * Tests for `ValidationBadge` — the small severity dot (red error / amber
 * warning) that overlays the corner of a block with a validation issue.
 *
 * Branches: severity (error/warning) → background color, small flag → 8px
 * vs 12px size + suppress count text, count > 1 → render count, count > 9 → "9+".
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ValidationBadge } from '../validation-badge';

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

const renderInner = (props: React.ComponentProps<typeof ValidationBadge>): React.ReactElement => {
  const Inner = (ValidationBadge as unknown as {
    type: (p: React.ComponentProps<typeof ValidationBadge>) => React.ReactElement;
  }).type;
  return Inner(props);
};

describe('ValidationBadge', () => {
  it('uses the red error color when severity="error"', () => {
    const tree = renderInner({ severity: 'error' });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.background).toBe('#ef4444');
  });

  it('uses the amber warning color when severity="warning"', () => {
    const tree = renderInner({ severity: 'warning' });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.background).toBe('#f59e0b');
  });

  it('renders 12×12 by default (small=false)', () => {
    const tree = renderInner({ severity: 'error' });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.width).toBe(12);
    expect(style.height).toBe(12);
  });

  it('renders 8×8 when small=true', () => {
    const tree = renderInner({ severity: 'error', small: true });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.width).toBe(8);
    expect(style.height).toBe(8);
  });

  it('omits the count text when count = 1', () => {
    const tree = renderInner({ severity: 'error', count: 1 });
    const inner = [...walk(tree)].filter((el) => el.type === 'span' && el !== tree);
    // No inner count span.
    expect(inner).toHaveLength(0);
  });

  it('renders the count as text when count > 1 (not small)', () => {
    const tree = renderInner({ severity: 'error', count: 3 });
    const inner = [...walk(tree)].filter((el) => el.type === 'span' && el !== tree);
    expect(inner).toHaveLength(1);
    expect((inner[0].props as { children: unknown }).children).toBe(3);
  });

  it('caps the displayed count at "9+" when count > 9', () => {
    const tree = renderInner({ severity: 'warning', count: 12 });
    const inner = [...walk(tree)].filter((el) => el.type === 'span' && el !== tree);
    expect((inner[0].props as { children: unknown }).children).toBe('9+');
  });

  it('omits the count text when small=true even with count > 1', () => {
    const tree = renderInner({ severity: 'error', count: 5, small: true });
    const inner = [...walk(tree)].filter((el) => el.type === 'span' && el !== tree);
    expect(inner).toHaveLength(0);
  });

  it('passes through a custom style override', () => {
    const tree = renderInner({ severity: 'error', style: { marginLeft: 4 } });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.marginLeft).toBe(4);
  });

  it('exposes a stable displayName', () => {
    expect((ValidationBadge as unknown as { displayName: string }).displayName).toBe('ValidationBadge');
  });
});

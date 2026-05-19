/**
 * Tests for `StatusDot` — a colored circle plus optional label.
 *
 * Memoized FC. Branches: default radius / custom radius, optional label.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { StatusDot } from '../status-dot';

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

const renderInner = (props: React.ComponentProps<typeof StatusDot>): React.ReactElement => {
  const Inner = (
    StatusDot as unknown as {
      type: (p: React.ComponentProps<typeof StatusDot>) => React.ReactElement;
    }
  ).type;
  return Inner(props);
};

describe('StatusDot', () => {
  it('renders a circular dot using the supplied color and default radius (3)', () => {
    const tree = renderInner({ color: '#22c55e' });
    const els = [...walk(tree)];
    const dot = els.find(
      (el) =>
        el.type === 'span' && (el.props as { style?: Record<string, string | number> }).style?.borderRadius === '50%',
    )!;
    const style = (dot.props as { style: Record<string, string | number> }).style;
    expect(style.background).toBe('#22c55e');
    expect(style.width).toBe(6); // radius * 2
    expect(style.height).toBe(6);
  });

  it('uses the supplied radius when given (radius=5 → 10px square dot)', () => {
    const tree = renderInner({ color: '#ef4444', radius: 5 });
    const els = [...walk(tree)];
    const dot = els.find(
      (el) =>
        el.type === 'span' && (el.props as { style?: Record<string, string | number> }).style?.borderRadius === '50%',
    )!;
    const style = (dot.props as { style: Record<string, string | number> }).style;
    expect(style.width).toBe(10);
    expect(style.height).toBe(10);
  });

  it('omits the label span when no label prop is provided', () => {
    const tree = renderInner({ color: 'red' });
    const els = [...walk(tree)];
    // Only the outer wrapper + the dot.
    const labelSpan = els.find(
      (el) => el.type === 'span' && typeof (el.props as { children?: unknown }).children === 'string',
    );
    expect(labelSpan).toBeUndefined();
  });

  it('renders the label span verbatim when supplied', () => {
    const tree = renderInner({ color: 'red', label: 'streaming' });
    const els = [...walk(tree)];
    const labelSpan = els.find(
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'streaming',
    );
    expect(labelSpan).toBeDefined();
  });

  it('outer wrapper gap scales with radius (radius+2)', () => {
    const tree = renderInner({ color: 'red', radius: 8 });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.gap).toBe(10); // 8 + 2
  });

  it('exposes a stable displayName', () => {
    expect((StatusDot as unknown as { displayName: string }).displayName).toBe('StatusDot');
  });
});

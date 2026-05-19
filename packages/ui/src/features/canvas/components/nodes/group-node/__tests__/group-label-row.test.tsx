/**
 * Tests for `GroupLabelRow` — small text row above a group box: optional
 * leading dot when `color` set, label, optional trailing childCount.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { GroupLabelRow } from '../group-label-row';

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

const renderGLR = (
  props: Partial<React.ComponentProps<typeof GroupLabelRow>> = {},
): React.ReactElement => {
  const Inner = (GroupLabelRow as unknown as {
    type: (p: React.ComponentProps<typeof GroupLabelRow>) => React.ReactElement;
  }).type;
  const defaults: React.ComponentProps<typeof GroupLabelRow> = { label: 'Group A' };
  return Inner({ ...defaults, ...props });
};

describe('GroupLabelRow', () => {
  it('is wrapped in React.memo with displayName', () => {
    expect(typeof (GroupLabelRow as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((GroupLabelRow as unknown as { displayName: string }).displayName).toBe('GroupLabelRow');
  });

  it('renders the label inside a span', () => {
    const tree = renderGLR({ label: 'My Group' });
    const labelSpan = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'My Group');
    expect(labelSpan).toHaveLength(1);
  });

  it('label color: uses provided color when set', () => {
    const tree = renderGLR({ label: 'X', color: '#3b82f6' });
    const labelSpan = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'X')[0];
    expect((labelSpan.props as { style: { color: string } }).style.color).toBe('#3b82f6');
  });

  it('label color: falls back to var when color undefined', () => {
    const tree = renderGLR({ label: 'X' });
    const labelSpan = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'X')[0];
    expect((labelSpan.props as { style: { color: string } }).style.color).toBe('var(--ice-text-secondary)');
  });

  it('renders leading dot when color set', () => {
    const tree = renderGLR({ label: 'X', color: '#3b82f6' });
    const dot = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { width?: number; height?: number } }).style;
      return style?.width === 8 && style?.height === 8;
    });
    expect(dot).toHaveLength(1);
    expect((dot[0].props as { style: { background: string } }).style.background).toBe('#3b82f6');
  });

  it('omits leading dot when color is undefined', () => {
    const tree = renderGLR({ label: 'X' });
    const dot = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { width?: number; height?: number } }).style;
      return style?.width === 8 && style?.height === 8;
    });
    expect(dot).toHaveLength(0);
  });

  it('renders childCount span when childCount > 0', () => {
    const tree = renderGLR({ label: 'X', childCount: 3 });
    const cnt = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 3);
    expect(cnt).toHaveLength(1);
  });

  it('omits childCount span when childCount === 0', () => {
    const tree = renderGLR({ label: 'X', childCount: 0 });
    const cnt = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 0);
    expect(cnt).toHaveLength(0);
  });

  it('omits childCount span when childCount undefined (no prop)', () => {
    const tree = renderGLR({ label: 'X' });
    const cnt = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { fontSize?: number } }).style;
      return style?.fontSize === 10;
    });
    expect(cnt).toHaveLength(0);
  });
});

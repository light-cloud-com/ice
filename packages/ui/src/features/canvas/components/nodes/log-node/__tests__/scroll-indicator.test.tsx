/**
 * Tests for `ScrollIndicator` — the right-rail scrollbar drawn next to
 * the log content. Renders a track + a thumb; thumb position derives
 * from `scrollProgress` (1 = top of track, 0 = bottom). When
 * `isAutoScroll` is true the thumb is green; otherwise it's grey.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ScrollIndicator } from '../scroll-indicator';

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
function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}

const renderSI = (props: {
  trackHeight: number;
  scrollProgress: number;
  isAutoScroll: boolean;
}): React.ReactElement => {
  const Inner = (
    ScrollIndicator as unknown as {
      type: (p: typeof props) => React.ReactElement;
    }
  ).type;
  return Inner(props);
};

const findThumb = (tree: React.ReactElement): React.ReactElement | undefined =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const style = (el.props as { style?: { position?: string; height?: number } }).style;
    return style?.position === 'absolute' && style?.height === 30;
  })[0];

describe('ScrollIndicator', () => {
  it('is wrapped in React.memo with displayName', () => {
    expect(typeof (ScrollIndicator as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((ScrollIndicator as unknown as { displayName: string }).displayName).toBe('ScrollIndicator');
  });

  it('outer div height = trackHeight', () => {
    const tree = renderSI({ trackHeight: 100, scrollProgress: 1, isAutoScroll: true });
    expect((tree.props as { style: { height: number } }).style.height).toBe(100);
  });

  it('thumb top = (1 - scrollProgress) * (trackHeight - thumbHeight)', () => {
    const tree = renderSI({ trackHeight: 100, scrollProgress: 1, isAutoScroll: false });
    const thumb = findThumb(tree)!;
    expect((thumb.props as { style: { top: number } }).style.top).toBe(0);

    const tree2 = renderSI({ trackHeight: 100, scrollProgress: 0, isAutoScroll: false });
    const thumb2 = findThumb(tree2)!;
    expect((thumb2.props as { style: { top: number } }).style.top).toBe(70); // 100 - 30 = 70
  });

  it('thumb is green when isAutoScroll', () => {
    const tree = renderSI({ trackHeight: 100, scrollProgress: 1, isAutoScroll: true });
    const thumb = findThumb(tree)!;
    expect((thumb.props as { style: { background: string } }).style.background).toBe('#22c55e');
  });

  it('thumb is grey when !isAutoScroll', () => {
    const tree = renderSI({ trackHeight: 100, scrollProgress: 1, isAutoScroll: false });
    const thumb = findThumb(tree)!;
    expect((thumb.props as { style: { background: string } }).style.background).toBe('var(--ice-border-strong)');
  });
});

/**
 * Tests for `Badge` — a small uppercase chip used on canvas blocks.
 *
 * Pure FC: renders one `<span>` with tone-driven background/border/color.
 * Coverage targets: default tone branch + every explicit tone key in
 * TONE_STYLES (neutral / accent / warning / danger / success).
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { Badge } from '../badge';

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

function findFirstSpan(tree: React.ReactNode): React.ReactElement {
  for (const el of walk(tree)) {
    if (el.type === 'span') return el;
  }
  throw new Error('expected at least one <span>');
}

describe('Badge', () => {
  it('returns the children verbatim inside a span', () => {
    const tree = Badge({ children: 'FIFO' });
    const span = findFirstSpan(tree);
    expect((span.props as { children: unknown }).children).toBe('FIFO');
  });

  it('defaults to the neutral tone when no tone prop is supplied', () => {
    const tree = Badge({ children: 'STD' });
    const span = findFirstSpan(tree);
    const style = (span.props as { style: Record<string, string> }).style;
    expect(style.background).toBe('transparent');
    expect(style.color).toBe('var(--ice-text-3)');
    expect(style.border).toBe('1px solid var(--ice-border)');
  });

  it('uses the accent tone palette for tone="accent"', () => {
    const tree = Badge({ children: 'MANAGED', tone: 'accent' });
    const span = findFirstSpan(tree);
    const style = (span.props as { style: Record<string, string> }).style;
    expect(style.background).toBe('rgba(139, 92, 246, 0.15)');
    expect(style.color).toBe('#c4b5fd');
    expect(style.border).toBe('1px solid rgba(139, 92, 246, 0.4)');
  });

  it('uses the warning tone palette for tone="warning"', () => {
    const tree = Badge({ children: '!', tone: 'warning' });
    const style = (findFirstSpan(tree).props as { style: Record<string, string> }).style;
    expect(style.color).toBe('#fbbf24');
    expect(style.background).toBe('rgba(217, 119, 6, 0.15)');
    expect(style.border).toBe('1px solid rgba(217, 119, 6, 0.4)');
  });

  it('uses the danger tone palette for tone="danger"', () => {
    const tree = Badge({ children: 'X', tone: 'danger' });
    const style = (findFirstSpan(tree).props as { style: Record<string, string> }).style;
    expect(style.color).toBe('#fca5a5');
    expect(style.background).toBe('rgba(220, 38, 38, 0.15)');
  });

  it('uses the success tone palette for tone="success"', () => {
    const tree = Badge({ children: 'OK', tone: 'success' });
    const style = (findFirstSpan(tree).props as { style: Record<string, string> }).style;
    expect(style.color).toBe('#86efac');
    expect(style.background).toBe('rgba(34, 197, 94, 0.15)');
  });

  it('applies uppercase and mono typographic treatment', () => {
    const tree = Badge({ children: 'std' });
    const style = (findFirstSpan(tree).props as { style: Record<string, string | number> }).style;
    expect(style.textTransform).toBe('uppercase');
    expect(style.fontWeight).toBe(700);
  });

  it('exposes a stable displayName for devtools', () => {
    expect(Badge.displayName).toBe('Badge');
  });
});

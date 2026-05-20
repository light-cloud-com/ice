/**
 * Tests for `Pill` — a rounded display chip with optional accent color
 * and char-truncation.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { Pill } from '../pill';

const render = (props: React.ComponentProps<typeof Pill>): React.ReactElement => Pill(props) as React.ReactElement;

describe('Pill', () => {
  it('renders the children verbatim inside a span by default', () => {
    const tree = render({ children: 'queue-name' });
    expect(tree.type).toBe('span');
    expect((tree.props as { children: unknown }).children).toBe('queue-name');
  });

  it('truncates a long string child to maxChars-1 + ellipsis', () => {
    const tree = render({ children: 'this-is-a-very-long-pill-text', maxChars: 12 });
    // 12 - 1 = 11 chars + …
    expect((tree.props as { children: unknown }).children).toBe('this-is-a-v…');
  });

  it('does not truncate when string is shorter than maxChars', () => {
    const tree = render({ children: 'short', maxChars: 10 });
    expect((tree.props as { children: unknown }).children).toBe('short');
  });

  it('skips truncation when children is not a string (e.g. ReactNode child)', () => {
    const child = React.createElement('em', null, 'composed');
    const tree = render({ children: child, maxChars: 1 });
    // Non-string passes through untouched.
    expect((tree.props as { children: unknown }).children).toBe(child);
  });

  it('uses the default raised background and border without an accent', () => {
    const tree = render({ children: 'x' });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.background).toBe('var(--ice-bg-raised)');
    expect(style.border).toBe('1px solid var(--ice-border)');
    expect(style.color).toBe('var(--ice-text-primary)');
  });

  it('applies the accent color to text and tints background/border', () => {
    const tree = render({ children: 'x', accent: '#22c55e' });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.color).toBe('#22c55e');
    expect(style.background).toBe('#22c55e12');
    expect(style.border).toBe('1px solid #22c55e3b');
  });

  it('keeps mono font by default', () => {
    const tree = render({ children: 'x' });
    const style = (tree.props as { style: Record<string, string | undefined> }).style;
    expect(String(style.fontFamily)).toContain('monospace');
  });

  it('drops the mono fontFamily when mono=false', () => {
    const tree = render({ children: 'x', mono: false });
    const style = (tree.props as { style: Record<string, string | undefined> }).style;
    expect(style.fontFamily).toBeUndefined();
  });

  it('does not truncate when maxChars is undefined', () => {
    const long = 'a'.repeat(40);
    const tree = render({ children: long });
    expect((tree.props as { children: unknown }).children).toBe(long);
  });

  it('exposes a stable displayName', () => {
    expect(Pill.displayName).toBe('Pill');
  });
});

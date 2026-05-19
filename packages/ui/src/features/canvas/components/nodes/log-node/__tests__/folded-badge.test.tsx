/**
 * Tests for `FoldedBadge` — the green pill shown in the folded log
 * node header that displays the live log count.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { FoldedBadge } from '../folded-badge';

const renderFB = (logCount: number): React.ReactElement => {
  const Inner = (FoldedBadge as unknown as {
    type: (p: { logCount: number }) => React.ReactElement;
  }).type;
  return Inner({ logCount });
};

describe('FoldedBadge', () => {
  it('is wrapped in React.memo with displayName', () => {
    expect(typeof (FoldedBadge as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((FoldedBadge as unknown as { displayName: string }).displayName).toBe('FoldedBadge');
  });

  it('renders a <span> containing the log count + " logs"', () => {
    const tree = renderFB(7);
    expect(tree.type).toBe('span');
    const children = (tree.props as { children: React.ReactNode[] }).children;
    expect(children[0]).toBe(7);
    // The `&nbsp;logs` JSX collapses into a single string after the count.
    const tail = children.slice(1).join('');
    expect(tail).toContain('logs');
  });

  it('renders 0 logs without throwing', () => {
    const tree = renderFB(0);
    expect((tree.props as { children: React.ReactNode[] }).children[0]).toBe(0);
  });

  it('uses green tint colours', () => {
    const tree = renderFB(1);
    const style = (tree.props as { style: { color: string; background: string } }).style;
    expect(style.color).toBe('#22c55e');
    expect(style.background).toBe('#22c55e22');
  });
});

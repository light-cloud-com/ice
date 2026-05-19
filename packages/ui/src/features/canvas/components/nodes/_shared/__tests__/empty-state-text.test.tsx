/**
 * Tests for `EmptyStateText` — the centered "Drop resources here" message.
 *
 * Memoized FC with one optional `text` prop (default = 'Drop resources here').
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { EmptyStateText } from '../empty-state-text';

const renderInner = (props: React.ComponentProps<typeof EmptyStateText>): React.ReactElement => {
  const Inner = (
    EmptyStateText as unknown as {
      type: (p: React.ComponentProps<typeof EmptyStateText>) => React.ReactElement;
    }
  ).type;
  return Inner(props);
};

describe('EmptyStateText', () => {
  it('falls back to "Drop resources here" when text is not provided', () => {
    const tree = renderInner({});
    expect((tree.props as { children: unknown }).children).toBe('Drop resources here');
  });

  it('renders the caller-supplied text verbatim', () => {
    const tree = renderInner({ text: 'No connections yet' });
    expect((tree.props as { children: unknown }).children).toBe('No connections yet');
  });

  it('renders inside a flex-1 centered div', () => {
    const tree = renderInner({});
    expect(tree.type).toBe('div');
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.display).toBe('flex');
    expect(style.flex).toBe(1);
    expect(style.pointerEvents).toBe('none');
  });

  it('is a memoized component', () => {
    const memoTypeof = (EmptyStateText as unknown as { $$typeof: symbol }).$$typeof;
    expect(String(memoTypeof)).toBe('Symbol(react.memo)');
  });

  it('exposes a stable displayName', () => {
    expect((EmptyStateText as unknown as { displayName: string }).displayName).toBe('EmptyStateText');
  });
});

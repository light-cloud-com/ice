/**
 * Tests for `ProviderPill` — a tiny uppercase provider label chip.
 *
 * Memoized FC: renders provider.toUpperCase() inside a styled span.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ProviderPill } from '../provider-pill';

const renderInner = (props: React.ComponentProps<typeof ProviderPill>): React.ReactElement => {
  const Inner = (ProviderPill as unknown as {
    type: (p: React.ComponentProps<typeof ProviderPill>) => React.ReactElement;
  }).type;
  return Inner(props);
};

describe('ProviderPill', () => {
  it('uppercases the provider for display', () => {
    const tree = renderInner({ provider: 'aws' });
    expect((tree.props as { children: unknown }).children).toBe('AWS');
  });

  it('handles already-uppercase input without harm', () => {
    const tree = renderInner({ provider: 'GCP' });
    expect((tree.props as { children: unknown }).children).toBe('GCP');
  });

  it('renders inside a span with mono font and disabled pointer events', () => {
    const tree = renderInner({ provider: 'azure' });
    expect(tree.type).toBe('span');
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.pointerEvents).toBe('none');
    expect(style.fontFamily).toContain('monospace');
  });

  it('is a memoized component', () => {
    const memoTypeof = (ProviderPill as unknown as { $$typeof: symbol }).$$typeof;
    expect(String(memoTypeof)).toBe('Symbol(react.memo)');
  });

  it('exposes a stable displayName', () => {
    expect((ProviderPill as unknown as { displayName: string }).displayName).toBe('ProviderPill');
  });
});

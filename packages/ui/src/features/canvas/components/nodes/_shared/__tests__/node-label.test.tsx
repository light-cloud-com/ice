/**
 * Tests for `NodeLabel` — the label text of a canvas block (with an
 * optional double-click-to-rename affordance).
 *
 * Branches: maxChars truncation (default 22 + ellipsis), interactive flag
 * → cursor + pointerEvents, double-click forwarding (with stopPropagation).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { NodeLabel } from '../node-label';

const renderInner = (props: React.ComponentProps<typeof NodeLabel>): React.ReactElement => {
  const Inner = (NodeLabel as unknown as {
    type: (p: React.ComponentProps<typeof NodeLabel>) => React.ReactElement;
  }).type;
  return Inner(props);
};

describe('NodeLabel', () => {
  it('renders the label verbatim when shorter than maxChars', () => {
    const tree = renderInner({ label: 'short' });
    expect((tree.props as { children: unknown }).children).toBe('short');
  });

  it('truncates to maxChars+ellipsis when longer than the default 22', () => {
    const tree = renderInner({ label: 'this is definitely longer than twenty two chars' });
    const text = (tree.props as { children: string }).children;
    expect(text.length).toBe(23); // 22 chars + 1-char ellipsis
    expect(text.endsWith('…')).toBe(true);
    expect(text.startsWith('this is definitely lon')).toBe(true);
  });

  it('honors a custom maxChars value', () => {
    const tree = renderInner({ label: 'abcdefghij', maxChars: 5 });
    const text = (tree.props as { children: string }).children;
    expect(text).toBe('abcde…');
  });

  it('uses the supplied font size (default 13)', () => {
    const tree = renderInner({ label: 'x' });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.fontSize).toBe(13);
  });

  it('switches to interactive cursor + pointerEvents when interactive=true', () => {
    const tree = renderInner({ label: 'x', interactive: true });
    const style = (tree.props as { style: Record<string, string> }).style;
    expect(style.cursor).toBe('text');
    expect(style.pointerEvents).toBe('auto');
  });

  it('uses inherit cursor + pointerEvents=none when not interactive', () => {
    const tree = renderInner({ label: 'x' });
    const style = (tree.props as { style: Record<string, string> }).style;
    expect(style.cursor).toBe('inherit');
    expect(style.pointerEvents).toBe('none');
  });

  it('forwards onDoubleClick when supplied (and stops propagation)', () => {
    const onDouble = vi.fn();
    const tree = renderInner({ label: 'x', onDoubleClick: onDouble });
    const stop = vi.fn();
    const handler = (tree.props as { onDoubleClick: (e: React.MouseEvent) => void }).onDoubleClick;
    handler({ stopPropagation: stop } as unknown as React.MouseEvent);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(onDouble).toHaveBeenCalledTimes(1);
  });

  it('exposes onDoubleClick = undefined when no handler is supplied', () => {
    const tree = renderInner({ label: 'x' });
    expect((tree.props as { onDoubleClick?: unknown }).onDoubleClick).toBeUndefined();
  });

  it('honors a custom fontSize', () => {
    const tree = renderInner({ label: 'x', fontSize: 18 });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.fontSize).toBe(18);
  });

  it('exposes a stable displayName', () => {
    expect((NodeLabel as unknown as { displayName: string }).displayName).toBe('NodeLabel');
  });
});

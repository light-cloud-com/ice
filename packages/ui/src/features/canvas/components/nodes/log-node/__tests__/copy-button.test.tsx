/**
 * Tests for `CopyButton` — a small terminal-style "COPY" button used in
 * the LogHeader. Renders a <button> + stops propagation on mouseDown
 * (so dragging the canvas doesn't fire when starting from the button).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { CopyButton } from '../copy-button';

const renderCB = (onClick: (e: React.MouseEvent) => void = () => {}): React.ReactElement => {
  const Inner = (
    CopyButton as unknown as {
      type: (p: { onClick: (e: React.MouseEvent) => void }) => React.ReactElement;
    }
  ).type;
  return Inner({ onClick });
};

describe('CopyButton', () => {
  it('is wrapped in React.memo with displayName "CopyButton"', () => {
    expect(typeof (CopyButton as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((CopyButton as unknown as { displayName: string }).displayName).toBe('CopyButton');
  });

  it('renders a <button> with COPY label', () => {
    const tree = renderCB();
    expect(tree.type).toBe('button');
    expect((tree.props as { children: string }).children).toBe('COPY');
  });

  it('forwards onClick prop', () => {
    const click = vi.fn();
    const tree = renderCB(click);
    (tree.props as { onClick: (e: React.MouseEvent) => void }).onClick({} as React.MouseEvent);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('stops propagation on mouseDown', () => {
    const tree = renderCB();
    const stops: string[] = [];
    (tree.props as { onMouseDown: (e: React.MouseEvent) => void }).onMouseDown({
      stopPropagation: () => stops.push('s'),
    } as React.MouseEvent);
    expect(stops).toEqual(['s']);
  });

  it('button has type="button" (not submit)', () => {
    const tree = renderCB();
    expect((tree.props as { type: string }).type).toBe('button');
  });
});

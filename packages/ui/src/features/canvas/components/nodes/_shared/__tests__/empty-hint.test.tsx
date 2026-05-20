/**
 * Tests for `EmptyHint` — a dashed placeholder hint inside an empty body.
 *
 * Pure FC. Renders one container `<div>` with the supplied message verbatim.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { EmptyHint } from '../empty-hint';

describe('EmptyHint', () => {
  it('renders the supplied message inside a div', () => {
    const tree = EmptyHint({ message: 'Configure in side panel' }) as React.ReactElement;
    expect(tree.type).toBe('div');
    expect((tree.props as { children: unknown }).children).toBe('Configure in side panel');
  });

  it('uses uppercase / tracked-caps typographic treatment', () => {
    const tree = EmptyHint({ message: 'x' }) as React.ReactElement;
    const style = (tree.props as { style: Record<string, string> }).style;
    expect(style.textTransform).toBe('uppercase');
    expect(style.letterSpacing).toBe('0.14em');
    expect(style.pointerEvents).toBe('none');
    expect(style.userSelect).toBe('none');
  });

  it('uses a dashed tertiary border to read as "waiting for content"', () => {
    const tree = EmptyHint({ message: 'x' }) as React.ReactElement;
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.border).toBe('1px dashed var(--ice-border)');
    expect(style.color).toBe('var(--ice-text-tertiary)');
  });

  it('exposes a stable displayName', () => {
    expect(EmptyHint.displayName).toBe('EmptyHint');
  });
});

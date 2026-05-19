/**
 * Tests for `inline-table-view/filter-chip.tsx` (rf-itab-1).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { FilterChip } from '../filter-chip';

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return;
  }
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

function findElements(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}

function render(props: { active: boolean; label: string; onClick: () => void; dot?: string }) {
  return (FilterChip as unknown as (p: typeof props) => React.ReactNode)(props);
}

describe('inline-table-view/filter-chip', () => {
  it('renders the label string in the button', () => {
    const tree = render({ active: false, label: 'Live 3', onClick: vi.fn() });
    const buttons = findElements(tree, (el) => el.type === 'button');
    expect(buttons).toHaveLength(1);
    // label is one of the children entries; the dot may be undefined
    const children = buttons[0]!.props.children as React.ReactNode[];
    const labelEntry = children.find((c) => typeof c === 'string');
    expect(labelEntry).toBe('Live 3');
  });

  it('does NOT render the dot when no dot prop is provided', () => {
    const tree = render({ active: false, label: 'X', onClick: vi.fn() });
    const buttons = findElements(tree, (el) => el.type === 'button');
    const children = buttons[0]!.props.children as React.ReactNode[];
    // First child should be the falsy dot expression (undefined or false)
    expect(children[0]).toBeFalsy();
  });

  it('renders a dot span with background color when dot prop is provided', () => {
    const tree = render({ active: false, label: 'X', onClick: vi.fn(), dot: '#ff00aa' });
    const buttons = findElements(tree, (el) => el.type === 'button');
    const children = buttons[0]!.props.children as React.ReactNode[];
    const dotEl = children[0] as React.ReactElement;
    expect(dotEl.type).toBe('span');
    expect((dotEl.props as any).style).toEqual({ background: '#ff00aa' });
  });

  it('applies active classes when active === true', () => {
    const tree = render({ active: true, label: 'X', onClick: vi.fn() });
    const buttons = findElements(tree, (el) => el.type === 'button');
    expect((buttons[0]!.props as any).className).toContain('bg-ice-accent-muted');
    expect((buttons[0]!.props as any).className).toContain('border-ice-accent');
  });

  it('applies inactive classes when active === false', () => {
    const tree = render({ active: false, label: 'X', onClick: vi.fn() });
    const buttons = findElements(tree, (el) => el.type === 'button');
    expect((buttons[0]!.props as any).className).toContain('bg-ice-raised');
    expect((buttons[0]!.props as any).className).toContain('border-ice-border');
  });

  it('invokes onClick when the button is clicked', () => {
    const onClick = vi.fn();
    const tree = render({ active: false, label: 'X', onClick });
    const buttons = findElements(tree, (el) => el.type === 'button');
    (buttons[0]!.props as any).onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

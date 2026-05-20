/**
 * Tests for `inline-table-view/sort-header.tsx` (rf-itab-1). Uses the
 * direct-FC tree-walker pattern; no jsdom.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { SortHeader } from '../sort-header';
import type { SortCol, SortDir } from '../types';

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

function render(props: {
  col: SortCol;
  label: string;
  sortCol: SortCol;
  sortDir: SortDir;
  align?: 'left' | 'right';
  onToggleSort: (col: SortCol) => void;
}) {
  return (SortHeader as unknown as (p: typeof props) => React.ReactNode)(props);
}

describe('inline-table-view/sort-header', () => {
  const baseProps = {
    col: 'label' as SortCol,
    label: 'Name',
    sortCol: 'label' as SortCol,
    sortDir: 'asc' as SortDir,
    onToggleSort: vi.fn(),
  };

  it('renders the label string in the button', () => {
    const tree = render(baseProps);
    const buttons = findElements(tree, (el) => el.type === 'button');
    expect(buttons).toHaveLength(1);
    const children = buttons[0]!.props.children as React.ReactNode;
    // children = [labelString, <icon />]
    expect(Array.isArray(children) ? children[0] : children).toBe('Name');
  });

  it('renders ArrowUp icon when active and sortDir === asc', () => {
    const tree = render({ ...baseProps, sortDir: 'asc' });
    const buttons = findElements(tree, (el) => el.type === 'button');
    const icons = (buttons[0]!.props.children as React.ReactNode[]).filter(
      (c) => typeof c !== 'string' && c != null && (c as any).type,
    );
    // The icon is the ternary's true branch — ArrowUp
    const iconType = (icons[0] as any).type;
    expect(iconType?.displayName ?? iconType?.name ?? '').toMatch(/ArrowUp/i);
  });

  it('renders ArrowDown icon when active and sortDir === desc', () => {
    const tree = render({ ...baseProps, sortDir: 'desc' });
    const buttons = findElements(tree, (el) => el.type === 'button');
    const icons = (buttons[0]!.props.children as React.ReactNode[]).filter(
      (c) => typeof c !== 'string' && c != null && (c as any).type,
    );
    const iconType = (icons[0] as any).type;
    expect(iconType?.displayName ?? iconType?.name ?? '').toMatch(/ArrowDown/i);
  });

  it('renders ArrowUpDown icon when not active', () => {
    const tree = render({ ...baseProps, col: 'status', sortCol: 'label' });
    const buttons = findElements(tree, (el) => el.type === 'button');
    const icons = (buttons[0]!.props.children as React.ReactNode[]).filter(
      (c) => typeof c !== 'string' && c != null && (c as any).type,
    );
    const iconType = (icons[0] as any).type;
    expect(iconType?.displayName ?? iconType?.name ?? '').toMatch(/ArrowUpDown/i);
  });

  it('applies active text class when col matches sortCol', () => {
    const tree = render(baseProps);
    const buttons = findElements(tree, (el) => el.type === 'button');
    expect((buttons[0]!.props as any).className).toContain('text-ice-text-1');
  });

  it('applies inactive text class when col does not match sortCol', () => {
    const tree = render({ ...baseProps, col: 'status', sortCol: 'label' });
    const buttons = findElements(tree, (el) => el.type === 'button');
    expect((buttons[0]!.props as any).className).toContain('text-ice-text-3');
  });

  it('applies justify-end when align === right', () => {
    const tree = render({ ...baseProps, align: 'right' });
    const buttons = findElements(tree, (el) => el.type === 'button');
    expect((buttons[0]!.props as any).className).toContain('justify-end');
  });

  it('does NOT apply justify-end when align === left (default)', () => {
    const tree = render(baseProps);
    const buttons = findElements(tree, (el) => el.type === 'button');
    expect((buttons[0]!.props as any).className).not.toContain('justify-end');
  });

  it('invokes onToggleSort with the col when clicked', () => {
    const onToggleSort = vi.fn();
    const tree = render({ ...baseProps, col: 'provider', onToggleSort });
    const buttons = findElements(tree, (el) => el.type === 'button');
    (buttons[0]!.props as any).onClick();
    expect(onToggleSort).toHaveBeenCalledWith('provider');
  });
});

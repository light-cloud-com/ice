/**
 * Tests for `NodeHeader` — the icon + label + trailing-content header
 * shared by every block.
 *
 * Branches: hideIcon flag, custom iconSize, labelFontSize, trailing slot,
 * onDoubleClickLabel forwarding.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { NodeHeader } from '../node-header';
import { CategoryIcon } from '../category-icon';
import { NodeLabel } from '../node-label';

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

const renderInner = (props: React.ComponentProps<typeof NodeHeader>): React.ReactElement => {
  const Inner = (NodeHeader as unknown as {
    type: (p: React.ComponentProps<typeof NodeHeader>) => React.ReactElement;
  }).type;
  return Inner(props);
};

describe('NodeHeader', () => {
  it('renders both a CategoryIcon and a NodeLabel by default', () => {
    const tree = renderInner({ category: 'compute', categoryColor: '#22c55e', label: 'API' });
    const els = [...walk(tree)];
    expect(els.some((el) => el.type === CategoryIcon)).toBe(true);
    expect(els.some((el) => el.type === NodeLabel)).toBe(true);
  });

  it('omits the CategoryIcon when hideIcon=true', () => {
    const tree = renderInner({ category: 'compute', categoryColor: '#22c55e', label: 'API', hideIcon: true });
    const els = [...walk(tree)];
    expect(els.some((el) => el.type === CategoryIcon)).toBe(false);
    expect(els.some((el) => el.type === NodeLabel)).toBe(true);
  });

  it('forwards iconSize to the CategoryIcon', () => {
    const tree = renderInner({ category: 'storage', categoryColor: '#fff', label: 'Bucket', iconSize: 24 });
    const els = [...walk(tree)];
    const iconEl = els.find((el) => el.type === CategoryIcon)!;
    expect((iconEl.props as { size: number }).size).toBe(24);
  });

  it('forwards labelFontSize to the NodeLabel', () => {
    const tree = renderInner({ category: 'storage', categoryColor: '#fff', label: 'Bucket', labelFontSize: 16 });
    const els = [...walk(tree)];
    const label = els.find((el) => el.type === NodeLabel)!;
    expect((label.props as { fontSize: number }).fontSize).toBe(16);
  });

  it('threads maxChars through to NodeLabel', () => {
    const tree = renderInner({ category: 'x', categoryColor: '#000', label: 'long label', maxChars: 6 });
    const label = [...walk(tree)].find((el) => el.type === NodeLabel)!;
    expect((label.props as { maxChars: number }).maxChars).toBe(6);
  });

  it('marks NodeLabel interactive when onDoubleClickLabel is supplied', () => {
    const onDouble = vi.fn();
    const tree = renderInner({
      category: 'x',
      categoryColor: '#000',
      label: 'a',
      onDoubleClickLabel: onDouble,
    });
    const label = [...walk(tree)].find((el) => el.type === NodeLabel)!;
    expect((label.props as { interactive: boolean }).interactive).toBe(true);
    expect((label.props as { onDoubleClick: () => void }).onDoubleClick).toBe(onDouble);
  });

  it('marks NodeLabel non-interactive when no onDoubleClickLabel is supplied', () => {
    const tree = renderInner({ category: 'x', categoryColor: '#000', label: 'a' });
    const label = [...walk(tree)].find((el) => el.type === NodeLabel)!;
    expect((label.props as { interactive: boolean }).interactive).toBe(false);
  });

  it('renders the trailing slot after the label', () => {
    const trailing = React.createElement('span', { 'data-stub': 'trailing' });
    const tree = renderInner({ category: 'x', categoryColor: '#000', label: 'a', trailing });
    const els = [...walk(tree)];
    expect(els.some((el) => (el.props as { 'data-stub'?: string })['data-stub'] === 'trailing')).toBe(true);
  });

  it('merges caller style override with default flex/gap header layout', () => {
    const tree = renderInner({
      category: 'x',
      categoryColor: '#000',
      label: 'a',
      style: { background: 'red' },
    });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.background).toBe('red');
    expect(style.display).toBe('flex');
    expect(style.gap).toBe(8);
  });

  it('exposes a stable displayName', () => {
    expect((NodeHeader as unknown as { displayName: string }).displayName).toBe('NodeHeader');
  });
});

/**
 * Tests for `ResizeHandle` — the bottom-right resize affordance on
 * resizable nodes. Two diagonal hash marks switch stroke color when hovered.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ResizeHandle } from '../resize-handle';

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

const renderInner = (props: React.ComponentProps<typeof ResizeHandle>): React.ReactElement => {
  const Inner = (
    ResizeHandle as unknown as {
      type: (p: React.ComponentProps<typeof ResizeHandle>) => React.ReactElement;
    }
  ).type;
  return Inner(props);
};

describe('ResizeHandle', () => {
  it('uses the muted border color by default (no hover)', () => {
    const tree = renderInner({});
    const lines = [...walk(tree)].filter((el) => el.type === 'line');
    expect(lines).toHaveLength(2);
    expect((lines[0].props as { stroke: string }).stroke).toBe('var(--ice-border)');
    expect((lines[1].props as { stroke: string }).stroke).toBe('var(--ice-border)');
  });

  it('switches stroke to the strong border color when hovered', () => {
    const tree = renderInner({ isHovered: true });
    const lines = [...walk(tree)].filter((el) => el.type === 'line');
    expect((lines[0].props as { stroke: string }).stroke).toBe('var(--ice-border-strong)');
    expect((lines[1].props as { stroke: string }).stroke).toBe('var(--ice-border-strong)');
  });

  it('renders a 16×16 absolute-positioned wrapper at bottom-right with se-resize cursor', () => {
    const tree = renderInner({});
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.position).toBe('absolute');
    expect(style.cursor).toBe('se-resize');
    expect(style.width).toBe(16);
    expect(style.height).toBe(16);
  });

  it('exposes a stable displayName', () => {
    expect((ResizeHandle as unknown as { displayName: string }).displayName).toBe('ResizeHandle');
  });
});

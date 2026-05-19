/**
 * Tests for `FoldButton` — a tiny chevron toggle (▶ when folded, ▼ when open).
 *
 * Memoized FC. Branches: folded vs unfolded path d, default opacity, custom
 * opacity, click forwarding, mousedown propagation stop.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { FoldButton } from '../fold-button';

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

const renderInner = (props: React.ComponentProps<typeof FoldButton>): React.ReactElement => {
  const Inner = (FoldButton as unknown as {
    type: (p: React.ComponentProps<typeof FoldButton>) => React.ReactElement;
  }).type;
  return Inner(props);
};

describe('FoldButton', () => {
  it('renders the right-chevron path when folded=true', () => {
    const tree = renderInner({ folded: true, onClick: vi.fn() });
    const paths = [...walk(tree)].filter((el) => el.type === 'path');
    expect(paths).toHaveLength(1);
    expect((paths[0].props as { d: string }).d).toBe('M4 2 l4 4 -4 4');
  });

  it('renders the down-chevron path when folded=false', () => {
    const tree = renderInner({ folded: false, onClick: vi.fn() });
    const paths = [...walk(tree)].filter((el) => el.type === 'path');
    expect(paths).toHaveLength(1);
    expect((paths[0].props as { d: string }).d).toBe('M2 4 l4 4 4 -4');
  });

  it('uses the default opacity (0.4) when no opacity prop is supplied', () => {
    const tree = renderInner({ folded: false, onClick: vi.fn() });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.opacity).toBe(0.4);
  });

  it('honors a custom opacity prop', () => {
    const tree = renderInner({ folded: false, onClick: vi.fn(), opacity: 0.85 });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.opacity).toBe(0.85);
  });

  it('forwards click events to the supplied onClick', () => {
    const onClick = vi.fn();
    const tree = renderInner({ folded: true, onClick });
    const evt = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    (tree.props as { onClick: (e: React.MouseEvent) => void }).onClick(evt);
    expect(onClick).toHaveBeenCalledWith(evt);
  });

  it('mousedown stops propagation so canvas drag does not start', () => {
    const tree = renderInner({ folded: false, onClick: vi.fn() });
    const stopProp = vi.fn();
    (tree.props as { onMouseDown: (e: React.MouseEvent) => void }).onMouseDown({
      stopPropagation: stopProp,
    } as unknown as React.MouseEvent);
    expect(stopProp).toHaveBeenCalledTimes(1);
  });

  it('exposes a stable displayName', () => {
    expect((FoldButton as unknown as { displayName: string }).displayName).toBe('FoldButton');
  });
});

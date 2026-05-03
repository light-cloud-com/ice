/**
 * Tests for `ConnectionDragGlow` — green pulsing ring drawn around a
 * valid connection target while the user drags from a source port.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ConnectionDragGlow } from '../connection-drag-glow';

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

const renderInner = (props: React.ComponentProps<typeof ConnectionDragGlow>): React.ReactElement => {
  const Inner = (ConnectionDragGlow as unknown as {
    type: (p: React.ComponentProps<typeof ConnectionDragGlow>) => React.ReactElement;
  }).type;
  return Inner(props);
};

describe('ConnectionDragGlow', () => {
  it('expands the bounding rect by 4 on every side', () => {
    const tree = renderInner({ x: 10, y: 20, width: 100, height: 50 });
    const props = tree.props as { x: number; y: number; width: number; height: number };
    expect(props.x).toBe(6);
    expect(props.y).toBe(16);
    expect(props.width).toBe(108);
    expect(props.height).toBe(58);
  });

  it('uses the green success stroke at 0.8 opacity', () => {
    const tree = renderInner({ x: 0, y: 0, width: 1, height: 1 });
    const props = tree.props as { stroke: string; opacity: number };
    expect(props.stroke).toBe('#22c55e');
    expect(props.opacity).toBe(0.8);
  });

  it('renders an animate child when reducedMotion=false (default)', () => {
    const tree = renderInner({ x: 0, y: 0, width: 1, height: 1 });
    const animates = [...walk(tree)].filter((el) => el.type === 'animate');
    expect(animates).toHaveLength(1);
    const props = animates[0].props as { attributeName: string; values: string };
    expect(props.attributeName).toBe('opacity');
    expect(props.values).toBe('0.5;0.9;0.5');
  });

  it('omits the animate child when reducedMotion=true', () => {
    const tree = renderInner({ x: 0, y: 0, width: 1, height: 1, reducedMotion: true });
    const animates = [...walk(tree)].filter((el) => el.type === 'animate');
    expect(animates).toHaveLength(0);
  });

  it('rx = CORNER_RADIUS+4', () => {
    const tree = renderInner({ x: 0, y: 0, width: 1, height: 1 });
    expect((tree.props as { rx: number }).rx).toBe(12);
  });

  it('exposes a stable displayName', () => {
    expect((ConnectionDragGlow as unknown as { displayName: string }).displayName).toBe('ConnectionDragGlow');
  });
});

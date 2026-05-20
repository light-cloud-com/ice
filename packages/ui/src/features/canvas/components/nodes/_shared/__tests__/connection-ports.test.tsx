/**
 * Tests for `ConnectionPorts` — the four-side circular drag-handles
 * that appear at the perimeter of every block.
 *
 * Branches exercised:
 *   - default sides = all four (top, right, bottom, left)
 *   - subset of sides
 *   - isValidTarget=true → green fill + radius=6
 *   - isValidTarget=false → user color + radius=5
 *   - per-side cx/cy positioning (the `portPosition` switch)
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ConnectionPorts } from '../connection-ports';

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

const renderInner = (props: React.ComponentProps<typeof ConnectionPorts>): React.ReactElement => {
  const Inner = (
    ConnectionPorts as unknown as {
      type: (p: React.ComponentProps<typeof ConnectionPorts>) => React.ReactElement;
    }
  ).type;
  return Inner(props);
};

const findCircles = (tree: React.ReactNode) => [...walk(tree)].filter((el) => el.type === 'circle');

describe('ConnectionPorts', () => {
  it('renders four circles by default (all four sides)', () => {
    const tree = renderInner({
      nodeId: 'n1',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      color: '#888',
    });
    const circles = findCircles(tree);
    expect(circles).toHaveLength(4);
    const sides = circles.map((c) => (c.props as { 'data-side': string })['data-side']);
    expect(sides.sort()).toEqual(['bottom', 'left', 'right', 'top']);
  });

  it('renders only the requested sides when sides prop is provided', () => {
    const tree = renderInner({
      nodeId: 'n1',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      color: '#888',
      sides: ['top', 'bottom'],
    });
    const circles = findCircles(tree);
    expect(circles).toHaveLength(2);
    const sides = circles.map((c) => (c.props as { 'data-side': string })['data-side']);
    expect(sides.sort()).toEqual(['bottom', 'top']);
  });

  it('uses the supplied color and radius=5 when not a valid target', () => {
    const tree = renderInner({
      nodeId: 'n1',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      color: '#abcdef',
    });
    const circle = findCircles(tree)[0];
    const props = circle.props as { fill: string; r: number };
    expect(props.fill).toBe('#abcdef');
    expect(props.r).toBe(5);
  });

  it('uses green fill (#22c55e) and radius=6 when isValidTarget=true', () => {
    const tree = renderInner({
      nodeId: 'n1',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      color: '#abcdef',
      isValidTarget: true,
    });
    const circle = findCircles(tree)[0];
    const props = circle.props as { fill: string; r: number };
    expect(props.fill).toBe('#22c55e');
    expect(props.r).toBe(6);
  });

  it('positions top port at (x+w/2, y)', () => {
    const tree = renderInner({
      nodeId: 'n1',
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      color: '#000',
      sides: ['top'],
    });
    const c = findCircles(tree)[0].props as { cx: number; cy: number };
    expect(c.cx).toBe(50); // 10 + 80/2
    expect(c.cy).toBe(20);
  });

  it('positions right port at (x+w, y+h/2)', () => {
    const tree = renderInner({
      nodeId: 'n1',
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      color: '#000',
      sides: ['right'],
    });
    const c = findCircles(tree)[0].props as { cx: number; cy: number };
    expect(c.cx).toBe(90); // 10 + 80
    expect(c.cy).toBe(40); // 20 + 40/2
  });

  it('positions bottom port at (x+w/2, y+h)', () => {
    const tree = renderInner({
      nodeId: 'n1',
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      color: '#000',
      sides: ['bottom'],
    });
    const c = findCircles(tree)[0].props as { cx: number; cy: number };
    expect(c.cx).toBe(50);
    expect(c.cy).toBe(60);
  });

  it('positions left port at (x, y+h/2)', () => {
    const tree = renderInner({
      nodeId: 'n1',
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      color: '#000',
      sides: ['left'],
    });
    const c = findCircles(tree)[0].props as { cx: number; cy: number };
    expect(c.cx).toBe(10);
    expect(c.cy).toBe(40);
  });

  it('forwards nodeId on every circle as data-node-id', () => {
    const tree = renderInner({
      nodeId: 'block-42',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      color: '#000',
    });
    const circles = findCircles(tree);
    for (const c of circles) {
      expect((c.props as { 'data-node-id': string })['data-node-id']).toBe('block-42');
    }
  });

  it('exposes a stable displayName', () => {
    expect((ConnectionPorts as unknown as { displayName: string }).displayName).toBe('ConnectionPorts');
  });
});

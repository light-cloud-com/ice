/**
 * Tests for `DragOverGlow` — a dashed cyan rect drawn around a node when
 * something is being dragged over it (containment intent indicator).
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { DragOverGlow } from '../drag-over-glow';

const renderInner = (props: React.ComponentProps<typeof DragOverGlow>): React.ReactElement => {
  const Inner = (DragOverGlow as unknown as {
    type: (p: React.ComponentProps<typeof DragOverGlow>) => React.ReactElement;
  }).type;
  return Inner(props);
};

describe('DragOverGlow', () => {
  it('expands the bounding rect by 3 on every side', () => {
    const tree = renderInner({ x: 10, y: 20, width: 100, height: 50 });
    const props = tree.props as { x: number; y: number; width: number; height: number };
    expect(props.x).toBe(7);
    expect(props.y).toBe(17);
    expect(props.width).toBe(106);
    expect(props.height).toBe(56);
  });

  it('uses the default cyan stroke and 6 3 dash pattern', () => {
    const tree = renderInner({ x: 0, y: 0, width: 1, height: 1 });
    const props = tree.props as { stroke: string; strokeDasharray: string; opacity: number };
    expect(props.stroke).toBe('#22d3ee');
    expect(props.strokeDasharray).toBe('6 3');
    expect(props.opacity).toBe(0.8);
  });

  it('honors caller-supplied stroke/dasharray/opacity', () => {
    const tree = renderInner({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      stroke: '#ff0000',
      strokeDasharray: '4 4',
      opacity: 0.5,
    });
    const props = tree.props as { stroke: string; strokeDasharray: string; opacity: number };
    expect(props.stroke).toBe('#ff0000');
    expect(props.strokeDasharray).toBe('4 4');
    expect(props.opacity).toBe(0.5);
  });

  it('rx = CORNER_RADIUS+3', () => {
    const tree = renderInner({ x: 0, y: 0, width: 1, height: 1 });
    expect((tree.props as { rx: number }).rx).toBe(11);
  });

  it('exposes a stable displayName', () => {
    expect((DragOverGlow as unknown as { displayName: string }).displayName).toBe('DragOverGlow');
  });
});

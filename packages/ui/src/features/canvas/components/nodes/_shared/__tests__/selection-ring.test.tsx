/**
 * Tests for `SelectionRing` — a rounded SVG rectangle drawn around a
 * selected node. Defaults: padding=3, opacity=0.6, no dashes.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { SelectionRing } from '../selection-ring';

const renderInner = (props: React.ComponentProps<typeof SelectionRing>): React.ReactElement => {
  const Inner = (SelectionRing as unknown as {
    type: (p: React.ComponentProps<typeof SelectionRing>) => React.ReactElement;
  }).type;
  return Inner(props);
};

describe('SelectionRing', () => {
  it('expands the bounding rect by the default padding of 3', () => {
    const tree = renderInner({ x: 10, y: 20, width: 100, height: 50 });
    const props = tree.props as { x: number; y: number; width: number; height: number };
    expect(props.x).toBe(7);
    expect(props.y).toBe(17);
    expect(props.width).toBe(106);
    expect(props.height).toBe(56);
  });

  it('honors a custom padding value', () => {
    const tree = renderInner({ x: 0, y: 0, width: 10, height: 10, padding: 5 });
    const props = tree.props as { x: number; y: number; width: number; height: number };
    expect(props.x).toBe(-5);
    expect(props.y).toBe(-5);
    expect(props.width).toBe(20);
    expect(props.height).toBe(20);
  });

  it('uses default secondary stroke + 2px width + opacity 0.6 when no overrides', () => {
    const tree = renderInner({ x: 0, y: 0, width: 1, height: 1 });
    const props = tree.props as {
      stroke: string;
      strokeWidth: number;
      opacity: number;
      strokeDasharray?: string;
    };
    expect(props.stroke).toBe('var(--ice-text-secondary)');
    expect(props.strokeWidth).toBe(2);
    expect(props.opacity).toBe(0.6);
    expect(props.strokeDasharray).toBeUndefined();
  });

  it('passes through custom stroke / strokeWidth / opacity / strokeDasharray', () => {
    const tree = renderInner({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      stroke: '#ff00ff',
      strokeWidth: 4,
      opacity: 0.3,
      strokeDasharray: '4 2',
    });
    const props = tree.props as {
      stroke: string;
      strokeWidth: number;
      opacity: number;
      strokeDasharray: string;
    };
    expect(props.stroke).toBe('#ff00ff');
    expect(props.strokeWidth).toBe(4);
    expect(props.opacity).toBe(0.3);
    expect(props.strokeDasharray).toBe('4 2');
  });

  it('rounds the corners with CORNER_RADIUS+padding', () => {
    const tree = renderInner({ x: 0, y: 0, width: 1, height: 1, padding: 3 });
    const props = tree.props as { rx: number };
    // CORNER_RADIUS in canvas-constants is 8, padding 3 → 11.
    expect(props.rx).toBe(11);
  });

  it('exposes a stable displayName', () => {
    expect((SelectionRing as unknown as { displayName: string }).displayName).toBe('SelectionRing');
  });
});

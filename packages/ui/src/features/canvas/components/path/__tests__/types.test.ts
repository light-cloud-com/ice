/**
 * rf-conpath-1 — pin the leaf path-geometry types so any rename / reshape
 * surfaces here. The asserts are structural: assigning fixtures to the
 * exported types is what proves they exist with the expected shape (TS
 * compile-time check) and the runtime `expect`s document the example
 * values we expect each shape to admit.
 */

import { describe, it, expect } from 'vitest';
import type { Bounds, PathResult, Point, Side } from '../types';

describe('rf-conpath-1: path/types.ts', () => {
  it('Side admits the four cardinal directions', () => {
    const sides: Side[] = ['left', 'right', 'top', 'bottom'];
    expect(sides).toHaveLength(4);
  });

  it('Point is a flat { x, y } record', () => {
    const p: Point = { x: 10, y: 20 };
    expect(p.x).toBe(10);
    expect(p.y).toBe(20);
  });

  it('Bounds is { x, y, width, height }', () => {
    const b: Bounds = { x: 0, y: 0, width: 100, height: 50 };
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(b.width).toBe(100);
    expect(b.height).toBe(50);
  });

  it('PathResult is { pathD, midX, midY }', () => {
    const r: PathResult = { pathD: 'M 0 0 L 1 1', midX: 0.5, midY: 0.5 };
    expect(r.pathD).toBe('M 0 0 L 1 1');
    expect(r.midX).toBe(0.5);
    expect(r.midY).toBe(0.5);
  });
});

/**
 * rf-conpath-2 — exhaustive fixture tests for the three pure geometry
 * helpers extracted from `svg-connection-path.tsx`.
 *
 * The helpers are pure functions of plain `{ x, y, width, height }` /
 * `{ x, y }` records, so a small fixture matrix hits 100% of branches
 * without any React/DOM scaffolding:
 *
 *   - `getEffectiveBounds`: 1 case (pass-through; `_lod`/`_zoom`
 *     intentionally unused — pin both values to ensure they don't
 *     escape into the return).
 *   - `chooseSides`: 4 cases for the four quadrants + 1 case for the
 *     `|dx| === |dy|` tie-break (cite the strict-`>` divergence note in
 *     the source — connection-preview's `>=` is NOT mirrored here).
 *   - `getEdgePoint`: 4 cases for the four sides at the default
 *     midpoint, 1 case for non-default port slots.
 */

import { describe, it, expect } from 'vitest';
import { getEffectiveBounds, chooseSides, getEdgePoint } from '../bounds-and-sides';
import type { Bounds } from '../types';
import type { CanvasNode } from '../../svg-canvas';

const nodeFixture = (over: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'n',
  type: 'block',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  label: 'l',
  data: {},
  ...over,
});

const bounds = (x: number, y: number, w: number, h: number): Bounds => ({ x, y, width: w, height: h });

describe('rf-conpath-2: getEffectiveBounds', () => {
  it('returns the node bounds verbatim and ignores _lod/_zoom', () => {
    const n = nodeFixture({ x: 1, y: 2, width: 3, height: 4 });
    expect(getEffectiveBounds(n, 1, 0.5)).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(getEffectiveBounds(n, 3, 2)).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});

describe('rf-conpath-2: chooseSides', () => {
  it('to-right (dx > 0, |dx| > |dy|): exit right, enter left', () => {
    const from = bounds(0, 0, 10, 10);
    const to = bounds(100, 5, 10, 10);
    expect(chooseSides(from, to)).toEqual({ exitSide: 'right', entrySide: 'left' });
  });

  it('to-left (dx < 0, |dx| > |dy|): exit left, enter right', () => {
    const from = bounds(100, 0, 10, 10);
    const to = bounds(0, 5, 10, 10);
    expect(chooseSides(from, to)).toEqual({ exitSide: 'left', entrySide: 'right' });
  });

  it('to-bottom (dy > 0, |dy| >= |dx|): exit bottom, enter top', () => {
    const from = bounds(0, 0, 10, 10);
    const to = bounds(5, 100, 10, 10);
    expect(chooseSides(from, to)).toEqual({ exitSide: 'bottom', entrySide: 'top' });
  });

  it('to-top (dy < 0, |dy| >= |dx|): exit top, enter bottom', () => {
    const from = bounds(0, 100, 10, 10);
    const to = bounds(5, 0, 10, 10);
    expect(chooseSides(from, to)).toEqual({ exitSide: 'top', entrySide: 'bottom' });
  });

  it('|dx| === |dy| tie resolves vertical (strict-> branch falls through)', () => {
    // Centers: from=(50,50), to=(150,150) → dx=100, dy=100 → tie.
    // Strict `Math.abs(dx) > Math.abs(dy)` is false, so the bezier
    // fallthrough branch picks bottom/top. NOTE: connection-preview.ts
    // uses `>=` and would resolve to right/left — this divergence is
    // load-bearing per the dominant-axis-tie-breaks learning.
    const from = bounds(0, 0, 100, 100);
    const to = bounds(100, 100, 100, 100);
    expect(chooseSides(from, to)).toEqual({ exitSide: 'bottom', entrySide: 'top' });
  });
});

describe('rf-conpath-2: getEdgePoint', () => {
  const b = bounds(10, 20, 100, 40);

  it('left side at default midpoint', () => {
    expect(getEdgePoint(b, 'left')).toEqual({ x: 10, y: 40 });
  });

  it('right side at default midpoint', () => {
    expect(getEdgePoint(b, 'right')).toEqual({ x: 110, y: 40 });
  });

  it('top side at default midpoint', () => {
    expect(getEdgePoint(b, 'top')).toEqual({ x: 60, y: 20 });
  });

  it('bottom side at default midpoint', () => {
    expect(getEdgePoint(b, 'bottom')).toEqual({ x: 60, y: 60 });
  });

  it('non-default port slot distributes proportionally on the side', () => {
    // portIndex=1, portCount=3 → r = (1+1)/(3+1) = 0.5 (mid).
    expect(getEdgePoint(b, 'right', 1, 3)).toEqual({ x: 110, y: 40 });
    // portIndex=0, portCount=3 → r = 1/4 = 0.25 → y = 20 + 40*0.25 = 30.
    expect(getEdgePoint(b, 'right', 0, 3)).toEqual({ x: 110, y: 30 });
    // portIndex=2, portCount=3 → r = 3/4 = 0.75 → y = 20 + 40*0.75 = 50.
    expect(getEdgePoint(b, 'right', 2, 3)).toEqual({ x: 110, y: 50 });
  });
});

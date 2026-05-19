/**
 * Tests for `useCanvasUtils` — pure useCallback bundle.
 *
 * Probe pattern: render a tiny component that calls the hook and
 * captures its return value into a ref. `useCallback` is mocked to
 * pass-through (no need to invoke the callback factory) so we can call
 * the returned functions directly.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { useCanvasUtils } from '../use-canvas-utils';
import type { ViewState } from '../../components/svg-canvas';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const makeSvgRef = (rect?: Partial<DOMRect>): React.RefObject<SVGSVGElement> => {
  const stub = {
    getBoundingClientRect: () => ({
      left: rect?.left ?? 0,
      top: rect?.top ?? 0,
      right: 0,
      bottom: 0,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as unknown as SVGSVGElement;
  return { current: stub };
};

const makeViewState = (overrides: Partial<ViewState> = {}): ViewState => ({
  panX: 0,
  panY: 0,
  scale: 1,
  ...overrides,
});

interface Captured {
  screenToCanvas: (x: number, y: number) => { x: number; y: number };
  canvasToScreen: (x: number, y: number) => { x: number; y: number };
  isPointInElement: (
    p: { x: number; y: number },
    e: { x: number; y: number; width: number; height: number },
  ) => boolean;
  distance: (p1: { x: number; y: number }, p2: { x: number; y: number }) => number;
}

const renderHook = (svgRef: React.RefObject<SVGSVGElement>, viewState: ViewState): Captured => {
  const captured: { current?: Captured } = {};
  const Probe: React.FC = () => {
    captured.current = useCanvasUtils(svgRef, viewState);
    return null;
  };
  renderToString(React.createElement(Probe));
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasUtils — screenToCanvas', () => {
  it('returns identity coords when svgRef.current is null', () => {
    const utils = renderHook({ current: null }, makeViewState());
    expect(utils.screenToCanvas(100, 200)).toEqual({ x: 100, y: 200 });
  });

  it('subtracts rect offset and pan, then divides by scale', () => {
    const svgRef = makeSvgRef({ left: 50, top: 30 });
    const utils = renderHook(svgRef, makeViewState({ panX: 10, panY: 5, scale: 2 }));
    // (200 - 50 - 10) / 2 = 70; (300 - 30 - 5) / 2 = 132.5
    expect(utils.screenToCanvas(200, 300)).toEqual({ x: 70, y: 132.5 });
  });

  it('handles zero-pan, scale=1 case (identity after rect subtraction)', () => {
    const svgRef = makeSvgRef({ left: 100, top: 200 });
    const utils = renderHook(svgRef, makeViewState());
    expect(utils.screenToCanvas(100, 200)).toEqual({ x: 0, y: 0 });
  });
});

describe('useCanvasUtils — canvasToScreen', () => {
  it('returns identity coords when svgRef.current is null', () => {
    const utils = renderHook({ current: null }, makeViewState());
    expect(utils.canvasToScreen(50, 60)).toEqual({ x: 50, y: 60 });
  });

  it('multiplies by scale, adds pan and rect offset', () => {
    const svgRef = makeSvgRef({ left: 50, top: 30 });
    const utils = renderHook(svgRef, makeViewState({ panX: 10, panY: 5, scale: 2 }));
    // 70 * 2 + 10 + 50 = 200; 132.5 * 2 + 5 + 30 = 300
    expect(utils.canvasToScreen(70, 132.5)).toEqual({ x: 200, y: 300 });
  });

  it('is the inverse of screenToCanvas (round-trip)', () => {
    const svgRef = makeSvgRef({ left: 33, top: 17 });
    const utils = renderHook(svgRef, makeViewState({ panX: 50, panY: 20, scale: 1.5 }));
    const start = { x: 250, y: 180 };
    const inCanvas = utils.screenToCanvas(start.x, start.y);
    const back = utils.canvasToScreen(inCanvas.x, inCanvas.y);
    expect(back.x).toBeCloseTo(start.x);
    expect(back.y).toBeCloseTo(start.y);
  });
});

describe('useCanvasUtils — isPointInElement', () => {
  const utils = renderHook({ current: null }, makeViewState());

  it('returns true for a point at the top-left corner (inclusive)', () => {
    expect(utils.isPointInElement({ x: 10, y: 20 }, { x: 10, y: 20, width: 50, height: 30 })).toBe(true);
  });

  it('returns true for a point at the bottom-right corner (inclusive)', () => {
    expect(utils.isPointInElement({ x: 60, y: 50 }, { x: 10, y: 20, width: 50, height: 30 })).toBe(true);
  });

  it('returns true for a point inside the rect', () => {
    expect(utils.isPointInElement({ x: 30, y: 35 }, { x: 10, y: 20, width: 50, height: 30 })).toBe(true);
  });

  it('returns false for a point left of the rect', () => {
    expect(utils.isPointInElement({ x: 5, y: 30 }, { x: 10, y: 20, width: 50, height: 30 })).toBe(false);
  });

  it('returns false for a point right of the rect', () => {
    expect(utils.isPointInElement({ x: 100, y: 30 }, { x: 10, y: 20, width: 50, height: 30 })).toBe(false);
  });

  it('returns false for a point above the rect', () => {
    expect(utils.isPointInElement({ x: 30, y: 0 }, { x: 10, y: 20, width: 50, height: 30 })).toBe(false);
  });

  it('returns false for a point below the rect', () => {
    expect(utils.isPointInElement({ x: 30, y: 100 }, { x: 10, y: 20, width: 50, height: 30 })).toBe(false);
  });
});

describe('useCanvasUtils — distance', () => {
  const utils = renderHook({ current: null }, makeViewState());

  it('returns 0 for two identical points', () => {
    expect(utils.distance({ x: 5, y: 7 }, { x: 5, y: 7 })).toBe(0);
  });

  it('computes Euclidean distance for axis-aligned points', () => {
    expect(utils.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('is symmetric: d(p1,p2) === d(p2,p1)', () => {
    const d1 = utils.distance({ x: 1, y: 2 }, { x: 4, y: 6 });
    const d2 = utils.distance({ x: 4, y: 6 }, { x: 1, y: 2 });
    expect(d1).toBe(d2);
  });

  it('handles negative deltas (squared)', () => {
    expect(utils.distance({ x: 10, y: 10 }, { x: 7, y: 6 })).toBe(5);
  });
});

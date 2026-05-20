/**
 * rf-canvint-5 — orchestrator smoke + wire-up tests for `useCanvasInteractions`.
 *
 * The sub-hooks (mouse, keyboard) are unit-tested in their own files;
 * this file pins the ORCHESTRATOR contract — the public return shape,
 * the cursor mapping driven by stateRef.mode, the screenToCanvas
 * forwarding, and the bindCanvas surface. Built with the rf-pdpl-21
 * Probe + renderToString pattern; window listeners stubbed so the
 * keyboard sub-hook's effect doesn't blow up.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCanvasInteractions } from '../use-canvas-interactions';
import type { CanvasItem, CanvasViewport, UseCanvasInteractionsResult } from '../use-canvas-interactions';

// ─── Test harness ───────────────────────────────────────────────────────────

const captured: { current?: UseCanvasInteractionsResult } = {};

const renderHook = (
  opts: {
    viewport?: CanvasViewport;
    items?: CanvasItem[];
    selectedIds?: string[];
    locked?: boolean;
    onViewportChange?: (vp: CanvasViewport) => void;
  } = {},
) => {
  const Probe: React.FC = () => {
    const svgRef = React.useRef<SVGSVGElement | null>(null);
    captured.current = useCanvasInteractions({
      svgRef,
      viewport: opts.viewport ?? { x: 0, y: 0, zoom: 1 },
      items: opts.items ?? [],
      selectedIds: opts.selectedIds ?? [],
      locked: opts.locked ?? false,
      onViewportChange: opts.onViewportChange ?? (() => {}),
    });
    return React.createElement('div', null, 'probe');
  };
  renderToString(React.createElement(Probe));
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

beforeEach(() => {
  // Stub window so the keyboard sub-hook's `useEffect` doesn't reach
  // for a non-existent global.
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('HTMLInputElement', class {});
  vi.stubGlobal('HTMLTextAreaElement', class {});
  vi.stubGlobal('HTMLSelectElement', class {});
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Public return shape ────────────────────────────────────────────────────

describe('rf-canvint-5 — useCanvasInteractions return shape', () => {
  it('returns a bindCanvas object with all 7 mouse handlers', () => {
    const r = renderHook();
    expect(typeof r.bindCanvas.onMouseDown).toBe('function');
    expect(typeof r.bindCanvas.onMouseMove).toBe('function');
    expect(typeof r.bindCanvas.onMouseUp).toBe('function');
    expect(typeof r.bindCanvas.onMouseLeave).toBe('function');
    expect(typeof r.bindCanvas.onWheel).toBe('function');
    expect(typeof r.bindCanvas.onAuxClick).toBe('function');
    expect(typeof r.bindCanvas.onContextMenu).toBe('function');
  });

  it('aliases onMouseLeave to handleMouseUp (single shared handler)', () => {
    const r = renderHook();
    expect(r.bindCanvas.onMouseLeave).toBe(r.bindCanvas.onMouseUp);
  });

  it('returns screenToCanvas as a callable', () => {
    const r = renderHook();
    expect(typeof r.screenToCanvas).toBe('function');
  });

  it('returns "default" cursor at rest (mode === "none")', () => {
    const r = renderHook();
    expect(r.cursor).toBe('default');
  });

  it('returns isInteracting=false at rest', () => {
    const r = renderHook();
    expect(r.isInteracting).toBe(false);
  });

  it('returns mode="none" at rest', () => {
    const r = renderHook();
    expect(r.mode).toBe('none');
  });
});

// ─── screenToCanvas with no SVG element ─────────────────────────────────────

describe('rf-canvint-5 — screenToCanvas without an SVG element', () => {
  it('returns { x: 0, y: 0 } when svgRef.current is null', () => {
    const r = renderHook();
    expect(r.screenToCanvas(100, 200)).toEqual({ x: 0, y: 0 });
  });
});

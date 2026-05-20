/**
 * rf-canv-18 — useCanvasDimensions hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Probe pattern from
 * rf-props-7/8 — render once with React.createElement, capture the hook's
 * return value into a ref, then assert.
 *
 * `useEffect` is mocked to fire synchronously on render (per the rf-props-19
 * `queued-ref-dispatch` learning) so the ResizeObserver gets installed inside
 * the FC body rather than waiting on a renderer commit phase that never runs
 * here. The cleanup function returned by `useEffect` is stashed so we can
 * invoke it manually to test the disconnect-on-unmount branch.
 *
 * `useState` is mocked with a mutable ref + setter spy so:
 *   1. The hook's first call returns the captured ref's current value.
 *   2. Observer-fired setDimensions calls are observable via the spy.
 *
 * `ResizeObserver` is stubbed via `vi.stubGlobal` with a class that captures
 * the callback in a module-level array so tests can drive it directly.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  // Captured ResizeObserver callbacks — one per `new ResizeObserver(cb)`.
  observerCallbacks: [] as ResizeObserverCallback[],
  observeSpy: vi.fn(),
  unobserveSpy: vi.fn(),
  disconnectSpy: vi.fn(),
  // Mutable ref behind useState — tests update this to simulate post-setter
  // re-renders, but the primary assertion target is the setter spy.
  dimensionsRef: { current: { width: 800, height: 600 } as { width: number; height: number } },
  setDimensionsSpy: vi.fn<(next: { width: number; height: number }) => void>(),
  // Effect cleanup capture — useEffect's return value goes here so tests can
  // simulate unmount.
  effectCleanups: [] as Array<() => void>,
}));

// Mock React's useState/useEffect so the FC body runs synchronously without
// a renderer context.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(initial: T | (() => T)) => {
      // Honor the initializer the FIRST time only — subsequent renders return
      // whatever the test left in dimensionsRef.current. The hook only has one
      // useState slot so a queued dispatch isn't needed.
      void initial; // silence unused-arg lint; the initializer is captured at module load
      return [mocks.dimensionsRef.current as unknown as T, mocks.setDimensionsSpy as unknown];
    }),
    useEffect: vi.fn((cb: () => void | (() => void), _deps?: unknown[]) => {
      // Run the effect synchronously and stash any cleanup function.
      const cleanup = cb();
      if (typeof cleanup === 'function') {
        mocks.effectCleanups.push(cleanup);
      }
    }),
  };
});

// Stub ResizeObserver globally — vitest's node env doesn't ship one, and we
// need to capture the callback to drive it manually.
class MockResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    mocks.observerCallbacks.push(cb);
  }
  observe = mocks.observeSpy;
  unobserve = mocks.unobserveSpy;
  disconnect = mocks.disconnectSpy;
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

// Import AFTER the react mock is registered so the hook closes over the mocked
// useState/useEffect.
import { useCanvasDimensions } from '../use-canvas-resize';

// ─── Probe / harness ────────────────────────────────────────────────────────

interface Captured {
  dimensions: { width: number; height: number };
}

const renderHook = (containerRef: React.RefObject<HTMLDivElement | null>): Captured => {
  const captured: { current?: Captured } = {};
  const Probe: React.FC = () => {
    const dimensions = useCanvasDimensions(containerRef);
    captured.current = { dimensions };
    return React.createElement('div', null, `${dimensions.width}x${dimensions.height}`);
  };
  renderToString(React.createElement(Probe));
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

// Build a fake contentRect entry; only `width` and `height` are read by the hook.
const makeEntry = (width: number, height: number): ResizeObserverEntry => ({
  contentRect: {
    width,
    height,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    toJSON: () => ({}),
  } as DOMRectReadOnly,
  borderBoxSize: [],
  contentBoxSize: [],
  devicePixelContentBoxSize: [],
  target: {} as Element,
});

beforeEach(() => {
  mocks.observerCallbacks.length = 0;
  mocks.observeSpy.mockClear();
  mocks.unobserveSpy.mockClear();
  mocks.disconnectSpy.mockClear();
  mocks.setDimensionsSpy.mockReset();
  mocks.dimensionsRef.current = { width: 800, height: 600 };
  mocks.effectCleanups.length = 0;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasDimensions', () => {
  it('returns the default 800x600 on initial render', () => {
    const ref = { current: {} as HTMLDivElement };
    const { dimensions } = renderHook(ref as React.RefObject<HTMLDivElement | null>);
    expect(dimensions).toEqual({ width: 800, height: 600 });
  });

  it('observes the containerRef.current element exactly once', () => {
    const el = {} as HTMLDivElement;
    const ref = { current: el };
    renderHook(ref as React.RefObject<HTMLDivElement | null>);
    expect(mocks.observeSpy).toHaveBeenCalledTimes(1);
    expect(mocks.observeSpy).toHaveBeenCalledWith(el);
  });

  it('does NOT install an observer when containerRef.current is null on mount', () => {
    const ref = { current: null };
    renderHook(ref);
    expect(mocks.observerCallbacks).toHaveLength(0);
    expect(mocks.observeSpy).not.toHaveBeenCalled();
  });

  it('calls setDimensions with the new size when the observer fires with valid dimensions', () => {
    const ref = { current: {} as HTMLDivElement };
    renderHook(ref as React.RefObject<HTMLDivElement | null>);

    expect(mocks.observerCallbacks).toHaveLength(1);
    const cb = mocks.observerCallbacks[0];
    cb([makeEntry(1024, 768)], {} as ResizeObserver);

    expect(mocks.setDimensionsSpy).toHaveBeenCalledTimes(1);
    expect(mocks.setDimensionsSpy).toHaveBeenCalledWith({ width: 1024, height: 768 });
  });

  it('returns the new dimensions on the next render after a valid observer firing', () => {
    const ref = { current: {} as HTMLDivElement };
    renderHook(ref as React.RefObject<HTMLDivElement | null>);

    const cb = mocks.observerCallbacks[0];
    cb([makeEntry(1280, 960)], {} as ResizeObserver);

    // Simulate React's post-setState re-render by writing the setter's argument
    // back into the mutable ref the useState mock reads from.
    mocks.dimensionsRef.current = mocks.setDimensionsSpy.mock.calls[0][0];

    const { dimensions } = renderHook(ref as React.RefObject<HTMLDivElement | null>);
    expect(dimensions).toEqual({ width: 1280, height: 960 });
  });

  it('skips the setter when the observer fires with width=0', () => {
    const ref = { current: {} as HTMLDivElement };
    renderHook(ref as React.RefObject<HTMLDivElement | null>);

    const cb = mocks.observerCallbacks[0];
    cb([makeEntry(0, 600)], {} as ResizeObserver);

    expect(mocks.setDimensionsSpy).not.toHaveBeenCalled();
  });

  it('skips the setter when the observer fires with height=0', () => {
    const ref = { current: {} as HTMLDivElement };
    renderHook(ref as React.RefObject<HTMLDivElement | null>);

    const cb = mocks.observerCallbacks[0];
    cb([makeEntry(800, 0)], {} as ResizeObserver);

    expect(mocks.setDimensionsSpy).not.toHaveBeenCalled();
  });

  it('skips the setter when both width and height are 0', () => {
    const ref = { current: {} as HTMLDivElement };
    renderHook(ref as React.RefObject<HTMLDivElement | null>);

    const cb = mocks.observerCallbacks[0];
    cb([makeEntry(0, 0)], {} as ResizeObserver);

    expect(mocks.setDimensionsSpy).not.toHaveBeenCalled();
  });

  it('processes every entry in a multi-entry callback (last valid one wins)', () => {
    const ref = { current: {} as HTMLDivElement };
    renderHook(ref as React.RefObject<HTMLDivElement | null>);

    const cb = mocks.observerCallbacks[0];
    cb([makeEntry(100, 100), makeEntry(200, 200), makeEntry(300, 300)], {} as ResizeObserver);

    // The hook iterates `for (const entry of entries) { ... setDimensions(...) }`
    // so each valid entry triggers a setter call and the LAST one is the
    // value the next render observes.
    expect(mocks.setDimensionsSpy).toHaveBeenCalledTimes(3);
    expect(mocks.setDimensionsSpy.mock.calls[0][0]).toEqual({ width: 100, height: 100 });
    expect(mocks.setDimensionsSpy.mock.calls[1][0]).toEqual({ width: 200, height: 200 });
    expect(mocks.setDimensionsSpy.mock.calls[2][0]).toEqual({ width: 300, height: 300 });
  });

  it('skips invalid entries while still applying valid ones in the same callback', () => {
    const ref = { current: {} as HTMLDivElement };
    renderHook(ref as React.RefObject<HTMLDivElement | null>);

    const cb = mocks.observerCallbacks[0];
    cb([makeEntry(0, 0), makeEntry(640, 480), makeEntry(0, 100), makeEntry(800, 0)], {} as ResizeObserver);

    expect(mocks.setDimensionsSpy).toHaveBeenCalledTimes(1);
    expect(mocks.setDimensionsSpy).toHaveBeenCalledWith({ width: 640, height: 480 });
  });

  it('disconnects the observer when the effect cleanup is invoked', () => {
    const ref = { current: {} as HTMLDivElement };
    renderHook(ref as React.RefObject<HTMLDivElement | null>);

    expect(mocks.effectCleanups).toHaveLength(1);
    expect(mocks.disconnectSpy).not.toHaveBeenCalled();

    mocks.effectCleanups[0]();

    expect(mocks.disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('does not register a cleanup when containerRef.current is null', () => {
    const ref = { current: null };
    renderHook(ref);

    // The early `if (!containerRef.current) return;` short-circuits before any
    // cleanup is built — useEffect's cb returned undefined.
    expect(mocks.effectCleanups).toHaveLength(0);
  });
});

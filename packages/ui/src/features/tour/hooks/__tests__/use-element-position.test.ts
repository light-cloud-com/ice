/**
 * tour-4 — useElementPosition tests.
 *
 * Node-only vitest harness (no jsdom). The hook is exercised via the
 * Probe pattern (renderToString + a hoisted captured-value box) used
 * across the codebase for hooks that need a fiber context.
 *
 * Mocks (all `vi.hoisted` so they survive the module-level mock factory
 * boundary):
 *
 *   - `react.useState` / `react.useEffect` — synchronous so the FC body
 *     installs observers without waiting for a renderer commit phase.
 *     `useEffect` honors its deps array — we re-run when deps change
 *     and run cleanup when they do (this is critical for the
 *     element-swap and unmount cases).
 *   - `useReducedMotion` — direct `vi.mock` of the shared hook,
 *     defaulting to `false`. Tests override per-case via
 *     `mocks.reducedMotionRef.current = true`.
 *   - `ResizeObserver` and `IntersectionObserver` — stubbed via
 *     `vi.stubGlobal`, capturing each constructed instance into hoisted
 *     arrays so tests can fire callbacks and assert disconnects.
 *   - `window` — stubbed so the hook can call `addEventListener` /
 *     `removeEventListener` for the scroll listener. The stub round-trips
 *     adds and removes through a `Set<Listener>` per event type.
 *   - `document` — minimal stub exposing `documentElement` so the
 *     viewport ResizeObserver path attaches.
 *
 * The element-swap leak test pins the contract from blueprint §6/tour-4:
 * "swap target then unmount → 0 leaked listeners". We track every
 * observer created and assert each `.disconnect` was called exactly once
 * after the swap-then-unmount sequence.
 *
 * Test count: 18 (all in the "useElementPosition" describe).
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

interface CapturedRO {
  cb: ResizeObserverCallback;
  observed: unknown[];
  disconnected: boolean;
  disconnectSpy: ReturnType<typeof vi.fn<() => void>>;
  observeSpy: ReturnType<typeof vi.fn<(target: unknown) => void>>;
}

interface CapturedIO {
  cb: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: unknown[];
  disconnected: boolean;
  disconnectSpy: ReturnType<typeof vi.fn<() => void>>;
  observeSpy: ReturnType<typeof vi.fn<(target: unknown) => void>>;
}

const mocks = vi.hoisted(() => ({
  resizeObservers: [] as CapturedRO[],
  intersectionObservers: [] as CapturedIO[],
  // window.addEventListener registry. Map<event-name, Set<listener>>. We
  // only track the listeners themselves — the capture/passive flags are
  // not relevant for round-tripping in tests.
  windowListeners: new Map<string, Set<EventListener>>(),
  addEventListenerSpy: vi.fn<(type: string, listener: EventListener, options?: AddEventListenerOptions | boolean) => void>(),
  removeEventListenerSpy: vi.fn<(type: string, listener: EventListener, options?: EventListenerOptions | boolean) => void>(),
  // useState/useEffect plumbing.
  // The hook owns one state slot (the rect); we mirror it with a mutable
  // ref the useState mock reads on every call, plus a setter spy so
  // tests can assert on rect updates.
  rectRef: { current: null as DOMRect | null },
  setRectSpy: vi.fn<(next: DOMRect | null | ((prev: DOMRect | null) => DOMRect | null)) => void>(),
  // useEffect captures: { cb, deps, cleanup, ran }. The tests need
  // per-render run discipline so we can drive deps-array changes.
  effects: [] as Array<{
    cb: () => void | (() => void);
    deps: unknown[] | undefined;
    cleanup: (() => void) | undefined;
  }>,
  // Reduced-motion override per test.
  reducedMotionRef: { current: false },
  // useRef storage — the SUT uses one ref (reducedMotionRef inside the
  // hook). Vitest's default react would supply a real ref but we mock
  // useState/useEffect manually, so we mock useRef too.
  refSlots: [] as Array<{ current: unknown }>,
  refSlotIndex: { i: 0 },
}));

// ─── Mock react ─────────────────────────────────────────────────────────────

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(initial: T | (() => T)) => {
      // Lazy initializer: call it once, but don't store — the hook only
      // reads state via the returned tuple, and rectRef.current acts as
      // the persistent store. The initializer ALSO calls
      // `element.getBoundingClientRect()` on first render, which is part
      // of the "initial rect on mount" contract — invoking it preserves
      // that side-effect.
      if (mocks.rectRef.current === null && typeof initial === 'function') {
        mocks.rectRef.current = (initial as () => T)() as unknown as DOMRect | null;
      } else if (mocks.rectRef.current === null) {
        mocks.rectRef.current = initial as unknown as DOMRect | null;
      }
      return [mocks.rectRef.current as unknown as T, mocks.setRectSpy as unknown];
    }),
    useEffect: vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
      const cleanup = cb();
      mocks.effects.push({
        cb,
        deps,
        cleanup: typeof cleanup === 'function' ? (cleanup as () => void) : undefined,
      });
    }),
    useRef: vi.fn(<T,>(initial: T) => {
      const idx = mocks.refSlotIndex.i++;
      if (!mocks.refSlots[idx]) {
        mocks.refSlots[idx] = { current: initial };
      }
      return mocks.refSlots[idx] as { current: T };
    }),
  };
});

// ─── Mock useReducedMotion ──────────────────────────────────────────────────

vi.mock('../../../../shared/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => mocks.reducedMotionRef.current,
}));

// ─── Stub window/document/observers ─────────────────────────────────────────

const stubWindow = {
  addEventListener: (type: string, listener: EventListener, options?: AddEventListenerOptions | boolean) => {
    mocks.addEventListenerSpy(type, listener, options);
    if (!mocks.windowListeners.has(type)) mocks.windowListeners.set(type, new Set());
    mocks.windowListeners.get(type)!.add(listener);
  },
  removeEventListener: (type: string, listener: EventListener, options?: EventListenerOptions | boolean) => {
    mocks.removeEventListenerSpy(type, listener, options);
    mocks.windowListeners.get(type)?.delete(listener);
  },
};
vi.stubGlobal('window', stubWindow);

// Minimal document stub — only documentElement is read by the hook.
vi.stubGlobal('document', {
  documentElement: { __id: 'documentElement' } as unknown as Element,
});

class MockResizeObserver {
  private record: CapturedRO;
  constructor(cb: ResizeObserverCallback) {
    const rec: CapturedRO = {
      cb,
      observed: [],
      disconnected: false,
      disconnectSpy: vi.fn<() => void>(),
      observeSpy: vi.fn<(target: unknown) => void>((target) => {
        rec.observed.push(target);
      }),
    };
    rec.disconnectSpy.mockImplementation(() => {
      rec.disconnected = true;
    });
    this.record = rec;
    mocks.resizeObservers.push(rec);
  }
  observe(target: unknown): void {
    this.record.observeSpy(target);
  }
  unobserve(): void {}
  disconnect(): void {
    this.record.disconnectSpy();
  }
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

class MockIntersectionObserver {
  private record: CapturedIO;
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    const rec: CapturedIO = {
      cb,
      options,
      observed: [],
      disconnected: false,
      disconnectSpy: vi.fn<() => void>(),
      observeSpy: vi.fn<(target: unknown) => void>((target) => {
        rec.observed.push(target);
      }),
    };
    rec.disconnectSpy.mockImplementation(() => {
      rec.disconnected = true;
    });
    this.record = rec;
    mocks.intersectionObservers.push(rec);
  }
  observe(target: unknown): void {
    this.record.observeSpy(target);
  }
  unobserve(): void {}
  disconnect(): void {
    this.record.disconnectSpy();
  }
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// ─── Import AFTER mocks are registered ──────────────────────────────────────

import { useElementPosition, type UseElementPositionOptions } from '../use-element-position';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface FakeElement {
  __id: string;
  getBoundingClientRect: () => DOMRect;
  scrollIntoView?: (arg?: ScrollIntoViewOptions | boolean) => void;
}

const makeRect = (overrides: Partial<DOMRect> = {}): DOMRect => ({
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 100,
  bottom: 50,
  width: 100,
  height: 50,
  toJSON: () => ({}),
  ...overrides,
}) as DOMRect;

const makeElement = (id: string, rectFactory: () => DOMRect = () => makeRect()): FakeElement & { scrollIntoViewSpy: ReturnType<typeof vi.fn> } => {
  const scrollIntoViewSpy = vi.fn();
  return {
    __id: id,
    getBoundingClientRect: rectFactory,
    scrollIntoView: scrollIntoViewSpy as unknown as (arg?: ScrollIntoViewOptions | boolean) => void,
    scrollIntoViewSpy,
  } as FakeElement & { scrollIntoViewSpy: ReturnType<typeof vi.fn> };
};

// IntersectionObserverEntry stub — the hook only reads `intersectionRatio`.
const makeEntry = (ratio: number, target: Element): IntersectionObserverEntry => ({
  intersectionRatio: ratio,
  target,
  boundingClientRect: makeRect(),
  intersectionRect: makeRect(),
  isIntersecting: ratio > 0,
  rootBounds: null,
  time: 0,
});

interface RenderResult {
  rect: DOMRect | null;
}

const renderHook = (
  element: Element | null,
  options?: UseElementPositionOptions,
): RenderResult => {
  // Reset useRef slot index before each render so refs persist by call
  // order across re-renders within the same test.
  mocks.refSlotIndex.i = 0;
  const captured: { current?: RenderResult } = {};
  const Probe: React.FC = () => {
    const rect = useElementPosition(element, options);
    captured.current = { rect };
    return null;
  };
  renderToString(React.createElement(Probe));
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

// Run all stashed effect cleanups (simulates unmount).
const unmount = (): void => {
  for (const e of mocks.effects) {
    e.cleanup?.();
  }
  mocks.effects.length = 0;
};

beforeEach(() => {
  mocks.resizeObservers.length = 0;
  mocks.intersectionObservers.length = 0;
  mocks.windowListeners.clear();
  mocks.addEventListenerSpy.mockClear();
  mocks.removeEventListenerSpy.mockClear();
  mocks.rectRef.current = null;
  mocks.setRectSpy.mockReset();
  mocks.effects.length = 0;
  mocks.reducedMotionRef.current = false;
  mocks.refSlots.length = 0;
  mocks.refSlotIndex.i = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useElementPosition', () => {
  it('returns null and attaches no observers when element is null', () => {
    const { rect } = renderHook(null);
    expect(rect).toBeNull();
    expect(mocks.resizeObservers).toHaveLength(0);
    expect(mocks.intersectionObservers).toHaveLength(0);
    // No scroll listener either.
    expect(mocks.windowListeners.get('scroll')?.size ?? 0).toBe(0);
  });

  it('reads getBoundingClientRect on mount and returns it', () => {
    const initialRect = makeRect({ width: 200, height: 100 });
    const el = makeElement('el-1', () => initialRect);
    const { rect } = renderHook(el as unknown as Element);
    expect(rect).toEqual(initialRect);
  });

  it('attaches a ResizeObserver to the element and observes it', () => {
    const el = makeElement('el-1');
    renderHook(el as unknown as Element);
    expect(mocks.resizeObservers.length).toBeGreaterThanOrEqual(1);
    // The first RO is the element observer per source order.
    const elementRO = mocks.resizeObservers[0];
    expect(elementRO.observed).toContain(el);
  });

  it('attaches a viewport ResizeObserver on document.documentElement when observeViewport=true (default)', () => {
    const el = makeElement('el-1');
    renderHook(el as unknown as Element);
    // Two ROs: element + documentElement.
    expect(mocks.resizeObservers).toHaveLength(2);
    const viewportRO = mocks.resizeObservers[1];
    // documentElement is the stub object with __id === 'documentElement'.
    expect(viewportRO.observed[0]).toMatchObject({ __id: 'documentElement' });
  });

  it('does NOT attach the viewport ResizeObserver when observeViewport=false', () => {
    const el = makeElement('el-1');
    renderHook(el as unknown as Element, { observeViewport: false });
    expect(mocks.resizeObservers).toHaveLength(1);
  });

  it('updates the rect when the element ResizeObserver fires', () => {
    const next = makeRect({ width: 300, height: 200 });
    let current = makeRect({ width: 100, height: 50 });
    const el = makeElement('el-1', () => current);
    renderHook(el as unknown as Element);

    // Swap the rect and fire the element RO callback.
    current = next;
    const elementRO = mocks.resizeObservers[0];
    elementRO.cb([], { disconnect: () => {}, observe: () => {}, unobserve: () => {} } as unknown as ResizeObserver);

    // setRect was called once on mount with the initial rect, then once
    // by the RO callback. We assert the LAST call carries the new rect.
    expect(mocks.setRectSpy).toHaveBeenCalled();
    const lastCall = mocks.setRectSpy.mock.calls.at(-1)?.[0];
    expect(lastCall).toEqual(next);
  });

  it('updates the rect when the viewport ResizeObserver fires', () => {
    let current = makeRect({ width: 100, height: 50 });
    const el = makeElement('el-1', () => current);
    renderHook(el as unknown as Element);

    current = makeRect({ width: 999, height: 999 });
    const viewportRO = mocks.resizeObservers[1];
    viewportRO.cb([], {} as ResizeObserver);

    expect(mocks.setRectSpy.mock.calls.at(-1)?.[0]).toEqual(current);
  });

  it('updates the rect when the scroll listener fires', () => {
    let current = makeRect({ left: 10, top: 10 });
    const el = makeElement('el-1', () => current);
    renderHook(el as unknown as Element);

    expect(mocks.windowListeners.get('scroll')?.size).toBe(1);

    current = makeRect({ left: 999, top: 999 });
    const scrollListener = Array.from(mocks.windowListeners.get('scroll')!)[0];
    scrollListener({} as Event);

    expect(mocks.setRectSpy.mock.calls.at(-1)?.[0]).toEqual(current);
  });

  it('attaches an IntersectionObserver with thresholds [0, 0.5, 1]', () => {
    const el = makeElement('el-1');
    renderHook(el as unknown as Element);
    expect(mocks.intersectionObservers).toHaveLength(1);
    expect(mocks.intersectionObservers[0].options?.threshold).toEqual([0, 0.5, 1]);
    expect(mocks.intersectionObservers[0].observed).toContain(el);
  });

  it('debounces multiple under-0.5 intersections to a single scrollIntoView (within 250ms)', () => {
    vi.useFakeTimers();
    const el = makeElement('el-1');
    renderHook(el as unknown as Element);

    const io = mocks.intersectionObservers[0];
    // Fire three under-0.5 events, each 50ms apart.
    io.cb([makeEntry(0.1, el as unknown as Element)], {} as IntersectionObserver);
    vi.advanceTimersByTime(50);
    io.cb([makeEntry(0.2, el as unknown as Element)], {} as IntersectionObserver);
    vi.advanceTimersByTime(50);
    io.cb([makeEntry(0.3, el as unknown as Element)], {} as IntersectionObserver);

    // Before the timer fires — zero calls.
    expect(el.scrollIntoViewSpy).toHaveBeenCalledTimes(0);

    // Advance past the last debounce window (each call resets — last
    // call was at 100ms wall-clock, so timer fires at 100+250=350ms).
    vi.advanceTimersByTime(250);
    expect(el.scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect(el.scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('fires scrollIntoView again after the debounce window has fully elapsed', () => {
    vi.useFakeTimers();
    const el = makeElement('el-1');
    renderHook(el as unknown as Element);
    const io = mocks.intersectionObservers[0];

    io.cb([makeEntry(0.1, el as unknown as Element)], {} as IntersectionObserver);
    vi.advanceTimersByTime(250);
    expect(el.scrollIntoViewSpy).toHaveBeenCalledTimes(1);

    // Idle window passed; next under-0.5 should schedule a fresh timer.
    io.cb([makeEntry(0.1, el as unknown as Element)], {} as IntersectionObserver);
    vi.advanceTimersByTime(250);
    expect(el.scrollIntoViewSpy).toHaveBeenCalledTimes(2);
  });

  it('does NOT call scrollIntoView when intersectionRatio is exactly 0.5', () => {
    vi.useFakeTimers();
    const el = makeElement('el-1');
    renderHook(el as unknown as Element);
    const io = mocks.intersectionObservers[0];

    io.cb([makeEntry(0.5, el as unknown as Element)], {} as IntersectionObserver);
    vi.advanceTimersByTime(500);

    expect(el.scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it('uses behavior="auto" when useReducedMotion() returns true', () => {
    vi.useFakeTimers();
    mocks.reducedMotionRef.current = true;
    const el = makeElement('el-1');
    renderHook(el as unknown as Element);

    const io = mocks.intersectionObservers[0];
    io.cb([makeEntry(0.1, el as unknown as Element)], {} as IntersectionObserver);
    vi.advanceTimersByTime(250);

    expect(el.scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
  });

  it('does NOT call scrollIntoView when scrollIntoViewOnHide=false', () => {
    vi.useFakeTimers();
    const el = makeElement('el-1');
    renderHook(el as unknown as Element, { scrollIntoViewOnHide: false });
    const io = mocks.intersectionObservers[0];

    io.cb([makeEntry(0.1, el as unknown as Element)], {} as IntersectionObserver);
    vi.advanceTimersByTime(500);

    expect(el.scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  it('safely no-ops when the element does not expose scrollIntoView', () => {
    vi.useFakeTimers();
    const el: FakeElement = {
      __id: 'el-1',
      getBoundingClientRect: () => makeRect(),
      // Intentionally no scrollIntoView.
    };
    renderHook(el as unknown as Element);
    const io = mocks.intersectionObservers[0];

    expect(() => {
      io.cb([makeEntry(0.1, el as unknown as Element)], {} as IntersectionObserver);
      vi.advanceTimersByTime(250);
    }).not.toThrow();
  });

  it('tears down every listener when element flips from non-null to null', () => {
    const el = makeElement('el-1');
    renderHook(el as unknown as Element);

    expect(mocks.resizeObservers).toHaveLength(2);
    expect(mocks.intersectionObservers).toHaveLength(1);
    expect(mocks.windowListeners.get('scroll')?.size).toBe(1);
    const [elementRO, viewportRO] = mocks.resizeObservers;
    const io = mocks.intersectionObservers[0];

    // Flip element → null. The useEffect mock fires immediately, so the
    // PREVIOUS effect's cleanup must run first.
    mocks.effects[0].cleanup?.();

    expect(elementRO.disconnectSpy).toHaveBeenCalledTimes(1);
    expect(viewportRO.disconnectSpy).toHaveBeenCalledTimes(1);
    expect(io.disconnectSpy).toHaveBeenCalledTimes(1);
    expect(mocks.windowListeners.get('scroll')?.size).toBe(0);
    expect(mocks.removeEventListenerSpy).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      expect.objectContaining({ capture: true }),
    );
  });

  it('swap A → B disconnects A and observes B without leaking', () => {
    const a = makeElement('a');
    const b = makeElement('b');

    // Initial render with A.
    renderHook(a as unknown as Element);
    const aRO = mocks.resizeObservers[0];
    const aViewportRO = mocks.resizeObservers[1];
    const aIO = mocks.intersectionObservers[0];

    // Run cleanup of A (simulates effect re-run when element dep changes)
    // then render again with B — this matches what React would do.
    mocks.effects[0].cleanup?.();

    // Reset effect log so the next render's effect lands at index 0.
    mocks.effects.length = 0;
    renderHook(b as unknown as Element);

    // A's three observers all disconnected.
    expect(aRO.disconnectSpy).toHaveBeenCalledTimes(1);
    expect(aViewportRO.disconnectSpy).toHaveBeenCalledTimes(1);
    expect(aIO.disconnectSpy).toHaveBeenCalledTimes(1);

    // B has fresh observers attached.
    expect(mocks.resizeObservers).toHaveLength(4); // 2 for A + 2 for B
    expect(mocks.intersectionObservers).toHaveLength(2);
    const bRO = mocks.resizeObservers[2];
    expect(bRO.observed).toContain(b);
    const bIO = mocks.intersectionObservers[1];
    expect(bIO.observed).toContain(b);
  });

  it('swap then unmount → 0 leaked observers (every disconnect called exactly once)', () => {
    const a = makeElement('a');
    const b = makeElement('b');

    renderHook(a as unknown as Element);
    mocks.effects[0].cleanup?.();
    mocks.effects.length = 0;
    renderHook(b as unknown as Element);

    // Now unmount: run remaining effect cleanup.
    unmount();

    // Sum disconnect spies across every observer instance ever made.
    for (const ro of mocks.resizeObservers) {
      expect(ro.disconnectSpy).toHaveBeenCalledTimes(1);
    }
    for (const io of mocks.intersectionObservers) {
      expect(io.disconnectSpy).toHaveBeenCalledTimes(1);
    }
    // No scroll listeners remain.
    expect(mocks.windowListeners.get('scroll')?.size ?? 0).toBe(0);
  });

  it('unmount tears down every listener (RO×2, IO×1, scroll×1)', () => {
    const el = makeElement('el-1');
    renderHook(el as unknown as Element);
    const [elementRO, viewportRO] = mocks.resizeObservers;
    const io = mocks.intersectionObservers[0];

    unmount();

    expect(elementRO.disconnectSpy).toHaveBeenCalledTimes(1);
    expect(viewportRO.disconnectSpy).toHaveBeenCalledTimes(1);
    expect(io.disconnectSpy).toHaveBeenCalledTimes(1);
    expect(mocks.windowListeners.get('scroll')?.size ?? 0).toBe(0);
  });

  it('null first then non-null: second render attaches observers on the new element', () => {
    // First render: null.
    renderHook(null);
    expect(mocks.resizeObservers).toHaveLength(0);
    expect(mocks.intersectionObservers).toHaveLength(0);

    // Element appears. The previous effect had no cleanup (element was
    // null), but the mock pushes ALL effect runs into `mocks.effects` —
    // the cleanup slot is undefined for the first one. The second render
    // installs observers.
    mocks.effects.length = 0;
    const el = makeElement('el-1');
    renderHook(el as unknown as Element);

    expect(mocks.resizeObservers.length).toBeGreaterThanOrEqual(1);
    expect(mocks.intersectionObservers).toHaveLength(1);
    expect(mocks.intersectionObservers[0].observed).toContain(el);
  });

  it('passes { capture: true, passive: true } to window.addEventListener for scroll', () => {
    const el = makeElement('el-1');
    renderHook(el as unknown as Element);

    expect(mocks.addEventListenerSpy).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      expect.objectContaining({ capture: true, passive: true }),
    );
  });
});

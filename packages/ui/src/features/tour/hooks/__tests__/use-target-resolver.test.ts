/**
 * tour-3 — `useTargetResolver` hook tests.
 *
 * Vitest default env is node, so window/document/MutationObserver are
 * stubbed. Two ergonomic pieces in this harness:
 *   1. Synchronous-`useEffect` mock (pattern from rf-pdpl-21,
 *      rf-canv-22) — captures `(cb, deps, cleanup)` so unmount tests
 *      can drive cleanup manually.
 *   2. Manual rAF clock — every `requestAnimationFrame` push appends to
 *      `mocks.rafQueue`; `clock.tick(n)` flushes the next `n`. Mirrors
 *      the spec language ("rAF loop tries up to N frames").
 *
 * The hook produces a fresh `result` from `useState`. To observe state
 * changes after the effect runs we use the rf-canv-19 mutable-slot
 * `useState` mock — the slot is read by `useTargetResolver` on each
 * render and written by every setResult; tests inspect the slot
 * directly and trigger re-renders by pushing test cases into the rAF
 * queue then ticking the clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

interface CapturedEffect {
  cb: () => void | (() => void);
  deps: unknown[] | undefined;
  cleanup: void | (() => void);
}

interface MockObserverInstance {
  callback: MutationCallback;
  observed: Array<{ target: Node; init: MutationObserverInit | undefined }>;
  disconnectCalls: number;
  takeRecordsCalls: number;
}

const mocks = vi.hoisted(() => ({
  // useState slot — read on every call, written by `setResult`. The
  // resolver only ever has ONE useState slot, so a single ref is enough.
  resultSlot: {
    current: { status: 'idle', element: null, rect: null } as {
      status: string;
      element: Element | null;
      rect: unknown;
    },
  },
  // useRef slot for the resolver handles — must round-trip across renders.
  refSlot: { current: null as unknown },
  // Captured effects, queued cleanup fns, and the test toggle.
  effects: [] as CapturedEffect[],
  // rAF queue: each push is `{ id, cb }`, ticked in order.
  rafQueue: [] as Array<{ id: number; cb: FrameRequestCallback }>,
  rafIdCounter: { current: 0 },
  cancelledIds: new Set<number>(),
  // MutationObserver instance tracking.
  observers: [] as MockObserverInstance[],
  // Mock document.body so `MutationObserver.observe(document.body, ...)` lands.
  bodyNode: { nodeName: 'BODY' } as unknown as Element,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // Mutable-slot `useState` — runs the initial-state factory once
    // per fresh render to seed the slot, then returns the live slot
    // value on every subsequent call.
    useState: vi.fn((initial: unknown) => {
      // Seed only when the slot is in its sentinel-idle state AND the
      // factory says otherwise. Each `renderHook` calls
      // `mocks.resultSlot.current = { status: 'idle', ... }` first.
      const init = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      // First-time seed: when the slot still matches the post-clear
      // sentinel, write the initial value through. Subsequent calls
      // just read what's there.
      if (mocks.resultSlot.current.status === '__SEED__') {
        mocks.resultSlot.current = init as typeof mocks.resultSlot.current;
      }
      return [
        mocks.resultSlot.current,
        (next: unknown) => {
          const value = typeof next === 'function' ? (next as (p: unknown) => unknown)(mocks.resultSlot.current) : next;
          mocks.resultSlot.current = value as typeof mocks.resultSlot.current;
        },
      ];
    }),
    useRef: vi.fn((initial: unknown) => {
      // Single ref slot — the resolver only uses one (`handlesRef`).
      // First call seeds; later calls return the same wrapper.
      if (mocks.refSlot.current === null) {
        mocks.refSlot.current = { current: initial };
      }
      return mocks.refSlot.current;
    }),
    // Synchronous `useEffect` — runs the cb and stashes any cleanup so
    // we can drive unmount manually.
    useEffect: vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
      const cleanup = cb();
      mocks.effects.push({ cb, deps, cleanup });
    }),
  };
});

// ─── DOM globals ────────────────────────────────────────────────────────────

class MockMutationObserver {
  callback: MutationCallback;
  observed: MockObserverInstance['observed'] = [];
  disconnectCalls = 0;
  takeRecordsCalls = 0;
  constructor(callback: MutationCallback) {
    this.callback = callback;
    const tracked: MockObserverInstance = {
      callback,
      observed: this.observed,
      disconnectCalls: 0,
      takeRecordsCalls: 0,
    };
    mocks.observers.push(tracked);
    // Self-mutation so observed/disconnectCalls reflect this instance's writes.
    Object.defineProperty(this, '__tracked', { value: tracked });
  }
  observe(target: Node, init?: MutationObserverInit): void {
    this.observed.push({ target, init });
    (this as unknown as { __tracked: MockObserverInstance }).__tracked.observed = this.observed;
  }
  disconnect(): void {
    this.disconnectCalls += 1;
    (this as unknown as { __tracked: MockObserverInstance }).__tracked.disconnectCalls = this.disconnectCalls;
  }
  takeRecords(): MutationRecord[] {
    this.takeRecordsCalls += 1;
    (this as unknown as { __tracked: MockObserverInstance }).__tracked.takeRecordsCalls = this.takeRecordsCalls;
    return [];
  }
}

beforeEach(() => {
  // Reset mock state before each render. The slot starts at a sentinel
  // string the `useState` mock recognises, so the first call to
  // `useState(initial)` writes the resolver's seed value through.
  mocks.resultSlot.current = { status: '__SEED__', element: null, rect: null };
  mocks.refSlot.current = null;
  mocks.effects = [];
  mocks.rafQueue = [];
  mocks.rafIdCounter.current = 0;
  mocks.cancelledIds = new Set();
  mocks.observers = [];

  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      mocks.rafIdCounter.current += 1;
      const id = mocks.rafIdCounter.current;
      mocks.rafQueue.push({ id, cb });
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      mocks.cancelledIds.add(id);
      // Drop pending entries with this id — matches real browsers.
      mocks.rafQueue = mocks.rafQueue.filter((entry) => entry.id !== id);
    }),
  );
  vi.stubGlobal('MutationObserver', MockMutationObserver);
  vi.stubGlobal('document', {
    body: mocks.bodyNode,
    querySelector: vi.fn(() => null),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Imports after mocks ────────────────────────────────────────────────────

import { useTargetResolver, type ResolverResult } from '../use-target-resolver';

// ─── Harness ────────────────────────────────────────────────────────────────

function renderHook(
  target: string | (() => Element | null) | null,
  options?: { budget?: number; enabled?: boolean },
): ResolverResult {
  // ESLint can't tell that this is a test harness for a hook — the
  // function name doesn't start with `use` because it's the conventional
  // "renderHook" pattern from @testing-library, not a hook itself.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useTargetResolver(target, options);
}

/** Drain `n` frames from the rAF queue. Each tick re-runs the latest captured effect. */
function tick(n = 1): void {
  for (let i = 0; i < n; i += 1) {
    const next = mocks.rafQueue.shift();
    if (!next) return;
    next.cb(performance.now());
  }
}

/**
 * Simulate React firing the previous effect's cleanup (because deps
 * changed) then re-rendering with a new target. Mirrors React's behavior
 * on dep-array change: cleanup-then-rerun-cb. Used by the
 * "target-prop-change" test below.
 */
function simulatePropChange(newTarget: string | (() => Element | null) | null): void {
  // Fire previous cleanup (React's "commit phase: run last effect's cleanup").
  const last = mocks.effects[mocks.effects.length - 1];
  if (last && typeof last.cleanup === 'function') {
    last.cleanup();
  }
  // Re-render with the new target. The synchronous `useEffect` mock
  // fires the new cb immediately and stashes it.
  renderHook(newTarget);
}

/** Latest committed result (slot is the source of truth). */
function readResult(): typeof mocks.resultSlot.current {
  return mocks.resultSlot.current;
}

/** Simulate React unmounting the hook by firing the latest effect's cleanup. */
function unmount(): void {
  const last = mocks.effects[mocks.effects.length - 1];
  if (last && typeof last.cleanup === 'function') {
    last.cleanup();
  }
}

/** Make a stub Element with a stable getBoundingClientRect spy. */
function makeElement(rect: Partial<DOMRect> = {}): { el: Element; gbcrSpy: ReturnType<typeof vi.fn> } {
  const fullRect = {
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    top: 20,
    right: 110,
    bottom: 70,
    left: 10,
    toJSON: () => ({}),
    ...rect,
  };
  const gbcrSpy = vi.fn(() => fullRect as DOMRect);
  const el = { getBoundingClientRect: gbcrSpy } as unknown as Element;
  return { el, gbcrSpy };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useTargetResolver — disabled / null-target paths', () => {
  it('returns idle when target is null (no rAF, no observer)', () => {
    renderHook(null);
    const r = readResult();
    expect(r.status).toBe('idle');
    expect(r.element).toBeNull();
    expect(r.rect).toBeNull();
    expect(mocks.rafQueue).toHaveLength(0);
    expect(mocks.observers).toHaveLength(0);
  });

  it('returns idle when enabled=false (no rAF, no observer)', () => {
    renderHook('#anywhere', { enabled: false });
    const r = readResult();
    expect(r.status).toBe('idle');
    expect(mocks.rafQueue).toHaveLength(0);
    expect(mocks.observers).toHaveLength(0);
  });
});

describe('useTargetResolver — frame-0 resolution', () => {
  it('resolves a CSS selector on the first frame → status placed with rect', () => {
    const { el, gbcrSpy } = makeElement({ x: 100, y: 200, width: 50, height: 40 });
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => el);

    renderHook('#ice-canvas-svg');
    tick();

    const r = readResult();
    expect(r.status).toBe('placed');
    expect(r.element).toBe(el);
    expect(r.rect).toMatchObject({ x: 100, y: 200, width: 50, height: 40 });
    expect(gbcrSpy).toHaveBeenCalledTimes(1);
    // No observer needed when frame 0 hits.
    expect(mocks.observers).toHaveLength(0);
  });

  it('resolves a thunk on the first frame', () => {
    const { el, gbcrSpy } = makeElement();
    const thunk = vi.fn(() => el);

    renderHook(thunk);
    tick();

    const r = readResult();
    expect(r.status).toBe('placed');
    expect(r.element).toBe(el);
    expect(thunk).toHaveBeenCalledTimes(1);
    expect(gbcrSpy).toHaveBeenCalledTimes(1);
  });

  it('initial render before tick → status resolving (rAF pending)', () => {
    renderHook('#anywhere');
    expect(readResult().status).toBe('resolving');
    expect(mocks.rafQueue).toHaveLength(1);
  });
});

describe('useTargetResolver — budget exhaustion', () => {
  it('marks missing after the configured budget without a hit', () => {
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => null);

    renderHook('#never-there', { budget: 30 });
    // Drain all 30 frames — every tick schedules one more rAF except
    // the final one which transitions to missing.
    for (let i = 0; i < 30; i += 1) tick();

    const r = readResult();
    expect(r.status).toBe('missing');
    expect(r.element).toBeNull();
    expect(r.rect).toBeNull();
    // After missing, no further rAFs queued.
    expect(mocks.rafQueue).toHaveLength(0);
  });

  it('honours a custom small budget', () => {
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => null);

    renderHook('#nope', { budget: 3 });
    tick(3);

    expect(readResult().status).toBe('missing');
  });

  it('does NOT call getBoundingClientRect on the missing path', () => {
    const querySpy = document.querySelector as ReturnType<typeof vi.fn>;
    querySpy.mockImplementation(() => null);

    renderHook('#nope', { budget: 5 });
    tick(5);

    // querySelector was hit each frame, but no element ever had its
    // rect read.
    expect(querySpy).toHaveBeenCalledTimes(5);
    expect(readResult().rect).toBeNull();
  });
});

describe('useTargetResolver — MutationObserver fallback', () => {
  it('does NOT attach the observer before frame 6', () => {
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => null);

    renderHook('#delayed');
    // 5 ticks burns frames 1..5 and queues frame 6.
    tick(5);

    expect(mocks.observers).toHaveLength(0);
  });

  it('attaches the observer once frame 6 has fired without a hit', () => {
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => null);

    renderHook('#delayed');
    tick(6);

    expect(mocks.observers).toHaveLength(1);
    const ob = mocks.observers[0]!;
    expect(ob.observed).toHaveLength(1);
    expect(ob.observed[0]!.target).toBe(mocks.bodyNode);
    expect(ob.observed[0]!.init).toEqual({ childList: true, subtree: true });
  });

  it('resolves via the observer when target appears mid-budget', () => {
    let appeared = false;
    const { el } = makeElement();
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => (appeared ? el : null));

    renderHook('#late-bloomer');
    // Frames 1..6 — observer attaches at frame 6.
    tick(6);
    expect(mocks.observers).toHaveLength(1);
    expect(readResult().status).toBe('resolving');

    // Element now shows up; fire the observer callback to nudge the rAF.
    appeared = true;
    const observer = mocks.observers[0]!;
    observer.callback([] as unknown as MutationRecord[], {} as MutationObserver);

    // The observer schedules one rAF (debounced) — drain it.
    tick();
    expect(readResult().status).toBe('placed');
    expect(readResult().element).toBe(el);
  });

  it('debounces multiple observer batches into a single rAF', () => {
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => null);

    renderHook('#ditto');
    tick(6);
    const observer = mocks.observers[0]!;

    // Pre-condition: after frame 6 the resolver scheduled the next rAF.
    const queueLenAfterFrame6 = mocks.rafQueue.length;
    expect(queueLenAfterFrame6).toBe(1);

    // Multiple batches in quick succession should NOT pile up rAFs —
    // the resolver already has one pending and the dedup guards short-circuit.
    observer.callback([] as unknown as MutationRecord[], {} as MutationObserver);
    observer.callback([] as unknown as MutationRecord[], {} as MutationObserver);
    observer.callback([] as unknown as MutationRecord[], {} as MutationObserver);

    expect(mocks.rafQueue.length).toBe(queueLenAfterFrame6);
  });

  it('disconnects the observer on placed', () => {
    let appeared = false;
    const { el } = makeElement();
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => (appeared ? el : null));

    renderHook('#x');
    tick(6);
    appeared = true;
    const observer = mocks.observers[0]!;
    observer.callback([] as unknown as MutationRecord[], {} as MutationObserver);
    tick();

    expect(observer.disconnectCalls).toBeGreaterThanOrEqual(1);
  });

  it('disconnects the observer on missing', () => {
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => null);

    renderHook('#nope', { budget: 30 });
    for (let i = 0; i < 30; i += 1) tick();

    // Observer attached at frame 6, then disconnected when budget exhausts.
    expect(mocks.observers).toHaveLength(1);
    expect(mocks.observers[0]!.disconnectCalls).toBeGreaterThanOrEqual(1);
  });
});

describe('useTargetResolver — getBoundingClientRect read frequency', () => {
  it('reads getBoundingClientRect exactly once per resolution', () => {
    const { el, gbcrSpy } = makeElement();
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => el);

    renderHook('#x');
    tick();

    expect(gbcrSpy).toHaveBeenCalledTimes(1);

    // Subsequent ticks should NOT re-read — placed is a terminal state.
    tick();
    tick();
    expect(gbcrSpy).toHaveBeenCalledTimes(1);
  });

  it('re-reads getBoundingClientRect when resolution lands at frame 3 (not frame 0)', () => {
    let appeared = false;
    const { el, gbcrSpy } = makeElement();
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => (appeared ? el : null));

    renderHook('#x');
    tick(); // frame 1, miss
    tick(); // frame 2, miss
    appeared = true;
    tick(); // frame 3, hit

    expect(readResult().status).toBe('placed');
    expect(gbcrSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useTargetResolver — tear-down', () => {
  it('cancels the rAF and disconnects the observer on unmount', () => {
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => null);

    renderHook('#x');
    tick(6); // attach observer

    expect(mocks.observers).toHaveLength(1);
    const observer = mocks.observers[0]!;
    expect(observer.disconnectCalls).toBe(0);

    // After frame 6 the resolver scheduled the next rAF — capture its id.
    const pendingRaf = mocks.rafQueue[mocks.rafQueue.length - 1];
    expect(pendingRaf).toBeDefined();

    unmount();

    expect(observer.disconnectCalls).toBe(1);
    expect(mocks.cancelledIds.has(pendingRaf!.id)).toBe(true);
  });

  it('unmount before any frame fires still cancels the pending rAF', () => {
    renderHook('#x');
    expect(mocks.rafQueue).toHaveLength(1);
    const id = mocks.rafQueue[0]!.id;

    unmount();

    expect(mocks.cancelledIds.has(id)).toBe(true);
    // No observer was ever attached (we never reached frame 6).
    expect(mocks.observers).toHaveLength(0);
  });

  it('further rAF ticks after unmount do not flip the public state', () => {
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => null);

    renderHook('#x');
    tick(2);
    unmount();

    // Snapshot result, then drain any leftover queue (cancelAnimationFrame
    // already drained pending entries, so this is a no-op in practice).
    const before = { ...readResult() };
    tick(10);
    expect(readResult()).toEqual(before);
  });
});

describe('useTargetResolver — observer-attaches-only-after-frame-6 invariant', () => {
  it('frame 5: no observer; frame 6: observer attached', () => {
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => null);

    renderHook('#delayed');
    tick(5);
    expect(mocks.observers).toHaveLength(0);
    tick(); // frame 6
    expect(mocks.observers).toHaveLength(1);
  });
});

describe('useTargetResolver — CSS-selector forwarding', () => {
  it('hands the selector verbatim to document.querySelector', () => {
    const querySpy = document.querySelector as ReturnType<typeof vi.fn>;
    querySpy.mockImplementation(() => null);

    renderHook('[data-tour-id="palette-search"]');
    tick();
    expect(querySpy).toHaveBeenCalledWith('[data-tour-id="palette-search"]');
  });
});

describe('useTargetResolver — observer never attaches after a hit at frame 0', () => {
  it('frame-0 hit short-circuits the entire fallback path', () => {
    const { el } = makeElement();
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => el);

    renderHook('#x');
    tick(); // resolves on frame 1
    tick(10);
    expect(mocks.observers).toHaveLength(0);
  });
});

describe('useTargetResolver — explicit budget=1 edge case', () => {
  it('budget=1 with no hit transitions to missing on the first frame', () => {
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => null);

    renderHook('#x', { budget: 1 });
    tick();

    expect(readResult().status).toBe('missing');
  });
});

describe('useTargetResolver — target prop change', () => {
  it('tears down the old observer and restarts the resolver with a fresh budget', () => {
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => null);

    renderHook('#first');
    tick(6); // observer attaches
    expect(mocks.observers).toHaveLength(1);
    const firstObserver = mocks.observers[0]!;
    expect(firstObserver.disconnectCalls).toBe(0);

    // Switch targets — the previous effect's cleanup tears the
    // observer down, the new effect re-arms a fresh resolver.
    simulatePropChange('#second');

    expect(firstObserver.disconnectCalls).toBe(1);
    // New rAF was scheduled by the fresh effect.
    expect(mocks.rafQueue.length).toBeGreaterThan(0);
    // No new observer until 6 frames pass.
    expect(mocks.observers).toHaveLength(1);
  });

  it('switching from a never-resolving selector to one that resolves on frame 0 lands placed', () => {
    const { el } = makeElement();
    let phase: 'first' | 'second' = 'first';
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation((sel: string) => {
      if (phase === 'second' && sel === '#second') return el;
      return null;
    });

    renderHook('#first');
    tick(3);
    expect(readResult().status).toBe('resolving');

    phase = 'second';
    simulatePropChange('#second');
    tick();

    expect(readResult().status).toBe('placed');
    expect(readResult().element).toBe(el);
  });
});

describe('useTargetResolver — element non-null but rect zero', () => {
  it('returns a placed result with a zero-size rect', () => {
    const { el, gbcrSpy } = makeElement({ width: 0, height: 0, x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0 });
    (document.querySelector as ReturnType<typeof vi.fn>).mockImplementation(() => el);

    renderHook('#hidden');
    tick();

    const r = readResult();
    expect(r.status).toBe('placed');
    expect(r.element).toBe(el);
    expect(r.rect).toMatchObject({ width: 0, height: 0 });
    expect(gbcrSpy).toHaveBeenCalledTimes(1);
  });
});

/**
 * rf-canv-23 — useGhostMode hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Provider +
 * capture-ref harness from rf-canv-20/21/22 — render
 * `<Provider><Probe /></Provider>` with `renderToString`, capture the
 * hook's return value into a ref, then invoke the callbacks and assert
 * against `vi.spyOn(store, 'dispatch')`.
 *
 * Three pieces of harness machinery are wired together (see learning
 * `fake-timers-plus-sync-useeffect-mock-needs-pertest-toggle`):
 *
 *   1. **Synchronous-`useEffect` mock** (rf-canv-18 pattern) — so the
 *      auto-dismiss `useEffect` body runs inside `renderToString` and the
 *      `setTimeout` queues against the timer engine. The cleanup is
 *      stashed in `mocks.effectCleanups` so cleanup-branch tests can
 *      invoke it manually.
 *   2. **`vi.useFakeTimers()` in `beforeEach`** — so the queued
 *      `setTimeout` lands on the fake clock. Without this the test
 *      assertion runs before the real 10s timer fires (spurious pass)
 *      while the real timer keeps running into the next test (flake).
 *   3. **`vi.useRealTimers()` in `afterEach`** — so the next test isn't
 *      poisoned by leftover fake-clock state.
 *
 * The two pure-function dependencies (`getBlueprint`, `expandBlueprint`)
 * are mocked at module scope so the accept-callback's dispatch sequence
 * can be asserted independent of the real blueprint catalog.
 *
 * `Date.now()` is stubbed via `vi.setSystemTime` so the auto-dismiss
 * `Math.max(0, 10_000 - elapsed)` clamp is verifiable.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
// `effectCleanups` mirrors the rf-canv-18/22 pattern: every render appends,
// tests inspect the last to verify clearTimeout-on-unmount semantics for the
// auto-dismiss timer.
const mocks = vi.hoisted(() => ({
  effectCleanups: [] as Array<() => void>,
  // Toggle: when false, useEffect is the real impl (skips firing in
  // renderToString). When true, it fires synchronously per the rf-canv-22
  // sync-useeffect mock pattern. Per-test toggle so accept/dismiss tests
  // (which don't depend on the auto-dismiss effect) don't accidentally run
  // the timer-scheduling effect.
  syncUseEffect: { current: true as boolean },
}));

// Mock React's useEffect so the FC body schedules timers synchronously.
// `useState`, `useCallback`, `useMemo` are left untouched.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn((cb: () => void | (() => void), _deps?: unknown[]) => {
      if (!mocks.syncUseEffect.current) {
        // Defer to React's real useEffect — but in a renderToString render
        // there's no commit phase, so the effect simply doesn't fire.
        return;
      }
      const cleanup = cb();
      if (typeof cleanup === 'function') {
        mocks.effectCleanups.push(cleanup);
      }
    }),
  };
});

// Mock the blueprint helpers so accept-callback dispatches are deterministic.
vi.mock('../../../../config/blocks', () => ({
  getBlueprint: vi.fn(),
  expandBlueprint: vi.fn(),
}));

// Import AFTER the mocks are registered so the hook closes over them.
import { useGhostMode, type UseGhostModeResult } from '../use-ghost-mode';
import { getBlueprint, expandBlueprint } from '../../../../config/blocks';
import ghostReducer, {
  setGhosts,
  type GhostNode,
} from '../../../../store/slices/ghost-slice';

// ─── Store builder ──────────────────────────────────────────────────────────
// The hook reads `state.ghosts.ghosts` and dispatches into `cards-slice`
// (`expandBlueprintToCard`, `addEdgeToCard`) and `ghost-slice`
// (`dismissGhost`, `clearGhosts`).
//
// We mount the real `ghostReducer` so `setGhosts` populates the slot the
// hook's selector reads. For `cards-slice` we mount a minimal reducer
// stub — the hook only DISPATCHES into it; we never read state back. The
// test asserts on the dispatched action shape via `vi.spyOn(store, 'dispatch')`.

const cardsStubSlice = createSlice({
  name: 'cards',
  initialState: { activeCardId: null, cards: [] },
  reducers: {},
});

const makeStore = (preloadedGhosts: GhostNode[] = []) =>
  configureStore({
    reducer: { ghosts: ghostReducer, cards: cardsStubSlice.reducer },
    preloadedState: {
      ghosts: { ghosts: preloadedGhosts },
      cards: { activeCardId: null, cards: [] },
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

type TestStore = ReturnType<typeof makeStore>;

// ─── Probe ──────────────────────────────────────────────────────────────────

const captureHook = (store: TestStore): UseGhostModeResult => {
  const captured: { current?: UseGhostModeResult } = {};
  const Probe: React.FC = () => {
    captured.current = useGhostMode();
    return <div>probe</div>;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

// ─── Fixtures ───────────────────────────────────────────────────────────────

const makeGhost = (overrides: Partial<GhostNode> = {}): GhostNode => ({
  id: overrides.id ?? 'g1',
  iceType: overrides.iceType ?? 'Compute.Service',
  label: overrides.label ?? 'Suggested',
  position: overrides.position ?? { x: 100, y: 200 },
  sourceNodeId: overrides.sourceNodeId ?? 'node-source',
  edgeRelationship: overrides.edgeRelationship ?? 'connects_to',
  edgeDirection: overrides.edgeDirection ?? 'to',
  createdAt: overrides.createdAt ?? Date.now(),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Default: timers are advanced by tests; system time set deterministically.
  vi.setSystemTime(new Date('2026-04-29T12:00:00Z'));
  // Default: sync useEffect is enabled (auto-dismiss tests need it).
  mocks.syncUseEffect.current = true;
  mocks.effectCleanups.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useGhostMode — return shape', () => {
  it('exposes ghosts plus accept/dismiss callbacks', () => {
    // Disable the auto-dismiss effect for this lightweight shape check —
    // empty ghosts → effect short-circuits anyway, but explicit is better.
    mocks.syncUseEffect.current = false;
    const store = makeStore();
    const result = captureHook(store);

    expect(Array.isArray(result.ghosts)).toBe(true);
    expect(result.ghosts).toEqual([]);
    expect(typeof result.handleAcceptGhost).toBe('function');
    expect(typeof result.handleDismissGhost).toBe('function');
  });

  it('reflects ghosts populated in the store', () => {
    mocks.syncUseEffect.current = false;
    const ghost = makeGhost({ id: 'in-store' });
    const store = makeStore([ghost]);
    const result = captureHook(store);
    expect(result.ghosts).toHaveLength(1);
    expect(result.ghosts[0].id).toBe('in-store');
  });
});

describe('useGhostMode — handleAcceptGhost (blueprint resolves)', () => {
  it('dispatches expandBlueprintToCard, addEdgeToCard, dismissGhost in order', () => {
    // Mock blueprint resolution + expansion.
    const fakeBlueprint = { id: 'fake-bp' };
    const expanded = {
      node: { id: 'expanded-node-id', type: 'block', position: { x: 100, y: 200 } },
      children: [],
      edges: [],
    };
    vi.mocked(getBlueprint).mockReturnValue(
      fakeBlueprint as unknown as ReturnType<typeof getBlueprint>,
    );
    vi.mocked(expandBlueprint).mockReturnValue(
      expanded as unknown as ReturnType<typeof expandBlueprint>,
    );

    mocks.syncUseEffect.current = false; // empty ghosts → no timer regardless
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const ghost = makeGhost({
      id: 'ghost-1',
      iceType: 'Compute.Service',
      sourceNodeId: 'src-1',
      edgeDirection: 'to',
      edgeRelationship: 'connects_to',
      position: { x: 50, y: 60 },
    });
    result.handleAcceptGhost(ghost);

    expect(getBlueprint).toHaveBeenCalledWith('Compute.Service');
    expect(expandBlueprint).toHaveBeenCalledWith(fakeBlueprint, { position: { x: 50, y: 60 } });

    // Three dispatches: expandBlueprintToCard, addEdgeToCard, dismissGhost.
    expect(dispatchSpy).toHaveBeenCalledTimes(3);
    const a1 = dispatchSpy.mock.calls[0][0] as { type: string; payload: unknown };
    const a2 = dispatchSpy.mock.calls[1][0] as { type: string; payload: unknown };
    const a3 = dispatchSpy.mock.calls[2][0] as { type: string; payload: unknown };

    expect(a1.type).toBe('cards/expandBlueprintToCard');
    expect(a1.payload).toBe(expanded);
    expect(a2.type).toBe('cards/addEdgeToCard');
    expect(a3.type).toBe('ghosts/dismissGhost');
    expect(a3.payload).toBe('ghost-1');
  });
});

describe('useGhostMode — handleAcceptGhost (no blueprint)', () => {
  it('dispatches only dismissGhost when getBlueprint returns falsy', () => {
    vi.mocked(getBlueprint).mockReturnValue(
      undefined as unknown as ReturnType<typeof getBlueprint>,
    );

    mocks.syncUseEffect.current = false;
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const ghost = makeGhost({ id: 'no-bp', iceType: 'Unknown.Type' });
    result.handleAcceptGhost(ghost);

    expect(getBlueprint).toHaveBeenCalledWith('Unknown.Type');
    expect(expandBlueprint).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: unknown };
    expect(action.type).toBe('ghosts/dismissGhost');
    expect(action.payload).toBe('no-bp');
  });
});

describe('useGhostMode — handleAcceptGhost edge direction', () => {
  it("with edgeDirection='to' wires source=ghost.sourceNodeId, target=expanded.node.id", () => {
    vi.mocked(getBlueprint).mockReturnValue({} as unknown as ReturnType<typeof getBlueprint>);
    vi.mocked(expandBlueprint).mockReturnValue({
      node: { id: 'NEW' },
    } as unknown as ReturnType<typeof expandBlueprint>);

    mocks.syncUseEffect.current = false;
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const ghost = makeGhost({
      sourceNodeId: 'SRC',
      edgeDirection: 'to',
      edgeRelationship: 'connects_to',
    });
    result.handleAcceptGhost(ghost);

    // 2nd dispatch is addEdgeToCard.
    const edgeAction = dispatchSpy.mock.calls[1][0] as {
      type: string;
      payload: { source: string; target: string; data: { relationship: string } };
    };
    expect(edgeAction.type).toBe('cards/addEdgeToCard');
    expect(edgeAction.payload.source).toBe('SRC');
    expect(edgeAction.payload.target).toBe('NEW');
    expect(edgeAction.payload.data).toEqual({ relationship: 'connects_to' });
  });

  it("with edgeDirection='from' reverses source/target", () => {
    vi.mocked(getBlueprint).mockReturnValue({} as unknown as ReturnType<typeof getBlueprint>);
    vi.mocked(expandBlueprint).mockReturnValue({
      node: { id: 'NEW' },
    } as unknown as ReturnType<typeof expandBlueprint>);

    mocks.syncUseEffect.current = false;
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const ghost = makeGhost({
      sourceNodeId: 'SRC',
      edgeDirection: 'from',
      edgeRelationship: 'depends_on',
    });
    result.handleAcceptGhost(ghost);

    const edgeAction = dispatchSpy.mock.calls[1][0] as {
      type: string;
      payload: { source: string; target: string; data: { relationship: string } };
    };
    expect(edgeAction.type).toBe('cards/addEdgeToCard');
    expect(edgeAction.payload.source).toBe('NEW');
    expect(edgeAction.payload.target).toBe('SRC');
    expect(edgeAction.payload.data).toEqual({ relationship: 'depends_on' });
  });
});

describe('useGhostMode — handleDismissGhost', () => {
  it('dispatches dismissGhost with the supplied id', () => {
    mocks.syncUseEffect.current = false;
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    result.handleDismissGhost('to-dismiss');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: unknown };
    expect(action.type).toBe('ghosts/dismissGhost');
    expect(action.payload).toBe('to-dismiss');
  });
});

describe('useGhostMode — auto-dismiss timer', () => {
  it('dispatches clearGhosts after 10s when ghosts are fresh', () => {
    const now = Date.now();
    const ghost = makeGhost({ createdAt: now });
    const store = makeStore([ghost]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store);

    // Immediately after render, no clearGhosts yet — timer is queued for ~10s.
    const clearCalls = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'ghosts/clearGhosts',
    );
    expect(clearCalls).toHaveLength(0);

    // Advance just before the threshold — still no fire.
    vi.advanceTimersByTime(9_999);
    let postCalls = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'ghosts/clearGhosts',
    );
    expect(postCalls).toHaveLength(0);

    // Cross the threshold.
    vi.advanceTimersByTime(1);
    postCalls = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'ghosts/clearGhosts',
    );
    expect(postCalls).toHaveLength(1);
  });

  it('uses the NEWEST ghost.createdAt to compute remaining time', () => {
    const now = Date.now();
    // Newest ghost is 3s old → remaining = 7s.
    const oldGhost = makeGhost({ id: 'old', createdAt: now - 8_000 });
    const newGhost = makeGhost({ id: 'new', createdAt: now - 3_000 });
    const store = makeStore([oldGhost, newGhost]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store);

    // After 6_999 ms still pending.
    vi.advanceTimersByTime(6_999);
    let calls = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'ghosts/clearGhosts',
    );
    expect(calls).toHaveLength(0);

    // Cross 7_000 ms boundary.
    vi.advanceTimersByTime(1);
    calls = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'ghosts/clearGhosts',
    );
    expect(calls).toHaveLength(1);
  });

  it('fires immediately (delay = 0) when elapsed > 10s — Math.max(0, ...) clamp', () => {
    const now = Date.now();
    // Ghost created 30s ago → elapsed 30_000 → remaining = max(0, -20_000) = 0.
    const stale = makeGhost({ createdAt: now - 30_000 });
    const store = makeStore([stale]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store);

    // setTimeout(cb, 0) is still queued, not synchronous — advance once.
    vi.advanceTimersByTime(0);
    const calls = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'ghosts/clearGhosts',
    );
    expect(calls).toHaveLength(1);
  });

  it('does NOT schedule a timer when ghosts is empty', () => {
    const store = makeStore([]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store);

    // No cleanup function got registered — the early `return` short-circuits
    // before the `setTimeout` call.
    expect(mocks.effectCleanups).toHaveLength(0);

    vi.advanceTimersByTime(60_000);
    const calls = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'ghosts/clearGhosts',
    );
    expect(calls).toHaveLength(0);
  });

  it('cleanup clears the queued timer (no clearGhosts after manual clearTimeout)', () => {
    const now = Date.now();
    const ghost = makeGhost({ createdAt: now });
    const store = makeStore([ghost]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store);

    expect(mocks.effectCleanups).toHaveLength(1);
    // Invoke cleanup BEFORE advancing the clock.
    mocks.effectCleanups[0]();

    vi.advanceTimersByTime(60_000);
    const calls = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'ghosts/clearGhosts',
    );
    expect(calls).toHaveLength(0);
  });
});

describe('useGhostMode — selector reactivity to setGhosts', () => {
  it('captures the populated ghosts array after a setGhosts dispatch', () => {
    mocks.syncUseEffect.current = false;
    const store = makeStore();
    let result = captureHook(store);
    expect(result.ghosts).toHaveLength(0);

    store.dispatch(
      setGhosts([
        makeGhost({ id: 'a' }),
        makeGhost({ id: 'b' }),
      ]),
    );

    result = captureHook(store);
    expect(result.ghosts).toHaveLength(2);
    expect(result.ghosts.map((g) => g.id)).toEqual(['a', 'b']);
  });
});

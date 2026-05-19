/**
 * rf-canv-22 — useCanvasSideEffects hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Probe pattern
 * from rf-canv-18/19/20/21 — render once with `React.createElement`,
 * capture `vi.mock`-routed effect callbacks, then drive each effect's
 * branch directly against the captured-spy mocks.
 *
 * The hook has six `useEffect` blocks, two `useRef` slots, and one
 * `useState` slot. We mock React's `useEffect` to fire synchronously
 * (per the rf-canv-18 + rf-props-19 pattern), `useRef` to a hoisted
 * call-indexed slot array (per rf-canv-21), and `useState` to a
 * mutable slot + setter spy (per rf-canv-20).
 *
 * The four side-effect functions the hook calls into
 * (`installInspector`, `updateInspectorState`, `inspectLayout`,
 * `logCanvasRender`) are mocked at module scope so we can assert on
 * call arguments. `autoOrganizeCard` is the action creator that flows
 * through `dispatch`; the test asserts on the action type emitted into
 * `dispatchSpy`.
 *
 * `localStorage.getItem('ice-debug')` is stubbed via `vi.stubGlobal`
 * so the inspect-layout branch can be toggled and the throw-on-getItem
 * private-mode branch verified.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
// Two useRef slots (prevNodeCountRef → idx 0, prevCardIdRef → idx 1) routed
// by call-index. One useState slot (overlayDismissed). Effect cleanups
// stashed so timer cleanup branches can be inspected.
const mocks = vi.hoisted(() => ({
  // Counter that resets each render — the hook calls useRef in fixed
  // source order: first prevNodeCountRef, then prevCardIdRef.
  refCallIndex: { current: 0 as number },
  refSlots: [
    { current: 0 as number },
    { current: undefined as string | undefined },
  ] as [{ current: number }, { current: string | undefined }],

  // The single useState slot: overlay-dismissed boolean. The orchestrator
  // discards the getter, but the setter is exercised via this spy.
  overlayDismissedSlot: { current: false as boolean },
  setOverlayDismissedSpy: vi.fn<(next: boolean) => void>(),

  // useEffect cleanup functions — each render appends; tests inspect the
  // last to verify clearTimeout-on-unmount semantics for the auto-organize
  // timer.
  effectCleanups: [] as Array<() => void>,
}));

// Mock the four side-effect helpers so calls are observable.
vi.mock('../../../../shared/utils/layout-inspector', () => ({
  installInspector: vi.fn(),
  updateInspectorState: vi.fn(),
  inspectLayout: vi.fn(),
}));
vi.mock('../../../../shared/utils/debug-logger', () => ({
  logCanvasRender: vi.fn(),
}));

// Mock React's useState/useRef/useEffect so the FC body runs synchronously.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(initial: T | (() => T)) => {
      // The hook has exactly one useState slot (overlay-dismissed). Honor
      // the initializer by writing to the slot only if the slot is still
      // at its default — but for simplicity we always return the slot
      // value the test left in place; per-test reset happens in beforeEach.
      void initial;
      const setter = (next: T) => {
        mocks.setOverlayDismissedSpy(next as unknown as boolean);
        mocks.overlayDismissedSlot.current = next as unknown as boolean;
      };
      return [mocks.overlayDismissedSlot.current as unknown as T, setter as unknown];
    }),
    useRef: vi.fn(<T,>(initial: T) => {
      // Route by call-index. The hook always calls useRef in the same
      // order: first prevNodeCountRef (idx 0), then prevCardIdRef (idx 1).
      const idx = mocks.refCallIndex.current;
      mocks.refCallIndex.current += 1;
      void initial; // initializer captured by per-test setup, not honored here
      return mocks.refSlots[idx] as unknown as { current: T };
    }),
    useEffect: vi.fn((cb: () => void | (() => void), _deps?: unknown[]) => {
      // Run effects synchronously and stash any cleanup function.
      const cleanup = cb();
      if (typeof cleanup === 'function') {
        mocks.effectCleanups.push(cleanup);
      }
    }),
  };
});

// Import AFTER the mocks are registered so the hook closes over the mocked
// useEffect/useRef/useState and the four side-effect helpers.
import {
  installInspector,
  updateInspectorState,
  inspectLayout,
} from '../../../../shared/utils/layout-inspector';
import { logCanvasRender } from '../../../../shared/utils/debug-logger';
import { useCanvasSideEffects, type UseCanvasSideEffectsArgs } from '../use-canvas-side-effects';
import type { CardNode, CardEdge, Card } from '../../../../store/slices/cards-slice';
import type { CanvasNode } from '../../components/types';

// ─── Probe / harness ────────────────────────────────────────────────────────

const renderHook = (args: UseCanvasSideEffectsArgs): void => {
  const Probe: React.FC = () => {
    useCanvasSideEffects(args);
    return React.createElement('div', null, 'probe');
  };
  renderToString(React.createElement(Probe));
};

// Default sample inputs for tests that don't care about specific data
const makeNode = (overrides: Partial<CardNode> = {}): CardNode => ({
  id: overrides.id ?? 'n1',
  type: overrides.type ?? 'block',
  position: overrides.position ?? { x: 10, y: 20 },
  width: overrides.width ?? 100,
  height: overrides.height ?? 50,
  parentId: overrides.parentId,
  data: overrides.data ?? { label: 'A', iceType: 'Compute.Service' },
});

const makeEdge = (overrides: Partial<CardEdge> = {}): CardEdge => ({
  id: overrides.id ?? 'e1',
  source: overrides.source ?? 'n1',
  target: overrides.target ?? 'n2',
  data: overrides.data,
});

const makeCanvasNode = (id: string): CanvasNode => ({
  id,
  type: 'block',
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  label: id,
  parentId: null,
  data: { iceType: 'Compute.Service' },
});

const baseArgs = (overrides: Partial<UseCanvasSideEffectsArgs> = {}): UseCanvasSideEffectsArgs => ({
  card: { id: 'card-1', name: 'C1', nodes: [], edges: [], viewport: { panX: 0, panY: 0, scale: 1 }, createdAt: 0 } as Card,
  nodes: [],
  edges: [],
  canvasNodes: [],
  effectiveNodes: [],
  viewport: { zoom: 1 },
  lod: 2,
  viewLevel: 2,
  aiCurrentIntent: null,
  dispatch: vi.fn() as unknown as UseCanvasSideEffectsArgs['dispatch'],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  // Reset call-index + slots
  mocks.refCallIndex.current = 0;
  mocks.refSlots[0].current = 0;
  mocks.refSlots[1].current = undefined;
  mocks.overlayDismissedSlot.current = false;
  mocks.setOverlayDismissedSpy.mockReset();
  mocks.effectCleanups.length = 0;

  // Default: localStorage returns null (no debug flag)
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasSideEffects — install inspector', () => {
  it('calls installInspector exactly once on mount', () => {
    renderHook(baseArgs());
    expect(installInspector).toHaveBeenCalledTimes(1);
  });
});

describe('useCanvasSideEffects — updateInspectorState', () => {
  it('feeds updateInspectorState a state object with zoom/lod/projected nodes/projected edges', () => {
    const nodes: CardNode[] = [
      makeNode({
        id: 'a',
        type: 'block',
        position: { x: 5, y: 7 },
        width: 80,
        height: 40,
        parentId: 'parent-1',
        data: { label: 'My Block', iceType: 'Compute.Service', folded: true },
      }),
    ];
    const edges: CardEdge[] = [
      makeEdge({ id: 'e-1', source: 'a', target: 'b', data: { relationship: 'connects_to' } }),
    ];
    renderHook(baseArgs({ nodes, edges, viewport: { zoom: 0.75 }, lod: 3 }));

    expect(updateInspectorState).toHaveBeenCalledTimes(1);
    expect(updateInspectorState).toHaveBeenCalledWith({
      zoom: 0.75,
      lod: 3,
      nodes: [
        {
          id: 'a',
          type: 'block',
          label: 'My Block',
          iceType: 'Compute.Service',
          x: 5,
          y: 7,
          width: 80,
          height: 40,
          parentId: 'parent-1',
          folded: true,
        },
      ],
      edges: [
        {
          id: 'e-1',
          source: 'a',
          target: 'b',
          relationship: 'connects_to',
        },
      ],
    });
  });

  it('falls back to node id when label is absent', () => {
    const nodes: CardNode[] = [
      makeNode({
        id: 'no-label',
        data: {},
      }),
    ];
    renderHook(baseArgs({ nodes }));

    const arg = vi.mocked(updateInspectorState).mock.calls[0][0];
    expect(arg.nodes[0].label).toBe('no-label');
    expect(arg.nodes[0].iceType).toBe('');
    expect(arg.nodes[0].folded).toBe(false);
  });
});

describe('useCanvasSideEffects — inspectLayout gating', () => {
  it('calls inspectLayout when localStorage["ice-debug"] === "true"', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((k: string) => (k === 'ice-debug' ? 'true' : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    });

    renderHook(baseArgs());
    expect(inspectLayout).toHaveBeenCalledTimes(1);
  });

  it('does NOT call inspectLayout when localStorage["ice-debug"] is null', () => {
    renderHook(baseArgs());
    expect(inspectLayout).not.toHaveBeenCalled();
  });

  it('does NOT call inspectLayout when localStorage["ice-debug"] is any non-"true" string', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('false'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    });

    renderHook(baseArgs());
    expect(inspectLayout).not.toHaveBeenCalled();
  });

  it('silently catches a localStorage.getItem throw without crashing the canvas', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('SecurityError: localStorage disabled');
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    });

    expect(() => renderHook(baseArgs())).not.toThrow();
    expect(inspectLayout).not.toHaveBeenCalled();
    // The inspector state still got fed even though the auto-log branch threw.
    expect(updateInspectorState).toHaveBeenCalledTimes(1);
  });
});

describe('useCanvasSideEffects — auto-organize threshold', () => {
  it('dispatches autoOrganizeCard when nodes go from 0 to 12 (initial-import branch)', () => {
    const dispatch = vi.fn();
    // prevNodeCountRef starts at 0 (its initializer); the slot mock honors that.
    const nodes = Array.from({ length: 12 }, (_, i) => makeNode({ id: `n${i}` }));
    renderHook(baseArgs({ nodes, dispatch: dispatch as unknown as UseCanvasSideEffectsArgs['dispatch'], viewport: { zoom: 0.8 } }));

    // No dispatch yet — the timer is queued.
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0] as { type: string; payload: unknown };
    expect(action.type).toBe('cards/autoOrganizeCard');
    expect(action.payload).toEqual({ zoom: 0.8 });
  });

  it('does NOT dispatch when delta is below the > 10 threshold (5 → 8)', () => {
    const dispatch = vi.fn();
    // Pre-prime prev-node-count to 5; the next render sees currentCount = 8,
    // delta = 3, which fails the > 10 guard.
    mocks.refSlots[0].current = 5;
    const nodes = Array.from({ length: 8 }, (_, i) => makeNode({ id: `n${i}` }));
    renderHook(baseArgs({ nodes, dispatch: dispatch as unknown as UseCanvasSideEffectsArgs['dispatch'] }));

    vi.advanceTimersByTime(500);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does NOT dispatch when delta is exactly 10 (off-by-one — threshold is strict >)', () => {
    const dispatch = vi.fn();
    // prev=1, current=11: delta = 10. The guard is strict `>`, so this fails.
    // (0 → 10 would trigger via the prevCount === 0 OR branch — distinct case.)
    mocks.refSlots[0].current = 1;
    const nodes = Array.from({ length: 11 }, (_, i) => makeNode({ id: `n${i}` }));
    renderHook(baseArgs({ nodes, dispatch: dispatch as unknown as UseCanvasSideEffectsArgs['dispatch'] }));

    vi.advanceTimersByTime(500);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('triggers the initial-import branch even when currentCount is small (prev=0, current=5)', () => {
    const dispatch = vi.fn();
    mocks.refSlots[0].current = 0;
    const nodes = Array.from({ length: 5 }, (_, i) => makeNode({ id: `n${i}` }));
    renderHook(baseArgs({ nodes, dispatch: dispatch as unknown as UseCanvasSideEffectsArgs['dispatch'] }));

    vi.advanceTimersByTime(100);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0] as { type: string };
    expect(action.type).toBe('cards/autoOrganizeCard');
  });

  it('does NOT dispatch when currentCount is 0 (no nodes at all)', () => {
    const dispatch = vi.fn();
    mocks.refSlots[0].current = 0;
    renderHook(baseArgs({ nodes: [], dispatch: dispatch as unknown as UseCanvasSideEffectsArgs['dispatch'] }));

    vi.advanceTimersByTime(500);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('updates prevNodeCountRef on each render even when guard fails', () => {
    const dispatch = vi.fn();
    mocks.refSlots[0].current = 5;
    const nodes = Array.from({ length: 8 }, (_, i) => makeNode({ id: `n${i}` }));
    renderHook(baseArgs({ nodes, dispatch: dispatch as unknown as UseCanvasSideEffectsArgs['dispatch'] }));

    expect(mocks.refSlots[0].current).toBe(8);
  });

  it('updates prevNodeCountRef BEFORE the timer fires when the dispatch branch runs', () => {
    const dispatch = vi.fn();
    mocks.refSlots[0].current = 0;
    const nodes = Array.from({ length: 12 }, (_, i) => makeNode({ id: `n${i}` }));
    renderHook(baseArgs({ nodes, dispatch: dispatch as unknown as UseCanvasSideEffectsArgs['dispatch'] }));

    // Ref updates synchronously inside the effect, before the 100ms timer fires.
    expect(mocks.refSlots[0].current).toBe(12);
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('clears the auto-organize timer on cleanup (no double-dispatch on rapid re-render)', () => {
    const dispatch = vi.fn();
    mocks.refSlots[0].current = 0;
    const nodes = Array.from({ length: 12 }, (_, i) => makeNode({ id: `n${i}` }));
    renderHook(baseArgs({ nodes, dispatch: dispatch as unknown as UseCanvasSideEffectsArgs['dispatch'] }));

    // Locate the cleanup registered by the auto-organize effect (the only
    // effect that returns a cleanup in this hook). Invoke it before the timer fires.
    expect(mocks.effectCleanups.length).toBeGreaterThanOrEqual(1);
    for (const cleanup of mocks.effectCleanups) cleanup();

    vi.advanceTimersByTime(100);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('useCanvasSideEffects — logCanvasRender', () => {
  it('calls logCanvasRender with { nodeCount, edgeCount, visibleCount, viewLevel }', () => {
    const canvasNodes = [makeCanvasNode('c1'), makeCanvasNode('c2'), makeCanvasNode('c3')];
    const effectiveNodes = [makeCanvasNode('c1'), makeCanvasNode('c2')];
    const edges = [makeEdge({ id: 'e1' }), makeEdge({ id: 'e2' })];

    renderHook(baseArgs({ canvasNodes, effectiveNodes, edges, viewLevel: 1 }));

    expect(logCanvasRender).toHaveBeenCalledTimes(1);
    expect(logCanvasRender).toHaveBeenCalledWith({
      nodeCount: 3,
      edgeCount: 2,
      visibleCount: 2,
      viewLevel: 1,
    });
  });
});

describe('useCanvasSideEffects — overlay-dismiss reset on card change', () => {
  it('calls setOverlayDismissed(false) when card.id differs from prevCardIdRef.current', () => {
    // Pre-prime the prev-card-id ref to something different than the current card.
    mocks.refSlots[1].current = 'old-card';
    renderHook(
      baseArgs({
        card: { id: 'new-card', name: 'N', nodes: [], edges: [], viewport: { panX: 0, panY: 0, scale: 1 }, createdAt: 0 } as Card,
      }),
    );

    expect(mocks.setOverlayDismissedSpy).toHaveBeenCalledWith(false);
    // After the effect, prevCardIdRef should be advanced to the new id.
    expect(mocks.refSlots[1].current).toBe('new-card');
  });

  it('does NOT call setOverlayDismissed(false) when card.id matches prevCardIdRef.current', () => {
    mocks.refSlots[1].current = 'card-1';
    renderHook(
      baseArgs({
        card: { id: 'card-1', name: 'C1', nodes: [], edges: [], viewport: { panX: 0, panY: 0, scale: 1 }, createdAt: 0 } as Card,
        aiCurrentIntent: null,
      }),
    );

    // The reset-on-change effect should NOT have called the setter (no change).
    // The AI-intent effect is also skipped (aiCurrentIntent is null).
    expect(mocks.setOverlayDismissedSpy).not.toHaveBeenCalled();
  });

  it('handles undefined card on initial render — sets prev to undefined without firing the setter', () => {
    mocks.refSlots[1].current = undefined;
    renderHook(baseArgs({ card: undefined, aiCurrentIntent: null }));
    // card?.id (undefined) === prevCardIdRef.current (undefined), so no setter call.
    expect(mocks.setOverlayDismissedSpy).not.toHaveBeenCalled();
  });
});

describe('useCanvasSideEffects — overlay-dismiss on AI intent', () => {
  it('calls setOverlayDismissed(true) when aiCurrentIntent is a non-empty string', () => {
    renderHook(baseArgs({ aiCurrentIntent: 'add a database' }));
    expect(mocks.setOverlayDismissedSpy).toHaveBeenCalledWith(true);
  });

  it('does NOT call setOverlayDismissed(true) when aiCurrentIntent is null', () => {
    mocks.refSlots[1].current = 'card-1'; // match current card so reset doesn't fire either
    renderHook(
      baseArgs({
        card: { id: 'card-1', name: 'C1', nodes: [], edges: [], viewport: { panX: 0, panY: 0, scale: 1 }, createdAt: 0 } as Card,
        aiCurrentIntent: null,
      }),
    );
    expect(mocks.setOverlayDismissedSpy).not.toHaveBeenCalled();
  });

  it('does NOT call setOverlayDismissed(true) when aiCurrentIntent is an empty string (falsy)', () => {
    mocks.refSlots[1].current = 'card-1';
    renderHook(
      baseArgs({
        card: { id: 'card-1', name: 'C1', nodes: [], edges: [], viewport: { panX: 0, panY: 0, scale: 1 }, createdAt: 0 } as Card,
        aiCurrentIntent: '',
      }),
    );
    expect(mocks.setOverlayDismissedSpy).not.toHaveBeenCalled();
  });

  it('fires both effects when both card changes AND aiCurrentIntent is set in the same render', () => {
    mocks.refSlots[1].current = 'old';
    renderHook(
      baseArgs({
        card: { id: 'new', name: 'N', nodes: [], edges: [], viewport: { panX: 0, panY: 0, scale: 1 }, createdAt: 0 } as Card,
        aiCurrentIntent: 'do something',
      }),
    );
    // Both setter calls happen (false from reset, true from AI).
    expect(mocks.setOverlayDismissedSpy).toHaveBeenCalledTimes(2);
    expect(mocks.setOverlayDismissedSpy).toHaveBeenNthCalledWith(1, false);
    expect(mocks.setOverlayDismissedSpy).toHaveBeenNthCalledWith(2, true);
  });
});

describe('useCanvasSideEffects — return shape', () => {
  it('returns void', () => {
    let result: unknown = 'not-set';
    const Probe: React.FC = () => {
      result = useCanvasSideEffects(baseArgs());
      return React.createElement('div');
    };
    renderToString(React.createElement(Probe));
    expect(result).toBeUndefined();
  });
});

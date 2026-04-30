/**
 * rf-canv-27 — useConnectionDrawing hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Provider +
 * capture-ref harness from rf-canv-20/21/22/23/24 — render
 * `<Provider><Probe /></Provider>` with `renderToString`, capture the
 * hook's return value into a ref, then drive the callbacks with synthetic
 * `React.MouseEvent` fixtures and assert on `vi.spyOn(store, 'dispatch')`
 * + the five mocked rule helpers.
 *
 * The hook has zero `useEffect` calls — a single `useState` slot,
 * `useMemo`, and three `useCallback`s. To share state across multiple
 * `renderToString` calls within one test (the same harness pattern from
 * rf-canv-21 / rf-canv-22), we mock React's `useState` against a hoisted
 * mutable slot. Setter writes mutate the slot directly and a re-rendered
 * Probe sees the new value. `useMemo` and `useCallback` are left
 * untouched (real impl) — we want the memoized
 * `connectionDragTargets` to compute and the callbacks to close over
 * the latest args.
 *
 * The five rule helpers (`canConnect`, `validateConnection`,
 * `wouldCreateCycle`, `inferConnectionMeta`,
 * `findExistingSpecialConnection`) are mocked at module scope so the
 * validation cascade order is observable.
 *
 * `Date.now()` is stubbed via `vi.setSystemTime` so the
 * `edge-${Date.now()}` id is deterministic.
 *
 * Per blueprint risk #3 (`card` STAYS in the dep array — no ref), the
 * "card stays in dep array" suite verifies the hook re-reads the
 * passed-in `card.edges` on each render. Per risk #5 (`classList.contains`
 * gate), the gate suite asserts the predicate gate inside
 * `handleConnectionPortDown` is the FIRST step — non-port events
 * short-circuit before the state update.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
// rf-canv-12 learning (`vi-hoisted-required-for-shared-mock-identities-...`).
// rf-canv-21 useState-mock-with-mutable-slot pattern: writes mutate the slot
// so subsequent renders see the new value.
interface DrawState {
  sourceId: string;
  sourceRouteId?: string;
  sourcePoint: { x: number; y: number };
  currentPoint: { x: number; y: number };
}

const mocks = vi.hoisted(() => ({
  // The hook has exactly ONE useState slot — the drawingConnection descriptor.
  drawingConnectionSlot: { current: null as null | DrawState },
  // Five rule-helper spies — set per-test via mockReturnValue.
  canConnectSpy: vi.fn(),
  validateConnectionSpy: vi.fn(),
  wouldCreateCycleSpy: vi.fn(),
  inferConnectionMetaSpy: vi.fn(),
  findExistingSpecialConnectionSpy: vi.fn(),
}));

// Mock React's `useState` so the slot survives across `renderToString`
// invocations within one test. `useMemo` and `useCallback` keep their real
// implementations — that's what makes `connectionDragTargets` recompute
// against the now-mutated slot on the next render.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(initial: T | (() => T)) => {
      void initial;
      const setter = (next: T | ((prev: T) => T)) => {
        const resolved =
          typeof next === 'function'
            ? (next as (prev: T) => T)(mocks.drawingConnectionSlot.current as unknown as T)
            : next;
        mocks.drawingConnectionSlot.current = resolved as unknown as null | DrawState;
      };
      return [mocks.drawingConnectionSlot.current as unknown as T, setter as unknown];
    }),
  };
});

// Mock `connection-rules` (re-export from `@ice/types` — flatten the
// surface to just the entries the hook reads). `CATEGORY_TO_RELATIONSHIP`
// is an object — keep its shape minimal but with the keys the hook may
// reach for via `meta.category`.
vi.mock('../../utils/connection-rules', () => ({
  canConnect: mocks.canConnectSpy,
  validateConnection: mocks.validateConnectionSpy,
  wouldCreateCycle: mocks.wouldCreateCycleSpy,
  inferConnectionMeta: mocks.inferConnectionMetaSpy,
  CATEGORY_TO_RELATIONSHIP: {
    data_flow: 'connects_to',
    config: 'depends_on',
    secret: 'depends_on',
    domain: 'serves',
    network: 'attached_to',
    repo: 'deploys_from',
    auth: 'authenticates',
    cache: 'connects_to',
    queue: 'connects_to',
    storage: 'connects_to',
    monitoring: 'observes',
    user_traffic: 'connects_to',
    contains: 'contains',
  },
}));

// Mock the special-rule helper.
vi.mock('../../utils/connection-special-rules', () => ({
  findExistingSpecialConnection: mocks.findExistingSpecialConnectionSpy,
}));

// Import AFTER the mocks are registered so the hook closes over them.
import { useConnectionDrawing, type UseConnectionDrawingResult } from '../use-connection-drawing';
import type { CardEdge, Card } from '../../../../store/slices/cards-slice';
import type { CanvasNode } from '../../components/types';

// ─── Store builder ──────────────────────────────────────────────────────────
// The hook DISPATCHES `addEdgeToCard` on success. It never reads from
// Redux state itself — `card` and `effectiveNodes` are passed via args.
// A minimal stub-reducer is enough; assert on the dispatched action shape.

const cardsStubSlice = createSlice({
  name: 'cards',
  initialState: { activeCardId: null, cards: [] },
  reducers: {},
});

const makeStore = () =>
  configureStore({
    reducer: { cards: cardsStubSlice.reducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

type TestStore = ReturnType<typeof makeStore>;

// ─── Probe / harness ────────────────────────────────────────────────────────

interface CaptureArgs {
  effectiveNodes?: CanvasNode[];
  card?: Card | undefined;
  screenToCanvas?: (clientX: number, clientY: number) => { x: number; y: number };
}

const captureHook = (store: TestStore, overrides: CaptureArgs = {}): UseConnectionDrawingResult => {
  const args = {
    effectiveNodes: overrides.effectiveNodes ?? [],
    card: overrides.card,
    screenToCanvas:
      overrides.screenToCanvas ?? ((cx: number, cy: number) => ({ x: cx, y: cy })),
  };
  const captured: { current?: UseConnectionDrawingResult } = {};
  const Probe: React.FC = () => {
    captured.current = useConnectionDrawing(args);
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

/**
 * Build a synthetic React.MouseEvent whose `target` carries the supplied
 * classList tokens + data attributes. `preventDefault` and `stopPropagation`
 * are observable via the returned spy refs.
 */
function mockPortEvent(
  options: {
    classList?: string[];
    nodeId?: string | null;
    routeId?: string | null;
    clientX?: number;
    clientY?: number;
  } = {},
) {
  const tokens = new Set(options.classList ?? []);
  const target = {
    classList: {
      contains: (token: string) => tokens.has(token),
    },
    getAttribute: (key: string) => {
      if (key === 'data-node-id') return options.nodeId ?? null;
      if (key === 'data-route-id') return options.routeId ?? null;
      return null;
    },
  };
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  return {
    event: {
      target,
      clientX: options.clientX ?? 0,
      clientY: options.clientY ?? 0,
      preventDefault,
      stopPropagation,
    } as unknown as React.MouseEvent,
    preventDefault,
    stopPropagation,
  };
}

const makeNode = (overrides: Partial<CanvasNode> & { id: string }): CanvasNode =>
  ({
    id: overrides.id,
    type: overrides.type ?? 'block',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 50,
    label: overrides.label ?? overrides.id,
    parentId: overrides.parentId ?? null,
    data: overrides.data ?? { iceType: 'Compute.Service' },
  } as unknown as CanvasNode);

const makeCard = (edges: CardEdge[] = []): Card =>
  ({
    id: 'card-1',
    name: 'C1',
    nodes: [],
    edges,
    viewport: { panX: 0, panY: 0, scale: 1 },
    createdAt: 0,
  } as Card);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-29T12:00:00Z'));
  // Reset the useState slot so each test starts with no in-flight drag.
  mocks.drawingConnectionSlot.current = null;
  // Default: rule helpers all permit the connection.
  mocks.canConnectSpy.mockReturnValue(true);
  mocks.validateConnectionSpy.mockReturnValue([]);
  mocks.wouldCreateCycleSpy.mockReturnValue(false);
  mocks.inferConnectionMetaSpy.mockReturnValue({
    category: 'data_flow',
    flip: false,
    trafficType: undefined,
    port: undefined,
    envVarName: undefined,
    lineStyle: 'solid',
    color: undefined,
  });
  mocks.findExistingSpecialConnectionSpy.mockReturnValue({ specialType: null, conflict: false });
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Set up an in-flight drag by writing the slot directly. Skips the
 * `handleConnectionPortDown` path so individual tests can focus on the
 * end-of-drag validation cascade.
 */
function startDrag(options: {
  sourceId?: string;
  sourceRouteId?: string;
  sourcePoint?: { x: number; y: number };
} = {}) {
  mocks.drawingConnectionSlot.current = {
    sourceId: options.sourceId ?? 'src',
    sourceRouteId: options.sourceRouteId,
    sourcePoint: options.sourcePoint ?? { x: 0, y: 0 },
    currentPoint: options.sourcePoint ?? { x: 0, y: 0 },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useConnectionDrawing — initial state', () => {
  it('drawingConnection is null on first render', () => {
    const store = makeStore();
    const result = captureHook(store);
    expect(result.drawingConnection).toBeNull();
  });

  it('connectionDragTargets is null when no drawingConnection', () => {
    const store = makeStore();
    const result = captureHook(store, {
      effectiveNodes: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
    });
    expect(result.connectionDragTargets).toBeNull();
  });

  it('exposes drawingConnection, connectionDragTargets, and three handlers', () => {
    const store = makeStore();
    const result = captureHook(store);
    expect(result.drawingConnection).toBeNull();
    expect(result.connectionDragTargets).toBeNull();
    expect(typeof result.handleConnectionPortDown).toBe('function');
    expect(typeof result.handleConnectionMove).toBe('function');
    expect(typeof result.handleConnectionEnd).toBe('function');
  });
});

describe('useConnectionDrawing — handleConnectionPortDown classList gate (RISK #5)', () => {
  it('no-ops when target does not carry the connection-port class', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const { event, preventDefault, stopPropagation } = mockPortEvent({
      classList: ['some-other-class'],
      nodeId: 'a',
      clientX: 10,
      clientY: 20,
    });
    result.handleConnectionPortDown(event);

    // Predicate gate fires FIRST: no preventDefault, no stopPropagation, no
    // state write, no dispatch.
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mocks.drawingConnectionSlot.current).toBeNull();
  });

  it('calls preventDefault + stopPropagation + writes drag state when class is present', () => {
    const store = makeStore();
    const result = captureHook(store);

    const { event, preventDefault, stopPropagation } = mockPortEvent({
      classList: ['connection-port'],
      nodeId: 'svc-1',
      clientX: 100,
      clientY: 200,
    });
    result.handleConnectionPortDown(event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(mocks.drawingConnectionSlot.current).not.toBeNull();
    expect(mocks.drawingConnectionSlot.current?.sourceId).toBe('svc-1');
    expect(mocks.drawingConnectionSlot.current?.sourceRouteId).toBeUndefined();
    expect(mocks.drawingConnectionSlot.current?.sourcePoint).toEqual({ x: 100, y: 200 });
    expect(mocks.drawingConnectionSlot.current?.currentPoint).toEqual({ x: 100, y: 200 });
  });

  it('captures sourceRouteId from data-route-id when present', () => {
    const store = makeStore();
    const result = captureHook(store);

    const { event } = mockPortEvent({
      classList: ['connection-port'],
      nodeId: 'cd-1',
      routeId: 'route-7',
      clientX: 50,
      clientY: 60,
    });
    result.handleConnectionPortDown(event);

    expect(mocks.drawingConnectionSlot.current?.sourceRouteId).toBe('route-7');
  });

  it('no-ops when classList passes but data-node-id is missing', () => {
    const store = makeStore();
    const result = captureHook(store);

    const { event, preventDefault, stopPropagation } = mockPortEvent({
      classList: ['connection-port'],
      nodeId: null,
      clientX: 1,
      clientY: 1,
    });
    result.handleConnectionPortDown(event);

    // preventDefault/stopPropagation DID fire (they're called BEFORE the
    // node-id read), but state was never written.
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(mocks.drawingConnectionSlot.current).toBeNull();
  });
});

describe('useConnectionDrawing — connectionDragTargets memo', () => {
  it('builds a Map with source + valid + invalid entries', () => {
    const store = makeStore();
    // Pre-seed the drag state.
    startDrag({ sourceId: 'svc' });

    // Drive canConnect: returns true for n1, false for n2.
    mocks.canConnectSpy.mockImplementation((_a, _b, _at, _bt, ctx: any) => {
      return ctx.tgtNode.id === 'n1';
    });

    const nodes: CanvasNode[] = [
      makeNode({ id: 'svc' }),
      makeNode({ id: 'n1' }),
      makeNode({ id: 'n2' }),
    ];
    const result = captureHook(store, { effectiveNodes: nodes });
    expect(result.connectionDragTargets).not.toBeNull();
    const targets = result.connectionDragTargets!;
    expect(targets.get('svc')).toBe('source');
    expect(targets.get('n1')).toBe('valid-target');
    expect(targets.get('n2')).toBe('invalid-target');
    expect(targets.size).toBe(3);
  });

  it('returns null when the drag descriptor points at a missing source node', () => {
    const store = makeStore();
    startDrag({ sourceId: 'absent-source' });

    const nodes: CanvasNode[] = [makeNode({ id: 'a' }), makeNode({ id: 'b' })];
    const result = captureHook(store, { effectiveNodes: nodes });
    expect(result.connectionDragTargets).toBeNull();
  });
});

describe('useConnectionDrawing — handleConnectionMove', () => {
  it('updates currentPoint via screenToCanvas while drag is in flight', () => {
    const store = makeStore();
    startDrag({ sourceId: 'svc', sourcePoint: { x: 0, y: 0 } });

    const result = captureHook(store);
    result.handleConnectionMove({
      clientX: 200,
      clientY: 400,
    } as unknown as React.MouseEvent);

    expect(mocks.drawingConnectionSlot.current?.currentPoint).toEqual({ x: 200, y: 400 });
    // sourcePoint should NOT have moved.
    expect(mocks.drawingConnectionSlot.current?.sourcePoint).toEqual({ x: 0, y: 0 });
  });

  it('no-ops when no drawingConnection is in flight', () => {
    const store = makeStore();
    const screenSpy = vi.fn((cx: number, cy: number) => ({ x: cx, y: cy }));
    const result = captureHook(store, { screenToCanvas: screenSpy });
    result.handleConnectionMove({
      clientX: 500,
      clientY: 600,
    } as unknown as React.MouseEvent);

    expect(screenSpy).not.toHaveBeenCalled();
  });
});

describe('useConnectionDrawing — handleConnectionEnd no-drawing short-circuit', () => {
  it('no-ops and does not dispatch when no drawingConnection', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    result.handleConnectionEnd({
      clientX: 100,
      clientY: 100,
    } as unknown as React.MouseEvent);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mocks.canConnectSpy).not.toHaveBeenCalled();
  });
});

describe('useConnectionDrawing — handleConnectionEnd target hit-test', () => {
  it('picks the SMALLEST containing node when drop hits multiple stacked rectangles', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    // Source node + two stacked targets (the larger one fully contains the
    // smaller one). Drop point (50, 50) lies inside both.
    const big = makeNode({ id: 'big', x: 0, y: 0, width: 200, height: 200 });
    const small = makeNode({ id: 'small', x: 30, y: 30, width: 50, height: 50 });
    const src = makeNode({ id: 'src', x: 500, y: 500, width: 10, height: 10 });
    const nodes: CanvasNode[] = [big, small, src];
    const card = makeCard([]);

    startDrag({ sourceId: 'src' });
    dispatchSpy.mockClear();
    const result = captureHook(store, { effectiveNodes: nodes, card });
    result.handleConnectionEnd({ clientX: 50, clientY: 50 } as unknown as React.MouseEvent);

    // Dispatch fired with target == 'small' (the smaller of the two
    // containing rects).
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: CardEdge };
    expect(action.payload.target).toBe('small');
  });

  it('clears drag state on drop with no target hit (mousepoint over empty space)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const nodes: CanvasNode[] = [
      makeNode({ id: 'src', x: 0, y: 0, width: 50, height: 50 }),
      makeNode({ id: 'tgt', x: 200, y: 200, width: 100, height: 100 }),
    ];
    const card = makeCard([]);

    startDrag({ sourceId: 'src' });
    dispatchSpy.mockClear();
    const result = captureHook(store, { effectiveNodes: nodes, card });
    // Drop way outside any node.
    result.handleConnectionEnd({ clientX: 9999, clientY: 9999 } as unknown as React.MouseEvent);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mocks.drawingConnectionSlot.current).toBeNull();
  });
});

describe('useConnectionDrawing — handleConnectionEnd validation cascade', () => {
  function defaultNodesAndCard() {
    return {
      nodes: [
        makeNode({ id: 'src', x: 0, y: 0, width: 50, height: 50 }),
        makeNode({ id: 'tgt', x: 200, y: 200, width: 100, height: 100 }),
      ],
      card: makeCard([]),
    };
  }

  it('blocks the edge when canConnect returns false (no dispatch, state cleared)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { nodes, card } = defaultNodesAndCard();
    startDrag({ sourceId: 'src' });
    dispatchSpy.mockClear();

    mocks.canConnectSpy.mockReturnValue(false);

    const r = captureHook(store, { effectiveNodes: nodes, card });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mocks.drawingConnectionSlot.current).toBeNull();
  });

  it('blocks when special-rule conflict fires (Source.Repository / Config.Environment cardinality)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { nodes, card } = defaultNodesAndCard();
    startDrag({ sourceId: 'src' });
    dispatchSpy.mockClear();

    mocks.findExistingSpecialConnectionSpy.mockReturnValue({
      specialType: 'source',
      conflict: true,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = captureHook(store, { effectiveNodes: nodes, card });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    expect(dispatchSpy).not.toHaveBeenCalled();
    // The "GitHub Repo" label is the verbatim string for specialType==='source'.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('GitHub Repo');
    warnSpy.mockRestore();
  });

  it('uses "Env Variables" label when special-rule conflict reports specialType=config', () => {
    const store = makeStore();
    const { nodes, card } = defaultNodesAndCard();
    startDrag({ sourceId: 'src' });

    mocks.findExistingSpecialConnectionSpy.mockReturnValue({
      specialType: 'config',
      conflict: true,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = captureHook(store, { effectiveNodes: nodes, card });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    expect(String(warnSpy.mock.calls[0][0])).toContain('Env Variables');
    warnSpy.mockRestore();
  });

  it('blocks when validateConnection returns an error-level warning', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { nodes, card } = defaultNodesAndCard();
    startDrag({ sourceId: 'src' });
    dispatchSpy.mockClear();

    mocks.validateConnectionSpy.mockReturnValue([
      { level: 'error', message: 'Cannot connect to self', suggestion: undefined },
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = captureHook(store, { effectiveNodes: nodes, card });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0][0])).toContain('Connection blocked');
    warnSpy.mockRestore();
  });

  it('logs warning-level entries from validateConnection but still creates the edge', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { nodes, card } = defaultNodesAndCard();
    startDrag({ sourceId: 'src' });
    dispatchSpy.mockClear();

    mocks.validateConnectionSpy.mockReturnValue([
      { level: 'warning', message: 'Possible duplicate edge', suggestion: 'remove the dup' },
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = captureHook(store, { effectiveNodes: nodes, card });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    // Soft warning surfaced (with the optional suggestion suffix)...
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0][0])).toContain('Possible duplicate edge');
    expect(String(warnSpy.mock.calls[0][0])).toContain('remove the dup');
    // ...but the dispatch still fired.
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('STILL creates the edge when wouldCreateCycle returns true (cycles only warn, never block)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { nodes, card } = defaultNodesAndCard();
    startDrag({ sourceId: 'src' });
    dispatchSpy.mockClear();

    mocks.wouldCreateCycleSpy.mockReturnValue(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = captureHook(store, { effectiveNodes: nodes, card });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    // Cycle warning surfaced...
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes('circular dependency')),
    ).toBe(true);
    // ...but the dispatch still fired.
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

describe('useConnectionDrawing — handleConnectionEnd flip + edge shape', () => {
  it('swaps source/target when inferConnectionMeta.flip is true', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const nodes: CanvasNode[] = [
      makeNode({ id: 'src', x: 0, y: 0, width: 50, height: 50 }),
      makeNode({ id: 'tgt', x: 200, y: 200, width: 100, height: 100 }),
    ];
    const card = makeCard([]);
    startDrag({ sourceId: 'src' });
    dispatchSpy.mockClear();

    mocks.inferConnectionMetaSpy.mockReturnValue({
      category: 'config',
      flip: true,
      trafficType: undefined,
      port: undefined,
      envVarName: undefined,
      lineStyle: 'solid',
      color: undefined,
    });

    const r = captureHook(store, { effectiveNodes: nodes, card });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: CardEdge };
    expect(action.payload.source).toBe('tgt'); // flipped
    expect(action.payload.target).toBe('src'); // flipped
  });

  it('dispatches addEdgeToCard with relationship + meta merged into edge.data', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const nodes: CanvasNode[] = [
      makeNode({ id: 'src', x: 0, y: 0, width: 50, height: 50 }),
      makeNode({ id: 'tgt', x: 200, y: 200, width: 100, height: 100 }),
    ];
    const card = makeCard([]);
    startDrag({ sourceId: 'src' });
    dispatchSpy.mockClear();

    mocks.inferConnectionMetaSpy.mockReturnValue({
      category: 'data_flow',
      flip: false,
      trafficType: 'http',
      port: 8080,
      envVarName: 'DB_URL',
      lineStyle: 'dashed',
      color: '#abc123',
    });

    const r = captureHook(store, { effectiveNodes: nodes, card });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: CardEdge };
    expect(action.type).toBe('cards/addEdgeToCard');
    expect(action.payload.source).toBe('src');
    expect(action.payload.target).toBe('tgt');
    expect(action.payload.id).toMatch(/^edge-/);
    expect(action.payload.data).toEqual({
      relationship: 'connects_to',
      connectionCategory: 'data_flow',
      trafficType: 'http',
      port: 8080,
      envVarName: 'DB_URL',
      lineStyle: 'dashed',
      color: '#abc123',
    });
  });

  it('omits lineStyle when meta.lineStyle === "solid"', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const nodes: CanvasNode[] = [
      makeNode({ id: 'src', x: 0, y: 0, width: 50, height: 50 }),
      makeNode({ id: 'tgt', x: 200, y: 200, width: 100, height: 100 }),
    ];
    startDrag({ sourceId: 'src' });
    dispatchSpy.mockClear();

    mocks.inferConnectionMetaSpy.mockReturnValue({
      category: 'data_flow',
      flip: false,
      trafficType: undefined,
      port: undefined,
      envVarName: undefined,
      lineStyle: 'solid',
      color: undefined,
    });

    const r = captureHook(store, { effectiveNodes: nodes, card: makeCard([]) });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: CardEdge };
    // Only the always-present keys should remain.
    expect(action.payload.data).toEqual({
      relationship: 'connects_to',
      connectionCategory: 'data_flow',
    });
  });

  it('threads sourceRouteId from drag descriptor through to edge.data.routeId', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const nodes: CanvasNode[] = [
      makeNode({ id: 'cd', x: 0, y: 0, width: 50, height: 50 }),
      makeNode({ id: 'svc', x: 200, y: 200, width: 100, height: 100 }),
    ];
    const card = makeCard([]);
    startDrag({ sourceId: 'cd', sourceRouteId: 'route-42' });
    dispatchSpy.mockClear();

    const r = captureHook(store, { effectiveNodes: nodes, card });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: CardEdge };
    expect(action.payload.data?.routeId).toBe('route-42');
  });
});

describe('useConnectionDrawing — risk #3: card stays in dep array', () => {
  it('re-renders pick up new card.edges immediately (no stale ref)', () => {
    const store = makeStore();
    const nodes: CanvasNode[] = [
      makeNode({ id: 'src', x: 0, y: 0, width: 50, height: 50 }),
      makeNode({ id: 'tgt', x: 200, y: 200, width: 100, height: 100 }),
    ];
    // First render with empty card.edges. Then in-flight drag set up, and a
    // second render with `card.edges = [pre-existing]` — the special-rule
    // helper should observe the FRESH edges (not the empty array captured
    // at first render). If the hook had stashed `card` in a ref, the
    // observed edges would still be empty.
    captureHook(store, { effectiveNodes: nodes, card: makeCard([]) });
    startDrag({ sourceId: 'src' });

    const newEdges: CardEdge[] = [
      { id: 'preexisting', source: 'src', target: 'envvars-1', data: {} },
    ];
    const cardWithEdge = makeCard(newEdges);
    let observedEdges: ReadonlyArray<{ source: string; target: string }> | undefined;
    mocks.findExistingSpecialConnectionSpy.mockImplementation(
      (_src, _tgt, edges, _nodes) => {
        observedEdges = edges as ReadonlyArray<{ source: string; target: string }>;
        return { specialType: null, conflict: false };
      },
    );

    const r = captureHook(store, { effectiveNodes: nodes, card: cardWithEdge });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    expect(observedEdges).toBeDefined();
    expect(observedEdges?.length).toBe(1);
    expect(observedEdges?.[0]).toMatchObject({ source: 'src', target: 'envvars-1' });
  });

  it('skips the special-rule gate when card is undefined', () => {
    const store = makeStore();
    const nodes: CanvasNode[] = [
      makeNode({ id: 'src', x: 0, y: 0, width: 50, height: 50 }),
      makeNode({ id: 'tgt', x: 200, y: 200, width: 100, height: 100 }),
    ];
    startDrag({ sourceId: 'src' });

    const r = captureHook(store, { effectiveNodes: nodes, card: undefined });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    // The special-rule helper is gated on `(sourceNode && card)` — with
    // card=undefined, it must NOT have been called.
    expect(mocks.findExistingSpecialConnectionSpy).not.toHaveBeenCalled();
  });

  it('passes card.edges via cardEdgesArr through validateConnection + wouldCreateCycle', () => {
    const store = makeStore();
    const nodes: CanvasNode[] = [
      makeNode({ id: 'src', x: 0, y: 0, width: 50, height: 50 }),
      makeNode({ id: 'tgt', x: 200, y: 200, width: 100, height: 100 }),
    ];
    const edges: CardEdge[] = [
      { id: 'a', source: 'a-src', target: 'a-tgt', data: {} },
      { id: 'b', source: 'b-src', target: 'b-tgt', data: {} },
    ];
    const card = makeCard(edges);
    startDrag({ sourceId: 'src' });

    const r = captureHook(store, { effectiveNodes: nodes, card });
    r.handleConnectionEnd({ clientX: 250, clientY: 250 } as unknown as React.MouseEvent);

    // Both validators see the projected (source, target) tuples.
    expect(mocks.validateConnectionSpy).toHaveBeenCalledTimes(1);
    const validateArgs = mocks.validateConnectionSpy.mock.calls[0];
    expect(validateArgs[2]).toEqual([
      { source: 'a-src', target: 'a-tgt' },
      { source: 'b-src', target: 'b-tgt' },
    ]);

    expect(mocks.wouldCreateCycleSpy).toHaveBeenCalledTimes(1);
    const cycleArgs = mocks.wouldCreateCycleSpy.mock.calls[0];
    expect(cycleArgs[2]).toEqual([
      { source: 'a-src', target: 'a-tgt' },
      { source: 'b-src', target: 'b-tgt' },
    ]);
  });
});

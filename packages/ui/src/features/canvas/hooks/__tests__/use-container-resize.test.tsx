/**
 * rf-canv-25a — useContainerResize hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Provider +
 * capture-ref harness from rf-canv-20/21/22/23/24 — render
 * `<Provider><Probe /></Provider>` with `renderToString`, capture the
 * hook's return value into a ref, then invoke the callbacks and assert
 * against `vi.spyOn(store, 'dispatch')`.
 *
 * No `useEffect` or timer machinery is required — `useContainerResize`
 * exposes only `useCallback`s. The rf-canv-4 `recalculateAncestorBounds`
 * util is mocked at module scope so the ancestor-walk dispatch shape is
 * verifiable independently of the real walk's implementation.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  recalculateAncestorBoundsSpy: vi.fn(),
}));

// Mock the rf-canv-4 util so we can drive the ancestor-walk return shape.
vi.mock('../../utils/container-bounds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/container-bounds')>();
  return {
    ...actual,
    recalculateAncestorBounds: mocks.recalculateAncestorBoundsSpy,
  };
});

// Import AFTER the mock is registered so the hook closes over the spy.
import {
  useContainerResize,
  type UseContainerResizeResult,
} from '../use-container-resize';
import type { CanvasNode } from '../../components/types';
import {
  MIN_CONTAINER_WIDTH,
  MIN_CONTAINER_HEIGHT,
} from '../../../../config/canvas-constants';
import { CONTAINER_PAD } from '../../utils/container-bounds';

// ─── Store builder ──────────────────────────────────────────────────────────
// The hook DISPATCHES `resizeCardNode` and `updateCardNodePosition` into
// `cards-slice`. It never reads from Redux state, so a minimal stub
// reducer is enough — assertions are made via `vi.spyOn(store, 'dispatch')`
// against the action shape.

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

// ─── Probe ──────────────────────────────────────────────────────────────────

const captureHook = (
  store: TestStore,
  visibleNodes: CanvasNode[],
): UseContainerResizeResult => {
  const captured: { current?: UseContainerResizeResult } = {};
  const Probe: React.FC = () => {
    captured.current = useContainerResize({ visibleNodes });
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

const mkNode = (overrides: Partial<CanvasNode> = {}): CanvasNode =>
  ({
    id: overrides.id ?? 'n1',
    type: overrides.type ?? 'block',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 60,
    label: overrides.label ?? overrides.id ?? 'n1',
    data: overrides.data ?? {},
    parentId: overrides.parentId ?? null,
    ...overrides,
  } as CanvasNode);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: ancestor walk returns no updates (most tests).
  mocks.recalculateAncestorBoundsSpy.mockReturnValue([]);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useContainerResize — return shape', () => {
  it('exposes recalculateAncestorBounds, calculateMinimumContainerSize, handleNodeResize as functions', () => {
    const store = makeStore();
    const result = captureHook(store, []);
    expect(typeof result.recalculateAncestorBounds).toBe('function');
    expect(typeof result.calculateMinimumContainerSize).toBe('function');
    expect(typeof result.handleNodeResize).toBe('function');
  });
});

describe('useContainerResize — calculateMinimumContainerSize', () => {
  it('returns MIN_CONTAINER_WIDTH/HEIGHT for a node with no children', () => {
    const store = makeStore();
    const visibleNodes = [mkNode({ id: 'parent', x: 100, y: 100, width: 400, height: 300 })];
    const result = captureHook(store, visibleNodes);

    const min = result.calculateMinimumContainerSize('parent');
    expect(min).toEqual({ minWidth: MIN_CONTAINER_WIDTH, minHeight: MIN_CONTAINER_HEIGHT });
  });

  it('with one child → returns the child bounding box + CONTAINER_PAD, clamped to MIN', () => {
    const store = makeStore();
    // Parent at (100,100). Child at absolute (150,180), 200x120.
    // Relative right = (150-100) + 200 = 250; relative bottom = (180-100) + 120 = 200.
    // Expected min = max(MIN, 250 + PAD), max(MIN, 200 + PAD)
    const visibleNodes = [
      mkNode({ id: 'parent', x: 100, y: 100, width: 400, height: 300 }),
      mkNode({ id: 'child', x: 150, y: 180, width: 200, height: 120, parentId: 'parent' }),
    ];
    const result = captureHook(store, visibleNodes);

    const min = result.calculateMinimumContainerSize('parent');
    expect(min.minWidth).toBe(Math.max(MIN_CONTAINER_WIDTH, 250 + CONTAINER_PAD));
    expect(min.minHeight).toBe(Math.max(MIN_CONTAINER_HEIGHT, 200 + CONTAINER_PAD));
  });

  it('with one tiny child → clamps to MIN floors', () => {
    const store = makeStore();
    // Tiny child fully inside parent so relative bounds are below MIN.
    const visibleNodes = [
      mkNode({ id: 'parent', x: 0, y: 0, width: 1000, height: 1000 }),
      mkNode({ id: 'tiny', x: 5, y: 5, width: 10, height: 10, parentId: 'parent' }),
    ];
    const result = captureHook(store, visibleNodes);

    const min = result.calculateMinimumContainerSize('parent');
    // 5+10 = 15, plus PAD ≈ small → still under MIN floor.
    expect(min.minWidth).toBe(MIN_CONTAINER_WIDTH);
    expect(min.minHeight).toBe(MIN_CONTAINER_HEIGHT);
  });

  it('with multiple children → returns the union (max-right, max-bottom) bounding box', () => {
    const store = makeStore();
    // Parent at (0,0). Three children whose union extends from (10,20) to (310,180).
    const visibleNodes = [
      mkNode({ id: 'p', x: 0, y: 0, width: 100, height: 60 }),
      mkNode({ id: 'a', x: 10, y: 20, width: 200, height: 100, parentId: 'p' }),
      mkNode({ id: 'b', x: 110, y: 80, width: 200, height: 100, parentId: 'p' }), // right edge = 310
      mkNode({ id: 'c', x: 30, y: 130, width: 50, height: 50, parentId: 'p' }), // bottom = 180
    ];
    const result = captureHook(store, visibleNodes);

    const min = result.calculateMinimumContainerSize('p');
    expect(min.minWidth).toBe(Math.max(MIN_CONTAINER_WIDTH, 310 + CONTAINER_PAD));
    expect(min.minHeight).toBe(Math.max(MIN_CONTAINER_HEIGHT, 180 + CONTAINER_PAD));
  });

  it('children positions are converted from absolute to relative (parent offset subtracted)', () => {
    const store = makeStore();
    // Parent at (500, 500), single child at absolute (700, 700) of size 100x100.
    // Relative right = (700-500) + 100 = 300. Relative bottom = same = 300.
    const visibleNodes = [
      mkNode({ id: 'p', x: 500, y: 500, width: 100, height: 60 }),
      mkNode({ id: 'c', x: 700, y: 700, width: 100, height: 100, parentId: 'p' }),
    ];
    const result = captureHook(store, visibleNodes);

    const min = result.calculateMinimumContainerSize('p');
    expect(min.minWidth).toBe(Math.max(MIN_CONTAINER_WIDTH, 300 + CONTAINER_PAD));
    expect(min.minHeight).toBe(Math.max(MIN_CONTAINER_HEIGHT, 300 + CONTAINER_PAD));
  });

  it('returns MIN floors when nodeId is not in visibleNodes', () => {
    const store = makeStore();
    const result = captureHook(store, [mkNode({ id: 'a' })]);

    const min = result.calculateMinimumContainerSize('does-not-exist');
    expect(min).toEqual({ minWidth: MIN_CONTAINER_WIDTH, minHeight: MIN_CONTAINER_HEIGHT });
  });
});

describe('useContainerResize — handleNodeResize clamps + dispatch shape', () => {
  it('clamps via calculateMinimumContainerSize — resize below min snaps to min', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    // Parent at origin, child at (10, 10) of size 200x150 → relative right=210, bottom=160.
    // Expected min = max(MIN, 210 + PAD) / max(MIN, 160 + PAD).
    const visibleNodes = [
      mkNode({ id: 'parent', x: 0, y: 0, width: 400, height: 300 }),
      mkNode({ id: 'child', x: 10, y: 10, width: 200, height: 150, parentId: 'parent' }),
    ];
    const result = captureHook(store, visibleNodes);
    dispatchSpy.mockClear();

    const expectedMinW = Math.max(MIN_CONTAINER_WIDTH, 210 + CONTAINER_PAD);
    const expectedMinH = Math.max(MIN_CONTAINER_HEIGHT, 160 + CONTAINER_PAD);

    // Caller asks for 50x50 (way below min) — must snap to expectedMinW/H.
    result.handleNodeResize('parent', 50, 50);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: { id: string; width: number; height: number } };
    expect(action.type).toBe('cards/resizeCardNode');
    expect(action.payload).toEqual({ id: 'parent', width: expectedMinW, height: expectedMinH });
  });

  it('dispatches resizeCardNode with constrained dimensions when above min', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [mkNode({ id: 'lone', x: 0, y: 0, width: 100, height: 100 })];
    const result = captureHook(store, visibleNodes);
    dispatchSpy.mockClear();

    // Above-min request — should pass through unchanged.
    result.handleNodeResize('lone', 800, 600);

    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: { id: string; width: number; height: number } };
    expect(action.type).toBe('cards/resizeCardNode');
    expect(action.payload).toEqual({ id: 'lone', width: 800, height: 600 });
  });

  it('builds nodeStates with the resized node\'s pending state and forwards it to recalculateAncestorBounds', () => {
    const store = makeStore();
    const visibleNodes = [
      mkNode({ id: 'lone', x: 42, y: 24, width: 100, height: 100 }),
    ];
    const result = captureHook(store, visibleNodes);
    mocks.recalculateAncestorBoundsSpy.mockClear();

    result.handleNodeResize('lone', 500, 400);

    expect(mocks.recalculateAncestorBoundsSpy).toHaveBeenCalledTimes(1);
    const [, startId, nodeStates] = mocks.recalculateAncestorBoundsSpy.mock.calls[0];
    expect(startId).toBe('lone');
    expect(nodeStates).toBeInstanceOf(Map);
    expect(nodeStates.get('lone')).toEqual({ x: 42, y: 24, width: 500, height: 400 });
  });

  it('dispatches updateCardNodePosition + resizeCardNode for each ancestor update', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'leaf', x: 0, y: 0, width: 100, height: 100, parentId: 'parent' }),
      mkNode({ id: 'parent', x: -5, y: -5, width: 200, height: 200 }),
    ];
    // Walk returns one ancestor with both position + size updates.
    mocks.recalculateAncestorBoundsSpy.mockReturnValue([
      {
        id: 'parent',
        position: { x: -10, y: -20 },
        size: { width: 600, height: 500 },
      },
    ]);

    const result = captureHook(store, visibleNodes);
    dispatchSpy.mockClear();

    result.handleNodeResize('leaf', 400, 400);

    // Calls (in order):
    //  1. resizeCardNode(leaf)
    //  2. updateCardNodePosition(parent)
    //  3. resizeCardNode(parent)
    expect(dispatchSpy).toHaveBeenCalledTimes(3);
    const a1 = dispatchSpy.mock.calls[0][0] as { type: string };
    const a2 = dispatchSpy.mock.calls[1][0] as { type: string; payload: { nodeId: string; x: number; y: number } };
    const a3 = dispatchSpy.mock.calls[2][0] as { type: string; payload: { id: string; width: number; height: number } };

    expect(a1.type).toBe('cards/resizeCardNode');
    expect(a2.type).toBe('cards/updateCardNodePosition');
    expect(a2.payload).toEqual({ nodeId: 'parent', x: -10, y: -20 });
    expect(a3.type).toBe('cards/resizeCardNode');
    expect(a3.payload).toEqual({ id: 'parent', width: 600, height: 500 });
  });

  it('skips position dispatch when ancestor update has only size, and vice versa', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'leaf', x: 0, y: 0, width: 50, height: 50, parentId: 'p' }),
      mkNode({ id: 'p', x: 0, y: 0, width: 100, height: 100 }),
      mkNode({ id: 'gp', x: 0, y: 0, width: 200, height: 200 }),
    ];
    // First ancestor only resized, second only repositioned.
    mocks.recalculateAncestorBoundsSpy.mockReturnValue([
      { id: 'p', size: { width: 300, height: 300 } },
      { id: 'gp', position: { x: 99, y: 88 } },
    ]);
    const result = captureHook(store, visibleNodes);
    dispatchSpy.mockClear();

    result.handleNodeResize('leaf', 75, 75);

    // Calls: resize(leaf), resize(p), updatePos(gp). 3 total.
    expect(dispatchSpy).toHaveBeenCalledTimes(3);
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual([
      'cards/resizeCardNode',
      'cards/resizeCardNode',
      'cards/updateCardNodePosition',
    ]);
  });

  it('is a no-op for an unknown node id (no dispatches, no ancestor walk)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store, [mkNode({ id: 'a' })]);
    dispatchSpy.mockClear();
    mocks.recalculateAncestorBoundsSpy.mockClear();

    result.handleNodeResize('does-not-exist', 1000, 1000);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mocks.recalculateAncestorBoundsSpy).not.toHaveBeenCalled();
  });
});

describe('useContainerResize — recalculateAncestorBounds thin wrapper', () => {
  it('forwards (visibleNodes, startId, nodeStates) verbatim to the rf-canv-4 util', () => {
    const store = makeStore();
    const visibleNodes = [
      mkNode({ id: 'a' }),
      mkNode({ id: 'b' }),
    ];
    const result = captureHook(store, visibleNodes);

    const expected = [{ id: 'b', size: { width: 50, height: 50 } }];
    mocks.recalculateAncestorBoundsSpy.mockReturnValue(expected);

    const states = new Map([
      ['a', { x: 1, y: 2, width: 3, height: 4 }],
    ]);
    const got = result.recalculateAncestorBounds('a', states);

    expect(got).toBe(expected);
    expect(mocks.recalculateAncestorBoundsSpy).toHaveBeenCalledTimes(1);
    const args = mocks.recalculateAncestorBoundsSpy.mock.calls[0];
    // [visibleNodes, startId, nodeStates]
    expect(args[0]).toBe(visibleNodes);
    expect(args[1]).toBe('a');
    expect(args[2]).toBe(states);
  });
});

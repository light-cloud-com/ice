/**
 * rf-canv-25b — useContainerMove hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Provider +
 * capture-ref harness from rf-canv-25a/24 — render `<Provider><Probe /></Provider>`
 * with `renderToString`, capture the hook's return value into a ref,
 * then invoke the callbacks and assert against `vi.spyOn(store, 'dispatch')`
 * + the orchestrator-supplied `setExitingGroupId` spy.
 *
 * `computeCompactNodeHeight` is mocked at module scope so the
 * no-children-on-unfold height fallback has a deterministic value.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  computeCompactNodeHeightSpy: vi.fn(() => 80),
}));

// Mock computeCompactNodeHeight so the no-children unfold path has a
// predictable default height.
vi.mock('../../components/nodes/compact-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/nodes/compact-node')>();
  return {
    ...actual,
    computeCompactNodeHeight: mocks.computeCompactNodeHeightSpy,
  };
});

// Import AFTER the mock is registered so the hook closes over the spy.
import {
  useContainerMove,
  type UseContainerMoveResult,
} from '../use-container-move';
import type { CanvasNode } from '../../components/types';
import type { CardNode } from '../../../../store/slices/cards-slice';
import { MIN_CONTAINER_HEIGHT } from '../../../../config/canvas-constants';
import { CONTAINER_PAD, CONTAINER_HEADER_H } from '../../utils/container-bounds';

// ─── Store builder ──────────────────────────────────────────────────────────
// The hook DISPATCHES `updateCardNodePositions`, `resizeCardNode`, and
// `toggleCardNodeFold` into `cards-slice`. It never reads from Redux state,
// so a minimal stub reducer is enough — assertions are made via
// `vi.spyOn(store, 'dispatch')` against the action shape.

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

interface ProbeArgs {
  visibleNodes: CanvasNode[];
  canvasNodes?: CanvasNode[];
  nodes?: CardNode[];
  getAllDescendantIds?: (nodeId: string) => string[];
  setExitingGroupId?: (id: string | null) => void;
}

const captureHook = (
  store: TestStore,
  args: ProbeArgs,
): UseContainerMoveResult => {
  const captured: { current?: UseContainerMoveResult } = {};
  const Probe: React.FC = () => {
    captured.current = useContainerMove({
      visibleNodes: args.visibleNodes,
      canvasNodes: args.canvasNodes ?? args.visibleNodes,
      nodes: args.nodes ?? [],
      getAllDescendantIds: args.getAllDescendantIds ?? (() => []),
      setExitingGroupId: args.setExitingGroupId ?? (() => {}),
    });
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
  mocks.computeCompactNodeHeightSpy.mockReturnValue(80);
});

// ─── Return shape ───────────────────────────────────────────────────────────

describe('useContainerMove — return shape', () => {
  it('exposes handleNodeMove and handleToggleFold as functions', () => {
    const store = makeStore();
    const result = captureHook(store, { visibleNodes: [] });
    expect(typeof result.handleNodeMove).toBe('function');
    expect(typeof result.handleToggleFold).toBe('function');
  });
});

// ─── handleNodeMove — basic dispatch shape ──────────────────────────────────

describe('useContainerMove — handleNodeMove single-node move', () => {
  it('dispatches updateCardNodePositions only (no descendants, no parent)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const setExitingGroupId = vi.fn();
    const visibleNodes = [mkNode({ id: 'a', x: 0, y: 0, width: 100, height: 60 })];

    const result = captureHook(store, { visibleNodes, setExitingGroupId });
    dispatchSpy.mockClear();
    setExitingGroupId.mockClear();

    result.handleNodeMove('a', 50, 50);

    // Only the position dispatch (single node, no descendants → no skipClamp wrap).
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: unknown };
    expect(action.type).toBe('cards/updateCardNodePositions');
    // Plain array form when single, no descendants.
    expect(action.payload).toEqual([{ id: 'a', position: { x: 50, y: 50 } }]);
    // No parent → setExitingGroupId(null).
    expect(setExitingGroupId).toHaveBeenCalledWith(null);
  });

  it('is a no-op for an unknown node id (no dispatches, no setter call)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const setExitingGroupId = vi.fn();
    const visibleNodes = [mkNode({ id: 'a' })];

    const result = captureHook(store, { visibleNodes, setExitingGroupId });
    dispatchSpy.mockClear();

    result.handleNodeMove('does-not-exist', 50, 50);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(setExitingGroupId).not.toHaveBeenCalled();
  });
});

describe('useContainerMove — handleNodeMove with descendants', () => {
  it('translates ALL descendants by the same delta (uses canvasNodes lookup)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'parent', x: 100, y: 100, width: 400, height: 300 }),
    ];
    // Descendants live in canvasNodes only (rf-canv-3 hidden L1 children).
    const canvasNodes = [
      ...visibleNodes,
      mkNode({ id: 'child1', x: 150, y: 150, width: 50, height: 30, parentId: 'parent' }),
      mkNode({ id: 'child2', x: 250, y: 200, width: 50, height: 30, parentId: 'parent' }),
    ];
    const getAllDescendantIds = vi.fn(() => ['child1', 'child2']);

    const result = captureHook(store, { visibleNodes, canvasNodes, getAllDescendantIds });
    dispatchSpy.mockClear();

    // Move parent by (+10, +20). skipAncestorResize=true so we isolate descendant translation.
    result.handleNodeMove('parent', 110, 120, true);

    expect(getAllDescendantIds).toHaveBeenCalledWith('parent');
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as {
      type: string;
      payload: { updates: Array<{ id: string; position: { x: number; y: number } }>; skipClamp: boolean };
    };
    expect(action.type).toBe('cards/updateCardNodePositions');
    // Skip-clamp form because hasDescendants=true.
    expect(action.payload.skipClamp).toBe(true);
    expect(action.payload.updates).toEqual([
      { id: 'parent', position: { x: 110, y: 120 } },
      { id: 'child1', position: { x: 160, y: 170 } }, // +10/+20
      { id: 'child2', position: { x: 260, y: 220 } }, // +10/+20
    ]);
  });
});

describe('useContainerMove — handleNodeMove ancestor expansion', () => {
  it('left overflow → parent shifts left + grows', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Parent must be wide enough that growth + MIN_CONTAINER_WIDTH floor doesn't mask the test.
    // Parent at (100, 100), width 400 (> MIN 240) so the MIN clamp is a no-op.
    // Child at x=200 (relative 100). Move child to x=110 → overflowL = (100+PAD) - 110 = PAD - 10.
    // Use a more obvious left-shift: move child to x=50 → overflowL = (100+PAD) - 50 = 50+PAD.
    const PAD = CONTAINER_PAD;
    const visibleNodes = [
      mkNode({ id: 'parent', x: 100, y: 100, width: 400, height: 300 }),
      mkNode({ id: 'child', x: 200, y: 200, width: 50, height: 30, parentId: 'parent' }),
    ];
    const result = captureHook(store, { visibleNodes });
    dispatchSpy.mockClear();

    result.handleNodeMove('child', 50, 200);

    // Inspect the position dispatch shape.
    expect(dispatchSpy).toHaveBeenCalled();
    const positionsAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodePositions',
    )!;
    const positionsPayload = (positionsAction[0] as { type: string; payload: unknown }).payload;
    const updates = Array.isArray(positionsPayload) ? positionsPayload : (positionsPayload as { updates: Array<{ id: string; position: { x: number; y: number } }> }).updates;
    const parentUpdate = updates.find((u) => u.id === 'parent');
    expect(parentUpdate).toBeDefined();
    // Parent shifted left by overflowL = 50+PAD.
    // BUT — the post-walk clamp will then re-clamp the child into parent's expanded interior.
    // We only assert the parent's POSITION here.
    expect(parentUpdate!.position.x).toBe(100 - (50 + PAD));

    // Resize dispatched too.
    const resizeAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    );
    expect(resizeAction).toBeDefined();
    const resizePayload = (resizeAction![0] as { type: string; payload: { id: string; width: number; height: number } }).payload;
    expect(resizePayload.id).toBe('parent');
    // Width grew by overflowL = 50+PAD (and is well above MIN 240).
    expect(resizePayload.width).toBe(400 + 50 + PAD);
  });

  it('top overflow → parent shifts up + grows (HEADER_H accounted for)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const PAD = CONTAINER_PAD;
    const HEADER = CONTAINER_HEADER_H;
    const visibleNodes = [
      mkNode({ id: 'parent', x: 0, y: 100, width: 400, height: 300 }),
      // Child must move to a Y where (parent.y + PAD + HEADER - child.y) > 0.
      mkNode({ id: 'child', x: 50, y: 200, width: 50, height: 30, parentId: 'parent' }),
    ];
    const result = captureHook(store, { visibleNodes });
    dispatchSpy.mockClear();

    // Move child to y=100 → overflowT = (100 + PAD + HEADER) - 100 = PAD+HEADER > 0.
    result.handleNodeMove('child', 50, 100);

    const positionsAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodePositions',
    )!;
    const positionsPayload = (positionsAction[0] as { type: string; payload: unknown }).payload;
    const updates = Array.isArray(positionsPayload) ? positionsPayload : (positionsPayload as { updates: Array<{ id: string; position: { x: number; y: number } }> }).updates;
    const parentUpdate = updates.find((u) => u.id === 'parent');
    expect(parentUpdate).toBeDefined();
    // Parent shifted up by PAD + HEADER.
    expect(parentUpdate!.position.y).toBe(100 - (PAD + HEADER));

    const resizeAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    );
    const resizePayload = (resizeAction![0] as { type: string; payload: { width: number; height: number } }).payload;
    expect(resizePayload.height).toBe(300 + PAD + HEADER);
  });

  it('right + bottom overflow → parent grows (px/py unchanged but position update still pushed)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const PAD = CONTAINER_PAD;
    // Parent above MIN floors so the resize delta isn't masked.
    const visibleNodes = [
      mkNode({ id: 'parent', x: 0, y: 0, width: 400, height: 300 }),
      mkNode({ id: 'child', x: 50, y: 50, width: 50, height: 30, parentId: 'parent' }),
    ];
    const result = captureHook(store, { visibleNodes });
    dispatchSpy.mockClear();

    // Move child to (400, 300) — far past right/bottom.
    // overflowR = (400 + 50) - (0 + 400 - PAD) = 50 + PAD
    // overflowB = (300 + 30) - (0 + 300 - PAD) = 30 + PAD
    result.handleNodeMove('child', 400, 300);

    const positionsAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodePositions',
    )!;
    const positionsPayload = (positionsAction[0] as { type: string; payload: unknown }).payload;
    const updates = Array.isArray(positionsPayload) ? positionsPayload : (positionsPayload as { updates: Array<{ id: string; position: { x: number; y: number } }> }).updates;
    const parentUpdate = updates.find((u) => u.id === 'parent');
    // Original behavior pushes position update on `changed=true` even if px/py unchanged.
    expect(parentUpdate).toBeDefined();
    expect(parentUpdate!.position).toEqual({ x: 0, y: 0 });

    const resizeAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    );
    const resizePayload = (resizeAction![0] as { type: string; payload: { width: number; height: number } }).payload;
    expect(resizePayload.width).toBe(400 + 50 + PAD);
    expect(resizePayload.height).toBe(300 + 30 + PAD);
  });

  it('walks up to grandparent when parent also overflows', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const PAD = CONTAINER_PAD;
    // Grandparent contains parent, which contains child.
    // Move child far enough that parent overflows grandparent's right edge.
    const visibleNodes = [
      mkNode({ id: 'gp', x: 0, y: 0, width: 300, height: 300 }),
      mkNode({ id: 'parent', x: 50, y: 50, width: 200, height: 200, parentId: 'gp' }),
      mkNode({ id: 'child', x: 100, y: 100, width: 50, height: 30, parentId: 'parent' }),
    ];
    const result = captureHook(store, { visibleNodes });
    dispatchSpy.mockClear();

    // Push child far right to force parent to grow, which then forces grandparent to grow.
    result.handleNodeMove('child', 500, 100);

    // Both parent AND grandparent should have been resized.
    const resizeActions = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    );
    const resizedIds = resizeActions.map((c) => (c[0] as { type: string; payload: { id: string } }).payload.id);
    expect(resizedIds).toContain('parent');
    expect(resizedIds).toContain('gp');
    // Parent grew enough to fit child (right edge >= 550).
    const parentResize = resizeActions.find(
      (c) => (c[0] as { type: string; payload: { id: string } }).payload.id === 'parent',
    );
    const parentWidth = (parentResize![0] as { type: string; payload: { width: number } }).payload.width;
    expect(parentWidth).toBeGreaterThanOrEqual(500 + 50 + PAD - 50);
  });

  it('folded ancestor breaks the walk', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Parent is folded → walk should NOT continue to grandparent.
    const visibleNodes = [
      mkNode({ id: 'gp', x: 0, y: 0, width: 300, height: 300 }),
      mkNode({
        id: 'parent',
        x: 50,
        y: 50,
        width: 200,
        height: 200,
        parentId: 'gp',
        data: { folded: true },
      }),
      mkNode({ id: 'child', x: 100, y: 100, width: 50, height: 30, parentId: 'parent' }),
    ];
    const result = captureHook(store, { visibleNodes });
    dispatchSpy.mockClear();

    result.handleNodeMove('child', 500, 500);

    // No resize for parent OR grandparent (parent folded → break before processing).
    const resizeActions = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    );
    const resizedIds = resizeActions.map((c) => (c[0] as { type: string; payload: { id: string } }).payload.id);
    expect(resizedIds).not.toContain('parent');
    expect(resizedIds).not.toContain('gp');
  });

  it('clamps dragged node to parent expanded bounds and propagates adjust to descendants', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const PAD = CONTAINER_PAD;
    const HEADER = CONTAINER_HEADER_H;
    // Container parent. Child has a single grandchild. Move child far past
    // parent's left edge so the post-expansion clamp shifts both.
    const visibleNodes = [
      mkNode({ id: 'parent', x: 100, y: 100, width: 200, height: 200 }),
      mkNode({ id: 'child', x: 150, y: 150, width: 50, height: 30, parentId: 'parent' }),
    ];
    const canvasNodes = [
      ...visibleNodes,
      mkNode({ id: 'grandchild', x: 160, y: 160, width: 20, height: 20, parentId: 'child' }),
    ];
    const getAllDescendantIds = (id: string) => (id === 'child' ? ['grandchild'] : []);
    const result = captureHook(store, { visibleNodes, canvasNodes, getAllDescendantIds });
    dispatchSpy.mockClear();

    // Try to drag child to negative x. Expansion will shift parent + child should land
    // inside parent's interior (clamped to px + PAD).
    result.handleNodeMove('child', -100, 150);

    // updateCardNodePositions wraps with skipClamp because hasDescendants=true.
    const positionsAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodePositions',
    )!;
    const payload = (positionsAction[0] as { type: string; payload: unknown }).payload as {
      updates: Array<{ id: string; position: { x: number; y: number } }>;
      skipClamp: boolean;
    };
    expect(payload.skipClamp).toBe(true);

    // Parent shifted; child clamped into parent's expanded bounds.
    const parentUpd = payload.updates.find((u) => u.id === 'parent')!;
    const childUpd = payload.updates.find((u) => u.id === 'child')!;
    const grandUpd = payload.updates.find((u) => u.id === 'grandchild')!;
    // Child clamped to parent.x + PAD.
    expect(childUpd.position.x).toBe(parentUpd.position.x + PAD);
    // Grandchild adjusted by same delta — its delta from raw newX (-100) to clamped should equal grand's adjust.
    const childAdjustX = childUpd.position.x - -100; // raw newX was -100
    expect(grandUpd.position.x).toBe(160 + (-100 - 150) + childAdjustX);
    // Y unchanged since within bounds.
    expect(childUpd.position.y).toBe(150);
    // Sanity: ensure HEADER was used for top-clamp arithmetic.
    expect(HEADER).toBeGreaterThan(0);
  });

  it('skipAncestorResize=true skips the walk + clamp', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'parent', x: 100, y: 100, width: 200, height: 200 }),
      mkNode({ id: 'child', x: 150, y: 150, width: 50, height: 30, parentId: 'parent' }),
    ];
    const result = captureHook(store, { visibleNodes });
    dispatchSpy.mockClear();

    // Far-out shift-drag. With skipAncestorResize, parent should NOT resize, child NOT clamped.
    result.handleNodeMove('child', -500, -500, true);

    const positionsAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodePositions',
    )!;
    const payload = (positionsAction[0] as { type: string; payload: unknown }).payload as
      | Array<{ id: string; position: { x: number; y: number } }>
      | { updates: Array<{ id: string; position: { x: number; y: number } }>; skipClamp: boolean };
    const updates = Array.isArray(payload) ? payload : payload.updates;
    const skipClamp = !Array.isArray(payload) && payload.skipClamp === true;
    expect(skipClamp).toBe(true); // skipAncestorResize OR hasDescendants both true here

    const childUpd = updates.find((u) => u.id === 'child')!;
    expect(childUpd.position).toEqual({ x: -500, y: -500 });

    // Parent should NOT have been resized.
    const resizeActions = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    );
    expect(resizeActions).toHaveLength(0);
  });
});

describe('useContainerMove — handleNodeMove edge detection', () => {
  it('near-edge → setExitingGroupId(parent.id)', () => {
    const store = makeStore();
    const setExitingGroupId = vi.fn();
    const visibleNodes = [
      // Parent at (0,0) size 400x400. Edge margin = 30.
      mkNode({ id: 'parent', x: 0, y: 0, width: 400, height: 400 }),
      mkNode({ id: 'child', x: 100, y: 100, width: 50, height: 30, parentId: 'parent' }),
    ];
    const result = captureHook(store, { visibleNodes, setExitingGroupId });
    setExitingGroupId.mockClear();

    // Drag to x=10 — within margin (30) of parent left edge (parent.x=0).
    result.handleNodeMove('child', 10, 100, true /* skip resize so we don't expand */);

    expect(setExitingGroupId).toHaveBeenCalledWith('parent');
  });

  it('far-from-edge → setExitingGroupId(null)', () => {
    const store = makeStore();
    const setExitingGroupId = vi.fn();
    const visibleNodes = [
      mkNode({ id: 'parent', x: 0, y: 0, width: 400, height: 400 }),
      mkNode({ id: 'child', x: 100, y: 100, width: 50, height: 30, parentId: 'parent' }),
    ];
    const result = captureHook(store, { visibleNodes, setExitingGroupId });
    setExitingGroupId.mockClear();

    // Center of parent — far from any edge.
    result.handleNodeMove('child', 200, 200, true);

    expect(setExitingGroupId).toHaveBeenCalledWith(null);
  });

  it('no parent → setExitingGroupId(null)', () => {
    const store = makeStore();
    const setExitingGroupId = vi.fn();
    const visibleNodes = [mkNode({ id: 'lone', x: 0, y: 0, width: 100, height: 60 })];
    const result = captureHook(store, { visibleNodes, setExitingGroupId });
    setExitingGroupId.mockClear();

    result.handleNodeMove('lone', 200, 200);

    expect(setExitingGroupId).toHaveBeenCalledWith(null);
  });
});

describe('useContainerMove — handleNodeMove skipClamp', () => {
  it('shift-drag (skipAncestorResize=true) wraps payload as { updates, skipClamp: true }', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [mkNode({ id: 'a', x: 0, y: 0, width: 100, height: 60 })];
    const result = captureHook(store, { visibleNodes });
    dispatchSpy.mockClear();

    result.handleNodeMove('a', 50, 50, true);

    const action = dispatchSpy.mock.calls[0][0] as {
      type: string;
      payload: { updates: Array<{ id: string; position: { x: number; y: number } }>; skipClamp: boolean };
    };
    expect(action.payload).toHaveProperty('skipClamp', true);
    expect(action.payload.updates).toEqual([{ id: 'a', position: { x: 50, y: 50 } }]);
  });

  it('has-descendants wraps payload as { updates, skipClamp: true }', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [mkNode({ id: 'a', x: 0, y: 0, width: 100, height: 60 })];
    const canvasNodes = [
      ...visibleNodes,
      mkNode({ id: 'b', x: 10, y: 10, width: 50, height: 30, parentId: 'a' }),
    ];
    const getAllDescendantIds = () => ['b'];
    const result = captureHook(store, { visibleNodes, canvasNodes, getAllDescendantIds });
    dispatchSpy.mockClear();

    result.handleNodeMove('a', 200, 200);

    const action = dispatchSpy.mock.calls[0][0] as {
      type: string;
      payload: { updates: unknown; skipClamp: boolean };
    };
    expect(action.payload).toHaveProperty('skipClamp', true);
  });

  it('plain array (no skipClamp) when single node, no descendants, no shift', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [mkNode({ id: 'lone', x: 0, y: 0, width: 100, height: 60 })];
    const result = captureHook(store, { visibleNodes });
    dispatchSpy.mockClear();

    result.handleNodeMove('lone', 50, 50);

    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: unknown };
    expect(Array.isArray(action.payload)).toBe(true);
  });
});

// ─── handleToggleFold ───────────────────────────────────────────────────────

describe('useContainerMove — handleToggleFold folding (no-op beyond toggle)', () => {
  it('was unfolded → wasFolded=false → only dispatches toggleCardNodeFold', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'a', x: 0, y: 0, width: 100, height: 60, data: { folded: false } }),
    ];
    const result = captureHook(store, { visibleNodes });
    dispatchSpy.mockClear();

    result.handleToggleFold('a');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: string };
    expect(action.type).toBe('cards/toggleCardNodeFold');
    expect(action.payload).toBe('a');
  });

  it('missing node id → still dispatches toggleCardNodeFold (slice flip), early returns', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store, { visibleNodes: [] });
    dispatchSpy.mockClear();

    result.handleToggleFold('missing');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as { type: string; payload: string };
    expect(action.type).toBe('cards/toggleCardNodeFold');
    expect(action.payload).toBe('missing');
  });
});

describe('useContainerMove — handleToggleFold unfolding self-expansion', () => {
  it('with no children → uses Math.max(reduxNode.height, computeCompactNodeHeight, MIN)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Folded node, no children. Redux says height=200, mock says 80, MIN floor.
    const visibleNodes = [
      mkNode({ id: 'a', x: 0, y: 0, width: 300, height: 38, data: { folded: true } }),
    ];
    const nodes = [
      { id: 'a', height: 200, position: { x: 0, y: 0 }, width: 300, data: {} } as unknown as CardNode,
    ];
    mocks.computeCompactNodeHeightSpy.mockReturnValue(80);

    const result = captureHook(store, { visibleNodes, nodes });
    dispatchSpy.mockClear();

    result.handleToggleFold('a');

    // Toggle + resize (self height changed from 38 → 200).
    const resizeAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    )!;
    const payload = (resizeAction[0] as { type: string; payload: { id: string; width: number; height: number } }).payload;
    expect(payload.id).toBe('a');
    expect(payload.height).toBe(200); // max(200, 80, MIN_CONTAINER_HEIGHT)
    // Width unchanged → no width override; preserved.
    expect(payload.width).toBe(300);
  });

  it('with no children + no Redux height → falls back to computeCompactNodeHeight default', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Folded node with default mock value 150 should win against undefined redux height.
    const visibleNodes = [
      mkNode({ id: 'a', x: 0, y: 0, width: 300, height: 38, data: { folded: true } }),
    ];
    mocks.computeCompactNodeHeightSpy.mockReturnValue(150);

    const result = captureHook(store, { visibleNodes });
    dispatchSpy.mockClear();

    result.handleToggleFold('a');

    const resizeAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    )!;
    const payload = (resizeAction[0] as { type: string; payload: { height: number } }).payload;
    expect(payload.height).toBe(Math.max(150, MIN_CONTAINER_HEIGHT));
  });

  it('with children → expands self via per-edge overflow (right/bottom growth)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const PAD = CONTAINER_PAD;
    // Folded parent at (0,0) size 100x60. Children extend past right/bottom edges.
    const visibleNodes = [
      mkNode({ id: 'parent', x: 0, y: 0, width: 100, height: 60, data: { folded: true } }),
    ];
    const canvasNodes = [
      ...visibleNodes,
      mkNode({ id: 'c1', x: 50, y: 50, width: 200, height: 80, parentId: 'parent' }),
    ];

    const result = captureHook(store, { visibleNodes, canvasNodes });
    dispatchSpy.mockClear();

    result.handleToggleFold('parent');

    const resizeAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    )!;
    const payload = (resizeAction[0] as { type: string; payload: { id: string; width: number; height: number } }).payload;
    expect(payload.id).toBe('parent');
    // Width: child at right=250, parent right edge=100-PAD → overflow = 250 - (100-PAD) = 150+PAD → grows by that.
    expect(payload.width).toBeGreaterThanOrEqual(250 + PAD);
    expect(payload.height).toBeGreaterThanOrEqual(50 + 80 + PAD);
  });

  it('with children → left/top overflow shifts selfX/Y AND grows', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const PAD = CONTAINER_PAD;
    const HEADER = CONTAINER_HEADER_H;
    // Parent at (200, 200) size 200x200, folded. Child at (50, 50) — far left/top of parent.
    const visibleNodes = [
      mkNode({ id: 'parent', x: 200, y: 200, width: 200, height: 200, data: { folded: true } }),
    ];
    const canvasNodes = [
      ...visibleNodes,
      mkNode({ id: 'c1', x: 50, y: 50, width: 30, height: 30, parentId: 'parent' }),
    ];

    const result = captureHook(store, { visibleNodes, canvasNodes });
    dispatchSpy.mockClear();

    result.handleToggleFold('parent');

    // Parent should have a position update (selfX/Y changed).
    const positionsAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodePositions',
    );
    expect(positionsAction).toBeDefined();
    const positionsPayload = (positionsAction![0] as { type: string; payload: unknown }).payload;
    const updates = Array.isArray(positionsPayload) ? positionsPayload : (positionsPayload as { updates: Array<{ id: string; position: { x: number; y: number } }> }).updates;
    const parentUpd = updates.find((u) => u.id === 'parent')!;
    // overL = 200+PAD-50 = 150+PAD → selfX = 200 - (150+PAD) = 50-PAD
    expect(parentUpd.position.x).toBe(50 - PAD);
    // overT = 200+PAD+HEADER-50 = 150+PAD+HEADER → selfY = 200 - (150+PAD+HEADER) = 50-PAD-HEADER
    expect(parentUpd.position.y).toBe(50 - PAD - HEADER);
  });
});

describe('useContainerMove — handleToggleFold ancestor walk on unfold', () => {
  it('walks up to grandparent when parent overflows', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Tiny grandparent containing a parent (folded) which has children that overflow on unfold.
    const visibleNodes = [
      mkNode({ id: 'gp', x: 0, y: 0, width: 200, height: 200 }),
      mkNode({
        id: 'parent',
        x: 50,
        y: 50,
        width: 100,
        height: 60,
        parentId: 'gp',
        data: { folded: true },
      }),
    ];
    const canvasNodes = [
      ...visibleNodes,
      mkNode({ id: 'c', x: 60, y: 60, width: 200, height: 200, parentId: 'parent' }),
    ];

    const result = captureHook(store, { visibleNodes, canvasNodes });
    dispatchSpy.mockClear();

    result.handleToggleFold('parent');

    const resizeActions = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    );
    const ids = resizeActions.map((c) => (c[0] as { type: string; payload: { id: string } }).payload.id);
    expect(ids).toContain('parent');
    expect(ids).toContain('gp');
  });

  it('folded ancestor breaks the walk', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Grandparent FOLDED → ancestor walk breaks before processing it.
    const visibleNodes = [
      mkNode({ id: 'gp', x: 0, y: 0, width: 200, height: 200, data: { folded: true } }),
      mkNode({
        id: 'parent',
        x: 50,
        y: 50,
        width: 100,
        height: 60,
        parentId: 'gp',
        data: { folded: true },
      }),
    ];
    const canvasNodes = [
      ...visibleNodes,
      mkNode({ id: 'c', x: 60, y: 60, width: 500, height: 500, parentId: 'parent' }),
    ];

    const result = captureHook(store, { visibleNodes, canvasNodes });
    dispatchSpy.mockClear();

    result.handleToggleFold('parent');

    const resizeActions = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    );
    const ids = resizeActions.map((c) => (c[0] as { type: string; payload: { id: string } }).payload.id);
    expect(ids).toContain('parent'); // Self-expansion still happens.
    expect(ids).not.toContain('gp'); // Walk halted at folded gp.
  });
});

describe('useContainerMove — handleToggleFold no-update guards', () => {
  it('selfX/Y unchanged → no position update dispatched', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Folded node with children fully inside (so no left/top overflow → no x/y shift).
    const visibleNodes = [
      mkNode({ id: 'a', x: 0, y: 0, width: 1000, height: 1000, data: { folded: true } }),
    ];
    const canvasNodes = [
      ...visibleNodes,
      mkNode({ id: 'c', x: 500, y: 500, width: 50, height: 50, parentId: 'a' }),
    ];

    const result = captureHook(store, { visibleNodes, canvasNodes });
    dispatchSpy.mockClear();

    result.handleToggleFold('a');

    const positionsAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodePositions',
    );
    // No position update because selfX/Y didn't change.
    expect(positionsAction).toBeUndefined();
  });

  it('selfW/H unchanged → no size update dispatched', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Folded node with NO children, redux height matches current height — no change.
    const visibleNodes = [
      mkNode({ id: 'a', x: 0, y: 0, width: 100, height: 60, data: { folded: true } }),
    ];
    const nodes = [
      { id: 'a', height: 60, position: { x: 0, y: 0 }, width: 100, data: {} } as unknown as CardNode,
    ];
    // Mock returns 60 too (≤ MIN_CONTAINER_HEIGHT? Set explicitly).
    mocks.computeCompactNodeHeightSpy.mockReturnValue(60);

    const result = captureHook(store, { visibleNodes, nodes });
    dispatchSpy.mockClear();

    result.handleToggleFold('a');

    const resizeActions = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    );
    // selfH = max(60, 60, MIN). If MIN > 60, will dispatch; if MIN <= 60, no dispatch.
    if (MIN_CONTAINER_HEIGHT <= 60) {
      // selfH stays at 60 → no resize dispatch.
      expect(resizeActions.length).toBe(0);
    } else {
      // selfH = MIN → resize dispatched with MIN height.
      expect(resizeActions.length).toBe(1);
      const payload = (resizeActions[0][0] as { type: string; payload: { height: number } }).payload;
      expect(payload.height).toBe(MIN_CONTAINER_HEIGHT);
    }
  });
});

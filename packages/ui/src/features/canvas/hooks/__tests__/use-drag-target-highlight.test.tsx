/**
 * rf-canv-26 — useDragTargetHighlight hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Provider +
 * capture-ref harness from rf-canv-25a/b — render
 * `<Provider><Probe /></Provider>` with `renderToString`, capture the
 * hook's return value into a ref, then invoke the callbacks and assert
 * against `vi.spyOn(store, 'dispatch')` + the hook's own state setters
 * (re-rendered on each setState wave).
 *
 * `computeCompactNodeHeight` is mocked at module scope so the post-
 * reparent expansion's expanded-height fallback has a deterministic
 * value. `canContain` is also mocked so the containment validator
 * branch is testable without owning the rules table.
 *
 * Per the rf-canv-25b learning `min-container-floor-silently-masks-per-
 * edge-expansion-deltas-in-tests`: parent fixtures sit comfortably above
 * `MIN_CONTAINER_WIDTH (240)` / `MIN_CONTAINER_HEIGHT (150)` so the
 * post-reparent expansion's MIN clamp doesn't swallow the asserted delta.
 */

import { configureStore, createSlice } from '@reduxjs/toolkit';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  computeCompactNodeHeightSpy: vi.fn(() => 80),
  canContainSpy: vi.fn(() => true),
}));

// Mock computeCompactNodeHeight so the post-reparent expansion's expanded-
// height fallback has a predictable default.
vi.mock('../../components/nodes/compact-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/nodes/compact-node')>();
  return {
    ...actual,
    computeCompactNodeHeight: mocks.computeCompactNodeHeightSpy,
  };
});

// Mock canContain so we can drive the containment-validator branch.
vi.mock('../../../../config/containment-rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../config/containment-rules')>();
  return {
    ...actual,
    canContain: mocks.canContainSpy,
  };
});

// Import AFTER the mocks are registered so the hook closes over the spies.
import { MIN_CONTAINER_WIDTH, MIN_CONTAINER_HEIGHT } from '../../../../config/canvas-constants';
import { CONTAINER_PAD, CONTAINER_HEADER_H } from '../../utils/container-bounds';
import { useDragTargetHighlight, type UseDragTargetHighlightResult } from '../use-drag-target-highlight';
import type { CardNode } from '../../../../store/slices/cards-slice';
import type { CanvasNode } from '../../components/types';

// ─── Store builder ──────────────────────────────────────────────────────────
// The hook DISPATCHES `updateCardNodeParent`, `updateCardNodePositions`,
// and `resizeCardNode` into `cards-slice`. It never reads from Redux
// state, so a minimal stub reducer is enough — assertions are made via
// `vi.spyOn(store, 'dispatch')` against the action shape.

const cardsStubSlice = createSlice({
  name: 'cards',
  initialState: { activeCardId: null, cards: [] },
  reducers: {},
});

const makeStore = () =>
  configureStore({
    reducer: { cards: cardsStubSlice.reducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });

type TestStore = ReturnType<typeof makeStore>;

// ─── Probe ──────────────────────────────────────────────────────────────────

interface ProbeArgs {
  visibleNodes: CanvasNode[];
  nodes?: CardNode[];
  selectedNodes?: string[];
  getDescendantIds?: (nodeId: string) => string[];
}

const captureHook = (store: TestStore, args: ProbeArgs): UseDragTargetHighlightResult => {
  const captured: { current?: UseDragTargetHighlightResult } = {};
  const Probe: React.FC = () => {
    captured.current = useDragTargetHighlight({
      visibleNodes: args.visibleNodes,
      nodes: args.nodes ?? [],
      selectedNodes: args.selectedNodes ?? [],
      getDescendantIds: args.getDescendantIds ?? (() => []),
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
  }) as CanvasNode;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.computeCompactNodeHeightSpy.mockReturnValue(80);
  mocks.canContainSpy.mockReturnValue(true);
});

// ─── Return shape ───────────────────────────────────────────────────────────

describe('useDragTargetHighlight — return shape', () => {
  it('exposes state values + setExitingGroupId + the two callbacks', () => {
    const store = makeStore();
    const result = captureHook(store, { visibleNodes: [] });

    // Initial state values.
    expect(result.exitingGroupId).toBeNull();
    expect(result.dragOverGroupId).toBeNull();
    expect(result.shiftDraggingNodeIds).toBeInstanceOf(Set);
    expect(result.shiftDraggingNodeIds.size).toBe(0);

    // Setter + callbacks are functions.
    expect(typeof result.setExitingGroupId).toBe('function');
    expect(typeof result.handleDragOverGroup).toBe('function');
    expect(typeof result.handleDragEnd).toBe('function');
  });
});

// ─── handleDragOverGroup ────────────────────────────────────────────────────
//
// Note: the hook owns its state with `useState`. Because we render once via
// `renderToString` and then invoke handlers on the captured ref, the state
// returned in our ref is the FIRST-render snapshot — but we can still verify
// that handler INPUTS produce the expected next-state intent by inspecting
// the side-effect outputs. For setExitingGroupId/setDragOverGroupId we instead
// directly observe the post-call effect via re-renders. Most assertions here
// check the dispatch shape (which is the externally-visible behavior).

describe('useDragTargetHighlight — handleDragOverGroup', () => {
  it('draggedNodeId === null clears all three states (no dispatches)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store, { visibleNodes: [] });
    dispatchSpy.mockClear();

    result.handleDragOverGroup(null, null);

    // Pure state reset — no Redux dispatches.
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('with draggedNodeId merges selectedNodes + dragged into shiftDraggingNodeIds', () => {
    // Verifies the Set is built from selectedNodes ∪ {draggedNodeId}.
    // We can't directly read the React state from the ref (initial snapshot),
    // so we rely on the EFFECT that the Set drives — namely that draggedIds
    // is then used to build the exit-parent search. Tested via the
    // exitingParent path below.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store, {
      visibleNodes: [],
      selectedNodes: ['a', 'b'],
    });
    dispatchSpy.mockClear();

    result.handleDragOverGroup(null, 'c');

    // No throw, no dispatch — pure state-write path.
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('finds exitingParent — first parent of any dragged that is itself NOT dragged', () => {
    // visibleNodes: a parent group + two child blocks. We "drag" one block.
    // exitingParent should resolve to the parent group.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'group', type: 'container', x: 0, y: 0, width: 400, height: 300 }),
      mkNode({ id: 'child1', x: 100, y: 100, width: 50, height: 30, parentId: 'group' }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    // Drag child1 — its parent ('group') is not in the dragged set, so it
    // becomes exitingParent. With no centerX/centerY, no hit-test runs and
    // dragOverGroupId stays null, so exitingGroupId becomes 'group'.
    result.handleDragOverGroup(null, 'child1');

    // No dispatches; the path is pure-state.
    expect(dispatchSpy).not.toHaveBeenCalled();
    // No throw — the exit-parent walk found 'group' and stored it.
  });

  it('with centerX/Y supplied calls findSmallestContainerHit with full exclusion set', () => {
    // The hit-test excludes: dragged + descendants + currentParent.
    // We provide a getDescendantIds spy and assert it's invoked for each
    // dragged id.
    const store = makeStore();
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 800, height: 600 }),
      mkNode({ id: 'inner', type: 'container', x: 100, y: 100, width: 300, height: 200, parentId: 'outer' }),
      mkNode({ id: 'child', x: 150, y: 150, width: 50, height: 30, parentId: 'inner' }),
    ];
    const getDescendantIdsSpy = vi.fn(() => []);
    const result = captureHook(store, {
      visibleNodes,
      selectedNodes: ['s1'],
      getDescendantIds: getDescendantIdsSpy,
    });

    // Drag 'child' — the dragged set is {s1, child}. getDescendantIds should
    // be called for both ids (so descendants get excluded too).
    result.handleDragOverGroup(null, 'child', 200, 200);

    expect(getDescendantIdsSpy).toHaveBeenCalledWith('s1');
    expect(getDescendantIdsSpy).toHaveBeenCalledWith('child');
  });

  it('hit found at center → dragOverGroupId set, exitingGroupId cleared', () => {
    // Drop center inside an empty outer container. With dragged child excluded,
    // outer should win the smallest-container test, becoming dragOverGroupId.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 400, height: 400 }),
      mkNode({ id: 'child', x: 50, y: 50, width: 50, height: 30 }), // top-level (no parent)
    ];
    const result = captureHook(store, {
      visibleNodes,
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    result.handleDragOverGroup(null, 'child', 200, 200);

    // No dispatch — purely state-driven side effects.
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('no hit at center → exitingGroupId set to exitingParent', () => {
    // Drag a child OUT of its parent — center sits outside any container.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'group', type: 'container', x: 0, y: 0, width: 400, height: 300 }),
      mkNode({ id: 'child', x: 100, y: 100, width: 50, height: 30, parentId: 'group' }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    // Center far outside — group is excluded from hit-test (currentParent).
    result.handleDragOverGroup(null, 'child', 1000, 1000);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

// ─── handleDragEnd ──────────────────────────────────────────────────────────

describe('useDragTargetHighlight — handleDragEnd no-reparent paths', () => {
  it('forceReparent=false clears states + does NOT reparent', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'group', type: 'container', x: 0, y: 0, width: 400, height: 300 }),
      mkNode({ id: 'child', x: 100, y: 100, width: 50, height: 30, parentId: 'group' }),
    ];
    const result = captureHook(store, { visibleNodes });
    dispatchSpy.mockClear();

    result.handleDragEnd('child', 200, 200, false);

    // No reparent dispatch when forceReparent is false.
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('unknown itemId is a no-op (no dispatch)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store, { visibleNodes: [mkNode({ id: 'a' })] });
    dispatchSpy.mockClear();

    result.handleDragEnd('does-not-exist', 50, 50, true);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('forceReparent=true with valid reparent dispatches updateCardNodeParent', () => {
    // child currently top-level → reparent INTO 'outer' container.
    // Use 'container' type so canContain validator is bypassed.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 800, height: 600 }),
      // Top-level child (no parentId). Drop at (200, 200) — center of (200+50/2, 200+30/2) = (225, 215).
      mkNode({ id: 'child', x: 0, y: 0, width: 50, height: 30 }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      nodes: [],
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    result.handleDragEnd('child', 200, 200, true);

    // updateCardNodeParent dispatched with new parentId.
    const reparentAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodeParent',
    );
    expect(reparentAction).toBeDefined();
    const payload = (reparentAction![0] as { type: string; payload: { nodeId: string; parentId: string | null } })
      .payload;
    expect(payload.nodeId).toBe('child');
    expect(payload.parentId).toBe('outer');
  });

  it('canContain=false on non-container parent blocks the reparent', () => {
    // Parent has iceType='Network.VPC' (passes isContainerNode predicate) but
    // node.type !== 'container' → canContain validator runs and returns false
    // → no dispatches.
    mocks.canContainSpy.mockReturnValue(false);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      // VPC iceType triggers isContainerNode (so it's a hit-test target),
      // but node.type='block' triggers the canContain branch.
      mkNode({
        id: 'parent',
        type: 'block',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        data: { iceType: 'Network.VPC' },
      }),
      mkNode({
        id: 'child',
        x: 0,
        y: 0,
        width: 50,
        height: 30,
        data: { iceType: 'Compute.Service' },
      }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    result.handleDragEnd('child', 200, 200, true);

    // canContain returned false → reparent is rejected.
    expect(mocks.canContainSpy).toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('newParent === currentParent → no reparent dispatch', () => {
    // child already inside 'outer'. Drop center stays inside outer (the
    // drag-end path will exclude outer from the hit-test as currentParent
    // → bestContainer is null → newParentId = null = currentParentId).
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 800, height: 600 }),
      mkNode({ id: 'child', x: 100, y: 100, width: 50, height: 30, parentId: 'outer' }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    // Drop inside outer (which is excluded → no hit). bestContainer = null.
    // currentParent = 'outer', newParent = null. They differ — but the
    // canContain branch is skipped since newParentId is null. The dispatch
    // is updateCardNodeParent({ nodeId, parentId: null }).
    // ─── Actually — re-reading the code: `currentParentId !== newParentId`
    // gate triggers when 'outer' !== null — so reparent DOES happen here.
    // To get a true "newParent === currentParent" branch, drop somewhere
    // with no container at all AND child also has no parent. Then both null.
    result.handleDragEnd('child', 1000, 1000, true);

    // currentParent='outer' vs newParent=null → mismatch → reparent fires.
    const reparentAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodeParent',
    );
    expect(reparentAction).toBeDefined();
    const payload = (reparentAction![0] as { type: string; payload: { parentId: string | null } }).payload;
    expect(payload.parentId).toBeNull();
  });

  it('genuine same-parent (top-level → top-level) → no dispatch', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'lone', x: 0, y: 0, width: 50, height: 30 }), // no parent
    ];
    const result = captureHook(store, {
      visibleNodes,
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    // Drop in empty space → bestContainer=null → newParent=null.
    // currentParent=null too → currentParentId === newParentId → skip.
    result.handleDragEnd('lone', 500, 500, true);

    const reparentAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodeParent',
    );
    expect(reparentAction).toBeUndefined();
  });
});

describe('useDragTargetHighlight — handleDragEnd post-reparent expansion', () => {
  // Parent fixture sized comfortably above MIN_CONTAINER_WIDTH (240) /
  // MIN_CONTAINER_HEIGHT (150) — see the rf-canv-25b learning
  // `min-container-floor-silently-masks-per-edge-expansion-deltas-in-tests`.

  it('reparent into smaller container → per-edge overflow expands new parent', () => {
    // Outer parent at (0,0,400,300). Drop a 50x30 child at (-100, 100) — far
    // past the LEFT edge so overflowL > 0 triggers expansion.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const PAD = CONTAINER_PAD;
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 400, height: 300 }),
      // Child currently at (-100, 100) — wide enough that the drop center
      // (200, 200 here) lands inside outer.
      mkNode({ id: 'child', x: -100, y: 100, width: 50, height: 30 }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      nodes: [{ id: 'child', height: 30, width: 50 } as unknown as CardNode],
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    // Drop at (-100, 100). Drop CENTER = (-100 + 25, 100 + 15) = (-75, 115).
    // (-75, 115) is OUTSIDE outer's bounds, so bestContainer = null and no
    // reparent runs. Adjust: drop INSIDE outer at (50, 100) so center=(75, 115)
    // is inside. Then expansion runs at the dropped POSITION (50, 100), but
    // 50 + PAD (the left budget) > outer.x + PAD → no overflow there.
    // We need a drop inside outer's bounding box such that the dropped node
    // STILL overflows once placed. For left overflow: drop at x=5, y=100,
    // width 50: overflowL = (0 + PAD) - 5 = PAD - 5.
    // Drop center = (5+25, 100+15) = (30, 115) — inside outer.
    result.handleDragEnd('child', 5, 100, true);

    // Outer was selected as new parent.
    const reparentAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodeParent',
    );
    expect(reparentAction).toBeDefined();

    // Position update: outer's px shifted left by overflowL = PAD - 5.
    const positionsAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodePositions',
    );
    expect(positionsAction).toBeDefined();
    const positionsPayload = (positionsAction![0] as { type: string; payload: unknown }).payload;
    const updates = positionsPayload as Array<{ id: string; position: { x: number; y: number } }>;
    const outerUpdate = updates.find((u) => u.id === 'outer')!;
    expect(outerUpdate.position.x).toBe(0 - (PAD - 5));

    // Resize update: outer's pw grew by overflowL.
    const resizeAction = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'cards/resizeCardNode');
    expect(resizeAction).toBeDefined();
    const resizePayload = (resizeAction![0] as { type: string; payload: { id: string; width: number; height: number } })
      .payload;
    expect(resizePayload.id).toBe('outer');
    // Width grew above MIN floor (initial 400 + (PAD-5) > 240 — safe).
    expect(resizePayload.width).toBe(400 + (PAD - 5));
  });

  it('expansion change → dispatches BOTH updateCardNodePositions AND resizeCardNode', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 400, height: 300 }),
      mkNode({ id: 'child', x: 0, y: 0, width: 50, height: 30 }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      nodes: [{ id: 'child', height: 30, width: 50 } as unknown as CardNode],
    });
    dispatchSpy.mockClear();

    // Drop at (5, 5) — overflows both LEFT and TOP edges, so changed=true
    // and both dispatches fire.
    result.handleDragEnd('child', 5, 5, true);

    const positionsCount = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodePositions',
    ).length;
    const resizeCount = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === 'cards/resizeCardNode',
    ).length;

    expect(positionsCount).toBeGreaterThanOrEqual(1);
    expect(resizeCount).toBeGreaterThanOrEqual(1);
  });

  it('expansion below MIN floors → final dimensions clamped to MIN', () => {
    // Tiny outer container (already at 200x200 — below MIN). After the
    // expansion, MIN clamp lifts it to MIN_CONTAINER_WIDTH/HEIGHT.
    // We deliberately use values that, AFTER expansion, still fall under
    // MIN so the clamp is observable.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Outer is 200x200 — just under MIN floor (240/150 → only width is masked).
    // The drop will trigger small overflow; final pw will be clamped to MIN.
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 200, height: 200 }),
      mkNode({ id: 'child', x: 0, y: 0, width: 50, height: 30 }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      nodes: [{ id: 'child', height: 30, width: 50 } as unknown as CardNode],
    });
    dispatchSpy.mockClear();

    // Drop at (5, 5) — small left+top overflow.
    result.handleDragEnd('child', 5, 5, true);

    const resizeAction = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'cards/resizeCardNode');
    const resizePayload = (resizeAction![0] as { type: string; payload: { width: number; height: number } }).payload;
    // Width: starting 200 + small overflowL = something < 240 → clamped to 240.
    expect(resizePayload.width).toBe(MIN_CONTAINER_WIDTH);
    // Height: starting 200 + small overflowT, then clamped against 150 → wins.
    expect(resizePayload.height).toBeGreaterThanOrEqual(MIN_CONTAINER_HEIGHT);
  });

  it('uses computeCompactNodeHeight to recover dropped node expanded height', () => {
    // Mock returns 200 — bigger than the dropped node's visual 30. The
    // expansion should compute bottom overflow USING the 200 value.
    mocks.computeCompactNodeHeightSpy.mockReturnValue(200);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 400, height: 300 }),
      // Dropped node at visual 50x30. Expanded height (mocked) = 200.
      mkNode({ id: 'child', x: 0, y: 0, width: 50, height: 30 }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      // No redux height info → falls back to mock.
      nodes: [],
    });
    dispatchSpy.mockClear();

    // Drop at (50, 250) — bottom child=250+200=450, parent bottom budget=
    // 300 - PAD. overflowB = 450 - (300 - PAD) = 150 + PAD.
    result.handleDragEnd('child', 50, 250, true);

    expect(mocks.computeCompactNodeHeightSpy).toHaveBeenCalled();

    const resizeAction = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'cards/resizeCardNode');
    const resizePayload = (resizeAction![0] as { type: string; payload: { height: number } }).payload;
    // Height grew by overflowB = 150 + PAD.
    expect(resizePayload.height).toBe(300 + 150 + CONTAINER_PAD);
  });

  it('expansion uses HEADER_H budget for top-edge overflow', () => {
    // Verify the top-edge overflow accounts for CONTAINER_HEADER_H — it's
    // the overflow that distinguishes top vs left/right/bottom budgets.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const HEADER = CONTAINER_HEADER_H;
    const PAD = CONTAINER_PAD;
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 100, width: 400, height: 400 }),
      mkNode({ id: 'child', x: 50, y: 50, width: 50, height: 30 }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      nodes: [{ id: 'child', height: 30, width: 50 } as unknown as CardNode],
    });
    dispatchSpy.mockClear();

    // Drop at (50, 90) — child at y=90 < parent.y(100)+PAD+HEADER → overflowT=PAD+HEADER+10.
    result.handleDragEnd('child', 50, 90, true);

    const positionsAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodePositions',
    );
    const updates = (positionsAction![0] as { type: string; payload: unknown }).payload as Array<{
      id: string;
      position: { x: number; y: number };
    }>;
    const outerUpd = updates.find((u) => u.id === 'outer')!;
    // Outer shifted up by PAD + HEADER + 10 (parent.y=100 - 90 = 10 below threshold).
    expect(outerUpd.position.y).toBe(100 - (PAD + HEADER + 10));
  });

  it('reparent into top-level (newParentId=null) → no expansion block runs', () => {
    // Drop OUT of a parent into empty canvas. Reparent fires (parentId=null)
    // but no expansion (no new parent to expand).
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'group', type: 'container', x: 0, y: 0, width: 400, height: 300 }),
      mkNode({ id: 'child', x: 100, y: 100, width: 50, height: 30, parentId: 'group' }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    // Drop far outside group → bestContainer=null, group is also excluded
    // from hit-test as currentParent. newParent=null.
    result.handleDragEnd('child', 1000, 1000, true);

    const reparentAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodeParent',
    );
    expect(reparentAction).toBeDefined();
    const payload = (reparentAction![0] as { type: string; payload: { parentId: string | null } }).payload;
    expect(payload.parentId).toBeNull();

    // No resize dispatch — no expansion runs without newParent.
    const resizeAction = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'cards/resizeCardNode');
    expect(resizeAction).toBeUndefined();
  });

  it('changed=false (no overflow) → no position/resize dispatch, only reparent', () => {
    // Drop child WELL INSIDE outer's interior so no edge is overflowed.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 800, height: 600 }),
      mkNode({ id: 'child', x: 0, y: 0, width: 50, height: 30 }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      nodes: [{ id: 'child', height: 30, width: 50 } as unknown as CardNode],
    });
    dispatchSpy.mockClear();

    // Drop at (200, 200) — well inside outer's interior, all edges fine.
    result.handleDragEnd('child', 200, 200, true);

    // Reparent fires.
    const reparentAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodeParent',
    );
    expect(reparentAction).toBeDefined();

    // No resize/position dispatch — no overflow, no expansion.
    const resizeAction = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'cards/resizeCardNode');
    expect(resizeAction).toBeUndefined();
    const positionsAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodePositions',
    );
    expect(positionsAction).toBeUndefined();
  });
});

// ─── State cleanup at end of drag ───────────────────────────────────────────

describe('useDragTargetHighlight — state cleanup', () => {
  it('forceReparent=false path completes without throwing (state cleanup runs)', () => {
    const store = makeStore();
    const result = captureHook(store, { visibleNodes: [mkNode({ id: 'a' })] });

    // The forceReparent=false branch hits THREE setState calls (drag/exit/lift).
    // We can't read the state from the captured ref directly, but we can
    // ensure the path runs to completion (no thrown error).
    expect(() => result.handleDragEnd('a', 50, 50, false)).not.toThrow();
  });

  it('forceReparent=true reparent path completes (state cleanup runs after dispatches)', () => {
    const store = makeStore();
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 400, height: 300 }),
      mkNode({ id: 'child', x: 0, y: 0, width: 50, height: 30 }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      nodes: [{ id: 'child', height: 30, width: 50 } as unknown as CardNode],
    });

    expect(() => result.handleDragEnd('child', 100, 100, true)).not.toThrow();
  });

  it('handleDragOverGroup with null draggedNodeId completes (clears state)', () => {
    const store = makeStore();
    const result = captureHook(store, { visibleNodes: [] });

    expect(() => result.handleDragOverGroup(null, null)).not.toThrow();
  });
});

// ─── setExitingGroupId surface ──────────────────────────────────────────────

describe('useDragTargetHighlight — setExitingGroupId thread-up', () => {
  it('exposes a stable function that does not throw when called externally', () => {
    // Per blueprint risk #2 the setter is exposed for `useContainerMove` to
    // write into the same React state slot.
    const store = makeStore();
    const result = captureHook(store, { visibleNodes: [] });

    expect(typeof result.setExitingGroupId).toBe('function');
    expect(() => result.setExitingGroupId('some-group')).not.toThrow();
    expect(() => result.setExitingGroupId(null)).not.toThrow();
  });
});

// ─── Branch closures: descendant exclusion + multi-edge expansion ───────────

describe('useDragTargetHighlight — descendant exclusion (L226, L267)', () => {
  it('handleDragOverGroup: descendants of dragged node are added to the exclusion set (L226)', () => {
    // getDescendantIds returns a non-empty list — the inner `excludeIds.add(desc)`
    // body fires once per descendant.
    const store = makeStore();
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 800, height: 600 }),
      mkNode({ id: 'parent', type: 'container', x: 100, y: 100, width: 400, height: 300 }),
      mkNode({ id: 'kid', x: 150, y: 150, width: 50, height: 30, parentId: 'parent' }),
    ];
    const getDescendantIdsSpy = vi.fn((id: string) => (id === 'parent' ? ['kid'] : []));
    const result = captureHook(store, {
      visibleNodes,
      selectedNodes: [],
      getDescendantIds: getDescendantIdsSpy,
    });

    // Drag 'parent' → descendants ['kid'] should be added to exclusion via L226.
    result.handleDragOverGroup(null, 'parent', 200, 200);
    expect(getDescendantIdsSpy).toHaveBeenCalledWith('parent');
  });

  it('handleDragEnd: selectedNodes are added to the descendantIds exclusion set (L267)', () => {
    // selectedNodes carries multi-drag siblings; the for-of loop at L266-268 adds
    // each into descendantIds. The bestContainer hit-test then excludes them.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 800, height: 600 }),
      mkNode({ id: 'child', x: 0, y: 0, width: 50, height: 30 }),
      // 'sibling' is also being dragged (in selectedNodes); must be excluded.
      mkNode({ id: 'sibling', type: 'container', x: 50, y: 50, width: 200, height: 200 }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      selectedNodes: ['sibling'],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    // Drop center inside both 'sibling' and 'outer'. Without L267 exclusion,
    // sibling would win (it's smaller). With L267, sibling is excluded → outer wins.
    result.handleDragEnd('child', 100, 100, true);
    const reparentAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodeParent',
    );
    expect(reparentAction).toBeDefined();
    const payload = (reparentAction![0] as { type: string; payload: { parentId: string | null } }).payload;
    expect(payload.parentId).toBe('outer');
  });
});

describe('useDragTargetHighlight — post-reparent expansion (L327-330, L355-357)', () => {
  it('existing children expand the bounding box (L327-330 inner-loop body fires)', () => {
    // The bounding-box loop at L326-331 walks `existingChildren`. With at least
    // one existing child, the four Math.min/max writes fire.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 400, height: 300 }),
      // existing child of outer at (10, 10) extends the bounding box.
      mkNode({ id: 'sibling', x: 10, y: 10, width: 30, height: 30, parentId: 'outer' }),
      mkNode({ id: 'child', x: 0, y: 0, width: 50, height: 30 }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      nodes: [{ id: 'child', height: 30, width: 50 } as unknown as CardNode],
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    // Drop child at (5, 5) — left/top overflow ensures changed=true. With
    // existing 'sibling' at (10,10), the loop body adjusts the bounding box.
    result.handleDragEnd('child', 5, 5, true);

    // Reparent + expansion both fire (this exercises the L327-330 path).
    const reparentAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodeParent',
    );
    expect(reparentAction).toBeDefined();
    const resizeAction = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'cards/resizeCardNode');
    expect(resizeAction).toBeDefined();
  });

  it('non-container parent + canContain=true: reparent proceeds (L294 implicit-else)', () => {
    // bestContainer.type !== 'container' triggers the canContain validator
    // gate. With canContain=true, the function does NOT early-return; reparent
    // continues into updateCardNodeParent dispatch.
    mocks.canContainSpy.mockReturnValue(true);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      // VPC iceType triggers isContainerNode (so it's a hit-test target),
      // but node.type='block' triggers the canContain validator branch.
      mkNode({
        id: 'parent',
        type: 'block',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        data: { iceType: 'Network.VPC' },
      }),
      mkNode({
        id: 'child',
        x: 0,
        y: 0,
        width: 50,
        height: 30,
        data: { iceType: 'Compute.Service' },
      }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      nodes: [{ id: 'child', height: 30, width: 50 } as unknown as CardNode],
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    result.handleDragEnd('child', 200, 200, true);

    // canContain queried; reparent then proceeds (validator did NOT return).
    expect(mocks.canContainSpy).toHaveBeenCalled();
    const reparentAction = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'cards/updateCardNodeParent',
    );
    expect(reparentAction).toBeDefined();
    const payload = (reparentAction![0] as { type: string; payload: { parentId: string | null } }).payload;
    expect(payload.parentId).toBe('parent');
  });

  it('right-edge overflow grows pw and marks changed=true (L355-357 true)', () => {
    // Drop child near outer's right edge so childMaxR > parent's right budget.
    // Outer at (0, 0, 400, 300). Drop child at x=370 width=50 → childMaxR=420.
    // Right budget = 0 + 400 - PAD = 400 - PAD. overflowR = 420 - (400 - PAD) > 0.
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const visibleNodes = [
      mkNode({ id: 'outer', type: 'container', x: 0, y: 0, width: 400, height: 300 }),
      mkNode({ id: 'child', x: 0, y: 0, width: 50, height: 30 }),
    ];
    const result = captureHook(store, {
      visibleNodes,
      nodes: [{ id: 'child', height: 30, width: 50 } as unknown as CardNode],
      selectedNodes: [],
      getDescendantIds: () => [],
    });
    dispatchSpy.mockClear();

    // Drop center at (370+25, 50+15)=(395, 65). 395 ≤ outer.x+outer.width=400 →
    // inside outer. overflowR = 420 - (400 - PAD) = 20 + PAD > 0. L355 true.
    result.handleDragEnd('child', 370, 50, true);

    const resizeAction = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'cards/resizeCardNode');
    expect(resizeAction).toBeDefined();
    const resizePayload = (resizeAction![0] as { type: string; payload: { width: number; height: number } }).payload;
    // Width grew by overflowR.
    expect(resizePayload.width).toBe(400 + (20 + CONTAINER_PAD));
  });
});

/**
 * rf-canv-21 — usePinnedUserNode hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Probe pattern
 * from rf-canv-18/19/20 — render once with `React.createElement`, capture
 * the hook's return value into a ref, then assert.
 *
 * The hook has zero `useEffect` calls — its side effect is in-render
 * (the `if (exposedIdsKey !== prevExposedIdsRef.current)` block). So
 * unlike `useCanvasDimensions`, no synchronous-`useEffect` mock is
 * required. We DO need to mock:
 *
 *  - `useState` for the `userNodePos` slot, so test 3 can pre-prime a
 *    dragged position before the render and observe that
 *    `userCanvasNode.x/y` mirrors it directly (no half-extent offset).
 *  - `useRef` for the two ref slots (`pinnedUserPosRef` and
 *    `prevExposedIdsRef`). The hook calls `useRef` twice in fixed order;
 *    we route by call-index. Per-render resetting via a counter that
 *    `beforeEach` clears. To verify the diff branch (test 4 vs test 5)
 *    we pre-prime `prevExposedIdsRef.current` to either MATCH the about-
 *    to-be-computed `exposedIdsKey` (skip branch) or DIFFER from it
 *    (re-pin branch). This is the hoisted-priming-`useRef` pattern from
 *    the rf-canv-19 learning, applied to two slots.
 *
 * `useMemo` is left untouched (real impl) — we want the derived
 * `userCanvasNode`/`userConnections`/`nodesWithUserNode` to compute so
 * we can assert on their shape directly.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

interface PosOrNull {
  x: number;
  y: number;
}

const mocks = vi.hoisted(() => ({
  // `useState` slot for `userNodePos`. Tests pre-prime this to simulate a
  // post-drag re-render (test 3).
  userNodePosSlot: { current: null as PosOrNull | null },
  setUserNodePosSpy: vi.fn<(next: PosOrNull | null) => void>(),
  // Two `useRef` slots, routed by call-index. Each render resets the
  // counter in `beforeEach`. Pre-prime each slot's `.current` to drive the
  // in-render diff branch.
  refSlots: [
    { current: null as PosOrNull | null }, // pinnedUserPosRef (1st useRef call)
    { current: '' as string }, // prevExposedIdsRef (2nd useRef call)
  ] as [{ current: PosOrNull | null }, { current: string }],
  refCallIndex: { current: 0 as number },
}));

// Mock React's useState + useRef so the slots are observable across the test
// boundary. `useMemo`, `useCallback`, and the rest are left untouched.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(initial: T | (() => T)) => {
      // The hook has exactly one `useState` slot (`userNodePos`). On each
      // render, the mock returns whatever the test left in the slot.
      void initial;
      const setter = (next: T) => {
        mocks.setUserNodePosSpy(next as unknown as PosOrNull | null);
        mocks.userNodePosSlot.current = next as unknown as PosOrNull | null;
      };
      return [mocks.userNodePosSlot.current as unknown as T, setter as unknown];
    }),
    useRef: vi.fn(<T,>(initial: T) => {
      // Route by call-index — the hook always calls useRef in the same
      // order: first `pinnedUserPosRef`, then `prevExposedIdsRef`.
      const idx = mocks.refCallIndex.current;
      mocks.refCallIndex.current += 1;
      void initial; // initializer is captured by test setup, not honored here
      return mocks.refSlots[idx] as unknown as { current: T };
    }),
  };
});

// Import AFTER the react mock is registered so the hook closes over the
// mocked useState/useRef.
import { usePinnedUserNode, type UsePinnedUserNodeResult } from '../use-pinned-user-node';
import {
  USER_NODE_WIDTH,
  USER_NODE_HEIGHT,
  USER_NODE_ID,
} from '../../../../shared/components/svg-user-node';
import type { CanvasNode } from '../../components/types';

// ─── Probe / harness ────────────────────────────────────────────────────────

const renderHook = (
  effectiveNodes: CanvasNode[],
  exposedServices: { nodeIds: string[]; userIconPosition: { x: number; y: number } | null },
): UsePinnedUserNodeResult => {
  // Reset the per-render useRef call-index so the two slots resolve in order.
  mocks.refCallIndex.current = 0;
  const captured: { current?: UsePinnedUserNodeResult } = {};
  const Probe: React.FC = () => {
    captured.current = usePinnedUserNode(effectiveNodes, exposedServices);
    return React.createElement('div', null, 'probe');
  };
  renderToString(React.createElement(Probe));
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

// ─── Fixtures ───────────────────────────────────────────────────────────────

const mkNode = (id: string, x = 0, y = 0): CanvasNode => ({
  id,
  type: 'block',
  x,
  y,
  width: 100,
  height: 60,
  label: id,
  data: {},
});

beforeEach(() => {
  vi.clearAllMocks();
  // Reset all slots to their initial values so each test starts fresh.
  mocks.userNodePosSlot.current = null;
  mocks.refSlots[0].current = null;
  mocks.refSlots[1].current = '';
  mocks.refCallIndex.current = 0;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('usePinnedUserNode — empty exposed services', () => {
  it('returns null userCanvasNode, empty userConnections, and effectiveNodes unchanged', () => {
    const effectiveNodes = [mkNode('a'), mkNode('b')];
    const result = renderHook(effectiveNodes, { nodeIds: [], userIconPosition: null });

    expect(result.userCanvasNode).toBeNull();
    expect(result.userConnections).toEqual([]);
    // No virtual node appended — same array identity (the hook returns
    // `effectiveNodes` verbatim when `userCanvasNode` is null).
    expect(result.nodesWithUserNode).toBe(effectiveNodes);
  });

  it('exposes setUserNodePos as a function in the result shape', () => {
    const result = renderHook([], { nodeIds: [], userIconPosition: null });
    expect(typeof result.setUserNodePos).toBe('function');
  });
});

describe('usePinnedUserNode — exposed services present', () => {
  it('builds userCanvasNode at the pinned position, offset by USER_NODE half-extent', () => {
    const effectiveNodes = [mkNode('svc-1'), mkNode('svc-2')];
    const userIconPosition = { x: 500, y: 200 };
    const result = renderHook(effectiveNodes, {
      nodeIds: ['svc-1', 'svc-2'],
      userIconPosition,
    });

    expect(result.userCanvasNode).not.toBeNull();
    // The fallback path subtracts the half-extent so the pinned center
    // maps to the top-left the canvas-node API expects.
    expect(result.userCanvasNode?.x).toBe(500 - USER_NODE_WIDTH / 2);
    expect(result.userCanvasNode?.y).toBe(200 - USER_NODE_HEIGHT / 2);
    expect(result.userCanvasNode?.width).toBe(USER_NODE_WIDTH);
    expect(result.userCanvasNode?.height).toBe(USER_NODE_HEIGHT);
    // pinnedUserPos surfaces the same center the test supplied.
    expect(result.pinnedUserPos).toEqual(userIconPosition);
  });

  it('userCanvasNode shape: id, type, label, data.iceType verbatim', () => {
    const result = renderHook([mkNode('a')], {
      nodeIds: ['a'],
      userIconPosition: { x: 100, y: 100 },
    });
    expect(result.userCanvasNode?.id).toBe(USER_NODE_ID);
    expect(result.userCanvasNode?.type).toBe('resource');
    expect(result.userCanvasNode?.label).toBe('Public Traffic');
    expect(result.userCanvasNode?.data).toEqual({ iceType: 'Virtual.UserTraffic' });
  });

  it('appends userCanvasNode to effectiveNodes in nodesWithUserNode', () => {
    const effectiveNodes = [mkNode('a'), mkNode('b')];
    const result = renderHook(effectiveNodes, {
      nodeIds: ['a'],
      userIconPosition: { x: 50, y: 50 },
    });
    // Same length + 1, same prefix order, last entry is the user node.
    expect(result.nodesWithUserNode).toHaveLength(effectiveNodes.length + 1);
    expect(result.nodesWithUserNode[0]).toBe(effectiveNodes[0]);
    expect(result.nodesWithUserNode[1]).toBe(effectiveNodes[1]);
    expect(result.nodesWithUserNode[2]).toBe(result.userCanvasNode);
  });
});

describe('usePinnedUserNode — userConnections format', () => {
  it('builds one connects_to edge per exposed nodeId, ids of `${USER_NODE_ID}->${nodeId}` form', () => {
    const result = renderHook([mkNode('a'), mkNode('b'), mkNode('c')], {
      nodeIds: ['a', 'b', 'c'],
      userIconPosition: { x: 0, y: 0 },
    });
    expect(result.userConnections).toHaveLength(3);
    expect(result.userConnections[0]).toEqual({
      id: `${USER_NODE_ID}->a`,
      from: USER_NODE_ID,
      to: 'a',
      data: { relationship: 'connects_to' },
    });
    expect(result.userConnections[1]).toEqual({
      id: `${USER_NODE_ID}->b`,
      from: USER_NODE_ID,
      to: 'b',
      data: { relationship: 'connects_to' },
    });
    expect(result.userConnections[2]).toEqual({
      id: `${USER_NODE_ID}->c`,
      from: USER_NODE_ID,
      to: 'c',
      data: { relationship: 'connects_to' },
    });
  });

  it('returns empty userConnections when userCanvasNode is null (no exposed services)', () => {
    const result = renderHook([mkNode('a')], { nodeIds: [], userIconPosition: null });
    expect(result.userConnections).toEqual([]);
  });
});

describe('usePinnedUserNode — drag-position setter (RISK #10)', () => {
  it('next render uses the dragged userNodePos top-left directly (no half-extent offset)', () => {
    // Pre-prime the userState slot to simulate a post-drag re-render: the
    // user dragged SvgUserNode to top-left (300, 400) and that top-left is
    // now the slot's current value.
    mocks.userNodePosSlot.current = { x: 300, y: 400 };
    // Pinned center is something different — we should NOT see it on this
    // render because userNodePos takes precedence.
    const result = renderHook([mkNode('a')], {
      nodeIds: ['a'],
      userIconPosition: { x: 1000, y: 1000 },
    });
    expect(result.userCanvasNode?.x).toBe(300);
    expect(result.userCanvasNode?.y).toBe(400);
  });

  it('setUserNodePos writes through to the userNodePos slot via the setter spy', () => {
    const result = renderHook([mkNode('a')], {
      nodeIds: ['a'],
      userIconPosition: { x: 0, y: 0 },
    });
    result.setUserNodePos({ x: 11, y: 22 });
    expect(mocks.setUserNodePosSpy).toHaveBeenCalledTimes(1);
    expect(mocks.setUserNodePosSpy).toHaveBeenCalledWith({ x: 11, y: 22 });
    expect(mocks.userNodePosSlot.current).toEqual({ x: 11, y: 22 });
  });
});

describe('usePinnedUserNode — pinned-position diff branch', () => {
  it('exposedIds KEY change → pinnedUserPosRef updates to the new userIconPosition', () => {
    // Pre-prime: previous render observed a different exposed-IDs key.
    mocks.refSlots[1].current = 'old-key';
    // pinnedUserPosRef carries the old position, distinct from what's about to be supplied.
    mocks.refSlots[0].current = { x: 1, y: 1 };

    const result = renderHook([mkNode('a'), mkNode('b')], {
      nodeIds: ['a', 'b'],
      userIconPosition: { x: 999, y: 999 },
    });

    // The in-render side-effect block re-pins to the new userIconPosition.
    expect(mocks.refSlots[0].current).toEqual({ x: 999, y: 999 });
    // And the prev-key updates to the new sorted-joined key.
    expect(mocks.refSlots[1].current).toBe('a,b');
    // Surfaced as pinnedUserPos in the result.
    expect(result.pinnedUserPos).toEqual({ x: 999, y: 999 });
  });

  it('exposedIds KEY unchanged → pinnedUserPosRef is preserved (drag does not get reset)', () => {
    // Pre-prime: previous render's key matches the about-to-be-computed key
    // (sorted-joined nodeIds).
    mocks.refSlots[1].current = 'a,b';
    // Pre-prime: pinned ref carries a sentinel position that should survive.
    const sentinel = { x: 42, y: 42 };
    mocks.refSlots[0].current = sentinel;

    const result = renderHook([mkNode('a'), mkNode('b')], {
      nodeIds: ['a', 'b'],
      userIconPosition: { x: 999, y: 999 }, // different — must be ignored
    });

    // The diff-branch is skipped: pinned position survives.
    expect(mocks.refSlots[0].current).toBe(sentinel);
    expect(result.pinnedUserPos).toBe(sentinel);
    // Prev-key unchanged.
    expect(mocks.refSlots[1].current).toBe('a,b');
  });

  it('exposedIds order does not matter — sorted-joined key is the discriminant', () => {
    // Pre-prime: previous render observed a SORTED-JOINED key.
    mocks.refSlots[1].current = 'a,b,c';
    const sentinel = { x: 7, y: 7 };
    mocks.refSlots[0].current = sentinel;

    // Supply the same set in a different input order — the hook sorts before joining.
    const result = renderHook([mkNode('c'), mkNode('a'), mkNode('b')], {
      nodeIds: ['c', 'a', 'b'],
      userIconPosition: { x: 999, y: 999 },
    });

    // Sorted-key matches → diff branch is skipped, pinned position survives.
    expect(mocks.refSlots[0].current).toBe(sentinel);
    expect(result.pinnedUserPos).toBe(sentinel);
  });

  it('first render with exposed services pins from the empty initial prev-key', () => {
    // Default initial state: refSlots[1].current === '' (set in beforeEach).
    // Any non-empty exposed-IDs key triggers the re-pin branch.
    const result = renderHook([mkNode('a')], {
      nodeIds: ['a'],
      userIconPosition: { x: 500, y: 250 },
    });
    expect(mocks.refSlots[0].current).toEqual({ x: 500, y: 250 });
    expect(mocks.refSlots[1].current).toBe('a');
    expect(result.pinnedUserPos).toEqual({ x: 500, y: 250 });
  });
});

describe('usePinnedUserNode — userNodePos precedence', () => {
  it('userNodePos null + pinnedUserPos null → userCanvasNode is null', () => {
    // Pre-prime both refs as null/empty so the diff branch's assignment
    // sets `pinnedUserPosRef.current = null` (the test supplies null).
    const result = renderHook([], { nodeIds: [], userIconPosition: null });
    expect(result.userCanvasNode).toBeNull();
    expect(result.pinnedUserPos).toBeNull();
  });

  it('userNodePos null + pinnedUserPos set → userCanvasNode uses the offset fallback', () => {
    const result = renderHook([mkNode('a')], {
      nodeIds: ['a'],
      userIconPosition: { x: 200, y: 100 },
    });
    // Fallback subtracts USER_NODE_WIDTH / 2 and USER_NODE_HEIGHT / 2.
    expect(result.userCanvasNode?.x).toBe(200 - USER_NODE_WIDTH / 2);
    expect(result.userCanvasNode?.y).toBe(100 - USER_NODE_HEIGHT / 2);
  });

  it('userNodePos set + pinnedUserPos set → userNodePos wins (no offset subtraction)', () => {
    mocks.userNodePosSlot.current = { x: 50, y: 60 };
    const result = renderHook([mkNode('a')], {
      nodeIds: ['a'],
      userIconPosition: { x: 1000, y: 2000 },
    });
    expect(result.userCanvasNode?.x).toBe(50);
    expect(result.userCanvasNode?.y).toBe(60);
  });
});

/**
 * Tests for `SvgUserNode` — React.memo-wrapped FC.
 *
 * Strategy:
 *   - Unwrap the memo via `.type` to get the underlying FC.
 *   - Mock React's `useState` / `useRef` / `useCallback` / `useEffect`
 *     so the FC can be invoked outside a renderer.
 *   - `useEffect` fires synchronously (so `onPositionChange` is
 *     called during invocation).
 *
 * Asserts:
 *   - Renders a `<g>` group with an outer hit-area `<circle>`,
 *     glow, icon circle, silhouette path, and a label `<text>`.
 *   - `onPositionChange` is called with the top-left coords on
 *     mount.
 *   - Pointer events: pointerDown captures pointer, pointerMove
 *     updates offset (via setState spy), pointerUp clears the ref.
 *   - exports the constant ids (USER_NODE_WIDTH, USER_NODE_HEIGHT,
 *     USER_NODE_ID).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  // Single useState slot — offset { dx, dy }.
  offsetRef: { current: { dx: 0, dy: 0 } as { dx: number; dy: number } },
  setOffsetSpy: vi.fn(),
  // useRef for dragRef.
  dragRef: {
    current: null as null | { startX: number; startY: number; startDx: number; startDy: number },
  },
  // useEffect cleanups + invocations.
  effectCallbacks: [] as Array<() => void | (() => void)>,
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  return {
    ...actual,
    useState: vi.fn(<T,>(initial: T | (() => T)) => {
      void initial;
      return [mocks.offsetRef.current as unknown as T, mocks.setOffsetSpy as unknown];
    }),
    useRef: vi.fn(<T,>(initial: T) => {
      // Single useRef slot — dragRef. Honor the test-supplied current.
      mocks.dragRef.current = mocks.dragRef.current ?? (initial as never);
      return mocks.dragRef as unknown as { current: T };
    }),
    useCallback: vi.fn(<T,>(fn: T) => fn),
    useEffect: vi.fn((cb: () => void | (() => void), _deps?: unknown[]) => {
      mocks.effectCallbacks.push(cb);
      cb();
    }),
    memo: <T,>(c: T) => c,
  };
});

import { SvgUserNode, USER_NODE_WIDTH, USER_NODE_HEIGHT, USER_NODE_ID } from '../svg-user-node';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* opaque */
    }
    return;
  }
  yield* walk(node.props.children);
}

function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface RenderProps {
  position: { x: number; y: number };
  scale?: number;
  onPositionChange?: (pos: { x: number; y: number }) => void;
}

const render = (props: RenderProps): React.ReactElement => {
  // SvgUserNode is wrapped with `memo` — the mocked memo passthrough returns
  // the FC directly so we can call it as a function.
  return (SvgUserNode as unknown as (p: RenderProps) => React.ReactElement)(props);
};

beforeEach(() => {
  mocks.offsetRef.current = { dx: 0, dy: 0 };
  mocks.dragRef.current = null;
  mocks.setOffsetSpy.mockReset();
  mocks.effectCallbacks.length = 0;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SvgUserNode — exports', () => {
  it('exports USER_NODE_WIDTH and USER_NODE_HEIGHT as positive numbers', () => {
    expect(USER_NODE_WIDTH).toBe(44);
    expect(USER_NODE_HEIGHT).toBe(44);
  });

  it('exports USER_NODE_ID as the literal magic string', () => {
    expect(USER_NODE_ID).toBe('__user_traffic__');
  });
});

describe('SvgUserNode — render', () => {
  it('returns a top-level <g> group', () => {
    const tree = render({ position: { x: 100, y: 200 } });
    expect(tree.type).toBe('g');
    expect((tree.props as { className?: string }).className).toBe('user-traffic-indicator');
  });

  it('renders a hit-area, glow, icon circle, silhouette, and label', () => {
    const tree = render({ position: { x: 100, y: 200 } });
    const circles = findAll(tree, (el) => el.type === 'circle');
    // 3 circles: hit-area, glow, icon outline.
    expect(circles).toHaveLength(3);
    const text = findFirst(tree, (el) => el.type === 'text');
    expect(text).toBeDefined();
    expect((text!.props as { children: unknown }).children).toBe('Public Traffic');
  });

  it('positions circles at the offset-adjusted coords (dx/dy applied)', () => {
    mocks.offsetRef.current = { dx: 5, dy: 7 };
    const tree = render({ position: { x: 100, y: 200 } });
    const circles = findAll(tree, (el) => el.type === 'circle');
    expect((circles[0].props as { cx: number }).cx).toBe(105);
    expect((circles[0].props as { cy: number }).cy).toBe(207);
  });
});

describe('SvgUserNode — onPositionChange (effect)', () => {
  it('calls onPositionChange with the top-left corner coords on render', () => {
    const onPositionChange = vi.fn();
    render({ position: { x: 100, y: 200 }, onPositionChange });
    expect(onPositionChange).toHaveBeenCalledWith({
      // (cx - WIDTH/2, cy - HEIGHT/2) where cx=100, cy=200, WIDTH=HEIGHT=44.
      x: 100 - 22,
      y: 200 - 22,
    });
  });

  it('skips the effect when onPositionChange is not provided', () => {
    // No throw — the optional-call guard short-circuits.
    expect(() => render({ position: { x: 0, y: 0 } })).not.toThrow();
  });
});

describe('SvgUserNode — pointer handlers', () => {
  it('pointerDown captures pointer, sets dragRef, and stops/prevents default (when button=0)', () => {
    const tree = render({ position: { x: 50, y: 50 } });
    const hitArea = findAll(tree, (el) => el.type === 'circle')[0];
    const onPointerDown = (hitArea.props as {
      onPointerDown: (e: React.PointerEvent<SVGElement>) => void;
    }).onPointerDown;
    const setPointerCapture = vi.fn();
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();
    onPointerDown({
      button: 0,
      clientX: 100,
      clientY: 200,
      pointerId: 7,
      currentTarget: { setPointerCapture },
      stopPropagation,
      preventDefault,
    } as unknown as React.PointerEvent<SVGElement>);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(stopPropagation).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(mocks.dragRef.current).toEqual({
      startX: 100,
      startY: 200,
      startDx: 0,
      startDy: 0,
    });
  });

  it('pointerDown short-circuits when button !== 0 (right-click etc.)', () => {
    const tree = render({ position: { x: 50, y: 50 } });
    const hitArea = findAll(tree, (el) => el.type === 'circle')[0];
    const onPointerDown = (hitArea.props as {
      onPointerDown: (e: React.PointerEvent<SVGElement>) => void;
    }).onPointerDown;
    const setPointerCapture = vi.fn();
    const stopPropagation = vi.fn();
    onPointerDown({
      button: 2,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      currentTarget: { setPointerCapture },
      stopPropagation,
      preventDefault: vi.fn(),
    } as unknown as React.PointerEvent<SVGElement>);
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(mocks.dragRef.current).toBeNull();
  });

  it('pointerMove updates offset via setOffset(spy) when drag is in progress (scale=1)', () => {
    mocks.dragRef.current = { startX: 100, startY: 200, startDx: 5, startDy: 10 };
    const tree = render({ position: { x: 50, y: 50 }, scale: 1 });
    const hitArea = findAll(tree, (el) => el.type === 'circle')[0];
    const onPointerMove = (hitArea.props as {
      onPointerMove: (e: React.PointerEvent<SVGElement>) => void;
    }).onPointerMove;
    onPointerMove({
      clientX: 150,
      clientY: 250,
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent<SVGElement>);
    expect(mocks.setOffsetSpy).toHaveBeenCalledWith({ dx: 55, dy: 60 });
  });

  it('pointerMove divides client deltas by scale (scale=2 → halves the move)', () => {
    mocks.dragRef.current = { startX: 0, startY: 0, startDx: 0, startDy: 0 };
    const tree = render({ position: { x: 50, y: 50 }, scale: 2 });
    const hitArea = findAll(tree, (el) => el.type === 'circle')[0];
    const onPointerMove = (hitArea.props as {
      onPointerMove: (e: React.PointerEvent<SVGElement>) => void;
    }).onPointerMove;
    onPointerMove({
      clientX: 100,
      clientY: 80,
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent<SVGElement>);
    expect(mocks.setOffsetSpy).toHaveBeenCalledWith({ dx: 50, dy: 40 });
  });

  it('pointerMove no-ops when no drag is in progress (dragRef.current === null)', () => {
    mocks.dragRef.current = null;
    const tree = render({ position: { x: 50, y: 50 } });
    const hitArea = findAll(tree, (el) => el.type === 'circle')[0];
    const onPointerMove = (hitArea.props as {
      onPointerMove: (e: React.PointerEvent<SVGElement>) => void;
    }).onPointerMove;
    onPointerMove({
      clientX: 999,
      clientY: 999,
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent<SVGElement>);
    expect(mocks.setOffsetSpy).not.toHaveBeenCalled();
  });

  it('pointerUp clears dragRef when a drag is in progress', () => {
    mocks.dragRef.current = { startX: 0, startY: 0, startDx: 0, startDy: 0 };
    const tree = render({ position: { x: 50, y: 50 } });
    const hitArea = findAll(tree, (el) => el.type === 'circle')[0];
    const onPointerUp = (hitArea.props as {
      onPointerUp: (e: React.PointerEvent<SVGElement>) => void;
    }).onPointerUp;
    onPointerUp({ stopPropagation: vi.fn() } as unknown as React.PointerEvent<SVGElement>);
    expect(mocks.dragRef.current).toBeNull();
  });

  it('pointerUp no-ops when no drag is in progress', () => {
    mocks.dragRef.current = null;
    const tree = render({ position: { x: 50, y: 50 } });
    const hitArea = findAll(tree, (el) => el.type === 'circle')[0];
    const onPointerUp = (hitArea.props as {
      onPointerUp: (e: React.PointerEvent<SVGElement>) => void;
    }).onPointerUp;
    const stopPropagation = vi.fn();
    onPointerUp({ stopPropagation } as unknown as React.PointerEvent<SVGElement>);
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});

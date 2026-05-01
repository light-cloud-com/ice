/**
 * rf-canvint-3 — `useMouseHandlers` regression tests.
 *
 * The sub-hook is a pure callback factory — `useCallback` only, no
 * `useEffect`, no `useState`, no Redux. Mock `useCallback` to be the
 * identity function and call the hook DIRECTLY (no Provider, no
 * renderToString). This lets us drive each handler with synthetic
 * MouseEvent-shaped objects and observe the side-effects on the
 * orchestrator's state refs + the option callbacks.
 *
 * Coverage target: every gesture transition, every reset path, the
 * multi-drag offset map, the shift-key reparent path, the wheel zoom
 * clamp, and the locked-canvas + missing-callback short-circuits.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MutableRefObject, RefObject } from 'react';

// Mock useCallback to identity so we can call the hook directly without
// React reconciliation. The hook never reads refs at construction time —
// it only closes over them — so identity-callback gives the same closures
// the orchestrator gets at runtime.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useCallback: <F extends (...a: any[]) => any>(fn: F) => fn,
  };
});

import { useMouseHandlers } from '../interactions/use-mouse-handlers';
import { freshInitialState } from '../interactions/state';
import type {
  CanvasItem,
  CanvasViewport,
  InteractionState,
  UseCanvasInteractionsOptions,
} from '../interactions/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const mkRef = <T,>(value: T): MutableRefObject<T> => ({ current: value });

const mkSvgRef = (rect: { left: number; top: number } | null): RefObject<SVGSVGElement | null> => {
  if (rect === null) return { current: null };
  // Minimal SVGSVGElement-shaped object with getBoundingClientRect.
  const el = {
    getBoundingClientRect: () => ({ left: rect.left, top: rect.top, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  };
  return { current: el as unknown as SVGSVGElement };
};

interface MouseEventShape {
  button: number;
  clientX: number;
  clientY: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  preventDefault: () => void;
}

const mkEvent = (overrides: Partial<MouseEventShape> = {}): MouseEventShape => ({
  button: 0,
  clientX: 0,
  clientY: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  preventDefault: vi.fn(),
  ...overrides,
});

const mkItem = (o: Partial<CanvasItem> & { id: string }): CanvasItem => ({
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  parentId: null,
  ...o,
});

interface SetupOpts {
  state?: InteractionState;
  viewport?: CanvasViewport;
  items?: CanvasItem[];
  selectedIds?: string[];
  locked?: boolean;
  spaceHeld?: boolean;
  rect?: { left: number; top: number } | null;
  gridSize?: number;
  minZoom?: number;
  maxZoom?: number;
  callbacks?: Partial<UseCanvasInteractionsOptions>;
  // Custom screenToCanvas / findItemAtPosition (defaults pass-through)
  screenToCanvas?: (sx: number, sy: number) => { x: number; y: number };
  findItemAtPosition?: (
    cx: number,
    cy: number,
  ) => { item: CanvasItem | null; isResize: boolean };
}

const setupHandlers = (opts: SetupOpts = {}) => {
  const stateRef = mkRef<InteractionState>(opts.state ?? freshInitialState());
  const lastMousePos = mkRef({ x: 0, y: 0 });
  const viewportRef = mkRef<CanvasViewport>(opts.viewport ?? { x: 0, y: 0, zoom: 1 });
  const itemsRef = mkRef<CanvasItem[]>(opts.items ?? []);
  const selectedIdsRef = mkRef<string[]>(opts.selectedIds ?? []);
  const lockedRef = mkRef<boolean>(opts.locked ?? false);
  const spaceHeldRef = mkRef<boolean>(opts.spaceHeld ?? false);
  // Explicit-key check distinguishes "rect omitted → default" from "rect:
  // null → no SVG yet" (per the rf-pdpl-22 capture-helper-defaults learning).
  const svgRef = mkSvgRef('rect' in opts ? (opts.rect ?? null) : { left: 0, top: 0 });

  const screenToCanvas =
    opts.screenToCanvas ??
    ((sx: number, sy: number) => {
      const r = svgRef.current?.getBoundingClientRect() ?? null;
      const v = viewportRef.current;
      if (!r) return { x: 0, y: 0 };
      return { x: (sx - r.left - v.x) / v.zoom, y: (sy - r.top - v.y) / v.zoom };
    });

  const findItemAtPosition =
    opts.findItemAtPosition ??
    ((cx: number, cy: number) => {
      // Default: linear-scan reverse for hit
      for (let i = itemsRef.current.length - 1; i >= 0; i--) {
        const it = itemsRef.current[i];
        if (cx >= it.x && cx <= it.x + it.width && cy >= it.y && cy <= it.y + it.height) {
          return { item: it, isResize: false };
        }
      }
      return { item: null, isResize: false };
    });

  const onViewportChange = vi.fn();
  const onItemMove = vi.fn();
  const onItemResize = vi.fn();
  const onSelect = vi.fn();
  const onToggleSelect = vi.fn();
  const onBoxSelect = vi.fn();
  const onContextMenu = vi.fn();
  const onDragOverGroup = vi.fn();
  const onDragEnd = vi.fn();

  // To opt OUT of a default spy callback, set the key in opts.callbacks
  // (with `undefined`) — the in-check distinguishes "not passed" (use spy)
  // from "explicitly undefined" (opt out). Mirrors the rf-pdpl-22 capture-
  // helper-defaults learning.
  const cbs = opts.callbacks ?? {};
  const pick = <K extends keyof UseCanvasInteractionsOptions>(
    key: K,
    spy: UseCanvasInteractionsOptions[K] | undefined,
  ): UseCanvasInteractionsOptions[K] | undefined =>
    key in cbs ? (cbs[key] as UseCanvasInteractionsOptions[K] | undefined) : spy;

  const handlers = useMouseHandlers({
    stateRef,
    lastMousePos,
    viewportRef,
    itemsRef,
    selectedIdsRef,
    lockedRef,
    spaceHeldRef,
    svgRef,
    screenToCanvas,
    findItemAtPosition,
    onViewportChange: pick('onViewportChange', onViewportChange) as UseCanvasInteractionsOptions['onViewportChange'],
    onItemMove: pick('onItemMove', onItemMove),
    onItemResize: pick('onItemResize', onItemResize),
    onSelect: pick('onSelect', onSelect),
    onToggleSelect: pick('onToggleSelect', onToggleSelect),
    onBoxSelect: pick('onBoxSelect', onBoxSelect),
    onContextMenu: pick('onContextMenu', onContextMenu),
    onDragOverGroup: pick('onDragOverGroup', onDragOverGroup),
    onDragEnd: pick('onDragEnd', onDragEnd),
    gridSize: opts.gridSize ?? 0, // default 0 = no snapping for clean assertions
    minZoom: opts.minZoom ?? 0.1,
    maxZoom: opts.maxZoom ?? 2,
  });

  return {
    handlers,
    refs: { stateRef, lastMousePos, viewportRef, itemsRef, selectedIdsRef, lockedRef, spaceHeldRef },
    spies: {
      onViewportChange,
      onItemMove,
      onItemResize,
      onSelect,
      onToggleSelect,
      onBoxSelect,
      onContextMenu,
      onDragOverGroup,
      onDragEnd,
    },
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── handleMouseDown ────────────────────────────────────────────────────────

describe('rf-canvint-3 — handleMouseDown', () => {
  it('updates lastMousePos for ANY click', () => {
    const ctx = setupHandlers();
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 50, clientY: 100 }) as never);
    expect(ctx.refs.lastMousePos.current).toEqual({ x: 50, y: 100 });
  });

  it('starts pan mode on middle-mouse click and preventDefaults', () => {
    const ctx = setupHandlers();
    const ev = mkEvent({ button: 1, clientX: 10, clientY: 20 });
    ctx.handlers.handleMouseDown(ev as never);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(ctx.refs.stateRef.current.mode).toBe('pan');
    expect(ctx.refs.stateRef.current.startX).toBe(10);
    expect(ctx.refs.stateRef.current.startY).toBe(20);
  });

  it('starts pan mode on Space+left-click', () => {
    const ctx = setupHandlers({ spaceHeld: true });
    const ev = mkEvent({ button: 0, clientX: 5, clientY: 6 });
    ctx.handlers.handleMouseDown(ev as never);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(ctx.refs.stateRef.current.mode).toBe('pan');
  });

  it('ignores right-button (button !== 0/1) clicks entirely', () => {
    const ctx = setupHandlers();
    ctx.handlers.handleMouseDown(mkEvent({ button: 2 }) as never);
    expect(ctx.refs.stateRef.current.mode).toBe('none');
  });

  it('on empty space click: starts boxSelect mode and clears selection', () => {
    const ctx = setupHandlers({ items: [] });
    const ev = mkEvent({ clientX: 50, clientY: 50 });
    ctx.handlers.handleMouseDown(ev as never);
    expect(ctx.refs.stateRef.current.mode).toBe('boxSelect');
    expect(ctx.refs.stateRef.current.boxStartCanvasX).toBe(50);
    expect(ctx.refs.stateRef.current.boxStartCanvasY).toBe(50);
    expect(ctx.spies.onSelect).toHaveBeenCalledWith([]);
  });

  it('on empty space + Ctrl: starts boxSelect WITHOUT clearing selection', () => {
    const ctx = setupHandlers({ items: [] });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 1, clientY: 1, ctrlKey: true }) as never);
    expect(ctx.refs.stateRef.current.mode).toBe('boxSelect');
    expect(ctx.spies.onSelect).not.toHaveBeenCalled();
  });

  it('on item click + Ctrl: toggles selection and does NOT enter drag', () => {
    const item = mkItem({ id: 'a' });
    const ctx = setupHandlers({ items: [item] });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 50, clientY: 30 }) as never);
    // Without Ctrl, this would select+drag; verify ctrl path
    ctx.refs.stateRef.current = freshInitialState();
    ctx.handlers.handleMouseDown(
      mkEvent({ clientX: 50, clientY: 30, ctrlKey: true }) as never,
    );
    expect(ctx.spies.onToggleSelect).toHaveBeenCalledWith('a');
    expect(ctx.refs.stateRef.current.mode).toBe('none');
  });

  it('on item click (already selected): does NOT call onSelect again, but starts drag', () => {
    const item = mkItem({ id: 'a' });
    const ctx = setupHandlers({ items: [item], selectedIds: ['a'] });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 50, clientY: 30 }) as never);
    expect(ctx.spies.onSelect).not.toHaveBeenCalled();
    expect(ctx.refs.stateRef.current.mode).toBe('drag');
    expect(ctx.refs.stateRef.current.itemId).toBe('a');
  });

  it('on item click (not selected): calls onSelect with the new id and starts drag', () => {
    const item = mkItem({ id: 'a' });
    const ctx = setupHandlers({ items: [item] });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 50, clientY: 30 }) as never);
    expect(ctx.spies.onSelect).toHaveBeenCalledWith(['a']);
    expect(ctx.refs.stateRef.current.mode).toBe('drag');
  });

  it('on item click + locked canvas: selects but does NOT enter drag', () => {
    const item = mkItem({ id: 'a' });
    const ctx = setupHandlers({ items: [item], locked: true });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 50, clientY: 30 }) as never);
    expect(ctx.spies.onSelect).toHaveBeenCalledWith(['a']);
    expect(ctx.refs.stateRef.current.mode).toBe('none');
  });

  it('on resize handle hit: enters resize mode', () => {
    const item = mkItem({ id: 'a' });
    // Custom findItemAtPosition returns isResize: true
    const ctx = setupHandlers({
      items: [item],
      findItemAtPosition: () => ({ item, isResize: true }),
    });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 90, clientY: 50 }) as never);
    expect(ctx.refs.stateRef.current.mode).toBe('resize');
    expect(ctx.refs.stateRef.current.itemId).toBe('a');
    expect(ctx.refs.stateRef.current.startItemWidth).toBe(item.width);
    expect(ctx.refs.stateRef.current.startItemHeight).toBe(item.height);
  });

  it('on resize hit + missing onItemResize callback: falls through to drag (verbatim behavior)', () => {
    // BRIEF↔CODE NOTE: the verbatim original L255-267 has
    // `if (isResize && onItemResize) { ... } else if (onItemMove) { ... }`
    // so an isResize hit with onItemResize=undefined and onItemMove
    // present DOES enter drag mode. Pinning this exactly so a future
    // refactor doesn't silently change the fallback shape.
    const item = mkItem({ id: 'a' });
    const ctx = setupHandlers({
      items: [item],
      callbacks: { onItemResize: undefined },
      findItemAtPosition: () => ({ item, isResize: true }),
    });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 90, clientY: 50 }) as never);
    expect(ctx.refs.stateRef.current.mode).toBe('drag');
    expect(ctx.refs.stateRef.current.itemId).toBe('a');
  });

  it('on resize hit + missing onItemResize AND onItemMove: stays in "none" (both fall-through gates fail)', () => {
    const item = mkItem({ id: 'a' });
    const ctx = setupHandlers({
      items: [item],
      callbacks: { onItemResize: undefined, onItemMove: undefined },
      findItemAtPosition: () => ({ item, isResize: true }),
    });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 90, clientY: 50 }) as never);
    expect(ctx.refs.stateRef.current.mode).toBe('none');
  });

  it('on shift+mousedown on item: triggers onDragOverGroup with the dragged item id', () => {
    const item = mkItem({ id: 'a' });
    const ctx = setupHandlers({ items: [item] });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 50, clientY: 30, shiftKey: true }) as never);
    expect(ctx.spies.onDragOverGroup).toHaveBeenCalledWith(null, 'a');
  });

  it('builds multi-drag offsets when starting drag with multiple items selected', () => {
    const a = mkItem({ id: 'a', x: 0, y: 0 });
    const b = mkItem({ id: 'b', x: 50, y: 100 });
    const c = mkItem({ id: 'c', x: -30, y: 200 });
    const ctx = setupHandlers({ items: [a, b, c], selectedIds: ['a', 'b', 'c'] });
    // Click on item a
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 50, clientY: 30 }) as never);
    expect(ctx.refs.stateRef.current.mode).toBe('drag');
    expect(ctx.refs.stateRef.current.itemId).toBe('a');
    const offsets = ctx.refs.stateRef.current.dragItemOffsets;
    expect(offsets.size).toBe(2); // b + c, not a itself
    expect(offsets.get('b')).toEqual({ dx: 50, dy: 100, startX: 50, startY: 100 });
    expect(offsets.get('c')).toEqual({ dx: -30, dy: 200, startX: -30, startY: 200 });
  });

  it('multi-drag offsets exclude items whose parent is also selected', () => {
    const parent = mkItem({ id: 'p', x: 0, y: 0, width: 200, height: 200 });
    const child = mkItem({ id: 'child', x: 10, y: 10, parentId: 'p' });
    const sibling = mkItem({ id: 'sib', x: 300, y: 0 });
    const ctx = setupHandlers({
      items: [parent, child, sibling],
      selectedIds: ['p', 'child', 'sib'],
      // Click triggers a hit on parent
      findItemAtPosition: () => ({ item: parent, isResize: false }),
    });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 5, clientY: 5 }) as never);
    const offsets = ctx.refs.stateRef.current.dragItemOffsets;
    // Should include sib (no parent selected), exclude child (parent IS in selection)
    expect(offsets.has('child')).toBe(false);
    expect(offsets.has('sib')).toBe(true);
  });

  it('drag with single selection: dragItemOffsets remains empty', () => {
    const a = mkItem({ id: 'a' });
    const ctx = setupHandlers({ items: [a], selectedIds: ['a'] });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 50, clientY: 30 }) as never);
    expect(ctx.refs.stateRef.current.dragItemOffsets.size).toBe(0);
  });

  it('drag with onItemMove undefined: stays in "none" mode', () => {
    const a = mkItem({ id: 'a' });
    const ctx = setupHandlers({
      items: [a],
      callbacks: { onItemMove: undefined },
    });
    ctx.handlers.handleMouseDown(mkEvent({ clientX: 50, clientY: 30 }) as never);
    expect(ctx.refs.stateRef.current.mode).toBe('none');
  });
});

// ─── handleMouseMove ────────────────────────────────────────────────────────

describe('rf-canvint-3 — handleMouseMove', () => {
  it('returns early when mode is "none"', () => {
    const ctx = setupHandlers();
    ctx.handlers.handleMouseMove(mkEvent({ clientX: 100, clientY: 100 }) as never);
    expect(ctx.spies.onViewportChange).not.toHaveBeenCalled();
    expect(ctx.spies.onItemMove).not.toHaveBeenCalled();
  });

  it('pan mode: updates viewport by mouse delta', () => {
    const ctx = setupHandlers({
      state: { ...freshInitialState(), mode: 'pan', startX: 0, startY: 0 },
      viewport: { x: 100, y: 200, zoom: 1 },
    });
    ctx.refs.lastMousePos.current = { x: 50, y: 50 };
    ctx.handlers.handleMouseMove(mkEvent({ clientX: 70, clientY: 80 }) as never);
    // dx=20, dy=30 → viewport.x = 120, y = 230
    expect(ctx.spies.onViewportChange).toHaveBeenCalledWith({ x: 120, y: 230, zoom: 1 });
  });

  it('drag mode: moves the primary item with viewport-zoom-corrected delta', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'drag',
        itemId: 'a',
        startX: 100,
        startY: 100,
        startItemX: 0,
        startItemY: 0,
      },
      viewport: { x: 0, y: 0, zoom: 2 },
    });
    ctx.handlers.handleMouseMove(mkEvent({ clientX: 110, clientY: 120 }) as never);
    // totalDx=10, totalDy=20, zoom=2 → newX = 0 + 10/2 = 5, newY = 0 + 20/2 = 10
    expect(ctx.spies.onItemMove).toHaveBeenCalledWith('a', 5, 10, false);
  });

  it('drag with shift held: passes skipResize=true and emits drag-over with center', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'drag',
        itemId: 'a',
        startX: 0,
        startY: 0,
        startItemX: 0,
        startItemY: 0,
        startItemWidth: 100,
        startItemHeight: 60,
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    ctx.handlers.handleMouseMove(mkEvent({ clientX: 50, clientY: 50, shiftKey: true }) as never);
    expect(ctx.spies.onItemMove).toHaveBeenCalledWith('a', 50, 50, true);
    // center: x=50+50=100, y=50+30=80
    expect(ctx.spies.onDragOverGroup).toHaveBeenCalledWith(null, 'a', 100, 80);
  });

  it('drag without shift: emits onDragOverGroup(null, null) to clear highlight', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'drag',
        itemId: 'a',
        startX: 0,
        startY: 0,
        startItemX: 0,
        startItemY: 0,
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    ctx.handlers.handleMouseMove(mkEvent({ clientX: 50, clientY: 50 }) as never);
    expect(ctx.spies.onDragOverGroup).toHaveBeenCalledWith(null, null);
  });

  it('drag with grid snapping: rounds to grid', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'drag',
        itemId: 'a',
        startX: 0,
        startY: 0,
        startItemX: 0,
        startItemY: 0,
      },
      gridSize: 20,
    });
    ctx.handlers.handleMouseMove(mkEvent({ clientX: 23, clientY: 47 }) as never);
    // 23 → round to 20, 47 → round to 40
    expect(ctx.spies.onItemMove).toHaveBeenCalledWith('a', 20, 40, false);
  });

  it('multi-drag: moves all offset-tracked siblings', () => {
    const offsets = new Map([
      ['b', { dx: 50, dy: 0, startX: 50, startY: 0 }],
      ['c', { dx: 0, dy: 50, startX: 0, startY: 50 }],
    ]);
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'drag',
        itemId: 'a',
        startX: 0,
        startY: 0,
        startItemX: 0,
        startItemY: 0,
        dragItemOffsets: offsets,
      },
    });
    ctx.handlers.handleMouseMove(mkEvent({ clientX: 10, clientY: 10 }) as never);
    expect(ctx.spies.onItemMove).toHaveBeenNthCalledWith(1, 'a', 10, 10, false);
    expect(ctx.spies.onItemMove).toHaveBeenNthCalledWith(2, 'b', 60, 10, false);
    expect(ctx.spies.onItemMove).toHaveBeenNthCalledWith(3, 'c', 10, 60, false);
  });

  it('resize mode: clamps to min size 100x60 and applies grid snap', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'resize',
        itemId: 'a',
        startX: 0,
        startY: 0,
        startItemWidth: 100,
        startItemHeight: 60,
      },
      gridSize: 0,
    });
    // delta = -50, -30 → would go to 50, 30 → clamped to 100, 60
    ctx.handlers.handleMouseMove(mkEvent({ clientX: -50, clientY: -30 }) as never);
    expect(ctx.spies.onItemResize).toHaveBeenCalledWith('a', 100, 60);
  });

  it('resize mode: positive delta enlarges past min', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'resize',
        itemId: 'a',
        startX: 0,
        startY: 0,
        startItemWidth: 100,
        startItemHeight: 60,
      },
      viewport: { x: 0, y: 0, zoom: 2 },
    });
    // totalDx=200, totalDy=80, zoom=2 → +100, +40 → 200x100
    ctx.handlers.handleMouseMove(mkEvent({ clientX: 200, clientY: 80 }) as never);
    expect(ctx.spies.onItemResize).toHaveBeenCalledWith('a', 200, 100);
  });

  it('boxSelect mode: emits rect when above 5px threshold', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'boxSelect',
        boxStartCanvasX: 0,
        boxStartCanvasY: 0,
      },
    });
    ctx.handlers.handleMouseMove(mkEvent({ clientX: 50, clientY: 30 }) as never);
    expect(ctx.spies.onBoxSelect).toHaveBeenCalledWith({ x: 0, y: 0, width: 50, height: 30 });
  });

  it('boxSelect mode: skips emit when below 5px threshold', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'boxSelect',
        boxStartCanvasX: 0,
        boxStartCanvasY: 0,
      },
    });
    ctx.handlers.handleMouseMove(mkEvent({ clientX: 3, clientY: 3 }) as never);
    expect(ctx.spies.onBoxSelect).not.toHaveBeenCalled();
  });

  it('boxSelect computes correct rect when cursor moves to upper-left of start', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'boxSelect',
        boxStartCanvasX: 100,
        boxStartCanvasY: 100,
      },
    });
    ctx.handlers.handleMouseMove(mkEvent({ clientX: 50, clientY: 50 }) as never);
    expect(ctx.spies.onBoxSelect).toHaveBeenCalledWith({ x: 50, y: 50, width: 50, height: 50 });
  });
});

// ─── handleMouseUp ──────────────────────────────────────────────────────────

describe('rf-canvint-3 — handleMouseUp', () => {
  it('always resets stateRef to fresh initial', () => {
    const ctx = setupHandlers({
      state: { ...freshInitialState(), mode: 'pan', startX: 100 },
    });
    ctx.handlers.handleMouseUp(mkEvent() as never);
    expect(ctx.refs.stateRef.current.mode).toBe('none');
    expect(ctx.refs.stateRef.current.startX).toBe(0);
  });

  it('drag end: emits onDragEnd with final position', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'drag',
        itemId: 'a',
        startX: 0,
        startY: 0,
        startItemX: 0,
        startItemY: 0,
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    ctx.handlers.handleMouseUp(mkEvent({ clientX: 75, clientY: 100 }) as never);
    expect(ctx.spies.onDragEnd).toHaveBeenCalledWith('a', 75, 100, false);
  });

  it('drag end with shift: forceReparent=true', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'drag',
        itemId: 'a',
        startX: 0,
        startY: 0,
        startItemX: 0,
        startItemY: 0,
      },
    });
    ctx.handlers.handleMouseUp(mkEvent({ clientX: 50, clientY: 50, shiftKey: true }) as never);
    expect(ctx.spies.onDragEnd).toHaveBeenCalledWith('a', 50, 50, true);
  });

  it('drag end emits onDragEnd for all multi-drag items', () => {
    const offsets = new Map([['b', { dx: 50, dy: 50, startX: 0, startY: 0 }]]);
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'drag',
        itemId: 'a',
        startX: 0,
        startY: 0,
        startItemX: 0,
        startItemY: 0,
        dragItemOffsets: offsets,
      },
    });
    ctx.handlers.handleMouseUp(mkEvent({ clientX: 10, clientY: 10 }) as never);
    expect(ctx.spies.onDragEnd).toHaveBeenCalledWith('a', 10, 10, false);
    expect(ctx.spies.onDragEnd).toHaveBeenCalledWith('b', 60, 60, false);
  });

  it('drag end clears the drag-over highlight', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'drag',
        itemId: 'a',
        startX: 0,
        startY: 0,
        startItemX: 0,
        startItemY: 0,
      },
    });
    ctx.handlers.handleMouseUp(mkEvent({ clientX: 0, clientY: 0 }) as never);
    expect(ctx.spies.onDragOverGroup).toHaveBeenCalledWith(null, null);
  });

  it('boxSelect end: selects intersecting items above threshold', () => {
    const items = [
      mkItem({ id: 'a', x: 0, y: 0, width: 30, height: 30 }),
      mkItem({ id: 'b', x: 50, y: 0, width: 30, height: 30 }),
    ];
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'boxSelect',
        boxStartCanvasX: 0,
        boxStartCanvasY: 0,
      },
      items,
    });
    ctx.handlers.handleMouseUp(mkEvent({ clientX: 40, clientY: 40 }) as never);
    expect(ctx.spies.onSelect).toHaveBeenCalledWith(['a']); // only a is inside the rect
    expect(ctx.spies.onBoxSelect).toHaveBeenCalledWith(null);
  });

  it('boxSelect end below threshold: only clears the box rect', () => {
    const ctx = setupHandlers({
      state: {
        ...freshInitialState(),
        mode: 'boxSelect',
        boxStartCanvasX: 0,
        boxStartCanvasY: 0,
      },
      items: [mkItem({ id: 'a', x: 0, y: 0 })],
    });
    ctx.handlers.handleMouseUp(mkEvent({ clientX: 3, clientY: 3 }) as never);
    expect(ctx.spies.onSelect).not.toHaveBeenCalled();
    expect(ctx.spies.onBoxSelect).toHaveBeenCalledWith(null);
  });
});

// ─── handleWheel ────────────────────────────────────────────────────────────

describe('rf-canvint-3 — handleWheel', () => {
  it('preventDefaults and zooms in on negative deltaY', () => {
    const ctx = setupHandlers({ viewport: { x: 0, y: 0, zoom: 1 } });
    const ev = { deltaY: -1, clientX: 0, clientY: 0, preventDefault: vi.fn() } as unknown as React.WheelEvent;
    ctx.handlers.handleWheel(ev);
    expect(ev.preventDefault).toHaveBeenCalled();
    // 1 * 1.05 = 1.05
    expect(ctx.spies.onViewportChange).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 1.05 }),
    );
  });

  it('zooms out on positive deltaY', () => {
    const ctx = setupHandlers({ viewport: { x: 0, y: 0, zoom: 1 } });
    const ev = { deltaY: 1, clientX: 0, clientY: 0, preventDefault: vi.fn() } as unknown as React.WheelEvent;
    ctx.handlers.handleWheel(ev);
    expect(ctx.spies.onViewportChange).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 0.95 }),
    );
  });

  it('clamps to maxZoom', () => {
    const ctx = setupHandlers({ viewport: { x: 0, y: 0, zoom: 1.99 }, maxZoom: 2 });
    const ev = { deltaY: -1, clientX: 0, clientY: 0, preventDefault: vi.fn() } as unknown as React.WheelEvent;
    ctx.handlers.handleWheel(ev);
    // 1.99 * 1.05 = 2.0895 → clamped to 2
    expect(ctx.spies.onViewportChange).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 2 }),
    );
  });

  it('clamps to minZoom', () => {
    // 0.11 * 0.95 = 0.1045 (above 0.1, no clamp). Use 0.105 → 0.09975 → clamped.
    const ctx = setupHandlers({ viewport: { x: 0, y: 0, zoom: 0.105 }, minZoom: 0.1 });
    const ev = { deltaY: 1, clientX: 0, clientY: 0, preventDefault: vi.fn() } as unknown as React.WheelEvent;
    ctx.handlers.handleWheel(ev);
    expect(ctx.spies.onViewportChange).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 0.1 }),
    );
  });

  it('returns early if svgRef.current is null (no zoom)', () => {
    const ctx = setupHandlers({ rect: null });
    const ev = { deltaY: -1, clientX: 0, clientY: 0, preventDefault: vi.fn() } as unknown as React.WheelEvent;
    ctx.handlers.handleWheel(ev);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(ctx.spies.onViewportChange).not.toHaveBeenCalled();
  });

  it('zoom adjusts pan to keep mouse position stable', () => {
    // viewport.x = 0, mouse at clientX = 100
    // newZoom = 1.05 → newX = 100 - (100 - 0) * 1.05 = 100 - 105 = -5
    const ctx = setupHandlers({ viewport: { x: 0, y: 0, zoom: 1 } });
    const ev = { deltaY: -1, clientX: 100, clientY: 0, preventDefault: vi.fn() } as unknown as React.WheelEvent;
    ctx.handlers.handleWheel(ev);
    expect(ctx.spies.onViewportChange).toHaveBeenCalledWith(
      expect.objectContaining({ x: -5, y: 0 }),
    );
  });
});

// ─── handleAuxClick ─────────────────────────────────────────────────────────

describe('rf-canvint-3 — handleAuxClick', () => {
  it('preventDefaults middle-click', () => {
    const ctx = setupHandlers();
    const ev = mkEvent({ button: 1 });
    ctx.handlers.handleAuxClick(ev as never);
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('does NOT preventDefault non-middle clicks', () => {
    const ctx = setupHandlers();
    const ev = mkEvent({ button: 0 });
    ctx.handlers.handleAuxClick(ev as never);
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });
});

// ─── handleContextMenu ──────────────────────────────────────────────────────

describe('rf-canvint-3 — handleContextMenu', () => {
  it('preventDefaults on right-click', () => {
    const ctx = setupHandlers();
    const ev = mkEvent();
    ctx.handlers.handleContextMenu(ev as never);
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('returns early when onContextMenu is undefined', () => {
    const ctx = setupHandlers({ callbacks: { onContextMenu: undefined } });
    ctx.handlers.handleContextMenu(mkEvent({ clientX: 50, clientY: 50 }) as never);
    expect(ctx.spies.onContextMenu).not.toHaveBeenCalled();
    expect(ctx.spies.onSelect).not.toHaveBeenCalled();
  });

  it('right-click on item: emits "node" type with item id', () => {
    const item = mkItem({ id: 'a' });
    const ctx = setupHandlers({ items: [item] });
    ctx.handlers.handleContextMenu(mkEvent({ clientX: 50, clientY: 30 }) as never);
    expect(ctx.spies.onContextMenu).toHaveBeenCalledWith({ x: 50, y: 30 }, 'node', 'a');
  });

  it('right-click on unselected item: also calls onSelect', () => {
    const item = mkItem({ id: 'a' });
    const ctx = setupHandlers({ items: [item], selectedIds: [] });
    ctx.handlers.handleContextMenu(mkEvent({ clientX: 50, clientY: 30 }) as never);
    expect(ctx.spies.onSelect).toHaveBeenCalledWith(['a']);
  });

  it('right-click on already-selected item: does NOT re-call onSelect', () => {
    const item = mkItem({ id: 'a' });
    const ctx = setupHandlers({ items: [item], selectedIds: ['a'] });
    ctx.handlers.handleContextMenu(mkEvent({ clientX: 50, clientY: 30 }) as never);
    expect(ctx.spies.onSelect).not.toHaveBeenCalled();
    expect(ctx.spies.onContextMenu).toHaveBeenCalled();
  });

  it('right-click on empty space: emits "canvas" type with no id', () => {
    const ctx = setupHandlers({ items: [] });
    ctx.handlers.handleContextMenu(mkEvent({ clientX: 200, clientY: 200 }) as never);
    expect(ctx.spies.onContextMenu).toHaveBeenCalledWith({ x: 200, y: 200 }, 'canvas');
  });
});

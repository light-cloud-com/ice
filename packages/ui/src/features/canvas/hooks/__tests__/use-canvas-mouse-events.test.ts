/**
 * useCanvasMouseEvents — hook unit tests.
 *
 * Tests run in a node-only vitest environment (no jsdom). The hook is a
 * pure-callback factory with TWO `useState` slots (dragState + spacePressed),
 * one `useRef` (lastPanPos), and one `useEffect` that installs window
 * keyboard listeners.
 *
 * The harness:
 *  - Mocks `useState` against TWO mutable slots so reads in the next
 *    render see the writes from the previous render. Per the rf-canv-25b
 *    learning `stateful-hook-with-callback-writes-needs-mutable-usestate-
 *    slot-mock-not-real-usestate`, the hook exposes callbacks that BOTH
 *    write and read state slots → mutable-slot pattern is the only
 *    reliable approach.
 *  - Mocks `useEffect` synchronously: stash callback + cleanup so tests
 *    can drive the keyboard handlers AND the cleanup independently.
 *  - Stubs `window` with addEventListener / removeEventListener spies so
 *    tests can capture the keyboard listeners and fire them by hand.
 *
 * `useCanvasUtils.Point` and `ViewState` / `CanvasNode` are taken at
 * face value — no Redux, no dispatch.
 */

import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted state ───────────────────────────────────────────────────────────
// Two useState slots:
//   slot 0 → dragState (full DragState shape)
//   slot 1 → spacePressed (boolean)
// `useRef` returns a fresh ref each render — the hook reads/writes it via
// .current so the mutation persists within a single capture-and-invoke pass.
//
// `effectCallbacks` accumulate every `useEffect` registration; tests fire
// the keyboard-listener effect by index and read the cleanup off
// `effectCleanups[0]`.

interface DragStateShape {
  isDragging: boolean;
  dragType: 'canvas' | 'element' | 'resize' | 'selection' | 'connection' | null;
  draggedNodeId: string | null;
  dragOffset: { x: number; y: number };
  startPos: { x: number; y: number };
  resizeHandle: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's' | null;
  originalBounds: { x: number; y: number; width: number; height: number } | null;
}

const initialDragState: DragStateShape = {
  isDragging: false,
  dragType: null,
  draggedNodeId: null,
  dragOffset: { x: 0, y: 0 },
  startPos: { x: 0, y: 0 },
  resizeHandle: null,
  originalBounds: null,
};

const mocks = vi.hoisted(() => {
  const dragSlot = { current: null as unknown };
  const spaceSlot = { current: false as boolean };
  // Counter resets per-render via __reset() before each renderToString.
  let useStateCallIdx = 0;
  const useStateMock = vi.fn((initial: unknown) => {
    const idx = useStateCallIdx;
    useStateCallIdx += 1;
    if (idx === 0) {
      // First call inside the hook = dragState.
      if (dragSlot.current === null) dragSlot.current = initial;
      return [
        dragSlot.current,
        (next: unknown) => {
          dragSlot.current =
            typeof next === 'function'
              ? (next as (p: unknown) => unknown)(dragSlot.current)
              : next;
        },
      ];
    }
    // Second call = spacePressed.
    return [
      spaceSlot.current,
      (next: unknown) => {
        spaceSlot.current = (typeof next === 'function'
          ? (next as (p: unknown) => unknown)(spaceSlot.current)
          : next) as boolean;
      },
    ];
  });

  const effectCallbacks: Array<() => void | (() => void)> = [];
  const effectCleanups: Array<() => void> = [];
  const useEffectMock = vi.fn((cb: () => void | (() => void)) => {
    effectCallbacks.push(cb);
    const result = cb();
    if (typeof result === 'function') effectCleanups.push(result);
  });

  // useRef returns the SAME ref object across renders within a test (we don't
  // need to worry about identity here — the hook just reads/writes .current
  // for the lastPanPos cache).
  const refSlots: Array<{ current: unknown }> = [];
  let useRefCallIdx = 0;
  const useRefMock = vi.fn((initial: unknown) => {
    const idx = useRefCallIdx;
    useRefCallIdx += 1;
    if (!refSlots[idx]) refSlots[idx] = { current: initial };
    return refSlots[idx];
  });

  // useCallback simply identity-returns the provided fn.
  const useCallbackMock = vi.fn(<F,>(fn: F) => fn);

  return {
    dragSlot,
    spaceSlot,
    refSlots,
    useStateMock,
    useEffectMock,
    useRefMock,
    useCallbackMock,
    effectCallbacks,
    effectCleanups,
    __reset() {
      useStateCallIdx = 0;
      useRefCallIdx = 0;
      dragSlot.current = null;
      spaceSlot.current = false;
      refSlots.length = 0;
      effectCallbacks.length = 0;
      effectCleanups.length = 0;
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: mocks.useStateMock,
    useEffect: mocks.useEffectMock,
    useRef: mocks.useRefMock,
    useCallback: mocks.useCallbackMock,
  };
});

// ─── window stub for the keyboard-listener effect ───────────────────────────

const windowListeners = vi.hoisted(() => ({
  added: [] as Array<{ event: string; handler: (e: unknown) => void }>,
  removed: [] as Array<{ event: string; handler: (e: unknown) => void }>,
}));

beforeEach(() => {
  windowListeners.added.length = 0;
  windowListeners.removed.length = 0;
  vi.stubGlobal('window', {
    addEventListener: (event: string, handler: (e: unknown) => void) => {
      windowListeners.added.push({ event, handler });
    },
    removeEventListener: (event: string, handler: (e: unknown) => void) => {
      windowListeners.removed.push({ event, handler });
    },
  });
  mocks.__reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Import AFTER mocks are registered.
import { useCanvasMouseEvents } from '../use-canvas-mouse-events';
import type { ViewState, CanvasNode } from '../../components/svg-canvas';
import type { Point } from '../use-canvas-utils';

// ─── Harness ────────────────────────────────────────────────────────────────

interface CaptureArgs {
  svgRect?: { left: number; top: number; width?: number; height?: number } | null;
  viewState?: ViewState;
  nodes?: CanvasNode[];
  screenToCanvas?: (sx: number, sy: number) => Point;
  onViewStateChange?: (viewState: ViewState) => void;
  onNodeMove?: (nodeId: string, x: number, y: number) => void;
  onNodeResize?: (nodeId: string, width: number, height: number, x?: number, y?: number) => void;
  onSelect?: (nodeIds: string[]) => void;
  gridSize?: number;
  snapToGrid?: boolean;
}

interface CaptureResult {
  hookReturn: ReturnType<typeof useCanvasMouseEvents>;
  spies: {
    onViewStateChange: ReturnType<typeof vi.fn>;
    onNodeMove: ReturnType<typeof vi.fn>;
    onNodeResize: ReturnType<typeof vi.fn>;
    onSelect: ReturnType<typeof vi.fn>;
    screenToCanvas: ReturnType<typeof vi.fn>;
  };
}

function captureHook(args: CaptureArgs = {}): CaptureResult {
  const onViewStateChange = vi.fn(args.onViewStateChange ?? (() => {}));
  const onNodeMove = vi.fn(args.onNodeMove ?? (() => {}));
  const onNodeResize = vi.fn(args.onNodeResize ?? (() => {}));
  const onSelect = vi.fn(args.onSelect ?? (() => {}));
  const defaultScreenToCanvas = (sx: number, sy: number) => ({ x: sx, y: sy });
  const screenToCanvas = vi.fn(args.screenToCanvas ?? defaultScreenToCanvas);

  const svgRect = args.svgRect === null
    ? null
    : args.svgRect ?? { left: 0, top: 0, width: 1000, height: 1000 };
  const svgEl = svgRect
    ? ({
        getBoundingClientRect: () => ({ ...svgRect, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
      } as unknown as SVGSVGElement)
    : null;
  const svgRef = { current: svgEl } as React.RefObject<SVGSVGElement>;

  // Explicit-key check distinguishes "onNodeResize omitted → use spy" from
  // "onNodeResize: undefined → opt out of the callback entirely".
  const onNodeResizeProp = 'onNodeResize' in args
    ? (args.onNodeResize as typeof onNodeResize | undefined)
    : onNodeResize;

  const props = {
    svgRef,
    viewState: args.viewState ?? { scale: 1, panX: 0, panY: 0 },
    nodes: args.nodes ?? [],
    screenToCanvas,
    onViewStateChange,
    onNodeMove,
    onNodeResize: onNodeResizeProp,
    onSelect,
    gridSize: args.gridSize,
    snapToGrid: args.snapToGrid,
  };

  let captured: ReturnType<typeof useCanvasMouseEvents> | undefined;
  function Probe(): ReactElement {
    captured = useCanvasMouseEvents(props);
    return createElement('div');
  }
  renderToString(createElement(Probe));
  if (!captured) throw new Error('Probe did not render');
  return {
    hookReturn: captured,
    spies: { onViewStateChange, onNodeMove, onNodeResize, onSelect, screenToCanvas },
  };
}

// ─── Mouse-event helpers ────────────────────────────────────────────────────

function makeMouseEvent(overrides: {
  button?: number;
  clientX?: number;
  clientY?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  deltaY?: number;
}) {
  return {
    button: overrides.button ?? 0,
    clientX: overrides.clientX ?? 0,
    clientY: overrides.clientY ?? 0,
    ctrlKey: overrides.ctrlKey ?? false,
    metaKey: overrides.metaKey ?? false,
    shiftKey: overrides.shiftKey ?? false,
    deltaY: overrides.deltaY ?? 0,
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent & React.WheelEvent;
}

function makeNode(overrides: Partial<CanvasNode> & { id: string }): CanvasNode {
  return {
    id: overrides.id,
    type: overrides.type ?? 'block',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 60,
    label: overrides.label ?? overrides.id,
    parentId: overrides.parentId ?? null,
    data: overrides.data ?? {},
  } as CanvasNode;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasMouseEvents — return shape', () => {
  it('exposes the seven public fields', () => {
    const { hookReturn } = captureHook();
    expect(typeof hookReturn.handleWheel).toBe('function');
    expect(typeof hookReturn.handleMouseDown).toBe('function');
    expect(typeof hookReturn.handleMouseMove).toBe('function');
    expect(typeof hookReturn.handleMouseUp).toBe('function');
    expect(typeof hookReturn.getCursor).toBe('function');
    expect(hookReturn.dragState).toMatchObject(initialDragState);
    expect(hookReturn.spacePressed).toBe(false);
  });
});

describe('useCanvasMouseEvents — useEffect: keyboard listeners', () => {
  it('registers keydown/keyup listeners on window', () => {
    captureHook();
    const events = windowListeners.added.map((e) => e.event);
    expect(events).toContain('keydown');
    expect(events).toContain('keyup');
  });

  it('cleanup removes both listeners', () => {
    captureHook();
    // Trigger the cleanup function captured by the useEffect mock.
    expect(mocks.effectCleanups.length).toBeGreaterThan(0);
    mocks.effectCleanups[0]();
    const removed = windowListeners.removed.map((e) => e.event);
    expect(removed).toContain('keydown');
    expect(removed).toContain('keyup');
  });

  it('keydown for Space (no repeat) writes spacePressed=true', () => {
    captureHook();
    const keydown = windowListeners.added.find((e) => e.event === 'keydown')!.handler;
    keydown({ code: 'Space', repeat: false } as unknown);
    expect(mocks.spaceSlot.current).toBe(true);
  });

  it('keydown for Space with repeat=true is ignored', () => {
    captureHook();
    const keydown = windowListeners.added.find((e) => e.event === 'keydown')!.handler;
    keydown({ code: 'Space', repeat: true } as unknown);
    expect(mocks.spaceSlot.current).toBe(false);
  });

  it('keydown for non-Space key is ignored', () => {
    captureHook();
    const keydown = windowListeners.added.find((e) => e.event === 'keydown')!.handler;
    keydown({ code: 'KeyA', repeat: false } as unknown);
    expect(mocks.spaceSlot.current).toBe(false);
  });

  it('keyup for Space writes spacePressed=false', () => {
    captureHook();
    // First press to flip true.
    const keydown = windowListeners.added.find((e) => e.event === 'keydown')!.handler;
    keydown({ code: 'Space', repeat: false } as unknown);
    expect(mocks.spaceSlot.current).toBe(true);

    const keyup = windowListeners.added.find((e) => e.event === 'keyup')!.handler;
    keyup({ code: 'Space' } as unknown);
    expect(mocks.spaceSlot.current).toBe(false);
  });

  it('keyup for non-Space key is ignored', () => {
    captureHook();
    // Set spacePressed via direct mutation so we can detect a no-op cleanly.
    mocks.spaceSlot.current = true;
    const keyup = windowListeners.added.find((e) => e.event === 'keyup')!.handler;
    keyup({ code: 'KeyA' } as unknown);
    expect(mocks.spaceSlot.current).toBe(true);
  });
});

describe('useCanvasMouseEvents — handleWheel', () => {
  it('preventDefaults and zooms in on negative deltaY (zoom-to-cursor)', () => {
    const { hookReturn, spies } = captureHook({
      viewState: { scale: 1, panX: 0, panY: 0 },
    });
    const ev = makeMouseEvent({ deltaY: -100, clientX: 100, clientY: 0 });
    hookReturn.handleWheel(ev);
    expect(ev.preventDefault).toHaveBeenCalled();
    // newScale = 1 * exp(0.2) ≈ 1.221
    const call = spies.onViewStateChange.mock.calls[0][0] as ViewState;
    expect(call.scale).toBeGreaterThan(1);
    expect(call.scale).toBeLessThan(2); // bounded by SCALE_MAX
  });

  it('zooms out on positive deltaY', () => {
    const { hookReturn, spies } = captureHook({
      viewState: { scale: 1, panX: 0, panY: 0 },
    });
    const ev = makeMouseEvent({ deltaY: 100, clientX: 0, clientY: 0 });
    hookReturn.handleWheel(ev);
    const call = spies.onViewStateChange.mock.calls[0][0] as ViewState;
    expect(call.scale).toBeLessThan(1);
  });

  it('clamps scale to SCALE_MAX (2)', () => {
    const { hookReturn, spies } = captureHook({
      viewState: { scale: 1.99, panX: 0, panY: 0 },
    });
    hookReturn.handleWheel(makeMouseEvent({ deltaY: -1000, clientX: 0, clientY: 0 }));
    const call = spies.onViewStateChange.mock.calls[0][0] as ViewState;
    expect(call.scale).toBe(2);
  });

  it('clamps scale to SCALE_MIN (0.1)', () => {
    const { hookReturn, spies } = captureHook({
      viewState: { scale: 0.11, panX: 0, panY: 0 },
    });
    hookReturn.handleWheel(makeMouseEvent({ deltaY: 1000, clientX: 0, clientY: 0 }));
    const call = spies.onViewStateChange.mock.calls[0][0] as ViewState;
    expect(call.scale).toBe(0.1);
  });

  it('returns early when svgRef.current is null (no viewstate change)', () => {
    const { hookReturn, spies } = captureHook({ svgRect: null });
    const ev = makeMouseEvent({ deltaY: -100 });
    hookReturn.handleWheel(ev);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(spies.onViewStateChange).not.toHaveBeenCalled();
  });

  it('zoom adjusts pan to keep mouse position stable', () => {
    const { hookReturn, spies } = captureHook({
      viewState: { scale: 1, panX: 0, panY: 0 },
    });
    hookReturn.handleWheel(makeMouseEvent({ deltaY: -100, clientX: 100, clientY: 200 }));
    const call = spies.onViewStateChange.mock.calls[0][0] as ViewState;
    // newPanX = 100 - (100 - 0) * scaleRatio = 100 * (1 - scaleRatio) — negative since scaleRatio>1.
    expect(call.panX).toBeLessThan(0);
    expect(call.panY).toBeLessThan(0);
  });
});

describe('useCanvasMouseEvents — handleMouseDown', () => {
  it('right-click (button=2) is ignored entirely', () => {
    const { hookReturn, spies } = captureHook();
    hookReturn.handleMouseDown(makeMouseEvent({ button: 2 }));
    expect(spies.onSelect).not.toHaveBeenCalled();
    expect(mocks.dragSlot.current).toMatchObject(initialDragState);
  });

  it('middle-click (button=1) starts canvas pan', () => {
    const { hookReturn } = captureHook();
    const ev = makeMouseEvent({ button: 1, clientX: 50, clientY: 60 });
    hookReturn.handleMouseDown(ev);
    expect(ev.preventDefault).toHaveBeenCalled();
    const ds = mocks.dragSlot.current as DragStateShape;
    expect(ds.isDragging).toBe(true);
    expect(ds.dragType).toBe('canvas');
    expect(ds.startPos).toEqual({ x: 50, y: 60 });
  });

  it('left-click + Space pressed starts canvas pan', () => {
    // Pre-flip space via the slot directly (simpler than chaining captures).
    mocks.spaceSlot.current = true;
    const { hookReturn } = captureHook();
    const ev = makeMouseEvent({ button: 0, clientX: 10, clientY: 20 });
    hookReturn.handleMouseDown(ev);
    expect(ev.preventDefault).toHaveBeenCalled();
    const ds = mocks.dragSlot.current as DragStateShape;
    expect(ds.dragType).toBe('canvas');
  });

  it('left-click on empty canvas (no node hit) clears selection + starts pan', () => {
    const { hookReturn, spies } = captureHook({ nodes: [] });
    hookReturn.handleMouseDown(makeMouseEvent({ clientX: 100, clientY: 100 }));
    expect(spies.onSelect).toHaveBeenCalledWith([]);
    const ds = mocks.dragSlot.current as DragStateShape;
    expect(ds.dragType).toBe('canvas');
  });

  it('left-click on empty canvas with Ctrl: skips clearing selection', () => {
    const { hookReturn, spies } = captureHook({ nodes: [] });
    hookReturn.handleMouseDown(makeMouseEvent({ clientX: 0, clientY: 0, ctrlKey: true }));
    expect(spies.onSelect).not.toHaveBeenCalled();
    const ds = mocks.dragSlot.current as DragStateShape;
    expect(ds.dragType).toBe('canvas');
  });

  it('left-click on a node: selects it and starts element drag', () => {
    const node = makeNode({ id: 'a', x: 0, y: 0, width: 100, height: 60 });
    const { hookReturn, spies } = captureHook({ nodes: [node] });
    hookReturn.handleMouseDown(makeMouseEvent({ clientX: 50, clientY: 30 }));
    expect(spies.onSelect).toHaveBeenCalledWith(['a']);
    const ds = mocks.dragSlot.current as DragStateShape;
    expect(ds.dragType).toBe('element');
    expect(ds.draggedNodeId).toBe('a');
    expect(ds.dragOffset).toEqual({ x: 50, y: 30 }); // canvasPos - node origin
  });

  it('left-click on a node + Ctrl: skips onSelect but still drags', () => {
    const node = makeNode({ id: 'a', x: 0, y: 0, width: 100, height: 60 });
    const { hookReturn, spies } = captureHook({ nodes: [node] });
    hookReturn.handleMouseDown(makeMouseEvent({ clientX: 50, clientY: 30, ctrlKey: true }));
    expect(spies.onSelect).not.toHaveBeenCalled();
    const ds = mocks.dragSlot.current as DragStateShape;
    expect(ds.dragType).toBe('element');
  });

  it('left-click on resize handle (SE corner) starts resize drag', () => {
    // Resize handle hit-test: bottom-right corner within RESIZE_HANDLE_SIZE/scale.
    // node at (0,0,100,60). Click at (90, 50) — inside the SE handle.
    const node = makeNode({ id: 'a', x: 0, y: 0, width: 100, height: 60 });
    const { hookReturn } = captureHook({ nodes: [node] });
    hookReturn.handleMouseDown(makeMouseEvent({ clientX: 95, clientY: 55 }));
    const ds = mocks.dragSlot.current as DragStateShape;
    expect(ds.dragType).toBe('resize');
    expect(ds.resizeHandle).toBe('se');
    expect(ds.originalBounds).toEqual({ x: 0, y: 0, width: 100, height: 60 });
  });

  it('left-click on resize handle + onNodeResize undefined: falls through to element drag', () => {
    const node = makeNode({ id: 'a', x: 0, y: 0, width: 100, height: 60 });
    // Pass undefined explicitly (CaptureArgs treats undefined as "explicit opt-out").
    const { hookReturn } = captureHook({ nodes: [node], onNodeResize: undefined });
    hookReturn.handleMouseDown(makeMouseEvent({ clientX: 95, clientY: 55 }));
    const ds = mocks.dragSlot.current as DragStateShape;
    // Without onNodeResize, the resize-branch's `&& onNodeResize` short-circuits
    // and falls into the element-drag branch.
    expect(ds.dragType).toBe('element');
  });

  it('node selection prefers children over parents (sortedNodes order)', () => {
    // Parent fully contains the child. Click position is inside both.
    // Children-first sort means the child is selected.
    const parent = makeNode({ id: 'p', x: 0, y: 0, width: 200, height: 200 });
    const child = makeNode({ id: 'c', x: 50, y: 50, width: 50, height: 50, parentId: 'p' });
    const { hookReturn, spies } = captureHook({ nodes: [parent, child] });
    hookReturn.handleMouseDown(makeMouseEvent({ clientX: 75, clientY: 75 }));
    expect(spies.onSelect).toHaveBeenCalledWith(['c']);
  });

  it('node selection with parent listed AFTER child still picks child', () => {
    // Reverse the array order — sort still places the child first.
    const child = makeNode({ id: 'c', x: 50, y: 50, width: 50, height: 50, parentId: 'p' });
    const parent = makeNode({ id: 'p', x: 0, y: 0, width: 200, height: 200 });
    const { hookReturn, spies } = captureHook({ nodes: [child, parent] });
    hookReturn.handleMouseDown(makeMouseEvent({ clientX: 75, clientY: 75 }));
    expect(spies.onSelect).toHaveBeenCalledWith(['c']);
  });

  it('returns unhit for no-parent node when click is outside', () => {
    // A bare node + a click far outside it → no hit, click clears selection.
    const node = makeNode({ id: 'a', x: 0, y: 0, width: 50, height: 50 });
    const { hookReturn, spies } = captureHook({ nodes: [node] });
    hookReturn.handleMouseDown(makeMouseEvent({ clientX: 1000, clientY: 1000 }));
    expect(spies.onSelect).toHaveBeenCalledWith([]);
  });

  it('compares b.parentId not a.parentId when sorting (returns 1 branch)', () => {
    // First node has no parent; second has a parent. Sort returns 1 → second
    // node ('child') is moved before. This pins the `1` branch of the sort
    // comparator at L181-185.
    const noParent = makeNode({ id: 'np', x: 0, y: 0, width: 50, height: 50 });
    const child = makeNode({ id: 'c', x: 100, y: 100, width: 50, height: 50, parentId: 'np' });
    const { hookReturn, spies } = captureHook({ nodes: [noParent, child] });
    hookReturn.handleMouseDown(makeMouseEvent({ clientX: 25, clientY: 25 }));
    expect(spies.onSelect).toHaveBeenCalledWith(['np']);
  });

  it('sort comparator returns 0 when both nodes have parents (L184)', () => {
    // When both `a.parentId` and `b.parentId` are truthy, neither earlier
    // branch fires; the comparator falls through to `return 0` at L184.
    const a = makeNode({ id: 'a', x: 0, y: 0, width: 50, height: 50, parentId: 'p' });
    const b = makeNode({ id: 'b', x: 100, y: 100, width: 50, height: 50, parentId: 'p' });
    const parent = makeNode({ id: 'p', x: 0, y: 0, width: 200, height: 200 });
    const { hookReturn, spies } = captureHook({ nodes: [a, b, parent] });
    // Click inside 'a'; selection lands on 'a' (children-first sort kept order).
    hookReturn.handleMouseDown(makeMouseEvent({ clientX: 25, clientY: 25 }));
    expect(spies.onSelect).toHaveBeenCalledWith(['a']);
  });
});

describe('useCanvasMouseEvents — handleMouseMove', () => {
  it('returns early when not dragging', () => {
    const { hookReturn, spies } = captureHook();
    // dragState has isDragging=false by default — move should noop.
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 100, clientY: 100 }));
    expect(spies.onViewStateChange).not.toHaveBeenCalled();
    expect(spies.onNodeMove).not.toHaveBeenCalled();
  });

  it('canvas pan: applies delta to viewState.panX/Y', () => {
    // Pre-seed dragState as canvas-pan-in-flight.
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'canvas' as const,
      startPos: { x: 50, y: 50 },
    };
    // Pre-seed lastPanPos.
    mocks.refSlots[0] = { current: { x: 50, y: 50 } };

    const { hookReturn, spies } = captureHook({
      viewState: { scale: 1, panX: 100, panY: 200 },
    });
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 70, clientY: 80 }));
    // dx=20, dy=30 → panX=120, panY=230.
    expect(spies.onViewStateChange).toHaveBeenCalledWith({
      scale: 1,
      panX: 120,
      panY: 230,
    });
  });

  it('element drag: emits onNodeMove with offset-corrected position', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'element' as const,
      draggedNodeId: 'a',
      dragOffset: { x: 10, y: 20 },
    };

    const { hookReturn, spies } = captureHook();
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 100, clientY: 200 }));
    // canvasPos = (100, 200), offset (10,20) → newX=90, newY=180.
    expect(spies.onNodeMove).toHaveBeenCalledWith('a', 90, 180);
  });

  it('element drag with snapToGrid: snaps to grid increment', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'element' as const,
      draggedNodeId: 'a',
      dragOffset: { x: 0, y: 0 },
    };

    const { hookReturn, spies } = captureHook({ snapToGrid: true, gridSize: 20 });
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 23, clientY: 47 }));
    // 23 → 20, 47 → 40.
    expect(spies.onNodeMove).toHaveBeenCalledWith('a', 20, 40);
  });

  it('element drag with snapToGrid + gridSize=0: no snap', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'element' as const,
      draggedNodeId: 'a',
      dragOffset: { x: 0, y: 0 },
    };

    const { hookReturn, spies } = captureHook({ snapToGrid: true, gridSize: 0 });
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 23, clientY: 47 }));
    expect(spies.onNodeMove).toHaveBeenCalledWith('a', 23, 47);
  });

  it('resize drag: emits onNodeResize with clamped dimensions', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'resize' as const,
      draggedNodeId: 'a',
      resizeHandle: 'se' as const,
      originalBounds: { x: 0, y: 0, width: 100, height: 60 },
    };

    const { hookReturn, spies } = captureHook();
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 200, clientY: 150 }));
    // newWidth = max(100, 200-0)=200, newHeight = max(60, 150-0)=150.
    expect(spies.onNodeResize).toHaveBeenCalledWith('a', 200, 150, 0, 0);
  });

  it('resize drag clamps to width >= 100, height >= 60', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'resize' as const,
      draggedNodeId: 'a',
      resizeHandle: 'se' as const,
      originalBounds: { x: 0, y: 0, width: 100, height: 60 },
    };

    const { hookReturn, spies } = captureHook();
    // canvasPos at (10, 5) → newWidth=max(100, 10)=100, newHeight=max(60, 5)=60.
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 10, clientY: 5 }));
    expect(spies.onNodeResize).toHaveBeenCalledWith('a', 100, 60, 0, 0);
  });

  it('resize drag without onNodeResize is a no-op', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'resize' as const,
      draggedNodeId: 'a',
      resizeHandle: 'se' as const,
      originalBounds: { x: 0, y: 0, width: 100, height: 60 },
    };

    const { hookReturn, spies } = captureHook({ onNodeResize: undefined });
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 200, clientY: 150 }));
    expect(spies.onNodeResize).not.toHaveBeenCalled();
  });

  it('resize drag without resizeHandle="se" is a no-op (only SE is implemented)', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'resize' as const,
      draggedNodeId: 'a',
      resizeHandle: 'nw' as const,
      originalBounds: { x: 0, y: 0, width: 100, height: 60 },
    };

    const { hookReturn, spies } = captureHook();
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 200, clientY: 150 }));
    // resizeHandle='nw' but only 'se' has a body — bounds pass through unchanged.
    expect(spies.onNodeResize).toHaveBeenCalledWith('a', 100, 60, 0, 0);
  });

  it('resize drag with originalBounds=null is a no-op', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'resize' as const,
      draggedNodeId: 'a',
      originalBounds: null,
    };

    const { hookReturn, spies } = captureHook();
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 200, clientY: 150 }));
    expect(spies.onNodeResize).not.toHaveBeenCalled();
  });

  it('element drag with draggedNodeId=null is a no-op', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'element' as const,
      draggedNodeId: null,
      dragOffset: { x: 0, y: 0 },
    };

    const { hookReturn, spies } = captureHook();
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 50, clientY: 50 }));
    expect(spies.onNodeMove).not.toHaveBeenCalled();
  });

  it('non-canvas/non-element/non-resize dragType: no callbacks fire', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'connection' as const,
    };

    const { hookReturn, spies } = captureHook();
    hookReturn.handleMouseMove(makeMouseEvent({ clientX: 50, clientY: 50 }));
    expect(spies.onNodeMove).not.toHaveBeenCalled();
    expect(spies.onNodeResize).not.toHaveBeenCalled();
    expect(spies.onViewStateChange).not.toHaveBeenCalled();
  });
});

describe('useCanvasMouseEvents — handleMouseUp', () => {
  it('resets dragState to all-zero / null', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'element' as const,
      draggedNodeId: 'a',
    };

    const { hookReturn } = captureHook();
    hookReturn.handleMouseUp();
    expect(mocks.dragSlot.current).toEqual(initialDragState);
  });
});

describe('useCanvasMouseEvents — getCursor', () => {
  it('returns "default" when nothing is happening', () => {
    const { hookReturn } = captureHook();
    expect(hookReturn.getCursor()).toBe('default');
  });

  it('returns "grab" when space is pressed but not dragging', () => {
    mocks.spaceSlot.current = true;
    const { hookReturn } = captureHook();
    expect(hookReturn.getCursor()).toBe('grab');
  });

  it('returns "grabbing" when canvas is being dragged', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'canvas' as const,
    };
    const { hookReturn } = captureHook();
    expect(hookReturn.getCursor()).toBe('grabbing');
  });

  it('returns "se-resize" when resize is in flight', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      dragType: 'resize' as const,
    };
    const { hookReturn } = captureHook();
    expect(hookReturn.getCursor()).toBe('se-resize');
  });

  it('returns "move" when an element is being dragged', () => {
    mocks.dragSlot.current = {
      ...initialDragState,
      dragType: 'element' as const,
    };
    const { hookReturn } = captureHook();
    expect(hookReturn.getCursor()).toBe('move');
  });

  it('returns "grabbing" when canvas-drag is active and space is pressed (priority)', () => {
    mocks.spaceSlot.current = true;
    mocks.dragSlot.current = {
      ...initialDragState,
      isDragging: true,
      dragType: 'canvas' as const,
    };
    const { hookReturn } = captureHook();
    expect(hookReturn.getCursor()).toBe('grabbing');
  });
});

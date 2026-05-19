/**
 * rf-canv2-3 — useCanvasHandlers hook tests.
 *
 * Tests run in a node-only vitest environment. The hook is exercised via
 * the Provider + capture-ref pattern from rf-canv-20. Two `useState`
 * slots (hoveredNodeId, connTooltip) are mocked with a per-slot mutable
 * backing store routed by call-index (the hook calls useState in fixed
 * source order: hoveredNodeId first, then connTooltip).
 *
 * `useDispatch` flows through Redux Provider with a real store so we can
 * assert dispatched-action shapes via `vi.spyOn(store, 'dispatch')`.
 *
 * Per the rf-pdpl-20 learning, action-payload casts use the `unknown`
 * roundtrip (`as unknown as { payload: ... }`) to satisfy TS2352.
 */

import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
// Two useState slots routed by call-index. Each slot has a mutable
// backing value + a setter spy.
const mocks = vi.hoisted(() => ({
  callIndex: { current: 0 as number },
  hoveredSlot: { current: null as string | null },
  setHoveredSpy: vi.fn<(next: string | null) => void>(),
  connTooltipSlot: { current: null as unknown },
  setConnTooltipSpy: vi.fn<(next: unknown) => void>(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(initial: T | (() => T)) => {
      void initial;
      const idx = mocks.callIndex.current;
      mocks.callIndex.current += 1;
      if (idx === 0) {
        const setter = (next: T) => {
          mocks.setHoveredSpy(next as unknown as string | null);
          mocks.hoveredSlot.current = next as unknown as string | null;
        };
        return [mocks.hoveredSlot.current as unknown as T, setter as unknown];
      }
      const setter = (next: T) => {
        mocks.setConnTooltipSpy(next as unknown);
        mocks.connTooltipSlot.current = next as unknown;
      };
      return [mocks.connTooltipSlot.current as unknown as T, setter as unknown];
    }),
  };
});

// Import AFTER the react mock is registered.
import cardsReducer from '../../../../store/slices/cards-slice';
import selectionReducer from '../../../../store/slices/selection-slice';
import uiReducer from '../../../../store/slices/ui-slice';
import { useCanvasHandlers, type UseCanvasHandlersResult } from '../use-canvas-handlers';
import type { ConnectionTooltipInfo } from '../../components/svg-connection-path';

// ─── Store builder ──────────────────────────────────────────────────────────

const makeStore = () => {
  const initialCards = cardsReducer(undefined as any, { type: '@@INIT' });

  const initialSelection = selectionReducer(undefined as any, { type: '@@INIT' });

  const initialUi = uiReducer(undefined as any, { type: '@@INIT' });
  return configureStore({
    reducer: {
      cards: cardsReducer,
      selection: selectionReducer,
      ui: uiReducer,
    },
    preloadedState: {
      cards: initialCards,
      selection: initialSelection,
      ui: initialUi,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
};

type TestStore = ReturnType<typeof makeStore>;

// ─── Probe ──────────────────────────────────────────────────────────────────

interface CaptureArgs {
  selectedNodes?: string[];
  viewport?: { x: number; y: number; zoom: number };
  svgRef?: React.RefObject<SVGSVGElement | null>;
  onFocus?: () => void;
}

const captureHook = (store: TestStore, args: CaptureArgs = {}): UseCanvasHandlersResult => {
  const captured: { current?: UseCanvasHandlersResult } = {};
  const Probe: React.FC = () => {
    captured.current = useCanvasHandlers({
      selectedNodes: args.selectedNodes ?? [],
      viewport: args.viewport ?? { x: 0, y: 0, zoom: 1 },
      svgRef: args.svgRef ?? React.createRef<SVGSVGElement>(),
      onFocus: args.onFocus,
    });
    return React.createElement('div', null, 'probe');
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.callIndex.current = 0;
  mocks.hoveredSlot.current = null;
  mocks.connTooltipSlot.current = null;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasHandlers — initial state', () => {
  it('starts with hoveredNodeId === null and connTooltip === null', () => {
    const result = captureHook(makeStore());
    expect(result.hoveredNodeId).toBeNull();
    expect(result.connTooltip).toBeNull();
  });

  it('exposes 13 members on the result shape', () => {
    const result = captureHook(makeStore());
    expect(typeof result.handleDeleteSelected).toBe('function');
    expect(typeof result.handleNodeHover).toBe('function');
    expect(typeof result.handleConnectionHover).toBe('function');
    expect(typeof result.handleEdgeDelete).toBe('function');
    expect(typeof result.handleEdgeSelect).toBe('function');
    expect(typeof result.handleUpdateNodeData).toBe('function');
    expect(typeof result.handlePipelineClick).toBe('function');
    expect(typeof result.handleContextMenu).toBe('function');
    expect(typeof result.handleCanvasClick).toBe('function');
    expect(typeof result.setHoveredNodeId).toBe('function');
    expect(typeof result.setConnTooltip).toBe('function');
  });
});

describe('useCanvasHandlers — handleDeleteSelected', () => {
  it('dispatches deleteCardNode for each selected id then clears the selection', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store, { selectedNodes: ['a', 'b'] });
    dispatchSpy.mockClear();

    result.handleDeleteSelected();

    // 2 deleteCardNode + 1 setSelectedNodes([]) = 3 dispatches
    expect(dispatchSpy).toHaveBeenCalledTimes(3);
    const call0 = dispatchSpy.mock.calls[0][0] as unknown as { type: string; payload: string };
    const call1 = dispatchSpy.mock.calls[1][0] as unknown as { type: string; payload: string };
    const call2 = dispatchSpy.mock.calls[2][0] as unknown as { type: string; payload: string[] };
    expect(call0.type).toBe('cards/deleteCardNode');
    expect(call0.payload).toBe('a');
    expect(call1.type).toBe('cards/deleteCardNode');
    expect(call1.payload).toBe('b');
    expect(call2.type).toBe('selection/setSelectedNodes');
    expect(call2.payload).toEqual([]);
  });

  it('still dispatches setSelectedNodes([]) even when nothing was selected', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store, { selectedNodes: [] });
    dispatchSpy.mockClear();

    result.handleDeleteSelected();

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const call = dispatchSpy.mock.calls[0][0] as unknown as { type: string };
    expect(call.type).toBe('selection/setSelectedNodes');
  });
});

describe('useCanvasHandlers — hover setters', () => {
  it('handleNodeHover writes the new id into the hoveredNodeId slot', () => {
    const result = captureHook(makeStore());
    result.handleNodeHover('node-X');
    expect(mocks.setHoveredSpy).toHaveBeenCalledWith('node-X');
    expect(mocks.hoveredSlot.current).toBe('node-X');
  });

  it('handleNodeHover accepts null to clear the hover', () => {
    mocks.hoveredSlot.current = 'node-Y';
    const result = captureHook(makeStore());
    result.handleNodeHover(null);
    expect(mocks.setHoveredSpy).toHaveBeenCalledWith(null);
    expect(mocks.hoveredSlot.current).toBeNull();
  });

  it('handleConnectionHover writes the tooltip info into connTooltip', () => {
    const result = captureHook(makeStore());
    const info: ConnectionTooltipInfo = {
      x: 10,
      y: 20,
    } as unknown as ConnectionTooltipInfo;
    result.handleConnectionHover(info);
    expect(mocks.setConnTooltipSpy).toHaveBeenCalledWith(info);
    expect(mocks.connTooltipSlot.current).toBe(info);
  });
});

describe('useCanvasHandlers — handleEdgeDelete / handleEdgeSelect', () => {
  it('handleEdgeDelete dispatches deleteCardEdge with the connection id', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    result.handleEdgeDelete('edge-1');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const call = dispatchSpy.mock.calls[0][0] as unknown as { type: string; payload: string };
    expect(call.type).toBe('cards/deleteCardEdge');
    expect(call.payload).toBe('edge-1');
  });

  it('handleEdgeSelect clears node selection then sets edge selection', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    result.handleEdgeSelect('edge-1');

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    const call0 = dispatchSpy.mock.calls[0][0] as unknown as { type: string; payload: string[] };
    const call1 = dispatchSpy.mock.calls[1][0] as unknown as { type: string; payload: string[] };
    expect(call0.type).toBe('selection/setSelectedNodes');
    expect(call0.payload).toEqual([]);
    expect(call1.type).toBe('selection/setSelectedEdges');
    expect(call1.payload).toEqual(['edge-1']);
  });
});

describe('useCanvasHandlers — handleUpdateNodeData', () => {
  it('dispatches updateCardNodeData with the supplied nodeId + data payload', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    result.handleUpdateNodeData('node-1', { foo: 'bar' });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const call = dispatchSpy.mock.calls[0][0] as unknown as {
      type: string;
      payload: { nodeId: string; data: Record<string, unknown> };
    };
    expect(call.type).toBe('cards/updateCardNodeData');
    expect(call.payload).toEqual({ nodeId: 'node-1', data: { foo: 'bar' } });
  });
});

describe('useCanvasHandlers — handlePipelineClick', () => {
  it('selects the node + clears edge selection', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    result.handlePipelineClick('node-Z');

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    const call0 = dispatchSpy.mock.calls[0][0] as unknown as { type: string; payload: string[] };
    const call1 = dispatchSpy.mock.calls[1][0] as unknown as { type: string; payload: string[] };
    expect(call0.type).toBe('selection/setSelectedNodes');
    expect(call0.payload).toEqual(['node-Z']);
    expect(call1.type).toBe('selection/setSelectedEdges');
    expect(call1.payload).toEqual([]);
  });
});

describe('useCanvasHandlers — handleContextMenu', () => {
  it('dispatches openContextMenu with the supplied position + canvas-space coords', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // svgRef.current === null → canvasPos defaults to { x: 0, y: 0 }
    const result = captureHook(store);
    dispatchSpy.mockClear();

    result.handleContextMenu({ x: 100, y: 200 }, 'node', 'node-A');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const call = dispatchSpy.mock.calls[0][0] as unknown as {
      type: string;
      payload: {
        position: { x: number; y: number };
        canvasPosition: { x: number; y: number };
        type: string;
        targetId?: string;
      };
    };
    expect(call.type).toBe('ui/openContextMenu');
    expect(call.payload.position).toEqual({ x: 100, y: 200 });
    expect(call.payload.canvasPosition).toEqual({ x: 0, y: 0 });
    expect(call.payload.type).toBe('node');
    expect(call.payload.targetId).toBe('node-A');
  });

  it('translates screen position to canvas coords using viewport + svgRef rect', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Stub a rect such that (100,100) translates to (50,50) at zoom 1, pan (0,0)
    const fakeRect = { left: 50, top: 50 } as DOMRect;
    const fakeSvg = {
      getBoundingClientRect: () => fakeRect,
    } as unknown as SVGSVGElement;
    const svgRef = { current: fakeSvg } as React.RefObject<SVGSVGElement>;
    const result = captureHook(store, {
      viewport: { x: 0, y: 0, zoom: 1 },
      svgRef,
    });
    dispatchSpy.mockClear();

    result.handleContextMenu({ x: 100, y: 100 }, 'canvas');

    const call = dispatchSpy.mock.calls[0][0] as unknown as {
      type: string;
      payload: {
        canvasPosition: { x: number; y: number };
      };
    };
    expect(call.payload.canvasPosition).toEqual({ x: 50, y: 50 });
  });

  it('honors viewport pan and zoom in the canvas-space conversion', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const fakeSvg = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect,
    } as unknown as SVGSVGElement;
    const svgRef = { current: fakeSvg } as React.RefObject<SVGSVGElement>;
    // (100, 100) at viewport pan (50, 25) zoom 2 → ((100 - 50) / 2, (100 - 25) / 2) = (25, 37.5)
    const result = captureHook(store, {
      viewport: { x: 50, y: 25, zoom: 2 },
      svgRef,
    });
    dispatchSpy.mockClear();

    result.handleContextMenu({ x: 100, y: 100 }, 'edge', 'edge-1');

    const call = dispatchSpy.mock.calls[0][0] as unknown as {
      type: string;
      payload: { canvasPosition: { x: number; y: number } };
    };
    expect(call.payload.canvasPosition.x).toBe(25);
    expect(call.payload.canvasPosition.y).toBe(37.5);
  });
});

describe('useCanvasHandlers — handleCanvasClick', () => {
  it('forwards to onFocus when supplied', () => {
    const onFocus = vi.fn();
    const result = captureHook(makeStore(), { onFocus });
    result.handleCanvasClick();
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when onFocus is undefined', () => {
    const result = captureHook(makeStore());
    expect(() => result.handleCanvasClick()).not.toThrow();
  });
});

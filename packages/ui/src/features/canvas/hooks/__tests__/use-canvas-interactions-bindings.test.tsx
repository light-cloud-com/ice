/**
 * rf-svgcv2-3 — useCanvasInteractionsBindings hook tests.
 *
 * Verifies that the wrapper:
 *   1. forwards every pass-through arg to useCanvasInteractions
 *      verbatim
 *   2. injects three orchestrator-side dispatch callbacks
 *      (onSelect → setSelectedNodes + setSelectedEdges([]),
 *       onToggleSelect → toggleNodeSelection + setSelectedEdges([]),
 *       onBoxSelect → setSelectionRect)
 *   3. computes gridSize from snapToGrid (true → GRID_SIZE, false → 0)
 *
 * `useCanvasInteractions` is mocked so the test asserts on the args
 * shape that the wrapper passes in.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';

const mocks = vi.hoisted(() => ({
  useCanvasInteractions: vi.fn(),
  setSelectedNodes: vi.fn((ids: string[]) => ({ type: 'sel/setSelectedNodes', payload: ids })),
  setSelectedEdges: vi.fn((ids: string[]) => ({ type: 'sel/setSelectedEdges', payload: ids })),
  toggleNodeSelection: vi.fn((id: string) => ({ type: 'sel/toggleNodeSelection', payload: id })),
  setSelectionRect: vi.fn((rect: { x: number; y: number; width: number; height: number }) => ({
    type: 'sel/setSelectionRect',
    payload: rect,
  })),
}));

vi.mock('../use-canvas-interactions', () => ({
  useCanvasInteractions: mocks.useCanvasInteractions,
}));

vi.mock('../../../../store/slices/selection-slice', () => ({
  setSelectedNodes: mocks.setSelectedNodes,
  setSelectedEdges: mocks.setSelectedEdges,
  toggleNodeSelection: mocks.toggleNodeSelection,
  setSelectionRect: mocks.setSelectionRect,
}));

vi.mock('../../../../config/canvas-constants', () => ({
  GRID_SIZE: 16,
}));

import {
  useCanvasInteractionsBindings,
  type UseCanvasInteractionsBindingsArgs,
} from '../use-canvas-interactions-bindings';

const dummySlice = createSlice({
  name: 'noop',
  initialState: {},
  reducers: {},
});

const makeStore = () => configureStore({ reducer: { noop: dummySlice.reducer } });

const passThrough: Omit<UseCanvasInteractionsBindingsArgs, 'snapToGrid'> = {
  svgRef: { current: null } as never,
  viewport: { x: 0, y: 0, zoom: 1 },
  items: [],
  selectedIds: [],
  onViewportChange: vi.fn(),
  onItemMove: vi.fn(),
  onItemResize: vi.fn(),
  onContextMenu: vi.fn(),
  onDelete: vi.fn(),
  onDragOverGroup: vi.fn(),
  onDragEnd: vi.fn(),
  locked: false,
};

let captured: Parameters<typeof mocks.useCanvasInteractions>[0] | undefined;

function Probe(args: UseCanvasInteractionsBindingsArgs) {
  useCanvasInteractionsBindings(args);
  return null;
}

const render = (args: UseCanvasInteractionsBindingsArgs) => {
  captured = undefined;
  mocks.useCanvasInteractions.mockImplementation((a: unknown) => {
    captured = a as Parameters<typeof mocks.useCanvasInteractions>[0];
    return { bindCanvas: {}, cursor: 'default', screenToCanvas: vi.fn() } as never;
  });
  const store = makeStore();
  renderToStaticMarkup(
    React.createElement(Provider, { store }, React.createElement(Probe, args)),
  );
};

describe('useCanvasInteractionsBindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards pass-through args to useCanvasInteractions verbatim', () => {
    render({ ...passThrough, snapToGrid: false });
    expect(captured).toBeDefined();
    expect(captured!.svgRef).toBe(passThrough.svgRef);
    expect(captured!.viewport).toEqual(passThrough.viewport);
    expect(captured!.items).toBe(passThrough.items);
    expect(captured!.selectedIds).toBe(passThrough.selectedIds);
    expect(captured!.onViewportChange).toBe(passThrough.onViewportChange);
    expect(captured!.onItemMove).toBe(passThrough.onItemMove);
    expect(captured!.onItemResize).toBe(passThrough.onItemResize);
    expect(captured!.onContextMenu).toBe(passThrough.onContextMenu);
    expect(captured!.onDelete).toBe(passThrough.onDelete);
    expect(captured!.onDragOverGroup).toBe(passThrough.onDragOverGroup);
    expect(captured!.onDragEnd).toBe(passThrough.onDragEnd);
    expect(captured!.locked).toBe(false);
  });

  it('injects the three selection-dispatch callbacks (onSelect / onToggleSelect / onBoxSelect)', () => {
    render({ ...passThrough, snapToGrid: false });
    expect(typeof captured!.onSelect).toBe('function');
    expect(typeof captured!.onToggleSelect).toBe('function');
    expect(typeof captured!.onBoxSelect).toBe('function');
  });

  it('onSelect dispatches setSelectedNodes(ids) AND setSelectedEdges([])', () => {
    render({ ...passThrough, snapToGrid: false });
    captured!.onSelect!(['a', 'b']);
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith(['a', 'b']);
    expect(mocks.setSelectedEdges).toHaveBeenCalledWith([]);
  });

  it('onToggleSelect dispatches toggleNodeSelection(id) AND setSelectedEdges([])', () => {
    render({ ...passThrough, snapToGrid: false });
    captured!.onToggleSelect!('a');
    expect(mocks.toggleNodeSelection).toHaveBeenCalledWith('a');
    expect(mocks.setSelectedEdges).toHaveBeenCalledWith([]);
  });

  it('onBoxSelect dispatches setSelectionRect(rect)', () => {
    render({ ...passThrough, snapToGrid: false });
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    captured!.onBoxSelect!(rect);
    expect(mocks.setSelectionRect).toHaveBeenCalledWith(rect);
  });

  it('passes gridSize: GRID_SIZE when snapToGrid is true', () => {
    render({ ...passThrough, snapToGrid: true });
    expect(captured!.gridSize).toBe(16);
  });

  it('passes gridSize: 0 when snapToGrid is false', () => {
    render({ ...passThrough, snapToGrid: false });
    expect(captured!.gridSize).toBe(0);
  });

  it('does NOT leak the snapToGrid prop into the inner args object', () => {
    render({ ...passThrough, snapToGrid: true });
    expect((captured as Record<string, unknown>).snapToGrid).toBeUndefined();
  });
});

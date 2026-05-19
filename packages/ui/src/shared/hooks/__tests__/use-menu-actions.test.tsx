/**
 * useMenuActions — listens for IPC menu events from the Electron main process
 * (or web platform stubs) and dispatches Redux actions.
 *
 * Test strategy:
 *   - Mock React's `useEffect` to fire synchronously and capture the cleanup.
 *   - Mock `getApi` to return a fake api whose `onMenuAction` captures the
 *     callback and `dialog.openFile` / `saveFile` return controllable values.
 *   - Mount via Provider + Probe + renderToString, capture `dispatch` via
 *     `vi.spyOn(store, 'dispatch')`.
 *   - Drive each switch arm by invoking the captured callback with the
 *     matching action string and assert the dispatched action types.
 */

import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  onMenuActionCb: null as null | ((action: string) => Promise<void> | void),
  cleanupSpy: vi.fn(),
  openFile: vi.fn(),
  saveFile: vi.fn(),
}));

vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void)) => {
      const cleanup = cb();
      mocks.effects.push(() => {
        if (typeof cleanup === 'function') cleanup();
      });
    },
  };
});

vi.mock('../../api/api-adapter', () => ({
  getApi: () => ({
    onMenuAction: (cb: (action: string) => Promise<void> | void) => {
      mocks.onMenuActionCb = cb;
      return mocks.cleanupSpy;
    },
    dialog: {
      openFile: mocks.openFile,
      saveFile: mocks.saveFile,
    },
  }),
}));

// Mock the redux thunks so they dispatch a recognizable action type
// without making real network calls.
vi.mock('../../../store/slices/graph-slice', async (orig) => {
  const actual = await orig<typeof import('../../../store/slices/graph-slice')>();
  return {
    ...actual,
    initializeGraph: () => ({ type: 'graph/initializeGraph-mock' }),
    loadGraph: (filePath: string) => ({ type: 'graph/loadGraph-mock', payload: filePath }),
    saveGraph: (filePath?: string) => ({ type: 'graph/saveGraph-mock', payload: filePath }),
  };
});

// ─── Imports after mocks ────────────────────────────────────────────────────

import graphReducer from '../../../store/slices/graph-slice';
import selectionReducer from '../../../store/slices/selection-slice';
import uiReducer from '../../../store/slices/ui-slice';
import { useMenuActions } from '../use-menu-actions';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: { graph: graphReducer, selection: selectionReducer, ui: uiReducer } as any,
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
}

function mount(store: ReturnType<typeof makeStore>) {
  const Probe: React.FC = () => {
    useMenuActions();
    return null;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
}

beforeEach(() => {
  mocks.effects.length = 0;
  mocks.onMenuActionCb = null;
  mocks.cleanupSpy.mockReset();
  mocks.openFile.mockReset();
  mocks.saveFile.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ────────────────────────────────────────────────────────────────────────────

describe('useMenuActions — registration', () => {
  it('registers an onMenuAction listener on mount', () => {
    mount(makeStore());
    expect(mocks.onMenuActionCb).toBeTypeOf('function');
  });

  it('returns the api.onMenuAction cleanup as the effect cleanup', () => {
    mount(makeStore());
    // Drive the cleanup manually — invoking the captured cleanup arrow
    // should invoke the api's cleanup spy.
    for (const c of mocks.effects) c();
    expect(mocks.cleanupSpy).toHaveBeenCalled();
  });
});

describe('useMenuActions — graph menu actions', () => {
  it('dispatches initializeGraph on menu:newGraph', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:newGraph');
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('graph/initializeGraph-mock');
  });

  it('dispatches loadGraph when openFile resolves with a path', async () => {
    mocks.openFile.mockResolvedValue('/tmp/graph.ice');
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:openGraph');
    const calls = dispatchSpy.mock.calls.map((c) => c[0] as { type: string; payload?: unknown });
    const loadCall = calls.find((c) => c.type === 'graph/loadGraph-mock');
    expect(loadCall).toBeTruthy();
    expect(loadCall!.payload).toBe('/tmp/graph.ice');
  });

  it('does not dispatch loadGraph when openFile resolves with null', async () => {
    mocks.openFile.mockResolvedValue(null);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:openGraph');
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('graph/loadGraph-mock');
  });

  it('dispatches saveGraph (no path) on menu:saveGraph', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:saveGraph');
    const calls = dispatchSpy.mock.calls.map((c) => c[0] as { type: string });
    const saveCall = calls.find((c) => c.type === 'graph/saveGraph-mock');
    expect(saveCall).toBeTruthy();
  });

  it('dispatches saveGraph WITH path when saveFile resolves with a path', async () => {
    mocks.saveFile.mockResolvedValue('/tmp/save.ice');
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:saveGraphAs');
    const calls = dispatchSpy.mock.calls.map((c) => c[0] as { type: string; payload?: unknown });
    const saveCall = calls.find((c) => c.type === 'graph/saveGraph-mock');
    expect(saveCall).toBeTruthy();
    expect(saveCall!.payload).toBe('/tmp/save.ice');
  });

  it('does not dispatch saveGraph when saveFile returns null', async () => {
    mocks.saveFile.mockResolvedValue(null);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:saveGraphAs');
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('graph/saveGraph-mock');
  });

  it('handles menu:importTerraform without dispatching anything', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:importTerraform');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

describe('useMenuActions — edit menu actions', () => {
  it('dispatches undo on menu:undo', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:undo');
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('graph/undo');
  });

  it('dispatches redo on menu:redo', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:redo');
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('graph/redo');
  });

  it('dispatches selectAll with current node/edge ids on menu:selectAll', async () => {
    // Use preloadedState to seed nodes/edges so selectAll's `nodes.map((n) => n.id)`
    // and `edges.map((e) => e.id)` arrows actually execute.
    const seededStore = configureStore({
      reducer: { graph: graphReducer, selection: selectionReducer, ui: uiReducer } as any,
      preloadedState: {
        graph: {
          iceGraph: null,
          nodes: [
            { id: 'n-1', type: 'block', position: { x: 0, y: 0 }, data: {} },
            { id: 'n-2', type: 'block', position: { x: 0, y: 0 }, data: {} },
          ],
          edges: [{ id: 'e-1', source: 'n-1', target: 'n-2' }],
          isLoading: false,
          error: null,
          isDirty: false,
          filePath: null,
          history: { past: [], future: [] },
        },
      } as any,
      middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
    });
    const dispatchSpy = vi.spyOn(seededStore, 'dispatch');
    mount(seededStore);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:selectAll');
    const calls = dispatchSpy.mock.calls.map((c) => c[0] as { type: string; payload?: unknown });
    const selectAllCall = calls.find((c) => c.type === 'selection/selectAll');
    expect(selectAllCall).toBeTruthy();
    const payload = selectAllCall!.payload as { nodes: string[]; edges: string[] };
    expect(payload.nodes).toEqual(['n-1', 'n-2']);
    expect(payload.edges).toEqual(['e-1']);
  });

  it('dispatches clearSelection on menu:deselectAll', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:deselectAll');
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('selection/clearSelection');
  });

  it('handles menu:deleteSelected without dispatching anything', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:deleteSelected');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

describe('useMenuActions — view menu actions', () => {
  it('handles menu:zoomIn / menu:zoomOut / menu:fitToScreen as no-ops', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:zoomIn');
    await mocks.onMenuActionCb!('menu:zoomOut');
    await mocks.onMenuActionCb!('menu:fitToScreen');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('dispatches toggleMinimap on menu:toggleMinimap', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:toggleMinimap');
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('ui/toggleMinimap');
  });

  it('dispatches togglePalette on menu:togglePalette', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:togglePalette');
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('ui/togglePalette');
  });

  it('dispatches toggleProperties on menu:toggleProperties', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:toggleProperties');
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('ui/toggleProperties');
  });

  it('handles menu:autoLayout as a no-op', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:autoLayout');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

describe('useMenuActions — graph menu', () => {
  it('handles menu:validate as a no-op', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:validate');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('handles menu:groupSelected as a no-op', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    await mocks.onMenuActionCb!('menu:groupSelected');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

describe('useMenuActions — default branch', () => {
  it('logs an unknown menu action via console.log', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = makeStore();
    mount(store);
    await mocks.onMenuActionCb!('menu:nonsense');
    expect(logSpy).toHaveBeenCalledWith('Unhandled menu action:', 'menu:nonsense');
    logSpy.mockRestore();
  });
});

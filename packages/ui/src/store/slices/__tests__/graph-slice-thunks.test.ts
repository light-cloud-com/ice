/**
 * Thunk-body coverage for graph-slice.
 *
 * `loadGraph` and `saveGraph` invoke `getApi().graph.{load,save}`. We
 * stub the api adapter and dispatch each thunk against an in-memory
 * store so the payload-creator bodies get measured.
 *
 * `initializeGraph` has no api call (returns null) — its branches are
 * covered by direct reducer tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import graphReducer, { initializeGraph, loadGraph, saveGraph } from '../graph-slice';
import { setApiAdapter } from '../../../shared/api/api-adapter';

let api: { graph: { load: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> } };

function makeStore() {
  return configureStore({
    reducer: { graph: graphReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

beforeEach(() => {
  api = { graph: { load: vi.fn(), save: vi.fn() } };
  setApiAdapter(api as any);
});

describe('graph-slice thunks', () => {
  it('initializeGraph fulfils with null and resets state', async () => {
    const store = makeStore();
    const action = await store.dispatch(initializeGraph());
    expect(action.type).toBe(initializeGraph.fulfilled.type);
    expect(action.payload).toBeNull();
    expect(store.getState().graph.iceGraph).toBeNull();
  });

  it('loadGraph fulfils with { graph, filePath } from api.graph.load', async () => {
    const fakeGraph = {
      id: 'g-1',
      name: 'g',
      version: '1',
      nodes: [],
      edges: [],
      metadata: {},
    };
    api.graph.load.mockResolvedValue(fakeGraph);
    const store = makeStore();
    const action = await store.dispatch(loadGraph('/p.json'));
    expect(action.type).toBe(loadGraph.fulfilled.type);
    expect(action.payload).toEqual({ graph: fakeGraph, filePath: '/p.json' });
    expect(api.graph.load).toHaveBeenCalledWith('/p.json');
  });

  it('loadGraph rejects with the api error', async () => {
    api.graph.load.mockRejectedValue(new Error('cannot read'));
    const store = makeStore();
    const action = await store.dispatch(loadGraph('/missing.json'));
    expect(action.type).toBe(loadGraph.rejected.type);
    expect(store.getState().graph.error).toBe('cannot read');
  });

  it('saveGraph passes through the api result', async () => {
    api.graph.save.mockResolvedValue({ path: '/saved.json' });
    const store = makeStore();
    const action = await store.dispatch(saveGraph('/saved.json'));
    expect(action.type).toBe(saveGraph.fulfilled.type);
    expect(action.payload).toEqual({ path: '/saved.json' });
    expect(api.graph.save).toHaveBeenCalledWith('/saved.json');
  });

  it('saveGraph forwards undefined when no path is supplied', async () => {
    api.graph.save.mockResolvedValue({ path: '/auto.json' });
    const store = makeStore();
    await store.dispatch(saveGraph(undefined));
    expect(api.graph.save).toHaveBeenCalledWith(undefined);
  });
});

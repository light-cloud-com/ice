/**
 * Tests for the `graph` / `schema` / `resources` HTTP-only adapter
 * domains extracted in rf-httpapi-2. The adapter functions wrap a
 * shared axios instance; tests stub axios and assert the requests'
 * URLs, methods, and bodies are byte-equivalent to the pre-refactor
 * behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).window = (globalThis as any).window || { location: { origin: 'http://localhost:3000' } };
(globalThis as any).localStorage = (globalThis as any).localStorage || {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const mockAxios = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../axios-instance', () => ({ default: mockAxios }));

// `graph.save` lazy-imports the Redux store; stub it so we don't have
// to spin up the full slice tree.
vi.mock('../../../store', () => {
  const card1 = {
    id: 'c1',
    nodes: [{ id: 'n1' }],
    edges: [{ source: 'n1', target: 'n2' }],
    viewport: { x: 1, y: 2, zoom: 1 },
  };
  return {
    store: {
      getState: () => ({
        cards: { cards: [card1] },
      }),
    },
  };
});

beforeEach(() => {
  mockAxios.get.mockReset();
  mockAxios.post.mockReset();
  mockAxios.put.mockReset();
  mockAxios.delete.mockReset();
});

// ─── graph adapter ──────────────────────────────────────────────────────────

describe('http-api/graph', () => {
  it('create() POSTs /canvas/cards/create with the given name (or "Untitled")', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { id: 'c1' } });
    const { createGraphAdapter } = await import('../http-api/graph');
    const a = createGraphAdapter();

    await a.create('My Card');
    expect(mockAxios.post).toHaveBeenCalledWith('/canvas/cards/create', { name: 'My Card' });

    mockAxios.post.mockResolvedValueOnce({ data: { id: 'c2' } });
    await a.create();
    expect(mockAxios.post).toHaveBeenLastCalledWith('/canvas/cards/create', { name: 'Untitled' });
  });

  it('load() POSTs /canvas/cards/get with the cardId', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { id: 'c1', nodes: [], edges: [] } });
    const { createGraphAdapter } = await import('../http-api/graph');
    const a = createGraphAdapter();
    const r = await a.load('c1');
    expect(mockAxios.post).toHaveBeenCalledWith('/canvas/cards/get', { cardId: 'c1' });
    expect(r.id).toBe('c1');
  });

  it('save() returns success without a backend call when cardId is missing', async () => {
    const { createGraphAdapter } = await import('../http-api/graph');
    const a = createGraphAdapter();
    const r = await a.save();
    expect(r).toEqual({ success: true, path: undefined });
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('save() POSTs /canvas/cards/update with the Redux-resolved card', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createGraphAdapter } = await import('../http-api/graph');
    const a = createGraphAdapter();
    const r = await a.save('c1');
    expect(mockAxios.post).toHaveBeenCalledWith('/canvas/cards/update', {
      cardId: 'c1',
      nodes: [{ id: 'n1' }],
      edges: [{ source: 'n1', target: 'n2' }],
      viewport: { x: 1, y: 2, zoom: 1 },
    });
    expect(r).toEqual({ success: true, path: 'c1' });
  });

  it('save() short-circuits when cardId is unknown to Redux (no backend call)', async () => {
    const { createGraphAdapter } = await import('../http-api/graph');
    const a = createGraphAdapter();
    const r = await a.save('nope');
    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(r).toEqual({ success: true, path: 'nope' });
  });

  it('get() resolves to null (no backend call)', async () => {
    const { createGraphAdapter } = await import('../http-api/graph');
    const a = createGraphAdapter();
    expect(await a.get()).toBeNull();
  });

  it('node + edge stub methods echo their inputs and never hit the backend', async () => {
    const { createGraphAdapter } = await import('../http-api/graph');
    const a = createGraphAdapter();
    expect(await a.addNode({ id: 'n2' })).toEqual({ success: true, node: { id: 'n2' } });
    expect(await a.updateNode('n1', { x: 1 })).toEqual({ success: true, id: 'n1', updates: { x: 1 } });
    expect(await a.removeNode('n1')).toEqual({ success: true, id: 'n1' });
    expect(await a.addEdge({ id: 'e1' })).toEqual({ success: true, edge: { id: 'e1' } });
    expect(await a.removeEdge('e1')).toEqual({ success: true, id: 'e1' });
    expect(await a.validate()).toEqual({ valid: true, errors: [] });
    expect(mockAxios.get).not.toHaveBeenCalled();
    expect(mockAxios.post).not.toHaveBeenCalled();
  });
});

// ─── schema adapter ─────────────────────────────────────────────────────────

describe('http-api/schema', () => {
  it('getCategories() GETs /schemas/categories', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: ['compute', 'data'] });
    const { createSchemaAdapter } = await import('../http-api/schema');
    const a = createSchemaAdapter();
    const r = await a.getCategories();
    expect(mockAxios.get).toHaveBeenCalledWith('/schemas/categories');
    expect(r).toEqual(['compute', 'data']);
  });

  it('query() GETs /schemas/query with the query as params', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createSchemaAdapter } = await import('../http-api/schema');
    const a = createSchemaAdapter();
    await a.query({ category: 'compute', search: 'aws', provider: 'aws' });
    expect(mockAxios.get).toHaveBeenCalledWith('/schemas/query', {
      params: { category: 'compute', search: 'aws', provider: 'aws' },
    });
  });

  it('get() GETs /schemas/<encoded iceType>', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { iceType: 'Compute.Backend' } });
    const { createSchemaAdapter } = await import('../http-api/schema');
    const a = createSchemaAdapter();
    await a.get('Compute.Backend');
    expect(mockAxios.get).toHaveBeenCalledWith('/schemas/Compute.Backend');
  });

  it('get() URI-encodes iceTypes containing reserved characters', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: {} });
    const { createSchemaAdapter } = await import('../http-api/schema');
    const a = createSchemaAdapter();
    await a.get('Strange/Type With Spaces');
    expect(mockAxios.get).toHaveBeenCalledWith('/schemas/Strange%2FType%20With%20Spaces');
  });
});

// ─── resources adapter ──────────────────────────────────────────────────────

describe('http-api/resources', () => {
  it('getCategories() GETs /resources/categories', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createResourcesAdapter } = await import('../http-api/resources');
    const a = createResourcesAdapter();
    await a.getCategories();
    expect(mockAxios.get).toHaveBeenCalledWith('/resources/categories');
  });

  it('getAll() GETs /resources/all', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createResourcesAdapter } = await import('../http-api/resources');
    const a = createResourcesAdapter();
    await a.getAll();
    expect(mockAxios.get).toHaveBeenCalledWith('/resources/all');
  });

  it('getByCategory() GETs /resources/category/<encoded>', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createResourcesAdapter } = await import('../http-api/resources');
    const a = createResourcesAdapter();
    await a.getByCategory('Compute Group');
    expect(mockAxios.get).toHaveBeenCalledWith('/resources/category/Compute%20Group');
  });

  it('search() GETs /resources/search?q=<query>', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createResourcesAdapter } = await import('../http-api/resources');
    const a = createResourcesAdapter();
    await a.search('redis');
    expect(mockAxios.get).toHaveBeenCalledWith('/resources/search', { params: { q: 'redis' } });
  });

  it('getLowLevel() GETs /resources/low-level/<encoded>', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createResourcesAdapter } = await import('../http-api/resources');
    const a = createResourcesAdapter();
    await a.getLowLevel('Compute.Backend');
    expect(mockAxios.get).toHaveBeenCalledWith('/resources/low-level/Compute.Backend');
  });
});

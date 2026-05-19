/**
 * HTTP tests for the engine schemas router (`/api/schemas/...`).
 *
 * The schema service is mocked at the boundary so the router's job
 * (URL params, query parsing, fallback bodies, 404 wiring) is what we
 * exercise here.
 */

import http from 'node:http';
import express from 'express';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';

const getCategoriesMock = vi.fn();
const querySchemasMock = vi.fn();
const getSchemaMock = vi.fn();

vi.mock('../../services/schema.service', () => ({
  getCategories: (...args: unknown[]) => getCategoriesMock(...args),
  querySchemas: (...args: unknown[]) => querySchemasMock(...args),
  getSchema: (...args: unknown[]) => getSchemaMock(...args),
}));

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: router } = await import('../schemas');
  const app = express();
  app.use(express.json());
  app.use('/api/schemas', router);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
});

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

describe('GET /api/schemas/categories', () => {
  it('returns 200 with the service result on the happy path', async () => {
    const cats = [{ id: 'compute', name: 'Compute', icon: 'cpu', count: 3 }];
    getCategoriesMock.mockResolvedValue(cats);
    const res = await get('/api/schemas/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(cats);
    expect(getCategoriesMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 with the static fallback list of 8 categories when the service throws', async () => {
    getCategoriesMock.mockRejectedValue(new Error('core boom'));
    const res = await get('/api/schemas/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(8);
    expect(res.body.map((c: any) => c.id)).toEqual([
      'compute',
      'network',
      'data',
      'storage',
      'security',
      'monitoring',
      'messaging',
      'external',
    ]);
    // Each fallback entry has count: 0
    for (const c of res.body) {
      expect(c.count).toBe(0);
      expect(typeof c.name).toBe('string');
      expect(typeof c.icon).toBe('string');
    }
  });
});

describe('GET /api/schemas/query', () => {
  it('forwards q, category, provider from the query string into the service { search, category, provider }', async () => {
    querySchemasMock.mockResolvedValue([{ id: 'compute.container' }]);
    const res = await get('/api/schemas/query?q=container&category=compute&provider=gcp');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'compute.container' }]);
    expect(querySchemasMock).toHaveBeenCalledWith({
      search: 'container',
      category: 'compute',
      provider: 'gcp',
    });
  });

  it('passes undefined for absent query params', async () => {
    querySchemasMock.mockResolvedValue([]);
    await get('/api/schemas/query');
    expect(querySchemasMock).toHaveBeenCalledWith({
      search: undefined,
      category: undefined,
      provider: undefined,
    });
  });

  it('returns 200 with [] when the service throws', async () => {
    querySchemasMock.mockRejectedValue(new Error('boom'));
    const res = await get('/api/schemas/query?q=container');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/schemas/:iceType', () => {
  it('returns 200 with the schema body when the service finds one', async () => {
    const schema = { id: 'compute.container', iceType: 'compute.container', properties: { foo: 'bar' } };
    getSchemaMock.mockResolvedValue(schema);
    const res = await get('/api/schemas/compute.container');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(schema);
    expect(getSchemaMock).toHaveBeenCalledWith('compute.container');
  });

  it('returns 404 with { message: "Schema not found" } when the service returns null', async () => {
    getSchemaMock.mockResolvedValue(null);
    const res = await get('/api/schemas/does.not.exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Schema not found' });
  });

  it('returns 200 with the {iceType, properties:{}} stub when the service throws', async () => {
    getSchemaMock.mockRejectedValue(new Error('boom'));
    const res = await get('/api/schemas/compute.container');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ iceType: 'compute.container', properties: {} });
  });
});

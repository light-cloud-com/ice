/**
 * HTTP tests for the engine resources router (`/api/resources/...`).
 *
 * No supertest in the workspace — we boot a tiny in-process Express app on
 * an ephemeral port and hit it with `fetch`. The resource service module is
 * mocked at the boundary so the router's job (URL params, query string
 * pass-through, error envelope shape) is what we exercise here.
 */

import http from 'node:http';
import express from 'express';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';

const getCategoriesMock = vi.fn();
const getAllMock = vi.fn();
const getByCategoryMock = vi.fn();
const searchMock = vi.fn();
const getLowLevelMock = vi.fn();

vi.mock('../../services/resource.service', () => ({
  getCategories: (...args: unknown[]) => getCategoriesMock(...args),
  getAll: (...args: unknown[]) => getAllMock(...args),
  getByCategory: (...args: unknown[]) => getByCategoryMock(...args),
  search: (...args: unknown[]) => searchMock(...args),
  getLowLevel: (...args: unknown[]) => getLowLevelMock(...args),
}));

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: router } = await import('../resources');
  const app = express();
  app.use(express.json());
  app.use('/api/resources', router);

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

describe('GET /api/resources/categories', () => {
  it('returns 200 with the service result on the happy path', async () => {
    const cats = [{ id: 'compute', name: 'Compute' }];
    getCategoriesMock.mockResolvedValue(cats);
    const res = await get('/api/resources/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(cats);
    expect(getCategoriesMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 with [] when the service throws', async () => {
    getCategoriesMock.mockRejectedValue(new Error('core boom'));
    const res = await get('/api/resources/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/resources/all', () => {
  it('returns 200 with the service result on the happy path', async () => {
    const list = [{ id: 'compute.container' }];
    getAllMock.mockResolvedValue(list);
    const res = await get('/api/resources/all');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(list);
  });

  it('returns 200 with [] when the service throws', async () => {
    getAllMock.mockRejectedValue(new Error('core boom'));
    const res = await get('/api/resources/all');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/resources/category/:categoryId', () => {
  it('forwards categoryId from the URL path to the service', async () => {
    getByCategoryMock.mockResolvedValue([{ id: 'compute.container' }]);
    const res = await get('/api/resources/category/compute');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'compute.container' }]);
    expect(getByCategoryMock).toHaveBeenCalledWith('compute');
  });

  it('returns 200 with [] when the service throws', async () => {
    getByCategoryMock.mockRejectedValue(new Error('boom'));
    const res = await get('/api/resources/category/compute');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/resources/search', () => {
  it('forwards `q` from the query string to the service', async () => {
    searchMock.mockResolvedValue([{ id: 'compute.container' }]);
    const res = await get('/api/resources/search?q=container');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'compute.container' }]);
    expect(searchMock).toHaveBeenCalledWith('container');
  });

  it('passes empty string when q is omitted (mirrors the `|| ""` fallback)', async () => {
    searchMock.mockResolvedValue([]);
    const res = await get('/api/resources/search');
    expect(res.status).toBe(200);
    expect(searchMock).toHaveBeenCalledWith('');
  });

  it('returns 200 with [] when the service throws', async () => {
    searchMock.mockRejectedValue(new Error('boom'));
    const res = await get('/api/resources/search?q=anything');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/resources/low-level/:highLevelId', () => {
  it('forwards highLevelId from the URL path to the service', async () => {
    getLowLevelMock.mockResolvedValue([{ id: 'gcp.run' }]);
    const res = await get('/api/resources/low-level/compute.container');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'gcp.run' }]);
    expect(getLowLevelMock).toHaveBeenCalledWith('compute.container');
  });

  it('returns 200 with [] when the service throws', async () => {
    getLowLevelMock.mockRejectedValue(new Error('boom'));
    const res = await get('/api/resources/low-level/compute.container');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

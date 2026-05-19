/**
 * Tests for `services/engine/src/index.ts` — the engine package's barrel
 * entry. It assembles a `Router` that mounts the three sub-routers under
 * `/schemas`, `/resources`, `/import`, and re-exports a curated slice of
 * the resource and schema service surfaces.
 *
 * We mock the three sub-routers with sentinel handlers that just respond
 * 200 + a marker body, so we can prove the wiring (mount path, order,
 * router composition) by hitting the assembled app via in-process HTTP.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Router } from 'express';

// Mock paths use the same specifier the SUT writes — `./routes/<name>.js`
// from the SUT's perspective resolves to the same canonical path as
// `../routes/<name>.js` from this test file's perspective. Vitest matches
// on the canonicalized path so either spelling works; we use the SUT-side
// spelling for clarity.
vi.mock('../routes/import', () => {
  const r = Router();
  r.get('/ping', (_req, res) => res.json({ where: 'import' }));
  return { default: r };
});

vi.mock('../routes/resources', () => {
  const r = Router();
  r.get('/ping', (_req, res) => res.json({ where: 'resources' }));
  return { default: r };
});

vi.mock('../routes/schemas', () => {
  const r = Router();
  r.get('/ping', (_req, res) => res.json({ where: 'schemas' }));
  return { default: r };
});

// Service modules are imported via `export *` / named re-exports. The
// runtime needs them resolvable for the barrel to import cleanly. We mock
// them to lightweight stubs so we can verify the re-export surface.
vi.mock('../services/schema.service', () => ({
  getCategories: vi.fn(async () => 'schema-getCategories'),
  querySchemas: vi.fn(async () => 'schema-querySchemas'),
  getSchema: vi.fn(async () => 'schema-getSchema'),
}));

vi.mock('../services/resource.service', () => ({
  getAll: vi.fn(async () => 'resource-getAll'),
  getForPalette: vi.fn(async () => 'resource-getForPalette'),
  getByCategory: vi.fn(async () => 'resource-getByCategory'),
  search: vi.fn(async () => 'resource-search'),
  getLowLevel: vi.fn(async () => 'resource-getLowLevel'),
  getByProvider: vi.fn(async () => 'resource-getByProvider'),
  getCategories: vi.fn(async () => 'resource-getCategories'),
}));

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('createEngineRouter', () => {
  it('mounts `/schemas`, `/resources`, and `/import` sub-routers', async () => {
    const { createEngineRouter } = await import('../index');
    const router = createEngineRouter();
    const app = express();
    app.use('/api/engine', router);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const schemasRes = await fetch(`${baseUrl}/api/engine/schemas/ping`);
    const resourcesRes = await fetch(`${baseUrl}/api/engine/resources/ping`);
    const importRes = await fetch(`${baseUrl}/api/engine/import/ping`);

    expect(schemasRes.status).toBe(200);
    expect(await schemasRes.json()).toEqual({ where: 'schemas' });

    expect(resourcesRes.status).toBe(200);
    expect(await resourcesRes.json()).toEqual({ where: 'resources' });

    expect(importRes.status).toBe(200);
    expect(await importRes.json()).toEqual({ where: 'import' });
  });

  it('returns 404 for paths outside the three mounts', async () => {
    const { createEngineRouter } = await import('../index');
    const router = createEngineRouter();
    const app = express();
    app.use('/api/engine', router);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const res = await fetch(`${baseUrl}/api/engine/unknown`);
    expect(res.status).toBe(404);
  });
});

describe('barrel re-exports', () => {
  it('re-exports the resource service slice with the renamed `getResourceCategories`', async () => {
    const mod = (await import('../index')) as any;
    // Resource service exports — explicitly named in the index barrel.
    expect(typeof mod.getAll).toBe('function');
    expect(typeof mod.getForPalette).toBe('function');
    expect(typeof mod.getByCategory).toBe('function');
    expect(typeof mod.search).toBe('function');
    expect(typeof mod.getLowLevel).toBe('function');
    expect(typeof mod.getByProvider).toBe('function');
    // Renamed alias to disambiguate from schema's getCategories.
    expect(typeof mod.getResourceCategories).toBe('function');
    expect(await mod.getResourceCategories()).toBe('resource-getCategories');
  });

  it('re-exports the full schema service surface via `export *`', async () => {
    const mod = (await import('../index')) as any;
    expect(typeof mod.getCategories).toBe('function');
    expect(typeof mod.querySchemas).toBe('function');
    expect(typeof mod.getSchema).toBe('function');
    // The schema service's getCategories should win the barrel collision —
    // it's re-exported by `export *` and the resource service's
    // getCategories is renamed to getResourceCategories above.
    expect(await mod.getCategories()).toBe('schema-getCategories');
  });
});

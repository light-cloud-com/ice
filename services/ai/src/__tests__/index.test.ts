/**
 * Smoke tests for `services/ai/src/index.ts` — the package entry that
 * mounts the two AI routers under `/ai` and re-exports the service
 * surface for external consumers (gateway, electron-app).
 *
 * The leaf routers and the AI service are mocked at the module boundary.
 * We verify:
 *  1. createAiRouter() returns an Express router that mounts both
 *     leaf routers under `/ai` (sub-path coverage = both register).
 *  2. Re-exports from `./services/ai.service.js` are present on the
 *     module's namespace (no broken star-export).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// Sentinel routers so we can prove BOTH leaf routers are mounted.
vi.mock('../routes/ai-conversations', () => {
  const r = express.Router();
  r.get('/conversations/sentinel', (_req, res) => res.json({ from: 'conversations' }));
  return { default: r };
});

vi.mock('../routes/ai', () => {
  const r = express.Router();
  r.get('/sentinel', (_req, res) => res.json({ from: 'ai' }));
  return { default: r };
});

// ai.service is star-exported by index.ts. Mock with a known sentinel so
// we can assert the re-export survives.
vi.mock('../services/ai.service', () => ({
  __sentinel: 'ai-service-export-marker',
  getAiProvider: vi.fn(),
  processCanvasIntent: vi.fn(),
  streamCanvasIntent: vi.fn(),
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

describe('createAiRouter', () => {
  it('returns an Express router that mounts the AI router at /ai', async () => {
    const { createAiRouter } = await import('../index');
    const router = createAiRouter();

    const app = express();
    app.use(router);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const res = await fetch(`${baseUrl}/ai/sentinel`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ from: 'ai' });
  });

  it('also mounts the AI conversations router at /ai (both leaf routers register)', async () => {
    const { createAiRouter } = await import('../index');
    const router = createAiRouter();

    const app = express();
    app.use(router);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const res = await fetch(`${baseUrl}/ai/conversations/sentinel`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ from: 'conversations' });
  });

  it('returns a fresh router each call (no shared listener state)', async () => {
    const { createAiRouter } = await import('../index');
    const a = createAiRouter();
    const b = createAiRouter();
    expect(a).not.toBe(b);
  });
});

describe('re-exports from ai.service', () => {
  it('forwards the ai.service namespace via `export * from`', async () => {
    const mod = (await import('../index')) as Record<string, unknown>;
    // The mocked sentinel proves the star export went through.
    expect(mod.__sentinel).toBe('ai-service-export-marker');
    expect(typeof mod.getAiProvider).toBe('function');
    expect(typeof mod.processCanvasIntent).toBe('function');
    expect(typeof mod.streamCanvasIntent).toBe('function');
  });
});

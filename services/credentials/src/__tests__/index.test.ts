/**
 * Smoke test for the package index. The `createCredentialsRouter()` factory
 * stitches the github + provider routers under their respective sub-paths;
 * the re-exports also expose the underlying service surface for direct
 * consumers (other services in the monorepo).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the underlying routers so this test isolates the wiring concern.
// Each mock returns a tiny express middleware so we can probe URL routing.
vi.mock('../routes/github', () => ({
  default: (req: any, res: any) => res.json({ where: 'github', path: req.path }),
}));

vi.mock('../routes/providers', () => ({
  default: (req: any, res: any) => res.json({ where: 'providers', path: req.path }),
}));

// The service-layer re-exports also pull in `@ice/db` and `@ice/shared` —
// stub them to avoid loading real prisma + crypto at module-init time.
vi.mock('@ice/db', () => ({
  default: {
    gitHubToken: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    providerCredential: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock('@ice/shared', () => ({
  encryptString: (s: string) => s,
  decryptString: (s: string) => s,
  encryptCredentials: (c: unknown) => JSON.stringify(c),
  decryptCredentials: (s: string) => JSON.parse(s),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createCredentialsRouter', () => {
  it('mounts github routes under /github and provider routes under /providers', async () => {
    const { createCredentialsRouter } = await import('../index');
    const express = (await import('express')).default;
    const http = await import('node:http');

    const app = express();
    app.use(express.json());
    app.use('/api', createCredentialsRouter());

    const server = await new Promise<any>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (server.address() as any).port;

    try {
      const ghRes = await fetch(`http://127.0.0.1:${port}/api/github/anything`);
      const ghBody = await ghRes.json();
      expect(ghBody).toEqual({ where: 'github', path: '/anything' });

      const provRes = await fetch(`http://127.0.0.1:${port}/api/providers/some-path`);
      const provBody = await provRes.json();
      expect(provBody).toEqual({ where: 'providers', path: '/some-path' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('re-exports the GitHub + provider service surface', async () => {
    const mod = await import('../index');
    // Service functions should be accessible via the package barrel.
    expect(typeof (mod as any).connectWithPAT).toBe('function');
    expect(typeof (mod as any).pollDeviceFlow).toBe('function');
    expect(typeof (mod as any).getCredentials).toBe('function');
    expect(typeof (mod as any).getValidGCPAccessToken).toBe('function');
  });
});

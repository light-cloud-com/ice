/**
 * Sibling test file for the `GITHUB_CLIENT_ID not configured` branch in
 * `startDeviceFlow`. The branch is module-level — `GITHUB_CLIENT_ID` is read
 * once at import time. Mixing this with the happy-path tests is brittle
 * (we'd have to `vi.resetModules` and chain re-imports across `it` blocks);
 * a dedicated file with the env var unset before the SUT is loaded is the
 * cleanest approach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    gitHubToken: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@ice/shared', () => ({
  encryptString: (s: string) => s,
  decryptString: (s: string) => s,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startDeviceFlow with no GITHUB_CLIENT_ID', () => {
  it('throws an explicit configuration error', async () => {
    const previous = process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_ID;
    vi.resetModules();
    try {
      const { startDeviceFlow } = await import('../github.service');
      await expect(startDeviceFlow()).rejects.toThrow('GITHUB_CLIENT_ID not configured');
    } finally {
      if (previous !== undefined) process.env.GITHUB_CLIENT_ID = previous;
    }
  });
});

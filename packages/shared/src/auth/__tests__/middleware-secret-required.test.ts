/**
 * Module-load throws when JWT_SECRET is unset and NODE_ENV is not 'test'.
 * Also exercises the `secret || 'test-secret'` fallback when JWT_SECRET is
 * empty and NODE_ENV is 'test'.
 *
 * Isolated file because the throw / fallback fires at top-level evaluation —
 * combining with the happy-path middleware tests would skip the assertion or
 * break later imports in the same file.
 */

import { describe, expect, it, vi } from 'vitest';

describe('auth middleware module — env precondition', () => {
  it('throws when JWT_SECRET is missing in non-test env', async () => {
    const originalSecret = process.env.JWT_SECRET;
    const originalEnv = process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    vi.resetModules();
    try {
      await expect(import('../middleware.js')).rejects.toThrow(/JWT_SECRET/);
    } finally {
      process.env.JWT_SECRET = originalSecret;
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('falls back to "test-secret" when JWT_SECRET is empty and NODE_ENV is test', async () => {
    // Drives the right-hand side of `secret || "test-secret"` on line 14.
    // The module loads cleanly; generateToken issues a JWT we can verify
    // against the literal fallback to prove the fallback is what got used.
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = '';
    process.env.NODE_ENV = 'test';
    vi.resetModules();
    try {
      const mod = await import('../middleware.js');
      const token = mod.generateToken('u', 'o');
      // jwt.verify with the literal fallback succeeds.
      const jwt = (await import('jsonwebtoken')).default;
      const payload = jwt.verify(token, 'test-secret') as { userId: string };
      expect(payload.userId).toBe('u');
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  });
});

/**
 * Token issuance throws when JWT_SECRET is unset and NODE_ENV is not 'test'.
 * Also exercises the `secret || 'test-secret'` fallback when JWT_SECRET is
 * empty and NODE_ENV is 'test'.
 *
 * Secret resolution is lazy — it fires on every `generateToken` / `requireAuth`
 * call rather than at module load — so the assertion drives the function,
 * not the import.
 */

import { describe, expect, it, vi } from 'vitest';

describe('auth middleware — JWT_SECRET precondition', () => {
  it('throws on token issuance when JWT_SECRET is missing in non-test env', async () => {
    const originalSecret = process.env.JWT_SECRET;
    const originalEnv = process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    vi.resetModules();
    try {
      const mod = await import('../middleware');
      expect(() => mod.generateToken('u', 'o')).toThrow(/JWT_SECRET/);
    } finally {
      process.env.JWT_SECRET = originalSecret;
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('falls back to "test-secret" when JWT_SECRET is empty and NODE_ENV is test', async () => {
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = '';
    process.env.NODE_ENV = 'test';
    vi.resetModules();
    try {
      const mod = await import('../middleware');
      const token = mod.generateToken('u', 'o');
      const jwt = (await import('jsonwebtoken')).default;
      const payload = jwt.verify(token, 'test-secret') as { userId: string };
      expect(payload.userId).toBe('u');
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  });
});

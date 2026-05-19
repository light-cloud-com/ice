/**
 * Encryption ops throw when CREDENTIAL_ENCRYPTION_KEY is unset and NODE_ENV
 * is not 'test'. Also covers the `key || "test-encryption-key-..."` fallback
 * when key is empty and NODE_ENV='test'.
 *
 * Key resolution is lazy — runs on every encrypt/decrypt call rather than
 * at module load — so the assertion drives the function, not the import.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.resetModules();
});

describe('crypto — CREDENTIAL_ENCRYPTION_KEY precondition', () => {
  it('throws on encrypt when CREDENTIAL_ENCRYPTION_KEY is missing in non-test env', async () => {
    const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    const originalEnv = process.env.NODE_ENV;
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    vi.resetModules();
    try {
      const mod = await import('../crypto/index');
      expect(() => mod.encryptString('payload')).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
    } finally {
      process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('falls back to default key when CREDENTIAL_ENCRYPTION_KEY is empty and NODE_ENV is test', async () => {
    const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    process.env.CREDENTIAL_ENCRYPTION_KEY = '';
    process.env.NODE_ENV = 'test';
    vi.resetModules();
    try {
      const mod = await import('../crypto/index');
      const ciphertext = mod.encryptString('payload');
      expect(mod.decryptString(ciphertext)).toBe('payload');
    } finally {
      process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
    }
  });
});

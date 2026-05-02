/**
 * Module-load throws when CREDENTIAL_ENCRYPTION_KEY is unset and NODE_ENV
 * is not 'test'. Also covers the `key || "test-encryption-key-..."` fallback
 * when key is empty and NODE_ENV='test'.
 *
 * Isolated test file because the throw / fallback fires at top-level
 * module evaluation — combining it with the happy-path crypto.test.ts
 * would either skip the assertion or break later imports in the same file.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.resetModules();
});

describe('crypto module — env precondition', () => {
  it('throws when CREDENTIAL_ENCRYPTION_KEY is missing in non-test env', async () => {
    const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    const originalEnv = process.env.NODE_ENV;
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    vi.resetModules();
    try {
      await expect(import('../crypto/index.js')).rejects.toThrow(
        /CREDENTIAL_ENCRYPTION_KEY/,
      );
    } finally {
      process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('falls back to default key when CREDENTIAL_ENCRYPTION_KEY is empty and NODE_ENV is test', async () => {
    // Drives the right-hand side of `key || "test-encryption-key-..."`.
    // After load, encryptString/decryptString must round-trip — proving
    // the fallback was used to derive the AES key.
    const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    process.env.CREDENTIAL_ENCRYPTION_KEY = '';
    process.env.NODE_ENV = 'test';
    vi.resetModules();
    try {
      const mod = await import('../crypto/index.js');
      const ciphertext = mod.encryptString('payload');
      expect(mod.decryptString(ciphertext)).toBe('payload');
    } finally {
      process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
    }
  });
});

/**
 * Unit tests for credential encryption (AES-256-GCM)
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Set test env before importing
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-key-for-unit-tests-32char!';
});

describe('Crypto Module', () => {
  it('should encrypt and decrypt credentials', async () => {
    const { encryptCredentials, decryptCredentials } = await import("../crypto");

    const original = { accessKey: 'AKIA1234', secretKey: 's3cr3t' };
    const encrypted = encryptCredentials(original);

    expect(encrypted).not.toContain('AKIA1234');
    expect(encrypted).not.toContain('s3cr3t');

    const decrypted = decryptCredentials(encrypted);
    expect(decrypted).toEqual(original);
  });

  it('should encrypt and decrypt strings', async () => {
    const { encryptString, decryptString } = await import("../crypto");

    const original = 'github-token-abc123';
    const encrypted = encryptString(original);

    expect(encrypted).not.toContain(original);
    expect(typeof encrypted).toBe('string');

    const decrypted = decryptString(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should produce different ciphertexts for same input (random IV)', async () => {
    const { encryptString } = await import("../crypto");

    const a = encryptString('same-value');
    const b = encryptString('same-value');

    expect(a).not.toBe(b);
  });

  it('should reject tampered ciphertext (GCM auth tag)', async () => {
    const { encryptString, decryptString } = await import("../crypto");

    const encrypted = encryptString('sensitive-data');
    // Tamper with the ciphertext
    const buf = Buffer.from(encrypted, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');

    expect(() => decryptString(tampered)).toThrow();
  });

  it('should handle empty strings', async () => {
    const { encryptString, decryptString } = await import("../crypto");

    const encrypted = encryptString('');
    expect(decryptString(encrypted)).toBe('');
  });

  it('should handle unicode and special characters', async () => {
    const { encryptCredentials, decryptCredentials } = await import("../crypto");

    const original = { key: '日本語テスト', emoji: '🔐🔑', special: '<>&"\'\\' };
    const encrypted = encryptCredentials(original);
    const decrypted = decryptCredentials(encrypted);
    expect(decrypted).toEqual(original);
  });
});

/**
 * Credential Encryption — AES-256-GCM via Node.js native crypto
 *
 * Encrypts provider credentials and GitHub tokens before DB storage.
 * Uses authenticated encryption (GCM) to prevent tampering.
 */

import crypto from 'crypto';

function getEncryptionKey(): string {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key && process.env.NODE_ENV !== 'test') {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY environment variable is required. Refusing to start with a default key.',
    );
  }
  return key || 'test-encryption-key-min-32chars!!';
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function deriveKey(passphrase: string): Buffer {
  return crypto.createHash('sha256').update(passphrase).digest();
}

function encrypt(plaintext: string): string {
  const key = deriveKey(getEncryptionKey());
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv + authTag + ciphertext)
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(encoded: string): string {
  const key = deriveKey(getEncryptionKey());
  const data = Buffer.from(encoded, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

export function encryptCredentials(data: Record<string, string>): string {
  return encrypt(JSON.stringify(data));
}

export function decryptCredentials(encrypted: string): Record<string, string> {
  return JSON.parse(decrypt(encrypted));
}

export function encryptString(value: string): string {
  return encrypt(value);
}

export function decryptString(encrypted: string): string {
  return decrypt(encrypted);
}

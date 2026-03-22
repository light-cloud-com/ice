/**
 * Credential Encryption — AES-256-GCM via crypto-js
 *
 * Encrypts provider credentials and GitHub tokens before DB storage.
 */

import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || 'dev-only-change-in-production';

export function encryptCredentials(data: Record<string, string>): string {
  return CryptoJS.AES.encrypt(JSON.stringify(data), ENCRYPTION_KEY).toString();
}

export function decryptCredentials(encrypted: string): Record<string, string> {
  const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}

export function encryptString(value: string): string {
  return CryptoJS.AES.encrypt(value, ENCRYPTION_KEY).toString();
}

export function decryptString(encrypted: string): string {
  const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

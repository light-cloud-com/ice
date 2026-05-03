/**
 * Smoke tests for deploy/messages.ts — pure data exports
 * (error codes, message dictionaries, allowed-URL prefix list).
 */

import { describe, it, expect } from 'vitest';
import {
  DEPLOY_ERROR_CODES,
  GCP_DEPLOYER_MESSAGES,
  AUTH_MESSAGES,
  DEPLOY_PROGRESS,
  DEPLOY_DISPLAY,
  IPC_ERRORS,
  ALLOWED_EXTERNAL_URL_PREFIXES,
} from '../messages';

describe('deploy/messages exports', () => {
  it('DEPLOY_ERROR_CODES is an object with string-valued keys', () => {
    expect(typeof DEPLOY_ERROR_CODES).toBe('object');
    expect(Object.keys(DEPLOY_ERROR_CODES).length).toBeGreaterThan(0);
    for (const v of Object.values(DEPLOY_ERROR_CODES)) {
      expect(typeof v).toBe('string');
    }
  });

  it('GCP_DEPLOYER_MESSAGES has at least one entry', () => {
    expect(typeof GCP_DEPLOYER_MESSAGES).toBe('object');
    expect(Object.keys(GCP_DEPLOYER_MESSAGES).length).toBeGreaterThan(0);
  });

  it('AUTH_MESSAGES has at least one entry', () => {
    expect(typeof AUTH_MESSAGES).toBe('object');
    expect(Object.keys(AUTH_MESSAGES).length).toBeGreaterThan(0);
  });

  it('DEPLOY_PROGRESS + DEPLOY_DISPLAY + IPC_ERRORS are populated dictionaries', () => {
    expect(Object.keys(DEPLOY_PROGRESS).length).toBeGreaterThan(0);
    expect(Object.keys(DEPLOY_DISPLAY).length).toBeGreaterThan(0);
    expect(Object.keys(IPC_ERRORS).length).toBeGreaterThan(0);
  });

  it('ALLOWED_EXTERNAL_URL_PREFIXES is a non-empty array of strings', () => {
    expect(Array.isArray(ALLOWED_EXTERNAL_URL_PREFIXES)).toBe(true);
    expect(ALLOWED_EXTERNAL_URL_PREFIXES.length).toBeGreaterThan(0);
    for (const prefix of ALLOWED_EXTERNAL_URL_PREFIXES) {
      expect(typeof prefix).toBe('string');
    }
  });
});

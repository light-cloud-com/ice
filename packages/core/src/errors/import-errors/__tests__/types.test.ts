/**
 * rf-ierr-1 — types tests.
 *
 * Smoke-test that the enum constants and re-exports are stable. Most
 * of the test surface lives in the per-cloud classifier files.
 */

import { describe, it, expect } from 'vitest';
import {
  ImportErrorCode,
  type ImportError,
  type ImportWarning,
  type ImportErrorAction,
  type ImportErrorActionType,
} from '../types.js';

describe('ImportErrorCode enum', () => {
  it('preserves all 19 documented codes', () => {
    expect(ImportErrorCode.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
    expect(ImportErrorCode.AUTH_EXPIRED).toBe('AUTH_EXPIRED');
    expect(ImportErrorCode.AUTH_REAUTH_REQUIRED).toBe('AUTH_REAUTH_REQUIRED');
    expect(ImportErrorCode.AUTH_INSUFFICIENT_PERMISSIONS).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
    expect(ImportErrorCode.AUTH_INVALID_CREDENTIALS).toBe('AUTH_INVALID_CREDENTIALS');
    expect(ImportErrorCode.API_NOT_ENABLED).toBe('API_NOT_ENABLED');
    expect(ImportErrorCode.API_QUOTA_EXCEEDED).toBe('API_QUOTA_EXCEEDED');
    expect(ImportErrorCode.API_RATE_LIMITED).toBe('API_RATE_LIMITED');
    expect(ImportErrorCode.API_ERROR).toBe('API_ERROR');
    expect(ImportErrorCode.API_UNAVAILABLE).toBe('API_UNAVAILABLE');
    expect(ImportErrorCode.RESOURCE_NOT_FOUND).toBe('RESOURCE_NOT_FOUND');
    expect(ImportErrorCode.RESOURCE_ACCESS_DENIED).toBe('RESOURCE_ACCESS_DENIED');
    expect(ImportErrorCode.RESOURCE_INVALID).toBe('RESOURCE_INVALID');
    expect(ImportErrorCode.TYPE_UNMAPPED).toBe('TYPE_UNMAPPED');
    expect(ImportErrorCode.PROPERTY_UNMAPPED).toBe('PROPERTY_UNMAPPED');
    expect(ImportErrorCode.INIT_ERROR).toBe('INIT_ERROR');
    expect(ImportErrorCode.SDK_NOT_INSTALLED).toBe('SDK_NOT_INSTALLED');
    expect(ImportErrorCode.RESOURCE_EXPLORER_NOT_ENABLED).toBe('RESOURCE_EXPLORER_NOT_ENABLED');
    expect(ImportErrorCode.CONFIG_ERROR).toBe('CONFIG_ERROR');
    expect(ImportErrorCode.RESOURCE_GRAPH_ERROR).toBe('RESOURCE_GRAPH_ERROR');
  });
});

describe('ImportError shape', () => {
  it('accepts all defined fields', () => {
    const action: ImportErrorAction = {
      type: 'reauth',
      command: 'foo',
      url: 'https://example',
      description: 'do thing',
    };
    const err: ImportError = {
      code: ImportErrorCode.AUTH_REQUIRED,
      message: 'msg',
      recoverable: true,
      action,
      service: 'svc',
      resource: 'res',
      details: { extra: 1 },
    };
    expect(err.code).toBe('AUTH_REQUIRED');
    expect(err.action?.type).toBe('reauth');
  });

  it('accepts string code (not just enum members)', () => {
    const err: ImportError = {
      code: 'CUSTOM_CODE',
      message: 'msg',
      recoverable: false,
    };
    expect(err.code).toBe('CUSTOM_CODE');
  });
});

describe('ImportWarning shape', () => {
  it('accepts the documented fields', () => {
    const w: ImportWarning = {
      code: 'WARN',
      message: 'oops',
      service: 'svc',
      resource: 'res',
    };
    expect(w.code).toBe('WARN');
  });
});

describe('ImportErrorActionType', () => {
  it('lists all 6 supported types', () => {
    const types: ImportErrorActionType[] = [
      'reauth',
      'enable_api',
      'grant_permission',
      'retry',
      'install_sdk',
      'enable_service',
    ];
    expect(types).toHaveLength(6);
  });
});

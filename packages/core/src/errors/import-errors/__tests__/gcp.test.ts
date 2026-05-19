/**
 * rf-ierr-2 — classifyGCPError tests.
 *
 * Covers the substring-test ladder. Each branch mapped to the
 * corresponding ImportErrorCode + the recovery action shape.
 */

import { describe, it, expect } from 'vitest';
import { classifyGCPError } from '../gcp';
import { ImportErrorCode } from '../types';

describe('classifyGCPError — reauth (invalid_grant family)', () => {
  it.each([
    'invalid_grant',
    'invalid_rapt',
    '"error":"invalid_grant"',
    '"error_subtype":"invalid_rapt"',
    'Token has been expired',
    'token has expired',
    'refresh token failed',
    'reauth related error',
    'Getting metadata from plugin failed',
  ])('classifies %s as AUTH_REAUTH_REQUIRED', (msg) => {
    const result = classifyGCPError({ message: msg });
    expect(result.code).toBe(ImportErrorCode.AUTH_REAUTH_REQUIRED);
    expect(result.recoverable).toBe(true);
    expect(result.action?.type).toBe('reauth');
    expect(result.action?.command).toBe('gcloud auth application-default login');
  });

  it('preserves the exact reauth message string (verbatim)', () => {
    const result = classifyGCPError({ message: 'invalid_grant' });
    expect(result.message).toBe(
      'Authentication session expired. Please re-authenticate with: gcloud auth application-default login',
    );
  });
});

describe('classifyGCPError — UNAUTHENTICATED', () => {
  it.each([
    'UNAUTHENTICATED: foo',
    'Request had invalid authentication credentials',
    'Could not load the default credentials',
  ])('classifies %s as AUTH_REQUIRED', (msg) => {
    const result = classifyGCPError({ message: msg });
    expect(result.code).toBe(ImportErrorCode.AUTH_REQUIRED);
    expect(result.action?.type).toBe('reauth');
  });
});

describe('classifyGCPError — PERMISSION_DENIED', () => {
  it.each(['PERMISSION_DENIED: x', 'caller does not have access', 'permission required'])(
    'classifies %s as AUTH_INSUFFICIENT_PERMISSIONS',
    (msg) => {
      const result = classifyGCPError({ message: msg });
      expect(result.code).toBe(ImportErrorCode.AUTH_INSUFFICIENT_PERMISSIONS);
      expect(result.recoverable).toBe(false);
      expect(result.action?.type).toBe('grant_permission');
    },
  );

  it('classifies error.code=403 as AUTH_INSUFFICIENT_PERMISSIONS', () => {
    const result = classifyGCPError({ code: 403, message: 'unrelated' });
    expect(result.code).toBe(ImportErrorCode.AUTH_INSUFFICIENT_PERMISSIONS);
  });
});

describe('classifyGCPError — API not enabled', () => {
  it.each([
    'API has not been used in project',
    'has not been enabled for project',
    'cloudasset.googleapis.com is required',
    'API is disabled',
  ])('classifies %s as API_NOT_ENABLED', (msg) => {
    const result = classifyGCPError({ message: msg });
    expect(result.code).toBe(ImportErrorCode.API_NOT_ENABLED);
    expect(result.action?.type).toBe('enable_api');
  });
});

describe('classifyGCPError — quota exceeded', () => {
  it.each(['QUOTA_EXCEEDED', 'quota exceeded for project', 'rate limit reached'])(
    'classifies %s as API_RATE_LIMITED',
    (msg) => {
      const result = classifyGCPError({ message: msg });
      expect(result.code).toBe(ImportErrorCode.API_RATE_LIMITED);
      expect(result.action?.type).toBe('retry');
    },
  );

  it('classifies error.code=429 as API_RATE_LIMITED', () => {
    const result = classifyGCPError({ code: 429, message: 'unrelated' });
    expect(result.code).toBe(ImportErrorCode.API_RATE_LIMITED);
  });
});

describe('classifyGCPError — resource not found', () => {
  it('classifies NOT_FOUND messages as RESOURCE_NOT_FOUND', () => {
    const result = classifyGCPError({ message: 'NOT_FOUND: subscription' });
    expect(result.code).toBe(ImportErrorCode.RESOURCE_NOT_FOUND);
  });

  it('classifies error.code=404 as RESOURCE_NOT_FOUND', () => {
    const result = classifyGCPError({ code: 404, message: 'unrelated' });
    expect(result.code).toBe(ImportErrorCode.RESOURCE_NOT_FOUND);
  });
});

describe('classifyGCPError — fallback', () => {
  it('classifies an unrecognized error as API_ERROR with prefixed message', () => {
    const result = classifyGCPError({ message: 'something weird' });
    expect(result.code).toBe(ImportErrorCode.API_ERROR);
    expect(result.message).toBe('GCP API error: something weird');
    expect(result.recoverable).toBe(false);
  });

  it('uses String(error) when message is missing', () => {
    const result = classifyGCPError({});
    expect(result.message).toBe('GCP API error: [object Object]');
  });
});

describe('classifyGCPError — service threading', () => {
  it('threads service name through every branch', () => {
    expect(classifyGCPError({ message: 'invalid_grant' }, 'compute').service).toBe('compute');
    expect(classifyGCPError({ message: 'NOT_FOUND' }, 'compute').service).toBe('compute');
    expect(classifyGCPError({ message: 'random' }, 'compute').service).toBe('compute');
  });
});

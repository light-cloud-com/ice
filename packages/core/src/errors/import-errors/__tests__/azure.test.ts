/**
 * rf-ierr-4 — classifyAzureError tests.
 */

import { describe, it, expect } from 'vitest';
import { classifyAzureError } from '../azure';
import { ImportErrorCode } from '../types';

describe('classifyAzureError — authentication failed', () => {
  it.each([
    { code: 'AuthenticationFailed' },
    { code: 'InvalidAuthenticationToken' },
    { code: 'ExpiredAuthenticationToken' },
    { message: 'AADSTS50058 — sign-in required' },
    { message: 'token has expired' },
    { message: 'authentication required' },
  ])('classifies %j as AUTH_REAUTH_REQUIRED', (input) => {
    const result = classifyAzureError(input);
    expect(result.code).toBe(ImportErrorCode.AUTH_REAUTH_REQUIRED);
    expect(result.action?.command).toBe('az login');
  });
});

describe('classifyAzureError — credentials missing', () => {
  it.each([
    { code: 'CredentialUnavailable' },
    { message: 'DefaultAzureCredential failed to retrieve' },
    { message: 'Unable to find credential' },
  ])('classifies %j as AUTH_REQUIRED', (input) => {
    const result = classifyAzureError(input);
    expect(result.code).toBe(ImportErrorCode.AUTH_REQUIRED);
    expect(result.action?.command).toBe('az login');
  });
});

describe('classifyAzureError — authorization failures', () => {
  it.each([{ code: 'AuthorizationFailed' }, { code: 'Forbidden' }, { statusCode: 403 }])(
    'classifies %j as AUTH_INSUFFICIENT_PERMISSIONS',
    (input) => {
      const result = classifyAzureError(input);
      expect(result.code).toBe(ImportErrorCode.AUTH_INSUFFICIENT_PERMISSIONS);
      expect(result.action?.type).toBe('grant_permission');
    },
  );
});

describe('classifyAzureError — subscription not found', () => {
  it.each([{ code: 'SubscriptionNotFound' }, { message: 'subscription was not found' }])(
    'classifies %j as RESOURCE_NOT_FOUND',
    (input) => {
      const result = classifyAzureError(input);
      expect(result.code).toBe(ImportErrorCode.RESOURCE_NOT_FOUND);
      expect(result.recoverable).toBe(false);
    },
  );
});

describe('classifyAzureError — rate limiting', () => {
  it.each([{ code: 'TooManyRequests' }, { statusCode: 429 }])('classifies %j as API_RATE_LIMITED', (input) => {
    const result = classifyAzureError(input);
    expect(result.code).toBe(ImportErrorCode.API_RATE_LIMITED);
    expect(result.action?.type).toBe('retry');
  });
});

describe('classifyAzureError — resource not found', () => {
  it.each([{ code: 'ResourceNotFound' }, { statusCode: 404 }])(
    'classifies %j as RESOURCE_NOT_FOUND (generic)',
    (input) => {
      const result = classifyAzureError(input);
      expect(result.code).toBe(ImportErrorCode.RESOURCE_NOT_FOUND);
      expect(result.message).toBe('Resource not found.');
    },
  );
});

describe('classifyAzureError — fallback', () => {
  it('classifies unknown errors as API_ERROR', () => {
    const result = classifyAzureError({ message: 'something else' });
    expect(result.code).toBe(ImportErrorCode.API_ERROR);
    expect(result.message).toBe('Azure API error: something else');
  });

  it('uses String(error) when message is missing', () => {
    const result = classifyAzureError({});
    expect(result.message).toBe('Azure API error: [object Object]');
  });
});

describe('classifyAzureError — service threading', () => {
  it('threads service name through', () => {
    expect(classifyAzureError({ statusCode: 429 }, 'compute').service).toBe('compute');
    expect(classifyAzureError({ message: 'random' }, 'compute').service).toBe('compute');
  });
});

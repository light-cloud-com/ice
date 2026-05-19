/**
 * rf-ierr-3 — classifyAWSError tests.
 */

import { describe, it, expect } from 'vitest';
import { classifyAWSError } from '../aws';
import { ImportErrorCode } from '../types';

describe('classifyAWSError — credentials expired', () => {
  it.each([
    { code: 'ExpiredTokenException' },
    { code: 'ExpiredToken' },
    { message: 'Your token has expired' },
    { message: 'Security token expired and is invalid' },
  ])('classifies %j as AUTH_EXPIRED', (input) => {
    const result = classifyAWSError(input);
    expect(result.code).toBe(ImportErrorCode.AUTH_EXPIRED);
    expect(result.action?.command).toBe('aws sso login');
  });
});

describe('classifyAWSError — invalid credentials', () => {
  it.each([
    { code: 'InvalidClientTokenId' },
    { code: 'SignatureDoesNotMatch' },
    { code: 'InvalidAccessKeyId' },
    { code: 'CredentialsError' },
    { message: 'Unable to locate credentials' },
  ])('classifies %j as AUTH_INVALID_CREDENTIALS', (input) => {
    const result = classifyAWSError(input);
    expect(result.code).toBe(ImportErrorCode.AUTH_INVALID_CREDENTIALS);
    expect(result.action?.command).toBe('aws configure');
  });
});

describe('classifyAWSError — access denied', () => {
  it.each([
    { code: 'AccessDeniedException' },
    { code: 'AccessDenied' },
    { code: 'UnauthorizedAccess' },
    { $metadata: { httpStatusCode: 403 } },
  ])('classifies %j as AUTH_INSUFFICIENT_PERMISSIONS', (input) => {
    const result = classifyAWSError(input);
    expect(result.code).toBe(ImportErrorCode.AUTH_INSUFFICIENT_PERMISSIONS);
    expect(result.action?.type).toBe('grant_permission');
  });
});

describe('classifyAWSError — Resource Explorer not enabled', () => {
  it.each([
    { code: 'ResourceExplorerNotEnabledException' },
    { message: 'Resource Explorer needs activation' },
  ])('classifies %j as RESOURCE_EXPLORER_NOT_ENABLED', (input) => {
    const result = classifyAWSError(input);
    expect(result.code).toBe(ImportErrorCode.RESOURCE_EXPLORER_NOT_ENABLED);
    expect(result.action?.type).toBe('enable_service');
  });

  // The 'not enabled' substring branch ALSO triggers RESOURCE_EXPLORER_NOT_ENABLED
  // (see the AWS classifier — message.includes('not enabled') is in the same OR group).
  it('classifies "not enabled" messages as RESOURCE_EXPLORER_NOT_ENABLED', () => {
    const result = classifyAWSError({ message: 'API is not enabled' });
    expect(result.code).toBe(ImportErrorCode.RESOURCE_EXPLORER_NOT_ENABLED);
  });
});

describe('classifyAWSError — throttling', () => {
  it.each([
    { code: 'Throttling' },
    { code: 'ThrottlingException' },
    { code: 'TooManyRequestsException' },
    { $metadata: { httpStatusCode: 429 } },
  ])('classifies %j as API_RATE_LIMITED', (input) => {
    const result = classifyAWSError(input);
    expect(result.code).toBe(ImportErrorCode.API_RATE_LIMITED);
    expect(result.action?.type).toBe('retry');
  });
});

describe('classifyAWSError — resource not found', () => {
  it.each([
    { code: 'ResourceNotFoundException' },
    { $metadata: { httpStatusCode: 404 } },
  ])('classifies %j as RESOURCE_NOT_FOUND', (input) => {
    const result = classifyAWSError(input);
    expect(result.code).toBe(ImportErrorCode.RESOURCE_NOT_FOUND);
  });
});

describe('classifyAWSError — fallback', () => {
  it('classifies unknown errors as API_ERROR with prefixed message', () => {
    const result = classifyAWSError({ message: 'random aws thing' });
    expect(result.code).toBe(ImportErrorCode.API_ERROR);
    expect(result.message).toBe('AWS API error: random aws thing');
  });

  it('uses error.name when error.code is missing', () => {
    // name=ExpiredTokenException routes via the AUTH_EXPIRED branch.
    const result = classifyAWSError({ name: 'ExpiredTokenException', message: 'whatever' });
    expect(result.code).toBe(ImportErrorCode.AUTH_EXPIRED);
  });

  it('uses String(error) when message is missing', () => {
    const result = classifyAWSError({});
    expect(result.message).toBe('AWS API error: [object Object]');
  });
});

describe('classifyAWSError — service threading', () => {
  it('threads service name through', () => {
    expect(classifyAWSError({ code: 'Throttling' }, 'ec2').service).toBe('ec2');
    expect(classifyAWSError({ message: 'random' }, 'ec2').service).toBe('ec2');
  });
});

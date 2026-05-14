/**
 * rf-ierr-shim — Re-export shim smoke test.
 *
 * Verifies that the public API of `import-errors.ts` re-exports the
 * same names as before the rf-ierr split. Downstream consumers
 * (gcp/aws/azure importers) import directly from this path.
 */

import { describe, it, expect } from 'vitest';
import {
  ImportErrorCode,
  classifyGCPError,
  classifyAWSError,
  classifyAzureError,
  type ImportError,
  type ImportWarning,
  type ImportErrorAction,
  type ImportErrorActionType,
} from '../import-errors';

describe('import-errors shim', () => {
  it('re-exports ImportErrorCode enum', () => {
    expect(ImportErrorCode.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
    expect(ImportErrorCode.API_ERROR).toBe('API_ERROR');
  });

  it('re-exports classifyGCPError as a function', () => {
    expect(typeof classifyGCPError).toBe('function');
    const result = classifyGCPError({ message: 'invalid_grant' });
    expect(result.code).toBe(ImportErrorCode.AUTH_REAUTH_REQUIRED);
  });

  it('re-exports classifyAWSError as a function', () => {
    expect(typeof classifyAWSError).toBe('function');
    const result = classifyAWSError({ code: 'AccessDenied' });
    expect(result.code).toBe(ImportErrorCode.AUTH_INSUFFICIENT_PERMISSIONS);
  });

  it('re-exports classifyAzureError as a function', () => {
    expect(typeof classifyAzureError).toBe('function');
    const result = classifyAzureError({ statusCode: 429 });
    expect(result.code).toBe(ImportErrorCode.API_RATE_LIMITED);
  });

  it('re-exports ImportError / ImportWarning / ImportErrorAction / ImportErrorActionType type symbols', () => {
    // Type-only assertion via construction.
    const action: ImportErrorAction = { type: 'reauth' };
    const err: ImportError = { code: 'X', message: 'm', recoverable: false, action };
    const w: ImportWarning = { code: 'X', message: 'm' };
    const t: ImportErrorActionType = 'retry';
    expect(err.code).toBe('X');
    expect(w.code).toBe('X');
    expect(t).toBe('retry');
  });
});

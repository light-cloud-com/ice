/**
 * Tests for AWS SDK init helpers (rf-aimp-2 extraction).
 *
 * These functions wrap dynamic imports of `@aws-sdk/client-*` packages
 * via the `Function('m', 'return import(m)')` indirection.  We can't
 * easily intercept the dynamic-import path without patching the module
 * itself, so the tests focus on:
 *   - The error message contract on init failure (no SDK installed)
 *   - The graceful 'unknown' fallback in get_account_id
 */

import { describe, it, expect } from 'vitest';
import { init_aws_sdk, get_account_id } from '../sdk-init.js';

describe('init_aws_sdk', () => {
  it('throws a friendly install-the-sdk error when the dynamic import fails', async () => {
    // The @aws-sdk/client-* packages are NOT installed in @ice/core.
    // This means init_aws_sdk must throw with the canonical message.
    await expect(init_aws_sdk()).rejects.toThrow(
      /Failed to initialize AWS SDK\. Make sure AWS SDK v3 packages are installed/,
    );
  });

  it('preserves the underlying error as cause', async () => {
    let captured: Error | undefined;
    try {
      await init_aws_sdk();
    } catch (e) {
      captured = e as Error;
    }
    expect(captured).toBeDefined();
    expect(captured!.cause).toBeDefined();
  });

  it('throws even when a profile string is supplied', async () => {
    await expect(init_aws_sdk('test-profile')).rejects.toThrow(/Failed to initialize AWS SDK/);
  });
});

describe('get_account_id', () => {
  it('returns "unknown" when STS.send throws', async () => {
    const sdk = {
      STS: {
        send: async () => {
          throw new Error('boom');
        },
      },
      ResourceExplorer: {},
      ConfigService: {},
    };
    expect(await get_account_id(sdk as never)).toBe('unknown');
  });

  it('returns "unknown" when STS module dynamic-import fails', async () => {
    // The dynamic import fails first (SDK not installed), short-circuits to catch.
    const sdk = {
      STS: { send: async () => ({ Account: '123' }) },
      ResourceExplorer: {},
      ConfigService: {},
    };
    // Dynamic import fails inside the function body before send() runs.
    expect(await get_account_id(sdk as never)).toBe('unknown');
  });
});

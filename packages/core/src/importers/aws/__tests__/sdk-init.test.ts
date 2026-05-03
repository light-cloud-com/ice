/**
 * Tests for AWS SDK init helpers (rf-aimp-2 extraction).
 *
 * These functions wrap dynamic imports of `@aws-sdk/client-*` packages
 * via the `Function('m', 'return import(m)')` indirection. The dynamic
 * import bypasses Vitest's module registry, so vi.mock is a no-op. The
 * working pattern (from learnings.md `function-constructor-stub-
 * intercepts-bypass-bundler-imports`) is to swap `globalThis.Function`
 * for the test, returning canned modules for the recognised specifier
 * shape and falling through for anything else. Restored in afterEach.
 *
 * What's tested:
 *   - Error message contract on init failure (no SDK installed)
 *   - Graceful 'unknown' fallback in get_account_id
 *   - Happy path with profile=undefined (default credential chain)
 *   - Happy path with profile='...' (loads credentials from ini)
 *   - get_account_id returns the account id when STS.send succeeds
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { init_aws_sdk, get_account_id } from '../sdk-init.js';

describe('init_aws_sdk — failure paths (no SDK installed)', () => {
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

describe('init_aws_sdk — success paths via Function() stub', () => {
  // Pattern documented in learnings.md (`function-constructor-stub-
  // intercepts-bypass-bundler-imports`). The SUT calls
  // `Function('m','return import(m)')(spec)` — recognising that
  // signature lets us hand back canned SDK namespaces. SDK clients are
  // constructed with `new`, so the stubs must be real classes, not
  // arrow functions.
  const originalFunction = globalThis.Function;

  // Track constructor invocations so we can assert profile credentials
  // are threaded through.
  const constructed: Array<{ kind: string; opts: unknown }> = [];

  class FakeSTSClient {
    constructor(opts: unknown) {
      constructed.push({ kind: 'sts', opts });
    }
  }
  class FakeResourceExplorer2Client {
    constructor(opts: unknown) {
      constructed.push({ kind: 're', opts });
    }
  }
  class FakeConfigServiceClient {
    constructor(opts: unknown) {
      constructed.push({ kind: 'config', opts });
    }
  }

  const fromIni = vi.fn((args: unknown) => ({ provider: 'fromIni', args }));

  const fakeRegistry: Record<string, Record<string, unknown>> = {
    '@aws-sdk/client-sts': { STSClient: FakeSTSClient },
    '@aws-sdk/client-resource-explorer-2': { ResourceExplorer2Client: FakeResourceExplorer2Client },
    '@aws-sdk/client-config-service': { ConfigServiceClient: FakeConfigServiceClient },
    '@aws-sdk/credential-providers': { fromIni },
  };

  beforeEach(() => {
    constructed.length = 0;
    fromIni.mockClear();

    // Replace globalThis.Function with a stub that returns our resolver
    // when called with the canonical 'm','return import(m)' shape, and
    // delegates to the real Function constructor for everything else.
    const fnStub = function (...args: unknown[]) {
      if (
        args.length === 2 &&
        args[0] === 'm' &&
        typeof args[1] === 'string' &&
        (args[1] as string).includes('return import')
      ) {
        return (spec: string) => {
          if (spec in fakeRegistry) return Promise.resolve(fakeRegistry[spec]);
          return Promise.reject(new Error(`unknown spec ${spec}`));
        };
      }
      // @ts-expect-error — passthrough to original constructor
      return new originalFunction(...args);
    } as unknown as FunctionConstructor;

    // Preserve prototype chain so `instanceof Function` checks still work
    fnStub.prototype = originalFunction.prototype;
    globalThis.Function = fnStub;
  });

  afterEach(() => {
    globalThis.Function = originalFunction;
  });

  it('constructs all three clients with empty config when no profile supplied', async () => {
    const sdk = await init_aws_sdk();
    expect(sdk.STS).toBeInstanceOf(FakeSTSClient);
    expect(sdk.ResourceExplorer).toBeInstanceOf(FakeResourceExplorer2Client);
    expect(sdk.ConfigService).toBeInstanceOf(FakeConfigServiceClient);
    expect(constructed).toHaveLength(3);
    // No profile means no credentials in config
    for (const c of constructed) {
      expect(c.opts).toEqual({});
    }
    expect(fromIni).not.toHaveBeenCalled();
  });

  it('threads fromIni({ profile }) credentials into every client config', async () => {
    await init_aws_sdk('my-profile');
    expect(fromIni).toHaveBeenCalledWith({ profile: 'my-profile' });
    expect(constructed).toHaveLength(3);
    for (const c of constructed) {
      const opts = c.opts as { credentials?: { provider: string; args: unknown } };
      expect(opts.credentials).toMatchObject({ provider: 'fromIni', args: { profile: 'my-profile' } });
    }
  });

  it('throws the friendly error when credential-providers import fails (profile path)', async () => {
    // Drop the credentials provider from the registry to force the inner
    // dynamic import to reject.
    const original = fakeRegistry['@aws-sdk/credential-providers'];
    delete fakeRegistry['@aws-sdk/credential-providers'];
    try {
      await expect(init_aws_sdk('test-profile')).rejects.toThrow(/Failed to initialize AWS SDK/);
    } finally {
      fakeRegistry['@aws-sdk/credential-providers'] = original;
    }
  });

  it('stringifies non-Error rejection values in the friendly error message', async () => {
    // Replace the resolver to return a non-Error rejection so the
    // catch arm hits the `String(error)` branch (line 66).
    const fnStub2 = function (...args: unknown[]) {
      if (
        args.length === 2 &&
        args[0] === 'm' &&
        typeof args[1] === 'string' &&
        (args[1] as string).includes('return import')
      ) {
        return () => Promise.reject('plain-string-rejection');
      }
      // @ts-expect-error passthrough
      return new originalFunction(...args);
    } as unknown as FunctionConstructor;
    fnStub2.prototype = originalFunction.prototype;
    globalThis.Function = fnStub2;

    await expect(init_aws_sdk()).rejects.toThrow(/plain-string-rejection/);
  });
});

describe('get_account_id', () => {
  const originalFunction = globalThis.Function;

  afterEach(() => {
    globalThis.Function = originalFunction;
  });

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

  it('returns "unknown" when STS module dynamic-import fails (no SDK installed)', async () => {
    // The dynamic import fails first (SDK not installed), short-circuits to catch.
    const sdk = {
      STS: { send: async () => ({ Account: '123' }) },
      ResourceExplorer: {},
      ConfigService: {},
    };
    // Dynamic import fails inside the function body before send() runs.
    expect(await get_account_id(sdk as never)).toBe('unknown');
  });

  it('returns the Account from STS.send response when dynamic import + send succeed', async () => {
    class FakeGetCallerIdentityCommand {
      input: unknown;
      constructor(input: unknown) {
        this.input = input;
      }
    }
    const fakeRegistry: Record<string, Record<string, unknown>> = {
      '@aws-sdk/client-sts': { GetCallerIdentityCommand: FakeGetCallerIdentityCommand },
    };
    const fnStub = function (...args: unknown[]) {
      if (
        args.length === 2 &&
        args[0] === 'm' &&
        typeof args[1] === 'string' &&
        (args[1] as string).includes('return import')
      ) {
        return (spec: string) =>
          spec in fakeRegistry ? Promise.resolve(fakeRegistry[spec]) : Promise.reject(new Error('miss'));
      }
      // @ts-expect-error passthrough
      return new originalFunction(...args);
    } as unknown as FunctionConstructor;
    fnStub.prototype = originalFunction.prototype;
    globalThis.Function = fnStub;

    const sdk = {
      STS: {
        send: async (cmd: { input: unknown }) => {
          // Verify the SUT did construct GetCallerIdentityCommand with {} input
          expect(cmd).toBeInstanceOf(FakeGetCallerIdentityCommand);
          expect(cmd.input).toEqual({});
          return { Account: '123456789' };
        },
      },
      ResourceExplorer: {},
      ConfigService: {},
    };
    expect(await get_account_id(sdk as never)).toBe('123456789');
  });

  it('returns empty string when STS response has no Account field', async () => {
    class FakeGetCallerIdentityCommand {
      constructor(_input: unknown) {}
    }
    const fakeRegistry = { '@aws-sdk/client-sts': { GetCallerIdentityCommand: FakeGetCallerIdentityCommand } };
    const fnStub = function (...args: unknown[]) {
      if (
        args.length === 2 &&
        args[0] === 'm' &&
        typeof args[1] === 'string' &&
        (args[1] as string).includes('return import')
      ) {
        return (spec: string) =>
          spec in fakeRegistry
            ? Promise.resolve(fakeRegistry[spec as keyof typeof fakeRegistry])
            : Promise.reject(new Error('miss'));
      }
      // @ts-expect-error passthrough
      return new originalFunction(...args);
    } as unknown as FunctionConstructor;
    fnStub.prototype = originalFunction.prototype;
    globalThis.Function = fnStub;

    const sdk = {
      STS: { send: async () => ({}) }, // no Account
      ResourceExplorer: {},
      ConfigService: {},
    };
    expect(await get_account_id(sdk as never)).toBe('');
  });
});

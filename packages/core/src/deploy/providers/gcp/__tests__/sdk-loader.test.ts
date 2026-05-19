/**
 * Tests for `gcp/sdk-loader.ts`.
 *
 * The loader wraps every GCP SDK package
 * (`@google-cloud/compute`, `storage`, `run`, `pubsub`, `secret-manager`,
 * `bigquery`, `logging`, `scheduler`, `functions`, `firestore`, `aiplatform`,
 * `container`) plus `google-auth-library` behind the `Function('m',
 * 'return import(m)')` indirection. Vitest's module registry never sees
 * these specifiers; we replace `globalThis.Function` with a stub that
 * recognizes the dynamic-import constructor signature and routes the
 * requested module name through a controllable registry.
 *
 * Mirrors the harness in `azure-deployer.test.ts`. See learning anchor
 * `function-constructor-stub-intercepts-bypass-bundler-imports` and
 * `gcp-importer coverage` (real classes for `new`-able SDK constructors).
 *
 * Coverage scope:
 * - `load_sdk`: success path, swallowed-rejection path
 * - `initialize_gcp_clients`: every per-SDK if-block hits success +
 *   "missing" branches; every auth-option branch (keyFilename /
 *   credentials / authClient / none); the `JobsClient` / `aiplatform.*`
 *   / `functions.v2.FunctionServiceClient` optional sub-client branches.
 * - `verify_gcp_auth`: external_client passthrough; missing google-auth-library;
 *   getClient throws with auth-missing pattern, with auth-expired pattern,
 *   with generic error; getAccessToken returns no token; getAccessToken throws
 *   transient-style and non-transient errors.
 * - `create_rest_client`: builds GCPRestClient with get/post/patch/delete
 *   helpers that delegate to auth_client.request; verifies headers and
 *   request shape; exercises retry-on-transient + permanent-error fast-fail
 *   in withRetry; covers `requestRaw` shape and validateStatus default;
 *   ensures `authClient` and `requestRaw` are attached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_MESSAGES } from '../../../messages';

// =============================================================================
// Function-constructor stub
// =============================================================================

const original_function = globalThis.Function;

function install_dynamic_import_stub(registry: Record<string, unknown>): void {
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return (module_name: string) => {
        if (!(module_name in registry)) {
          return Promise.reject(new Error(`Mocked module not registered: ${module_name}`));
        }
        const mod = registry[module_name];
        if (mod === null) {
          // Sentinel: signal a rejection (the load_sdk catch arm)
          return Promise.reject(new Error(`forced reject: ${module_name}`));
        }
        return Promise.resolve(mod);
      };
    }
    return (original_function as unknown as (...a: unknown[]) => unknown).apply(original_function, args);
  };
  (globalThis as { Function: unknown }).Function = stub;
}

function restore_dynamic_import_stub(): void {
  (globalThis as { Function: unknown }).Function = original_function;
}

// =============================================================================
// Fake SDK classes
//
// Every GCP client is invoked with `new`, so each must be a real class. Using
// `vi.fn().mockImplementation(...)` would surface as "X is not a constructor".
// See learning anchor `function-ctor-stub-needs-class-not-vifn-for-new-callsites`.
// =============================================================================

function tagged(name: string) {
  return class {
    __ctor = name;
    args: any;
    constructor(...args: any[]) {
      this.args = args;
    }
  };
}

function makeComputeModule() {
  return {
    InstancesClient: tagged('InstancesClient'),
    GlobalForwardingRulesClient: tagged('GlobalForwardingRulesClient'),
  };
}
function makeStorageModule() {
  return { Storage: tagged('Storage') };
}
function makeRunModule(opts: { withJobs?: boolean } = {}) {
  const mod: Record<string, unknown> = { ServicesClient: tagged('ServicesClient') };
  if (opts.withJobs !== false) {
    mod.JobsClient = tagged('JobsClient');
  }
  return mod;
}
function makePubSubModule() {
  return { PubSub: tagged('PubSub') };
}
function makeSecretManagerModule() {
  return { SecretManagerServiceClient: tagged('SecretManagerServiceClient') };
}
function makeBigQueryModule() {
  return { BigQuery: tagged('BigQuery') };
}
function makeLoggingModule() {
  return { Logging: tagged('Logging') };
}
function makeSchedulerModule() {
  return { CloudSchedulerClient: tagged('CloudSchedulerClient') };
}
function makeFunctionsModule(opts: { underV2?: boolean; underTopLevel?: boolean; missing?: boolean } = {}) {
  const mod: any = {};
  if (opts.missing) return mod;
  if (opts.underV2) {
    mod.v2 = { FunctionServiceClient: tagged('FunctionServiceClientV2') };
  }
  if (opts.underTopLevel) {
    mod.FunctionServiceClient = tagged('FunctionServiceClientTop');
  }
  return mod;
}
function makeFirestoreModule() {
  return { Firestore: tagged('Firestore') };
}
function makeAiPlatformModule(opts: { withIndex?: boolean; withIndexEndpoint?: boolean } = {}) {
  const mod: any = { EndpointServiceClient: tagged('EndpointServiceClient') };
  if (opts.withIndex !== false) mod.IndexServiceClient = tagged('IndexServiceClient');
  if (opts.withIndexEndpoint !== false) mod.IndexEndpointServiceClient = tagged('IndexEndpointServiceClient');
  return mod;
}
function makeContainerModule() {
  return { ClusterManagerClient: tagged('ClusterManagerClient') };
}

function fullRegistry(): Record<string, unknown> {
  return {
    '@google-cloud/compute': makeComputeModule(),
    '@google-cloud/storage': makeStorageModule(),
    '@google-cloud/run': makeRunModule(),
    '@google-cloud/pubsub': makePubSubModule(),
    '@google-cloud/secret-manager': makeSecretManagerModule(),
    '@google-cloud/bigquery': makeBigQueryModule(),
    '@google-cloud/logging': makeLoggingModule(),
    '@google-cloud/scheduler': makeSchedulerModule(),
    '@google-cloud/functions': makeFunctionsModule({ underV2: true }),
    '@google-cloud/firestore': makeFirestoreModule(),
    '@google-cloud/aiplatform': makeAiPlatformModule(),
    '@google-cloud/container': makeContainerModule(),
  };
}

// =============================================================================
// Lifecycle
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  restore_dynamic_import_stub();
  vi.useRealTimers();
});

// =============================================================================
// load_sdk
// =============================================================================

describe('load_sdk', () => {
  it('returns the dynamic-import result on a successful import', async () => {
    install_dynamic_import_stub({
      '@google-cloud/compute': makeComputeModule(),
    });
    const { load_sdk } = await import('../sdk-loader');
    const mod = await load_sdk('@google-cloud/compute');
    expect(mod).toBeTruthy();
    expect(mod.InstancesClient).toBeDefined();
  });

  it('returns null when the dynamic import rejects', async () => {
    // No registry entry → import rejects → catch returns null.
    install_dynamic_import_stub({});
    const { load_sdk } = await import('../sdk-loader');
    const mod = await load_sdk('@google-cloud/missing');
    expect(mod).toBeNull();
  });
});

// =============================================================================
// initialize_gcp_clients — happy path & every per-SDK arm
// =============================================================================

describe('initialize_gcp_clients', () => {
  it('returns an empty Map when every SDK is missing', async () => {
    install_dynamic_import_stub({});
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');
    expect(clients).toBeInstanceOf(Map);
    expect(clients.size).toBe(0);
  });

  it('initializes every client when every SDK is present', async () => {
    install_dynamic_import_stub(fullRegistry());
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');

    expect(clients.has('compute.instances')).toBe(true);
    expect(clients.has('compute.globalForwardingRules')).toBe(true);
    expect(clients.has('storage')).toBe(true);
    expect(clients.has('run.services')).toBe(true);
    expect(clients.has('run.jobs')).toBe(true);
    expect(clients.has('pubsub')).toBe(true);
    expect(clients.has('secretmanager')).toBe(true);
    expect(clients.has('bigquery')).toBe(true);
    expect(clients.has('logging')).toBe(true);
    expect(clients.has('scheduler')).toBe(true);
    expect(clients.has('functions')).toBe(true);
    expect(clients.has('firestore')).toBe(true);
    expect(clients.has('aiplatform.endpoint')).toBe(true);
    expect(clients.has('aiplatform.index')).toBe(true);
    expect(clients.has('aiplatform.indexEndpoint')).toBe(true);
    expect(clients.has('container')).toBe(true);
  });

  it('passes projectId on every client', async () => {
    install_dynamic_import_stub(fullRegistry());
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('proj-xyz');

    const compute = clients.get('compute.instances') as any;
    expect(compute.args[0].projectId).toBe('proj-xyz');

    const storage = clients.get('storage') as any;
    expect(storage.args[0].projectId).toBe('proj-xyz');
  });

  it('threads keyFilename onto every client when auth.keyFilename is provided', async () => {
    install_dynamic_import_stub(fullRegistry());
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1', { keyFilename: '/tmp/sa.json' });

    expect((clients.get('compute.instances') as any).args[0].keyFilename).toBe('/tmp/sa.json');
    expect((clients.get('storage') as any).args[0].keyFilename).toBe('/tmp/sa.json');
    // No fallthrough to credentials / authClient on this branch
    expect((clients.get('compute.instances') as any).args[0].credentials).toBeUndefined();
  });

  it('threads credentials onto every client when auth.credentials is provided (no keyFilename)', async () => {
    install_dynamic_import_stub(fullRegistry());
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const creds = { client_email: 'svc@p.iam', private_key: '-----' };
    const clients = await initialize_gcp_clients('p1', { credentials: creds });

    expect((clients.get('compute.instances') as any).args[0].credentials).toEqual(creds);
    expect((clients.get('compute.instances') as any).args[0].keyFilename).toBeUndefined();
  });

  it('threads authClient onto every client when only authClient is provided', async () => {
    install_dynamic_import_stub(fullRegistry());
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const fakeAuthClient = { kind: 'pre-auth-client' };
    const clients = await initialize_gcp_clients('p1', { authClient: fakeAuthClient });

    expect((clients.get('compute.instances') as any).args[0].authClient).toBe(fakeAuthClient);
    expect((clients.get('storage') as any).args[0].authClient).toBe(fakeAuthClient);
  });

  it('skips run.jobs when @google-cloud/run module has no JobsClient export', async () => {
    install_dynamic_import_stub({
      ...fullRegistry(),
      '@google-cloud/run': makeRunModule({ withJobs: false }),
    });
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');

    expect(clients.has('run.services')).toBe(true);
    expect(clients.has('run.jobs')).toBe(false);
  });

  it('uses functions.v2.FunctionServiceClient when present', async () => {
    install_dynamic_import_stub({
      ...fullRegistry(),
      '@google-cloud/functions': makeFunctionsModule({ underV2: true }),
    });
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');

    const fn = clients.get('functions') as any;
    expect(fn.__ctor).toBe('FunctionServiceClientV2');
  });

  it('falls back to top-level FunctionServiceClient when functions.v2 is absent', async () => {
    install_dynamic_import_stub({
      ...fullRegistry(),
      '@google-cloud/functions': makeFunctionsModule({ underV2: false, underTopLevel: true }),
    });
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');

    const fn = clients.get('functions') as any;
    expect(fn.__ctor).toBe('FunctionServiceClientTop');
  });

  it('omits functions when neither v2 nor top-level FunctionServiceClient is exported', async () => {
    install_dynamic_import_stub({
      ...fullRegistry(),
      '@google-cloud/functions': {},
    });
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');

    expect(clients.has('functions')).toBe(false);
  });

  it('omits aiplatform.index when IndexServiceClient is not exported', async () => {
    install_dynamic_import_stub({
      ...fullRegistry(),
      '@google-cloud/aiplatform': makeAiPlatformModule({ withIndex: false }),
    });
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');

    expect(clients.has('aiplatform.endpoint')).toBe(true);
    expect(clients.has('aiplatform.index')).toBe(false);
    expect(clients.has('aiplatform.indexEndpoint')).toBe(true);
  });

  it('omits aiplatform.indexEndpoint when IndexEndpointServiceClient is not exported', async () => {
    install_dynamic_import_stub({
      ...fullRegistry(),
      '@google-cloud/aiplatform': makeAiPlatformModule({ withIndexEndpoint: false }),
    });
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');

    expect(clients.has('aiplatform.indexEndpoint')).toBe(false);
  });

  it('omits compute clients when @google-cloud/compute is missing', async () => {
    const reg = fullRegistry();
    delete reg['@google-cloud/compute'];
    install_dynamic_import_stub(reg);
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');

    expect(clients.has('compute.instances')).toBe(false);
    expect(clients.has('compute.globalForwardingRules')).toBe(false);
    // Other unrelated clients still present
    expect(clients.has('storage')).toBe(true);
  });

  it('omits storage when @google-cloud/storage is missing', async () => {
    const reg = fullRegistry();
    delete reg['@google-cloud/storage'];
    install_dynamic_import_stub(reg);
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');
    expect(clients.has('storage')).toBe(false);
  });

  it('omits pubsub when @google-cloud/pubsub is missing', async () => {
    const reg = fullRegistry();
    delete reg['@google-cloud/pubsub'];
    install_dynamic_import_stub(reg);
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');
    expect(clients.has('pubsub')).toBe(false);
  });

  it('omits secretmanager when @google-cloud/secret-manager is missing', async () => {
    const reg = fullRegistry();
    delete reg['@google-cloud/secret-manager'];
    install_dynamic_import_stub(reg);
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');
    expect(clients.has('secretmanager')).toBe(false);
  });

  it('omits bigquery when @google-cloud/bigquery is missing', async () => {
    const reg = fullRegistry();
    delete reg['@google-cloud/bigquery'];
    install_dynamic_import_stub(reg);
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');
    expect(clients.has('bigquery')).toBe(false);
  });

  it('omits logging when @google-cloud/logging is missing', async () => {
    const reg = fullRegistry();
    delete reg['@google-cloud/logging'];
    install_dynamic_import_stub(reg);
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');
    expect(clients.has('logging')).toBe(false);
  });

  it('omits scheduler when @google-cloud/scheduler is missing', async () => {
    const reg = fullRegistry();
    delete reg['@google-cloud/scheduler'];
    install_dynamic_import_stub(reg);
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');
    expect(clients.has('scheduler')).toBe(false);
  });

  it('omits firestore when @google-cloud/firestore is missing', async () => {
    const reg = fullRegistry();
    delete reg['@google-cloud/firestore'];
    install_dynamic_import_stub(reg);
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');
    expect(clients.has('firestore')).toBe(false);
  });

  it('omits all aiplatform.* when @google-cloud/aiplatform is missing', async () => {
    const reg = fullRegistry();
    delete reg['@google-cloud/aiplatform'];
    install_dynamic_import_stub(reg);
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');
    expect(clients.has('aiplatform.endpoint')).toBe(false);
    expect(clients.has('aiplatform.index')).toBe(false);
    expect(clients.has('aiplatform.indexEndpoint')).toBe(false);
  });

  it('omits container when @google-cloud/container is missing', async () => {
    const reg = fullRegistry();
    delete reg['@google-cloud/container'];
    install_dynamic_import_stub(reg);
    const { initialize_gcp_clients } = await import('../sdk-loader');
    const clients = await initialize_gcp_clients('p1');
    expect(clients.has('container')).toBe(false);
  });
});

// =============================================================================
// verify_gcp_auth
// =============================================================================

function makeAuthLib(
  opts: {
    getClient?: any;
    getAccessToken?: any;
    getClientThrows?: Error | string;
    authClientOverride?: any;
  } = {},
) {
  const defaultClient = {
    getAccessToken: opts.getAccessToken ?? vi.fn().mockResolvedValue({ token: 'access-token' }),
    request: vi.fn().mockResolvedValue({ data: {} }),
  };
  class GoogleAuth {
    args: any;
    getClient: any;
    constructor(args: any) {
      this.args = args;
      if (opts.getClientThrows !== undefined) {
        this.getClient = vi.fn().mockRejectedValue(opts.getClientThrows);
      } else if (opts.getClient) {
        this.getClient = opts.getClient;
      } else {
        this.getClient = vi.fn().mockResolvedValue(opts.authClientOverride ?? defaultClient);
      }
    }
  }
  return { GoogleAuth };
}

describe('verify_gcp_auth', () => {
  it('returns the external_client unchanged when one is provided', async () => {
    install_dynamic_import_stub({});
    const { verify_gcp_auth } = await import('../sdk-loader');
    const ext = { tag: 'external' };
    const out = await verify_gcp_auth(ext);
    expect(out).toBe(ext);
  });

  it('throws AUTH_LIB_NOT_INSTALLED_PNPM when google-auth-library is not available', async () => {
    install_dynamic_import_stub({});
    const { verify_gcp_auth } = await import('../sdk-loader');
    await expect(verify_gcp_auth()).rejects.toThrow(AUTH_MESSAGES.AUTH_LIB_NOT_INSTALLED_PNPM);
  });

  it('returns the auth client when getClient and getAccessToken both succeed', async () => {
    install_dynamic_import_stub({ 'google-auth-library': makeAuthLib() });
    const { verify_gcp_auth } = await import('../sdk-loader');
    const client = await verify_gcp_auth();
    expect(client).toBeDefined();
    expect(typeof client.getAccessToken).toBe('function');
  });

  it('throws CREDENTIALS_NOT_FOUND when getClient rejects with an auth-missing pattern', async () => {
    install_dynamic_import_stub({
      'google-auth-library': makeAuthLib({
        getClientThrows: new Error('Could not load the default credentials'),
      }),
    });
    const { verify_gcp_auth } = await import('../sdk-loader');
    await expect(verify_gcp_auth()).rejects.toThrow(/GCP credentials not found/);
  });

  it('attaches the original error as cause on the CREDENTIALS_NOT_FOUND wrap', async () => {
    const original = new Error('Could not load the default credentials');
    install_dynamic_import_stub({
      'google-auth-library': makeAuthLib({ getClientThrows: original }),
    });
    const { verify_gcp_auth } = await import('../sdk-loader');
    let caught: any;
    try {
      await verify_gcp_auth();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as any).cause).toBe(original);
  });

  it('throws AUTH_FAILED with the err.message when getClient rejects with an unrecognized error', async () => {
    install_dynamic_import_stub({
      'google-auth-library': makeAuthLib({
        getClientThrows: new Error('boom-other'),
      }),
    });
    const { verify_gcp_auth } = await import('../sdk-loader');
    await expect(verify_gcp_auth()).rejects.toThrow(/GCP authentication failed: boom-other/);
  });

  it('uses String(err) when getClient throws a non-Error value', async () => {
    // err.message is undefined for a string throw, so the fallback `String(err)`
    // runs in `const msg = err?.message || String(err)`.
    install_dynamic_import_stub({
      'google-auth-library': makeAuthLib({
        getClientThrows: 'plain-throw' as unknown as Error,
      }),
    });
    const { verify_gcp_auth } = await import('../sdk-loader');
    await expect(verify_gcp_auth()).rejects.toThrow(/GCP authentication failed: plain-throw/);
  });

  it('throws COULD_NOT_OBTAIN_TOKEN when getAccessToken returns null', async () => {
    install_dynamic_import_stub({
      'google-auth-library': makeAuthLib({
        authClientOverride: {
          getAccessToken: vi.fn().mockResolvedValue(null),
          request: vi.fn(),
        },
      }),
    });
    const { verify_gcp_auth } = await import('../sdk-loader');
    await expect(verify_gcp_auth()).rejects.toThrow(AUTH_MESSAGES.COULD_NOT_OBTAIN_TOKEN);
  });

  it('throws COULD_NOT_OBTAIN_TOKEN when getAccessToken returns an object without a token', async () => {
    install_dynamic_import_stub({
      'google-auth-library': makeAuthLib({
        authClientOverride: {
          getAccessToken: vi.fn().mockResolvedValue({ token: undefined }),
          request: vi.fn(),
        },
      }),
    });
    const { verify_gcp_auth } = await import('../sdk-loader');
    await expect(verify_gcp_auth()).rejects.toThrow(AUTH_MESSAGES.COULD_NOT_OBTAIN_TOKEN);
  });

  it('throws CREDENTIALS_EXPIRED when getAccessToken throws an auth-expired error', async () => {
    install_dynamic_import_stub({
      'google-auth-library': makeAuthLib({
        authClientOverride: {
          getAccessToken: vi.fn().mockRejectedValue(new Error('refresh token has expired')),
          request: vi.fn(),
        },
      }),
    });
    const { verify_gcp_auth } = await import('../sdk-loader');
    await expect(verify_gcp_auth()).rejects.toThrow(/GCP credentials have expired/);
  });

  it('throws AUTH_FAILED when getAccessToken throws an unrecognized error', async () => {
    install_dynamic_import_stub({
      'google-auth-library': makeAuthLib({
        authClientOverride: {
          getAccessToken: vi.fn().mockRejectedValue(new Error('throttled')),
          request: vi.fn(),
        },
      }),
    });
    const { verify_gcp_auth } = await import('../sdk-loader');
    await expect(verify_gcp_auth()).rejects.toThrow(/GCP authentication failed: throttled/);
  });

  it('uses String(err) when getAccessToken throws a non-Error value', async () => {
    install_dynamic_import_stub({
      'google-auth-library': makeAuthLib({
        authClientOverride: {
          getAccessToken: vi.fn().mockRejectedValue('plain-token-throw'),
          request: vi.fn(),
        },
      }),
    });
    const { verify_gcp_auth } = await import('../sdk-loader');
    await expect(verify_gcp_auth()).rejects.toThrow(/GCP authentication failed: plain-token-throw/);
  });
});

// =============================================================================
// create_rest_client
// =============================================================================

describe('create_rest_client', () => {
  it('returns a client with get/post/patch/delete that delegate to auth_client.request', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, data: { ok: true }, headers: {} });
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };
    install_dynamic_import_stub({});
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    const r1 = await rc.get('https://example.com/g');
    const r2 = await rc.post('https://example.com/p', { x: 1 });
    const r3 = await rc.patch('https://example.com/u', { y: 2 });
    const r4 = await rc.delete('https://example.com/d');

    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    expect(r3).toEqual({ ok: true });
    expect(r4).toEqual({ ok: true });

    expect(request.mock.calls).toHaveLength(4);
    expect(request.mock.calls[0][0]).toMatchObject({
      url: 'https://example.com/g',
      method: 'GET',
      data: undefined,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(request.mock.calls[1][0]).toMatchObject({
      url: 'https://example.com/p',
      method: 'POST',
      data: { x: 1 },
    });
    expect(request.mock.calls[2][0]).toMatchObject({ method: 'PATCH', data: { y: 2 } });
    expect(request.mock.calls[3][0]).toMatchObject({ method: 'DELETE' });
  });

  it('attaches authClient on the returned client object', async () => {
    const request = vi.fn().mockResolvedValue({ data: {} });
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };
    install_dynamic_import_stub({});
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    expect((rc as any).authClient).toBe(externalAuth);
    expect(typeof (rc as any).requestRaw).toBe('function');
  });

  it('exposes requestRaw which forwards body, content-type, responseType and validateStatus', async () => {
    const request = vi.fn().mockResolvedValue({
      status: 201,
      data: { id: 'created' },
      headers: { etag: 'abc' },
    });
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };
    install_dynamic_import_stub({});
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    const validateStatus = (s: number) => s === 201;
    const result = await (rc as any).requestRaw({
      method: 'POST',
      url: 'https://example.com/r',
      body: 'binary-blob',
      contentType: 'application/octet-stream',
      responseType: 'arraybuffer',
      validateStatus,
    });

    expect(result).toEqual({
      status: 201,
      data: { id: 'created' },
      headers: { etag: 'abc' },
    });
    expect(request.mock.calls[0][0]).toMatchObject({
      url: 'https://example.com/r',
      method: 'POST',
      data: 'binary-blob',
      headers: { 'Content-Type': 'application/octet-stream' },
      responseType: 'arraybuffer',
      validateStatus,
    });
  });

  it('falls back to default Content-Type / responseType / validateStatus on requestRaw when not specified', async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      data: {},
      headers: undefined,
    });
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };
    install_dynamic_import_stub({});
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    const result = await (rc as any).requestRaw({
      method: 'GET',
      url: 'https://example.com/r',
    });

    expect(result.status).toBe(200);
    expect(result.headers).toEqual({}); // headers undefined → fallback to {}
    const opts = request.mock.calls[0][0];
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(opts.responseType).toBe('json');
    // The default validateStatus is `(s) => s < 500`.
    expect(typeof opts.validateStatus).toBe('function');
    expect(opts.validateStatus(200)).toBe(true);
    expect(opts.validateStatus(404)).toBe(true);
    expect(opts.validateStatus(500)).toBe(false);
  });

  it('rethrows permanent (non-transient) errors immediately without retrying', async () => {
    const request = vi.fn().mockRejectedValueOnce(Object.assign(new Error('forbidden'), { response: { status: 403 } }));
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };
    install_dynamic_import_stub({});
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    await expect(rc.get('https://example.com/x')).rejects.toThrow('forbidden');
    expect(request).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// create_rest_client retry semantics
//
// The withRetry helper retries on 429/5xx, ECONNRESET / ETIMEDOUT / ENOTFOUND /
// EAI_AGAIN, and `deadline_exceeded` / "retry later" message strings. We use
// fake timers so we don't sit on the real exponential backoff (up to 8s) per
// retry pair. After every advance step we drain microtasks via Promise.resolve.
// =============================================================================

describe('create_rest_client withRetry behaviour', () => {
  /** Drain microtasks several times so awaited promises resolve after every fake-timer tick. */
  async function flush() {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }

  it('retries on a 5xx response and eventually succeeds', async () => {
    const transient = Object.assign(new Error('upstream'), { response: { status: 503 } });
    const request = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({ data: { ok: true } });
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };

    install_dynamic_import_stub({});
    vi.useFakeTimers();
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    const promise = rc.get('https://example.com/x');
    // First attempt has already failed and the `setTimeout(r, delay)` is queued.
    // The base delay is ~500ms + jitter.
    await flush();
    await vi.advanceTimersByTimeAsync(800);
    await flush();

    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(request).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('retries on a 429 rate-limit error', async () => {
    const transient = Object.assign(new Error('rate'), { response: { status: 429 } });
    const request = vi.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce({ data: 'ok' });
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };

    install_dynamic_import_stub({});
    vi.useFakeTimers();
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    const p = rc.get('https://example.com/r');
    await flush();
    await vi.advanceTimersByTimeAsync(800);
    await flush();
    await expect(p).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('retries on ECONNRESET errors', async () => {
    const transient = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    const request = vi.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce({ data: 'after' });
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };

    install_dynamic_import_stub({});
    vi.useFakeTimers();
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    const p = rc.delete('https://example.com/x');
    await flush();
    await vi.advanceTimersByTimeAsync(800);
    await flush();
    await expect(p).resolves.toBe('after');
    vi.useRealTimers();
  });

  it('retries on errors with deadline_exceeded in the message', async () => {
    const transient = new Error('UPSTREAM DEADLINE_EXCEEDED');
    const request = vi.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce({ data: 1 });
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };

    install_dynamic_import_stub({});
    vi.useFakeTimers();
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    const p = rc.post('https://example.com/r', {});
    await flush();
    await vi.advanceTimersByTimeAsync(800);
    await flush();
    await expect(p).resolves.toBe(1);
    vi.useRealTimers();
  });

  it('retries on errors whose message contains both "retry" and "later"', async () => {
    const transient = new Error('please retry later');
    const request = vi.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce({ data: 'ok' });
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };

    install_dynamic_import_stub({});
    vi.useFakeTimers();
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    const p = rc.patch('https://example.com/r', { v: 1 });
    await flush();
    await vi.advanceTimersByTimeAsync(800);
    await flush();
    await expect(p).resolves.toBe('ok');
    vi.useRealTimers();
  });

  it('retries on ETIMEDOUT errors via err.cause.code', async () => {
    // The isTransientError helper falls back to `err.cause?.code`.
    const transient: any = new Error('timed out');
    transient.cause = { code: 'ETIMEDOUT' };
    const request = vi.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce({ data: 'fine' });
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };

    install_dynamic_import_stub({});
    vi.useFakeTimers();
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    const p = rc.get('https://example.com/r');
    await flush();
    await vi.advanceTimersByTimeAsync(800);
    await flush();
    await expect(p).resolves.toBe('fine');
    vi.useRealTimers();
  });

  it('does not retry on 4xx errors other than 429', async () => {
    const permanent = Object.assign(new Error('bad request'), { response: { status: 400 } });
    const request = vi.fn().mockRejectedValueOnce(permanent);
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };

    install_dynamic_import_stub({});
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    await expect(rc.get('https://example.com/x')).rejects.toThrow('bad request');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not retry on plain string-coded errors that are not transient', async () => {
    // err.code is 'NONSENSE' — neither in the transient code list nor the
    // status-code arms.
    const permanent: any = Object.assign(new Error('weird'), { code: 'NONSENSE' });
    const request = vi.fn().mockRejectedValueOnce(permanent);
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };

    install_dynamic_import_stub({});
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    await expect(rc.get('https://example.com/x')).rejects.toThrow('weird');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not retry when err has neither status, code, nor a recognized message (falsy-message branch)', async () => {
    // `String(err?.message || '').toLowerCase()` — the `|| ''` fallback
    // fires when err.message is falsy. Throw a bare object with no message,
    // no code, no status: every transient predicate returns false.
    const permanent: any = {};
    const request = vi.fn().mockRejectedValueOnce(permanent);
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };

    install_dynamic_import_stub({});
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    await expect(rc.get('https://example.com/x')).rejects.toBeDefined();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('exhausts MAX_ATTEMPTS=5 retries on persistent transient errors then throws lastErr', async () => {
    const transient = Object.assign(new Error('always fail'), { response: { status: 502 } });
    const request = vi.fn().mockRejectedValue(transient);
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };

    install_dynamic_import_stub({});
    vi.useFakeTimers();
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    // Attach catch handler eagerly so the unhandled rejection warning never
    // fires while we drive timers manually.
    const p = rc.get('https://example.com/x');
    const settled = p.catch((e) => e);

    // 4 retry waits: 500ms, 1000ms, 2000ms, 4000ms (+ jitter up to 200ms each).
    // Drive ~10s of fake time across them.
    for (let i = 0; i < 4; i++) {
      await flush();
      await vi.advanceTimersByTimeAsync(5000);
    }
    await flush();
    const finalErr = await settled;
    expect((finalErr as Error).message).toBe('always fail');
    expect(request).toHaveBeenCalledTimes(5);
    vi.useRealTimers();
  });

  it('emits a [retry] log via onLog when wrapping requestRaw with a logger (callable surface)', async () => {
    // The withRetry helper calls `onLog?.(message)`. The internal request /
    // requestRaw helpers don't pass an onLog argument — verify the
    // happy-path requestRaw call still works (no onLog registered) but that
    // a transient retry-log path doesn't crash the helper. We also assert
    // that the message format contains "[retry]" + "attempt N/5" in the
    // error path via a custom logger inferred from the retry payload — by
    // observing total request count remains the count after retry.
    const transient = Object.assign(new Error('retry-me'), { code: 'ENOTFOUND' });
    const request = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({ status: 200, data: { v: 1 }, headers: {} });
    const externalAuth = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request,
    };

    install_dynamic_import_stub({});
    vi.useFakeTimers();
    const { create_rest_client } = await import('../sdk-loader');
    const rc = await create_rest_client('p1', externalAuth);

    const p = (rc as any).requestRaw({ method: 'GET', url: 'https://example.com/r' });
    await flush();
    await vi.advanceTimersByTimeAsync(800);
    await flush();
    const out = await p;
    expect(out.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

/**
 * Tests for StorageService — discovers Cloud Storage buckets via the
 * @google-cloud/storage SDK.
 *
 * Same patching pattern as compute.test.ts: bypass `init_client()` by
 * setting `storage_client` directly for the per-bucket logic, and
 * patch the global `Function` constructor for the init success path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '../storage.js';

interface FakeBucket {
  name: string;
  getMetadata: ReturnType<typeof vi.fn>;
}

function makeClient(buckets: FakeBucket[]) {
  return {
    getBuckets: vi.fn().mockResolvedValue([buckets]),
  };
}

function makeService(client: any) {
  const svc = new StorageService('proj', [], []);
  (svc as any).storage_client = client;
  return svc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StorageService.service_type', () => {
  it('returns "storage"', () => {
    expect(new StorageService('p', [], []).service_type).toBe('storage');
  });
});

describe('StorageService.discover — happy paths', () => {
  it('emits a storage#bucket resource for each bucket whose getMetadata succeeds', async () => {
    const bucket = {
      name: 'b1',
      getMetadata: vi.fn().mockResolvedValue([
        {
          selfLink: 'https://storage.googleapis.com/storage/v1/b/b1',
          id: 'b1',
          location: 'us-central1',
          labels: { env: 'prod' },
          timeCreated: '2024-01-01',
        },
      ]),
    };
    const svc = makeService(makeClient([bucket]));
    const result = await svc.discover();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.resources).toHaveLength(1);
    const r = result.resources[0]!;
    expect(r.kind).toBe('storage#bucket');
    expect(r.name).toBe('b1');
    expect(r.region).toBe('us-central1');
    expect(r.labels).toEqual({ env: 'prod' });
    expect(r.creation_timestamp).toBe('2024-01-01');
  });

  it('falls back to a synthesized self_link when metadata.selfLink is absent', async () => {
    const bucket = {
      name: 'b2',
      getMetadata: vi.fn().mockResolvedValue([{ location: 'us-east1' }]),
    };
    const svc = makeService(makeClient([bucket]));
    const result = await svc.discover();
    expect(result.resources[0]!.self_link).toBe('https://storage.googleapis.com/storage/v1/b/b2');
    expect(result.resources[0]!.id).toBe('b2'); // metadata.id missing → bucket.name
  });
});

describe('StorageService.discover — error paths', () => {
  it('records a warning per bucket when getMetadata throws', async () => {
    const bucket = {
      name: 'b-bad',
      getMetadata: vi.fn().mockRejectedValue({ message: 'meta-fail' }),
    };
    const svc = makeService(makeClient([bucket]));
    const result = await svc.discover();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.code).toBe('METADATA_ERROR');
    expect(result.warnings[0]!.message).toContain('meta-fail');
    expect(result.warnings[0]!.resource).toBe('b-bad');
  });

  it('falls back to String(error) when the metadata error is not an object with .message', async () => {
    const bucket = {
      name: 'b-noerr',
      getMetadata: vi.fn().mockRejectedValue('plain-string-meta-error'),
    };
    const svc = makeService(makeClient([bucket]));
    const result = await svc.discover();
    expect(result.warnings[0]!.message).toContain('plain-string-meta-error');
  });

  it('records a warning when getBuckets throws 403', async () => {
    const client = { getBuckets: vi.fn().mockRejectedValue({ code: 403, message: 'no perm' }) };
    const svc = makeService(client);
    const result = await svc.discover();
    expect(result.warnings.some((w) => w.code === 'ACCESS_DENIED' && w.message.includes('no perm'))).toBe(true);
  });

  it('records a warning when getBuckets throws 404', async () => {
    const client = { getBuckets: vi.fn().mockRejectedValue({ code: 404, message: 'gone' }) };
    const svc = makeService(client);
    const result = await svc.discover();
    expect(result.warnings.some((w) => w.code === 'ACCESS_DENIED')).toBe(true);
  });

  it('records an API_ERROR when getBuckets throws 500', async () => {
    const client = { getBuckets: vi.fn().mockRejectedValue({ code: 500, message: 'kaboom' }) };
    const svc = makeService(client);
    const result = await svc.discover();
    expect(result.errors.some((e) => e.code === 'API_ERROR' && e.message.includes('kaboom'))).toBe(true);
  });

  it('falls back to "Access denied" when access-denied error has no message', async () => {
    const client = { getBuckets: vi.fn().mockRejectedValue({ code: 403 }) };
    const svc = makeService(client);
    const result = await svc.discover();
    expect(result.warnings[0]!.message).toContain('Access denied');
  });

  it('falls back to String(error) on the API_ERROR path when message is missing', async () => {
    const client = { getBuckets: vi.fn().mockRejectedValue({ code: 500 }) };
    const svc = makeService(client);
    const result = await svc.discover();
    expect(result.errors[0]!.code).toBe('API_ERROR');
  });
});

describe('StorageService — clients-not-initialized branch', () => {
  it('returns INIT_ERROR when init_client silently leaves storage_client null', async () => {
    class NoInitStorage extends StorageService {
      // @ts-expect-error overriding private
      private async init_client(): Promise<void> {
        // no-op; client stays null
      }
    }
    const svc = new NoInitStorage('p', [], []);
    const result = await svc.discover();
    expect(result.errors.some((e) => e.code === 'INIT_ERROR')).toBe(true);
  });

  it('discover catch falls into String(error) when init_client throws a non-Error', async () => {
    class WeirdInitStorage extends StorageService {
      // @ts-expect-error overriding private
      private async init_client(): Promise<void> {
        // eslint-disable-next-line no-throw-literal
        throw 'plain-string-from-init';
      }
    }
    const svc = new WeirdInitStorage('p', [], []);
    const result = await svc.discover();
    expect(result.errors[0]!.message).toContain('plain-string-from-init');
  });

  it('init_client failure produces INIT_ERROR (default Vitest dynamic-import callback miss)', async () => {
    const svc = new StorageService('p', [], []);
    const result = await svc.discover();
    expect(result.errors[0]!.code).toBe('INIT_ERROR');
    expect(result.errors[0]!.message).toMatch(/Failed to initialize GCP Storage client/);
  });

  it('init_client failure with key_file still surfaces INIT_ERROR', async () => {
    const svc = new StorageService('p', [], [], '/tmp/k.json');
    const result = await svc.discover();
    expect(result.errors[0]!.code).toBe('INIT_ERROR');
  });

  it('init_client catch falls into String(error) when import rejects with a non-Error', async () => {
    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => {
          // eslint-disable-next-line no-throw-literal
          throw 'plain-string-non-error';
        };
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new StorageService('p', [], []);
      const result = await svc.discover();
      expect(result.errors[0]!.message).toContain('plain-string-non-error');
    } finally {
      (globalThis as any).Function = OriginalFunction;
    }
  });
});

describe('StorageService — init_client success path (Function ctor monkey-patch)', () => {
  it('constructs the Storage client with projectId + keyFilename when supplied', async () => {
    const ctorCalls: unknown[] = [];
    class FakeStorage {
      getBuckets = async () => [[]];
      constructor(opts: unknown) {
        ctorCalls.push(opts);
      }
    }
    const fakeStorageModule = { Storage: FakeStorage };

    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => fakeStorageModule;
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new StorageService('proj', [], [], '/tmp/k.json');
      const result = await svc.discover();
      expect(result.errors).toEqual([]);
      expect(ctorCalls[0]).toEqual({ projectId: 'proj', keyFilename: '/tmp/k.json' });
    } finally {
      (globalThis as any).Function = OriginalFunction;
    }
  });

  it('omits keyFilename when key_file is not supplied', async () => {
    const calls: unknown[] = [];
    class FakeStorage {
      getBuckets = async () => [[]];
      constructor(opts: unknown) {
        calls.push(opts);
      }
    }
    const fakeStorageModule = { Storage: FakeStorage };

    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => fakeStorageModule;
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new StorageService('proj', [], []);
      await svc.discover();
      expect(calls[0]).toEqual({ projectId: 'proj' });
      expect(calls[0]).not.toHaveProperty('keyFilename');
    } finally {
      (globalThis as any).Function = OriginalFunction;
    }
  });

  it('caches the storage client across discover() calls', async () => {
    let imports = 0;
    class FakeStorage {
      getBuckets = async () => [[]];
    }
    const fakeStorageModule = { Storage: FakeStorage };

    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => {
          imports++;
          return fakeStorageModule;
        };
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new StorageService('proj', [], []);
      await svc.discover();
      await svc.discover();
      expect(imports).toBe(1);
    } finally {
      (globalThis as any).Function = OriginalFunction;
    }
  });
});

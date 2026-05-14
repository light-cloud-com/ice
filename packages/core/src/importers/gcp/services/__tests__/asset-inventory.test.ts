/**
 * Tests for AssetInventoryService — wraps the @google-cloud/asset SDK
 * to discover all GCP resources via Cloud Asset Inventory.
 *
 * - Bypass init via direct `(svc as any).asset_client = ...` for the
 *   discover()-side branches.
 * - Patch `globalThis.Function` for the init success path covering
 *   credentials + keyFilename plumbing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetInventoryService } from '../asset-inventory';

function makeAssetClient(assets: any[] | { listAssets: ReturnType<typeof vi.fn> }) {
  if (Array.isArray(assets)) {
    return { listAssets: vi.fn().mockResolvedValue([assets]) };
  }
  return assets;
}

function makeService(client: any, opts?: { project?: string; key_file?: string }) {
  const svc = new AssetInventoryService(opts?.project ?? 'proj', [], [], opts?.key_file);
  (svc as any).asset_client = client;
  return svc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AssetInventoryService.service_type', () => {
  it('returns "all"', () => {
    const svc = new AssetInventoryService('p', [], []);
    expect(svc.service_type).toBe('all');
  });
});

// =========================================================================
// discover() happy paths
// =========================================================================

describe('AssetInventoryService.discover — happy paths', () => {
  it('returns an empty result when listAssets returns []', async () => {
    const svc = makeService(makeAssetClient([]));
    const result = await svc.discover();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.resources).toEqual([]);
  });

  it('handles listAssets returning [null] without throwing', async () => {
    const client = { listAssets: vi.fn().mockResolvedValue([null]) };
    const svc = makeService(client);
    const result = await svc.discover();
    expect(result.resources).toEqual([]);
  });

  it('skips assets with no resource.data', async () => {
    const svc = makeService(
      makeAssetClient([
        { name: '//compute.googleapis.com/projects/p/zones/us-central1-a/instances/i', assetType: 'compute.googleapis.com/Instance' },
      ]),
    );
    const result = await svc.discover();
    expect(result.resources).toEqual([]);
  });

  it('emits a resource for each well-formed asset and converts assetType to GCP kind', async () => {
    const asset = {
      name: '//compute.googleapis.com/projects/p/zones/us-central1-a/instances/inst-1',
      assetType: 'compute.googleapis.com/Instance',
      resource: {
        data: {
          name: 'inst-1',
          id: 'iid',
          selfLink: 'sl-i',
          labels: { env: 'prod' },
          creationTimestamp: '2024-01-01',
        },
      },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources).toHaveLength(1);
    const r = result.resources[0]!;
    expect(r.kind).toBe('compute#instance');
    expect(r.name).toBe('inst-1');
    expect(r.id).toBe('iid');
    expect(r.self_link).toBe('sl-i');
    expect(r.zone).toBe('us-central1-a');
    expect(r.region).toBe('us-central1');
    expect(r.labels).toEqual({ env: 'prod' });
    expect(r.creation_timestamp).toBe('2024-01-01');
  });

  it('falls back to asset.resource.resourceUrl when resource.data.selfLink missing', async () => {
    const asset = {
      name: '//compute.googleapis.com/projects/p/regions/us-central1/subnetworks/sn',
      assetType: 'compute.googleapis.com/Subnetwork',
      resource: { data: { name: 'sn' }, resourceUrl: 'rurl' },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.self_link).toBe('rurl');
    // /regions/ branch:
    expect(result.resources[0]!.region).toBe('us-central1');
    expect(result.resources[0]!.zone).toBeUndefined();
  });

  it('falls back to asset.name as final self_link when nothing else is present', async () => {
    const asset = {
      name: '//run.googleapis.com/projects/p/locations/europe-west1/services/svc',
      assetType: 'run.googleapis.com/Service',
      resource: { data: { name: 'svc' } },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.self_link).toBe(asset.name);
    // /locations/ branch:
    expect(result.resources[0]!.region).toBe('europe-west1');
  });

  it('uses extract_name when resource_data has no name field', async () => {
    const asset = {
      name: '//compute.googleapis.com/projects/p/global/networks/extracted',
      assetType: 'compute.googleapis.com/Network',
      resource: { data: { id: 'x' } },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.name).toBe('extracted');
    // No /zones, /regions, or /locations → empty location info
    expect(result.resources[0]!.zone).toBeUndefined();
    expect(result.resources[0]!.region).toBeUndefined();
  });

  it('uses asset.name fallback for id when neither id nor name in resource_data', async () => {
    const asset = {
      name: '//x/p/foo/extracted',
      assetType: 'x.googleapis.com/Foo',
      resource: { data: {} },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.id).toBe('//x/p/foo/extracted');
    // assetType doesn't match the regex (no .googleapis.com host before /), but actually does match for 'x.googleapis.com/Foo' — kind='x#foo'
    expect(result.resources[0]!.kind).toBe('x#foo');
  });

  it('asset_type_to_kind falls back to lowercase + dot-replace when host is non-standard', async () => {
    const asset = {
      name: '/strange.format/no-googleapis-suffix',
      assetType: 'strange.NotGoogleApis/Foo',
      resource: { data: { name: 'x' } },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    // Regex `([^.]+)\.googleapis\.com/...` doesn't match → falls back to lowercase + dots->#
    expect(result.resources[0]!.kind).toBe('strange#notgoogleapis/foo');
  });

  it('uses "UNKNOWN" when asset.assetType is missing', async () => {
    const asset = {
      name: '//service/p',
      resource: { data: { name: 'r' } },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.kind).toBe('unknown');
  });

  it('extracts labels from clean_properties when present, otherwise from resource_data.labels', async () => {
    const asset = {
      name: '//compute.googleapis.com/projects/p/global/networks/n',
      assetType: 'compute.googleapis.com/Network',
      resource: {
        data: {
          name: 'n',
          // labels falls into clean_properties
          labels: { team: 'core' },
        },
      },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.labels).toEqual({ team: 'core' });
  });

  it('falls back to resource_data.creationTimestamp / createTime when clean_properties.creation_timestamp absent', async () => {
    const asset = {
      name: '//compute.googleapis.com/projects/p/global/networks/n',
      assetType: 'compute.googleapis.com/Network',
      resource: { data: { name: 'n', createTime: '2024-04-04T00:00:00Z' } },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.creation_timestamp).toBe('2024-04-04T00:00:00Z');
  });

  it('handles asset with empty asset.name gracefully (extract_location/extract_name fall to empty branches)', async () => {
    const asset = {
      name: '',
      assetType: 'compute.googleapis.com/Instance',
      resource: { data: { name: 'no-loc-instance' } },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.zone).toBeUndefined();
    expect(result.resources[0]!.region).toBeUndefined();
    // resource_data.name takes precedence over the empty extract_name
    expect(result.resources[0]!.name).toBe('no-loc-instance');
  });

  it('asset with undefined asset.name takes the `asset.name || ""` branches in name + id resolution', async () => {
    const asset = {
      // No name property at all
      assetType: 'compute.googleapis.com/Instance',
      resource: { data: {} },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    // resource_data.name undefined, this.extract_name(undefined || '') runs on '',
    // split('/') → [''], parts[0] || '' → ''.
    expect(result.resources[0]!.name).toBe('');
    expect(result.resources[0]!.id).toBe('');
    expect(result.resources[0]!.self_link).toBe('');
  });

  it('extract_name handles a trailing-slash asset.name (split last segment is "")', async () => {
    const asset = {
      name: '//x.googleapis.com/projects/p/things/',
      assetType: 'x.googleapis.com/Thing',
      resource: { data: {} },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    // last split segment is '' → falsy → falls back to '' via `|| ''`
    expect(result.resources[0]!.name).toBe('');
  });

  it('flattens protobuf Struct format and primitive value wrappers in resource.data', async () => {
    const asset = {
      name: '//x.googleapis.com/projects/p/things/t',
      assetType: 'x.googleapis.com/Thing',
      resource: {
        data: {
          name: 't',
          // protobuf-style stringValue wrapper
          aString: { kind: 'stringValue', stringValue: 'hi' },
          aNumber: { kind: 'numberValue', numberValue: 42 },
          aBool: { kind: 'boolValue', boolValue: true },
          aNull: { kind: 'nullValue' },
          aStruct: { kind: 'structValue', structValue: { fields: { inner: { kind: 'stringValue', stringValue: 'val' } } } },
          aList: {
            kind: 'listValue',
            listValue: { values: [{ kind: 'stringValue', stringValue: 'a' }] },
          },
          // skip prefix _, kind, etag at top-level
          _internal: 'x',
          kind: 'compute',
          etag: 'e',
        },
      },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    const props = result.resources[0]!.properties;
    expect(props.aString).toBe('hi');
    expect(props.aNumber).toBe(42);
    expect(props.aBool).toBe(true);
    expect(props.aNull).toBeNull();
    expect(props.aStruct).toEqual({ inner: 'val' });
    expect(props.aList).toEqual(['a']);
    expect(props).not.toHaveProperty('_internal');
    expect(props).not.toHaveProperty('kind');
    expect(props).not.toHaveProperty('etag');
  });

  it('flattens protobuf Struct passed at top level via fields key', async () => {
    const asset = {
      name: '//x.googleapis.com/projects/p/x',
      assetType: 'x.googleapis.com/X',
      resource: {
        data: {
          name: 'x',
          aWrapped: { fields: { nested: { kind: 'stringValue', stringValue: 'deep' } } },
        },
      },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.properties.aWrapped).toEqual({ nested: 'deep' });
  });

  it('passes through plain primitives in clean properties', async () => {
    const asset = {
      name: '//x.googleapis.com/projects/p/x',
      assetType: 'x.googleapis.com/X',
      resource: { data: { name: 'x', plain: 'value', nested: { foo: 'bar' } } },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.properties).toMatchObject({ plain: 'value', nested: { foo: 'bar' } });
  });

  it('flattens protobuf wrapper with unknown kind by returning the original wrapper', async () => {
    const asset = {
      name: '//x/p/x',
      assetType: 'x.googleapis.com/X',
      resource: {
        data: {
          name: 'x',
          weird: { kind: 'someUnsupportedKind', someUnsupportedKind: 'whatever' },
        },
      },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    // default branch returns `value` (the original object) — pretty close to passthrough
    expect(result.resources[0]!.properties.weird).toEqual({
      kind: 'someUnsupportedKind',
      someUnsupportedKind: 'whatever',
    });
  });

  it('flattens null/undefined values to themselves', async () => {
    const asset = {
      name: '//x/p/x',
      assetType: 'x.googleapis.com/X',
      resource: { data: { name: 'x', n: null, u: undefined } },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.properties.n).toBeNull();
    // undefined is skipped by Object.entries
  });

  it('flattenProtobufStruct returns empty when fields is missing', async () => {
    const asset = {
      name: '//x/p/x',
      assetType: 'x.googleapis.com/X',
      resource: {
        data: {
          name: 'x',
          // structValue with no fields
          empty: { kind: 'structValue', structValue: {} },
        },
      },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.properties.empty).toEqual({});
  });

  it('listValue with no values entry treats it as empty list', async () => {
    const asset = {
      name: '//x/p/x',
      assetType: 'x.googleapis.com/X',
      resource: {
        data: { name: 'x', l: { kind: 'listValue', listValue: {} } },
      },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.properties.l).toEqual([]);
  });

  it('asset type summary sort comparator runs when multiple types are present', async () => {
    const assets = [
      {
        name: '//compute.googleapis.com/projects/p/global/networks/n1',
        assetType: 'compute.googleapis.com/Network',
        resource: { data: { name: 'n1' } },
      },
      {
        name: '//compute.googleapis.com/projects/p/global/networks/n2',
        assetType: 'compute.googleapis.com/Network',
        resource: { data: { name: 'n2' } },
      },
      {
        name: '//storage.googleapis.com/projects/p/buckets/b',
        assetType: 'storage.googleapis.com/Bucket',
        resource: { data: { name: 'b' } },
      },
    ];
    const svc = makeService(makeAssetClient(assets));
    const result = await svc.discover();
    expect(result.resources).toHaveLength(3);
  });

  it('Array values at top of property tree are mapped through flattenProtobufValue', async () => {
    const asset = {
      name: '//x/p/x',
      assetType: 'x.googleapis.com/X',
      resource: {
        data: { name: 'x', arr: [1, 'two', { kind: 'boolValue', boolValue: false }] },
      },
    };
    const svc = makeService(makeAssetClient([asset]));
    const result = await svc.discover();
    expect(result.resources[0]!.properties.arr).toEqual([1, 'two', false]);
  });
});

// =========================================================================
// discover() error path — exercises classifyGCPError integration
// =========================================================================

describe('AssetInventoryService.discover — error path through classifyGCPError', () => {
  it('returns a permission-denied error when listAssets throws code=403', async () => {
    const client = { listAssets: vi.fn().mockRejectedValue({ code: 403, message: 'PERMISSION_DENIED' }) };
    const svc = makeService(client);
    const result = await svc.discover();
    expect(result.errors).toHaveLength(1);
    const e: any = result.errors[0]!;
    expect(e.message).toMatch(/Insufficient permissions/);
    expect(e.action).toBe('grant_permission');
    expect(e.help_url).toMatch(/console\.cloud\.google\.com/);
  });

  it('reports an auth-required error when listAssets throws UNAUTHENTICATED', async () => {
    const client = { listAssets: vi.fn().mockRejectedValue({ message: 'UNAUTHENTICATED' }) };
    const svc = makeService(client);
    const result = await svc.discover();
    const e: any = result.errors[0]!;
    expect(e.action).toBe('reauth');
    expect(e.command).toBe('gcloud auth application-default login');
  });

  it('does not include "command" or "url" when classifyGCPError returns no action.command/url', async () => {
    // Use an error message that classifies but with action.url-only or no command
    const client = { listAssets: vi.fn().mockRejectedValue({ message: 'PERMISSION_DENIED' }) };
    const svc = makeService(client);
    const result = await svc.discover();
    const e: any = result.errors[0]!;
    // permission_denied action has url but no command
    expect(e.command).toBeUndefined();
    expect(e.help_url).toBeDefined();
  });

  it('falls into "other error" classification when error has no recognizable shape', async () => {
    const client = { listAssets: vi.fn().mockRejectedValue(new Error('network blip')) };
    const svc = makeService(client);
    const result = await svc.discover();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.code).toBeDefined();
  });
});

// =========================================================================
// init_client failure paths
// =========================================================================

describe('AssetInventoryService — init_client failure paths', () => {
  it('returns INIT_ERROR when init_client silently leaves asset_client null', async () => {
    class NoInitAsset extends AssetInventoryService {
      // @ts-expect-error overriding private
      private async init_client(): Promise<void> {
        // no-op; client stays null
      }
    }
    const svc = new NoInitAsset('p', [], []);
    const result = await svc.discover();
    expect(result.errors.some((e) => e.code === 'INIT_ERROR')).toBe(true);
  });

  it('init_client failure produces INIT_ERROR (Vitest dynamic-import callback miss)', async () => {
    const svc = new AssetInventoryService('p', [], []);
    const result = await svc.discover();
    expect(result.errors[0]!.code).toBe('INIT_ERROR');
    expect(result.errors[0]!.message).toMatch(/Failed to initialize GCP Asset client/);
  });

  it('discover catch falls into String(error) when init_client throws a non-Error', async () => {
    class WeirdInitAsset extends AssetInventoryService {
      // @ts-expect-error overriding private
      private async init_client(): Promise<void> {
        // eslint-disable-next-line no-throw-literal
        throw 'plain-string-init-fail';
      }
    }
    const svc = new WeirdInitAsset('p', [], []);
    const result = await svc.discover();
    expect(result.errors[0]!.message).toContain('plain-string-init-fail');
  });

  it('init_client catch falls into String(error) when import rejects with a non-Error', async () => {
    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => {
          // eslint-disable-next-line no-throw-literal
          throw 'plain-non-error';
        };
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new AssetInventoryService('p', [], []);
      const result = await svc.discover();
      expect(result.errors[0]!.message).toContain('plain-non-error');
    } finally {
      (globalThis as any).Function = OriginalFunction;
    }
  });
});

// =========================================================================
// init_client success path — Function ctor monkey-patch
// =========================================================================

describe('AssetInventoryService — init_client success (Function ctor monkey-patch)', () => {
  it('constructs AssetServiceClient with projectId and reads key file credentials', async () => {
    const ctorCalls: unknown[] = [];
    class FakeAssetServiceClient {
      listAssets = async () => [[]];
      constructor(opts: unknown) {
        ctorCalls.push(opts);
      }
    }
    const fakeAssetModule = { AssetServiceClient: FakeAssetServiceClient };

    // Mock fs to provide a fake key file
    vi.doMock('fs', () => ({
      default: {
        readFileSync: () =>
          JSON.stringify({
            client_email: 'sa@x.iam',
            private_key: 'PRIVATE',
            project_id: 'override-from-key',
          }),
      },
      readFileSync: () =>
        JSON.stringify({
          client_email: 'sa@x.iam',
          private_key: 'PRIVATE',
          project_id: 'override-from-key',
        }),
    }));

    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => fakeAssetModule;
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new AssetInventoryService('original-proj', [], [], '/tmp/fake-key.json');
      const result = await svc.discover();
      expect(result.errors).toEqual([]);
      // The ctor should be called with credentials parsed from the fake key + projectId from key
      expect(ctorCalls[0]).toMatchObject({
        projectId: 'override-from-key',
        credentials: { client_email: 'sa@x.iam', private_key: 'PRIVATE' },
      });
    } finally {
      (globalThis as any).Function = OriginalFunction;
      vi.doUnmock('fs');
    }
  });

  it('does not read a key file when key_file is not supplied', async () => {
    const ctorCalls: unknown[] = [];
    class FakeAssetServiceClient {
      listAssets = async () => [[]];
      constructor(opts: unknown) {
        ctorCalls.push(opts);
      }
    }
    const fakeAssetModule = { AssetServiceClient: FakeAssetServiceClient };

    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => fakeAssetModule;
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new AssetInventoryService('proj', [], []);
      await svc.discover();
      expect(ctorCalls[0]).toEqual({ projectId: 'proj' });
      expect(ctorCalls[0]).not.toHaveProperty('credentials');
      expect(ctorCalls[0]).not.toHaveProperty('keyFilename');
    } finally {
      (globalThis as any).Function = OriginalFunction;
    }
  });

  it('omits projectId override when key file lacks project_id', async () => {
    const ctorCalls: unknown[] = [];
    class FakeAssetServiceClient {
      listAssets = async () => [[]];
      constructor(opts: unknown) {
        ctorCalls.push(opts);
      }
    }
    const fakeAssetModule = { AssetServiceClient: FakeAssetServiceClient };

    vi.doMock('fs', () => ({
      default: {
        readFileSync: () =>
          JSON.stringify({ client_email: 'sa@x.iam', private_key: 'PRIVATE' }),
      },
      readFileSync: () => JSON.stringify({ client_email: 'sa@x.iam', private_key: 'PRIVATE' }),
    }));

    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => fakeAssetModule;
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new AssetInventoryService('keep-proj', [], [], '/tmp/k.json');
      await svc.discover();
      expect(ctorCalls[0]).toMatchObject({ projectId: 'keep-proj' });
    } finally {
      (globalThis as any).Function = OriginalFunction;
      vi.doUnmock('fs');
    }
  });

  it('falls back to keyFilename when key file read fails', async () => {
    const ctorCalls: unknown[] = [];
    class FakeAssetServiceClient {
      listAssets = async () => [[]];
      constructor(opts: unknown) {
        ctorCalls.push(opts);
      }
    }
    const fakeAssetModule = { AssetServiceClient: FakeAssetServiceClient };

    vi.doMock('fs', () => ({
      default: {
        readFileSync: () => {
          throw new Error('ENOENT');
        },
      },
      readFileSync: () => {
        throw new Error('ENOENT');
      },
    }));

    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => fakeAssetModule;
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new AssetInventoryService('p', [], [], '/tmp/missing.json');
      await svc.discover();
      // key-file read failed → fallback to keyFilename
      expect(ctorCalls[0]).toMatchObject({ projectId: 'p', keyFilename: '/tmp/missing.json' });
      expect(ctorCalls[0]).not.toHaveProperty('credentials');
    } finally {
      (globalThis as any).Function = OriginalFunction;
      vi.doUnmock('fs');
    }
  });

  it('caches the asset client across discover() calls', async () => {
    let imports = 0;
    class FakeAssetServiceClient {
      listAssets = async () => [[]];
    }
    const fakeAssetModule = { AssetServiceClient: FakeAssetServiceClient };

    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => {
          imports++;
          return fakeAssetModule;
        };
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new AssetInventoryService('p', [], []);
      await svc.discover();
      await svc.discover();
      expect(imports).toBe(1);
    } finally {
      (globalThis as any).Function = OriginalFunction;
    }
  });
});

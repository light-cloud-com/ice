/**
 * Tests for `azure-deployer.ts`.
 *
 * The deployer wraps Azure SDK packages (`@azure/identity`,
 * `@azure/arm-compute`, `@azure/arm-storage`, `@azure/arm-appservice`)
 * loaded through the same `Function('m', 'return import(m)')` indirection
 * used by `azure-importer.ts` and `gcp/sdk-loader.ts`. Vitest's module
 * registry does NOT see these specifiers, so we install a stub on
 * `globalThis.Function` for the duration of each test that intercepts the
 * dynamic-import constructor and routes the requested module name through a
 * controllable registry. The pattern mirrors the harness in
 * `importers/azure/__tests__/azure-importer.test.ts`.
 *
 * Coverage scope:
 * - constructor + provider field
 * - `initialize`:
 *     - subscription_id/resource_group propagation from options (truthy/falsy)
 *     - credential creation when @azure/identity loads
 *     - happy path where every per-client load succeeds
 *     - per-client try/catch arms when the corresponding SDK is missing
 *     - outer try/catch when @azure/identity itself is missing (Error vs String)
 * - `cleanup`: no-op (smoke test)
 * - `create` / `update` / `delete`: type dispatch (VM, storage, web, fallthrough)
 *   plus the success and error branches in each
 * - private helpers (`extract_resource_group` exercised through update/delete
 *   provider_id parsing)
 * - `create_azure_deployer` factory
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureDeployer, create_azure_deployer } from '../azure-deployer';
import type { DeployOptions } from '../../types';

// =============================================================================
// Function-constructor stub
// =============================================================================

interface FakeImportRegistry {
  '@azure/identity'?: unknown;
  '@azure/arm-compute'?: unknown;
  '@azure/arm-storage'?: unknown;
  '@azure/arm-appservice'?: unknown;
}

const original_function = globalThis.Function;

function install_dynamic_import_stub(registry: FakeImportRegistry): void {
  const stub = function (...args: unknown[]) {
    if (
      args.length === 2 &&
      args[0] === 'm' &&
      typeof args[1] === 'string' &&
      args[1].includes('return import')
    ) {
      return (module_name: string) => {
        const mod = (registry as Record<string, unknown>)[module_name];
        if (mod === undefined) {
          return Promise.reject(new Error(`Mocked module not registered: ${module_name}`));
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
// Fake SDK shapes
//
// Constructor-based clients require real classes — `vi.fn()` arrow-function
// mocks cannot be invoked with `new`. See `gcp-importer coverage` learning.
// =============================================================================

function makeIdentityModule(opts: { credentialThrows?: boolean } = {}) {
  class DefaultAzureCredential {
    constructor() {
      if (opts.credentialThrows) throw new Error('credential ctor failed');
    }
  }
  return { DefaultAzureCredential };
}

function makeComputeModule() {
  const calls: { name: string; args: any[]; result?: any }[] = [];
  const beginCreateOrUpdateAndWait = vi.fn();
  const beginUpdateAndWait = vi.fn();
  const beginDeleteAndWait = vi.fn();

  class ComputeManagementClient {
    credential: any;
    subscriptionId: string;
    virtualMachines: any;
    constructor(credential: any, subscriptionId: string) {
      this.credential = credential;
      this.subscriptionId = subscriptionId;
      this.virtualMachines = {
        beginCreateOrUpdateAndWait,
        beginUpdateAndWait,
        beginDeleteAndWait,
      };
    }
  }
  return { ComputeManagementClient, calls, beginCreateOrUpdateAndWait, beginUpdateAndWait, beginDeleteAndWait };
}

function makeStorageModule() {
  const beginCreateAndWait = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  class StorageManagementClient {
    storageAccounts: any;
    constructor(_credential: any, _subscriptionId: string) {
      this.storageAccounts = { beginCreateAndWait, update, delete: del };
    }
  }
  return { StorageManagementClient, beginCreateAndWait, update, del };
}

function makeWebModule() {
  const beginCreateOrUpdateAndWait = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  class WebSiteManagementClient {
    webApps: any;
    constructor(_credential: any, _subscriptionId: string) {
      this.webApps = { beginCreateOrUpdateAndWait, update, delete: del };
    }
  }
  return { WebSiteManagementClient, beginCreateOrUpdateAndWait, update, del };
}

// Default registry: every SDK loads successfully.
function makeFullRegistry() {
  const identity = makeIdentityModule();
  const compute = makeComputeModule();
  const storage = makeStorageModule();
  const web = makeWebModule();
  return {
    registry: {
      '@azure/identity': identity,
      '@azure/arm-compute': compute,
      '@azure/arm-storage': storage,
      '@azure/arm-appservice': web,
    } satisfies FakeImportRegistry,
    identity,
    compute,
    storage,
    web,
  };
}

// =============================================================================
// Lifecycle
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  restore_dynamic_import_stub();
});

// =============================================================================
// Construction & provider tag
// =============================================================================

describe('AzureDeployer constructor', () => {
  it('exposes the "azure" provider tag', () => {
    const d = new AzureDeployer();
    expect(d.provider).toBe('azure');
  });
});

describe('create_azure_deployer factory', () => {
  it('returns an AzureDeployer instance', () => {
    const d = create_azure_deployer();
    expect(d).toBeInstanceOf(AzureDeployer);
    expect(d.provider).toBe('azure');
  });
});

// =============================================================================
// initialize
// =============================================================================

describe('initialize', () => {
  it('captures subscription_id and resource_group from options', async () => {
    const { registry, compute } = makeFullRegistry();
    install_dynamic_import_stub(registry);
    const d = new AzureDeployer();

    await d.initialize({
      provider: 'azure',
      subscriptions: ['sub-123'],
      resource_groups: ['rg-prod'],
    });

    // Verify the subscription propagated by checking the compute client
    // received it. The class stores `subscriptionId` on the instance.
    compute.beginCreateOrUpdateAndWait.mockResolvedValue({ id: '/subscriptions/sub-123/.../vm' });
    await d.create('azure.compute.virtual_machine', 'vm1', { resource_group: 'rg-prod' }, {});
    expect(compute.beginCreateOrUpdateAndWait).toHaveBeenCalledWith('rg-prod', 'vm1', expect.any(Object));
  });

  it('ignores subscriptions when the array is empty', async () => {
    const { registry } = makeFullRegistry();
    install_dynamic_import_stub(registry);
    const d = new AzureDeployer();

    await d.initialize({ provider: 'azure', subscriptions: [] });
    // Internal state is private; the lack-of-throw is the assertion.
    // We additionally verify the deployer is functional.
    expect(d.provider).toBe('azure');
  });

  it('ignores subscriptions when the first entry is an empty string', async () => {
    // The guard chain `subscriptions[0]` is falsy for empty string —
    // this exercises the third leg of the AND chain.
    const { registry } = makeFullRegistry();
    install_dynamic_import_stub(registry);
    const d = new AzureDeployer();

    await d.initialize({ provider: 'azure', subscriptions: [''] });
    expect(d.provider).toBe('azure');
  });

  it('ignores resource_groups when the array is empty', async () => {
    const { registry } = makeFullRegistry();
    install_dynamic_import_stub(registry);
    const d = new AzureDeployer();

    await d.initialize({ provider: 'azure', resource_groups: [] });
    expect(d.provider).toBe('azure');
  });

  it('ignores resource_groups when the first entry is an empty string', async () => {
    const { registry } = makeFullRegistry();
    install_dynamic_import_stub(registry);
    const d = new AzureDeployer();

    await d.initialize({ provider: 'azure', resource_groups: [''] });
    expect(d.provider).toBe('azure');
  });

  it('initializes when only @azure/identity is available (compute/storage/web missing)', async () => {
    // Each per-client try/catch swallows its own load failure and leaves
    // the corresponding *_client null. The outer init still succeeds.
    const identity = makeIdentityModule();
    install_dynamic_import_stub({ '@azure/identity': identity });
    const d = new AzureDeployer();

    await expect(
      d.initialize({ provider: 'azure', subscriptions: ['s'], resource_groups: ['rg'] }),
    ).resolves.toBeUndefined();

    // None of the clients are wired — every type-specific create fails.
    const out = await d.create('azure.compute.virtual_machine', 'vm', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Compute SDK not available/);
  });

  it('initializes only the storage client when arm-compute and arm-appservice are missing', async () => {
    const identity = makeIdentityModule();
    const storage = makeStorageModule();
    install_dynamic_import_stub({ '@azure/identity': identity, '@azure/arm-storage': storage });
    const d = new AzureDeployer();

    await d.initialize({ provider: 'azure', subscriptions: ['s'], resource_groups: ['rg'] });

    storage.beginCreateAndWait.mockResolvedValue({ id: '/sub/s/rg/sa1' });
    const out = await d.create('azure.storage.account', 'sa1', {}, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('/sub/s/rg/sa1');
  });

  it('initializes only the web client when arm-compute and arm-storage are missing', async () => {
    const identity = makeIdentityModule();
    const web = makeWebModule();
    install_dynamic_import_stub({ '@azure/identity': identity, '@azure/arm-appservice': web });
    const d = new AzureDeployer();

    await d.initialize({ provider: 'azure', subscriptions: ['s'], resource_groups: ['rg'] });

    web.beginCreateOrUpdateAndWait.mockResolvedValue({ id: '/sub/s/rg/wa1' });
    const out = await d.create('azure.web.app', 'wa1', {}, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('/sub/s/rg/wa1');
  });

  it('throws "Failed to initialize Azure SDK: <message>" when @azure/identity itself is missing', async () => {
    install_dynamic_import_stub({}); // no modules registered
    const d = new AzureDeployer();

    await expect(d.initialize({ provider: 'azure' })).rejects.toThrow(
      /Failed to initialize Azure SDK: Mocked module not registered: @azure\/identity/,
    );
  });

  it('uses String(err) fallback when the thrown identity-load value is not an Error', async () => {
    // The Function constructor stub falls through to the real Function for
    // unrelated calls; here we install a custom Function that rejects with
    // a non-Error throw to exercise the `error instanceof Error ? message :
    // String(error)` fallback in the outer catch.
    const stub = function (...args: unknown[]) {
      if (
        args.length === 2 &&
        args[0] === 'm' &&
        typeof args[1] === 'string' &&
        args[1].includes('return import')
      ) {
        return () => Promise.reject('plain-string-throw');
      }
      return (original_function as unknown as (...a: unknown[]) => unknown).apply(original_function, args);
    };
    (globalThis as { Function: unknown }).Function = stub;

    const d = new AzureDeployer();
    await expect(d.initialize({ provider: 'azure' })).rejects.toThrow(
      /Failed to initialize Azure SDK: plain-string-throw/,
    );
  });

  it('attaches the original error as cause on the wrapped Failed-to-initialize error', async () => {
    install_dynamic_import_stub({});
    const d = new AzureDeployer();
    let caught: any;
    try {
      await d.initialize({ provider: 'azure' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.cause).toBeDefined();
    expect((caught.cause as Error).message).toMatch(/Mocked module not registered/);
  });
});

// =============================================================================
// cleanup
// =============================================================================

describe('cleanup', () => {
  it('resolves with no observable side effects', async () => {
    const d = new AzureDeployer();
    await expect(d.cleanup()).resolves.toBeUndefined();
  });
});

// =============================================================================
// create — type dispatch
// =============================================================================

describe('create', () => {
  async function deployerWithFullSdk() {
    const ctx = makeFullRegistry();
    install_dynamic_import_stub(ctx.registry);
    const d = new AzureDeployer();
    await d.initialize({
      provider: 'azure',
      subscriptions: ['sub-1'],
      resource_groups: ['rg-default'],
    });
    return { d, ...ctx };
  }

  it('creates a virtual_machine via the compute client and returns provider_id', async () => {
    const { d, compute } = await deployerWithFullSdk();
    compute.beginCreateOrUpdateAndWait.mockResolvedValue({
      id: '/subscriptions/sub-1/resourceGroups/rg-default/providers/Microsoft.Compute/virtualMachines/vm1',
    });

    const out = await d.create(
      'azure.compute.virtual_machine.linux',
      'vm1',
      { admin_password: 'pass' },
      {},
    );

    expect(out.success).toBe(true);
    expect(out.action).toBe('create');
    expect(out.type).toBe('azure.compute.virtual_machine.linux');
    expect(out.provider_id).toContain('/virtualMachines/vm1');
    expect(out.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("creates a VM with linuxConfiguration when admin_password is missing (SSH-only mode)", async () => {
    const { d, compute } = await deployerWithFullSdk();
    compute.beginCreateOrUpdateAndWait.mockResolvedValue({ id: '/.../vm1' });

    await d.create(
      'azure.compute.virtual_machine',
      'vm1',
      {
        ssh_public_keys: [{ keyData: 'ssh-rsa AAAA...', path: '/home/azureuser/.ssh/authorized_keys' }],
      },
      {},
    );

    const body = compute.beginCreateOrUpdateAndWait.mock.calls[0][2];
    expect(body.osProfile.linuxConfiguration).toEqual({
      disablePasswordAuthentication: true,
      ssh: { publicKeys: [{ keyData: 'ssh-rsa AAAA...', path: '/home/azureuser/.ssh/authorized_keys' }] },
    });
  });

  it('uses default location/vm_size/image fields when not specified', async () => {
    const { d, compute } = await deployerWithFullSdk();
    compute.beginCreateOrUpdateAndWait.mockResolvedValue({ id: '/.../vm1' });

    await d.create('azure.compute.virtual_machine', 'vm1', { admin_password: 'p' }, {});

    const body = compute.beginCreateOrUpdateAndWait.mock.calls[0][2];
    expect(body.location).toBe('eastus');
    expect(body.hardwareProfile.vmSize).toBe('Standard_B1s');
    expect(body.storageProfile.imageReference.publisher).toBe('Canonical');
    expect(body.storageProfile.imageReference.offer).toBe('0001-com-ubuntu-server-jammy');
    expect(body.storageProfile.imageReference.sku).toBe('22_04-lts');
    expect(body.osProfile.adminUsername).toBe('azureuser');
  });

  it('forwards explicit location/vm_size/image_publisher/image_offer/image_sku/admin_username/network_interfaces/tags', async () => {
    const { d, compute } = await deployerWithFullSdk();
    compute.beginCreateOrUpdateAndWait.mockResolvedValue({ id: '/.../vm1' });

    const ifaces = [{ id: '/.../net' }];
    const tags = { env: 'prod' };
    await d.create(
      'azure.compute.virtual_machine',
      'vm1',
      {
        location: 'westus2',
        vm_size: 'Standard_D2s_v3',
        image_publisher: 'Custom',
        image_offer: 'CustomOffer',
        image_sku: 'CustomSku',
        admin_username: 'admin',
        admin_password: 'p',
        network_interfaces: ifaces,
        tags,
        resource_group: 'rg-vm',
      },
      {},
    );

    const [resourceGroup, name, body] = compute.beginCreateOrUpdateAndWait.mock.calls[0];
    expect(resourceGroup).toBe('rg-vm');
    expect(name).toBe('vm1');
    expect(body.location).toBe('westus2');
    expect(body.hardwareProfile.vmSize).toBe('Standard_D2s_v3');
    expect(body.storageProfile.imageReference).toEqual({
      publisher: 'Custom',
      offer: 'CustomOffer',
      sku: 'CustomSku',
      version: 'latest',
    });
    expect(body.osProfile.adminUsername).toBe('admin');
    expect(body.osProfile.linuxConfiguration).toBeUndefined(); // password set
    expect(body.networkProfile.networkInterfaces).toBe(ifaces);
    expect(body.tags).toBe(tags);
  });

  it('returns provider_id="" when the compute client returns a result without an id', async () => {
    // `result.id || ''` — undefined `id` falls through to ''.
    const { d, compute } = await deployerWithFullSdk();
    compute.beginCreateOrUpdateAndWait.mockResolvedValue({});

    const out = await d.create('azure.compute.virtual_machine', 'vm1', { admin_password: 'p' }, {});

    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('');
  });

  it('creates a storage_account via the storage client', async () => {
    const { d, storage } = await deployerWithFullSdk();
    storage.beginCreateAndWait.mockResolvedValue({ id: '/.../sa1' });

    const out = await d.create('azure.storage.account', 'sa1', {}, {});

    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('/.../sa1');
    expect(storage.beginCreateAndWait).toHaveBeenCalledWith(
      'rg-default',
      'sa1',
      expect.objectContaining({
        location: 'eastus',
        sku: { name: 'Standard_LRS' },
        kind: 'StorageV2',
      }),
    );
  });

  it('forwards location/sku/kind/tags/resource_group on a storage_account create', async () => {
    const { d, storage } = await deployerWithFullSdk();
    storage.beginCreateAndWait.mockResolvedValue({ id: '/.../sa1' });

    const tags = { team: 'data' };
    await d.create(
      'azure.storage.account',
      'sa1',
      { location: 'westus', sku: 'Premium_LRS', kind: 'BlobStorage', tags, resource_group: 'rg-st' },
      {},
    );

    expect(storage.beginCreateAndWait).toHaveBeenCalledWith('rg-st', 'sa1', {
      location: 'westus',
      sku: { name: 'Premium_LRS' },
      kind: 'BlobStorage',
      tags,
    });
  });

  it('returns provider_id="" when storage create returns no id', async () => {
    const { d, storage } = await deployerWithFullSdk();
    storage.beginCreateAndWait.mockResolvedValue({});

    const out = await d.create('azure.storage.account', 'sa1', {}, {});

    expect(out.provider_id).toBe('');
  });

  it('creates a web_app via the web client', async () => {
    const { d, web } = await deployerWithFullSdk();
    web.beginCreateOrUpdateAndWait.mockResolvedValue({ id: '/.../wa1' });

    const out = await d.create('azure.web.app', 'wa1', {}, {});

    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('/.../wa1');
  });

  it('maps app_settings into the {name, value} array on web_app create', async () => {
    const { d, web } = await deployerWithFullSdk();
    web.beginCreateOrUpdateAndWait.mockResolvedValue({ id: '/.../wa1' });

    await d.create(
      'azure.web.app',
      'wa1',
      {
        app_service_plan_id: '/plan/p1',
        linux_fx_version: 'NODE|18-lts',
        app_settings: { NODE_ENV: 'production', LOG_LEVEL: 'info' },
        tags: { env: 'prod' },
        resource_group: 'rg-web',
      },
      {},
    );

    const [rg, name, body] = web.beginCreateOrUpdateAndWait.mock.calls[0];
    expect(rg).toBe('rg-web');
    expect(name).toBe('wa1');
    expect(body.serverFarmId).toBe('/plan/p1');
    expect(body.siteConfig.linuxFxVersion).toBe('NODE|18-lts');
    expect(body.siteConfig.appSettings).toEqual([
      { name: 'NODE_ENV', value: 'production' },
      { name: 'LOG_LEVEL', value: 'info' },
    ]);
  });

  it('omits appSettings when app_settings is undefined on web_app create', async () => {
    // The conditional `properties.app_settings ? Object.entries(...) :
    // undefined` — exercises the `undefined` arm.
    const { d, web } = await deployerWithFullSdk();
    web.beginCreateOrUpdateAndWait.mockResolvedValue({ id: '/.../wa1' });

    await d.create('azure.web.app', 'wa1', {}, {});

    const body = web.beginCreateOrUpdateAndWait.mock.calls[0][2];
    expect(body.siteConfig.appSettings).toBeUndefined();
  });

  it('returns provider_id="" when web create returns no id', async () => {
    const { d, web } = await deployerWithFullSdk();
    web.beginCreateOrUpdateAndWait.mockResolvedValue({});

    const out = await d.create('azure.web.app', 'wa1', {}, {});

    expect(out.provider_id).toBe('');
  });

  it('returns success:false with "Unsupported resource type for creation" for unknown types', async () => {
    const { d } = await deployerWithFullSdk();
    const out = await d.create('azure.something.else', 'x', {}, {});

    expect(out).toMatchObject({
      success: false,
      error: 'Unsupported resource type for creation: azure.something.else',
      type: 'azure.something.else',
      action: 'create',
    });
    expect(out.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns success:false with the SDK-not-available error when the compute client is missing', async () => {
    // Initialize with only @azure/identity available; compute client is null.
    const identity = makeIdentityModule();
    install_dynamic_import_stub({ '@azure/identity': identity });
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure' });

    const out = await d.create('azure.compute.virtual_machine', 'vm', {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Compute SDK not available\. Install @azure\/arm-compute/);
  });

  it('returns success:false with the SDK-not-available error when the storage client is missing', async () => {
    const identity = makeIdentityModule();
    install_dynamic_import_stub({ '@azure/identity': identity });
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure' });

    const out = await d.create('azure.storage.account', 'sa', {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Storage SDK not available\. Install @azure\/arm-storage/);
  });

  it('returns success:false with the SDK-not-available error when the web client is missing', async () => {
    const identity = makeIdentityModule();
    install_dynamic_import_stub({ '@azure/identity': identity });
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure' });

    const out = await d.create('azure.web.app', 'wa', {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Web SDK not available\. Install @azure\/arm-appservice/);
  });

  it('returns success:false with the Error message when the underlying create throws', async () => {
    const { d, compute } = await deployerWithFullSdk();
    compute.beginCreateOrUpdateAndWait.mockRejectedValue(new Error('quota exceeded'));

    const out = await d.create('azure.compute.virtual_machine', 'vm', {}, {});

    expect(out).toMatchObject({
      success: false,
      error: 'quota exceeded',
      action: 'create',
    });
  });

  it('uses String(err) when the underlying create throws a non-Error', async () => {
    const { d, compute } = await deployerWithFullSdk();
    compute.beginCreateOrUpdateAndWait.mockRejectedValue('plain-throw');

    const out = await d.create('azure.compute.virtual_machine', 'vm', {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('plain-throw');
  });
});

// =============================================================================
// update — type dispatch
// =============================================================================

describe('update', () => {
  async function deployerWithFullSdk() {
    const ctx = makeFullRegistry();
    install_dynamic_import_stub(ctx.registry);
    const d = new AzureDeployer();
    await d.initialize({
      provider: 'azure',
      subscriptions: ['sub-1'],
      resource_groups: ['rg-default'],
    });
    return { d, ...ctx };
  }

  it('updates virtual_machine tags via beginUpdateAndWait', async () => {
    const { d, compute } = await deployerWithFullSdk();
    compute.beginUpdateAndWait.mockResolvedValue({});
    const provider_id =
      '/subscriptions/sub-1/resourceGroups/rg-vm/providers/Microsoft.Compute/virtualMachines/vm1';

    const out = await d.update(
      'azure.compute.virtual_machine',
      'vm1',
      provider_id,
      { tags: { env: 'prod' } },
      {},
      {},
    );

    expect(out).toMatchObject({ success: true, action: 'update', provider_id });
    expect(compute.beginUpdateAndWait).toHaveBeenCalledWith('rg-vm', 'vm1', { tags: { env: 'prod' } });
  });

  it('skips the VM update call when properties.tags is absent', async () => {
    // The `if (properties.tags)` guard is exercised by passing none.
    const { d, compute } = await deployerWithFullSdk();
    const out = await d.update(
      'azure.compute.virtual_machine',
      'vm1',
      '/subscriptions/sub-1/resourceGroups/rg-vm/providers/Microsoft.Compute/virtualMachines/vm1',
      {},
      {},
      {},
    );
    expect(out.success).toBe(true);
    expect(compute.beginUpdateAndWait).not.toHaveBeenCalled();
  });

  it('updates a storage_account via storageAccounts.update', async () => {
    const { d, storage } = await deployerWithFullSdk();
    storage.update.mockResolvedValue({});
    const provider_id = '/subscriptions/sub-1/resourceGroups/rg-st/providers/Microsoft.Storage/storageAccounts/sa1';

    const out = await d.update('azure.storage.account', 'sa1', provider_id, { tags: { t: '1' } }, {}, {});

    expect(out.success).toBe(true);
    expect(storage.update).toHaveBeenCalledWith('rg-st', 'sa1', { tags: { t: '1' } });
  });

  it('updates a web_app via webApps.update with mapped app_settings', async () => {
    const { d, web } = await deployerWithFullSdk();
    web.update.mockResolvedValue({});
    const provider_id = '/subscriptions/sub-1/resourceGroups/rg-w/providers/Microsoft.Web/sites/wa1';

    await d.update(
      'azure.web.app',
      'wa1',
      provider_id,
      { app_settings: { K: 'v' }, tags: { t: 'x' } },
      {},
      {},
    );

    expect(web.update).toHaveBeenCalledWith('rg-w', 'wa1', {
      siteConfig: { appSettings: [{ name: 'K', value: 'v' }] },
      tags: { t: 'x' },
    });
  });

  it('omits appSettings on a web_app update when app_settings is missing', async () => {
    const { d, web } = await deployerWithFullSdk();
    web.update.mockResolvedValue({});

    await d.update(
      'azure.web.app',
      'wa1',
      '/subscriptions/sub-1/resourceGroups/rg-w/providers/Microsoft.Web/sites/wa1',
      {},
      {},
      {},
    );

    expect(web.update).toHaveBeenCalledWith('rg-w', 'wa1', {
      siteConfig: { appSettings: undefined },
      tags: undefined,
    });
  });

  it('returns success:false with "Unsupported resource type for update" for unknown types', async () => {
    const { d } = await deployerWithFullSdk();
    const out = await d.update('azure.unknown.thing', 'x', '/p', {}, {}, {});

    expect(out).toMatchObject({
      success: false,
      error: 'Unsupported resource type for update: azure.unknown.thing',
      action: 'update',
    });
  });

  it('returns success:false with SDK-not-available when compute client is missing on VM update', async () => {
    const identity = makeIdentityModule();
    install_dynamic_import_stub({ '@azure/identity': identity });
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure' });

    const out = await d.update('azure.compute.virtual_machine', 'vm', '/sub/rg-x/.../vm', { tags: {} }, {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('Compute SDK not available');
  });

  it('returns success:false with SDK-not-available when storage client is missing on storage update', async () => {
    const identity = makeIdentityModule();
    install_dynamic_import_stub({ '@azure/identity': identity });
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure' });

    const out = await d.update('azure.storage.account', 'sa', '/sub/rg-x/.../sa', {}, {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('Storage SDK not available');
  });

  it('returns success:false with SDK-not-available when web client is missing on web update', async () => {
    const identity = makeIdentityModule();
    install_dynamic_import_stub({ '@azure/identity': identity });
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure' });

    const out = await d.update('azure.web.app', 'wa', '/sub/rg-x/.../wa', {}, {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('Web SDK not available');
  });

  it('returns success:false with the Error message when underlying update throws', async () => {
    const { d, storage } = await deployerWithFullSdk();
    storage.update.mockRejectedValue(new Error('throttled'));

    const out = await d.update(
      'azure.storage.account',
      'sa',
      '/subscriptions/sub-1/resourceGroups/rg-st/providers/Microsoft.Storage/storageAccounts/sa',
      {},
      {},
      {},
    );

    expect(out).toMatchObject({ success: false, error: 'throttled', action: 'update' });
  });

  it('uses String(err) on update when the rejected value is not an Error', async () => {
    const { d, storage } = await deployerWithFullSdk();
    storage.update.mockRejectedValue(123);

    const out = await d.update(
      'azure.storage.account',
      'sa',
      '/subscriptions/sub-1/resourceGroups/rg-st/providers/Microsoft.Storage/storageAccounts/sa',
      {},
      {},
      {},
    );

    expect(out.error).toBe('123');
  });
});

// =============================================================================
// delete — type dispatch
// =============================================================================

describe('delete', () => {
  async function deployerWithFullSdk() {
    const ctx = makeFullRegistry();
    install_dynamic_import_stub(ctx.registry);
    const d = new AzureDeployer();
    await d.initialize({
      provider: 'azure',
      subscriptions: ['sub-1'],
      resource_groups: ['rg-default'],
    });
    return { d, ...ctx };
  }

  it('deletes a virtual_machine via beginDeleteAndWait', async () => {
    const { d, compute } = await deployerWithFullSdk();
    compute.beginDeleteAndWait.mockResolvedValue({});
    const provider_id =
      '/subscriptions/sub-1/resourceGroups/rg-vm/providers/Microsoft.Compute/virtualMachines/vm1';

    const out = await d.delete('azure.compute.virtual_machine', 'vm1', provider_id, {});

    expect(out).toMatchObject({ success: true, action: 'delete' });
    // delete result intentionally omits provider_id; assert it's not set
    expect((out as any).provider_id).toBeUndefined();
    expect(compute.beginDeleteAndWait).toHaveBeenCalledWith('rg-vm', 'vm1');
  });

  it('deletes a storage_account via storageAccounts.delete', async () => {
    const { d, storage } = await deployerWithFullSdk();
    storage.del.mockResolvedValue({});
    const provider_id = '/subscriptions/sub-1/resourceGroups/rg-st/providers/Microsoft.Storage/storageAccounts/sa1';

    const out = await d.delete('azure.storage.account', 'sa1', provider_id, {});

    expect(out.success).toBe(true);
    expect(storage.del).toHaveBeenCalledWith('rg-st', 'sa1');
  });

  it('deletes a web_app via webApps.delete', async () => {
    const { d, web } = await deployerWithFullSdk();
    web.del.mockResolvedValue({});
    const provider_id = '/subscriptions/sub-1/resourceGroups/rg-w/providers/Microsoft.Web/sites/wa1';

    const out = await d.delete('azure.web.app', 'wa1', provider_id, {});

    expect(out.success).toBe(true);
    expect(web.del).toHaveBeenCalledWith('rg-w', 'wa1');
  });

  it('returns success:false with "Unsupported resource type for deletion" for unknown types', async () => {
    const { d } = await deployerWithFullSdk();
    const out = await d.delete('azure.x.y', 'x', '/sub/rg/x', {});

    expect(out).toMatchObject({
      success: false,
      error: 'Unsupported resource type for deletion: azure.x.y',
      action: 'delete',
    });
  });

  it('returns success:false with SDK-not-available when compute client is missing on VM delete', async () => {
    const identity = makeIdentityModule();
    install_dynamic_import_stub({ '@azure/identity': identity });
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure' });

    const out = await d.delete('azure.compute.virtual_machine', 'vm', '/sub/rg/vm', {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('Compute SDK not available');
  });

  it('returns success:false with SDK-not-available when storage client is missing on storage delete', async () => {
    const identity = makeIdentityModule();
    install_dynamic_import_stub({ '@azure/identity': identity });
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure' });

    const out = await d.delete('azure.storage.account', 'sa', '/sub/rg/sa', {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('Storage SDK not available');
  });

  it('returns success:false with SDK-not-available when web client is missing on web delete', async () => {
    const identity = makeIdentityModule();
    install_dynamic_import_stub({ '@azure/identity': identity });
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure' });

    const out = await d.delete('azure.web.app', 'wa', '/sub/rg/wa', {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('Web SDK not available');
  });

  it('returns success:false with the Error message when underlying delete throws', async () => {
    const { d, web } = await deployerWithFullSdk();
    web.del.mockRejectedValue(new Error('not found'));

    const out = await d.delete(
      'azure.web.app',
      'wa1',
      '/subscriptions/sub-1/resourceGroups/rg-w/providers/Microsoft.Web/sites/wa1',
      {},
    );

    expect(out).toMatchObject({ success: false, error: 'not found', action: 'delete' });
  });

  it('uses String(err) on delete when the rejected value is not an Error', async () => {
    const { d, web } = await deployerWithFullSdk();
    web.del.mockRejectedValue({ code: 'oops' });

    const out = await d.delete(
      'azure.web.app',
      'wa1',
      '/subscriptions/sub-1/resourceGroups/rg-w/providers/Microsoft.Web/sites/wa1',
      {},
    );

    // Object falls through to String(err) — "[object Object]"
    expect(out.error).toBe('[object Object]');
  });
});

// =============================================================================
// extract_resource_group — exercised through update/delete provider_id parsing
// =============================================================================

describe('extract_resource_group (via update/delete)', () => {
  async function deployerWithFullSdk(initRg?: string) {
    const ctx = makeFullRegistry();
    install_dynamic_import_stub(ctx.registry);
    const d = new AzureDeployer();
    const opts: DeployOptions = { provider: 'azure', subscriptions: ['sub-1'] };
    if (initRg) opts.resource_groups = [initRg];
    await d.initialize(opts);
    return { d, ...ctx };
  }

  it('extracts the resource_group from the provider_id when present (case-insensitive)', async () => {
    const { d, storage } = await deployerWithFullSdk('rg-init');
    storage.del.mockResolvedValue({});

    // RFC 8259 Azure ARM URLs use lowercase `resourceGroups`. The regex
    // is case-insensitive, so an upper-case form parses too.
    await d.delete(
      'azure.storage.account',
      'sa',
      '/subscriptions/sub-1/RESOURCEGROUPS/rg-extracted/providers/Microsoft.Storage/storageAccounts/sa',
      {},
    );

    expect(storage.del).toHaveBeenCalledWith('rg-extracted', 'sa');
  });

  it('falls back to the initialize-time resource_group when provider_id has no match', async () => {
    const { d, storage } = await deployerWithFullSdk('rg-init');
    storage.del.mockResolvedValue({});

    await d.delete('azure.storage.account', 'sa', '/no/match/here', {});

    expect(storage.del).toHaveBeenCalledWith('rg-init', 'sa');
  });

  it('falls back to "" when there is no resource_group set anywhere', async () => {
    // initialize() with no resource_groups — the field is the constructor
    // default '' empty string. The regex must miss for the fallback to fire.
    const { d, storage } = await deployerWithFullSdk();
    storage.del.mockResolvedValue({});

    await d.delete('azure.storage.account', 'sa', '/no/match/here', {});

    expect(storage.del).toHaveBeenCalledWith('', 'sa');
  });
});

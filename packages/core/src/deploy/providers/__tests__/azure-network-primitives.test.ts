/**
 * Tests for the Azure network primitive handlers: vnet, subnet, nsg.
 * Grouped because they share the @azure/arm-network NetworkManagementClient.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureDeployer } from '../azure-deployer';

function setup_mocks() {
  const vnet_create = vi.fn().mockResolvedValue({
    id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet1',
  });
  const vnet_updateTags = vi.fn().mockResolvedValue({});
  const vnet_delete = vi.fn().mockResolvedValue(undefined);
  const subnet_create = vi.fn().mockResolvedValue({
    id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet1/subnets/sn1',
  });
  const subnet_delete = vi.fn().mockResolvedValue(undefined);
  const nsg_create = vi.fn().mockResolvedValue({
    id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Network/networkSecurityGroups/nsg1',
  });
  const nsg_delete = vi.fn().mockResolvedValue(undefined);

  const original_function = globalThis.Function;
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return async (mod: string) => {
        if (mod === '@azure/identity') return { DefaultAzureCredential: class {} };
        if (mod === '@azure/arm-network') {
          return {
            NetworkManagementClient: class {
              virtualNetworks = {
                beginCreateOrUpdateAndWait: vnet_create,
                updateTags: vnet_updateTags,
                beginDeleteAndWait: vnet_delete,
              };
              subnets = {
                beginCreateOrUpdateAndWait: subnet_create,
                beginDeleteAndWait: subnet_delete,
              };
              networkSecurityGroups = {
                beginCreateOrUpdateAndWait: nsg_create,
                updateTags: vi.fn(),
                beginDeleteAndWait: nsg_delete,
              };
            },
          };
        }
        return null;
      };
    }
    return (original_function as unknown as (...a: unknown[]) => unknown).apply(original_function, args);
  };
  (globalThis as { Function: unknown }).Function = stub;
  return {
    restore: () => {
      (globalThis as { Function: unknown }).Function = original_function;
    },
    vnet_create,
    vnet_delete,
    subnet_create,
    subnet_delete,
    nsg_create,
    nsg_delete,
  };
}

describe('azure.network.virtualNetwork handler', () => {
  let stub: ReturnType<typeof setup_mocks>;
  beforeEach(() => {
    stub = setup_mocks();
  });
  afterEach(() => stub.restore());

  it('creates a vnet with default 10.0.0.0/16 address space', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'], regions: ['eastus'] });
    const out = await d.create('azure.network.virtualNetwork', 'vnet1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.vnet_create.mock.calls[0];
    expect(body.addressSpace.addressPrefixes).toEqual(['10.0.0.0/16']);
  });

  it('deletes via virtualNetworks.beginDeleteAndWait', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'] });
    const out = await d.delete(
      'azure.network.virtualNetwork',
      'vnet1',
      '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet1',
      {},
    );
    expect(out.success).toBe(true);
    expect(stub.vnet_delete).toHaveBeenCalledWith('rg', 'vnet1');
  });
});

describe('azure.network.subnet handler', () => {
  let stub: ReturnType<typeof setup_mocks>;
  beforeEach(() => {
    stub = setup_mocks();
  });
  afterEach(() => stub.restore());

  it('creates a subnet under the named vnet with default CIDR', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'], regions: ['eastus'] });
    const out = await d.create('azure.network.subnet', 'sn1', { virtual_network_name: 'vnet1' }, {});
    expect(out.success).toBe(true);
    const [rg, vnet, name, body] = stub.subnet_create.mock.calls[0];
    expect(rg).toBe('rg');
    expect(vnet).toBe('vnet1');
    expect(name).toBe('sn1');
    expect(body.addressPrefix).toBe('10.0.1.0/24');
  });

  it('refuses to create without virtual_network_name', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'] });
    const out = await d.create('azure.network.subnet', 'sn1', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/virtual_network_name/);
  });

  it('deletes by parsing vnet name from provider_id', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'] });
    const out = await d.delete(
      'azure.network.subnet',
      'sn1',
      '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet1/subnets/sn1',
      {},
    );
    expect(out.success).toBe(true);
    expect(stub.subnet_delete).toHaveBeenCalledWith('rg', 'vnet1', 'sn1');
  });
});

describe('azure.network.networkSecurityGroup handler', () => {
  let stub: ReturnType<typeof setup_mocks>;
  beforeEach(() => {
    stub = setup_mocks();
  });
  afterEach(() => stub.restore());

  it('creates an NSG with the supplied security rules', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'], regions: ['eastus'] });
    const rules = [{ name: 'allow-http', direction: 'Inbound', access: 'Allow' }];
    const out = await d.create('azure.network.networkSecurityGroup', 'nsg1', { rules }, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.nsg_create.mock.calls[0];
    expect(body.securityRules).toEqual(rules);
  });

  it('deletes via networkSecurityGroups.beginDeleteAndWait', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'] });
    const out = await d.delete(
      'azure.network.networkSecurityGroup',
      'nsg1',
      '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Network/networkSecurityGroups/nsg1',
      {},
    );
    expect(out.success).toBe(true);
    expect(stub.nsg_delete).toHaveBeenCalledWith('rg', 'nsg1');
  });
});

/**
 * Tests for the azure.keyvault.vault handler.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureDeployer } from '../azure-deployer';

function setup_mocks() {
  const beginCreateOrUpdateAndWait = vi.fn().mockResolvedValue({
    id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/kv1',
  });
  const update = vi.fn().mockResolvedValue({});
  const delete_ = vi.fn().mockResolvedValue(undefined);

  const original_function = globalThis.Function;
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return async (mod: string) => {
        if (mod === '@azure/identity') {
          return { DefaultAzureCredential: class {} };
        }
        if (mod === '@azure/arm-keyvault') {
          return {
            KeyVaultManagementClient: class {
              vaults = { beginCreateOrUpdateAndWait, update, delete: delete_ };
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
    beginCreateOrUpdateAndWait,
    update,
    delete_,
  };
}

describe('azure.keyvault.vault handler', () => {
  let stub: ReturnType<typeof setup_mocks>;
  beforeEach(() => {
    stub = setup_mocks();
  });
  afterEach(() => stub.restore());

  it('creates a vault with operator-supplied tenant_id', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'], regions: ['eastus'] });
    const out = await d.create('azure.keyvault.vault', 'kv1', { tenant_id: 'tnt-1' }, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toContain('/vaults/kv1');
    expect(stub.beginCreateOrUpdateAndWait).toHaveBeenCalled();
    const [, , body] = stub.beginCreateOrUpdateAndWait.mock.calls[0];
    expect(body.properties.tenantId).toBe('tnt-1');
    expect(body.properties.sku.name).toBe('standard');
  });

  it('refuses to create without tenant_id', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'] });
    const out = await d.create('azure.keyvault.vault', 'kv1', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/tenant_id/);
  });

  it('deletes via vaults.delete', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'] });
    const out = await d.delete(
      'azure.keyvault.vault',
      'kv1',
      '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/kv1',
      {},
    );
    expect(out.success).toBe(true);
    expect(stub.delete_).toHaveBeenCalledWith('rg', 'kv1');
  });
});

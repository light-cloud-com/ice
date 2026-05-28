/**
 * Tests for the azure.postgresqlflex.server handler.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureDeployer } from '../azure-deployer';

function setup_mocks() {
  const beginCreateOrUpdateAndWait = vi.fn().mockResolvedValue({
    id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/pg1',
  });
  const beginUpdateAndWait = vi.fn().mockResolvedValue({});
  const beginDeleteAndWait = vi.fn().mockResolvedValue(undefined);

  const original_function = globalThis.Function;
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return async (mod: string) => {
        if (mod === '@azure/identity') return { DefaultAzureCredential: class {} };
        if (mod === '@azure/arm-postgresql-flexible') {
          return {
            PostgreSQLManagementFlexibleServerClient: class {
              servers = { beginCreateOrUpdateAndWait, beginUpdateAndWait, beginDeleteAndWait };
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
    beginUpdateAndWait,
    beginDeleteAndWait,
  };
}

describe('azure.postgresqlflex.server handler', () => {
  let stub: ReturnType<typeof setup_mocks>;
  beforeEach(() => {
    stub = setup_mocks();
  });
  afterEach(() => stub.restore());

  it('creates a server with default Burstable B1ms SKU', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'], regions: ['eastus'] });
    const out = await d.create(
      'azure.postgresqlflex.server',
      'pg1',
      { administrator_login: 'admin', administrator_login_password: 'P@ssw0rd!' },
      {},
    );
    expect(out.success).toBe(true);
    expect(stub.beginCreateOrUpdateAndWait).toHaveBeenCalled();
    const [, , body] = stub.beginCreateOrUpdateAndWait.mock.calls[0];
    expect(body.sku.name).toBe('Standard_B1ms');
    expect(body.sku.tier).toBe('Burstable');
    expect(body.version).toBe('16');
    expect(body.administratorLogin).toBe('admin');
  });

  it('refuses to create without admin password', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'] });
    const out = await d.create('azure.postgresqlflex.server', 'pg1', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/administrator_login/);
  });

  it('deletes via servers.beginDeleteAndWait', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'] });
    const out = await d.delete(
      'azure.postgresqlflex.server',
      'pg1',
      '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/pg1',
      {},
    );
    expect(out.success).toBe(true);
    expect(stub.beginDeleteAndWait).toHaveBeenCalledWith('rg', 'pg1');
  });
});

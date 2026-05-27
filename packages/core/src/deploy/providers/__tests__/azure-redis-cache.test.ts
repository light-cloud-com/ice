/**
 * Tests for the azure.cache.redis handler.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureDeployer } from '../azure-deployer';

function setup_mocks() {
  const beginCreateAndWait = vi.fn().mockResolvedValue({
    id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Cache/redis/cache1',
  });
  const update = vi.fn().mockResolvedValue({});
  const beginDeleteAndWait = vi.fn().mockResolvedValue(undefined);

  const original_function = globalThis.Function;
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return async (mod: string) => {
        if (mod === '@azure/identity') return { DefaultAzureCredential: class {} };
        if (mod === '@azure/arm-rediscache') {
          return {
            RedisManagementClient: class {
              redis = { beginCreateAndWait, update, beginDeleteAndWait };
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
    beginCreateAndWait,
    beginDeleteAndWait,
  };
}

describe('azure.cache.redis handler', () => {
  let stub: ReturnType<typeof setup_mocks>;
  beforeEach(() => {
    stub = setup_mocks();
  });
  afterEach(() => stub.restore());

  it('creates a cache with default Basic C0 SKU', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'], regions: ['eastus'] });
    const out = await d.create('azure.cache.redis', 'cache1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.beginCreateAndWait.mock.calls[0];
    expect(body.sku.name).toBe('Basic');
    expect(body.sku.family).toBe('C');
    expect(body.sku.capacity).toBe(0);
    expect(body.minimumTlsVersion).toBe('1.2');
  });

  it('deletes via redis.beginDeleteAndWait', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'] });
    const out = await d.delete(
      'azure.cache.redis',
      'cache1',
      '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Cache/redis/cache1',
      {},
    );
    expect(out.success).toBe(true);
    expect(stub.beginDeleteAndWait).toHaveBeenCalledWith('rg', 'cache1');
  });
});

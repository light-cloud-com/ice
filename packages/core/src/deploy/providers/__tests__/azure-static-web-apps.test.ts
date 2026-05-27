/**
 * Tests for the azure.web.staticSite handler.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureDeployer } from '../azure-deployer';

function setup_mocks() {
  const beginCreateOrUpdateStaticSiteAndWait = vi.fn().mockResolvedValue({
    id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/staticSites/site1',
  });
  const updateStaticSite = vi.fn().mockResolvedValue({});
  const beginDeleteStaticSiteAndWait = vi.fn().mockResolvedValue(undefined);

  const original_function = globalThis.Function;
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return async (mod: string) => {
        if (mod === '@azure/identity') return { DefaultAzureCredential: class {} };
        if (mod === '@azure/arm-appservice') {
          return {
            WebSiteManagementClient: class {
              staticSites = {
                beginCreateOrUpdateStaticSiteAndWait,
                updateStaticSite,
                beginDeleteStaticSiteAndWait,
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
    beginCreateOrUpdateStaticSiteAndWait,
    beginDeleteStaticSiteAndWait,
  };
}

describe('azure.web.staticSite handler', () => {
  let stub: ReturnType<typeof setup_mocks>;
  beforeEach(() => {
    stub = setup_mocks();
  });
  afterEach(() => stub.restore());

  it('creates a site with default Free SKU when no repo is supplied', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'], regions: ['eastus'] });
    const out = await d.create('azure.web.staticSite', 'site1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.beginCreateOrUpdateStaticSiteAndWait.mock.calls[0];
    expect(body.sku.name).toBe('Free');
    expect(body.repositoryUrl).toBeUndefined();
    expect(body.buildProperties).toBeUndefined();
  });

  it('forwards repository_url and build properties when provided', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'] });
    await d.create(
      'azure.web.staticSite',
      'site1',
      {
        repository_url: 'https://github.com/o/r',
        branch: 'main',
        repository_token: 'tk',
        output_location: 'build',
      },
      {},
    );
    const [, , body] = stub.beginCreateOrUpdateStaticSiteAndWait.mock.calls[0];
    expect(body.repositoryUrl).toBe('https://github.com/o/r');
    expect(body.branch).toBe('main');
    expect(body.buildProperties.outputLocation).toBe('build');
  });

  it('deletes via staticSites.beginDeleteStaticSiteAndWait', async () => {
    const d = new AzureDeployer();
    await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'] });
    const out = await d.delete(
      'azure.web.staticSite',
      'site1',
      '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/staticSites/site1',
      {},
    );
    expect(out.success).toBe(true);
    expect(stub.beginDeleteStaticSiteAndWait).toHaveBeenCalledWith('rg', 'site1');
  });
});

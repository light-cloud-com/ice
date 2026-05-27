/**
 * Smoke tests for B2 P2 long-tail handlers: logic-apps, event-grid,
 * event-hubs, cognitive-search, azure-openai, azure-ml, synapse,
 * data-explorer (kusto), entra-b2c.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureDeployer } from '../azure-deployer';

function setup_mocks() {
  const mocks = {
    logic_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../workflows/lw1' }),
    logic_delete: vi.fn().mockResolvedValue(undefined),
    eg_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../topics/eg1' }),
    eg_delete: vi.fn().mockResolvedValue(undefined),
    eh_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../namespaces/eh1' }),
    eh_delete: vi.fn().mockResolvedValue(undefined),
    search_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../searchServices/srch1' }),
    search_delete: vi.fn().mockResolvedValue(undefined),
    cog_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../accounts/oai1' }),
    cog_delete: vi.fn().mockResolvedValue(undefined),
    ml_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../workspaces/ml1' }),
    ml_delete: vi.fn().mockResolvedValue(undefined),
    syn_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../workspaces/syn1' }),
    syn_delete: vi.fn().mockResolvedValue(undefined),
    kusto_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../clusters/k1' }),
    kusto_delete: vi.fn().mockResolvedValue(undefined),
  };

  const original_function = globalThis.Function;
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return async (mod: string) => {
        if (mod === '@azure/identity') return { DefaultAzureCredential: class {} };
        if (mod === '@azure/arm-logic') {
          return {
            LogicManagementClient: class {
              workflows = { createOrUpdate: mocks.logic_create, update: vi.fn(), delete: mocks.logic_delete };
            },
          };
        }
        if (mod === '@azure/arm-eventgrid') {
          return {
            EventGridManagementClient: class {
              topics = {
                beginCreateOrUpdateAndWait: mocks.eg_create,
                beginUpdateAndWait: vi.fn(),
                beginDeleteAndWait: mocks.eg_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-eventhub') {
          return {
            EventHubManagementClient: class {
              namespaces = {
                beginCreateOrUpdateAndWait: mocks.eh_create,
                update: vi.fn(),
                beginDeleteAndWait: mocks.eh_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-search') {
          return {
            SearchManagementClient: class {
              services = {
                beginCreateOrUpdateAndWait: mocks.search_create,
                update: vi.fn(),
                delete: mocks.search_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-cognitiveservices') {
          return {
            CognitiveServicesManagementClient: class {
              accounts = {
                beginCreateAndWait: mocks.cog_create,
                beginUpdateAndWait: vi.fn(),
                beginDeleteAndWait: mocks.cog_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-machinelearning') {
          return {
            AzureMachineLearningServicesManagementClient: class {
              workspaces = {
                beginCreateOrUpdateAndWait: mocks.ml_create,
                beginUpdateAndWait: vi.fn(),
                beginDeleteAndWait: mocks.ml_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-synapse') {
          return {
            SynapseManagementClient: class {
              workspaces = {
                beginCreateOrUpdateAndWait: mocks.syn_create,
                beginUpdateAndWait: vi.fn(),
                beginDeleteAndWait: mocks.syn_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-kusto') {
          return {
            KustoManagementClient: class {
              clusters = {
                beginCreateOrUpdateAndWait: mocks.kusto_create,
                beginUpdateAndWait: vi.fn(),
                beginDeleteAndWait: mocks.kusto_delete,
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
    ...mocks,
  };
}

async function deployer(): Promise<AzureDeployer> {
  const d = new AzureDeployer();
  await d.initialize({ provider: 'azure', subscriptions: ['sub'], resource_groups: ['rg'], regions: ['eastus'] });
  return d;
}

describe('B2 P2 handlers — dispatch + minimal success path', () => {
  let stub: ReturnType<typeof setup_mocks>;
  beforeEach(() => {
    stub = setup_mocks();
  });
  afterEach(() => stub.restore());

  it('logic-apps creates with caller-supplied definition', async () => {
    const d = await deployer();
    const out = await d.create('azure.logic.workflow', 'lw1', { definition: { triggers: {}, actions: {} } }, {});
    expect(out.success).toBe(true);
    expect(stub.logic_create).toHaveBeenCalled();
  });

  it('event-grid creates a topic at deployer location', async () => {
    const d = await deployer();
    const out = await d.create('azure.eventgrid.topic', 'eg1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.eg_create.mock.calls[0];
    expect(body.location).toBe('eastus');
  });

  it('event-hubs creates namespace with Standard SKU + capacity 1 by default', async () => {
    const d = await deployer();
    const out = await d.create('azure.eventhub.namespace', 'eh1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.eh_create.mock.calls[0];
    expect(body.sku.name).toBe('Standard');
    expect(body.sku.capacity).toBe(1);
  });

  it('cognitive-search creates with free tier by default', async () => {
    const d = await deployer();
    const out = await d.create('azure.search.service', 'srch1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.search_create.mock.calls[0];
    expect(body.sku.name).toBe('free');
  });

  it('azure-openai creates a Cognitive Services account with kind=OpenAI + S0', async () => {
    const d = await deployer();
    const out = await d.create('azure.cognitiveservices.account', 'oai1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.cog_create.mock.calls[0];
    expect(body.kind).toBe('OpenAI');
    expect(body.sku.name).toBe('S0');
  });

  it('azure-ml refuses without storage + key-vault + app-insights wired', async () => {
    const d = await deployer();
    const out = await d.create('azure.machinelearning.workspace', 'ml1', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/storage_account_id/);
  });

  it('azure-ml creates workspace when dependencies wired', async () => {
    const d = await deployer();
    const out = await d.create(
      'azure.machinelearning.workspace',
      'ml1',
      {
        storage_account_id: '/.../storageAccounts/sa1',
        key_vault_id: '/.../vaults/kv1',
        app_insights_id: '/.../components/ai1',
      },
      {},
    );
    expect(out.success).toBe(true);
    const [, , body] = stub.ml_create.mock.calls[0];
    expect(body.identity.type).toBe('SystemAssigned');
  });

  it('synapse refuses without SQL admin + Data Lake', async () => {
    const d = await deployer();
    const out = await d.create('azure.synapse.workspace', 'syn1', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/sql_administrator/);
  });

  it('synapse creates when all dependencies wired', async () => {
    const d = await deployer();
    const out = await d.create(
      'azure.synapse.workspace',
      'syn1',
      {
        sql_administrator_login: 'admin',
        sql_administrator_login_password: 'P@ssw0rd!',
        storage_account_url: 'https://x.dfs.core.windows.net',
        filesystem_name: 'fs',
      },
      {},
    );
    expect(out.success).toBe(true);
  });

  it('data-explorer creates with Dev SKU by default', async () => {
    const d = await deployer();
    const out = await d.create('azure.kusto.cluster', 'k1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.kusto_create.mock.calls[0];
    expect(body.sku.name).toBe('Dev(No SLA)_Standard_E2a_v4');
  });
});

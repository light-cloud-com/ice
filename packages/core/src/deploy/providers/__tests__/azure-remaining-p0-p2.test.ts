/**
 * Mocked-SDK tests for the handlers that still needed a (C) mocked
 * gate after the B2 sweep: sql-database, service-bus, log-analytics,
 * app-insights, entra-b2c.
 *
 * Consolidated for the same reason as `azure-p1-handlers.test.ts` and
 * `azure-p2-handlers.test.ts`: per-handler files would be ~80 LOC of
 * duplicated stub plumbing for very thin assertions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureDeployer } from '../azure-deployer';

function setup_mocks() {
  const mocks = {
    sql_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../servers/sql1' }),
    sql_delete: vi.fn().mockResolvedValue(undefined),
    sb_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../namespaces/sb1' }),
    sb_delete: vi.fn().mockResolvedValue(undefined),
    la_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../workspaces/la1' }),
    la_delete: vi.fn().mockResolvedValue(undefined),
    ai_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../components/ai1' }),
    ai_delete: vi.fn().mockResolvedValue(undefined),
    b2c_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../b2cDirectories/b2c1' }),
    b2c_delete: vi.fn().mockResolvedValue(undefined),
  };

  const original_function = globalThis.Function;
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return async (mod: string) => {
        if (mod === '@azure/identity') return { DefaultAzureCredential: class {} };
        if (mod === '@azure/arm-sql') {
          return {
            SqlManagementClient: class {
              servers = {
                beginCreateOrUpdateAndWait: mocks.sql_create,
                beginUpdateAndWait: vi.fn(),
                beginDeleteAndWait: mocks.sql_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-servicebus') {
          return {
            ServiceBusManagementClient: class {
              namespaces = {
                beginCreateOrUpdateAndWait: mocks.sb_create,
                beginUpdateAndWait: vi.fn(),
                beginDeleteAndWait: mocks.sb_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-operationalinsights') {
          return {
            OperationalInsightsManagementClient: class {
              workspaces = {
                beginCreateOrUpdateAndWait: mocks.la_create,
                update: vi.fn(),
                beginDeleteAndWait: mocks.la_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-appinsights') {
          return {
            ApplicationInsightsManagementClient: class {
              components = {
                createOrUpdate: mocks.ai_create,
                updateTags: vi.fn(),
                delete: mocks.ai_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-aad') {
          return {
            ActiveDirectoryB2CManagementClient: class {
              b2CTenants = {
                beginCreateAndWait: mocks.b2c_create,
                update: vi.fn(),
                beginDeleteAndWait: mocks.b2c_delete,
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

describe('Remaining B2 handlers — mocked-SDK smoke tests', () => {
  let stub: ReturnType<typeof setup_mocks>;
  beforeEach(() => {
    stub = setup_mocks();
  });
  afterEach(() => stub.restore());

  it('sql-server refuses without admin password', async () => {
    const d = await deployer();
    const out = await d.create('azure.sql.server', 'sql1', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/administrator_login/);
  });

  it('sql-server creates with administrator_login + password', async () => {
    const d = await deployer();
    const out = await d.create(
      'azure.sql.server',
      'sql1',
      { administrator_login: 'admin', administrator_login_password: 'P@ssw0rd!' },
      {},
    );
    expect(out.success).toBe(true);
    const [, , body] = stub.sql_create.mock.calls[0];
    expect(body.administratorLogin).toBe('admin');
    expect(body.version).toBe('12.0');
  });

  it('service-bus creates a Standard namespace by default', async () => {
    const d = await deployer();
    const out = await d.create('azure.servicebus.namespace', 'sb1', {}, {});
    expect(out.success).toBe(true);
    expect(stub.sb_create).toHaveBeenCalled();
  });

  it('log-analytics creates a workspace with PerGB2018 SKU + 30d retention by default', async () => {
    const d = await deployer();
    const out = await d.create('azure.monitor.logAnalytics', 'la1', {}, {});
    expect(out.success).toBe(true);
    expect(stub.la_create).toHaveBeenCalled();
  });

  it('app-insights creates a component (application_type=web by default)', async () => {
    const d = await deployer();
    const out = await d.create('azure.insights.appInsights', 'ai1', {}, {});
    expect(out.success).toBe(true);
    expect(stub.ai_create).toHaveBeenCalled();
  });

  it('entra-b2c creates a tenant via b2CTenants.beginCreateAndWait', async () => {
    const d = await deployer();
    const out = await d.create('azure.aadb2c.directory', 'b2c1', { display_name: 'IceB2C', country_code: 'US' }, {});
    expect(out.success).toBe(true);
    expect(stub.b2c_create).toHaveBeenCalled();
  });
});

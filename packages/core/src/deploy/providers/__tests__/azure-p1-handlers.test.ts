/**
 * Smoke tests for B2 P1 handlers: private-endpoint, dns-zone, aks, acr,
 * apim, front-door, app-gateway, waf. Each test verifies the handler
 * dispatches, calls the expected SDK method, and rejects malformed
 * inputs where applicable.
 *
 * Consolidated to reduce test-file overhead — every P1 handler shares
 * the same `setup_mocks` shape (Function-constructor stub + Azure SDK
 * mocks).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureDeployer } from '../azure-deployer';

function setup_mocks() {
  const mocks = {
    pe_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../privateEndpoints/pe1' }),
    pe_delete: vi.fn().mockResolvedValue(undefined),
    dns_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../dnszones/example.com' }),
    dns_delete: vi.fn().mockResolvedValue(undefined),
    aks_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../managedClusters/aks1' }),
    aks_delete: vi.fn().mockResolvedValue(undefined),
    acr_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../registries/acr1' }),
    acr_delete: vi.fn().mockResolvedValue(undefined),
    apim_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../service/apim1' }),
    apim_delete: vi.fn().mockResolvedValue(undefined),
    cdn_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../profiles/fd1' }),
    cdn_delete: vi.fn().mockResolvedValue(undefined),
    agw_create: vi.fn().mockResolvedValue({ id: '/subscriptions/sub/resourceGroups/rg/.../applicationGateways/agw1' }),
    agw_delete: vi.fn().mockResolvedValue(undefined),
    waf_createOrUpdate: vi.fn().mockResolvedValue({
      id: '/subscriptions/sub/resourceGroups/rg/.../webApplicationFirewallPolicies/waf1',
    }),
    waf_delete: vi.fn().mockResolvedValue(undefined),
  };

  const network = {
    NetworkManagementClient: class {
      virtualNetworks = { beginCreateOrUpdateAndWait: vi.fn(), updateTags: vi.fn(), beginDeleteAndWait: vi.fn() };
      subnets = { beginCreateOrUpdateAndWait: vi.fn(), beginDeleteAndWait: vi.fn() };
      networkSecurityGroups = { beginCreateOrUpdateAndWait: vi.fn(), updateTags: vi.fn(), beginDeleteAndWait: vi.fn() };
      privateEndpoints = {
        beginCreateOrUpdateAndWait: mocks.pe_create,
        updateTags: vi.fn(),
        beginDeleteAndWait: mocks.pe_delete,
      };
      applicationGateways = {
        beginCreateOrUpdateAndWait: mocks.agw_create,
        updateTags: vi.fn(),
        beginDeleteAndWait: mocks.agw_delete,
      };
      webApplicationFirewallPolicies = {
        createOrUpdate: mocks.waf_createOrUpdate,
        beginDeleteAndWait: mocks.waf_delete,
      };
    },
  };

  const original_function = globalThis.Function;
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return async (mod: string) => {
        if (mod === '@azure/identity') return { DefaultAzureCredential: class {} };
        if (mod === '@azure/arm-network') return network;
        if (mod === '@azure/arm-dns') {
          return {
            DnsManagementClient: class {
              zones = { createOrUpdate: mocks.dns_create, update: vi.fn(), beginDeleteAndWait: mocks.dns_delete };
            },
          };
        }
        if (mod === '@azure/arm-containerservice') {
          return {
            ContainerServiceClient: class {
              managedClusters = {
                beginCreateOrUpdateAndWait: mocks.aks_create,
                beginUpdateTagsAndWait: vi.fn(),
                beginDeleteAndWait: mocks.aks_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-containerregistry') {
          return {
            ContainerRegistryManagementClient: class {
              registries = {
                beginCreateAndWait: mocks.acr_create,
                beginUpdateAndWait: vi.fn(),
                beginDeleteAndWait: mocks.acr_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-apimanagement') {
          return {
            ApiManagementClient: class {
              apiManagementService = {
                beginCreateOrUpdateAndWait: mocks.apim_create,
                beginUpdateAndWait: vi.fn(),
                beginDeleteAndWait: mocks.apim_delete,
              };
            },
          };
        }
        if (mod === '@azure/arm-cdn') {
          return {
            CdnManagementClient: class {
              profiles = {
                beginCreateAndWait: mocks.cdn_create,
                beginUpdateAndWait: vi.fn(),
                beginDeleteAndWait: mocks.cdn_delete,
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

describe('B2 P1 handlers — dispatch + minimal success path', () => {
  let stub: ReturnType<typeof setup_mocks>;
  beforeEach(() => {
    stub = setup_mocks();
  });
  afterEach(() => stub.restore());

  it('private-endpoint refuses without subnet_id + target_id', async () => {
    const d = await deployer();
    const out = await d.create('azure.network.privateEndpoint', 'pe1', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/subnet_id/);
  });

  it('private-endpoint creates with wired subnet + target', async () => {
    const d = await deployer();
    const out = await d.create(
      'azure.network.privateEndpoint',
      'pe1',
      { subnet_id: '/sub/sn1', private_link_service_id: '/target/x', group_ids: ['blob'] },
      {},
    );
    expect(out.success).toBe(true);
    expect(stub.pe_create).toHaveBeenCalled();
  });

  it('dns-zone creates at location=global', async () => {
    const d = await deployer();
    const out = await d.create('azure.network.dnsZone', 'example.com', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.dns_create.mock.calls[0];
    expect(body.location).toBe('global');
  });

  it('aks creates with system-assigned identity', async () => {
    const d = await deployer();
    const out = await d.create('azure.containerservice.managedCluster', 'aks1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.aks_create.mock.calls[0];
    expect(body.identity.type).toBe('SystemAssigned');
    expect(body.agentPoolProfiles[0].count).toBe(1);
  });

  it('acr creates with Basic SKU by default', async () => {
    const d = await deployer();
    const out = await d.create('azure.containerregistry.registry', 'acr1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.acr_create.mock.calls[0];
    expect(body.sku.name).toBe('Basic');
    expect(body.adminUserEnabled).toBe(false);
  });

  it('apim creates with Developer tier by default', async () => {
    const d = await deployer();
    const out = await d.create('azure.apimanagement.service', 'apim1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.apim_create.mock.calls[0];
    expect(body.sku.name).toBe('Developer');
  });

  it('front-door creates at location=global with AzureFrontDoor SKU', async () => {
    const d = await deployer();
    const out = await d.create('azure.network.frontDoor', 'fd1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.cdn_create.mock.calls[0];
    expect(body.location).toBe('global');
    expect(body.sku.name).toBe('Standard_AzureFrontDoor');
  });

  it('app-gateway refuses without subnet_id', async () => {
    const d = await deployer();
    const out = await d.create('azure.network.applicationGateway', 'agw1', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/subnet_id/);
  });

  it('app-gateway creates with Standard_v2 SKU when subnet wired', async () => {
    const d = await deployer();
    const out = await d.create('azure.network.applicationGateway', 'agw1', { subnet_id: '/subs/sn1' }, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.agw_create.mock.calls[0];
    expect(body.sku.name).toBe('Standard_v2');
  });

  it('azure-waf creates with Detection mode and OWASP 3.2 by default', async () => {
    const d = await deployer();
    const out = await d.create('azure.network.webApplicationFirewallPolicy', 'waf1', {}, {});
    expect(out.success).toBe(true);
    const [, , body] = stub.waf_createOrUpdate.mock.calls[0];
    expect(body.policySettings.mode).toBe('Detection');
    expect(body.managedRules.managedRuleSets[0].ruleSetType).toBe('OWASP');
  });
});

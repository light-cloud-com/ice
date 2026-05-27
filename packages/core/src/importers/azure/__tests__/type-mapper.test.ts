/**
 * Tests for Azure type mapping helpers.
 *
 * These functions are pure — Azure resource type strings → ICE type strings,
 * Azure property objects → snake_case clones. No SDK dependence.
 */

import { describe, it, expect } from 'vitest';
import { get_ice_type, is_type_supported, get_supported_types, map_properties } from '../type-mapper';

describe('get_ice_type', () => {
  // The TYPE_MAP table is the source of truth for "supported" Azure types.
  // We assert one entry per service category so a future rename trips the test.
  const explicit_mappings: Array<[string, string]> = [
    // Compute
    ['microsoft.compute/virtualmachines', 'azure.compute.virtual_machine'],
    ['microsoft.compute/disks', 'azure.compute.disk'],
    ['microsoft.compute/images', 'azure.compute.image'],
    ['microsoft.compute/snapshots', 'azure.compute.snapshot'],
    ['microsoft.compute/availabilitysets', 'azure.compute.availability_set'],
    ['microsoft.compute/virtualmachinescalesets', 'azure.compute.scale_set'],
    // Network — aligned with deployer's camelCase keys after B2 P1 landed.
    ['microsoft.network/virtualnetworks', 'azure.network.virtualNetwork'],
    ['microsoft.network/subnets', 'azure.network.subnet'],
    ['microsoft.network/networksecuritygroups', 'azure.network.networkSecurityGroup'],
    ['microsoft.network/networkinterfaces', 'azure.network.interface'],
    ['microsoft.network/publicipaddresses', 'azure.network.public_ip'],
    ['microsoft.network/loadbalancers', 'azure.network.load_balancer'],
    ['microsoft.network/applicationgateways', 'azure.network.applicationGateway'],
    ['microsoft.network/virtualnetworkgateways', 'azure.network.vnet_gateway'],
    ['microsoft.network/dnszones', 'azure.network.dnsZone'],
    ['microsoft.network/privatednszones', 'azure.network.private_dns_zone'],
    ['microsoft.network/frontdoors', 'azure.network.frontDoor'],
    ['microsoft.network/privateendpoints', 'azure.network.privateEndpoint'],
    ['microsoft.network/webapplicationfirewallpolicies', 'azure.network.webApplicationFirewallPolicy'],
    // Storage
    ['microsoft.storage/storageaccounts', 'azure.storage.account'],
    ['microsoft.storage/storageaccounts/blobservices/containers', 'azure.storage.container'],
    // Web / App Service — aligned with deployer's camelCase keys.
    ['microsoft.web/sites', 'azure.web.app'],
    ['microsoft.web/serverfarms', 'azure.web.appServicePlan'],
    // findings.md #11 — TYPE_MAP key was lowercased so it round-trips
    // through `get_ice_type`'s lowercase normalization. Both input
    // shapes now resolve to the intended iceType.
    ['microsoft.web/staticsites', 'azure.web.staticSite'],
    // Databases — flex-server keys match deployer prefixes.
    ['microsoft.sql/servers', 'azure.sql.server'],
    ['microsoft.sql/servers/databases', 'azure.sql.database'],
    ['microsoft.documentdb/databaseaccounts', 'azure.cosmosdb.account'],
    ['microsoft.dbforpostgresql/servers', 'azure.postgresqlflex.server'],
    ['microsoft.dbforpostgresql/flexibleservers', 'azure.postgresqlflex.server'],
    ['microsoft.dbformysql/servers', 'azure.mysqlflex.server'],
    ['microsoft.dbformysql/flexibleservers', 'azure.mysqlflex.server'],
    ['microsoft.cache/redis', 'azure.cache.redis'],
    // Containers — aligned with deployer prefixes.
    ['microsoft.containerservice/managedclusters', 'azure.containerservice.managedCluster'],
    ['microsoft.containerregistry/registries', 'azure.containerregistry.registry'],
    ['microsoft.containerinstance/containergroups', 'azure.aci.container_group'],
    ['microsoft.app/containerapps', 'azure.containerapps.app'],
    // Serverless — aligned with deployer.
    ['microsoft.web/sites/functions', 'azure.web.functionApp'],
    // Messaging
    ['microsoft.servicebus/namespaces', 'azure.servicebus.namespace'],
    ['microsoft.eventhub/namespaces', 'azure.eventhub.namespace'],
    ['microsoft.eventgrid/topics', 'azure.eventgrid.topic'],
    // Identity — aligned with deployer's aadb2c key.
    ['microsoft.managedidentity/userassignedidentities', 'azure.identity.user_assigned'],
    ['microsoft.azureactivedirectory/b2cdirectories', 'azure.aadb2c.directory'],
    // Key Vault
    ['microsoft.keyvault/vaults', 'azure.keyvault.vault'],
    // Monitor — aligned with deployer's camelCase keys.
    ['microsoft.insights/components', 'azure.insights.appInsights'],
    ['microsoft.operationalinsights/workspaces', 'azure.monitor.logAnalytics'],
    ['microsoft.insights/actiongroups', 'azure.monitor.action_group'],
    ['microsoft.insights/metricalerts', 'azure.monitor.metric_alert'],
    // Resource Management
    ['microsoft.resources/resourcegroups', 'azure.resources.resource_group'],
    // API Management — aligned with deployer prefix.
    ['microsoft.apimanagement/service', 'azure.apimanagement.service'],
    // CDN — Profiles back Front Door (Standard/Premium AFD profile lives under microsoft.cdn).
    ['microsoft.cdn/profiles', 'azure.network.frontDoor'],
    // Logic Apps
    ['microsoft.logic/workflows', 'azure.logic.workflow'],
    // Data Factory
    ['microsoft.datafactory/factories', 'azure.datafactory.factory'],
    // Synapse / Data Explorer
    ['microsoft.synapse/workspaces', 'azure.synapse.workspace'],
    ['microsoft.kusto/clusters', 'azure.kusto.cluster'],
    // Machine Learning / Cognitive (OpenAI is a Cognitive Services kind).
    ['microsoft.machinelearningservices/workspaces', 'azure.machinelearning.workspace'],
    ['microsoft.cognitiveservices/accounts', 'azure.cognitiveservices.account'],
    // Search (backs Analytics.Search + AI.VectorDB).
    ['microsoft.search/searchservices', 'azure.search.service'],
  ];

  for (const [azure_type, ice_type] of explicit_mappings) {
    it(`maps ${azure_type} to ${ice_type}`, () => {
      expect(get_ice_type(azure_type)).toBe(ice_type);
    });
  }

  it('lowercases the input before lookup so PascalCase Azure types still match', () => {
    expect(get_ice_type('Microsoft.Compute/virtualMachines')).toBe('azure.compute.virtual_machine');
    expect(get_ice_type('MICROSOFT.WEB/SITES')).toBe('azure.web.app');
  });

  it('falls back to a derived ICE type when the Azure type is unmapped but well-formed', () => {
    expect(get_ice_type('Microsoft.Custom/widgets')).toBe('azure.custom.widgets');
  });

  it('joins multi-segment unmapped types with underscores', () => {
    expect(get_ice_type('Microsoft.Foo/bars/bazs')).toBe('azure.foo.bars_bazs');
  });

  it('returns an azure.unknown.* sentinel when the type has no slash', () => {
    expect(get_ice_type('garbage')).toBe('azure.unknown.garbage');
  });

  it('replaces dots and slashes in the unknown sentinel', () => {
    // Single-segment input with neither slash nor microsoft. prefix.
    expect(get_ice_type('weird.thing')).toBe('azure.unknown.weird_thing');
  });

  // findings.md #11 — `'microsoft.web/staticSites'` (capital S) used to
  // be dead code because get_ice_type lowercased the input before lookup.
  // The TYPE_MAP key is now lowercase so both `Microsoft.Web/staticSites`
  // and `microsoft.web/staticsites` resolve to `azure.web.staticSite`.
  it('routes Microsoft.Web/staticSites to azure.web.staticSite (case-insensitive)', () => {
    expect(get_ice_type('Microsoft.Web/staticSites')).toBe('azure.web.staticSite');
    expect(is_type_supported('Microsoft.Web/staticSites')).toBe(true);
  });
});

describe('is_type_supported', () => {
  it('returns true for a known mapping', () => {
    expect(is_type_supported('Microsoft.Compute/virtualMachines')).toBe(true);
  });

  it('returns true regardless of input casing', () => {
    expect(is_type_supported('microsoft.web/sites')).toBe(true);
    expect(is_type_supported('MICROSOFT.SQL/SERVERS')).toBe(true);
  });

  it('returns false for an unmapped type', () => {
    expect(is_type_supported('Microsoft.Unknown/thing')).toBe(false);
  });

  it('returns false for a malformed type', () => {
    expect(is_type_supported('not-a-real-type')).toBe(false);
  });
});

describe('get_supported_types', () => {
  it('returns the full key set of the type map', () => {
    const types = get_supported_types();
    expect(types).toContain('microsoft.compute/virtualmachines');
    expect(types).toContain('microsoft.keyvault/vaults');
    expect(types).toContain('microsoft.machinelearningservices/workspaces');
  });

  it('returns at least one entry per service category', () => {
    const types = get_supported_types();
    expect(types.length).toBeGreaterThan(40);
  });
});

describe('map_properties', () => {
  it('rewrites camelCase keys to snake_case', () => {
    expect(map_properties('Microsoft.Compute/virtualMachines', { vmSize: 'Standard_D2s_v3' })).toEqual({
      vm_size: 'Standard_D2s_v3',
    });
  });

  it('rewrites PascalCase keys to snake_case', () => {
    expect(map_properties('Microsoft.Web/sites', { HostName: 'example.com' })).toEqual({
      host_name: 'example.com',
    });
  });

  it('strips a leading underscore introduced by a leading capital', () => {
    expect(map_properties('Microsoft.Web/sites', { Name: 'a' })).toEqual({ name: 'a' });
  });

  it('preserves an already snake_case key', () => {
    expect(map_properties('Microsoft.Web/sites', { already_snake: true })).toEqual({
      already_snake: true,
    });
  });

  it('keeps non-string values intact (numbers, arrays, nested objects)', () => {
    expect(
      map_properties('Microsoft.Web/sites', {
        replicaCount: 3,
        addresses: ['10.0.0.1'],
        nested: { sub: 1 },
      }),
    ).toEqual({
      replica_count: 3,
      addresses: ['10.0.0.1'],
      nested: { sub: 1 },
    });
  });

  it('returns an empty object when properties is empty', () => {
    expect(map_properties('Microsoft.Web/sites', {})).toEqual({});
  });

  it('does not consult the azure_type argument', () => {
    // Currently a placeholder — included for future per-type remapping.
    expect(map_properties('totally-bogus-type', { keyOne: 1 })).toEqual({ key_one: 1 });
  });
});

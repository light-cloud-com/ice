/**
 * Azure Type Mapper
 *
 * Maps Azure resource types to ICE unified types.
 */

/**
 * Mapping from Azure resource types to ICE types.
 * Azure types are in format: Microsoft.Service/resourceType
 */
const TYPE_MAP: Record<string, string> = {
  // Compute — virtual_machine kept with underscore for back-compat with
  // the legacy monolith. Other compute keys land outside the dispatch
  // regex (auxiliary resources the deployer doesn't manage).
  'microsoft.compute/virtualmachines': 'azure.compute.virtual_machine',
  'microsoft.compute/disks': 'azure.compute.disk',
  'microsoft.compute/images': 'azure.compute.image',
  'microsoft.compute/snapshots': 'azure.compute.snapshot',
  'microsoft.compute/availabilitysets': 'azure.compute.availability_set',
  'microsoft.compute/virtualmachinescalesets': 'azure.compute.scale_set',

  // Network — aligned with the camelCase keys used by the deployer
  // (azure.network.virtualNetwork / .subnet / .networkSecurityGroup /
  // .privateEndpoint / .dnsZone / .applicationGateway / .frontDoor /
  // .webApplicationFirewallPolicy).
  'microsoft.network/virtualnetworks': 'azure.network.virtualNetwork',
  'microsoft.network/subnets': 'azure.network.subnet',
  'microsoft.network/networksecuritygroups': 'azure.network.networkSecurityGroup',
  'microsoft.network/networkinterfaces': 'azure.network.interface',
  'microsoft.network/publicipaddresses': 'azure.network.public_ip',
  'microsoft.network/loadbalancers': 'azure.network.load_balancer',
  'microsoft.network/applicationgateways': 'azure.network.applicationGateway',
  'microsoft.network/virtualnetworkgateways': 'azure.network.vnet_gateway',
  'microsoft.network/dnszones': 'azure.network.dnsZone',
  'microsoft.network/privatednszones': 'azure.network.private_dns_zone',
  'microsoft.network/privateendpoints': 'azure.network.privateEndpoint',
  'microsoft.network/frontdoors': 'azure.network.frontDoor',
  'microsoft.cdn/profiles': 'azure.network.frontDoor',
  'microsoft.network/webapplicationfirewallpolicies': 'azure.network.webApplicationFirewallPolicy',

  // Storage
  'microsoft.storage/storageaccounts': 'azure.storage.account',
  'microsoft.storage/storageaccounts/blobservices/containers': 'azure.storage.container',

  // Web / App Service — aligned with deployer's camelCase keys.
  'microsoft.web/sites': 'azure.web.app',
  'microsoft.web/serverfarms': 'azure.web.appServicePlan',
  'microsoft.web/staticsites': 'azure.web.staticSite',

  // Databases — aligned with deployer's flex-server + cache keys.
  'microsoft.sql/servers': 'azure.sql.server',
  'microsoft.sql/servers/databases': 'azure.sql.database',
  'microsoft.documentdb/databaseaccounts': 'azure.cosmosdb.account',
  'microsoft.dbforpostgresql/servers': 'azure.postgresqlflex.server',
  'microsoft.dbforpostgresql/flexibleservers': 'azure.postgresqlflex.server',
  'microsoft.dbformysql/servers': 'azure.mysqlflex.server',
  'microsoft.dbformysql/flexibleservers': 'azure.mysqlflex.server',
  'microsoft.cache/redis': 'azure.cache.redis',

  // Containers — aligned with deployer keys.
  'microsoft.containerservice/managedclusters': 'azure.containerservice.managedCluster',
  'microsoft.containerregistry/registries': 'azure.containerregistry.registry',
  'microsoft.containerinstance/containergroups': 'azure.aci.container_group',
  'microsoft.app/containerapps': 'azure.containerapps.app',

  // Serverless — aligned with deployer keys.
  'microsoft.web/sites/functions': 'azure.web.functionApp',

  // Messaging
  'microsoft.servicebus/namespaces': 'azure.servicebus.namespace',
  'microsoft.eventhub/namespaces': 'azure.eventhub.namespace',
  'microsoft.eventgrid/topics': 'azure.eventgrid.topic',

  // Identity
  'microsoft.managedidentity/userassignedidentities': 'azure.identity.user_assigned',
  'microsoft.azureactivedirectory/b2cdirectories': 'azure.aadb2c.directory',

  // Key Vault
  'microsoft.keyvault/vaults': 'azure.keyvault.vault',

  // Monitor — aligned with deployer's camelCase keys.
  'microsoft.insights/components': 'azure.insights.appInsights',
  'microsoft.operationalinsights/workspaces': 'azure.monitor.logAnalytics',
  'microsoft.insights/actiongroups': 'azure.monitor.action_group',
  'microsoft.insights/metricalerts': 'azure.monitor.metric_alert',

  // Resource Management
  'microsoft.resources/resourcegroups': 'azure.resources.resource_group',

  // API Management — aligned with deployer prefix.
  'microsoft.apimanagement/service': 'azure.apimanagement.service',

  // Logic Apps
  'microsoft.logic/workflows': 'azure.logic.workflow',

  // Data Factory
  'microsoft.datafactory/factories': 'azure.datafactory.factory',

  // Synapse / Data Explorer
  'microsoft.synapse/workspaces': 'azure.synapse.workspace',
  'microsoft.kusto/clusters': 'azure.kusto.cluster',

  // Machine Learning + Cognitive (OpenAI is a Cognitive Services kind).
  'microsoft.machinelearningservices/workspaces': 'azure.machinelearning.workspace',
  'microsoft.cognitiveservices/accounts': 'azure.cognitiveservices.account',

  // Search (backs both Analytics.Search and AI.VectorDB).
  'microsoft.search/searchservices': 'azure.search.service',
};

/**
 * Get the ICE type for an Azure resource type.
 */
export function get_ice_type(azure_type: string): string {
  const normalized = azure_type.toLowerCase();
  const mapped = TYPE_MAP[normalized];

  if (mapped) {
    return mapped;
  }

  // Fallback: convert Azure type to ICE type format
  // e.g., "Microsoft.Compute/virtualMachines" -> "azure.compute.virtualmachines"
  const parts = normalized.replace('microsoft.', '').split('/');
  if (parts.length >= 2) {
    const service = parts[0];
    const resource = parts.slice(1).join('_').toLowerCase();
    return `azure.${service}.${resource}`;
  }

  return `azure.unknown.${normalized.replace(/[/.]/g, '_')}`;
}

/**
 * Check if an Azure type is supported (has explicit mapping).
 */
export function is_type_supported(azure_type: string): boolean {
  return azure_type.toLowerCase() in TYPE_MAP;
}

/**
 * Get all supported Azure types.
 */
export function get_supported_types(): string[] {
  return Object.keys(TYPE_MAP);
}

/**
 * Map Azure properties to ICE properties (snake_case).
 */
export function map_properties(azure_type: string, properties: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    // Convert camelCase/PascalCase to snake_case
    const ice_key = key
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');

    result[ice_key] = value;
  }

  return result;
}

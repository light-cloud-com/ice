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
  // Compute
  'microsoft.compute/virtualmachines': 'azure.compute.virtual_machine',
  'microsoft.compute/disks': 'azure.compute.disk',
  'microsoft.compute/images': 'azure.compute.image',
  'microsoft.compute/snapshots': 'azure.compute.snapshot',
  'microsoft.compute/availabilitysets': 'azure.compute.availability_set',
  'microsoft.compute/virtualmachinescalesets': 'azure.compute.scale_set',

  // Network
  'microsoft.network/virtualnetworks': 'azure.network.virtual_network',
  'microsoft.network/subnets': 'azure.network.subnet',
  'microsoft.network/networksecuritygroups': 'azure.network.security_group',
  'microsoft.network/networkinterfaces': 'azure.network.interface',
  'microsoft.network/publicipaddresses': 'azure.network.public_ip',
  'microsoft.network/loadbalancers': 'azure.network.load_balancer',
  'microsoft.network/applicationgateways': 'azure.network.app_gateway',
  'microsoft.network/virtualnetworkgateways': 'azure.network.vnet_gateway',
  'microsoft.network/dnszones': 'azure.network.dns_zone',
  'microsoft.network/privatednszones': 'azure.network.private_dns_zone',
  'microsoft.network/frontdoors': 'azure.network.front_door',

  // Storage
  'microsoft.storage/storageaccounts': 'azure.storage.account',
  'microsoft.storage/storageaccounts/blobservices/containers': 'azure.storage.container',

  // Web / App Service
  'microsoft.web/sites': 'azure.web.app',
  'microsoft.web/serverfarms': 'azure.web.app_service_plan',
  // Key must be all-lowercase: `get_ice_type` lowercases input before lookup.
  // The previous capital-S key was dead — Microsoft.Web/staticSites fell
  // through to the synthesized `azure.web.staticsites` fallback. See
  // findings.md #11.
  'microsoft.web/staticsites': 'azure.web.static_site',

  // Databases
  'microsoft.sql/servers': 'azure.sql.server',
  'microsoft.sql/servers/databases': 'azure.sql.database',
  'microsoft.documentdb/databaseaccounts': 'azure.cosmosdb.account',
  'microsoft.dbforpostgresql/servers': 'azure.postgresql.server',
  'microsoft.dbformysql/servers': 'azure.mysql.server',
  'microsoft.cache/redis': 'azure.redis.cache',

  // Containers
  'microsoft.containerservice/managedclusters': 'azure.aks.cluster',
  'microsoft.containerregistry/registries': 'azure.acr.registry',
  'microsoft.containerinstance/containergroups': 'azure.aci.container_group',

  // Serverless
  'microsoft.web/sites/functions': 'azure.functions.function',

  // Messaging
  'microsoft.servicebus/namespaces': 'azure.servicebus.namespace',
  'microsoft.eventhub/namespaces': 'azure.eventhub.namespace',
  'microsoft.eventgrid/topics': 'azure.eventgrid.topic',

  // Identity
  'microsoft.managedidentity/userassignedidentities': 'azure.identity.user_assigned',

  // Key Vault
  'microsoft.keyvault/vaults': 'azure.keyvault.vault',

  // Monitor
  'microsoft.insights/components': 'azure.insights.app_insights',
  'microsoft.operationalinsights/workspaces': 'azure.monitor.log_analytics',
  'microsoft.insights/actiongroups': 'azure.monitor.action_group',
  'microsoft.insights/metricalerts': 'azure.monitor.metric_alert',

  // Resource Management
  'microsoft.resources/resourcegroups': 'azure.resources.resource_group',

  // API Management
  'microsoft.apimanagement/service': 'azure.apim.service',

  // CDN
  'microsoft.cdn/profiles': 'azure.cdn.profile',
  'microsoft.cdn/profiles/endpoints': 'azure.cdn.endpoint',

  // Logic Apps
  'microsoft.logic/workflows': 'azure.logic.workflow',

  // Data Factory
  'microsoft.datafactory/factories': 'azure.datafactory.factory',

  // Synapse
  'microsoft.synapse/workspaces': 'azure.synapse.workspace',

  // Machine Learning
  'microsoft.machinelearningservices/workspaces': 'azure.ml.workspace',
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

/**
 * Azure Deployer — Modular Dispatcher
 *
 * Routes create/update/delete calls to per-service handler modules.
 * Replaces the monolithic `../azure-deployer.ts` (kept as a
 * back-compat shim). Same dispatch shape AWS + GCP use:
 *   - HANDLER_REGISTRY is the single declarative source of truth
 *     for "which handler runs for which resource type".
 *   - The dispatcher iterates it generically — no per-type `if`
 *     branches.
 *
 * Adding a new Azure service = drop a handler under `handlers/<svc>.ts`
 * and add one entry to HANDLER_REGISTRY.
 */

import { acr_handler } from './handlers/acr';
import { acr_task_handler } from './handlers/acr-task';
import { aks_handler } from './handlers/aks';
import { apim_handler } from './handlers/apim';
import { app_gateway_handler } from './handlers/app-gateway';
import { app_insights_handler } from './handlers/app-insights';
import { app_service_plan_handler } from './handlers/app-service';
import { azure_ml_handler } from './handlers/azure-ml';
import { azure_openai_handler } from './handlers/azure-openai';
import { azure_waf_handler } from './handlers/azure-waf';
import { cognitive_search_handler } from './handlers/cognitive-search';
import { container_apps_handler } from './handlers/container-apps';
import { cosmosdb_handler } from './handlers/cosmosdb';
import { data_explorer_handler } from './handlers/data-explorer';
import { dns_zone_handler } from './handlers/dns-zone';
import { entra_b2c_handler } from './handlers/entra-b2c';
import { event_grid_handler } from './handlers/event-grid';
import { event_hubs_handler } from './handlers/event-hubs';
import { front_door_handler } from './handlers/front-door';
import { functions_handler } from './handlers/functions';
import { key_vault_handler } from './handlers/key-vault';
import { log_analytics_handler } from './handlers/log-analytics';
import { logic_apps_handler } from './handlers/logic-apps';
import { mysql_flex_handler } from './handlers/mysql-flex';
import { nsg_handler } from './handlers/nsg';
import { postgresql_flex_handler } from './handlers/postgresql-flex';
import { private_endpoint_handler } from './handlers/private-endpoint';
import { redis_cache_handler } from './handlers/redis-cache';
import { service_bus_handler } from './handlers/service-bus';
import { sql_server_handler } from './handlers/sql-database';
import { static_web_apps_handler } from './handlers/static-web-apps';
import { storage_account_handler } from './handlers/storage-account';
import { subnet_handler } from './handlers/subnet';
import { synapse_handler } from './handlers/synapse';
import { virtual_machine_handler } from './handlers/virtual-machine';
import { vnet_handler } from './handlers/vnet';
import { web_app_handler } from './handlers/web-app';
import { initialize_azure_clients } from './sdk-loader';
import type { AzureHandlerContext, AzureResourceHandler } from './types';
import type { DeployOptions, ProviderDeployer, ResourceDeployResult } from '../../types';

// =============================================================================
// Handler registry
// =============================================================================

const HANDLER_REGISTRY: Array<{ prefix: string; handler: AzureResourceHandler }> = [
  // More-specific azure.web.* prefixes must precede `azure.web.app`.
  { prefix: 'azure.compute.virtual_machine', handler: virtual_machine_handler },
  { prefix: 'azure.storage.account', handler: storage_account_handler },
  { prefix: 'azure.web.appServicePlan', handler: app_service_plan_handler },
  { prefix: 'azure.web.functionApp', handler: functions_handler },
  { prefix: 'azure.web.staticSite', handler: static_web_apps_handler },
  { prefix: 'azure.web.app', handler: web_app_handler },
  { prefix: 'azure.keyvault.vault', handler: key_vault_handler },
  { prefix: 'azure.servicebus.namespace', handler: service_bus_handler },
  { prefix: 'azure.monitor.logAnalytics', handler: log_analytics_handler },
  { prefix: 'azure.insights.appInsights', handler: app_insights_handler },
  { prefix: 'azure.containerapps.app', handler: container_apps_handler },
  { prefix: 'azure.cosmosdb.account', handler: cosmosdb_handler },
  { prefix: 'azure.postgresqlflex.server', handler: postgresql_flex_handler },
  { prefix: 'azure.mysqlflex.server', handler: mysql_flex_handler },
  { prefix: 'azure.cache.redis', handler: redis_cache_handler },
  // Network primitives — order matters; more-specific prefixes first.
  { prefix: 'azure.network.virtualNetwork', handler: vnet_handler },
  { prefix: 'azure.network.subnet', handler: subnet_handler },
  { prefix: 'azure.network.networkSecurityGroup', handler: nsg_handler },
  { prefix: 'azure.network.privateEndpoint', handler: private_endpoint_handler },
  { prefix: 'azure.network.dnsZone', handler: dns_zone_handler },
  { prefix: 'azure.network.applicationGateway', handler: app_gateway_handler },
  { prefix: 'azure.network.frontDoor', handler: front_door_handler },
  { prefix: 'azure.network.webApplicationFirewallPolicy', handler: azure_waf_handler },
  { prefix: 'azure.apimanagement.service', handler: apim_handler },
  { prefix: 'azure.containerservice.managedCluster', handler: aks_handler },
  // ACR Task must precede registry (more-specific prefix).
  { prefix: 'azure.containerregistry.task', handler: acr_task_handler },
  { prefix: 'azure.containerregistry.registry', handler: acr_handler },
  // P2 long-tail.
  { prefix: 'azure.logic.workflow', handler: logic_apps_handler },
  { prefix: 'azure.eventgrid.topic', handler: event_grid_handler },
  { prefix: 'azure.eventhub.namespace', handler: event_hubs_handler },
  { prefix: 'azure.search.service', handler: cognitive_search_handler },
  { prefix: 'azure.cognitiveservices.account', handler: azure_openai_handler },
  { prefix: 'azure.machinelearning.workspace', handler: azure_ml_handler },
  { prefix: 'azure.synapse.workspace', handler: synapse_handler },
  { prefix: 'azure.kusto.cluster', handler: data_explorer_handler },
  { prefix: 'azure.aadb2c.directory', handler: entra_b2c_handler },
  { prefix: 'azure.sql.server', handler: sql_server_handler },
];
// Note: azure.web.staticSite is registered above with the other
// azure.web.* entries — its prefix is more specific than azure.web.app
// so registration order matters.

function resolve_handler(type: string): AzureResourceHandler | undefined {
  for (const entry of HANDLER_REGISTRY) {
    if (type.startsWith(entry.prefix)) return entry.handler;
  }
  return undefined;
}

function unsupported(
  name: string,
  type: string,
  action: 'create' | 'update' | 'delete',
  start: number,
): ResourceDeployResult {
  const phrase = action === 'create' ? 'creation' : action === 'delete' ? 'deletion' : 'update';
  return {
    resource_id: name,
    name,
    type,
    action,
    success: false,
    error: `Unsupported resource type for ${phrase}: ${type}`,
    duration_ms: Date.now() - start,
  };
}

// =============================================================================
// AzureDeployer class
// =============================================================================

const DEFAULT_LOCATION = 'eastus';
const DEFAULT_RESOURCE_GROUP_PREFIX = 'ice';

export class AzureDeployer implements ProviderDeployer {
  provider = 'azure';

  private ctx: AzureHandlerContext = {
    subscription_id: '',
    location: DEFAULT_LOCATION,
    // Default to '' (not `ice-default`) for back-compat with the
    // legacy monolith — its `extract_resource_group` returned the
    // empty string when the provider_id didn't carry a /resourceGroups/
    // segment. Operator-supplied via DeployOptions.resource_groups[0].
    resource_group: '',
    clients: new Map(),
    credential: null,
  };

  async initialize(options: DeployOptions): Promise<void> {
    // Accept zero-subscription init for back-compat with the legacy
    // monolith's tests; SDK calls fail later with a clearer error
    // if the handlers actually try to deploy.
    const subscription_id = options.subscriptions?.[0] ?? '';
    const resource_group = options.resource_groups?.[0] ?? '';
    const location = options.regions?.[0] ?? DEFAULT_LOCATION;

    try {
      const { credential, clients } = await initialize_azure_clients(subscription_id);
      this.ctx = {
        subscription_id,
        location,
        resource_group,
        clients,
        credential,
        on_log: options.on_log,
        on_step: options.on_progress
          ? (resource, step) => options.on_progress?.(resource, 'running', 'in-progress', { step })
          : undefined,
      };
    } catch (error) {
      throw new Error(`Failed to initialize Azure SDK: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }

  async cleanup(): Promise<void> {
    // Azure ARM clients don't expose a destroy hook today; nothing to release.
  }

  async create(
    type: string,
    name: string,
    properties: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();
    const handler = resolve_handler(type);
    if (!handler) return unsupported(name, type, 'create', start);
    const result = await handler.create(name, properties, this.ctx);
    return { ...result, type };
  }

  async update(
    type: string,
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();
    const handler = resolve_handler(type);
    if (!handler) return unsupported(name, type, 'update', start);
    const result = await handler.update(name, provider_id, properties, current_properties, this.ctx);
    return { ...result, type };
  }

  async delete(
    type: string,
    name: string,
    provider_id: string,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();
    const handler = resolve_handler(type);
    if (!handler) return unsupported(name, type, 'delete', start);
    const result = await handler.delete(name, provider_id, this.ctx);
    return { ...result, type };
  }
}

export function create_azure_deployer(): AzureDeployer {
  return new AzureDeployer();
}

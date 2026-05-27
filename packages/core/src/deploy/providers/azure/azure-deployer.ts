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

import { key_vault_handler } from './handlers/key-vault';
import { service_bus_handler } from './handlers/service-bus';
import { storage_account_handler } from './handlers/storage-account';
import { virtual_machine_handler } from './handlers/virtual-machine';
import { web_app_handler } from './handlers/web-app';
import { initialize_azure_clients } from './sdk-loader';
import type { AzureHandlerContext, AzureResourceHandler } from './types';
import type { DeployOptions, ProviderDeployer, ResourceDeployResult } from '../../types';

// =============================================================================
// Handler registry
// =============================================================================

const HANDLER_REGISTRY: Array<{ prefix: string; handler: AzureResourceHandler }> = [
  { prefix: 'azure.compute.virtual_machine', handler: virtual_machine_handler },
  { prefix: 'azure.storage.account', handler: storage_account_handler },
  { prefix: 'azure.web.app', handler: web_app_handler },
  { prefix: 'azure.keyvault.vault', handler: key_vault_handler },
  { prefix: 'azure.servicebus.namespace', handler: service_bus_handler },
];

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

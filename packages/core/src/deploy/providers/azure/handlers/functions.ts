/**
 * Azure Functions handler — `azure.web.functionApp`.
 *
 * Backs Compute.ServerlessFunction on Azure. Azure Functions run as a
 * Function App which is a kind of Web App. Operator wires:
 *   - properties.storage_account_id (Function Apps require a storage
 *     account; auto-bootstrap below creates one if missing)
 *   - properties.app_service_plan_id (Consumption plan or App Service
 *     Plan)
 *   - properties.runtime (node, dotnet, python, java)
 *
 * The handler defaults to Consumption (pay-per-execution) when no
 * app_service_plan_id is supplied.
 *
 * B4 quirk: when properties.storage_account_id is absent, the handler
 * auto-bootstraps `iceFn{name}sa` in the deploy resource group. The
 * sanitiser mirrors the storage-account name constraint (3-24
 * lowercase alphanumeric).
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureHandlerContext, AzureResourceHandler } from '../types';

const TYPE = 'azure.web.functionApp';
const SDK = '@azure/arm-appservice';

/**
 * Auto-bootstrap a Storage Account for a Function App when the canvas
 * didn't wire one. Reuses the existing one if it already exists.
 * Returns the resource ID of the storage account.
 */
async function ensure_function_storage(
  ctx: AzureHandlerContext,
  resource_group: string,
  function_name: string,
): Promise<string> {
  const client = ctx.clients.get('storage') as any;
  if (!client)
    throw new Error('Storage SDK not available — install @azure/arm-storage for Function App auto-bootstrap');
  // Storage names must be 3-24 lowercase alphanumeric. Derive a
  // deterministic name from the function name so re-deploys hit the
  // same account.
  const base = `icefn${function_name}sa`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
  try {
    const existing = await client.storageAccounts.getProperties(resource_group, base);
    if (existing?.id) return existing.id;
  } catch {
    // not found — create below
  }
  ctx.on_log?.(`Auto-bootstrapping Storage Account ${base} for Function App ${function_name}`);
  const created = await client.storageAccounts.beginCreateAndWait(resource_group, base, {
    location: ctx.location,
    sku: { name: 'Standard_LRS' },
    kind: 'StorageV2',
  });
  return created?.id ?? '';
}

export const functions_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('web') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Web', SDK);

    let storageAccountId = properties.storage_account_id as string | undefined;
    const resource_group = (properties.resource_group as string) || ctx.resource_group;
    if (!storageAccountId) {
      try {
        storageAccountId = await ensure_function_storage(ctx, resource_group, name);
      } catch (e) {
        return err(name, TYPE, 'create', start, e instanceof Error ? e.message : String(e));
      }
    }

    try {
      const location = (properties.location as string) || ctx.location;
      const runtime = (properties.runtime as string) || 'node';
      const linuxFxVersion = (properties.linux_fx_version as string) || `${runtime.toUpperCase()}|20`;

      const result = await client.webApps.beginCreateOrUpdateAndWait(resource_group, name, {
        location,
        kind: 'functionapp,linux',
        serverFarmId: properties.app_service_plan_id as string | undefined,
        reserved: true,
        siteConfig: {
          linuxFxVersion,
          appSettings: [
            { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' },
            { name: 'FUNCTIONS_WORKER_RUNTIME', value: runtime },
            { name: 'AzureWebJobsStorage', value: properties.storage_connection_string as string },
            ...Object.entries((properties.app_settings as Record<string, string>) || {}).map(([n, value]) => ({
              name: n,
              value,
            })),
          ],
        },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('web') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Web SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.webApps.update(resource_group, name, {
        siteConfig: {
          appSettings: properties.app_settings
            ? Object.entries(properties.app_settings as Record<string, string>).map(([n, value]) => ({
                name: n,
                value,
              }))
            : undefined,
        },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('web') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Web SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.webApps.delete(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

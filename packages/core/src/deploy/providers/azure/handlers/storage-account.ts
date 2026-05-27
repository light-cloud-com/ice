/**
 * Azure Storage Account handler — `azure.storage.account`.
 *
 * Migrated from the legacy monolith. Auto-resource-group support
 * added; everything else is unchanged.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.storage.account';
const SDK = '@azure/arm-storage';

export const storage_account_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('storage') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Storage', SDK);

    try {
      const location = (properties.location as string) || ctx.location;
      const sku = (properties.sku as string) || 'Standard_LRS';
      const resource_group = (properties.resource_group as string) || ctx.resource_group;

      const result = await client.storageAccounts.beginCreateAndWait(resource_group, name, {
        location,
        sku: { name: sku },
        kind: (properties.kind as string) || 'StorageV2',
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('storage') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Storage SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.storageAccounts.update(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('storage') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Storage SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.storageAccounts.delete(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

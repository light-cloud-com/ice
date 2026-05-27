/**
 * Azure MySQL Flexible Server handler — `azure.mysqlflex.server`.
 *
 * Backs Database.MySQL on Azure. Burstable B1s is the default SKU —
 * cheapest tier suitable for dev / staging. Password-required contract
 * mirrors RDS / DocDB / Redshift on AWS.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.mysqlflex.server';
const SDK = '@azure/arm-mysql-flexible';

export const mysql_flex_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('mysql-flex') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'MySQL Flexible Server', SDK);

    if (!properties.administrator_login || !properties.administrator_login_password) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'MySQL Flexible Server requires administrator_login + administrator_login_password (wire a Security.Secret or set explicitly).',
      );
    }

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const location = (properties.location as string) || ctx.location;

      const result = await client.servers.beginCreateAndWait(resource_group, name, {
        location,
        sku: {
          name: (properties.sku_name as string) || 'Standard_B1s',
          tier: (properties.sku_tier as string) || 'Burstable',
        },
        version: (properties.version as string) || '8.0.21',
        administratorLogin: properties.administrator_login as string,
        administratorLoginPassword: properties.administrator_login_password as string,
        storage: { storageSizeGB: (properties.storage_size_gb as number) ?? 32 },
        backup: {
          backupRetentionDays: (properties.backup_retention_days as number) ?? 7,
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
    const client = ctx.clients.get('mysql-flex') as any;
    if (!client) return err(name, TYPE, 'update', start, 'MySQL Flexible Server SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.servers.beginUpdateAndWait(resource_group, name, {
        sku: properties.sku_name
          ? { name: properties.sku_name as string, tier: (properties.sku_tier as string) || 'Burstable' }
          : undefined,
        storage: properties.storage_size_gb ? { storageSizeGB: properties.storage_size_gb as number } : undefined,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('mysql-flex') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'MySQL Flexible Server SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.servers.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

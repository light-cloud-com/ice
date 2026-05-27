/**
 * Azure SQL Database handler — `azure.sql.server` + `azure.sql.database`.
 *
 * Backs the template-only SQL Database block (parallel to AWS RDS for
 * SQL Server). The handler creates a logical SQL Server (the parent)
 * — individual databases inside it are sub-blocks projected during
 * canvas expansion in Phase B4.
 *
 * SQL Server requires an admin login + password (mirrors the
 * Postgres / MySQL Flex contract).
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.sql.server';
const SDK = '@azure/arm-sql';

export const sql_server_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('sql') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'SQL Server', SDK);

    if (!properties.administrator_login || !properties.administrator_login_password) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'SQL Server requires administrator_login + administrator_login_password (wire a Security.Secret or set explicitly).',
      );
    }

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.servers.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        administratorLogin: properties.administrator_login as string,
        administratorLoginPassword: properties.administrator_login_password as string,
        version: (properties.version as string) || '12.0',
        publicNetworkAccess: (properties.public_network_access as string) || 'Enabled',
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('sql') as any;
    if (!client) return err(name, TYPE, 'update', start, 'SQL Server SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.servers.beginUpdateAndWait(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('sql') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'SQL Server SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.servers.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

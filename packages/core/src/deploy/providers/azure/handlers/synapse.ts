/**
 * Azure Synapse Analytics workspace handler — `azure.synapse.workspace`.
 *
 * Backs Analytics.DataWarehouse on Azure (parallel to AWS Redshift and
 * GCP BigQuery). Workspace is the top-level container; SQL pools + Spark
 * pools + integration pipelines come via canvas sub-blocks.
 *
 * Creation requires a Data Lake Storage Gen2 filesystem and a SQL admin
 * password. The handler enforces password presence (mirrors RDS / DocDB
 * / Redshift contract).
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.synapse.workspace';
const SDK = '@azure/arm-synapse';

export const synapse_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('synapse') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Synapse', SDK);

    if (!properties.sql_administrator_login || !properties.sql_administrator_login_password) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'Synapse workspace requires sql_administrator_login + sql_administrator_login_password.',
      );
    }

    const storage_account_url = properties.storage_account_url as string | undefined;
    const filesystem = properties.filesystem_name as string | undefined;
    if (!storage_account_url || !filesystem) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'Synapse workspace requires storage_account_url + filesystem_name (Data Lake Gen2).',
      );
    }

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.workspaces.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        defaultDataLakeStorage: {
          accountUrl: storage_account_url,
          filesystem,
        },
        sqlAdministratorLogin: properties.sql_administrator_login as string,
        sqlAdministratorLoginPassword: properties.sql_administrator_login_password as string,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('synapse') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Synapse SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.workspaces.beginUpdateAndWait(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('synapse') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Synapse SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.workspaces.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

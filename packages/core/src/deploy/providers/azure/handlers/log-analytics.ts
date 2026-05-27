/**
 * Azure Log Analytics Workspace handler — `azure.monitor.log_analytics`.
 *
 * Backs Monitoring.Log on Azure. Workspaces hold log + metrics data for
 * the resources that ship them (Container Apps env, App Insights,
 * AKS diagnostics, etc.). Pay-as-you-go SKU is the universal default;
 * `properties.sku` accepts `PerGB2018` (legacy name AWS still uses),
 * `Free` (1-day retention, 500MB/day), or capacity-reservation tiers.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.monitor.log_analytics';
const SDK = '@azure/arm-operationalinsights';

export const log_analytics_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('log-analytics') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Log Analytics', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const location = (properties.location as string) || ctx.location;
      const result = await client.workspaces.beginCreateOrUpdateAndWait(resource_group, name, {
        location,
        sku: { name: (properties.sku as string) || 'PerGB2018' },
        retentionInDays: (properties.retention_days as number) ?? 30,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('log-analytics') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Log Analytics SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.workspaces.update(resource_group, name, {
        retentionInDays: properties.retention_days as number | undefined,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('log-analytics') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Log Analytics SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.workspaces.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

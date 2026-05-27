/**
 * Azure Application Insights handler — `azure.insights.appInsights`.
 *
 * Backs Monitoring.Metrics on Azure. App Insights now flows through a
 * Log Analytics workspace (workspaceResourceId). Operator wires a
 * Monitoring.Log block on the canvas; future wiring pass will pipe
 * the workspace id automatically.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.insights.appInsights';
const SDK = '@azure/arm-appinsights';

export const app_insights_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('app-insights') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Application Insights', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const location = (properties.location as string) || ctx.location;
      const result = await client.components.createOrUpdate(resource_group, name, {
        location,
        kind: 'web',
        applicationType: (properties.application_type as string) || 'web',
        workspaceResourceId: properties.workspace_resource_id as string | undefined,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('app-insights') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Application Insights SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.components.updateTags(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('app-insights') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Application Insights SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.components.delete(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

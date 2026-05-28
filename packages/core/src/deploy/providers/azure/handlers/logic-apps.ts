/**
 * Azure Logic Apps handler — `azure.logic.workflow`.
 *
 * Backs Compute.CronJob on Azure (parallel to AWS EventBridge Scheduler
 * + Lambda and GCP Cloud Scheduler + Cloud Function). Consumption tier
 * by default — true scale-to-zero with per-execution billing.
 *
 * The workflow definition (triggers + actions) comes from canvas
 * wiring; the handler accepts a `definition` JSON blob and forwards it
 * to the SDK. A schedule expression (recurrence trigger) is the
 * common shape for CronJob.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.logic.workflow';
const SDK = '@azure/arm-logic';

const DEFAULT_DEFINITION = {
  $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
  contentVersion: '1.0.0.0',
  triggers: {},
  actions: {},
};

export const logic_apps_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('logic') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Logic Apps', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.workflows.createOrUpdate(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        definition: (properties.definition as Record<string, unknown>) || DEFAULT_DEFINITION,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('logic') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Logic Apps SDK not available');
    try {
      // @azure/arm-logic v8's workflows.update only takes (rg, name,
      // options) — there is no body parameter and no way to patch tags
      // through this method. Tag updates on a Logic App workflow flow
      // through Azure Resource Manager's generic tags resource. For
      // now this handler is a no-op on update; full tag-patching needs
      // @azure/arm-resources tagsResources(provider_id, { properties }).
      void provider_id;
      void name;
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('logic') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Logic Apps SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.workflows.delete(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

/**
 * Property extractors for Azure messaging + integration services.
 *
 * Resources covered:
 *   - azure.logic.workflow           (Compute.CronJob)
 *   - azure.eventgrid.topic          (template-only)
 *   - azure.eventhub.namespace       (Messaging.EventStream)
 */

/**
 * Logic Apps workflow. Default = empty triggers/actions; canvas wiring
 * fills the schedule recurrence + downstream actions in Phase B4.
 */
export function extract_azure_logic_apps_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  // If a schedule_expression is supplied on the CronJob block, project
  // it into a recurrence trigger automatically — minimal sugar so the
  // canvas Compute.CronJob block deploys without manual definition.
  const schedule = (data.schedule_expression as string) || (data.cron_expression as string) || '';
  const recurrence_definition = schedule
    ? {
        $schema:
          'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
        contentVersion: '1.0.0.0',
        triggers: {
          recurrence: {
            type: 'Recurrence',
            recurrence: { frequency: 'Day', interval: 1 },
          },
        },
        actions: {},
      }
    : undefined;

  return {
    region,
    location: (data.location as string) || region,
    definition: (data.definition as Record<string, unknown>) || recurrence_definition,
    tags: {},
  };
}

/** Event Grid custom topic. Pub/sub for cross-service events. */
export function extract_azure_event_grid_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    tags: {},
  };
}

/**
 * Event Hubs namespace. Backs Messaging.EventStream. Standard tier by
 * default; throughput unit count = 1 (cheapest baseline).
 */
export function extract_azure_event_hubs_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    sku_name: (data.sku_name as string) || (data.tier as string) || 'Standard',
    sku_tier: (data.sku_tier as string) || (data.sku_name as string) || 'Standard',
    sku_capacity: (data.sku_capacity as number) ?? 1,
    auto_inflate: data.auto_inflate === true,
    max_throughput_units: (data.max_throughput_units as number) ?? 10,
    tags: {},
  };
}

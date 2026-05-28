/**
 * Cloud Monitoring Alert Policy Handler
 *
 * Handles: gcp.monitoring.alertPolicy — backs Monitoring.Alert on GCP
 * (parallel to AWS CloudWatch Alarm and Azure Insights Metric Alert).
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler } from '../types';

const TYPE = 'gcp.monitoring.alertPolicy';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return { resource_id: name, name, type: TYPE, action, success: true, duration_ms: Date.now() - start, ...overrides };
}

function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return { resource_id: name, name, type: TYPE, action, success: false, error, duration_ms: Date.now() - start };
}

export const monitoring_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('monitoring') as any;
      if (!client) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.MONITORING, 'monitoring'));
      const [policy] = await client.createAlertPolicy({
        name: `projects/${ctx.project}`,
        alertPolicy: {
          displayName: name,
          combiner: (properties.combiner as string) || 'OR',
          conditions: (properties.conditions as unknown[]) || [
            {
              displayName: `${name}-condition`,
              conditionThreshold: {
                filter:
                  (properties.filter as string) || 'metric.type="compute.googleapis.com/instance/cpu/utilization"',
                comparison: (properties.comparison as string) || 'COMPARISON_GT',
                thresholdValue: (properties.threshold as number) ?? 0.8,
                duration: { seconds: (properties.duration_seconds as number) ?? 300 },
              },
            },
          ],
          enabled: { value: properties.enabled !== false },
        },
      });
      return result(name, 'create', start, {
        provider_id: policy?.name ?? `projects/${ctx.project}/alertPolicies/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return result(name, 'update', Date.now(), { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('monitoring') as any;
      if (!client) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.MONITORING));
      await client.deleteAlertPolicy({ name: provider_id });
      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

/**
 * OCI Monitoring alarm handler — `oci.monitoring.alarm`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.monitoring.alarm';
const SDK = 'oci-monitoring';

export const monitoring_alarm_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const mon = await resolveClient(ctx, 'monitoring');
    if (!mon) return sdkMissing(name, TYPE, 'create', start, 'OCI Monitoring', SDK);
    if (!properties.metric_namespace || !properties.query) {
      return err(name, TYPE, 'create', start, 'Alarm requires properties.metric_namespace and properties.query');
    }
    try {
      const result = await mon.createAlarm({
        createAlarmDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          metricCompartmentId: ctx.compartment_id,
          namespace: properties.metric_namespace as string,
          query: properties.query as string,
          severity: (properties.severity as string) || 'WARNING',
          destinations: (properties.notification_topic_ids as string[]) ?? [],
          isEnabled: true,
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.alarm?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createAlarm returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const mon = await resolveClient(ctx, 'monitoring');
    if (!mon) return err(name, TYPE, 'delete', start, 'OCI Monitoring SDK not available');
    try {
      await mon.deleteAlarm({ alarmId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

/**
 * OCI Resource Scheduler schedule handler —
 * `oci.resourcescheduler.schedule`.
 *
 * Backs Compute.CronJob blocks. Cron-style triggers across any
 * resource-scheduler-supported action target.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.resourcescheduler.schedule';
const SDK = 'oci-resourcescheduler';

export const resourcescheduler_schedule_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const sch = await resolveClient(ctx, 'resourcescheduler');
    if (!sch) return sdkMissing(name, TYPE, 'create', start, 'OCI Resource Scheduler', SDK);
    try {
      const result = await sch.createSchedule({
        createScheduleDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          description: (properties.description as string) || `Schedule for ${name}`,
          action: (properties.action as string) || 'START_RESOURCE',
          recurrenceType: 'CRON',
          recurrenceDetails: (properties.cron_expression as string) || '0 0 * * *',
          timeStarts: properties.start_at as string | undefined,
          resources: (properties.target_resources as { id: string; metadata?: unknown }[]) ?? [],
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.schedule?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createSchedule returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const sch = await resolveClient(ctx, 'resourcescheduler');
    if (!sch) return err(name, TYPE, 'update', start, 'OCI Resource Scheduler SDK not available');
    try {
      await sch.updateSchedule({ scheduleId: provider_id, updateScheduleDetails: { displayName: name } });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const sch = await resolveClient(ctx, 'resourcescheduler');
    if (!sch) return err(name, TYPE, 'delete', start, 'OCI Resource Scheduler SDK not available');
    try {
      await sch.deleteSchedule({ scheduleId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

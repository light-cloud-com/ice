/**
 * Alibaba EventBridge rule handler — `alibaba.eventbridge.rule`.
 *
 * Backs Compute.CronJob blocks. Mirrors AWS EventBridge Scheduler:
 * cron / rate expression that triggers a target (FC function, MNS
 * queue, etc.). Target wiring resolved via canvas edges.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.eventbridge.rule';
const SDK = '@alicloud/eventbridge20200401';

export const eventbridge_rule_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const eb = await resolveClient(ctx, 'eventbridge');
    if (!eb) return sdkMissing(name, TYPE, 'create', start, 'Alibaba EventBridge', SDK);
    try {
      await eb.createRule({
        eventBusName: (properties.event_bus as string) || 'default',
        ruleName: name,
        description: (properties.description as string) || `Schedule for ${name}`,
        filterPattern: JSON.stringify({
          source: ['acs.eventbridge.schedule'],
          schedule: (properties.schedule_expression as string) || 'cron(0 0 * * ? *)',
        }),
        status: 'ENABLE',
      });
      return ok(name, TYPE, 'create', start, { provider_id: name });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const eb = await resolveClient(ctx, 'eventbridge');
    if (!eb) return err(name, TYPE, 'update', start, 'Alibaba EventBridge SDK not available');
    try {
      await eb.updateRule({
        eventBusName: (properties.event_bus as string) || 'default',
        ruleName: provider_id,
        description: properties.description as string | undefined,
        status: 'ENABLE',
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const eb = await resolveClient(ctx, 'eventbridge');
    if (!eb) return err(name, TYPE, 'delete', start, 'Alibaba EventBridge SDK not available');
    try {
      await eb.deleteRule({ eventBusName: 'default', ruleName: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

/**
 * Alibaba Container Registry handler — `alibaba.cr.instance`.
 *
 * Backs Compute.ContainerRegistry blocks. CR has a two-level
 * hierarchy: Instance (regional container of repositories) ↔
 * Repository (per-image). This handler manages the Instance; per-image
 * repositories are sibling resources.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.cr.instance';
const SDK = '@alicloud/cr20181201';

export const cr_instance_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const cr = await resolveClient(ctx, 'cr');
    if (!cr) return sdkMissing(name, TYPE, 'create', start, 'Alibaba CR', SDK);
    try {
      const result = await cr.createInstance({
        instanceName: name,
        paymentType: 'PayAsYouGo',
        instanceType: (properties.tier as string) || 'Basic',
        regionId: ctx.region,
      });
      const id = (result?.body?.instanceId ?? result?.body?.InstanceId) as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'CreateInstance returned no InstanceId');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const cr = await resolveClient(ctx, 'cr');
    if (!cr) return err(name, TYPE, 'delete', start, 'Alibaba CR SDK not available');
    try {
      await cr.deleteInstance({ instanceId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

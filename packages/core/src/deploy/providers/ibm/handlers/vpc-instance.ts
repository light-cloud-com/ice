/**
 * IBM VPC Virtual Server Instance handler — `ibm.vpc.instance`.
 */

import { resolveClient } from './_client';
import { err, isIbmAlreadyExists, isIbmNotFound, ok, sdkMissing } from './_result';
import type { IBMResourceHandler } from '../types';

const TYPE = 'ibm.vpc.instance';
const SDK = 'ibm-vpc';

export const vpc_instance_handler: IBMResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const vpc = await resolveClient(ctx, 'vpc');
    if (!vpc) return sdkMissing(name, TYPE, 'create', start, 'IBM VPC', SDK);
    if (!properties.vpc_id || !properties.subnet_id || !properties.image_id) {
      return err(name, TYPE, 'create', start, 'Instance requires vpc_id, subnet_id, image_id');
    }
    try {
      const result = await vpc.createInstance({
        instancePrototype: {
          name,
          vpc: { id: properties.vpc_id as string },
          zone: { name: (properties.zone as string) || `${ctx.region}-1` },
          profile: { name: (properties.profile as string) || 'bx2-2x8' },
          image: { id: properties.image_id as string },
          primaryNetworkInterface: { subnet: { id: properties.subnet_id as string } },
          keys: (properties.ssh_key_ids as string[])?.map((id) => ({ id })) ?? [],
          resourceGroup: ctx.resource_group_id ? { id: ctx.resource_group_id } : undefined,
        },
      });
      const id = result?.result?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createInstance returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isIbmAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const vpc = await resolveClient(ctx, 'vpc');
    if (!vpc) return err(name, TYPE, 'update', start, 'IBM VPC SDK not available');
    try {
      await vpc.updateInstance({ id: provider_id, name });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const vpc = await resolveClient(ctx, 'vpc');
    if (!vpc) return err(name, TYPE, 'delete', start, 'IBM VPC SDK not available');
    try {
      await vpc.deleteInstance({ id: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isIbmNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

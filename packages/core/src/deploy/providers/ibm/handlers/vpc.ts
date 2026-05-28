/**
 * IBM VPC handler — `ibm.vpc.vpc`.
 */

import { resolveClient } from './_client';
import { err, isIbmAlreadyExists, isIbmNotFound, ok, sdkMissing } from './_result';
import type { IBMResourceHandler } from '../types';

const TYPE = 'ibm.vpc.vpc';
const SDK = 'ibm-vpc';

export const vpc_handler: IBMResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const vpc = await resolveClient(ctx, 'vpc');
    if (!vpc) return sdkMissing(name, TYPE, 'create', start, 'IBM VPC', SDK);
    try {
      const result = await vpc.createVpc({
        name,
        addressPrefixManagement: (properties.address_prefix_management as string) || 'auto',
        resourceGroup: ctx.resource_group_id ? { id: ctx.resource_group_id } : undefined,
        classicAccess: (properties.classic_access as boolean) ?? false,
      });
      const id = result?.result?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createVpc returned no id');
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
      await vpc.updateVpc({ id: provider_id, name });
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
      await vpc.deleteVpc({ id: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isIbmNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

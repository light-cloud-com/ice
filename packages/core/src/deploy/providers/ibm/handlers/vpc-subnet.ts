/**
 * IBM VPC subnet handler — `ibm.vpc.subnet`.
 */

import { resolveClient } from './_client';
import { err, isIbmAlreadyExists, isIbmNotFound, ok, sdkMissing } from './_result';
import type { IBMResourceHandler } from '../types';

const TYPE = 'ibm.vpc.subnet';
const SDK = 'ibm-vpc';

export const vpc_subnet_handler: IBMResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const vpc = await resolveClient(ctx, 'vpc');
    if (!vpc) return sdkMissing(name, TYPE, 'create', start, 'IBM VPC', SDK);
    if (!properties.vpc_id) return err(name, TYPE, 'create', start, 'Subnet requires properties.vpc_id');
    try {
      const result = await vpc.createSubnet({
        subnetPrototype: {
          name,
          vpc: { id: properties.vpc_id as string },
          zone: { name: (properties.zone as string) || `${ctx.region}-1` },
          ipv4CidrBlock: (properties.cidr as string) || '10.10.1.0/24',
          resourceGroup: ctx.resource_group_id ? { id: ctx.resource_group_id } : undefined,
        },
      });
      const id = result?.result?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createSubnet returned no id');
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
      await vpc.updateSubnet({ id: provider_id, subnetPatch: { name } });
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
      await vpc.deleteSubnet({ id: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isIbmNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

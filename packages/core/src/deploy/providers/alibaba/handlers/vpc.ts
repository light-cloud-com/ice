/**
 * Alibaba VPC handler — `alibaba.vpc.vpc`.
 *
 * Backs Network.VPC blocks on Alibaba canvases. Creates a virtual
 * private network with a configurable CIDR (default 10.0.0.0/16).
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.vpc.vpc';
const SDK = '@alicloud/vpc20160428';

export const vpc_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const vpc = await resolveClient(ctx, 'vpc');
    if (!vpc) return sdkMissing(name, TYPE, 'create', start, 'Alibaba VPC', SDK);
    try {
      const result = await vpc.createVpc({
        regionId: ctx.region,
        vpcName: name,
        cidrBlock: (properties.cidr as string) || '10.0.0.0/16',
        description: properties.description as string | undefined,
      });
      const vpcId = (result?.body?.vpcId ?? result?.body?.VpcId) as string | undefined;
      if (!vpcId) return err(name, TYPE, 'create', start, 'CreateVpc returned no VpcId');
      return ok(name, TYPE, 'create', start, { provider_id: vpcId });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const vpc = await resolveClient(ctx, 'vpc');
    if (!vpc) return err(name, TYPE, 'update', start, 'Alibaba VPC SDK not available');
    try {
      await vpc.modifyVpcAttribute({
        vpcId: provider_id,
        vpcName: name,
        description: properties.description as string | undefined,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const vpc = await resolveClient(ctx, 'vpc');
    if (!vpc) return err(name, TYPE, 'delete', start, 'Alibaba VPC SDK not available');
    try {
      await vpc.deleteVpc({ vpcId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

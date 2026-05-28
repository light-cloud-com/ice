/**
 * Alibaba VSwitch handler — `alibaba.vpc.vSwitch`.
 *
 * Backs Network.Subnet blocks. VSwitch == AWS subnet equivalent —
 * binds a VPC to one zone with a CIDR slice.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.vpc.vSwitch';
const SDK = '@alicloud/vpc20160428';

export const vpc_vswitch_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const vpc = await resolveClient(ctx, 'vpc');
    if (!vpc) return sdkMissing(name, TYPE, 'create', start, 'Alibaba VPC', SDK);
    if (!properties.vpc_id) return err(name, TYPE, 'create', start, 'VSwitch requires properties.vpc_id');
    try {
      const result = await vpc.createVSwitch({
        regionId: ctx.region,
        vpcId: properties.vpc_id as string,
        zoneId: (properties.zone_id as string) || `${ctx.region}-a`,
        cidrBlock: (properties.cidr as string) || '10.0.1.0/24',
        vSwitchName: name,
      });
      const vSwitchId = (result?.body?.vSwitchId ?? result?.body?.VSwitchId) as string | undefined;
      if (!vSwitchId) return err(name, TYPE, 'create', start, 'CreateVSwitch returned no VSwitchId');
      return ok(name, TYPE, 'create', start, { provider_id: vSwitchId });
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
      await vpc.modifyVSwitchAttribute({
        vSwitchId: provider_id,
        vSwitchName: name,
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
      await vpc.deleteVSwitch({ vSwitchId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

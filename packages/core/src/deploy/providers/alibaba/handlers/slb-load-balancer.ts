/**
 * Alibaba SLB load balancer handler — `alibaba.slb.loadBalancer`.
 *
 * Backs Network.LoadBalancer blocks. Classic SLB (v4); ALB is a
 * separate handler family (P2).
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.slb.loadBalancer';
const SDK = '@alicloud/slb20140515';

export const slb_load_balancer_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const slb = await resolveClient(ctx, 'slb');
    if (!slb) return sdkMissing(name, TYPE, 'create', start, 'Alibaba SLB', SDK);
    try {
      const result = await slb.createLoadBalancer({
        regionId: ctx.region,
        loadBalancerName: name,
        loadBalancerSpec: (properties.spec as string) || 'slb.s1.small',
        addressType: (properties.address_type as string) || 'internet',
        vSwitchId: properties.vswitch_id as string | undefined,
        payType: 'PayOnDemand',
      });
      const id = (result?.body?.loadBalancerId ?? result?.body?.LoadBalancerId) as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'CreateLoadBalancer returned no LoadBalancerId');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const slb = await resolveClient(ctx, 'slb');
    if (!slb) return err(name, TYPE, 'update', start, 'Alibaba SLB SDK not available');
    try {
      await slb.setLoadBalancerName({ loadBalancerId: provider_id, loadBalancerName: name });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const slb = await resolveClient(ctx, 'slb');
    if (!slb) return err(name, TYPE, 'delete', start, 'Alibaba SLB SDK not available');
    try {
      await slb.deleteLoadBalancer({ loadBalancerId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

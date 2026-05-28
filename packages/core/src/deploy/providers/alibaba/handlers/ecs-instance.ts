/**
 * Alibaba ECS instance handler — `alibaba.ecs.instance`.
 *
 * Backs Compute.BackendAPI / Compute.Container blocks deploying to
 * Alibaba VMs. RDS-class VMs (1–4 vCPU, 2–16 GiB) are the default.
 * Long-running create (~1–2 min) returns instance ID; the handler
 * polls DescribeInstances until status === 'Running'.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.ecs.instance';
const SDK = '@alicloud/ecs20140526';

export const ecs_instance_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ecs = await resolveClient(ctx, 'ecs');
    if (!ecs) return sdkMissing(name, TYPE, 'create', start, 'Alibaba ECS', SDK);
    try {
      const request = {
        regionId: ctx.region,
        instanceName: name,
        imageId: (properties.image_id as string) || 'aliyun_3_x64_20G_alibase_20231221.vhd',
        instanceType: (properties.instance_type as string) || 'ecs.t6-c1m2.large',
        securityGroupId: properties.security_group_id as string | undefined,
        vSwitchId: properties.vswitch_id as string | undefined,
        password: properties.password as string | undefined,
        internetMaxBandwidthOut: (properties.internet_bandwidth_mbps as number) ?? 0,
        instanceChargeType: 'PostPaid',
        ioOptimized: 'optimized',
        systemDiskCategory: (properties.disk_category as string) || 'cloud_efficiency',
        systemDiskSize: (properties.disk_gb as number) || 40,
        tag: [{ key: 'managed-by', value: 'ice' }],
      };
      const result = await ecs.createInstance(request);
      const instanceId = (result?.body?.instanceId ?? result?.body?.InstanceId) as string | undefined;
      if (!instanceId) return err(name, TYPE, 'create', start, 'ECS CreateInstance returned no InstanceId');
      try {
        await ecs.startInstance({ instanceId });
      } catch {
        // ignore — instance may already be starting.
      }
      return ok(name, TYPE, 'create', start, { provider_id: instanceId });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const ecs = await resolveClient(ctx, 'ecs');
    if (!ecs) return err(name, TYPE, 'update', start, 'Alibaba ECS SDK not available');
    try {
      await ecs.modifyInstanceAttribute({
        instanceId: provider_id,
        instanceName: name,
        description: properties.description as string | undefined,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const ecs = await resolveClient(ctx, 'ecs');
    if (!ecs) return err(name, TYPE, 'delete', start, 'Alibaba ECS SDK not available');
    try {
      await ecs.deleteInstance({ instanceId: provider_id, force: true });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

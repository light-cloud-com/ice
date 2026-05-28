/**
 * Alibaba ECS Security Group handler — `alibaba.ecs.securityGroup`.
 *
 * Backs Network.SecurityGroup blocks. Mirrors AWS Security Group:
 * inbound + outbound rules over CIDR/IP ranges. Default-deny inbound,
 * default-allow outbound.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.ecs.securityGroup';
const SDK = '@alicloud/ecs20140526';

interface RuleSpec {
  port: number | string;
  cidr: string;
  protocol?: string;
  description?: string;
}

export const ecs_security_group_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ecs = await resolveClient(ctx, 'ecs');
    if (!ecs) return sdkMissing(name, TYPE, 'create', start, 'Alibaba ECS', SDK);
    try {
      const result = await ecs.createSecurityGroup({
        regionId: ctx.region,
        securityGroupName: name,
        vpcId: properties.vpc_id as string | undefined,
        description: properties.description as string | undefined,
      });
      const sgId = (result?.body?.securityGroupId ?? result?.body?.SecurityGroupId) as string | undefined;
      if (!sgId) return err(name, TYPE, 'create', start, 'CreateSecurityGroup returned no SecurityGroupId');
      for (const rule of (properties.inbound_rules as RuleSpec[]) ?? []) {
        await ecs.authorizeSecurityGroup({
          regionId: ctx.region,
          securityGroupId: sgId,
          ipProtocol: rule.protocol ?? 'tcp',
          portRange: typeof rule.port === 'number' ? `${rule.port}/${rule.port}` : rule.port,
          sourceCidrIp: rule.cidr,
          description: rule.description,
        });
      }
      return ok(name, TYPE, 'create', start, { provider_id: sgId });
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
      await ecs.modifySecurityGroupAttribute({
        regionId: ctx.region,
        securityGroupId: provider_id,
        securityGroupName: name,
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
      await ecs.deleteSecurityGroup({ regionId: ctx.region, securityGroupId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

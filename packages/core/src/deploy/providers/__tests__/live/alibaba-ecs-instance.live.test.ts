/**
 * Alibaba ECS instance live test — costs ~$0.01/min while running.
 *
 * Run: pnpm test:live:alibaba ecs-instance
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.ecs.instance — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;
  let vpcId: string | undefined;
  let vswId: string | undefined;
  let sgId: string | undefined;
  let vpcName: string, vswName: string, sgName: string;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-ecs-instance');
    vpcName = uniqueAlibabaName('vpc-ecs', 128);
    const vpcR = await ctx.deployer.create('alibaba.vpc.vpc', vpcName, { cidr: '10.40.0.0/16' }, {});
    vpcId = vpcR.provider_id;
    vswName = uniqueAlibabaName('vsw-ecs', 128);
    const vswR = await ctx.deployer.create(
      'alibaba.vpc.vSwitch',
      vswName,
      { vpc_id: vpcId, cidr: '10.40.1.0/24', zone_id: `${ctx.region}-a` },
      {},
    );
    vswId = vswR.provider_id;
    sgName = uniqueAlibabaName('sg-ecs', 128);
    const sgR = await ctx.deployer.create('alibaba.ecs.securityGroup', sgName, { vpc_id: vpcId }, {});
    sgId = sgR.provider_id;
  });
  afterAll(async () => {
    if (sgId) await ctx.deployer.delete('alibaba.ecs.securityGroup', sgName, sgId, {});
    if (vswId) await ctx.deployer.delete('alibaba.vpc.vSwitch', vswName, vswId, {});
    if (vpcId) await ctx.deployer.delete('alibaba.vpc.vpc', vpcName, vpcId, {});
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an ECS instance then deletes it',
    async () => {
      const name = uniqueAlibabaName('ecs', 128);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.ecs.instance',
          name,
          {
            instance_type: 'ecs.t6-c1m2.large',
            image_id: 'aliyun_3_x64_20G_alibase_20231221.vhd',
            security_group_id: sgId,
            vswitch_id: vswId,
            password: 'IceTest!2026',
            disk_gb: 40,
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-ecs-instance', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.ecs.instance', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-ecs-instance', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});

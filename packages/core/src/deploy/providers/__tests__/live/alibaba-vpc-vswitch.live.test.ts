/**
 * Alibaba VSwitch live test — requires a parent VPC.
 *
 * Run: pnpm test:live:alibaba vpc-vswitch
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.vpc.vSwitch — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;
  let vpcId: string | undefined;
  let vpcName: string;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-vpc-vswitch');
    vpcName = uniqueAlibabaName('vpc-vsw', 128);
    const r = await ctx.deployer.create('alibaba.vpc.vpc', vpcName, { cidr: '10.20.0.0/16' }, {});
    vpcId = r.provider_id;
  });
  afterAll(async () => {
    if (vpcId) await ctx.deployer.delete('alibaba.vpc.vpc', vpcName, vpcId, {});
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a VSwitch then deletes it',
    async () => {
      const name = uniqueAlibabaName('vsw', 128);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.vpc.vSwitch',
          name,
          { vpc_id: vpcId, cidr: '10.20.1.0/24', zone_id: `${ctx.region}-a` },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-vpc-vswitch', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.vpc.vSwitch', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-vpc-vswitch', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

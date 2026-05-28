/**
 * Alibaba ECS Security Group live test.
 *
 * Run: pnpm test:live:alibaba ecs-security-group
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.ecs.securityGroup — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;
  let vpcId: string | undefined;
  let vpcName: string;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-ecs-security-group');
    vpcName = uniqueAlibabaName('vpc-sg', 128);
    const r = await ctx.deployer.create('alibaba.vpc.vpc', vpcName, { cidr: '10.30.0.0/16' }, {});
    vpcId = r.provider_id;
  });
  afterAll(async () => {
    if (vpcId) await ctx.deployer.delete('alibaba.vpc.vpc', vpcName, vpcId, {});
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Security Group with inbound rule then deletes it',
    async () => {
      const name = uniqueAlibabaName('sg', 128);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.ecs.securityGroup',
          name,
          {
            vpc_id: vpcId,
            inbound_rules: [{ port: 443, cidr: '0.0.0.0/0', protocol: 'tcp', description: 'https' }],
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-ecs-security-group', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.ecs.securityGroup', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-ecs-security-group', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

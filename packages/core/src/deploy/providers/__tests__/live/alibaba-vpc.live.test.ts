/**
 * Alibaba VPC live test — create + delete round-trip.
 *
 * Expected runtime: ~10 sec. Cost: free (VPC + VSwitch + SG only cost
 * when attached to billable resources).
 *
 * Run: pnpm test:live:alibaba vpc
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.vpc.vpc — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-vpc');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a VPC then deletes it',
    async () => {
      const name = uniqueAlibabaName('vpc', 128);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('alibaba.vpc.vpc', name, { cidr: '10.10.0.0/16' }, {});
        logger.log({ kind: 'create', handler: 'alibaba-vpc', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.vpc.vpc', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-vpc', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

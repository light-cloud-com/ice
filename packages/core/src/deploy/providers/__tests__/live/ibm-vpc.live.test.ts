/**
 * IBM Cloud VPC live test — create + delete round-trip.
 *
 * Expected runtime: ~20 sec. Cost: VPC control plane is $0/hr — only
 * attached resources cost. This test is free.
 *
 * Run: pnpm test:live:ibm vpc
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { IBMLiveContext, JsonlLogger, createIBMDeployer, ibmLive, uniqueIbmName } from './_live-helpers';

ibmLive('ibm.vpc.vpc — create + delete', () => {
  let ctx: IBMLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createIBMDeployer();
    logger = new JsonlLogger('ibm-vpc');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a VPC then deletes it',
    async () => {
      const name = uniqueIbmName('vpc', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('ibm.vpc.vpc', name, { address_prefix_management: 'auto' }, {});
        logger.log({ kind: 'create', handler: 'ibm-vpc', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('ibm.vpc.vpc', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'ibm-vpc', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

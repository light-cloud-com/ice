/**
 * IBM VPC subnet live test — requires parent VPC.
 *
 * Run: pnpm test:live:ibm vpc-subnet
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { IBMLiveContext, JsonlLogger, createIBMDeployer, ibmLive, uniqueIbmName } from './_live-helpers';

ibmLive('ibm.vpc.subnet — create + delete', () => {
  let ctx: IBMLiveContext;
  let logger: JsonlLogger;
  let vpcId: string | undefined;
  let vpcName: string;

  beforeAll(async () => {
    ctx = await createIBMDeployer();
    logger = new JsonlLogger('ibm-vpc-subnet');
    vpcName = uniqueIbmName('vpc-sn', 63);
    const r = await ctx.deployer.create('ibm.vpc.vpc', vpcName, { address_prefix_management: 'auto' }, {});
    vpcId = r.provider_id;
  });
  afterAll(async () => {
    if (vpcId) await ctx.deployer.delete('ibm.vpc.vpc', vpcName, vpcId, {});
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a subnet then deletes it',
    async () => {
      const name = uniqueIbmName('sn', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'ibm.vpc.subnet',
          name,
          { vpc_id: vpcId, cidr: '10.120.1.0/24', zone: `${ctx.region}-1` },
          {},
        );
        logger.log({ kind: 'create', handler: 'ibm-vpc-subnet', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('ibm.vpc.subnet', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'ibm-vpc-subnet', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

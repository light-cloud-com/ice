/**
 * DigitalOcean VPC live test.
 *
 * Run: pnpm test:live:digitalocean vpc-network
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  DigitalOceanLiveContext,
  JsonlLogger,
  createDigitalOceanDeployer,
  digitaloceanLive,
  uniqueDoName,
} from './_live-helpers';

digitaloceanLive('digitalocean.vpc.network — create + delete', () => {
  let ctx: DigitalOceanLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createDigitalOceanDeployer();
    logger = new JsonlLogger('do-vpc-network');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a VPC then deletes it',
    async () => {
      const name = uniqueDoName('vpc', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'digitalocean.vpc.network',
          name,
          { region: ctx.region, ip_range: '10.110.0.0/16' },
          {},
        );
        logger.log({ kind: 'create', handler: 'do-vpc-network', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('digitalocean.vpc.network', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'do-vpc-network', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

/**
 * DigitalOcean Load Balancer live test.
 *
 * Cost: $0.014/hr per LB.
 *
 * Run: pnpm test:live:digitalocean loadbalancer
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  DigitalOceanLiveContext,
  JsonlLogger,
  createDigitalOceanDeployer,
  digitaloceanLive,
  uniqueDoName,
} from './_live-helpers';

digitaloceanLive('digitalocean.loadbalancer.loadbalancer — create + delete', () => {
  let ctx: DigitalOceanLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createDigitalOceanDeployer();
    logger = new JsonlLogger('do-loadbalancer');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Load Balancer then deletes it',
    async () => {
      const name = uniqueDoName('lb', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'digitalocean.loadbalancer.loadbalancer',
          name,
          {
            region: ctx.region,
            forwarding_rules: [{ entry_protocol: 'http', entry_port: 80, target_protocol: 'http', target_port: 8080 }],
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'do-loadbalancer', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('digitalocean.loadbalancer.loadbalancer', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'do-loadbalancer', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});

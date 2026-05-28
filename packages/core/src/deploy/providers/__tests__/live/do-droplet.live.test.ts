/**
 * DigitalOcean Droplet live test — create + delete round-trip.
 *
 * Expected runtime: ~30 sec (DO droplets boot fast). Cost: ~$0.0001
 * for the test window (delete fires within seconds of create).
 *
 * Run: pnpm test:live:digitalocean droplet
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  DigitalOceanLiveContext,
  JsonlLogger,
  createDigitalOceanDeployer,
  digitaloceanLive,
  uniqueDoName,
} from './_live-helpers';

digitaloceanLive('digitalocean.droplet.instance — create + delete', () => {
  let ctx: DigitalOceanLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createDigitalOceanDeployer();
    logger = new JsonlLogger('do-droplet');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Droplet then deletes it',
    async () => {
      const name = uniqueDoName('droplet', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'digitalocean.droplet.instance',
          name,
          { size: 's-1vcpu-1gb', image: 'ubuntu-22-04-x64', region: ctx.region },
          {},
        );
        logger.log({ kind: 'create', handler: 'do-droplet', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('digitalocean.droplet.instance', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'do-droplet', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

/**
 * DigitalOcean Cloud Firewall live test.
 *
 * Run: pnpm test:live:digitalocean firewall
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  DigitalOceanLiveContext,
  JsonlLogger,
  createDigitalOceanDeployer,
  digitaloceanLive,
  uniqueDoName,
} from './_live-helpers';

digitaloceanLive('digitalocean.firewall.firewall — create + delete', () => {
  let ctx: DigitalOceanLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createDigitalOceanDeployer();
    logger = new JsonlLogger('do-firewall');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Cloud Firewall then deletes it',
    async () => {
      const name = uniqueDoName('fw', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'digitalocean.firewall.firewall',
          name,
          {
            inbound_rules: [{ protocol: 'tcp', ports: '22', sources: { addresses: ['0.0.0.0/0', '::/0'] } }],
            outbound_rules: [{ protocol: 'tcp', ports: 'all', destinations: { addresses: ['0.0.0.0/0', '::/0'] } }],
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'do-firewall', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('digitalocean.firewall.firewall', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'do-firewall', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

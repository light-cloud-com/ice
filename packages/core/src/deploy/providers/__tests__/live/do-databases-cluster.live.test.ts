/**
 * DigitalOcean managed Database cluster live test.
 *
 * Cost: $0.022/hr for db-s-1vcpu-1gb. Provisioning is 5-10 min.
 *
 * Run: pnpm test:live:digitalocean databases-cluster
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  DigitalOceanLiveContext,
  JsonlLogger,
  createDigitalOceanDeployer,
  digitaloceanLive,
  uniqueDoName,
} from './_live-helpers';

digitaloceanLive('digitalocean.databases.cluster — create + delete', () => {
  let ctx: DigitalOceanLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createDigitalOceanDeployer();
    logger = new JsonlLogger('do-databases-cluster');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Postgres DB cluster then deletes it',
    async () => {
      const name = uniqueDoName('db', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'digitalocean.databases.cluster',
          name,
          { engine: 'postgres', size: 'db-s-1vcpu-1gb', region: ctx.region, num_nodes: 1 },
          {},
        );
        logger.log({ kind: 'create', handler: 'do-databases-cluster', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('digitalocean.databases.cluster', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'do-databases-cluster', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    15 * 60_000,
  );
});

/**
 * IBM Databases for Redis live test.
 *
 * Run: pnpm test:live:ibm databases-redis
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { IBMLiveContext, JsonlLogger, createIBMDeployer, ibmLive, uniqueIbmName } from './_live-helpers';

ibmLive('ibm.databases.redis — create + delete', () => {
  let ctx: IBMLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createIBMDeployer();
    logger = new JsonlLogger('ibm-databases-redis');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Redis instance then deletes it',
    async () => {
      const name = uniqueIbmName('redis', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('ibm.databases.redis', name, {}, {});
        logger.log({ kind: 'create', handler: 'ibm-databases-redis', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('ibm.databases.redis', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'ibm-databases-redis', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    20 * 60_000,
  );
});

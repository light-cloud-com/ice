/**
 * IBM Databases for MongoDB live test.
 *
 * Run: pnpm test:live:ibm databases-mongodb
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { IBMLiveContext, JsonlLogger, createIBMDeployer, ibmLive, uniqueIbmName } from './_live-helpers';

ibmLive('ibm.databases.mongodb — create + delete', () => {
  let ctx: IBMLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createIBMDeployer();
    logger = new JsonlLogger('ibm-databases-mongodb');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a MongoDB DB instance then deletes it',
    async () => {
      const name = uniqueIbmName('mongo', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('ibm.databases.mongodb', name, {}, {});
        logger.log({ kind: 'create', handler: 'ibm-databases-mongodb', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('ibm.databases.mongodb', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'ibm-databases-mongodb', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    20 * 60_000,
  );
});

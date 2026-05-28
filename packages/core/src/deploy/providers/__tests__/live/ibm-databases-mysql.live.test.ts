/**
 * IBM Databases for MySQL live test.
 *
 * Run: pnpm test:live:ibm databases-mysql
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { IBMLiveContext, JsonlLogger, createIBMDeployer, ibmLive, uniqueIbmName } from './_live-helpers';

ibmLive('ibm.databases.mysql — create + delete', () => {
  let ctx: IBMLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createIBMDeployer();
    logger = new JsonlLogger('ibm-databases-mysql');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a MySQL DB instance then deletes it',
    async () => {
      const name = uniqueIbmName('mysql', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('ibm.databases.mysql', name, {}, {});
        logger.log({ kind: 'create', handler: 'ibm-databases-mysql', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('ibm.databases.mysql', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'ibm-databases-mysql', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    20 * 60_000,
  );
});

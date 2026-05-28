/**
 * IBM Databases for PostgreSQL live test — backed by the Resource
 * Controller factory. Provisioning is ~8-15 min.
 *
 * Run: pnpm test:live:ibm databases-postgresql
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { IBMLiveContext, JsonlLogger, createIBMDeployer, ibmLive, uniqueIbmName } from './_live-helpers';

ibmLive('ibm.databases.postgresql — create + delete', () => {
  let ctx: IBMLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createIBMDeployer();
    logger = new JsonlLogger('ibm-databases-postgresql');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Postgres DB instance then deletes it',
    async () => {
      const name = uniqueIbmName('pg', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('ibm.databases.postgresql', name, { memory_mb: 1024, disk_mb: 5120 }, {});
        logger.log({ kind: 'create', handler: 'ibm-databases-postgresql', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('ibm.databases.postgresql', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'ibm-databases-postgresql', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    20 * 60_000,
  );
});

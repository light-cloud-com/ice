/**
 * Alibaba RDS DB instance live test.
 *
 * Provisioning is 5-15 min. Cost: hourly per shape; defaults to
 * pg.n2.serverless.1c which is the cheapest option (~$0.04/hr).
 *
 * Run: pnpm test:live:alibaba rds-db-instance
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.rds.dbInstance — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-rds-db-instance');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an RDS Postgres serverless instance then deletes it',
    async () => {
      const name = uniqueAlibabaName('rds', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.rds.dbInstance',
          name,
          { engine: 'postgres', engine_version: '16.0', storage_gb: 20, network_type: 'Internet' },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-rds-db-instance', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.rds.dbInstance', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-rds-db-instance', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    20 * 60_000,
  );
});

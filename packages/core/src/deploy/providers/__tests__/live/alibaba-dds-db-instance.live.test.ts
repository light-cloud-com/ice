/**
 * Alibaba ApsaraDB MongoDB live test.
 *
 * Provisioning is 5-10 min.
 *
 * Run: pnpm test:live:alibaba dds-db-instance
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.dds.dbInstance — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-dds-db-instance');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a MongoDB instance then deletes it',
    async () => {
      const name = uniqueAlibabaName('mongo', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.dds.dbInstance',
          name,
          { engine_version: '6.0', instance_class: 'dds.mongo.mid', storage_gb: 10 },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-dds-db-instance', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.dds.dbInstance', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-dds-db-instance', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    15 * 60_000,
  );
});

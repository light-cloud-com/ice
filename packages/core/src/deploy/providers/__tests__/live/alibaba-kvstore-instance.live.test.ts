/**
 * Alibaba KVStore (Redis) instance live test.
 *
 * Note: provisioning is 3-5 min. Tests timeout at 10 min.
 *
 * Run: pnpm test:live:alibaba kvstore-instance
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.kvstore.instance — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-kvstore-instance');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a KVStore Redis instance then deletes it',
    async () => {
      const name = uniqueAlibabaName('redis', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.kvstore.instance',
          name,
          { instance_class: 'redis.master.small.default', engine_version: '7.0' },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-kvstore-instance', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.kvstore.instance', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-kvstore-instance', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});

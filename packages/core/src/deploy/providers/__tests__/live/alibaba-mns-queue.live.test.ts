/**
 * Alibaba MNS queue live test.
 *
 * Run: pnpm test:live:alibaba mns-queue
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.mns.queue — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-mns-queue');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an MNS queue then deletes it',
    async () => {
      const name = uniqueAlibabaName('mns-q', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.mns.queue',
          name,
          { visibility_timeout_sec: 30, max_message_bytes: 65536 },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-mns-queue', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.mns.queue', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-mns-queue', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

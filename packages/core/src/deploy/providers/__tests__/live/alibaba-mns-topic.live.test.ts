/**
 * Alibaba MNS topic live test.
 *
 * Run: pnpm test:live:alibaba mns-topic
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.mns.topic — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-mns-topic');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an MNS topic then deletes it',
    async () => {
      const name = uniqueAlibabaName('mns-t', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('alibaba.mns.topic', name, { max_message_bytes: 65536 }, {});
        logger.log({ kind: 'create', handler: 'alibaba-mns-topic', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.mns.topic', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-mns-topic', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

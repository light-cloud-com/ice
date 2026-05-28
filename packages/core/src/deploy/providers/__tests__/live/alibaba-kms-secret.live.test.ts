/**
 * Alibaba KMS secret live test.
 *
 * Run: pnpm test:live:alibaba kms-secret
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.kms.secret — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-kms-secret');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a KMS secret then deletes it',
    async () => {
      const name = uniqueAlibabaName('kms', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.kms.secret',
          name,
          { value: 'hunter2', description: 'live test' },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-kms-secret', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.kms.secret', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-kms-secret', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

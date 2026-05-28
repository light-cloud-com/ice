/**
 * Alibaba Function Compute function live test.
 *
 * Run: pnpm test:live:alibaba fc-function
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.fc.function — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-fc-function');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an FC function (no code) then deletes it',
    async () => {
      const name = uniqueAlibabaName('fc', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.fc.function',
          name,
          { runtime: 'nodejs20', handler: 'index.handler', memory_mb: 512, timeout_sec: 30 },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-fc-function', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.fc.function', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-fc-function', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

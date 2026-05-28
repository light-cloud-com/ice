/**
 * Alibaba SAE application live test.
 *
 * Requires properties.image (any public container image works for
 * a smoke test, e.g. `registry.cn-hangzhou.aliyuncs.com/acs/nginx:1.21.6`).
 *
 * Run: pnpm test:live:alibaba sae-application
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.sae.application — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-sae-application');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an SAE application then deletes it',
    async () => {
      const name = uniqueAlibabaName('sae', 36);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.sae.application',
          name,
          {
            image: 'registry.cn-hangzhou.aliyuncs.com/acs/nginx:1.21.6',
            replicas: 1,
            cpu_milli: 1000,
            memory_mb: 2048,
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-sae-application', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.sae.application', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-sae-application', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});

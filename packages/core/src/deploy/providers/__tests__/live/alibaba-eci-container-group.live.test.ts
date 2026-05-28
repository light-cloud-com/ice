/**
 * Alibaba ECI container group live test.
 *
 * Run: pnpm test:live:alibaba eci-container-group
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.eci.containerGroup — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-eci-container-group');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an ECI container group then deletes it',
    async () => {
      const name = uniqueAlibabaName('eci', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.eci.containerGroup',
          name,
          { image: 'nginx:latest', cpu_cores: 1, memory_gb: 2 },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-eci-container-group', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.eci.containerGroup', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-eci-container-group', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});

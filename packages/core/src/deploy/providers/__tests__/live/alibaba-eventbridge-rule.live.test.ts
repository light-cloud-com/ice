/**
 * Alibaba EventBridge rule live test.
 *
 * Run: pnpm test:live:alibaba eventbridge-rule
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.eventbridge.rule — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-eventbridge-rule');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an EventBridge schedule rule then deletes it',
    async () => {
      const name = uniqueAlibabaName('ebr', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'alibaba.eventbridge.rule',
          name,
          { event_bus: 'default', schedule_expression: 'cron(0 0 * * ? *)' },
          {},
        );
        logger.log({ kind: 'create', handler: 'alibaba-eventbridge-rule', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.eventbridge.rule', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-eventbridge-rule', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

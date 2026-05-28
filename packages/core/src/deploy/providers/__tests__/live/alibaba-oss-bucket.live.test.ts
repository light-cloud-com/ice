/**
 * Alibaba OSS bucket live test — create + delete round-trip.
 *
 * Expected runtime: ~15 sec. Cost: free (bucket creation has no
 * minimum charge; tests delete on completion).
 *
 * Run: pnpm test:live:alibaba oss-bucket
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AlibabaLiveContext,
  JsonlLogger,
  alibabaLive,
  createAlibabaDeployer,
  uniqueAlibabaName,
} from './_live-helpers';

alibabaLive('alibaba.oss.bucket — create + delete', () => {
  let ctx: AlibabaLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAlibabaDeployer();
    logger = new JsonlLogger('alibaba-oss-bucket');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an OSS bucket then deletes it',
    async () => {
      // OSS bucket names: 3-63 chars, lowercase letters / numbers /
      // dashes, must start/end with letter or number, globally unique.
      const name = uniqueAlibabaName('oss', 63).toLowerCase().replace(/_/g, '-');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('alibaba.oss.bucket', name, { acl: 'private' }, {});
        logger.log({ kind: 'create', handler: 'alibaba-oss-bucket', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('alibaba.oss.bucket', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'alibaba-oss-bucket', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

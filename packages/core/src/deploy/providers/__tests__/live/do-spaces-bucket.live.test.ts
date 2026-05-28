/**
 * DigitalOcean Spaces bucket live test — requires
 * DO_SPACES_ACCESS_KEY + DO_SPACES_SECRET_KEY.
 *
 * Spaces is S3-compatible — reuses @aws-sdk/client-s3 with the
 * <region>.digitaloceanspaces.com endpoint.
 *
 * Run: pnpm test:live:digitalocean spaces-bucket
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  DigitalOceanLiveContext,
  JsonlLogger,
  createDigitalOceanDeployer,
  digitaloceanLive,
  uniqueDoName,
} from './_live-helpers';

digitaloceanLive('digitalocean.spaces.bucket — create + delete', () => {
  let ctx: DigitalOceanLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createDigitalOceanDeployer();
    logger = new JsonlLogger('do-spaces-bucket');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Spaces bucket then deletes it',
    async () => {
      const name = uniqueDoName('spaces', 63).toLowerCase();
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('digitalocean.spaces.bucket', name, {}, {});
        logger.log({ kind: 'create', handler: 'do-spaces-bucket', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('digitalocean.spaces.bucket', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'do-spaces-bucket', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

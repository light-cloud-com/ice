/**
 * DigitalOcean App Platform app live test — requires a github or
 * git source in properties.spec.
 *
 * Run: pnpm test:live:digitalocean apps-app
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  DigitalOceanLiveContext,
  JsonlLogger,
  createDigitalOceanDeployer,
  digitaloceanLive,
  uniqueDoName,
} from './_live-helpers';

digitaloceanLive('digitalocean.apps.app — create + delete', () => {
  let ctx: DigitalOceanLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createDigitalOceanDeployer();
    logger = new JsonlLogger('do-apps-app');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an App Platform app then deletes it',
    async () => {
      const name = uniqueDoName('app', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'digitalocean.apps.app',
          name,
          {
            spec: {
              name,
              region: ctx.region,
              services: [
                {
                  name: 'web',
                  instance_size_slug: 'basic-xxs',
                  instance_count: 1,
                  github: { repo: 'digitalocean/sample-nodejs', branch: 'main', deploy_on_push: false },
                },
              ],
            },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'do-apps-app', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('digitalocean.apps.app', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'do-apps-app', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});

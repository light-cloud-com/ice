/**
 * DigitalOcean Kubernetes (DOKS) cluster live test.
 *
 * Cost: control plane $0/hr; node pool $0.007/hr per node. Provisioning
 * is 8-12 min. Worker pool tear-down then control plane tear-down on
 * delete — full round-trip is 15-20 min.
 *
 * Run: pnpm test:live:digitalocean kubernetes-cluster
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  DigitalOceanLiveContext,
  JsonlLogger,
  createDigitalOceanDeployer,
  digitaloceanLive,
  uniqueDoName,
} from './_live-helpers';

digitaloceanLive('digitalocean.kubernetes.cluster — create + delete', () => {
  let ctx: DigitalOceanLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createDigitalOceanDeployer();
    logger = new JsonlLogger('do-kubernetes-cluster');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a DOKS cluster then deletes it',
    async () => {
      const name = uniqueDoName('doks', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'digitalocean.kubernetes.cluster',
          name,
          { region: ctx.region, version: 'latest', node_size: 's-1vcpu-2gb', node_count: 1 },
          {},
        );
        logger.log({ kind: 'create', handler: 'do-kubernetes-cluster', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('digitalocean.kubernetes.cluster', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'do-kubernetes-cluster', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    25 * 60_000,
  );
});

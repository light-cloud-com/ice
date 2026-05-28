/**
 * Kubernetes Ingress live test.
 *
 * Expected runtime: ~30 sec. Cost: free (no cloud LB allocation).
 *
 * Run: pnpm test:live:kubernetes ingress
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  JsonlLogger,
  KubernetesLiveContext,
  createKubernetesDeployer,
  kubernetesLive,
  uniqueK8sName,
} from './_live-helpers';

kubernetesLive('k8s.networking.ingress — create + delete', () => {
  let ctx: KubernetesLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createKubernetesDeployer();
    logger = new JsonlLogger('k8s-ingress');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an nginx-class ingress then deletes it',
    async () => {
      const name = uniqueK8sName('ing');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'k8s.networking.ingress',
          name,
          {
            host: `${name}.ice-test.example`,
            service_name: 'placeholder-svc',
            service_port: 80,
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'k8s-ingress', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('k8s.networking.ingress', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'k8s-ingress', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

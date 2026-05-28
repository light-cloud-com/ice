/**
 * Kubernetes Deployment live test (developer-run).
 *
 * Expected runtime: ~30 sec. Cost: free (cluster compute only).
 *
 * Run: KUBECONFIG=~/.kube/config pnpm test:live:kubernetes deployment
 *
 * Cleanup: handled by the test itself (delete in finally); orphans
 * caught by `pnpm exec ts-node e2e/kubernetes-deployment-tests/cleanup-orphans.ts`.
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  JsonlLogger,
  KubernetesLiveContext,
  createKubernetesDeployer,
  kubernetesLive,
  uniqueK8sName,
} from './_live-helpers';

kubernetesLive('k8s.apps.deployment — create + delete', () => {
  let ctx: KubernetesLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createKubernetesDeployer();
    logger = new JsonlLogger('k8s-deployment');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a nginx deployment then deletes it',
    async () => {
      const name = uniqueK8sName('dep');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'k8s.apps.deployment',
          name,
          { image: 'nginx:1.27', replicas: 1, port: 80 },
          {},
        );
        logger.log({ kind: 'create', handler: 'k8s-deployment', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/^apps\/Deployment\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('k8s.apps.deployment', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'k8s-deployment', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

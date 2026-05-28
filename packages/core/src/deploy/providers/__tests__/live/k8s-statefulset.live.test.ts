/**
 * Kubernetes StatefulSet (Postgres profile) live test.
 *
 * Expected runtime: 1–2 min. Cost: free (cluster compute + PVC).
 *
 * Run: pnpm test:live:kubernetes statefulset
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  JsonlLogger,
  KubernetesLiveContext,
  createKubernetesDeployer,
  kubernetesLive,
  uniqueK8sName,
} from './_live-helpers';

kubernetesLive('k8s.apps.statefulset — create + delete (postgres profile)', () => {
  let ctx: KubernetesLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createKubernetesDeployer();
    logger = new JsonlLogger('k8s-statefulset');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a postgres statefulset then deletes it',
    async () => {
      const name = uniqueK8sName('ss');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'k8s.apps.statefulset',
          name,
          {
            image: 'postgres:17-alpine',
            port: 5432,
            data_path: '/var/lib/postgresql/data',
            storage_size_gi: 1,
            env_vars: { POSTGRES_PASSWORD: 'icelivetest' },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'k8s-statefulset', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('k8s.apps.statefulset', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'k8s-statefulset', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});

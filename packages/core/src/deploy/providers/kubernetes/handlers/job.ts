/**
 * Kubernetes Job handler — `k8s.batch.job`.
 *
 * Backs one-shot batch work (Compute.Worker variant when the canvas
 * marks `service_type: 'job'`). CronJob handler creates Jobs on a
 * schedule; this handler creates ad-hoc Jobs.
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.batch.job';
const SDK = '@kubernetes/client-node';

export const job_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const batch = ctx.clients.get('batch') as any;
    if (!batch) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes batch API', SDK);
    if (!properties.image) {
      return err(name, TYPE, 'create', start, 'Job requires properties.image.');
    }
    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      const env = Object.entries((properties.env_vars as Record<string, string>) ?? {}).map(([n, value]) => ({
        name: n,
        value,
      }));
      try {
        await batch.createNamespacedJob({
          namespace,
          body: {
            apiVersion: 'batch/v1',
            kind: 'Job',
            metadata: {
              name,
              namespace,
              labels: { 'app.kubernetes.io/managed-by': 'ice' },
            },
            spec: {
              backoffLimit: (properties.backoff_limit as number) ?? 3,
              completions: (properties.completions as number) ?? 1,
              parallelism: (properties.parallelism as number) ?? 1,
              template: {
                spec: {
                  restartPolicy: 'OnFailure',
                  containers: [
                    {
                      name: 'app',
                      image: properties.image as string,
                      command: properties.command as string[] | undefined,
                      args: properties.args as string[] | undefined,
                      env: env.length ? env : undefined,
                    },
                  ],
                },
              },
            },
          },
        });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `batch/Job/${namespace}/${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    // Jobs are immutable after create; the operator deletes + recreates.
    return ok(name, TYPE, 'update', Date.now(), { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const batch = ctx.clients.get('batch') as any;
    if (!batch) return err(name, TYPE, 'delete', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await batch.deleteNamespacedJob({ name, namespace, propagationPolicy: 'Foreground' });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

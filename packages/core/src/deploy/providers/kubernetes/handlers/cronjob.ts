/**
 * Kubernetes CronJob handler — `k8s.batch.cronjob`.
 *
 * Backs Compute.CronJob on Kubernetes. Schedule expression is the
 * standard 5-field cron (extractor normalizes named presets like
 * 'daily' to `0 0 * * *`).
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.batch.cronjob';
const SDK = '@kubernetes/client-node';

function buildCronJobBody(name: string, namespace: string, properties: Record<string, unknown>): unknown {
  const env = Object.entries((properties.env_vars as Record<string, string>) ?? {}).map(([n, value]) => ({
    name: n,
    value,
  }));
  return {
    apiVersion: 'batch/v1',
    kind: 'CronJob',
    metadata: {
      name,
      namespace,
      labels: { 'app.kubernetes.io/managed-by': 'ice', ...(properties.labels as Record<string, string>) },
    },
    spec: {
      schedule: (properties.schedule_expression as string) || '0 0 * * *',
      concurrencyPolicy: (properties.concurrency_policy as string) || 'Forbid',
      successfulJobsHistoryLimit: (properties.successful_jobs_history as number) ?? 3,
      failedJobsHistoryLimit: (properties.failed_jobs_history as number) ?? 1,
      jobTemplate: {
        spec: {
          template: {
            spec: {
              restartPolicy: 'OnFailure',
              containers: [
                {
                  name: 'app',
                  image: (properties.image as string) || '',
                  command: properties.command as string[] | undefined,
                  args: properties.args as string[] | undefined,
                  env: env.length ? env : undefined,
                },
              ],
            },
          },
        },
      },
    },
  };
}

export const cronjob_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const batch = ctx.clients.get('batch') as any;
    if (!batch) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes batch API', SDK);
    if (!properties.image) {
      return err(name, TYPE, 'create', start, 'CronJob requires properties.image (container image).');
    }
    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      try {
        await batch.createNamespacedCronJob({ namespace, body: buildCronJobBody(name, namespace, properties) });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `batch/CronJob/${namespace}/${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const batch = ctx.clients.get('batch') as any;
    if (!batch) return err(name, TYPE, 'update', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await batch.replaceNamespacedCronJob({
        name,
        namespace,
        body: buildCronJobBody(name, namespace, properties),
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const batch = ctx.clients.get('batch') as any;
    if (!batch) return err(name, TYPE, 'delete', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await batch.deleteNamespacedCronJob({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

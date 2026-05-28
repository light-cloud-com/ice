/**
 * Kubernetes StatefulSet handler — `k8s.apps.statefulset`.
 *
 * Backs Database.PostgreSQL / MySQL / Redis / MongoDB / Messaging.RabbitMQ /
 * Messaging.EventStream on K8s. The extractor picks image + ports +
 * volume-mount profile based on the canvas iceType.
 *
 * For DB blocks the extractor projects:
 *   - postgres: image=postgres:17-alpine, port=5432, mount=/var/lib/postgresql/data
 *   - mysql:    image=mysql:9, port=3306, mount=/var/lib/mysql
 *   - redis:    image=redis:7-alpine, port=6379
 *   - mongo:    image=mongo:8, port=27017, mount=/data/db
 *   - rabbitmq: image=rabbitmq:3.13, port=5672
 *   - kafka:    image=confluentinc/cp-kafka:7, port=9092
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.apps.statefulset';
const SDK = '@kubernetes/client-node';

function buildStatefulSetBody(name: string, namespace: string, properties: Record<string, unknown>): unknown {
  const labels = { app: name, 'app.kubernetes.io/managed-by': 'ice', ...(properties.labels as Record<string, string>) };
  const image = (properties.image as string) || '';
  const port = (properties.port as number) ?? 5432;
  const data_path = (properties.data_path as string) || '/data';
  const storage_size = (properties.storage_size_gi as number) ?? 10;
  const storage_class = properties.storage_class as string | undefined;
  const env = Object.entries((properties.env_vars as Record<string, string>) ?? {}).map(([n, value]) => ({
    name: n,
    value,
  }));
  return {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name, namespace, labels },
    spec: {
      replicas: (properties.replicas as number) ?? 1,
      serviceName: name,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels },
        spec: {
          containers: [
            {
              name: 'app',
              image,
              imagePullPolicy: (properties.image_pull_policy as string) || 'IfNotPresent',
              ports: [{ containerPort: port }],
              env: env.length ? env : undefined,
              volumeMounts: [{ name: 'data', mountPath: data_path }],
              resources: {
                requests: {
                  cpu: (properties.cpu_request as string) || '250m',
                  memory: (properties.memory_request as string) || '256Mi',
                },
                limits: {
                  cpu: (properties.cpu_limit as string) || '1',
                  memory: (properties.memory_limit as string) || '1Gi',
                },
              },
            },
          ],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: { name: 'data' },
          spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName: storage_class,
            resources: { requests: { storage: `${storage_size}Gi` } },
          },
        },
      ],
    },
  };
}

export const statefulset_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const apps = ctx.clients.get('apps') as any;
    if (!apps) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes apps API', SDK);
    if (!properties.image) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'StatefulSet requires properties.image (set via DB profile extractor or explicit).',
      );
    }
    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      const body = buildStatefulSetBody(name, namespace, properties);
      try {
        await apps.createNamespacedStatefulSet({ namespace, body });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `apps/StatefulSet/${namespace}/${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const apps = ctx.clients.get('apps') as any;
    if (!apps) return err(name, TYPE, 'update', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      const existing = await apps.readNamespacedStatefulSet({ name, namespace });
      // Only image + replicas + env are safely mutable on a StatefulSet.
      if (properties.image) existing.spec.template.spec.containers[0].image = properties.image;
      if (typeof properties.replicas === 'number') existing.spec.replicas = properties.replicas;
      await apps.replaceNamespacedStatefulSet({ name, namespace, body: existing });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const apps = ctx.clients.get('apps') as any;
    if (!apps) return err(name, TYPE, 'delete', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await apps.deleteNamespacedStatefulSet({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

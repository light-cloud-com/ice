/**
 * Azure Container Apps handler — `azure.containerApps.app`.
 *
 * Backs Compute.Container (serverless container variant) and
 * Compute.Worker on Azure. Container Apps run on a Managed
 * Environment that the handler auto-provisions on first deploy
 * (parallel to the ECS auto-cluster auto-bootstrap on AWS).
 *
 * Worker-mode (`service_type: 'worker'`) suppresses the public
 * ingress. Operators set `external: false` for private-only ingress
 * inside the managed environment.
 *
 * The handler is conservative on resources: 0.5 vCPU / 1 GiB by
 * default, autoscale 0..3 replicas (scale-to-zero for cost).
 */

import { extract_resource_group_from_id } from '../resource-group';
import { load_azure_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AzureHandlerContext, AzureResourceHandler } from '../types';

const TYPE = 'azure.containerapps.app';
const SDK = '@azure/arm-appcontainers';
const DEFAULT_ENV_NAME = 'ice-default-env';

async function ensure_managed_environment(ctx: AzureHandlerContext, resource_group: string): Promise<string> {
  const client = ctx.clients.get('container-apps') as any;
  if (!client) throw new Error('Container Apps SDK not available');
  const sdk = await load_azure_sdk(SDK);
  if (!sdk) throw new Error('Container Apps SDK not available');

  try {
    const existing = await client.managedEnvironments.get(resource_group, DEFAULT_ENV_NAME);
    if (existing?.id) return existing.id;
  } catch {
    // not found — create below
  }

  ctx.on_log?.(`Creating Container Apps managed environment ${DEFAULT_ENV_NAME}`);
  const created = await client.managedEnvironments.beginCreateOrUpdateAndWait(resource_group, DEFAULT_ENV_NAME, {
    location: ctx.location,
  });
  return created?.id ?? '';
}

export const container_apps_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('container-apps') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Container Apps', SDK);

    const image = properties.image as string | undefined;
    if (!image) return err(name, TYPE, 'create', start, 'Container Apps require properties.image');

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const environmentId =
        (properties.managed_environment_id as string) || (await ensure_managed_environment(ctx, resource_group));

      const isWorker = properties.service_type === 'worker';

      const result = await client.containerApps.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        managedEnvironmentId: environmentId,
        configuration: {
          activeRevisionsMode: 'Single',
          ingress: isWorker
            ? undefined
            : {
                external: properties.external !== false,
                targetPort: (properties.port as number) ?? 8080,
                transport: 'auto',
              },
          secrets: properties.secrets as Array<{ name: string; value: string }> | undefined,
        },
        template: {
          containers: [
            {
              name,
              image,
              resources: {
                cpu: (properties.cpu as number) ?? 0.5,
                memory: (properties.memory as string) || '1Gi',
              },
              env: Object.entries((properties.env_vars as Record<string, string>) || {}).map(([n, value]) => ({
                name: n,
                value,
              })),
            },
          ],
          scale: {
            minReplicas: (properties.min_replicas as number) ?? 0,
            maxReplicas: (properties.max_replicas as number) ?? 3,
          },
        },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('container-apps') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Container Apps SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.containerApps.update(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('container-apps') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Container Apps SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.containerApps.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

/**
 * Azure Container Registry Task handler — `azure.containerregistry.task`.
 *
 * Backs Source.Build on Azure (parallel to AWS CodeBuild + GCP Cloud
 * Build). ACR Tasks builds container images directly inside the
 * registry — the closest managed equivalent to CodeBuild's
 * GitHub → container-image flow.
 *
 * Requires a parent ACR registry; the canvas wires
 * `properties.registry_name` from a connected Compute.ContainerRegistry
 * block (or the operator sets it explicitly).
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.containerregistry.task';
const SDK = '@azure/arm-containerregistry';

export const acr_task_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('acr') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'ACR Tasks', SDK);

    const registry_name = properties.registry_name as string | undefined;
    if (!registry_name) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'ACR Task requires registry_name (wire a Compute.ContainerRegistry block or set explicitly).',
      );
    }

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.tasks.beginCreateAndWait(resource_group, registry_name, name, {
        location: (properties.location as string) || ctx.location,
        platform: { os: (properties.os as string) || 'Linux', architecture: (properties.arch as string) || 'amd64' },
        agentConfiguration: { cpu: (properties.cpu as number) ?? 2 },
        step: {
          type: 'Docker',
          contextPath: (properties.context_path as string) || properties.repository,
          dockerFilePath: (properties.dockerfile_path as string) || 'Dockerfile',
          imageNames: (properties.image_names as string[]) ?? [`${name}:{{.Run.ID}}`],
          isPushEnabled: true,
        },
        trigger: properties.repository
          ? {
              sourceTriggers: [
                {
                  name: 'sourceTrigger',
                  sourceRepository: {
                    sourceControlType: 'Github',
                    repositoryUrl: properties.repository as string,
                    branch: (properties.branch as string) || 'main',
                  },
                  sourceTriggerEvents: ['commit'],
                },
              ],
            }
          : undefined,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return ok(name, TYPE, 'update', Date.now(), { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('acr') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'ACR Tasks SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      // Task id shape: /.../registries/<reg>/tasks/<task>
      const registry_name = provider_id.match(/\/registries\/([^/]+)\//)?.[1] ?? '';
      await client.tasks.beginDeleteAndWait(resource_group, registry_name, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

/**
 * Artifact Registry Handler
 *
 * Handles: gcp.artifactregistry.repository — backs
 * Compute.ContainerRegistry on GCP (parallel to AWS ECR and Azure ACR).
 *
 * Format defaults to DOCKER. Standard mode (not virtual / remote)
 * because the canvas-driven flow is "push images, pull from
 * Cloud Run / GKE" — virtual + remote modes are deferred to a
 * follow-on properties knob.
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler } from '../types';

const TYPE = 'gcp.artifactregistry.repository';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return { resource_id: name, name, type: TYPE, action, success: false, error, duration_ms: Date.now() - start };
}

export const artifact_registry_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('artifactregistry') as any;
      if (!client)
        return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.ARTIFACT_REGISTRY, 'artifactregistry'));
      const [op] = await client.createRepository({
        parent: `projects/${ctx.project}/locations/${ctx.region}`,
        repositoryId: name,
        repository: {
          format: (properties.format as string) || 'DOCKER',
          mode: (properties.mode as string) || 'STANDARD_REPOSITORY',
          description: (properties.description as string) || `Created by ICE`,
        },
      });
      const [repo] = await op.promise();
      return result(name, 'create', start, {
        provider_id: repo?.name ?? `projects/${ctx.project}/locations/${ctx.region}/repositories/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return result(name, 'update', Date.now(), { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('artifactregistry') as any;
      if (!client) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.ARTIFACT_REGISTRY));
      const [op] = await client.deleteRepository({
        name: `projects/${ctx.project}/locations/${ctx.region}/repositories/${name}`,
      });
      await op.promise();
      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

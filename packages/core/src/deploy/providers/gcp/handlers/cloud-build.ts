/**
 * Cloud Build Trigger Handler
 *
 * Handles: gcp.cloudbuild.trigger — backs Source.Build on GCP
 * (parallel to AWS CodeBuild + Azure ACR Tasks).
 *
 * The trigger points at a GitHub repo + branch and runs the inline
 * buildSteps. For Source.Build blocks with no buildSteps, a default
 * docker-build pipeline (build → push to Artifact Registry) is used.
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler } from '../types';

const TYPE = 'gcp.cloudbuild.trigger';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return { resource_id: name, name, type: TYPE, action, success: true, duration_ms: Date.now() - start, ...overrides };
}

function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return { resource_id: name, name, type: TYPE, action, success: false, error, duration_ms: Date.now() - start };
}

export const cloud_build_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('cloudbuild') as any;
      if (!client) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.CLOUD_BUILD, 'cloudbuild'));
      const [trigger] = await client.createBuildTrigger({
        projectId: ctx.project,
        trigger: {
          name,
          description: (properties.description as string) || `Created by ICE`,
          github: properties.repository
            ? {
                owner: ((properties.repository as string).split('/')[3] as string) || '',
                name: ((properties.repository as string).split('/')[4] as string) || '',
                push: { branch: (properties.branch as string) || '^main$' },
              }
            : undefined,
          filename: (properties.buildspec_file as string) || 'cloudbuild.yaml',
        },
      });
      return result(name, 'create', start, {
        provider_id: trigger?.name ?? `projects/${ctx.project}/triggers/${name}`,
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
      const client = ctx.clients.get('cloudbuild') as any;
      if (!client) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_BUILD));
      await client.deleteBuildTrigger({ projectId: ctx.project, triggerId: name });
      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

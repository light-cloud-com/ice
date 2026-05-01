/**
 * Cloud Run Handler — Services and Jobs
 *
 * Handles: gcp.run.service, gcp.run.job
 */

import {
  SERVICE_NAMES,
  sdk_not_available,
  sdk_not_available_short,
  HANDLER_MESSAGES,
  BUILD_MESSAGES,
} from '../messages.js';
import { ensure_artifact_registry, build_from_source } from './cloud-build-helper.js';
import { result, fail, TYPE_SERVICE, TYPE_JOB } from './cloud-run/result-helpers.js';
import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';

export const cloud_run_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const type = properties.max_retries !== undefined ? 'gcp.run.job' : 'gcp.run.service';
    const region = (properties.region as string) || ctx.region;

    try {
      if (type === 'gcp.run.job') {
        return await create_job(name, properties, region, ctx, start);
      }
      return await create_service(name, properties, region, ctx, start);
    } catch (error) {
      return fail(name, type, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const is_job = provider_id.includes('/jobs/');
    const type = is_job ? 'gcp.run.job' : 'gcp.run.service';
    const region = extract_region(provider_id) || ctx.region;

    try {
      let image: string;
      try {
        image = await resolve_image(name, properties, region, ctx, ctx.on_log);
      } catch (err) {
        return fail(name, type, 'update', start, err instanceof Error ? err.message : String(err));
      }

      if (is_job) {
        const jobs_client = ctx.clients.get('run.jobs') as any;
        if (!jobs_client)
          return fail(name, type, 'update', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_RUN_JOBS));

        const [operation] = await jobs_client.updateJob({
          job: {
            name: `projects/${ctx.project}/locations/${region}/jobs/${name}`,
            template: {
              template: {
                containers: [
                  {
                    image,
                    env: build_env_vars(properties.env_vars),
                    resources: {
                      limits: { cpu: properties.cpu || '1', memory: properties.memory || '512Mi' },
                    },
                  },
                ],
                maxRetries: properties.max_retries ?? 3,
                timeout: properties.timeout || '600s',
              },
            },
            labels: properties.labels as Record<string, string>,
          },
        });
        await operation.promise();

        return result(name, type, 'update', start, {
          provider_id,
          outputs: { deployed_image: image },
        });
      } else {
        const services_client = ctx.clients.get('run.services') as any;
        if (!services_client)
          return fail(name, type, 'update', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_RUN));

        const invokerIamDisabled = properties.allow_unauthenticated !== false;

        const [operation] = await services_client.updateService({
          service: {
            name: `projects/${ctx.project}/locations/${region}/services/${name}`,
            invokerIamDisabled,
            template: {
              containers: [
                {
                  image,
                  ports: [{ containerPort: properties.port || 8080 }],
                  env: build_env_vars(properties.env_vars),
                  resources: {
                    limits: { cpu: properties.cpu || '1', memory: properties.memory || '512Mi' },
                  },
                },
              ],
              scaling: {
                minInstanceCount: properties.min_instances ?? 0,
                maxInstanceCount: properties.max_instances ?? 3,
              },
            },
            labels: properties.labels as Record<string, string>,
          },
        });
        await operation.promise();

        const outputs = await fetch_service_outputs(ctx, provider_id, properties, image);

        // Set IAM policy for public access if allow_unauthenticated is enabled (ENGINE-18)
        if (properties.allow_unauthenticated !== false && provider_id) {
          try {
            const iamUrl = `https://run.googleapis.com/v2/${provider_id}:setIamPolicy`;
            await ctx.rest_client.post(iamUrl, {
              policy: {
                bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }],
              },
            });
            ctx.on_log?.('Set public access (allUsers invoker)');
          } catch (iamErr: any) {
            ctx.on_log?.(`Warning: Could not set public access: ${iamErr.message || iamErr}`);
            // Non-fatal — service is deployed but may not be publicly accessible
          }
        }

        return result(name, type, 'update', start, { provider_id, outputs });
      }
    } catch (error) {
      return fail(name, type, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const is_job = provider_id.includes('/jobs/');
    const type = is_job ? 'gcp.run.job' : 'gcp.run.service';
    const region = extract_region(provider_id) || ctx.region;

    try {
      if (is_job) {
        const jobs_client = ctx.clients.get('run.jobs') as any;
        if (!jobs_client)
          return fail(name, type, 'delete', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_RUN_JOBS));

        const [operation] = await jobs_client.deleteJob({
          name: `projects/${ctx.project}/locations/${region}/jobs/${name}`,
        });
        await operation.promise();
      } else {
        const services_client = ctx.clients.get('run.services') as any;
        if (!services_client)
          return fail(name, type, 'delete', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_RUN));

        const [operation] = await services_client.deleteService({
          name: `projects/${ctx.project}/locations/${region}/services/${name}`,
        });
        await operation.promise();
      }

      // Also delete the Artifact Registry images that ICE pushed for this
      // service. Without this, every deploy leaves a container image in
      // Artifact Registry that the user pays for indefinitely. Best-effort:
      // we tolerate 404 (already gone), permission errors, and missing
      // repositories without failing the Cloud Run delete itself.
      await deleteArtifactRegistryImagesForService(ctx, name, region, type).catch((err) => {
        ctx.on_log?.(
          `[cloud-run] Cloud Run service deleted but Artifact Registry image cleanup failed: ${err?.message || err}. ` +
            `You can manually delete the image at https://console.cloud.google.com/artifacts/docker/${ctx.project}/${region}/ice-deploy/${name}`,
        );
      });

      return result(name, type, 'delete', start);
    } catch (error) {
      return fail(name, type, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },

  /**
   * Phase 7 — describe for drift detection. Projects the Cloud Run service
   * to the fields ICE manages (image, env vars, scaling, concurrency).
   */
  async describe(name, provider_id, ctx) {
    try {
      const is_job = provider_id.includes('/jobs/');
      const region = extract_region(provider_id) || ctx.region;
      if (is_job) {
        const jobs_client = ctx.clients.get('run.jobs') as any;
        if (!jobs_client) return { exists: false, error: 'Cloud Run jobs client unavailable' };
        const [job] = await jobs_client.getJob({
          name: `projects/${ctx.project}/locations/${region}/jobs/${name}`,
        });
        return {
          exists: true,
          raw: job,
          properties: {
            name: job.name,
            labels: job.labels || {},
            image: job.template?.template?.containers?.[0]?.image,
          },
        };
      }
      const services_client = ctx.clients.get('run.services') as any;
      if (!services_client) return { exists: false, error: 'Cloud Run services client unavailable' };
      const [svc] = await services_client.getService({
        name: `projects/${ctx.project}/locations/${region}/services/${name}`,
      });
      const container = svc.template?.containers?.[0];
      return {
        exists: true,
        raw: svc,
        properties: {
          name: svc.name,
          labels: svc.labels || {},
          image: container?.image,
          env: (container?.env || []).map((e: any) => ({ name: e.name, value: e.value })),
          min_instances: svc.template?.scaling?.minInstanceCount,
          max_instances: svc.template?.scaling?.maxInstanceCount,
          concurrency: container?.resources?.limits?.cpu,
          url: svc.uri,
        },
      };
    } catch (error: any) {
      const code = error?.code || error?.response?.status;
      if (code === 5 || code === 404) return { exists: false };
      return { exists: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Delete every Artifact Registry container image ICE pushed for this
 * Cloud Run service. The image name in Artifact Registry matches the
 * service name (see `resolve_image` above — `${region}-docker.pkg.dev/
 * ${project}/ice-images/${name}:latest`), so we can target a single
 * repository path and delete all tags + manifests under it.
 *
 * Best-effort: 404 and permission errors are tolerated. The Cloud Run
 * delete itself should not fail just because the image couldn't be
 * cleaned up — we log and move on.
 */
async function deleteArtifactRegistryImagesForService(
  ctx: GCPHandlerContext,
  serviceName: string,
  region: string,
  _type: string,
): Promise<void> {
  const arRepo = 'ice-images';
  const base = `https://artifactregistry.googleapis.com/v1/projects/${ctx.project}/locations/${region}/repositories/${arRepo}`;

  // 1. List all tags under the package so we can delete each one
  //    (GCP won't let you delete a manifest while tags still reference it).
  const packagePath = `${base}/packages/${encodeURIComponent(serviceName)}`;
  try {
    // Delete the whole package. This cascades to all versions and tags.
    // If the package doesn't exist we'll get a 404, which is fine.
    const op = (await ctx.rest_client.delete(packagePath)) as any;
    // Artifact Registry delete returns a long-running operation — we don't
    // need to wait for it to complete, the cascade happens asynchronously.
    void op;
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('notFound')) {
      return;
    }
    throw err;
  }
}

async function resolve_image(
  name: string,
  properties: Record<string, unknown>,
  region: string,
  ctx: GCPHandlerContext,
  onLog?: (msg: string) => void,
  reportStep?: (index: number, label: string) => void,
): Promise<string> {
  const image = properties.image as string;
  const repository = properties.repository as string;

  // Repository takes priority — if the user linked a repo, build from source
  // even if a previous deploy left an image value on the card node.
  if (repository) {
    const branch = (properties.branch as string) || 'main';
    const arRepo = 'ice-images';
    const imageUri = `${region}-docker.pkg.dev/${ctx.project}/${arRepo}/${name}:latest`;

    onLog?.(BUILD_MESSAGES.BUILDING_FROM_SOURCE(repository));
    onLog?.(BUILD_MESSAGES.CREATING_ARTIFACT_REGISTRY(region));

    // Step 1 of the cloud-run create — ensure the AR repo is in place.
    reportStep?.(1, 'Ensuring artifact registry');
    await ensure_artifact_registry(ctx, region, arRepo);

    // Step 2 of the cloud-run create — kick off the Cloud Build. The
    // build helper emits sub-state labels at its OWN index (1 within its
    // caller-supplied space); we forward those at our outer index 2 so
    // the bar shows refreshing labels under the same step. See the
    // BUILD_STEP_INDEX note in cloud-build-helper.ts.
    reportStep?.(2, 'Building from source');
    const forwardBuildStep = reportStep
      ? (_inner_index: number, label: string) => reportStep(2, label)
      : undefined;

    return await build_from_source(ctx, region, repository, branch, imageUri, onLog, forwardBuildStep);
  }

  // Fallback: use explicit image (no repo set)
  if (image) return image;

  throw new Error(HANDLER_MESSAGES.CLOUD_RUN_NO_SOURCE);
}

async function fetch_service_outputs(
  ctx: GCPHandlerContext,
  provider_id: string,
  properties: Record<string, unknown>,
  deployedImage: string,
): Promise<Record<string, unknown>> {
  try {
    const svc = (await ctx.rest_client.get(`https://run.googleapis.com/v2/${provider_id}`)) as any;
    return {
      url: svc?.uri || '',
      region: properties.region,
      min_instances: properties.min_instances,
      max_instances: properties.max_instances,
      deployed_image: deployedImage,
    };
  } catch {
    return { deployed_image: deployedImage };
  }
}

async function create_service(
  name: string,
  properties: Record<string, unknown>,
  region: string,
  ctx: GCPHandlerContext,
  start: number,
): Promise<ResourceDeployResult> {
  const services_client = ctx.clients.get('run.services') as any;
  if (!services_client)
    return fail(name, 'gcp.run.service', 'create', start, sdk_not_available(SERVICE_NAMES.CLOUD_RUN, 'run.services'));

  // Outer milestones for the cloud-run create. When a repository is wired,
  // the slow path is steps 1-2 (artifact registry + build). When an explicit
  // image is provided, those steps no-op and the user goes straight to step
  // 3 (deploying the revision). Total stays at 4 in both cases — the build
  // helper's sub-states refresh the label at index 2.
  const TOTAL_STEPS = 4;
  const reportStep = (index: number, label: string) => {
    ctx.on_step?.(name, { label, index, total: TOTAL_STEPS });
  };

  let image: string;
  try {
    image = await resolve_image(name, properties, region, ctx, ctx.on_log, reportStep);
  } catch (err) {
    return fail(name, 'gcp.run.service', 'create', start, err instanceof Error ? err.message : String(err));
  }

  // invokerIamDisabled: Cloud Run v2 service property (schema: Cloud.Cloudrunv2service)
  // Disables IAM permission check for run.routes.invoke — makes the URL publicly reachable
  // without a separate setIamPolicy call.
  const invokerIamDisabled = properties.allow_unauthenticated !== false;

  reportStep(3, 'Deploying revision');
  const [operation] = await services_client.createService({
    parent: `projects/${ctx.project}/locations/${region}`,
    serviceId: name,
    service: {
      invokerIamDisabled,
      template: {
        containers: [
          {
            image,
            ports: [{ containerPort: properties.port || 8080 }],
            env: build_env_vars(properties.env_vars),
            resources: {
              limits: { cpu: properties.cpu || '1', memory: properties.memory || '512Mi' },
            },
          },
        ],
        scaling: {
          minInstanceCount: properties.min_instances ?? 0,
          maxInstanceCount: properties.max_instances ?? 3,
        },
      },
      labels: properties.labels as Record<string, string>,
    },
  });
  reportStep(4, 'Waiting for revision to serve traffic');
  await operation.promise();

  const provider_id = `projects/${ctx.project}/locations/${region}/services/${name}`;

  const outputs = await fetch_service_outputs(ctx, provider_id, properties, image);

  // Set IAM policy for public access if allow_unauthenticated is enabled (ENGINE-18)
  if (properties.allow_unauthenticated !== false && provider_id) {
    try {
      const iamUrl = `https://run.googleapis.com/v2/${provider_id}:setIamPolicy`;
      await ctx.rest_client.post(iamUrl, {
        policy: {
          bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }],
        },
      });
      ctx.on_log?.('Set public access (allUsers invoker)');
    } catch (iamErr: any) {
      ctx.on_log?.(`Warning: Could not set public access: ${iamErr.message || iamErr}`);
      // Non-fatal — service is deployed but may not be publicly accessible
    }
  }

  return result(name, 'gcp.run.service', 'create', start, { provider_id, outputs });
}

async function create_job(
  name: string,
  properties: Record<string, unknown>,
  region: string,
  ctx: GCPHandlerContext,
  start: number,
): Promise<ResourceDeployResult> {
  const jobs_client = ctx.clients.get('run.jobs') as any;
  if (!jobs_client)
    return fail(name, 'gcp.run.job', 'create', start, sdk_not_available(SERVICE_NAMES.CLOUD_RUN_JOBS, 'run.jobs'));

  // Same milestone shape as create_service: AR + build = steps 1-2, deploy
  // = step 3, wait = step 4.
  const TOTAL_STEPS = 4;
  const reportStep = (index: number, label: string) => {
    ctx.on_step?.(name, { label, index, total: TOTAL_STEPS });
  };

  let image: string;
  try {
    image = await resolve_image(name, properties, region, ctx, ctx.on_log, reportStep);
  } catch (err) {
    return fail(name, 'gcp.run.job', 'create', start, err instanceof Error ? err.message : String(err));
  }

  reportStep(3, 'Deploying job');
  const [operation] = await jobs_client.createJob({
    parent: `projects/${ctx.project}/locations/${region}`,
    jobId: name,
    job: {
      template: {
        template: {
          containers: [
            {
              image,
              env: build_env_vars(properties.env_vars),
              resources: {
                limits: { cpu: properties.cpu || '1', memory: properties.memory || '512Mi' },
              },
            },
          ],
          maxRetries: properties.max_retries ?? 3,
          timeout: properties.timeout || '600s',
        },
      },
      labels: properties.labels as Record<string, string>,
    },
  });
  reportStep(4, 'Waiting for job to be ready');
  await operation.promise();

  const provider_id = `projects/${ctx.project}/locations/${region}/jobs/${name}`;
  return result(name, 'gcp.run.job', 'create', start, {
    provider_id,
    outputs: { deployed_image: image },
  });
}

function build_env_vars(env_vars: unknown): Array<{ name: string; value: string }> | undefined {
  if (!env_vars || typeof env_vars !== 'object') return undefined;
  return Object.entries(env_vars as Record<string, string>).map(([name, value]) => ({
    name,
    value,
  }));
}

function extract_region(provider_id: string): string {
  const match = provider_id.match(/locations\/([^/]+)/);
  return match?.[1] ?? 'us-central1';
}

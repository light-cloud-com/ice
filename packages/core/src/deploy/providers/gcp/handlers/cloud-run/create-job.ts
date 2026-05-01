/**
 * Cloud Run job creation. Extracted from `cloud-run.ts` (rf-crun-3).
 *
 * Mirrors `create_service` but emits a Cloud Run v2 job rather than a
 * service. Same 4-step milestone shape: AR + build = steps 1-2, deploy
 * = step 3, wait = step 4.
 */
import { SERVICE_NAMES, sdk_not_available } from '../../messages.js';
import { resolve_image } from './image-resolver.js';
import { fail, result, TYPE_JOB } from './result-helpers.js';
import { build_env_vars } from './utils.js';
import type { ResourceDeployResult } from '../../../../types.js';
import type { GCPHandlerContext } from '../../types.js';

export async function create_job(
  name: string,
  properties: Record<string, unknown>,
  region: string,
  ctx: GCPHandlerContext,
  start: number,
): Promise<ResourceDeployResult> {
  const jobs_client = ctx.clients.get('run.jobs') as any;
  if (!jobs_client)
    return fail(name, TYPE_JOB, 'create', start, sdk_not_available(SERVICE_NAMES.CLOUD_RUN_JOBS, 'run.jobs'));

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
    return fail(name, TYPE_JOB, 'create', start, err instanceof Error ? err.message : String(err));
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
  return result(name, TYPE_JOB, 'create', start, {
    provider_id,
    outputs: { deployed_image: image },
  });
}

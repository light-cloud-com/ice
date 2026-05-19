/**
 * Cloud Run service creation. Extracted from `cloud-run.ts` (rf-crun-3).
 *
 * Pipeline:
 *   1. Resolve image (repo build path or explicit image) — emits
 *      progress steps 1-2 internally when building from source.
 *   2. Step 3 — Call `services.createService`.
 *   3. Step 4 — Wait for the long-running operation.
 *   4. Fetch service outputs (URI, scaling).
 *   5. Best-effort public-access grant via setIamPolicy.
 *
 * Total milestone count is 4 in both paths so the progress bar stays
 * stable between repo-builds and direct-image deploys; the build helper
 * refreshes labels at index 2 without advancing the counter.
 */
import { SERVICE_NAMES, sdk_not_available } from '../../messages';
import { grant_public_access } from './iam';
import { resolve_image } from './image-resolver';
import { fail, result, TYPE_SERVICE } from './result-helpers';
import { build_env_vars, fetch_service_outputs } from './utils';
import type { ResourceDeployResult } from '../../../../types';
import type { GCPHandlerContext } from '../../types';

export async function create_service(
  name: string,
  properties: Record<string, unknown>,
  region: string,
  ctx: GCPHandlerContext,
  start: number,
): Promise<ResourceDeployResult> {
  const services_client = ctx.clients.get('run.services') as any;
  if (!services_client)
    return fail(name, TYPE_SERVICE, 'create', start, sdk_not_available(SERVICE_NAMES.CLOUD_RUN, 'run.services'));

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
    return fail(name, TYPE_SERVICE, 'create', start, err instanceof Error ? err.message : String(err));
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
  await grant_public_access(ctx, provider_id, properties);

  return result(name, TYPE_SERVICE, 'create', start, { provider_id, outputs });
}

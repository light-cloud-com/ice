/**
 * GCP Backend Bucket Handler (Phase 8)
 *
 * Handles `gcp.compute.backendBucket`. A backend bucket is what a URL map
 * points at when you want a load balancer to serve static content from a
 * Cloud Storage bucket. Without this resource, the old load balancer chain
 * pointed at an empty backend service and returned 404 — the "deploy
 * succeeds but the site isn't reachable" gap.
 *
 * This handler is created implicitly by the card translator whenever a
 * StaticSite block is connected to an Internet block. Users never drag a
 * backend bucket onto the canvas directly.
 */

import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages.js';
import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';

const TYPE = 'gcp.compute.backendBucket';
const BASE_URL = 'https://compute.googleapis.com/compute/v1';

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
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}

export const backend_bucket_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    try {
      const bucketName = String(properties.bucket_name || '').trim();
      if (!bucketName) {
        return fail(name, 'create', start, 'bucket_name is required to create a backend bucket.');
      }

      // Pass labels through to the GCP create call so orphan cleanup
      // can identify ICE-managed backend buckets via the
      // `ice-managed=true` label. Without this, every backend bucket
      // ICE creates is invisible to `cleanupOrphanedIceResources` and
      // the user can never escape the 3-bucket quota even after
      // destroying old projects, because the cleanup says
      // "deleted 0 resources" while the buckets sit there unlabeled.
      const labels = (properties.labels as Record<string, string> | undefined) || {};
      const op = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/global/backendBuckets`, {
        name,
        bucketName,
        enableCdn: properties.enable_cdn !== false,
        // Compute Engine v1 BackendBucket schema accepts labels at the
        // top level. GCP Compute also requires `labelFingerprint` for
        // updates but not for creates — this only fires on initial
        // create so we can omit the fingerprint.
        labels: Object.keys(labels).length > 0 ? labels : undefined,
      })) as any;
      if (op?.name) await wait_for_compute_op(ctx, op.name);

      // Belt-and-suspenders: if the create call silently dropped the
      // labels (older Compute API versions ignore unknown fields), set
      // them via the dedicated `setLabels` endpoint after the resource
      // exists. We need the labelFingerprint for that, fetched from a
      // GET on the freshly-created resource.
      if (Object.keys(labels).length > 0) {
        try {
          const created = (await ctx.rest_client.get(
            `${BASE_URL}/projects/${ctx.project}/global/backendBuckets/${name}`,
          )) as any;
          const haveLabels = created?.labels && Object.keys(created.labels).length > 0;
          if (!haveLabels && created?.labelFingerprint) {
            const setLabelsOp = (await ctx.rest_client.post(
              `${BASE_URL}/projects/${ctx.project}/global/backendBuckets/${name}/setLabels`,
              { labels, labelFingerprint: created.labelFingerprint },
            )) as any;
            if (setLabelsOp?.name) await wait_for_compute_op(ctx, setLabelsOp.name);
          }
        } catch {
          // Non-fatal — if labels can't be set the resource still works,
          // it just won't be auto-cleanable until manually labeled.
        }
      }

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/global/backendBuckets/${name}`,
        outputs: { bucket_name: bucketName, cdn_enabled: properties.enable_cdn !== false },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ALREADY_EXISTS') || msg.includes('alreadyExists')) {
        return result(name, 'create', start, {
          provider_id: `projects/${ctx.project}/global/backendBuckets/${name}`,
          outputs: { bucket_name: properties.bucket_name },
        });
      }
      // Quota exhaustion is the #1 failure mode for this resource type
      // because GCP ships projects with a default limit of 3 backend
      // buckets. Give the user a clean message + the exact next action.
      if (msg.includes('QUOTA_EXCEEDED') || msg.includes("Quota 'BACKEND_BUCKETS'")) {
        return fail(
          name,
          'create',
          start,
          'Backend bucket quota exceeded (GCP default limit is 3 per project). ' +
            'Either destroy old deployments via the Deploy panel (best), delete orphaned backend buckets in the GCP console, ' +
            `or request a quota increase at https://console.cloud.google.com/iam-admin/quotas?project=${ctx.project}&filter=metric:BACKEND-BUCKETS-per-project. ` +
            'ICE can also clean up orphaned backend buckets automatically — see the Cleanup Orphans action in the deploy panel.',
        );
      }
      return fail(name, 'create', start, msg);
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    // Backend buckets are cheap to recreate and their only meaningful
    // mutable property is CDN enablement. Treat update as a no-op for now;
    // property changes surface as replace in the plan preview (Phase 3).
    const start = Date.now();
    return result(name, 'update', start, { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();

    try {
      const op = (await ctx.rest_client.delete(
        `${BASE_URL}/projects/${ctx.project}/global/backendBuckets/${name}`,
      )) as any;
      if (op?.name) await wait_for_compute_op(ctx, op.name);
      return result(name, 'delete', start);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('NOT_FOUND') || msg.includes('404')) {
        return result(name, 'delete', start);
      }
      return fail(name, 'delete', start, msg);
    }
  },

  async describe(name, _provider_id, ctx) {
    try {
      const bb = (await ctx.rest_client.get(
        `${BASE_URL}/projects/${ctx.project}/global/backendBuckets/${name}`,
      )) as any;
      if (!bb) return { exists: false };
      return {
        exists: true,
        raw: bb,
        properties: {
          name: bb.name,
          bucket_name: bb.bucketName,
          enable_cdn: bb.enableCdn === true,
        },
      };
    } catch (error: any) {
      const code = error?.response?.status || error?.code;
      if (code === 404) return { exists: false };
      return { exists: false, error: error?.message || String(error) };
    }
  },
};

async function wait_for_compute_op(ctx: GCPHandlerContext, op_name: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 900_000) {
    const op = (await ctx.rest_client.get(
      `${BASE_URL}/projects/${ctx.project}/global/operations/${op_name}`,
    )) as any;
    if (op?.status === 'DONE') {
      if (op.error) throw new Error(operation_failed(SERVICE_NAMES.COMPUTE, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.COMPUTE));
}

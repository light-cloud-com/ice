/**
 * Backend creation + verification for the load-balancer handler.
 * Extracted from `load-balancer.ts` (rf-lbal-3).
 *
 * Three concerns live here:
 *   1. `ignore_conflict` — make NEG / backend-service creation
 *      idempotent across partial-deploy retries by swallowing
 *      409/ALREADY_EXISTS errors only.
 *   2. `verify_backend_bucket_exists` — fail-fast if the URL map
 *      references a backend bucket that didn't actually create. GCP
 *      accepts URL-map references to non-existent buckets at deploy
 *      time and only 404s on real traffic, which makes "deploy
 *      succeeded" a lie. Returning a string is the error path; null is
 *      "OK".
 *   3. `create_serverless_backend` + `create_default_backend_service`
 *      — provisioning helpers that actually issue the POSTs.
 */
import { wait_for_compute_op } from './compute-ops.js';
import { BASE_URL } from './result-helpers.js';
import type { GCPHandlerContext } from '../../types.js';

/** Host rule shape supplied by the card-translator. */
export interface HostRule {
  host?: string;
  backendName: string;
  backendType?: 'bucket' | 'service';
  sourceServiceName?: string;
}

/**
 * Run `p` and swallow 409 / `alreadyExists` / `ALREADY_EXISTS` errors.
 * Other errors propagate. Used to make NEG + backend-service creation
 * idempotent for partial-deploy retries.
 */
export async function ignore_conflict(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('409') || msg.includes('alreadyExists') || msg.includes('ALREADY_EXISTS')) {
      return; // already existed, safe to continue
    }
    throw err;
  }
}

/**
 * Verify a backend bucket actually exists. Returns `null` if the bucket
 * is reachable, or an actionable error message when the GET 404s — the
 * caller surfaces the message in the deploy result so the user knows
 * the URL map will route to nothing.
 */
export async function verify_backend_bucket_exists(
  ctx: GCPHandlerContext,
  bucketName: string,
): Promise<string | null> {
  try {
    await ctx.rest_client.get(`${BASE_URL}/projects/${ctx.project}/global/backendBuckets/${bucketName}`);
    return null;
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('404') || msg.includes('notFound') || msg.includes('NOT_FOUND')) {
      return (
        `Backend bucket '${bucketName}' does not exist. This usually means the backend bucket ` +
        'failed to create earlier in this deploy — check the backend bucket resource in the results for the underlying reason ' +
        '(commonly QUOTA_EXCEEDED on the default 3-backend-bucket limit).'
      );
    }
    return `Failed to verify backend bucket exists: ${msg}`;
  }
}

/**
 * Create a Serverless NEG + global backend service for a Cloud Run /
 * container target. Idempotent — both create calls run through
 * `ignore_conflict`, so a partial-deploy retry won't crash on existing
 * resources.
 *
 * Returns `null` on success, or an error string when the rule is
 * missing the `sourceServiceName` field (translator bug — never happens
 * in production, but we return rather than throw so the caller can
 * surface a clean fail result).
 */
export async function create_serverless_backend(
  ctx: GCPHandlerContext,
  rule: HostRule,
  properties: Record<string, unknown>,
  reportStep: (index: number, label: string) => void,
): Promise<string | null> {
  if (!rule.sourceServiceName) {
    return (
      `Host rule for backend '${rule.backendName}' is missing sourceServiceName — the translator ` +
      'should have set this when wiring a Cloud Run / container backend. This is a bug in card-translator.ts.'
    );
  }
  const negName = `${rule.backendName}-neg`;
  const negBase = `${BASE_URL}/projects/${ctx.project}/regions/${ctx.region}/networkEndpointGroups`;

  reportStep(1, `Creating Serverless NEG for ${rule.sourceServiceName}`);
  await ignore_conflict(
    (async () => {
      const negOp = (await ctx.rest_client.post(negBase, {
        name: negName,
        networkEndpointType: 'SERVERLESS',
        cloudRun: { service: rule.sourceServiceName },
      })) as any;
      if (negOp?.name) await wait_for_compute_op(ctx, negOp.name);
    })(),
  );

  reportStep(1, `Creating backend service ${rule.backendName}`);
  await ignore_conflict(
    (async () => {
      const bsOp = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/global/backendServices`, {
        name: rule.backendName,
        loadBalancingScheme: 'EXTERNAL_MANAGED',
        protocol: 'HTTPS',
        timeoutSec: properties.timeout_sec || 30,
        backends: [
          {
            group: `projects/${ctx.project}/regions/${ctx.region}/networkEndpointGroups/${negName}`,
          },
        ],
        labels: properties.labels || {},
      })) as any;
      if (bsOp?.name) await wait_for_compute_op(ctx, bsOp.name);
    })(),
  );
  return null;
}

/**
 * Create the default backend service used when no host rules and no
 * explicit `backend_bucket_name` are provided. This is the
 * pre-PublicEndpoint backwards-compatible path.
 *
 * Returns the backend service name so the caller can build the URL
 * map's defaultService reference.
 */
export async function create_default_backend_service(
  ctx: GCPHandlerContext,
  name: string,
  properties: Record<string, unknown>,
): Promise<string> {
  const backendServiceName = `${name}-backend`;
  const backendOp = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/global/backendServices`, {
    name: backendServiceName,
    loadBalancingScheme: properties.scheme || 'EXTERNAL',
    protocol: properties.backend_protocol || 'HTTP',
    timeoutSec: properties.timeout_sec || 30,
    labels: properties.labels || {},
  })) as any;
  if (backendOp?.name) await wait_for_compute_op(ctx, backendOp.name);
  return backendServiceName;
}

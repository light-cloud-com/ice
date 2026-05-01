/**
 * Pure helpers for the Cloud Run handler. Extracted from `cloud-run.ts`
 * (rf-crun-2). No GCP SDK calls — these operate on plain inputs +
 * `ctx.rest_client` only.
 */
import type { GCPHandlerContext } from '../../types.js';

/**
 * Convert ICE's `env_vars` property (an object map) into the array
 * shape the Cloud Run v2 API wants under `template.containers[].env`.
 *
 * Tolerant of `null` / `undefined` / non-object inputs — those return
 * `undefined` so the caller can omit the `env` key entirely instead of
 * sending an empty array (which the API treats as "clear all env").
 */
export function build_env_vars(env_vars: unknown): Array<{ name: string; value: string }> | undefined {
  if (!env_vars || typeof env_vars !== 'object') return undefined;
  return Object.entries(env_vars as Record<string, string>).map(([name, value]) => ({
    name,
    value,
  }));
}

/**
 * Pull the GCP region out of a Cloud Run provider_id like
 * `projects/p/locations/us-central1/services/foo`.
 *
 * Used by `update`, `delete`, and `describe` to resolve the region
 * without forcing the caller to thread it through. Falls back to
 * `us-central1` if the regex doesn't match (defensive — every legitimate
 * Cloud Run resource_id contains a `/locations/<region>/` segment).
 */
export function extract_region(provider_id: string): string {
  const match = provider_id.match(/locations\/([^/]+)/);
  return match?.[1] ?? 'us-central1';
}

/**
 * Read the live Cloud Run service back via REST so we can populate
 * `outputs.url` from the freshly-allocated service URI. Best-effort:
 * if the GET fails, we still return a useful subset (just the
 * deployed image) so the result row isn't completely empty.
 */
export async function fetch_service_outputs(
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

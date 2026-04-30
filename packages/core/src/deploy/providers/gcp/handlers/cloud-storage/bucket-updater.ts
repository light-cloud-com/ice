/**
 * Update-only bucket-mutation helpers. Extracted from
 * `cloud-storage.ts` update() (rf-cstor-6 + rf-cstor-7).
 */

import type { GCPHandlerContext } from '../../types.js';

/**
 * Apply labels + lifecycle + versioning patches if present. Throws on
 * any underlying GCS API failure — the caller is expected to wrap in
 * a try/catch and surface as a `fail()` deploy result.
 *
 * Each property is applied only when present in the input. The three
 * GCS APIs are dispatched separately:
 *
 *   labels      → `bucket.setLabels(...)`
 *   lifecycle   → `bucket.setMetadata({ lifecycle })`
 *   versioning  → `bucket.setMetadata({ versioning: { enabled } })`
 *
 * Versioning uses `!!properties.versioning` so `false`/`null`/`""` all
 * disable while `true`/non-empty truthy enables.
 */
export async function applySimpleProperties(
  bucket: any,
  properties: Record<string, unknown>,
): Promise<void> {
  if (properties.labels) {
    await bucket.setLabels(properties.labels);
  }
  if (properties.lifecycle) {
    await bucket.setMetadata({ lifecycle: properties.lifecycle });
  }
  if (properties.versioning !== undefined) {
    await bucket.setMetadata({ versioning: { enabled: !!properties.versioning } });
  }
}

/**
 * Prepare an existing bucket for the legacy-ACL fallback path on
 * update by disabling Uniform Bucket Level Access (UBLA) when it's
 * currently enabled. Existing buckets from earlier ICE versions have
 * UBLA on by default, which BLOCKS the legacy ACL system. We migrate
 * them before the ACL fallback can work.
 *
 * If `storage.uniformBucketLevelAccess` org policy is enforced, the
 * disable will fail and the function returns `ublaForcedOn: true`
 * (signal to the caller that the ACL fallback step must be skipped).
 *
 * Non-UBLA disable errors that hit the inner catch are re-thrown to
 * the outer catch, which logs them and still returns
 * `ublaForcedOn: true` (degraded path: try IAM-only). The original
 * inline behavior intentionally re-threw inside, then caught outside
 * — preserved verbatim here.
 */
export async function prepareForAclFallback(
  bucket: any,
  name: string,
  ctx: GCPHandlerContext,
): Promise<{ ublaForcedOn: boolean }> {
  let ublaForcedOn = false;
  try {
    const [meta] = await bucket.getMetadata().catch(() => [null]);
    const ublaEnabled = meta?.iamConfiguration?.uniformBucketLevelAccess?.enabled === true;
    if (ublaEnabled) {
      ctx.on_log?.(
        `[cloud-storage] Disabling Uniform Bucket Level Access on ${name} to enable legacy ACL fallback path.`,
      );
      try {
        await bucket.setMetadata({
          iamConfiguration: {
            uniformBucketLevelAccess: { enabled: false },
            publicAccessPrevention: 'inherited',
          },
        });
      } catch (disableErr: any) {
        const disableMsg = disableErr instanceof Error ? disableErr.message : String(disableErr);
        const isUblaConstraint =
          disableMsg.includes('storage.uniformBucketLevelAccess') ||
          disableMsg.includes('uniformBucketLevelAccess');
        if (isUblaConstraint) {
          ublaForcedOn = true;
          ctx.on_log?.(
            `[cloud-storage] Cannot disable UBLA on ${name}: 'storage.uniformBucketLevelAccess' org policy is enforced. ` +
              `Public access will rely solely on IAM (legacy ACL fallback unavailable).`,
          );
        } else {
          throw disableErr;
        }
      }
    }
  } catch (ublaErr: any) {
    // Non-fatal — surface but continue. We'll still try IAM.
    ctx.on_log?.(
      `[cloud-storage] Could not disable UBLA on ${name}: ${ublaErr instanceof Error ? ublaErr.message : ublaErr}. Will try IAM grant only.`,
    );
    ublaForcedOn = true;
  }
  return { ublaForcedOn };
}

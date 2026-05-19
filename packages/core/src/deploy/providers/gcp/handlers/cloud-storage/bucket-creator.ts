/**
 * Two-tier bucket creation + adoption logic, extracted from
 * `cloud-storage.ts` create() (rf-cstor-3).
 *
 * The flow is:
 *   1. Try `storage.createBucket(name, createOptions)` with the
 *      caller-provided options (typically optimistic: UBLA off + ACL
 *      bits on for public buckets).
 *   2. If creation fails:
 *        a. "Already exists" (409 / `you already own it` / `already
 *           own this bucket`) → ADOPT path: fetch metadata, attempt
 *           UBLA-disable so the legacy ACL fallback can run later.
 *        b. UBLA org-policy block + publicAccess required → RETRY
 *           path: flip createOptions to UBLA-on (no ACL bits) and
 *           re-run createBucket. The retry itself can hit "already
 *           exists" → adopt.
 *        c. Anything else → re-throw to caller.
 *
 * Risk surfaces (pinned by tests):
 *
 * - **RISK #2** "already exists" guard checks THREE conditions across
 *   both the initial-fail catch and the retry-fail catch. Missing one
 *   would bubble a real 409 unhandled.
 *
 * - **RISK #3** The adopted-bucket UBLA-disable catch only sets
 *   `ublaForcedOn = true` when the disable error includes the UBLA
 *   constraint string. Anything else is intentionally swallowed
 *   silently (best-effort) — but the outer catch DOES re-throw
 *   non-handled errors. The asymmetric behaviour is preserved.
 */

import type { GCPHandlerContext } from '../../types';

export interface CreateOrAdoptResult {
  /** True iff UBLA could not be turned off (initial UBLA-on retry succeeded OR adopted bucket has UBLA locked on). */
  ublaForcedOn: boolean;
  /** True iff we hit the 409 / "already exists" path on either the initial create or the UBLA-on retry. */
  bucketAlreadyExisted: boolean;
}

/**
 * Creates a Cloud Storage bucket. On certain failures, retries with
 * UBLA on (org-policy retry) or adopts a pre-existing bucket. Returns
 * the two flags that downstream public-access logic uses to pick the
 * right strategy.
 *
 * The caller MUST pass `createOptions` with `iamConfiguration` /
 * `predefinedDefaultObjectAcl` already configured for the optimistic
 * path. We mutate it locally on retry; the caller's reference is also
 * mutated (the previous inline implementation behaved identically).
 */
export async function createOrAdoptBucket(
  storage: any,
  name: string,
  createOptions: Record<string, any>,
  publicAccess: boolean,
  ctx: GCPHandlerContext,
): Promise<CreateOrAdoptResult> {
  let ublaForcedOn = false;
  let bucketAlreadyExisted = false;

  try {
    await storage.createBucket(name, createOptions);
  } catch (createErr: any) {
    const createMsg = createErr instanceof Error ? createErr.message : String(createErr);
    const isUblaConstraint =
      createMsg.includes('storage.uniformBucketLevelAccess') || createMsg.includes('uniformBucketLevelAccess');
    const isAlreadyExists =
      createMsg.includes('you already own it') ||
      createMsg.includes('already own this bucket') ||
      (createErr as any)?.code === 409;

    if (isAlreadyExists) {
      ctx.on_log?.(
        `[cloud-storage] Bucket ${name} already exists from a prior deploy — adopting and converging public access.`,
      );
      bucketAlreadyExisted = true;
      // Inspect the existing bucket's UBLA setting so the public-access
      // logic in the orchestrator picks the right strategy.
      try {
        const existingBucket = storage.bucket(name);
        const [meta] = await existingBucket.getMetadata().catch(() => [null]);
        const ublaEnabled = meta?.iamConfiguration?.uniformBucketLevelAccess?.enabled === true;
        if (ublaEnabled) {
          // Try to flip UBLA off so the legacy ACL fallback can run on
          // this existing bucket. May fail if locked.
          try {
            await existingBucket.setMetadata({
              iamConfiguration: {
                uniformBucketLevelAccess: { enabled: false },
                publicAccessPrevention: 'inherited',
              },
            });
          } catch (disableErr: any) {
            const disableMsg = disableErr instanceof Error ? disableErr.message : String(disableErr);
            if (
              disableMsg.includes('storage.uniformBucketLevelAccess') ||
              disableMsg.includes('uniformBucketLevelAccess')
            ) {
              ublaForcedOn = true;
              ctx.on_log?.(`[cloud-storage] Adopted bucket ${name} has UBLA locked on by org policy — IAM-only path.`);
            }
          }
        }
      } catch {
        // Best-effort — fall through to public-access logic.
      }
    } else if (publicAccess && isUblaConstraint) {
      ctx.on_log?.(
        `[cloud-storage] Project enforces 'storage.uniformBucketLevelAccess' org policy. ` +
          `Retrying ${name} with UBLA on. Public access will rely solely on IAM ` +
          `(legacy ACL fallback is unavailable when UBLA is locked on).`,
      );
      ublaForcedOn = true;
      createOptions.iamConfiguration = {
        publicAccessPrevention: 'inherited',
        uniformBucketLevelAccess: { enabled: true },
      };
      delete createOptions.predefinedDefaultObjectAcl;
      try {
        await storage.createBucket(name, createOptions);
      } catch (retryErr: any) {
        // Even the retry can hit "already exists" if a prior partial
        // deploy left the bucket. Adopt it.
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (
          retryMsg.includes('you already own it') ||
          retryMsg.includes('already own this bucket') ||
          (retryErr as any)?.code === 409
        ) {
          ctx.on_log?.(`[cloud-storage] Bucket ${name} already exists — adopting (UBLA-on).`);
          bucketAlreadyExisted = true;
        } else {
          throw retryErr;
        }
      }
    } else {
      throw createErr;
    }
  }

  return { ublaForcedOn, bucketAlreadyExisted };
}

/**
 * IAM → legacy-ACL fallback for granting `allUsers:READER` on a Cloud
 * Storage bucket. Shared by `cloud-storage.ts` create() and update()
 * (rf-cstor-4). The two callsites differ only in whether they re-fetch
 * the IAM policy after `setPolicy` to detect silent stripping by org
 * policy — gated by `opts.verifyAfterWrite`.
 *
 * Risk surfaces (pinned by tests):
 *
 * - **RISK #4 (IAM merge not replace)** — `setPolicy` REPLACES the
 *   entire policy. We MUST fetch the existing policy, find-or-insert
 *   the `roles/storage.objectViewer` binding, append `allUsers`, and
 *   write back with the ORIGINAL etag + version. Replacing wholesale
 *   would strip default project-level bindings (owner/editor) and can
 *   leave the bucket inaccessible to the service account itself.
 *
 * - **RISK #5 (UBLA-forced + IAM-blocked dual block)** — when
 *   `ublaForcedOn` is true and the IAM grant fails, the legacy-ACL
 *   fallback is unavailable (UBLA disables the ACL system). We MUST
 *   short-circuit: set `failed = true` immediately without attempting
 *   `bucket.acl.default.add`.
 *
 * - **RISK #6 (ACL dual calls)** — both `bucket.acl.default.add(...)`
 *   (for the bucket's defaultObjectAcl) AND `bucket.acl.add(...)`
 *   (bucket-level, best-effort with `.catch(() => undefined)`) are
 *   required to bypass `iam.allowedPolicyMemberDomains` on legacy
 *   projects.
 *
 * - **RISK #7 (verifyAfterWrite asymmetry)** — update passes `true`
 *   so the policy is re-fetched after `setPolicy` and the function
 *   reports a stripped grant; create passes `false` (write-and-go).
 *   Adding verify to create changes behavior.
 */

import type { GCPHandlerContext } from '../../types.js';

export type PublicGrantStrategy = 'iam' | 'legacy-acl' | 'none';

export interface GrantPublicAccessOptions {
  /**
   * When `true`, after `setPolicy()` succeeds we re-fetch the policy
   * and verify `allUsers` is still bound to `roles/storage.objectViewer`.
   * Some org policies (e.g. `iam.allowedPolicyMemberDomains`) silently
   * strip the binding on write — without this verification we'd report
   * a successful grant that the bucket can't actually serve under.
   *
   * Used by update() (`true`); create() passes `false` to preserve
   * historical behavior (RISK #7 — adding verify to create changes
   * the failure surface area).
   */
  verifyAfterWrite: boolean;
}

export interface GrantPublicAccessResult {
  strategy: PublicGrantStrategy;
  failed: boolean;
  error: string;
  warnings: string[];
}

/**
 * Try to grant public read on a Cloud Storage bucket via IAM, falling
 * back to legacy ACLs if IAM is blocked by org policy. Returns the
 * combined outcome.
 *
 * The caller is responsible for: deciding whether to call this at all
 * (only when `publicAccess` is true), passing the correct
 * `ublaForcedOn` flag (which gates the ACL fallback per RISK #5), and
 * surfacing the returned warnings via the deploy result.
 */
export async function grantPublicAccess(
  bucket: any,
  name: string,
  ublaForcedOn: boolean,
  ctx: GCPHandlerContext,
  opts: GrantPublicAccessOptions,
): Promise<GrantPublicAccessResult> {
  const warnings: string[] = [];
  let strategy: PublicGrantStrategy = 'none';
  let failed = false;
  let error = '';
  let iamGrantError = '';

  // Strategy 1: IAM allUsers grant (preferred — works on projects
  // without restrictive org policies). RISK #4: we MUST merge into
  // the existing policy, not replace.
  try {
    // Prefer v3 policy so the response includes conditions; v1 is the
    // default on older libraries. Both work with setPolicy.
    const [currentPolicy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 }).catch(() => [null]);
    const bindings: Array<{ role: string; members: string[] }> = Array.isArray(currentPolicy?.bindings)
      ? currentPolicy!.bindings.map((b: any) => ({
          role: b.role,
          members: Array.isArray(b.members) ? [...b.members] : [],
        }))
      : [];
    const existing = bindings.find((b) => b.role === 'roles/storage.objectViewer');
    const alreadyHasAllUsers = !!existing?.members.includes('allUsers');

    if (alreadyHasAllUsers) {
      // Fast-path: the policy already has the binding. Skip the write
      // and report success.
      strategy = 'iam';
    } else {
      if (existing) {
        existing.members.push('allUsers');
      } else {
        bindings.push({ role: 'roles/storage.objectViewer', members: ['allUsers'] });
      }
      await bucket.iam.setPolicy({
        etag: currentPolicy?.etag,
        version: currentPolicy?.version ?? 3,
        bindings,
      });
      if (opts.verifyAfterWrite) {
        // Some org policies (notably `iam.allowedPolicyMemberDomains`)
        // accept the setPolicy call and silently strip `allUsers`. Re-
        // fetch and confirm the binding survived (RISK #7).
        const [verifyPolicy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 }).catch(() => [null]);
        const verified = (verifyPolicy?.bindings || []).some(
          (b: any) => b.role === 'roles/storage.objectViewer' && (b.members || []).includes('allUsers'),
        );
        if (verified) {
          strategy = 'iam';
          ctx.on_log?.(`[cloud-storage] ✓ Granted allUsers:objectViewer via IAM on ${name}`);
        } else {
          iamGrantError =
            'IAM setPolicy returned success but allUsers is not in the bucket policy after re-fetch (org policy likely stripped it silently).';
        }
      } else {
        // Create-mode: trust the write succeeded without a re-fetch.
        strategy = 'iam';
        ctx.on_log?.(`[cloud-storage] Granted allUsers:objectViewer via IAM on ${name}`);
      }
    }
  } catch (iamErr: any) {
    iamGrantError = iamErr instanceof Error ? iamErr.message : String(iamErr);
  }

  // Strategy 2: Legacy ACL fallback. Skipped if IAM already landed.
  // RISK #5: if UBLA is forced on, ACLs are unavailable → fail fast.
  if (strategy !== 'iam') {
    if (ublaForcedOn) {
      failed = true;
      error = `IAM: ${iamGrantError} | ACL fallback unavailable: 'storage.uniformBucketLevelAccess' org policy is enforced (UBLA cannot be disabled).`;
      warnings.push(
        `BOTH public access strategies blocked. IAM allUsers grant rejected by ` +
          `'iam.allowedPolicyMemberDomains' org policy. Legacy ACL fallback unavailable ` +
          `because 'storage.uniformBucketLevelAccess' org policy forces UBLA on, which ` +
          `disables the ACL system. This project's combined policies prevent ALL public ` +
          `Cloud Storage hosting. Options: (1) ask org admin to relax one of these constraints ` +
          `for this project, (2) use a different project, or (3) switch to a non-Storage ` +
          `hosting backend (Cloud Run + container of your static site).`,
      );
      ctx.on_log?.(`[cloud-storage] ${warnings[warnings.length - 1]}`);
    } else {
      const isOrgPolicyBlock =
        iamGrantError.includes('permitted customer') ||
        iamGrantError.includes('allowedPolicyMemberDomains') ||
        iamGrantError.includes('stripped');
      ctx.on_log?.(
        isOrgPolicyBlock
          ? `[cloud-storage] IAM allUsers grant blocked by org policy on ${name}. Falling back to legacy ACLs...`
          : `[cloud-storage] IAM grant failed on ${name}: ${iamGrantError}. Trying legacy ACL fallback...`,
      );
      try {
        // RISK #6: ACL dual call. `acl.default.add` sets the bucket's
        // defaultObjectAcl (applies to future objects); `acl.add` sets
        // the bucket-level ACL (best-effort — some libraries reject it
        // even when the default-add succeeds, so we swallow).
        await bucket.acl.default.add({ entity: 'allUsers', role: 'READER' });
        await bucket.acl.add({ entity: 'allUsers', role: 'READER' }).catch(() => undefined);
        strategy = 'legacy-acl';
        ctx.on_log?.(
          `[cloud-storage] ✓ Legacy ACL fallback worked — granted allUsers:READER on ${name}'s defaultObjectAcl. ` +
            `IAM was blocked by '${isOrgPolicyBlock ? 'iam.allowedPolicyMemberDomains' : 'unknown error'}' ` +
            `but the ACL system bypasses that restriction.`,
        );
      } catch (aclErr: any) {
        const aclMsg = aclErr instanceof Error ? aclErr.message : String(aclErr);
        failed = true;
        error = `IAM: ${iamGrantError} | ACL fallback: ${aclMsg}`;
        const isAccessPreventionBlock =
          aclMsg.includes('publicAccessPrevention') ||
          aclMsg.includes('PUBLIC_ACCESS_PREVENTION') ||
          aclMsg.includes('uniform bucket-level access') ||
          aclMsg.includes('UBLA') ||
          aclMsg.includes('blocked');
        warnings.push(
          isAccessPreventionBlock
            ? `BOTH public access strategies blocked. IAM allUsers grant rejected by ` +
                `'iam.allowedPolicyMemberDomains' org policy AND legacy ACL grant rejected ` +
                `(likely by 'storage.publicAccessPrevention' or locked-on UBLA). ` +
                `This project's policies prevent ALL public Cloud Storage hosting. ` +
                `Options: (1) ask org admin to relax one of these constraints for this project, ` +
                `(2) use a different project, or (3) deploy via Cloud Run which uses a different ` +
                `access model.`
            : `Could not make bucket publicly readable. IAM grant: '${iamGrantError}'. ` +
                `Legacy ACL fallback also failed: '${aclMsg}'.`,
        );
        ctx.on_log?.(`[cloud-storage] ${warnings[warnings.length - 1]}`);
      }
    }
  }

  return { strategy, failed, error, warnings };
}

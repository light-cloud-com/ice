/**
 * Upload placeholder index.html + 404.html to a static-site bucket,
 * with skip-if-exists guards and an optional ACL backfill on adopted
 * buckets. Shared by `cloud-storage.ts` create() and update()
 * (rf-cstor-5).
 *
 * Without these placeholders, a fresh deploy creates an empty bucket
 * → the LB returns "Server Error" and direct object URLs return
 * NoSuchKey. The placeholder gives every fresh deploy a working URL
 * out of the box, even before the user has wired up the build
 * pipeline. CI uploads will overwrite these files the first time they
 * run.
 *
 * RISK #8 — placeholder skip-if-exists has INDEPENDENT guards: each
 * `bucket.file(...).exists()` is wrapped in `.catch(() => [false])`
 * separately. A throw on the index check must NOT prevent the 404
 * check from running, and vice versa.
 *
 * The function returns a warnings array. The caller is responsible
 * for surfacing those via the deploy result.
 */

import { placeholderIndexHtml, placeholderNotFoundHtml } from './bucket-utils.js';
import type { PublicGrantStrategy } from './public-access-granter.js';
import type { GCPHandlerContext } from '../../types.js';

export interface UploadPlaceholdersInput {
  bucket: any;
  name: string;
  publicAccess: boolean;
  ublaForcedOn: boolean;
  publicGrantStrategy: PublicGrantStrategy;
  bucketAlreadyExisted: boolean;
  ctx: GCPHandlerContext;
}

/**
 * Upload `index.html` and `404.html` placeholders to the bucket if
 * those keys are missing. On adopted-and-public-via-ACL buckets,
 * additionally backfill `allUsers:READER` on existing objects so
 * uploads from a prior private-bucket era become reachable.
 *
 * Returns an array of warning strings. Empty array on full success.
 */
export async function uploadPlaceholders(input: UploadPlaceholdersInput): Promise<string[]> {
  const { bucket, name, publicAccess, ublaForcedOn, publicGrantStrategy, bucketAlreadyExisted, ctx } = input;
  const warnings: string[] = [];
  try {
    // `predefinedAcl: 'publicRead'` ensures the uploaded file is
    // publicly readable via the legacy ACL system regardless of
    // whether the IAM grant succeeded. Belt-and-suspenders with the
    // bucket's `predefinedDefaultObjectAcl`. SKIPPED when UBLA is
    // forced on (the ACL endpoint errors).
    const placeholderAcl = publicAccess && !ublaForcedOn ? 'publicRead' : undefined;

    // RISK #8: skip-if-exists guards are INDEPENDENT.
    const [indexExists] = await bucket
      .file('index.html')
      .exists()
      .catch(() => [false]);
    if (!indexExists) {
      await bucket.file('index.html').save(placeholderIndexHtml(name), {
        contentType: 'text/html; charset=utf-8',
        resumable: false,
        predefinedAcl: placeholderAcl,
      });
    }

    const [notFoundExists] = await bucket
      .file('404.html')
      .exists()
      .catch(() => [false]);
    if (!notFoundExists) {
      await bucket.file('404.html').save(placeholderNotFoundHtml(name), {
        contentType: 'text/html; charset=utf-8',
        resumable: false,
        predefinedAcl: placeholderAcl,
      });
    }

    // Self-heal existing files on adopted-and-public-via-ACL buckets.
    // (For a fresh-create bucket there are no existing files to
    // backfill; for an IAM-grant bucket the policy already covers
    // them.)
    if (bucketAlreadyExisted && publicAccess && publicGrantStrategy === 'legacy-acl') {
      try {
        const [files] = await bucket.getFiles({ maxResults: 100 });
        for (const f of files) {
          await f.acl.add({ entity: 'allUsers', role: 'READER' }).catch(() => undefined);
        }
        ctx.on_log?.(
          `[cloud-storage] Backfilled allUsers:READER ACL on ${files.length} existing object(s) in ${name}.`,
        );
      } catch (backfillErr: any) {
        ctx.on_log?.(
          `[cloud-storage] Could not backfill ACLs on existing files in ${name}: ${backfillErr instanceof Error ? backfillErr.message : backfillErr}`,
        );
      }
    }
  } catch (uploadErr: any) {
    // Best-effort — don't fail the deploy if the placeholder upload
    // fails (the user's CI will populate the bucket anyway). Surface
    // as a warning.
    warnings.push(
      `Could not upload placeholder index.html: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}. ` +
        'Visiting the load balancer URL before your build pipeline runs will return "Server Error".',
    );
  }
  return warnings;
}

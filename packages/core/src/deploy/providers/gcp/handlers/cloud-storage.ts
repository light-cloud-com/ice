/**
 * Cloud Storage Handler
 *
 * Handles: gcp.storage.bucket
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages.js';
import { createOrAdoptBucket } from './cloud-storage/bucket-creator.js';
import { applySimpleProperties } from './cloud-storage/bucket-updater.js';
import { resolveOutputUrl } from './cloud-storage/bucket-utils.js';
import { uploadPlaceholders } from './cloud-storage/placeholder-uploader.js';
import { grantPublicAccess } from './cloud-storage/public-access-granter.js';
import { result, fail } from './cloud-storage/result-helpers.js';
import type { GCPResourceHandler } from '../types.js';

export const cloud_storage_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    try {
      const storage = ctx.clients.get('storage') as any;
      if (!storage) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.CLOUD_STORAGE, 'storage'));

      const location = (properties.location as string) || 'US';
      const storage_class = (properties.storage_class as string) || 'STANDARD';
      const publicAccess = properties.public_access === true;
      const websiteHosting = properties.website_hosting === true;

      const createOptions: Record<string, any> = {
        location,
        storageClass: storage_class,
        labels: properties.labels || {},
        versioning: properties.versioning ? { enabled: true } : undefined,
      };
      if (websiteHosting) {
        // Static website hosting: index.html for the directory root, 404.html
        // for any missing path. Set at create time so the bucket serves the
        // SPA shell without needing a second call.
        createOptions.website = {
          mainPageSuffix: (properties.index_page as string) || 'index.html',
          notFoundPage: (properties.not_found_page as string) || '404.html',
        };
      }
      if (publicAccess) {
        // `publicAccessPrevention: 'inherited'` allows public access grants.
        // The opposite, `enforced`, is the default in some newer projects and
        // silently blocks the grant below — we explicitly opt-in here so the
        // static site flow doesn't break on fresh GCP projects.
        //
        // `uniformBucketLevelAccess: false` is OPTIMISTIC. We prefer UBLA
        // off because it enables the legacy ACL fallback path (which
        // bypasses `iam.allowedPolicyMemberDomains`). However, if the
        // project has `storage.uniformBucketLevelAccess` ENFORCED, this
        // create will fail and we retry with UBLA on (see below).
        createOptions.iamConfiguration = {
          publicAccessPrevention: 'inherited',
          uniformBucketLevelAccess: { enabled: false },
        };
        // `predefinedDefaultObjectAcl: 'publicRead'` makes every object
        // uploaded to this bucket automatically grant `allUsers:READER`
        // via the legacy ACL system. Same trick Terraform uses to bypass
        // `iam.allowedPolicyMemberDomains`. Only valid when UBLA is off.
        createOptions.predefinedDefaultObjectAcl = 'publicRead';
      }

      // Two-tier creation: optimistic (UBLA off) + retry on UBLA org
      // policy + adopt-existing on 409. See `bucket-creator.ts` for
      // the full flow + risk pins. Idempotency contract: re-running
      // create on a previously-failed deploy must converge, not error.
      const { ublaForcedOn, bucketAlreadyExisted } = await createOrAdoptBucket(
        storage,
        name,
        createOptions,
        publicAccess,
        ctx,
      );

      // For public static site buckets, grant allUsers:objectViewer so
      // the load balancer + direct visitors can fetch objects. The
      // helper handles the IAM → legacy-ACL fallback and surfaces the
      // strategy + warnings via its return value. See
      // `public-access-granter.ts` for the full risk pins.
      //
      // verifyAfterWrite=false (create-mode): trust the setPolicy
      // write succeeded without a re-fetch, matching historical
      // behavior (RISK #7).
      const warnings: string[] = [];
      let publicGrantFailed = false;
      let publicGrantError = '';
      let publicGrantStrategy: 'iam' | 'legacy-acl' | 'none' = 'none';
      if (publicAccess) {
        const bucket = storage.bucket(name);
        const grant = await grantPublicAccess(bucket, name, ublaForcedOn, ctx, { verifyAfterWrite: false });
        publicGrantStrategy = grant.strategy;
        publicGrantFailed = grant.failed;
        publicGrantError = grant.error;
        warnings.push(...grant.warnings);
      }

      // Upload index.html + 404.html placeholders for static-site
      // buckets. Without these, a fresh deploy creates an empty bucket
      // → LB returns "Server Error" and direct object URLs return
      // NoSuchKey. Skip-if-exists guards (RISK #8) preserve user
      // content on adopted buckets. See `placeholder-uploader.ts`.
      if (websiteHosting) {
        const bucket = storage.bucket(name);
        const uploadWarnings = await uploadPlaceholders({
          bucket,
          name,
          publicAccess,
          ublaForcedOn,
          publicGrantStrategy,
          bucketAlreadyExisted,
          ctx,
        });
        warnings.push(...uploadWarnings);
      }

      // URL priority for the output pill:
      //   1. Public buckets WITH a successful allUsers grant: direct object
      //      URL at `/<index_page>`. This is the ONLY reliably
      //      anonymously-accessible path on GCS — bucket-root URLs are
      //      list-bucket requests that `objectViewer` doesn't permit.
      //   2. Public buckets WHERE the grant FAILED → handled below as
      //      a deploy failure with the actionable error message. The
      //      bucket exists but cannot serve content.
      //   3. Private buckets report the `gs://` path — not meant for
      //      browser access.
      const indexPage = (properties.index_page as string) || 'index.html';

      // Public access was required but BOTH IAM and ACL paths were
      // blocked. The bucket exists but it isn't reachable, and the
      // load balancer in front of it will serve 502s. Surface this
      // as a deploy failure with the actionable error so the user
      // doesn't see a green check + a broken site.
      if (publicAccess && publicGrantFailed) {
        return fail(
          name,
          'create',
          start,
          publicGrantError ||
            'Bucket cannot be made publicly readable. Both IAM and legacy ACL paths blocked by org policy.',
        );
      }

      const outputUrl = resolveOutputUrl(publicAccess, publicGrantFailed, name, indexPage);
      return result(name, 'create', start, {
        provider_id: `gs://${name}`,
        outputs: {
          name,
          location,
          storage_class,
          public_access: publicAccess,
          public_grant_failed: publicGrantFailed || undefined,
          public_grant_error: publicGrantError || undefined,
          public_grant_strategy: publicAccess ? publicGrantStrategy : undefined,
          website_hosting: websiteHosting,
          index_page: indexPage,
          url: outputUrl,
          console_url: `https://console.cloud.google.com/storage/browser/${name}`,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();

    try {
      const storage = ctx.clients.get('storage') as any;
      if (!storage) return fail(name, 'update', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_STORAGE));

      const bucket = storage.bucket(name);

      await applySimpleProperties(bucket, properties);

      // Re-publish the same outputs as `create()` so the persisted
      // result row keeps the URL / name / index_page fields populated.
      // Without this an update deploy wipes the canvas pill's URL
      // because the persisted output blob is empty.
      const publicAccess = properties.public_access === true;
      const websiteHosting = properties.website_hosting === true;
      const indexPage = (properties.index_page as string) || 'index.html';

      // Self-heal: re-attempt public access on every update deploy.
      // This is the IAM → legacy ACL fallback that mirrors create():
      //
      //   1. Disable UBLA so ACLs work (no-op if already disabled).
      //      Existing buckets from earlier ICE versions have UBLA=true,
      //      which BLOCKS the legacy ACL system. We have to migrate
      //      them before the ACL fallback can work.
      //   2. Try IAM `allUsers:objectViewer`. Best on projects without
      //      `iam.allowedPolicyMemberDomains` enforcement.
      //   3. On IAM failure, try legacy ACL `defaultObjectAcl:allUsers:READER`
      //      via `bucket.acl.default.add(...)`. ACLs are a separate
      //      pre-IAM mechanism that bypasses `iam.allowedPolicyMemberDomains`
      //      entirely — same trick Terraform uses.
      //   4. Verify after the attempt by re-fetching state.
      //
      // The deploy only fails if BOTH IAM and ACL paths are blocked.
      const updateWarnings: string[] = [];
      let updatePublicGrantFailed = false;
      let updatePublicGrantError = '';
      let updatePublicGrantStrategy: 'iam' | 'legacy-acl' | 'none' = 'none';
      let updateUblaForcedOn = false;
      if (publicAccess) {
        // Step 1: try to ensure UBLA is off so ACL fallback can work.
        // If `storage.uniformBucketLevelAccess` org policy is enforced,
        // this will fail and we mark `updateUblaForcedOn` so the ACL
        // fallback step is skipped.
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
                updateUblaForcedOn = true;
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
          updateUblaForcedOn = true;
        }

        // Step 2 + 3: IAM grant + legacy-ACL fallback. The helper
        // unifies create() and update() — update passes
        // verifyAfterWrite=true so silent stripping by org policy
        // surfaces as a grant-failure (RISK #7).
        const grant = await grantPublicAccess(bucket, name, updateUblaForcedOn, ctx, { verifyAfterWrite: true });
        updatePublicGrantStrategy = grant.strategy;
        updatePublicGrantFailed = grant.failed;
        updatePublicGrantError = grant.error;
        updateWarnings.push(...grant.warnings);
      }

      // Self-heal: re-upload placeholders if missing + ACL-backfill
      // existing private uploads on adopted-and-public-via-ACL
      // buckets. The shared helper handles both. The update path
      // always passes bucketAlreadyExisted=true: by definition we are
      // updating an existing bucket, so any ACL-strategy success
      // gates the backfill identically to the create-adoption case.
      if (websiteHosting) {
        const uploadWarnings = await uploadPlaceholders({
          bucket,
          name,
          publicAccess,
          ublaForcedOn: updateUblaForcedOn,
          publicGrantStrategy: updatePublicGrantStrategy,
          bucketAlreadyExisted: true,
          ctx,
        });
        updateWarnings.push(...uploadWarnings);
      }

      // URL priority on update mirrors create():
      //   - public + grant succeeded (IAM or legacy ACL) → direct object URL
      //   - public + BOTH strategies failed → gs:// (don't lie with a URL
      //     that 403s; the LB also won't work for the same reason)
      //   - private → gs://
      const publicUrl = resolveOutputUrl(publicAccess, updatePublicGrantFailed, name, indexPage);

      // Only mark the result as FAILED when BOTH IAM and ACL paths
      // were blocked. Otherwise (legacy ACL succeeded → strategy is
      // 'legacy-acl', or IAM succeeded → strategy is 'iam') the bucket
      // is publicly readable and the deploy is a success.
      if (updatePublicGrantFailed) {
        return fail(
          name,
          'update',
          start,
          updatePublicGrantError ||
            'Bucket cannot be made publicly readable. Both IAM and legacy ACL paths blocked by org policy.',
        );
      }
      return result(name, 'update', start, {
        provider_id: provider_id || `gs://${name}`,
        outputs: {
          name,
          public_access: publicAccess,
          public_grant_failed: updatePublicGrantFailed || undefined,
          public_grant_error: updatePublicGrantError || undefined,
          public_grant_strategy: publicAccess ? updatePublicGrantStrategy : undefined,
          website_hosting: websiteHosting,
          index_page: indexPage,
          url: publicUrl,
          console_url: `https://console.cloud.google.com/storage/browser/${name}`,
          warnings: updateWarnings.length > 0 ? updateWarnings : undefined,
        },
      });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();

    try {
      const storage = ctx.clients.get('storage') as any;
      if (!storage) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_STORAGE));

      const bucket = storage.bucket(name);
      await bucket.deleteFiles({ force: true });
      await bucket.delete();

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },

  /**
   * Phase 7 — describe for drift detection. Fetches the bucket metadata and
   * projects it to the subset of fields ICE manages (location, storage class,
   * versioning, labels).
   */
  async describe(name, _provider_id, ctx) {
    try {
      const storage = ctx.clients.get('storage') as any;
      if (!storage) {
        return { exists: false, error: 'Cloud Storage client unavailable' };
      }
      const bucket = storage.bucket(name);
      const [metadata] = await bucket.getMetadata();
      return {
        exists: true,
        raw: metadata,
        properties: {
          name: metadata.name,
          location: metadata.location,
          storage_class: metadata.storageClass,
          versioning: metadata.versioning?.enabled || false,
          labels: metadata.labels || {},
        },
      };
    } catch (error: any) {
      const code = error?.code || error?.response?.status;
      if (code === 404) return { exists: false };
      return { exists: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

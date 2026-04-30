/**
 * Cloud Storage Handler
 *
 * Handles: gcp.storage.bucket
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages.js';
import { createOrAdoptBucket } from './cloud-storage/bucket-creator.js';
import { applySimpleProperties, prepareForAclFallback } from './cloud-storage/bucket-updater.js';
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
        // index.html for the directory root, 404.html for any missing
        // path. Set at create time so the bucket serves the SPA shell
        // without needing a second call.
        createOptions.website = {
          mainPageSuffix: (properties.index_page as string) || 'index.html',
          notFoundPage: (properties.not_found_page as string) || '404.html',
        };
      }
      if (publicAccess) {
        // Optimistic: UBLA off so the legacy ACL fallback can run
        // (bypasses `iam.allowedPolicyMemberDomains`). Org policy may
        // force UBLA on; bucket-creator handles the retry.
        // `publicAccessPrevention: 'inherited'` opts out of the silent
        // 'enforced' default that would block the grant.
        createOptions.iamConfiguration = {
          publicAccessPrevention: 'inherited',
          uniformBucketLevelAccess: { enabled: false },
        };
        createOptions.predefinedDefaultObjectAcl = 'publicRead';
      }

      // Two-tier creation: optimistic (UBLA off) + retry on UBLA org
      // policy + adopt-existing on 409. See `bucket-creator.ts`.
      const { ublaForcedOn, bucketAlreadyExisted } = await createOrAdoptBucket(
        storage,
        name,
        createOptions,
        publicAccess,
        ctx,
      );

      // Public buckets: IAM → legacy-ACL fallback. Create-mode passes
      // verifyAfterWrite=false (RISK #7).
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

      // Static-site buckets: upload index.html + 404.html placeholders
      // (skip-if-exists per RISK #8). See `placeholder-uploader.ts`.
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

      const indexPage = (properties.index_page as string) || 'index.html';

      // BOTH IAM and ACL blocked → return failure (don't surface a
      // green check on a bucket whose URL 403s).
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

      // Re-publish create()'s outputs so the persisted result row
      // keeps URL / name / index_page populated (otherwise an update
      // deploy wipes the canvas pill's URL).
      const publicAccess = properties.public_access === true;
      const websiteHosting = properties.website_hosting === true;
      const indexPage = (properties.index_page as string) || 'index.html';

      // Self-heal: re-attempt public access on every update deploy.
      // Step 1 — disable UBLA so ACLs work (no-op if already off,
      // skip on org-policy lock). Step 2+3 — IAM grant with verify,
      // ACL fallback otherwise. verifyAfterWrite=true detects silent
      // stripping by `iam.allowedPolicyMemberDomains` (RISK #7).
      const updateWarnings: string[] = [];
      let updatePublicGrantFailed = false;
      let updatePublicGrantError = '';
      let updatePublicGrantStrategy: 'iam' | 'legacy-acl' | 'none' = 'none';
      let updateUblaForcedOn = false;
      if (publicAccess) {
        ({ ublaForcedOn: updateUblaForcedOn } = await prepareForAclFallback(bucket, name, ctx));
        const grant = await grantPublicAccess(bucket, name, updateUblaForcedOn, ctx, { verifyAfterWrite: true });
        updatePublicGrantStrategy = grant.strategy;
        updatePublicGrantFailed = grant.failed;
        updatePublicGrantError = grant.error;
        updateWarnings.push(...grant.warnings);
      }

      // Self-heal placeholders + ACL-backfill on adopted-and-public-
      // via-ACL buckets. update() always passes bucketAlreadyExisted=true.
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

      const publicUrl = resolveOutputUrl(publicAccess, updatePublicGrantFailed, name, indexPage);

      // Mark FAILED only when BOTH IAM and ACL paths were blocked
      // (matching create() behavior).
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

/**
 * Cloud Storage Handler
 *
 * Handles: gcp.storage.bucket
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages.js';
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

      // Try creating with the optimistic (UBLA-off) options. Two
      // recovery scenarios are handled inline:
      //
      //   1. `storage.uniformBucketLevelAccess` org policy → retry
      //      with UBLA on and drop the ACL bits (IAM is the only
      //      public-access path then).
      //
      //   2. Bucket already exists ("you already own it") → adopt it.
      //      A previous partial deploy probably created the bucket but
      //      crashed before granting public access; we fall through and
      //      run the IAM/ACL grant + placeholder upload on the existing
      //      bucket as if we'd just created it. This is what the deploy
      //      engine's idempotency contract expects: re-running create
      //      should converge, not error.
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
          // Inspect the existing bucket's UBLA setting so the
          // public-access logic below picks the right strategy.
          try {
            const existingBucket = storage.bucket(name);
            const [meta] = await existingBucket.getMetadata().catch(() => [null]);
            const ublaEnabled = meta?.iamConfiguration?.uniformBucketLevelAccess?.enabled === true;
            if (ublaEnabled) {
              // Try to flip UBLA off so the legacy ACL fallback can
              // run on this existing bucket. May fail if locked.
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
                  ctx.on_log?.(
                    `[cloud-storage] Adopted bucket ${name} has UBLA locked on by org policy — IAM-only path.`,
                  );
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
            // Even the retry can hit "already exists" if a prior
            // partial deploy left the bucket. Adopt it.
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

      // For public static site buckets, grant allUsers:objectViewer so the
      // HTTPS load balancer (backend bucket origin) and any direct visitors
      // can fetch objects. Best-effort: if an org policy blocks public IAM
      // grants we catch the error and surface it via a warning output so
      // the user knows why visiting the URL returns 403.
      //
      // Merge semantics: `setPolicy` REPLACES the entire policy, which
      // would strip default project-level bindings (owner/editor) and can
      // leave the bucket inaccessible to the service account itself. We
      // fetch the existing policy, append the allUsers binding, and write
      // it back so existing roles survive.
      //
      // When the grant fails, we set `publicGrantFailed: true` on the
      // outputs so the downstream code knows direct public access is
      // blocked and the user's only reachable path is through the load
      // balancer (backend bucket). The propagation layer uses this to
      // swap the per-block URL away from the bucket URL to something
      // that actually works.
      const warnings: string[] = [];
      let publicGrantFailed = false;
      let publicGrantError = '';
      let publicGrantStrategy: 'iam' | 'legacy-acl' | 'none' = 'none';
      if (publicAccess) {
        const bucket = storage.bucket(name);

        // Strategy 1: IAM allUsers grant (preferred — works on
        // projects without restrictive org policies).
        try {
          // Prefer v3 policy so the response includes conditions; v1 is
          // the default on older libraries. Both work with setPolicy.
          const [currentPolicy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 }).catch(() => [null]);
          const bindings: Array<{ role: string; members: string[] }> = Array.isArray(currentPolicy?.bindings)
            ? currentPolicy!.bindings.map((b: any) => ({
                role: b.role,
                members: Array.isArray(b.members) ? [...b.members] : [],
              }))
            : [];

          const existing = bindings.find((b) => b.role === 'roles/storage.objectViewer');
          if (existing) {
            if (!existing.members.includes('allUsers')) {
              existing.members.push('allUsers');
            }
          } else {
            bindings.push({ role: 'roles/storage.objectViewer', members: ['allUsers'] });
          }

          await bucket.iam.setPolicy({
            etag: currentPolicy?.etag,
            version: currentPolicy?.version ?? 3,
            bindings,
          });
          publicGrantStrategy = 'iam';
          ctx.on_log?.(`[cloud-storage] Granted allUsers:objectViewer via IAM on ${name}`);
        } catch (iamErr: any) {
          const msg = iamErr instanceof Error ? iamErr.message : String(iamErr);
          // The "permitted customer" / "allowedPolicyMemberDomains" error
          // means IAM blocks `allUsers`. Legacy ACLs are a SEPARATE
          // permission system that predates IAM and is NOT governed by
          // `iam.allowedPolicyMemberDomains` — they're our automatic
          // fallback path.
          const isOrgPolicyBlock = msg.includes('permitted customer') || msg.includes('allowedPolicyMemberDomains');
          ctx.on_log?.(
            isOrgPolicyBlock
              ? `[cloud-storage] IAM allUsers grant blocked by org policy. Falling back to legacy ACLs...`
              : `[cloud-storage] IAM grant failed: ${msg}. Trying legacy ACL fallback...`,
          );

          // Strategy 2: Legacy ACL fallback. Only viable when UBLA is
          // off — if the project enforces `storage.uniformBucketLevelAccess`,
          // we already had to fall back to UBLA-on bucket creation, which
          // means ACLs are unavailable and IAM is the only path. In that
          // scenario both strategies are dead and the bucket cannot host
          // publicly in this project.
          if (ublaForcedOn) {
            publicGrantFailed = true;
            publicGrantError = `IAM: ${msg} | ACL fallback unavailable: 'storage.uniformBucketLevelAccess' org policy is enforced (UBLA cannot be disabled).`;
            warnings.push(
              `BOTH public access strategies blocked. IAM allUsers grant rejected by ` +
                `'iam.allowedPolicyMemberDomains' org policy. Legacy ACL fallback unavailable ` +
                `because 'storage.uniformBucketLevelAccess' org policy forces UBLA on, which ` +
                `disables the ACL system. This project's combined policies prevent ALL public ` +
                `Cloud Storage hosting. Options: (1) ask org admin to relax one of these constraints ` +
                `for this project, (2) use a different project, or (3) switch to a non-Storage ` +
                `hosting backend (Cloud Run + container image of your static site).`,
            );
            ctx.on_log?.(`[cloud-storage] ${warnings[warnings.length - 1]}`);
          } else {
            // ACLs use the `defaultObjectAcl` REST endpoint, not the IAM
            // policy endpoint, so `iam.allowedPolicyMemberDomains` does not
            // gate it. The other policy that CAN block ACL grants is
            // `storage.publicAccessPrevention` — if that's also enforced,
            // public hosting is genuinely impossible in this project.
            try {
              await bucket.acl.default.add({
                entity: 'allUsers',
                role: 'READER',
              });
              await bucket.acl
                .add({
                  entity: 'allUsers',
                  role: 'READER',
                })
                .catch(() => undefined);
              publicGrantStrategy = 'legacy-acl';
              ctx.on_log?.(
                `[cloud-storage] ✓ Legacy ACL fallback worked — granted allUsers:READER on ${name}'s defaultObjectAcl. ` +
                  `IAM was blocked by '${isOrgPolicyBlock ? 'iam.allowedPolicyMemberDomains' : 'unknown error'}' ` +
                  `but the ACL system bypasses that restriction.`,
              );
            } catch (aclErr: any) {
              const aclMsg = aclErr instanceof Error ? aclErr.message : String(aclErr);
              publicGrantFailed = true;
              publicGrantError = `IAM: ${msg} | ACL fallback: ${aclMsg}`;
              const isAccessPreventionBlock =
                aclMsg.includes('publicAccessPrevention') ||
                aclMsg.includes('PUBLIC_ACCESS_PREVENTION') ||
                aclMsg.includes('blocked');
              warnings.push(
                isAccessPreventionBlock
                  ? `BOTH public access strategies blocked. IAM allUsers grant rejected by ` +
                      `'iam.allowedPolicyMemberDomains' org policy AND legacy ACL grant rejected ` +
                      `by 'storage.publicAccessPrevention' org policy. This project's policies ` +
                      `prevent ALL public Cloud Storage hosting. Options: (1) ask org admin to relax ` +
                      `one of these constraints for this project, (2) use a different project, or ` +
                      `(3) switch to Cloud Run hosting.`
                  : `IAM grant blocked by '${msg}'. Legacy ACL fallback also failed: '${aclMsg}'. ` +
                      `Cloud Storage cannot serve this bucket publicly.`,
              );
              ctx.on_log?.(`[cloud-storage] ${warnings[warnings.length - 1]}`);
            }
          }
        }
      }

      // Upload a placeholder index.html (and 404.html) for static-site
      // buckets. Without this, the user's first deploy creates an
      // empty bucket → the LB returns "Server Error" and direct object
      // URLs return NoSuchKey. The placeholder gives every fresh
      // deploy a working URL out of the box, even before the user has
      // wired up the build pipeline. CI uploads will overwrite this
      // file the first time they run.
      //
      // Skip-if-exists: when adopting a bucket from a prior partial
      // deploy, we must NOT overwrite real user content. Only upload
      // the placeholder when the file is missing.
      if (websiteHosting) {
        try {
          const bucket = storage.bucket(name);
          const indexPlaceholder = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${name} · Deployed by ICE</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 80px auto; padding: 0 24px; color: #1a1a1a; }
      h1 { font-size: 24px; margin-bottom: 12px; }
      p { line-height: 1.6; color: #666; }
      code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
      .ok { color: #22c55e; font-weight: 600; }
    </style>
  </head>
  <body>
    <h1>✓ Static site bucket is live</h1>
    <p>This is a placeholder served from <code>${name}</code>. Your load balancer is healthy and the bucket is reachable.</p>
    <p><span class="ok">Next step:</span> wire up the build pipeline (GitHub repo → CI → bucket upload) to replace this file with your actual site. Or upload your built static output manually with <code>gsutil rsync -r ./dist gs://${name}</code>.</p>
    <p style="font-size: 12px; color: #999; margin-top: 48px;">Deployed by <a href="https://github.com/light-cloud-com/ice" style="color: #999;">ICE</a> · ${new Date().toISOString()}</p>
  </body>
</html>
`;
          // `predefinedAcl: 'publicRead'` ensures the uploaded file
          // is publicly readable via the legacy ACL system regardless
          // of whether the IAM grant succeeded. Belt-and-suspenders
          // with the bucket's `predefinedDefaultObjectAcl` so the
          // file is reachable even if defaults didn't apply.
          // SKIPPED when UBLA is forced on (the ACL endpoint errors).
          const placeholderAcl = publicAccess && !ublaForcedOn ? 'publicRead' : undefined;
          const [indexExists] = await bucket
            .file('index.html')
            .exists()
            .catch(() => [false]);
          if (!indexExists) {
            await bucket.file('index.html').save(indexPlaceholder, {
              contentType: 'text/html; charset=utf-8',
              resumable: false,
              predefinedAcl: placeholderAcl,
            });
          }
          const notFoundPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>404 · Not Found</title>
    <style>body{font-family:-apple-system,sans-serif;max-width:640px;margin:80px auto;padding:0 24px;text-align:center;color:#666}h1{font-size:48px;color:#1a1a1a;margin:0}p{margin-top:12px}</style>
  </head>
  <body>
    <h1>404</h1>
    <p>Not Found · ${name}</p>
  </body>
</html>
`;
          const [notFoundExists] = await bucket
            .file('404.html')
            .exists()
            .catch(() => [false]);
          if (!notFoundExists) {
            await bucket.file('404.html').save(notFoundPage, {
              contentType: 'text/html; charset=utf-8',
              resumable: false,
              predefinedAcl: placeholderAcl,
            });
          }

          // When adopting an existing bucket via the legacy ACL path,
          // backfill allUsers:READER on existing files so the prior
          // private uploads become reachable too.
          if (bucketAlreadyExisted && publicAccess && publicGrantStrategy === 'legacy-acl') {
            try {
              const [files] = await bucket.getFiles({ maxResults: 100 });
              for (const f of files) {
                await f.acl.add({ entity: 'allUsers', role: 'READER' }).catch(() => undefined);
              }
              ctx.on_log?.(
                `[cloud-storage] Backfilled allUsers:READER ACL on ${files.length} existing object(s) in adopted bucket ${name}.`,
              );
            } catch {
              // Best-effort.
            }
          }
        } catch (uploadErr: any) {
          // Best-effort — don't fail the deploy if the placeholder
          // upload fails (the user's CI will populate the bucket
          // anyway). Surface as a warning.
          warnings.push(
            `Could not upload placeholder index.html: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}. ` +
              'Visiting the load balancer URL before your build pipeline runs will return "Server Error".',
          );
        }
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

      const outputUrl = !publicAccess ? `gs://${name}` : `https://storage.googleapis.com/${name}/${indexPage}`;
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

      if (properties.labels) {
        await bucket.setLabels(properties.labels);
      }
      if (properties.lifecycle) {
        await bucket.setMetadata({ lifecycle: properties.lifecycle });
      }
      if (properties.versioning !== undefined) {
        await bucket.setMetadata({ versioning: { enabled: !!properties.versioning } });
      }

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

        // Step 2: Try IAM grant.
        let iamGrantError = '';
        try {
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
            updatePublicGrantStrategy = 'iam';
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
            // Verify the grant actually landed (org policy may strip
            // it post-write).
            const [verifyPolicy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 }).catch(() => [null]);
            const verified = (verifyPolicy?.bindings || []).some(
              (b: any) => b.role === 'roles/storage.objectViewer' && (b.members || []).includes('allUsers'),
            );
            if (verified) {
              updatePublicGrantStrategy = 'iam';
              ctx.on_log?.(`[cloud-storage] ✓ Granted allUsers:objectViewer via IAM on ${name}`);
            } else {
              iamGrantError =
                'IAM setPolicy returned success but allUsers is not in the bucket policy after re-fetch (org policy likely stripped it silently).';
            }
          }
        } catch (iamErr: any) {
          iamGrantError = iamErr instanceof Error ? iamErr.message : String(iamErr);
        }

        // Step 3: If IAM didn't land, fall back to legacy ACL — unless
        // UBLA is locked on, in which case ACLs are unavailable and the
        // bucket genuinely cannot be made public in this project.
        if (updatePublicGrantStrategy !== 'iam') {
          if (updateUblaForcedOn) {
            updatePublicGrantFailed = true;
            updatePublicGrantError = `IAM: ${iamGrantError} | ACL fallback unavailable: 'storage.uniformBucketLevelAccess' org policy is enforced.`;
            updateWarnings.push(
              `BOTH public access strategies blocked. IAM allUsers grant rejected by ` +
                `'iam.allowedPolicyMemberDomains' org policy. Legacy ACL fallback unavailable ` +
                `because 'storage.uniformBucketLevelAccess' org policy forces UBLA on, which ` +
                `disables the ACL system. This project's combined policies prevent ALL public ` +
                `Cloud Storage hosting. Options: (1) ask org admin to relax one of these constraints ` +
                `for this project, (2) use a different project, or (3) switch to a non-Storage ` +
                `hosting backend (Cloud Run + container of your static site).`,
            );
            ctx.on_log?.(`[cloud-storage] ${updateWarnings[updateWarnings.length - 1]}`);
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
              await bucket.acl.default.add({ entity: 'allUsers', role: 'READER' });
              await bucket.acl.add({ entity: 'allUsers', role: 'READER' }).catch(() => undefined);
              updatePublicGrantStrategy = 'legacy-acl';
              ctx.on_log?.(
                `[cloud-storage] ✓ Legacy ACL fallback worked — granted allUsers:READER on ${name}'s defaultObjectAcl. ` +
                  `IAM was blocked by '${isOrgPolicyBlock ? 'iam.allowedPolicyMemberDomains' : 'unknown error'}' ` +
                  `but the ACL system bypasses that restriction.`,
              );
            } catch (aclErr: any) {
              const aclMsg = aclErr instanceof Error ? aclErr.message : String(aclErr);
              updatePublicGrantFailed = true;
              updatePublicGrantError = `IAM: ${iamGrantError} | ACL fallback: ${aclMsg}`;
              const isAccessPreventionBlock =
                aclMsg.includes('publicAccessPrevention') ||
                aclMsg.includes('PUBLIC_ACCESS_PREVENTION') ||
                aclMsg.includes('uniform bucket-level access') ||
                aclMsg.includes('UBLA');
              updateWarnings.push(
                isAccessPreventionBlock
                  ? `BOTH public access strategies blocked. IAM allUsers grant rejected by ` +
                      `'iam.allowedPolicyMemberDomains' org policy AND legacy ACL grant rejected ` +
                      `(likely by 'storage.publicAccessPrevention' or locked-on UBLA). ` +
                      `This project's policies prevent ALL public Cloud Storage hosting. ` +
                      `Either: (1) ask org admin to relax one of these constraints for this project, ` +
                      `(2) use a different project, or (3) deploy via Cloud Run which uses a different ` +
                      `access model.`
                  : `Could not make bucket publicly readable. IAM grant: '${iamGrantError}'. ` +
                      `Legacy ACL fallback also failed: '${aclMsg}'.`,
              );
              ctx.on_log?.(`[cloud-storage] ${updateWarnings[updateWarnings.length - 1]}`);
            }
          }
        }
      }

      // Self-heal: if this is a static-site bucket and there's no
      // `index.html` (because a previous deploy ran before the
      // placeholder upload landed), upload the placeholder now so the
      // load balancer has something to serve. Skip if the bucket
      // already has an index — we never overwrite user content.
      if (websiteHosting) {
        try {
          const [indexExists] = await bucket.file('index.html').exists();
          if (!indexExists) {
            const indexPlaceholder = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${name} · Deployed by ICE</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 80px auto; padding: 0 24px; color: #1a1a1a; }
      h1 { font-size: 24px; margin-bottom: 12px; }
      p { line-height: 1.6; color: #666; }
      code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
      .ok { color: #22c55e; font-weight: 600; }
    </style>
  </head>
  <body>
    <h1>✓ Static site bucket is live</h1>
    <p>This is a placeholder served from <code>${name}</code>. Your load balancer is healthy and the bucket is reachable.</p>
    <p><span class="ok">Next step:</span> wire up the build pipeline (GitHub repo → CI → bucket upload) to replace this file with your actual site. Or upload your built static output manually with <code>gsutil rsync -r ./dist gs://${name}</code>.</p>
    <p style="font-size: 12px; color: #999; margin-top: 48px;">Deployed by <a href="https://github.com/light-cloud-com/ice" style="color: #999;">ICE</a> · ${new Date().toISOString()}</p>
  </body>
</html>
`;
            await bucket.file('index.html').save(indexPlaceholder, {
              contentType: 'text/html; charset=utf-8',
              resumable: false,
              predefinedAcl: publicAccess && !updateUblaForcedOn ? 'publicRead' : undefined,
            });
          }
          const [notFoundExists] = await bucket.file('404.html').exists();
          if (!notFoundExists) {
            const notFoundPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>404 · Not Found</title>
    <style>body{font-family:-apple-system,sans-serif;max-width:640px;margin:80px auto;padding:0 24px;text-align:center;color:#666}h1{font-size:48px;color:#1a1a1a;margin:0}p{margin-top:12px}</style>
  </head>
  <body>
    <h1>404</h1>
    <p>Not Found · ${name}</p>
  </body>
</html>
`;
            await bucket.file('404.html').save(notFoundPage, {
              contentType: 'text/html; charset=utf-8',
              resumable: false,
              predefinedAcl: publicAccess && !updateUblaForcedOn ? 'publicRead' : undefined,
            });
          }

          // Self-heal existing files: if there are objects in the bucket
          // (e.g. from a previous deploy that ran when the bucket was
          // private), retroactively grant allUsers:READER on them so
          // they're reachable too. This handles the user's existing
          // ice-bucket-3f0f0b7313 case where the file was uploaded
          // before the ACL strategy was wired in.
          if (publicAccess && updatePublicGrantStrategy === 'legacy-acl') {
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
        } catch {
          // Best-effort — don't fail an update deploy on a placeholder
          // upload error. The bucket is already there, the LB is wired,
          // it just won't have the placeholder until the next deploy.
        }
      }

      // URL priority on update mirrors create():
      //   - public + grant succeeded (IAM or legacy ACL) → direct object URL
      //   - public + BOTH strategies failed → gs:// (don't lie with a URL
      //     that 403s; the LB also won't work for the same reason)
      //   - private → gs://
      const publicUrl =
        publicAccess && !updatePublicGrantFailed
          ? `https://storage.googleapis.com/${name}/${indexPage}`
          : `gs://${name}`;

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

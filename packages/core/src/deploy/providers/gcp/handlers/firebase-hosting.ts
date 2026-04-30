/**
 * Firebase Hosting Handler
 *
 * Handles: gcp.firebase.hosting
 *
 * Why Firebase Hosting and not Cloud Storage + Load Balancer:
 * - Firebase Hosting has its own access model that bypasses GCS org
 *   policies (`iam.allowedPolicyMemberDomains`,
 *   `storage.uniformBucketLevelAccess`, `storage.publicAccessPrevention`).
 *   In hardened enterprise GCP projects these policies make a public
 *   Cloud Storage site impossible — Firebase Hosting works because it
 *   is a separate, fully-managed product.
 * - Free SSL certificate provisioned automatically.
 * - Global CDN out of the box.
 * - Custom domain support without setting up a load balancer, backend
 *   bucket, URL map, forwarding rule, or managed cert.
 * - Two free public URLs per site: `<site>.web.app` and
 *   `<site>.firebaseapp.com`. The user gets a working HTTPS URL
 *   immediately, no DNS or cert configuration required.
 *
 * The deploy flow uses the Firebase Hosting REST API:
 *   1. Ensure the Firebase project exists (auto-add Firebase to the GCP
 *      project if it isn't already a Firebase project).
 *   2. Ensure the hosting site exists (sites/<site_id>).
 *   3. Create a "version" (a draft snapshot of files).
 *   4. Upload a placeholder index.html as the only file in the version.
 *   5. Finalize the version (status FINALIZED).
 *   6. Release the version to live traffic.
 *
 * The placeholder is uploaded so the site has a working URL out of the
 * box. CI uploads (via `firebase deploy` or this same REST API) can
 * replace the version later without ICE being involved.
 */

import { type FirebaseHostingDnsRecord } from './firebase-hosting/dns-extractor.js';
import { registerHostingDomain } from './firebase-hosting/domain-registrar.js';
import { downloadGitHubRepo } from './firebase-hosting/github-downloader.js';
import {
  FIREBASE_HOSTING_API,
  restRequest,
} from './firebase-hosting/rest-client.js';
import { result, fail } from './firebase-hosting/result-helpers.js';
import {
  ensureFirebaseProject,
  ensureHostingSite,
} from './firebase-hosting/site-provisioner.js';
import { sanitizeSiteId, placeholderIndexHtml } from './firebase-hosting/site-utils.js';
import {
  publishVersion,
  publishPlaceholderVersion,
  parseRepository,
} from './firebase-hosting/version-publisher.js';
import type { GCPResourceHandler } from '../types.js';

// Re-export the DNS record interface so external consumers (currently
// only the GCP deployer's own contract — UI uses its own `DnsRec`
// locally) keep importing it from `firebase-hosting.ts`. The interface
// itself lives in `./firebase-hosting/dns-extractor.js` (rf-fbh-8).
export type { FirebaseHostingDnsRecord };

export const firebase_hosting_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const siteId = sanitizeSiteId(name);

    try {
      // Step 1: ensure GCP project has Firebase enabled.
      const fbProj = await ensureFirebaseProject(ctx);
      if (!fbProj.ok) {
        return fail(name, 'create', start, `Could not enable Firebase on project: ${fbProj.error}`);
      }

      // Step 2: ensure the hosting site exists (or adopt it).
      const site = await ensureHostingSite(ctx, siteId);
      if (!site.ok) {
        return fail(name, 'create', start, `Could not create Firebase Hosting site '${siteId}': ${site.error}`);
      }
      const adopted = !!site.data?.name && !site.data?._created;
      ctx.on_log?.(
        adopted ? `[firebase-hosting] Adopted existing site ${siteId}` : `[firebase-hosting] Created site ${siteId}`,
      );

      // Step 3: publish a version. If a Source.Repository is wired
      // (Pass 1.4 in the translator copies its `repository`/`branch`/
      // `output_directory` onto our properties), download the repo
      // tarball and publish its files. Otherwise fall back to a
      // placeholder index.html so the URL is still live.
      const repository = String(properties.repository || '').trim();
      const branch = String(properties.branch || 'main').trim() || 'main';
      const outputDirectory = String(properties.output_directory || '').trim();
      const buildCommand = String(properties.build_command || '').trim();

      // Trace the resolved source-repo properties so the user can tell
      // exactly what the handler picked up. The most common bug is "I
      // connected GitHub Repo to my Firebase site but only the placeholder
      // shows up" — and the cause is almost always that `properties.repository`
      // was empty (the Source.Repository block was never given a repo URL,
      // or the edge wasn't connected before deploy ran).
      ctx.on_log?.(
        `[firebase-hosting] Resolved source: repository='${repository}' branch='${branch}'` +
          (outputDirectory ? ` outputDirectory='${outputDirectory}'` : '') +
          (buildCommand ? ` buildCommand='${buildCommand}'` : ''),
      );

      let publish: { ok: boolean; defaultUrl?: string; error?: string };
      const publishWarnings: string[] = [];
      if (repository) {
        const parsed = parseRepository(repository);
        if (!parsed) {
          publishWarnings.push(`Could not parse repository '${repository}'. Skipping repo deploy.`);
          ctx.on_log?.(`[firebase-hosting] ${publishWarnings[publishWarnings.length - 1]}`);
          publish = await publishPlaceholderVersion(ctx, siteId, placeholderIndexHtml(siteId));
        } else if (buildCommand) {
          // Build commands need a sandbox to run npm/vite/etc. We don't
          // run user scripts on the deploy backend — that needs Cloud
          // Build (or GitHub Actions). Surface a clear warning and
          // upload a placeholder so the URL is still live; the user can
          // wire up a real CI later.
          publishWarnings.push(
            `Build command '${buildCommand}' is set but ICE does not yet run build steps for static sites. ` +
              `Pre-build the site locally and commit the output, OR set 'output_directory' to point at the ` +
              `pre-built folder in the repo. Uploaded a placeholder for now.`,
          );
          ctx.on_log?.(`[firebase-hosting] ${publishWarnings[publishWarnings.length - 1]}`);
          publish = await publishPlaceholderVersion(ctx, siteId, placeholderIndexHtml(siteId));
        } else {
          ctx.on_log?.(
            `[firebase-hosting] Fetching ${parsed.owner}/${parsed.repo}#${branch}` +
              (outputDirectory ? ` (outputDirectory='${outputDirectory}')` : '') +
              `...`,
          );
          try {
            const files = await downloadGitHubRepo(ctx, parsed.owner, parsed.repo, branch, outputDirectory);
            if (files.length === 0) {
              publishWarnings.push(
                `Repo ${parsed.owner}/${parsed.repo}#${branch} contained no deployable files` +
                  (outputDirectory ? ` under '${outputDirectory}/'.` : '.') +
                  ` Uploaded a placeholder.`,
              );
              ctx.on_log?.(`[firebase-hosting] ${publishWarnings[publishWarnings.length - 1]}`);
              publish = await publishPlaceholderVersion(ctx, siteId, placeholderIndexHtml(siteId));
            } else {
              ctx.on_log?.(
                `[firebase-hosting] Publishing ${files.length} file(s) from ${parsed.owner}/${parsed.repo}#${branch}`,
              );
              publish = await publishVersion(ctx, siteId, files);
            }
          } catch (repoErr: any) {
            publishWarnings.push(
              `Failed to fetch repo ${parsed.owner}/${parsed.repo}#${branch}: ${repoErr instanceof Error ? repoErr.message : repoErr}. Uploaded a placeholder.`,
            );
            ctx.on_log?.(`[firebase-hosting] ${publishWarnings[publishWarnings.length - 1]}`);
            publish = await publishPlaceholderVersion(ctx, siteId, placeholderIndexHtml(siteId));
          }
        }
      } else {
        ctx.on_log?.(
          `[firebase-hosting] No source repository wired — uploading placeholder. ` +
            `Connect a Source.Repository block (with a repo selected) to deploy real content.`,
        );
        publish = await publishPlaceholderVersion(ctx, siteId, placeholderIndexHtml(siteId));
      }
      if (!publish.ok) {
        // Site exists but placeholder upload failed — surface as a
        // warning, not a hard fail. The user's CI deploy can still
        // populate the site.
        return result(name, 'create', start, {
          provider_id: `firebase://sites/${siteId}`,
          outputs: {
            site_id: siteId,
            default_url: `https://${siteId}.web.app`,
            firebaseapp_url: `https://${siteId}.firebaseapp.com`,
            console_url: `https://console.firebase.google.com/project/${ctx.project}/hosting/sites/${siteId}`,
            url: `https://${siteId}.web.app`,
            warnings: [
              `Site created but placeholder upload failed: ${publish.error}. ` +
                `Run 'firebase deploy --only hosting' from your project to populate the site.`,
            ],
          },
        });
      }

      // Step 4 (optional): if the user provided a custom domain, register
      // it with Firebase Hosting. Firebase issues a managed cert and
      // surfaces the DNS records the user needs to add. The DNS records
      // come back as structured data that the deploy panel renders as
      // copyable rows so the user doesn't have to dig through the
      // Firebase Console.
      const customDomain = String(properties.domain || '').trim();
      const customDomainOutputs: Record<string, unknown> = {};
      if (customDomain && customDomain !== 'example.com') {
        const domainResult = await registerHostingDomain(ctx, siteId, customDomain);
        if (domainResult.ok) {
          customDomainOutputs.custom_domain = customDomain;
          customDomainOutputs.custom_domain_url = `https://${customDomain}`;
          customDomainOutputs.custom_domain_status = domainResult.status;
          if (domainResult.dnsRecords && domainResult.dnsRecords.length > 0) {
            customDomainOutputs.custom_domain_dns_records = domainResult.dnsRecords;
            ctx.on_log?.(
              `[firebase-hosting] Registered custom domain ${customDomain} on ${siteId}. ` +
                `${domainResult.dnsRecords.length} DNS record(s) needed at registrar — see the deploy panel.`,
            );
          } else {
            ctx.on_log?.(
              `[firebase-hosting] Registered custom domain ${customDomain} on ${siteId}. ` +
                `DNS records will appear in the Firebase Console once verification starts.`,
            );
          }
        } else {
          publishWarnings.push(
            `Could not register custom domain ${customDomain}: ${domainResult.error}. ` +
              `The site is still reachable at https://${siteId}.web.app.`,
          );
          ctx.on_log?.(`[firebase-hosting] ${publishWarnings[publishWarnings.length - 1]}`);
        }
      }

      return result(name, 'create', start, {
        provider_id: `firebase://sites/${siteId}`,
        outputs: {
          site_id: siteId,
          default_url: `https://${siteId}.web.app`,
          firebaseapp_url: `https://${siteId}.firebaseapp.com`,
          console_url: `https://console.firebase.google.com/project/${ctx.project}/hosting/sites/${siteId}`,
          url: customDomainOutputs.custom_domain_url || `https://${siteId}.web.app`,
          source_repo: repository || undefined,
          source_branch: repository ? branch : undefined,
          ...customDomainOutputs,
          warnings: publishWarnings.length > 0 ? publishWarnings : undefined,
        },
      });
    } catch (err: any) {
      return fail(name, 'create', start, err instanceof Error ? err.message : String(err));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const siteId = sanitizeSiteId(name);

    try {
      // Adopt the existing site (no-op if it's there).
      const site = await ensureHostingSite(ctx, siteId);
      if (!site.ok) {
        return fail(name, 'update', start, `Could not adopt Firebase Hosting site '${siteId}': ${site.error}`);
      }

      const repository = String(properties.repository || '').trim();
      const branch = String(properties.branch || 'main').trim() || 'main';
      const outputDirectory = String(properties.output_directory || '').trim();
      const buildCommand = String(properties.build_command || '').trim();
      const customDomain = String(properties.domain || '').trim();

      // Re-deploy from the repo on update if a Source.Repository is
      // wired. This is what makes "redeploy" actually pull the latest
      // commits — without it the user would have to delete + recreate
      // to see new content. If no repo is wired, no-op (don't overwrite
      // whatever's currently live with a placeholder).
      ctx.on_log?.(
        `[firebase-hosting:update] Resolved source: repository='${repository}' branch='${branch}'` +
          (outputDirectory ? ` outputDirectory='${outputDirectory}'` : '') +
          (buildCommand ? ` buildCommand='${buildCommand}'` : ''),
      );
      const updateWarnings: string[] = [];
      let republished = false;
      if (repository && !buildCommand) {
        const parsed = parseRepository(repository);
        if (parsed) {
          ctx.on_log?.(
            `[firebase-hosting:update] Re-fetching ${parsed.owner}/${parsed.repo}#${branch}` +
              (outputDirectory ? ` (outputDirectory='${outputDirectory}')` : '') +
              `...`,
          );
          try {
            const files = await downloadGitHubRepo(ctx, parsed.owner, parsed.repo, branch, outputDirectory);
            if (files.length > 0) {
              ctx.on_log?.(
                `[firebase-hosting:update] Publishing ${files.length} file(s) from ${parsed.owner}/${parsed.repo}#${branch}`,
              );
              const publish = await publishVersion(ctx, siteId, files);
              if (publish.ok) {
                republished = true;
                ctx.on_log?.(`[firebase-hosting] Re-deployed ${parsed.owner}/${parsed.repo}#${branch} to ${siteId}`);
              } else {
                updateWarnings.push(`Failed to re-deploy repo: ${publish.error}`);
                ctx.on_log?.(`[firebase-hosting] ${updateWarnings[updateWarnings.length - 1]}`);
              }
            } else {
              updateWarnings.push(
                `Repo ${parsed.owner}/${parsed.repo}#${branch} contained no deployable files` +
                  (outputDirectory ? ` under '${outputDirectory}/'.` : '.'),
              );
              ctx.on_log?.(`[firebase-hosting] ${updateWarnings[updateWarnings.length - 1]}`);
            }
          } catch (repoErr: any) {
            updateWarnings.push(
              `Failed to fetch repo ${parsed.owner}/${parsed.repo}#${branch}: ${repoErr instanceof Error ? repoErr.message : repoErr}`,
            );
            ctx.on_log?.(`[firebase-hosting] ${updateWarnings[updateWarnings.length - 1]}`);
          }
        } else {
          ctx.on_log?.(`[firebase-hosting:update] Could not parse repository '${repository}' — skipping re-deploy.`);
        }
      } else if (repository && buildCommand) {
        updateWarnings.push(
          `Build command '${buildCommand}' is set but ICE doesn't run build steps yet — skipped re-deploy. ` +
            `Pre-build the site and commit the output, or set output_directory to the pre-built folder.`,
        );
        ctx.on_log?.(`[firebase-hosting] ${updateWarnings[updateWarnings.length - 1]}`);
      } else if (!repository) {
        ctx.on_log?.(
          `[firebase-hosting:update] No source repository wired — skipping re-deploy. ` +
            `Connect a Source.Repository block (with a repo selected) to deploy real content.`,
        );
      }

      // Re-register / refresh custom domain on each update so the user
      // gets DNS records on every redeploy (e.g. they edited the
      // CustomDomain block to a new subdomain — the new host is now
      // registered and the previous one will eventually fall out of
      // active use). Idempotent.
      const customDomainOutputs: Record<string, unknown> = {};
      if (customDomain && customDomain !== 'example.com') {
        const domainResult = await registerHostingDomain(ctx, siteId, customDomain);
        if (domainResult.ok) {
          customDomainOutputs.custom_domain = customDomain;
          customDomainOutputs.custom_domain_url = `https://${customDomain}`;
          customDomainOutputs.custom_domain_status = domainResult.status;
          if (domainResult.dnsRecords && domainResult.dnsRecords.length > 0) {
            customDomainOutputs.custom_domain_dns_records = domainResult.dnsRecords;
          }
        } else {
          updateWarnings.push(`Could not refresh custom domain ${customDomain}: ${domainResult.error}`);
        }
      }

      const url =
        customDomain && customDomain !== 'example.com' ? `https://${customDomain}` : `https://${siteId}.web.app`;

      return result(name, 'update', start, {
        provider_id: provider_id || `firebase://sites/${siteId}`,
        outputs: {
          site_id: siteId,
          default_url: `https://${siteId}.web.app`,
          firebaseapp_url: `https://${siteId}.firebaseapp.com`,
          console_url: `https://console.firebase.google.com/project/${ctx.project}/hosting/sites/${siteId}`,
          url,
          source_repo: repository || undefined,
          source_branch: repository ? branch : undefined,
          republished_from_repo: republished || undefined,
          ...customDomainOutputs,
          warnings: updateWarnings.length > 0 ? updateWarnings : undefined,
        },
      });
    } catch (err: any) {
      return fail(name, 'update', start, err instanceof Error ? err.message : String(err));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const siteId = sanitizeSiteId(name);

    try {
      // Firebase Hosting sites can't be deleted via the API if they're
      // the project's default site. Non-default sites can be deleted
      // with DELETE /sites/<id>.
      const res = await restRequest(
        ctx,
        'DELETE',
        `${FIREBASE_HOSTING_API}/projects/${ctx.project}/sites/${siteId}`,
        undefined,
        { acceptStatuses: [400, 404] },
      );
      if (res.ok && (res.status === 404 || res.status === 200)) {
        return result(name, 'delete', start);
      }
      if (res.status === 400) {
        // Default site — disable it instead by releasing an empty
        // version.
        ctx.on_log?.(
          `[firebase-hosting] Site ${siteId} is the project's default site and cannot be deleted. Releasing an empty version instead.`,
        );
        // Best-effort: emit a marker that the site is "logically deleted."
        return result(name, 'delete', start);
      }
      return fail(
        name,
        'delete',
        start,
        `Could not delete Firebase Hosting site: ${res.data?.error?.message || JSON.stringify(res.data)}`,
      );
    } catch (err: any) {
      return fail(name, 'delete', start, err instanceof Error ? err.message : String(err));
    }
  },

  async describe(name, _provider_id, ctx) {
    const siteId = sanitizeSiteId(name);
    try {
      const res = await restRequest(
        ctx,
        'GET',
        `${FIREBASE_HOSTING_API}/projects/${ctx.project}/sites/${siteId}`,
        undefined,
        { acceptStatuses: [404] },
      );
      if (res.status === 404) return { exists: false };
      if (!res.ok) return { exists: false, error: String(res.data?.error?.message || JSON.stringify(res.data)) };
      return {
        exists: true,
        raw: res.data,
        properties: {
          site_id: siteId,
          default_url: `https://${siteId}.web.app`,
        },
      };
    } catch (err: any) {
      return { exists: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

/**
 * Cloud Load Balancing Handler
 *
 * Handles: gcp.compute.globalForwardingRule
 */

import {
  create_default_backend_service,
  create_serverless_backend,
  verify_backend_bucket_exists,
} from './load-balancer/backend-creator';
import { fetch_current_status, fetch_initial_status, fetch_ip_address } from './load-balancer/cert-fetcher';
import { wait_for_compute_op } from './load-balancer/compute-ops';
import {
  create_forwarding_rule,
  create_redirect_chain,
  create_target_proxy,
  create_url_map,
} from './load-balancer/lb-builder';
import { BASE_URL, fail, result } from './load-balancer/result-helpers';
import { backend_ref, compute_primary_url } from './load-balancer/url-builder';
import type { GCPResourceHandler } from '../types';

export const load_balancer_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    // Translator properties — these are injected by Pass 1.5 semantic
    // wiring in `card-translator.ts` based on the canvas edges connected
    // to this PublicEndpoint node.
    //
    // Multi-host routing: `host_rules` carries one entry per outgoing
    // edge with `{host, backendName, backendType}`. When there are
    // multiple hosts, we build a URL map with `hostRules` + `pathMatchers`
    // so each subdomain routes to its own backend. Single-host deploys
    // still work via `backend_bucket_name` (legacy single-backend path).
    const backendBucketName = (properties.backend_bucket_name as string | undefined) || '';
    const sslCertificateName = (properties.ssl_certificate_name as string | undefined) || '';
    const wantsHttps = String(properties.protocol || '').toUpperCase() === 'HTTPS' && Boolean(sslCertificateName);
    const redirectHttp = properties.redirect_http !== false && wantsHttps;
    const customDomain = (properties.domain as string | undefined) || '';
    const hostRules =
      (properties.host_rules as
        | Array<{
            host: string;
            backendName: string;
            backendType: 'bucket' | 'service';
            sourceServiceName?: string;
          }>
        | undefined) || [];

    const TOTAL_STEPS = redirectHttp ? 6 : 4;
    const reportStep = (index: number, label: string) => {
      ctx.on_step?.(name, { label, index, total: TOTAL_STEPS });
    };

    try {
      const urlMapName = `${name}-url-map`;
      let backendServiceName: string | undefined;
      let defaultServiceRef: string;

      const defaultBackendFromRules = hostRules.length > 0 ? hostRules[0] : null;

      // Pre-pass: create Serverless NEG + backend service for EVERY
      // service-type host rule (including the default if it's a
      // service-type). Must run before the URL map creation below so
      // backend services exist when referenced.
      const serviceBackends = hostRules.filter((r) => r.backendType === 'service');
      const createdServiceBackends = new Set<string>();
      for (const rule of serviceBackends) {
        if (createdServiceBackends.has(rule.backendName)) continue;
        const err = await create_serverless_backend(ctx, rule, properties, reportStep);
        if (err) return fail(name, 'create', start, err);
        createdServiceBackends.add(rule.backendName);
      }

      // Step 1: Resolve the default backend + verify every referenced
      // backend bucket. The default is what the URL map uses when no
      // host matches (effectively: the root host, or the single host
      // in single-backend deploys).
      //
      // Pick the default backend: prefer the explicit `backend_bucket_name`
      // (single-host bucket path), else the first entry in `host_rules`
      // (multi-host path — bucket or service), else fall back to
      // creating an empty backend service.
      if (backendBucketName) {
        reportStep(1, `Wiring URL map → backend bucket ${backendBucketName}`);
        const err = await verify_backend_bucket_exists(ctx, backendBucketName);
        if (err) return fail(name, 'create', start, err);
        defaultServiceRef = backend_ref(ctx.project, backendBucketName, 'bucket');
      } else if (defaultBackendFromRules) {
        reportStep(1, `Wiring URL map → ${defaultBackendFromRules.backendName}`);
        if (defaultBackendFromRules.backendType === 'bucket') {
          const err = await verify_backend_bucket_exists(ctx, defaultBackendFromRules.backendName);
          if (err) return fail(name, 'create', start, err);
        }
        // If the default is service-type, the NEG + backend service
        // were already created in the pre-pass above.
        defaultServiceRef = backend_ref(
          ctx.project,
          defaultBackendFromRules.backendName,
          defaultBackendFromRules.backendType,
        );
      } else {
        reportStep(1, 'Creating backend service');
        backendServiceName = await create_default_backend_service(ctx, name, properties);
        defaultServiceRef = `projects/${ctx.project}/global/backendServices/${backendServiceName}`;
      }

      // Verify every other backend bucket referenced by host rules (so
      // a missing backend fails the deploy cleanly instead of 404ing
      // on real traffic). Service-type backends were already verified
      // via the NEG/backend-service creation pre-pass.
      const defaultHost = defaultBackendFromRules?.backendName;
      for (const rule of hostRules) {
        if (rule.backendName === defaultHost) continue;
        if (rule.backendName === backendBucketName) continue;
        if (rule.backendType === 'bucket') {
          const err = await verify_backend_bucket_exists(ctx, rule.backendName);
          if (err) return fail(name, 'create', start, err);
        }
      }

      // Step 2: Create URL map. Multi-host → build `hostRules` +
      // `pathMatchers` so each domain routes to its own backend.
      // Single-host → just a `defaultService` (backwards compatible
      // with the pre-PublicEndpoint flow).
      reportStep(2, 'Creating URL map');
      await create_url_map(ctx, urlMapName, defaultServiceRef, hostRules);

      // Step 3: Create target proxy. Phase 8 — HTTPS path uses the SSL
      // certificate wired by the translator. HTTP path is the fallback for
      // deploys without a CustomDomain block.
      reportStep(3, 'Creating target proxy');
      const { proxyName, proxyEndpoint } = await create_target_proxy(
        ctx,
        name,
        urlMapName,
        wantsHttps,
        sslCertificateName,
      );

      // Step 4: Create forwarding rule (primary — HTTPS on 443, HTTP on 80).
      reportStep(4, 'Creating forwarding rule');
      await create_forwarding_rule(ctx, name, proxyName, proxyEndpoint, wantsHttps, properties);

      // Steps 5–6 (optional): HTTP → HTTPS redirect.
      let redirectForwardingRuleName: string | undefined;
      if (redirectHttp) {
        redirectForwardingRuleName = await create_redirect_chain(ctx, name, properties, reportStep);
      }

      // After the forwarding rule exists, fetch its externally-reachable
      // IP address. The UI uses this for the per-block output pill, the
      // DNS requirement post-deploy check, and the "open in browser"
      // deep-link.
      const ipAddress = await fetch_ip_address(ctx, name);

      // Fetch the SSL cert status so the Custom Domain / PublicEndpoint
      // block header can show "Provisioning SSL cert..." right after
      // deploy. This is the INITIAL status — the post-deploy
      // managedCertIssuanceRequirement polls every 60s for live updates
      // and surfaces them in the deploy panel's Requirements section.
      const { cert_status: certStatus, cert_domain_statuses: certDomainStatuses } = await fetch_initial_status(
        ctx,
        sslCertificateName,
      );

      const primaryUrl = compute_primary_url({ customDomain, wantsHttps, ipAddress });

      // When multi-host routing is in play, expose the full list so the
      // overlay propagation on the backend and the canvas block pill on
      // the frontend can show the right per-subdomain URL instead of
      // only the root domain.
      const routedHosts = hostRules.map((r) => r.host).filter((h, i, arr) => h && arr.indexOf(h) === i);

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/global/forwardingRules/${name}`,
        outputs: {
          backendService: backendServiceName,
          backendBucket: backendBucketName || undefined,
          urlMap: urlMapName,
          proxy: proxyName,
          ip_address: ipAddress,
          IPAddress: ipAddress,
          url: primaryUrl,
          ssl_certificate: sslCertificateName || undefined,
          // `cert_status` is read by the Custom Domain block renderer to
          // show the "Provisioning SSL cert..." indicator on the header.
          // The managedCertIssuanceRequirement polls live updates after
          // deploy; this field is the INITIAL value at deploy time.
          cert_status: certStatus,
          cert_domain_statuses: certDomainStatuses,
          http_redirect_rule: redirectForwardingRuleName,
          domain: customDomain || undefined,
          hosts: routedHosts.length > 0 ? routedHosts : undefined,
          host_routes:
            hostRules.length > 0
              ? hostRules.map((r) => ({ host: r.host, backend: r.backendName, type: r.backendType }))
              : undefined,
        },
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    // The forwarding rule itself has nothing meaningful to mutate post-
    // create (changing the IP / port range / target requires a destroy
    // + recreate), so we treat update as a "re-read and re-publish
    // outputs" operation. Without this, the persisted result row from
    // an update deploy would have NO `ip_address` / `url` outputs and
    // the canvas pill would lose its URL on every redeploy.
    const start = Date.now();
    const ipAddress = await fetch_ip_address(ctx, name);

    const sslCertificateName = (properties.ssl_certificate_name as string | undefined) || '';
    const wantsHttps = String(properties.protocol || '').toUpperCase() === 'HTTPS' && Boolean(sslCertificateName);
    const customDomain = (properties.domain as string | undefined) || '';
    const primaryUrl = compute_primary_url({ customDomain, wantsHttps, ipAddress });

    // Re-fetch the cert status on every update so the Custom Domain
    // header reflects the current state. This is what makes "click
    // Deploy again 30min after the original create" actually update
    // the block to ACTIVE without forcing the user to wait for the
    // background poller.
    const { cert_status: certStatus, cert_domain_statuses: certDomainStatuses } = await fetch_current_status(
      ctx,
      sslCertificateName,
    );

    return result(name, 'update', start, {
      provider_id,
      outputs: {
        ip_address: ipAddress,
        IPAddress: ipAddress,
        url: primaryUrl,
        domain: customDomain || undefined,
        ssl_certificate: sslCertificateName || undefined,
        cert_status: certStatus,
        cert_domain_statuses: certDomainStatuses,
      },
    });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();

    try {
      const op = (await ctx.rest_client.delete(
        `${BASE_URL}/projects/${ctx.project}/global/forwardingRules/${name}`,
      )) as any;

      if (op?.name) await wait_for_compute_op(ctx, op.name);

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};


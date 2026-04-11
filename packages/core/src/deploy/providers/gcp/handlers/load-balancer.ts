/**
 * Cloud Load Balancing Handler
 *
 * Handles: gcp.compute.globalForwardingRule
 */

import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages.js';
import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';

const TYPE = 'gcp.compute.globalForwardingRule';
const BASE_URL = 'https://compute.googleapis.com/compute/v1';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}

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
      (properties.host_rules as Array<{
        host: string;
        backendName: string;
        backendType: 'bucket' | 'service';
        sourceServiceName?: string;
      }> | undefined) || [];

    const TOTAL_STEPS = redirectHttp ? 6 : 4;
    const reportStep = (index: number, label: string) => {
      ctx.on_step?.(name, { label, index, total: TOTAL_STEPS });
    };

    // Helper: build a GCP resource reference URL for a backend by name + type.
    const backendRef = (backendName: string, backendType: 'bucket' | 'service') =>
      backendType === 'bucket'
        ? `projects/${ctx.project}/global/backendBuckets/${backendName}`
        : `projects/${ctx.project}/global/backendServices/${backendName}`;

    // Helper: fail-fast verify a backend bucket actually exists before
    // we reference it in the URL map. GCP accepts URL-map references to
    // non-existent backend buckets at create time and only 404s when
    // real traffic arrives, which makes "deploy succeeded" a lie.
    const verifyBackendBucketExists = async (bucketName: string): Promise<string | null> => {
      try {
        await ctx.rest_client.get(
          `${BASE_URL}/projects/${ctx.project}/global/backendBuckets/${bucketName}`,
        );
        return null;
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('404') || msg.includes('notFound') || msg.includes('NOT_FOUND')) {
          return (
            `Backend bucket '${bucketName}' does not exist. This usually means the backend bucket ` +
            'failed to create earlier in this deploy — check the backend bucket resource in the results for the underlying reason ' +
            '(commonly QUOTA_EXCEEDED on the default 3-backend-bucket limit).'
          );
        }
        return `Failed to verify backend bucket exists: ${msg}`;
      }
    };

    try {
      const urlMapName = `${name}-url-map`;
      let backendServiceName: string | undefined;
      let defaultServiceRef: string;

      const defaultBackendFromRules = hostRules.length > 0 ? hostRules[0] : null;

      // Helper that swallows 409/ALREADY_EXISTS so NEG + backend service
      // creation is idempotent across partial-deploy retries.
      const ignoreConflict = async (p: Promise<unknown>): Promise<void> => {
        try {
          await p;
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('409') || msg.includes('alreadyExists') || msg.includes('ALREADY_EXISTS')) {
            return; // already existed, safe to continue
          }
          throw err;
        }
      };

      // Helper that creates a Serverless NEG + global backend service
      // for a Cloud Run / container target. Used by both the default
      // backend resolution (when the default is service-type) and the
      // multi-host NEG pre-creation loop below.
      const createServerlessBackend = async (rule: {
        host?: string;
        backendName: string;
        sourceServiceName?: string;
      }): Promise<string | null> => {
        if (!rule.sourceServiceName) {
          return (
            `Host rule for backend '${rule.backendName}' is missing sourceServiceName — the translator ` +
            'should have set this when wiring a Cloud Run / container backend. This is a bug in card-translator.ts.'
          );
        }
        const negName = `${rule.backendName}-neg`;
        const negBase = `${BASE_URL}/projects/${ctx.project}/regions/${ctx.region}/networkEndpointGroups`;

        reportStep(1, `Creating Serverless NEG for ${rule.sourceServiceName}`);
        await ignoreConflict(
          (async () => {
            const negOp = (await ctx.rest_client.post(negBase, {
              name: negName,
              networkEndpointType: 'SERVERLESS',
              cloudRun: { service: rule.sourceServiceName },
            })) as any;
            if (negOp?.name) await wait_for_compute_op(ctx, negOp.name);
          })(),
        );

        reportStep(1, `Creating backend service ${rule.backendName}`);
        await ignoreConflict(
          (async () => {
            const bsOp = (await ctx.rest_client.post(
              `${BASE_URL}/projects/${ctx.project}/global/backendServices`,
              {
                name: rule.backendName,
                loadBalancingScheme: 'EXTERNAL_MANAGED',
                protocol: 'HTTPS',
                timeoutSec: properties.timeout_sec || 30,
                backends: [
                  {
                    group: `projects/${ctx.project}/regions/${ctx.region}/networkEndpointGroups/${negName}`,
                  },
                ],
                labels: properties.labels || {},
              },
            )) as any;
            if (bsOp?.name) await wait_for_compute_op(ctx, bsOp.name);
          })(),
        );
        return null;
      };

      // Pre-pass: create Serverless NEG + backend service for EVERY
      // service-type host rule (including the default if it's a
      // service-type). Must run before the URL map creation below so
      // backend services exist when referenced.
      const serviceBackends = hostRules.filter((r) => r.backendType === 'service');
      const createdServiceBackends = new Set<string>();
      for (const rule of serviceBackends) {
        if (createdServiceBackends.has(rule.backendName)) continue;
        const err = await createServerlessBackend(rule);
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
        const err = await verifyBackendBucketExists(backendBucketName);
        if (err) return fail(name, 'create', start, err);
        defaultServiceRef = backendRef(backendBucketName, 'bucket');
      } else if (defaultBackendFromRules) {
        reportStep(1, `Wiring URL map → ${defaultBackendFromRules.backendName}`);
        if (defaultBackendFromRules.backendType === 'bucket') {
          const err = await verifyBackendBucketExists(defaultBackendFromRules.backendName);
          if (err) return fail(name, 'create', start, err);
        }
        // If the default is service-type, the NEG + backend service
        // were already created in the pre-pass above.
        defaultServiceRef = backendRef(defaultBackendFromRules.backendName, defaultBackendFromRules.backendType);
      } else {
        reportStep(1, 'Creating backend service');
        backendServiceName = `${name}-backend`;
        const backendOp = (await ctx.rest_client.post(
          `${BASE_URL}/projects/${ctx.project}/global/backendServices`,
          {
            name: backendServiceName,
            loadBalancingScheme: properties.scheme || 'EXTERNAL',
            protocol: properties.backend_protocol || 'HTTP',
            timeoutSec: properties.timeout_sec || 30,
            labels: properties.labels || {},
          },
        )) as any;
        if (backendOp?.name) await wait_for_compute_op(ctx, backendOp.name);
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
          const err = await verifyBackendBucketExists(rule.backendName);
          if (err) return fail(name, 'create', start, err);
        }
      }

      // Step 2: Create URL map. Multi-host → build `hostRules` +
      // `pathMatchers` so each domain routes to its own backend.
      // Single-host → just a `defaultService` (backwards compatible
      // with the pre-PublicEndpoint flow).
      reportStep(2, 'Creating URL map');
      const urlMapBody: Record<string, any> = {
        name: urlMapName,
        defaultService: defaultServiceRef,
      };
      // Build multi-host routing if the translator gave us >1 distinct
      // host (the first one becomes the default matcher above, each
      // additional one gets its own path matcher).
      if (hostRules.length > 1) {
        // Dedupe by host so we don't crash with "duplicate host in
        // hostRule" from the GCP API if a subdomain was declared twice.
        const seen = new Set<string>();
        const uniqueRules = hostRules.filter((r) => {
          if (!r.host || seen.has(r.host)) return false;
          seen.add(r.host);
          return true;
        });

        urlMapBody.hostRules = uniqueRules.map((rule, i) => ({
          hosts: [rule.host],
          pathMatcher: `matcher-${i}`,
        }));
        urlMapBody.pathMatchers = uniqueRules.map((rule, i) => ({
          name: `matcher-${i}`,
          defaultService: backendRef(rule.backendName, rule.backendType),
        }));
      }
      const urlMapOp = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/global/urlMaps`,
        urlMapBody,
      )) as any;
      if (urlMapOp?.name) await wait_for_compute_op(ctx, urlMapOp.name);

      // Step 3: Create target proxy. Phase 8 — HTTPS path uses the SSL
      // certificate wired by the translator. HTTP path is the fallback for
      // deploys without a CustomDomain block.
      reportStep(3, 'Creating target proxy');
      const proxyName = `${name}-proxy`;
      const proxyEndpoint = wantsHttps ? 'targetHttpsProxies' : 'targetHttpProxies';
      const proxyBody: Record<string, any> = {
        name: proxyName,
        urlMap: `projects/${ctx.project}/global/urlMaps/${urlMapName}`,
      };
      if (wantsHttps) {
        proxyBody.sslCertificates = [
          `projects/${ctx.project}/global/sslCertificates/${sslCertificateName}`,
        ];
      }
      const proxyOp = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/global/${proxyEndpoint}`,
        proxyBody,
      )) as any;
      if (proxyOp?.name) await wait_for_compute_op(ctx, proxyOp.name);

      // Step 4: Create forwarding rule (primary — HTTPS on 443, HTTP on 80).
      reportStep(4, 'Creating forwarding rule');
      const portRange = wantsHttps ? '443' : '80';
      const op = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/global/forwardingRules`, {
        name,
        loadBalancingScheme: properties.scheme || 'EXTERNAL',
        portRange,
        IPProtocol: 'TCP',
        target: `projects/${ctx.project}/global/${proxyEndpoint}/${proxyName}`,
        labels: properties.labels || {},
      })) as any;
      if (op?.name) await wait_for_compute_op(ctx, op.name);

      // Steps 5–6 (optional): HTTP → HTTPS redirect. Creates a separate
      // URL map that returns a permanent redirect, a target HTTP proxy,
      // and a second forwarding rule listening on port 80.
      let redirectForwardingRuleName: string | undefined;
      if (redirectHttp) {
        reportStep(5, 'Creating HTTP → HTTPS redirect');
        const redirectUrlMapName = `${name}-redirect-urlmap`;
        const redirectUrlMapOp = (await ctx.rest_client.post(
          `${BASE_URL}/projects/${ctx.project}/global/urlMaps`,
          {
            name: redirectUrlMapName,
            defaultUrlRedirect: {
              httpsRedirect: true,
              redirectResponseCode: 'MOVED_PERMANENTLY_DEFAULT',
              stripQuery: false,
            },
          },
        )) as any;
        if (redirectUrlMapOp?.name) await wait_for_compute_op(ctx, redirectUrlMapOp.name);

        const redirectProxyName = `${name}-redirect-proxy`;
        const redirectProxyOp = (await ctx.rest_client.post(
          `${BASE_URL}/projects/${ctx.project}/global/targetHttpProxies`,
          {
            name: redirectProxyName,
            urlMap: `projects/${ctx.project}/global/urlMaps/${redirectUrlMapName}`,
          },
        )) as any;
        if (redirectProxyOp?.name) await wait_for_compute_op(ctx, redirectProxyOp.name);

        reportStep(6, 'Creating HTTP forwarding rule');
        redirectForwardingRuleName = `${name}-http`;
        const redirectFrOp = (await ctx.rest_client.post(
          `${BASE_URL}/projects/${ctx.project}/global/forwardingRules`,
          {
            name: redirectForwardingRuleName,
            loadBalancingScheme: properties.scheme || 'EXTERNAL',
            portRange: '80',
            IPProtocol: 'TCP',
            target: `projects/${ctx.project}/global/targetHttpProxies/${redirectProxyName}`,
            labels: properties.labels || {},
          },
        )) as any;
        if (redirectFrOp?.name) await wait_for_compute_op(ctx, redirectFrOp.name);
      }

      // After the forwarding rule exists, fetch it so we can surface its
      // externally-reachable IP address as an output. The UI uses this for
      // the per-block output pill, the DNS requirement post-deploy check,
      // and the "open in browser" deep-link.
      let ipAddress: string | undefined;
      try {
        const rule = (await ctx.rest_client.get(
          `${BASE_URL}/projects/${ctx.project}/global/forwardingRules/${name}`,
        )) as any;
        ipAddress = rule?.IPAddress || rule?.ipAddress;
      } catch {
        // Non-fatal — we can still return success without the IP.
      }

      // Fetch the SSL cert status so the SecureGroup / PublicEndpoint
      // block header can show "Provisioning SSL cert..." right after
      // deploy. This is the INITIAL status — the post-deploy
      // managedCertIssuanceRequirement polls every 60s for live updates
      // and surfaces them in the deploy panel's Requirements section.
      let certStatus: string | undefined;
      let certDomainStatuses: Record<string, string> | undefined;
      if (sslCertificateName) {
        try {
          const cert = (await ctx.rest_client.get(
            `${BASE_URL}/projects/${ctx.project}/global/sslCertificates/${sslCertificateName}`,
          )) as any;
          certStatus = cert?.managed?.status || 'PROVISIONING';
          certDomainStatuses = cert?.managed?.domainStatus;
        } catch {
          // Cert might not be ready to read yet; the requirement poll
          // will pick it up shortly.
          certStatus = 'PROVISIONING';
        }
      }

      // Primary URL priority:
      //   1. Custom domain (user's intended public URL)
      //   2. HTTPS IP (shouldn't usually be visited but technically works)
      //   3. HTTP IP (fallback for non-TLS deploys)
      const primaryUrl = customDomain
        ? `https://${customDomain}`
        : wantsHttps && ipAddress
          ? `https://${ipAddress}`
          : ipAddress
            ? `http://${ipAddress}`
            : undefined;

      // When multi-host routing is in play, expose the full list so the
      // overlay propagation on the backend and the canvas block pill on
      // the frontend can show the right per-subdomain URL instead of
      // only the root domain.
      const routedHosts = hostRules
        .map((r) => r.host)
        .filter((h, i, arr) => h && arr.indexOf(h) === i);

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
          // `cert_status` is read by the SecureGroup block renderer to
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
    let ipAddress: string | undefined;
    try {
      const rule = (await ctx.rest_client.get(
        `${BASE_URL}/projects/${ctx.project}/global/forwardingRules/${name}`,
      )) as any;
      ipAddress = rule?.IPAddress || rule?.ipAddress;
    } catch {
      // Non-fatal — fall through with no IP if the GET fails for any reason.
    }

    const sslCertificateName = (properties.ssl_certificate_name as string | undefined) || '';
    const wantsHttps = String(properties.protocol || '').toUpperCase() === 'HTTPS' && Boolean(sslCertificateName);
    const customDomain = (properties.domain as string | undefined) || '';
    const primaryUrl = customDomain
      ? `https://${customDomain}`
      : wantsHttps && ipAddress
        ? `https://${ipAddress}`
        : ipAddress
          ? `http://${ipAddress}`
          : undefined;

    // Re-fetch the cert status on every update so the SecureGroup
    // header reflects the current state. This is what makes "click
    // Deploy again 30min after the original create" actually update
    // the block to ACTIVE without forcing the user to wait for the
    // background poller.
    let certStatus: string | undefined;
    let certDomainStatuses: Record<string, string> | undefined;
    if (sslCertificateName) {
      try {
        const cert = (await ctx.rest_client.get(
          `${BASE_URL}/projects/${ctx.project}/global/sslCertificates/${sslCertificateName}`,
        )) as any;
        certStatus = cert?.managed?.status;
        certDomainStatuses = cert?.managed?.domainStatus;
      } catch {
        // Cert was deleted or unreadable — leave undefined.
      }
    }

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

async function wait_for_compute_op(ctx: GCPHandlerContext, op_name: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    const op = (await ctx.rest_client.get(`${BASE_URL}/projects/${ctx.project}/global/operations/${op_name}`)) as any;
    if (op?.status === 'DONE') {
      if (op.error) throw new Error(operation_failed(SERVICE_NAMES.COMPUTE, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.COMPUTE));
}

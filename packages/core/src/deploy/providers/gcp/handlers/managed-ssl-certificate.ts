/**
 * GCP Managed SSL Certificate Handler (Phase 8)
 *
 * Handles `gcp.compute.managedSslCertificate`. Creates a Google-managed SSL
 * certificate resource that GCP automatically provisions via ACME once the
 * target domain's DNS points at the load balancer.
 *
 * Important: the create call returns as soon as the SSL certificate resource
 * exists in GCP, NOT when the cert is issued. The cert sits in
 * `managed.status = PROVISIONING` until Google verifies the domain, which
 * can take anywhere from 10 minutes to a few hours. The
 * `managedCertIssuanceRequirement` (Phase 8 step 8.7) polls the status
 * post-deploy so users see live progress without blocking the deploy loop.
 */

import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler, GCPHandlerContext } from '../types';

const TYPE = 'gcp.compute.managedSslCertificate';
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

export const managed_ssl_certificate_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    try {
      const managed = properties.managed !== false;
      const domains = (properties.domains as string[] | undefined) || [];
      if (!domains.length) {
        return fail(name, 'create', start, 'At least one domain is required on the Custom Domain block.');
      }
      if (!managed) {
        // Bring-your-own cert path — the user provided an existing cert ID.
        // We don't create anything; we just echo the provider_id so the
        // load balancer handler can reference it downstream.
        const existing = (properties.ssl_certificate_id as string) || '';
        if (!existing) {
          return fail(name, 'create', start, 'autoProvisionCert is off but no sslCertificateId was provided.');
        }
        return result(name, 'create', start, {
          provider_id: existing,
          outputs: { managed: false, domains, status: 'IMPORTED' },
        });
      }

      // Create the managed cert resource. GCP will start the ACME flow
      // asynchronously — the operation returned here only signals that the
      // resource was registered, not that the cert has been issued.
      const createOp = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/global/sslCertificates`, {
        name,
        type: 'MANAGED',
        managed: { domains },
      })) as any;
      if (createOp?.name) {
        await wait_for_compute_op(ctx, createOp.name, 120_000);
      }

      // Read back the created cert so we can surface its initial status
      // in the deploy result and in the managedCertIssuanceRequirement.
      let managedStatus = 'PROVISIONING';
      let domainStatuses: Record<string, string> = {};
      try {
        const cert = (await ctx.rest_client.get(
          `${BASE_URL}/projects/${ctx.project}/global/sslCertificates/${name}`,
        )) as any;
        managedStatus = cert?.managed?.status || 'PROVISIONING';
        domainStatuses = cert?.managed?.domainStatus || {};
      } catch {
        // Non-fatal — the poll will pick it up later.
      }

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/global/sslCertificates/${name}`,
        outputs: {
          managed: true,
          domains,
          status: managedStatus,
          domain_statuses: domainStatuses,
        },
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  /**
   * Managed certs are effectively immutable once created — you cannot
   * change the domain list. A no-op "update" silently lies to the user
   * when they edit the domains on the canvas; instead, detect the diff
   * and fail loudly so the UI reports that a replacement is required.
   * The user can then delete the cert and let ICE recreate it on the
   * next deploy.
   */
  async update(name, provider_id, properties, current, _ctx) {
    const start = Date.now();
    const desiredDomains = Array.isArray(properties.domains) ? (properties.domains as string[]).slice().sort() : [];
    const currentDomains = Array.isArray(current.domains) ? (current.domains as string[]).slice().sort() : [];
    const domainsChanged =
      desiredDomains.length !== currentDomains.length || desiredDomains.some((d, i) => d !== currentDomains[i]);
    if (domainsChanged) {
      return fail(
        name,
        'update',
        start,
        `Managed SSL certificate ${name} cannot change its domain list in place ` +
          `(${currentDomains.join(',') || '∅'} → ${desiredDomains.join(',') || '∅'}). ` +
          `Delete the Custom Domain / Public Endpoint block and redeploy to request a new cert.`,
      );
    }
    return result(name, 'update', start, { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();

    try {
      const op = (await ctx.rest_client.delete(
        `${BASE_URL}/projects/${ctx.project}/global/sslCertificates/${name}`,
      )) as any;
      if (op?.name) await wait_for_compute_op(ctx, op.name, 120_000);
      return result(name, 'delete', start);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // NOT_FOUND is fine — already gone.
      if (msg.includes('NOT_FOUND') || msg.includes('404')) {
        return result(name, 'delete', start);
      }
      return fail(name, 'delete', start, msg);
    }
  },

  /** Phase 7 describe — used by drift detection + cert polling. */
  async describe(name, _provider_id, ctx) {
    try {
      const cert = (await ctx.rest_client.get(
        `${BASE_URL}/projects/${ctx.project}/global/sslCertificates/${name}`,
      )) as any;
      if (!cert) return { exists: false };
      return {
        exists: true,
        raw: cert,
        properties: {
          name: cert.name,
          type: cert.type,
          domains: cert.managed?.domains || [],
          managed_status: cert.managed?.status || 'UNKNOWN',
          domain_statuses: cert.managed?.domainStatus || {},
        },
      };
    } catch (error: any) {
      const code = error?.response?.status || error?.code;
      if (code === 404) return { exists: false };
      return { exists: false, error: error?.message || String(error) };
    }
  },
};

async function wait_for_compute_op(ctx: GCPHandlerContext, op_name: string, timeout_ms: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout_ms) {
    const op = (await ctx.rest_client.get(
      `https://compute.googleapis.com/compute/v1/projects/${ctx.project}/global/operations/${op_name}`,
    )) as any;
    if (op?.status === 'DONE') {
      if (op.error) throw new Error(operation_failed(SERVICE_NAMES.COMPUTE, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.COMPUTE));
}

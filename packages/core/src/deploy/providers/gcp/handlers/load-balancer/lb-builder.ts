/**
 * URL map / target proxy / forwarding rule + redirect-chain builders.
 * Extracted from `load-balancer.ts` (rf-lbal-3).
 *
 * Each function maps to one of the four (six with redirect) milestone
 * steps the orchestrator reports. Each issues the relevant POST,
 * awaits the long-running operation, and returns the resource name so
 * the orchestrator can wire it into the next step's body.
 */
import { wait_for_compute_op } from './compute-ops.js';
import { BASE_URL } from './result-helpers.js';
import { backend_ref } from './url-builder.js';
import type { HostRule } from './backend-creator.js';
import type { GCPHandlerContext } from '../../types.js';

/**
 * Build + create the URL map. Single-host deploys pass `defaultServiceRef`
 * only; multi-host (>1 distinct host) builds `hostRules` + `pathMatchers`
 * so each domain routes to its own backend.
 */
export async function create_url_map(
  ctx: GCPHandlerContext,
  urlMapName: string,
  defaultServiceRef: string,
  hostRules: HostRule[],
): Promise<void> {
  const urlMapBody: Record<string, any> = {
    name: urlMapName,
    defaultService: defaultServiceRef,
  };
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
      defaultService: backend_ref(ctx.project, rule.backendName, rule.backendType ?? 'bucket'),
    }));
  }
  const urlMapOp = (await ctx.rest_client.post(
    `${BASE_URL}/projects/${ctx.project}/global/urlMaps`,
    urlMapBody,
  )) as any;
  if (urlMapOp?.name) await wait_for_compute_op(ctx, urlMapOp.name);
}

/**
 * Create the target proxy (HTTPS or HTTP) and return its name + the
 * proxy endpoint URL segment so the caller can target it in the
 * forwarding rule.
 */
export async function create_target_proxy(
  ctx: GCPHandlerContext,
  name: string,
  urlMapName: string,
  wantsHttps: boolean,
  sslCertificateName: string,
): Promise<{ proxyName: string; proxyEndpoint: 'targetHttpsProxies' | 'targetHttpProxies' }> {
  const proxyName = `${name}-proxy`;
  const proxyEndpoint: 'targetHttpsProxies' | 'targetHttpProxies' = wantsHttps
    ? 'targetHttpsProxies'
    : 'targetHttpProxies';
  const proxyBody: Record<string, any> = {
    name: proxyName,
    urlMap: `projects/${ctx.project}/global/urlMaps/${urlMapName}`,
  };
  if (wantsHttps) {
    proxyBody.sslCertificates = [`projects/${ctx.project}/global/sslCertificates/${sslCertificateName}`];
  }
  const proxyOp = (await ctx.rest_client.post(
    `${BASE_URL}/projects/${ctx.project}/global/${proxyEndpoint}`,
    proxyBody,
  )) as any;
  if (proxyOp?.name) await wait_for_compute_op(ctx, proxyOp.name);
  return { proxyName, proxyEndpoint };
}

/**
 * Create the primary forwarding rule. HTTPS deploys listen on 443,
 * HTTP deploys on 80.
 */
export async function create_forwarding_rule(
  ctx: GCPHandlerContext,
  name: string,
  proxyName: string,
  proxyEndpoint: 'targetHttpsProxies' | 'targetHttpProxies',
  wantsHttps: boolean,
  properties: Record<string, unknown>,
): Promise<void> {
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
}

/**
 * Optional: create the HTTP→HTTPS redirect chain. Three resources:
 * a redirect URL map (returns 301 to https://), a target HTTP proxy
 * pointing at it, and a second forwarding rule listening on port 80.
 *
 * Returns the redirect forwarding rule name so the caller can include
 * it in the create result outputs.
 */
export async function create_redirect_chain(
  ctx: GCPHandlerContext,
  name: string,
  properties: Record<string, unknown>,
  reportStep: (index: number, label: string) => void,
): Promise<string> {
  reportStep(5, 'Creating HTTP → HTTPS redirect');
  const redirectUrlMapName = `${name}-redirect-urlmap`;
  const redirectUrlMapOp = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/global/urlMaps`, {
    name: redirectUrlMapName,
    defaultUrlRedirect: {
      httpsRedirect: true,
      redirectResponseCode: 'MOVED_PERMANENTLY_DEFAULT',
      stripQuery: false,
    },
  })) as any;
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
  const redirectForwardingRuleName = `${name}-http`;
  const redirectFrOp = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/global/forwardingRules`, {
    name: redirectForwardingRuleName,
    loadBalancingScheme: properties.scheme || 'EXTERNAL',
    portRange: '80',
    IPProtocol: 'TCP',
    target: `projects/${ctx.project}/global/targetHttpProxies/${redirectProxyName}`,
    labels: properties.labels || {},
  })) as any;
  if (redirectFrOp?.name) await wait_for_compute_op(ctx, redirectFrOp.name);

  return redirectForwardingRuleName;
}

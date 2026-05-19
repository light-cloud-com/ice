/**
 * Canvas overlay — per-node deploy state for canvas hydration.
 *
 * Extracted from `deploy.service.ts` in rf-deploy-15. The orchestrator
 * re-exports `getNodeDeploymentOverlay` so existing namespace imports
 * (notably `routes/canvas-deploy.ts`'s `import * as deployService`) keep
 * resolving without a callsite edit.
 */

import prisma from '@ice/db';

/**
 * Compute a per-node overlay of deploy state for a card. Used by the
 * frontend on card load to hydrate canvas block node data with:
 *
 *   - deploy_status (active / error / idle)
 *   - deploy_outputs (raw resource outputs from GCP)
 *   - provider_id
 *   - last_deployed_at
 *   - domain (the custom domain URL, propagated from CustomDomain blocks to
 *     every compute block they're connected to so the Static Site block
 *     displays "https://mysite.com" instead of only the bucket URL)
 *
 * This is the second half of the fix for "user doesn't see the domain
 * attached to deployed resources" — outputs are now read at load time
 * without requiring a live socket event or a panel to be open.
 */
export async function getNodeDeploymentOverlay(
  cardId: string,
  environment = 'development',
): Promise<Record<string, any>> {
  // Load the latest deploy for the card+env. Accept success OR partial so
  // half-successful deploys still show up on the canvas.
  const deployment = await prisma.canvasDeployment.findFirst({
    where: {
      card_id: cardId,
      environment,
      status: { in: ['success', 'partial'] },
    },
    orderBy: { created_at: 'desc' },
  });
  if (!deployment?.results) return {};

  const results = deployment.results as any;
  const resources = (results.resources || []) as any[];
  const overlay: Record<string, any> = {};

  // Primary pass — raw outputs per resource keyed by source_node_id.
  // Seed `default_url` from the handler's own output so it's available even
  // when no Internet/LB edge exists — it's the URL the user can always hit
  // regardless of custom-domain status.
  //
  // Also normalize known-broken stored URLs at read time:
  //   - `https://storage.googleapis.com/<bucket>/` (trailing slash, no
  //     object) is a bucket-list request and returns 403 even with
  //     allUsers:objectViewer. Rewrite to `/<index_page>` so existing
  //     deploy rows render a URL that actually works — the user doesn't
  //     need to destroy and redeploy to pick up the fix.
  for (const res of resources) {
    if (!res.source_node_id) continue;
    const handlerOutputs = { ...(res.outputs || {}) };
    const rawUrl = handlerOutputs.url as string | undefined;
    if (
      typeof rawUrl === 'string' &&
      /^gcp\.storage\.bucket$/.test(res.type || '') &&
      /^https:\/\/storage\.googleapis\.com\/[^/]+\/?$/.test(rawUrl)
    ) {
      const bucketName = rawUrl.replace(/\/$/, '').split('/').pop() || '';
      const indexPage = (handlerOutputs.index_page as string) || 'index.html';
      handlerOutputs.url = `https://storage.googleapis.com/${bucketName}/${indexPage}`;
    }
    const ownUrl = handlerOutputs.url as string | undefined;
    overlay[res.source_node_id] = {
      deploy_status: res.success ? 'active' : 'error',
      deploy_outputs: {
        ...handlerOutputs,
        default_url: ownUrl || handlerOutputs.default_url,
      },
      provider_id: res.provider_id,
      deploy_error: res.success ? undefined : res.error,
      last_deployed_at: deployment.updated_at.toISOString(),
      deploy_resource_type: res.type,
      deploy_resource_name: res.name,
    };
  }

  // Second pass — propagate a CustomDomain URL to every deployable node
  // connected to the forwarding rule that references its cert. The load
  // balancer handler emits `url`, `domain`, and `ssl_certificate` onto its
  // own outputs (see `handlers/load-balancer.ts`); we forward those to the
  // StaticSite / Cloud Run block so the user sees the friendly URL on the
  // block they actually think of as "their site."
  //
  // Non-destructive: the compute block's own URL (e.g. the bucket's
  // `https://storage.googleapis.com/...` or Cloud Run's `.run.app` URL) is
  // preserved as `default_url` so the UI can render both — custom domain
  // primary, default fallback underneath. Overwriting would make the user
  // lose sight of the always-available internal URL.
  const card = await prisma.canvasCard.findUnique({ where: { id: cardId } });
  if (!card) return overlay;

  const nodes = (card.nodes as any[]) || [];
  const edges = (card.edges as any[]) || [];
  const findNode = (id: string) => nodes.find((n: any) => n.id === id);

  // Find forwarding rule node(s) that carry a domain/url in their outputs.
  for (const [nodeId, entry] of Object.entries(overlay)) {
    const node = findNode(nodeId);
    if (!node) continue;
    const iceType = node.data?.iceType as string | undefined;
    if (iceType !== 'Network.PublicEndpoint') continue;
    const lbUrl = entry.deploy_outputs?.url as string | undefined;
    const lbDomain = entry.deploy_outputs?.domain as string | undefined;
    const lbIp = (entry.deploy_outputs?.ip_address || entry.deploy_outputs?.IPAddress) as string | undefined;
    if (!lbUrl && !lbDomain && !lbIp) continue;

    // Walk every edge touching this PublicEndpoint node, find the compute
    // block on the other side, and overlay the right URL onto it. With
    // per-edge subdomain support, each compute block gets its own host
    // (`<subdomain>.<rootDomain>`) rather than the bare root domain.
    const rootDomain = (lbDomain || (node.data?.domain as string) || '').trim();
    for (const edge of edges) {
      const otherId = edge.source === nodeId ? edge.target : edge.target === nodeId ? edge.source : null;
      if (!otherId) continue;
      const other = findNode(otherId);
      if (!other) continue;
      const otherIce = (other.data?.iceType as string | undefined) || '';
      if (!/^Compute\./.test(otherIce)) continue;
      const subdomain = ((edge.data as any)?.subdomain as string | undefined)?.trim() || '';
      const host = subdomain && rootDomain ? `${subdomain}.${rootDomain}` : rootDomain;
      const existing = overlay[otherId] || {};
      const existingOutputs = existing.deploy_outputs || {};
      // Preserve the compute block's own URL as `default_url` so the UI
      // can always show "Default: <internal url>" next to the public URL.
      const nodeOwnUrl = existingOutputs.url as string | undefined;
      const nodeOwnDefault = existingOutputs.default_url as string | undefined;
      const defaultUrl = nodeOwnDefault || nodeOwnUrl;
      // Primary URL priority: per-edge host > LB url > node's own url.
      const primaryUrl = (host ? `https://${host}` : undefined) || lbUrl || nodeOwnUrl;
      overlay[otherId] = {
        ...existing,
        deploy_outputs: {
          ...existingOutputs,
          domain: host || existingOutputs.domain,
          url: primaryUrl,
          default_url: defaultUrl,
          ip_address: lbIp || existingOutputs.ip_address,
        },
      };
    }
  }

  // Third pass — mirror the deployed domain onto the PublicEndpoint block
  // itself so the canvas block shows `https://<domain>` directly.
  for (const node of nodes) {
    if ((node.data?.iceType as string | undefined) !== 'Network.PublicEndpoint') continue;
    const domain = String(node.data?.domain || '').trim();
    if (!domain) continue;
    const existing = overlay[node.id] || {};
    overlay[node.id] = {
      ...existing,
      deploy_outputs: {
        ...(existing.deploy_outputs || {}),
        domain,
        url: `https://${domain}`,
      },
    };
  }

  return overlay;
}

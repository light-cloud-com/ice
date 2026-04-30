/**
 * Pass 1.5 — Network.PublicEndpoint semantic wiring.
 *
 * Lifted verbatim from `card-translator.ts` (rf-ctrans-12). Mutates the
 * in-progress graph in place: builds backend bucket / backend service
 * synthetic nodes for the load balancer chain, removes empty
 * forwarding rules whose only backends were static sites, injects a
 * managed SSL cert when HTTPS is enabled, and attaches the URL map
 * `host_rules` onto the forwarding rule node. See the docstring on
 * `wire_public_endpoints` below for the full contract.
 *
 * Returns the net delta to the caller's `deployable_count` so the
 * caller can adjust its own counter — the pass itself does not own
 * the counter, only the graph + deployables array.
 */

import {
  sanitize_name,
  sanitize_label_value,
} from '../utils/name-utils.js';
import type {
  CardEdgeInput,
  CardNodeInput,
  DeployableNodeInfo,
} from '../card-translator.js';
import type { MutableGraph } from '../../graph/mutable-graph.js';

/**
 * One backend connected to a PublicEndpoint. Promoted to module-level
 * so it can be referenced from the helper plus tests; keeping it
 * file-private avoids polluting the public package surface.
 */
type BackendEntry = {
  subdomain: string;
  targetNodeId: string;
  targetResourceName: string;
  backendBucketName?: string;
  // For service-type backends (Cloud Run, etc), the original source
  // service name we'll wrap in a NEG, plus the synthesized backend
  // service name the URL map references.
  sourceServiceName?: string;
  backendServiceName?: string;
  targetIceType: string;
};

/**
 * Pass 1.5 — PublicEndpoint semantic wiring.
 *
 * The `Network.PublicEndpoint` block is the single "make my services
 * reachable from the internet" primitive. It compiles to a full load
 * balancer chain:
 *
 *   PublicEndpoint → forwarding rule → target proxy → URL map → backend bucket/service → bucket/service
 *                                              ↑
 *                                       managed SSL cert (auto-provisioned)
 *
 * The load balancer handler creates the full chain from a single
 * `gcp.compute.globalForwardingRule` node — this pass computes the
 * backend references, the list of hosts (root domain + each
 * subdomain from outgoing edges), and the URL map host rules, then
 * attaches them as properties on the forwarding rule node.
 *
 * Multi-subdomain support: each edge FROM the PublicEndpoint node to
 * a compute target can carry `edge.data.subdomain`. Blank = root.
 * Non-blank = a host rule like `api.example.com → api-backend-service`.
 * The managed SSL cert includes every unique host.
 *
 * RISK #7: When all backends turn out to be static sites (Firebase
 * Hosting handles its own routing), the forwarding rule must be
 * removed atomically — `graph.remove_node` + `deployables.splice` +
 * `deployable_count_delta--` all on the same code path.
 *
 * RISK #8: `BackendEntry.sourceServiceName = be.targetResourceName`
 * mutates an already-pushed entry; the read site relies on observing
 * the post-mutation value.
 *
 * Returns `{ deployable_count_delta }` so the caller can adjust its
 * own counter — the pass owns graph + deployables mutations but does
 * not own the count itself.
 */
export function wire_public_endpoints(args: {
  edges: CardEdgeInput[];
  nodes: CardNodeInput[];
  card_id_to_name: Map<string, string>;
  graph: MutableGraph;
  deployables: DeployableNodeInfo[];
  warnings: string[];
  projectName: string;
}): { deployable_count_delta: number } {
  const { edges, nodes, card_id_to_name, graph, deployables, warnings, projectName } = args;
  let deployable_count_delta = 0;

  // For each compute target connected to a PublicEndpoint, we create a
  // backend ref — either a `gcp.compute.backendBucket` (for static sites)
  // or a `gcp.compute.backendService` backed by a serverless NEG (for
  // Cloud Run / Container / SSRSite / ServerlessFunction). The actual
  // NEG + backend service resources are created inline by the load
  // balancer handler at deploy time because they need the runtime
  // region, which the translator doesn't have.
  const staticSiteToForwardingRule = new Map<string, string>(); // static site node id → forwarding rule resource name

  // Map every PublicEndpoint node to its connected backends.
  const endpointToBackends = new Map<string, BackendEntry[]>();

  // Match both PublicEndpoint AND CustomDomain-nested-inside-PrivateNetwork
  // as endpoint blocks. Both compile to gcp.compute.globalForwardingRule.
  //
  // - PublicEndpoint: standalone public LB for VPC-internal services.
  // - CustomDomain nested inside PrivateNetwork: the nested CD acts as
  //   the PrivateNetwork's public gateway, compiling to the same LB
  //   chain but targeting sibling services inside the parent VPC.
  //   Standalone CustomDomain (no parent) stays DNS-only and is NOT an
  //   endpoint — it's handled in Pass 1.6 instead.
  const isEndpointIceType = (t: string, node?: { parentId?: string | null }) => {
    if (t === 'Network.PublicEndpoint') return true;
    if (t === 'Network.CustomDomain' && node?.parentId) {
      const parent = nodes.find((n) => n.id === node.parentId);
      return parent?.data?.iceType === 'Network.PrivateNetwork';
    }
    return false;
  };

  for (const edge of edges) {
    const src = nodes.find((n) => n.id === edge.source);
    const dst = nodes.find((n) => n.id === edge.target);
    if (!src || !dst) continue;
    const srcIce = (src.data?.iceType as string) || '';
    const dstIce = (dst.data?.iceType as string) || '';
    const srcIsEndpoint = isEndpointIceType(srcIce, src);
    const dstIsEndpoint = isEndpointIceType(dstIce, dst);
    if (!srcIsEndpoint && !dstIsEndpoint) continue;

    const endpointNode = srcIsEndpoint ? src : dst;
    const targetNode = srcIsEndpoint ? dst : src;
    const targetIce = (targetNode.data?.iceType as string) || '';

    // Only compute targets are valid backends. Skip edges to requirements,
    // config, repositories, etc.
    if (!/^Compute\./.test(targetIce)) continue;

    const targetResourceName = card_id_to_name.get(targetNode.id);
    if (!targetResourceName) continue;

    // Subdomain resolution priority for endpoint backends:
    //   1. edge.data.routeId → look up the route on the source endpoint
    //      block (the per-row port model used by the Custom Domain
    //      block — standalone or nested inside a Private Network)
    //   2. edge.data.subdomain → legacy single-subdomain edge field
    //      (kept for back-compat with older PublicEndpoint edges
    //      created before routes existed)
    //   3. blank → root domain
    let subdomain: string;
    const routeId = (edge.data as any)?.routeId as string | undefined;
    if (routeId) {
      const routes = (endpointNode.data?.routes as Array<{ id: string; subdomain: string }> | undefined) || [];
      const route = routes.find((r) => r.id === routeId);
      subdomain = (route?.subdomain || '').trim();
    } else {
      subdomain = ((edge.data as any)?.subdomain as string | undefined)?.trim() || '';
    }

    const list = endpointToBackends.get(endpointNode.id) || [];
    list.push({
      subdomain,
      targetNodeId: targetNode.id,
      targetResourceName,
      targetIceType: targetIce,
    });
    endpointToBackends.set(endpointNode.id, list);
  }

  // For each PublicEndpoint, build backend buckets + collect host rules +
  // wire everything onto the forwarding rule node.
  for (const [endpointId, backends] of endpointToBackends.entries()) {
    const endpointNode = nodes.find((n) => n.id === endpointId);
    if (!endpointNode) continue;
    const forwardingResourceName = card_id_to_name.get(endpointId);
    if (!forwardingResourceName) continue;

    const rootDomain = ((endpointNode.data?.domain as string) || '').trim();
    const enableHttps = (endpointNode.data?.enableHttps as boolean | undefined) !== false;
    const autoProvisionCert = (endpointNode.data?.autoProvisionCert as boolean | undefined) !== false;
    const redirectHttpToHttps = (endpointNode.data?.redirectHttpToHttps as boolean | undefined) !== false;

    // Build hostRules for the URL map. Each backend gets a host like
    // `<subdomain>.<rootDomain>` (or just `<rootDomain>` for blank
    // subdomain). If rootDomain is empty, fallback to IP-only routing
    // with one default backend.
    //
    // `sourceServiceName` is only set for service-type backends — the
    // LB handler uses it to target a Serverless NEG at the actual
    // Cloud Run service.
    const hostRules: Array<{
      host: string;
      backendName: string;
      backendType: 'bucket' | 'service';
      sourceServiceName?: string;
    }> = [];
    const defaultBackends: BackendEntry[] = [];

    // Compute types that compile to Cloud Run services — each of these
    // gets wrapped in a Serverless NEG + backend service by the LB
    // handler at deploy time. Static sites use backendBuckets instead.
    const SERVICE_BACKEND_ICE_TYPES = new Set([
      'Compute.Container',
      'Compute.BackendAPI',
      'Compute.SSRSite',
      'Compute.Worker',
      'Compute.ServerlessFunction',
    ]);

    for (const be of backends) {
      // Static sites on GCP now compile to Firebase Hosting (which
      // gives a public HTTPS URL out of the box, with its own CDN +
      // managed cert + optional custom domain). The Public Endpoint
      // load-balancer chain is REDUNDANT for Firebase Hosting — it
      // serves traffic itself, no backend bucket / URL map / forwarding
      // rule needed. We skip the LB wiring here and let the Firebase
      // Hosting handler register the custom domain on its own.
      //
      // The static site node still gets the user's custom domain
      // propagated so the Firebase Hosting handler picks it up.
      if (be.targetIceType === 'Compute.StaticSite') {
        // Propagate the PublicEndpoint's domain onto the static site
        // node so the Firebase Hosting handler can register it as a
        // custom domain. Subdomains become per-site subdomains; blank
        // becomes the root domain.
        const targetGraphNode = graph.get_node_by_name(be.targetResourceName);
        if (targetGraphNode && rootDomain) {
          const fullHost = be.subdomain ? `${be.subdomain}.${rootDomain}` : rootDomain;
          (targetGraphNode.properties as any).domain = fullHost;
        }
        // Mark the static-site → forwarding-rule mapping so the post-deploy
        // overlay still knows the static site is wired to a public endpoint
        // (used for the canvas pill propagation). The forwarding rule itself
        // will be created EMPTY and skipped at deploy time when no other
        // backend uses it.
        staticSiteToForwardingRule.set(be.targetNodeId, forwardingResourceName);
        // Skip adding a host rule — Firebase Hosting serves directly.
        continue;
      }

      // Cloud Run / Container / SSR → serverless NEG + backend service.
      // The LB handler creates both resources inline because the NEG
      // needs the runtime region, which lives on the handler context
      // but not in the translator. We just record the names here and
      // pass them through `host_rules` as metadata.
      if (SERVICE_BACKEND_ICE_TYPES.has(be.targetIceType)) {
        const backendServiceName = sanitize_name(`${be.targetResourceName}-backend`);
        be.sourceServiceName = be.targetResourceName;
        be.backendServiceName = backendServiceName;

        const host = be.subdomain && rootDomain ? `${be.subdomain}.${rootDomain}` : rootDomain || '';
        if (host) {
          hostRules.push({
            host,
            backendName: backendServiceName,
            backendType: 'service',
            sourceServiceName: be.targetResourceName,
          });
        } else {
          defaultBackends.push(be);
        }
        continue;
      }

      // Unknown compute type — skip with a clear warning so the user
      // knows it's not wired.
      warnings.push(
        `Public Endpoint edge to "${be.targetNodeId}" (${be.targetIceType}) was skipped — only ` +
          'Compute.StaticSite, Container, SSRSite, BackendAPI, Worker, and ServerlessFunction are currently supported as backends.',
      );
    }

    // If the only backends were static sites (which now compile to
    // Firebase Hosting and serve traffic themselves), there's nothing
    // for the load balancer to route. Drop the forwarding rule entirely
    // — the user's PublicEndpoint block becomes a metadata-only node
    // whose role is fully absorbed by the Firebase Hosting deployables
    // it points at. Otherwise the LB would deploy with an empty URL
    // map and 502 every request.
    if (hostRules.length === 0 && defaultBackends.length === 0) {
      // `remove_node` requires the branded `${type}:${name}` NodeId, but
      // `forwardingResourceName` is the bare resource name from
      // `card_id_to_name`. Resolve via `get_node_by_name` first; otherwise
      // we'd silently no-op the removal (same class of bug as the lookup
      // callsites — see the `graph-nodes-keyed-by-type-colon-name-not-bare-name`
      // learning).
      const frForRemoval = graph.get_node_by_name(forwardingResourceName);
      const removed = frForRemoval ? graph.remove_node(frForRemoval.id) : false;
      if (removed) {
        const idx = deployables.findIndex((d) => d.resource_name === forwardingResourceName);
        if (idx !== -1) {
          deployables.splice(idx, 1);
          deployable_count_delta--;
        }
      }
      continue;
    }

    // Compute the full host list for the managed SSL cert. Always
    // include the root domain. If only subdomains are wired (no blank
    // subdomain edge), we still cover the root for flexibility.
    const hostSet = new Set<string>();
    if (rootDomain) hostSet.add(rootDomain);
    for (const rule of hostRules) hostSet.add(rule.host);
    const hosts = Array.from(hostSet);

    // Attach the host list and URL map rules to the forwarding rule
    // node so the load balancer handler can build the URL map.
    const frNode = graph.get_node_by_name(forwardingResourceName);
    if (frNode) {
      (frNode.properties as any).domain = rootDomain;
      (frNode.properties as any).hosts = hosts;
      (frNode.properties as any).host_rules = hostRules;
      // Single-host shortcut: the LB handler also reads `backend_bucket_name`
      // for the legacy simple-deploy path. We only set it when the default
      // backend is a BUCKET — service-type defaults flow through
      // `host_rules[0]` instead so the handler creates the NEG inline.
      const defaultBucket = defaultBackends.find((be) => be.backendBucketName)?.backendBucketName;
      if (defaultBucket) {
        (frNode.properties as any).backend_bucket_name = defaultBucket;
      }
      (frNode.properties as any).redirect_http = redirectHttpToHttps;
    }

    // Auto-provision a managed SSL cert if HTTPS is enabled and we have
    // at least one real host. The cert resource is a synthetic node
    // injected here — no user-facing block for it.
    if (enableHttps && autoProvisionCert && hosts.length > 0) {
      const certName = sanitize_name(`${forwardingResourceName}-cert`);
      const certKey = `${endpointId}:managed-cert`;
      if (!card_id_to_name.get(certKey)) {
        const certProps = {
          domains: hosts,
          managed: true,
          labels: {
            'ice-managed': 'true',
            'ice-source-id': sanitize_label_value(endpointId),
            'ice-type': 'public-endpoint-cert',
            'ice-project': sanitize_label_value(projectName),
          },
        };
        const certResult = graph.add_node({
          type: 'gcp.compute.managedSslCertificate',
          name: certName,
          properties: certProps,
          labels: certProps.labels,
        });
        if (certResult.success) {
          card_id_to_name.set(certKey, certName);
          deployables.push({
            node_id: certKey,
            label: `${endpointNode.data?.label || 'Public Endpoint'} cert`,
            ice_type: 'Network.PublicEndpoint',
            resource_type: 'gcp.compute.managedSslCertificate',
            resource_name: certName,
          });
          deployable_count_delta++;
        }
      }
      if (frNode) {
        (frNode.properties as any).ssl_certificate_name = certName;
        (frNode.properties as any).protocol = 'HTTPS';
        (frNode.properties as any).port_range = '443';
      }
    } else if (frNode) {
      (frNode.properties as any).protocol = 'HTTP';
      (frNode.properties as any).port_range = '80';
    }
  }

  return { deployable_count_delta };
}

/**
 * Card-to-Graph Translation Layer
 *
 * Transforms desktop CardNode[] + CardEdge[] into a core MutableGraph
 * with GCP-typed nodes that the deploy pipeline understands.
 */

import { create_mutable_graph } from '../graph/mutable-graph.js';
import type { Graph } from '../types/graph.js';
import {
  sanitize_name,
  sanitize_label_value,
} from './utils/name-utils.js';
import { generate_stable_name } from './utils/stable-name.js';
import { DESIGN_ONLY_PROVIDERS, get_type_map } from './type-maps.js';
import {
  UI_ONLY_TYPES,
  SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS,
  EXTERNAL_TYPES,
  hasPrivateNetworkAncestor,
  isCustomDomainStandalone,
  map_edge_relationship,
} from './edge-classifier.js';
import { PROPERTY_EXTRACTORS } from './extractors/dispatch.js';
import { wire_source_repositories } from './passes/pass-1-4-repo-wiring.js';
import { propagate_custom_domain_hosts } from './passes/pass-1-45-domain-propagation.js';

// =============================================================================
// Types
// =============================================================================

export type DeployProvider = 'gcp' | 'aws' | 'azure';
export type EnvironmentType = 'production' | 'staging' | 'development';

export interface CardTranslationInput {
  /** Card nodes from the desktop canvas */
  nodes: CardNodeInput[];
  /** Card edges from the desktop canvas */
  edges: CardEdgeInput[];
  /** Target cloud provider */
  provider: DeployProvider;
  /** Project name (used as graph name) */
  projectName: string;
  /** Target environment (affects resource sizing) */
  environment?: EnvironmentType;
  /** GCP project ID */
  gcpProject?: string;
  /** Default region */
  region?: string;
  /**
   * Phase 1 — optional map of `canvas node id → existing resource name`.
   *
   * When provided, nodes with an existing name reuse it verbatim instead of
   * generating a new one. This is what survives label renames and canvas
   * moves: the deploy service loads the mapping from `DeployedResourceMapping`
   * and hands it in here, so the translator produces the same graph shape
   * across runs.
   *
   * Novel nodes (not in the map) get a deterministic hash-based name that
   * is independent of the user-facing label.
   */
  existing_names?: Map<string, string>;
  /** Phase 1 — source card id, used for standard GCP resource labels. */
  cardId?: string;
}

export interface CardNodeInput {
  id: string;
  type: 'block' | 'resource' | 'group';
  data: Record<string, unknown>;
  parentId?: string | null;
}

export interface CardEdgeInput {
  id: string;
  source: string;
  target: string;
  data?: { relationship?: string; protocol?: string; port?: number; [key: string]: unknown };
}

export interface DeployableNodeInfo {
  /** Source canvas node id */
  node_id: string;
  /** Source canvas label (what the user sees) */
  label: string;
  /** iceType from the canvas node */
  ice_type: string;
  /** Concrete provider resource type (e.g. gcp.storage.bucket) */
  resource_type: string;
  /** Generated, sanitized resource name (matches what the deployer creates) */
  resource_name: string;
}

export interface CardTranslationResult {
  /** The translated deployment graph */
  graph: Graph;
  /** Nodes that were skipped (groups, UI-only, external) */
  skipped: SkippedNode[];
  /** Warnings generated during translation */
  warnings: string[];
  /** Number of deployable nodes */
  deployable_count: number;
  /** One entry per deployable node — used by the service to build a plan and to
   *  reliably map deploy results back to canvas nodes. */
  deployables: DeployableNodeInfo[];
}

export interface SkippedNode {
  nodeId: string;
  label: string;
  reason: string;
}

// =============================================================================
// Main translation function
// =============================================================================

/**
 * Translate desktop CardNode[] + CardEdge[] into a deployable Graph.
 *
 * Filters out groups and UI-only nodes, maps iceTypes to GCP API types,
 * extracts deployment properties from card data, and creates edges
 * for dependency ordering.
 */
export function translate_card_to_graph(input: CardTranslationInput): CardTranslationResult {
  const { nodes, edges, provider, projectName, region = 'us-central1', existing_names, cardId } = input;

  const warnings: string[] = [];
  const skipped: SkippedNode[] = [];

  // ENGINE-3: Warn if provider has no deployer support
  if (DESIGN_ONLY_PROVIDERS.has(provider)) {
    warnings.push(
      `Provider "${provider}" is design-only — deployment is not yet supported. ` +
        `Blocks can be used for architecture planning but will not be provisioned.`,
    );
  }

  // Build the type map for the target provider
  const type_map = get_type_map(provider);

  // Create the mutable graph
  const graph = create_mutable_graph(projectName, {
    description: `Deployment graph for ${projectName}`,
    providers: [provider],
    regions: [region],
  });

  // Track card node ID → graph node name mapping for edge translation
  const card_id_to_name = new Map<string, string>();
  const deployables: DeployableNodeInfo[] = [];
  let deployable_count = 0;

  // Pass 1: Add deployable nodes
  for (const node of nodes) {
    // Skip group nodes — they're organizational, not deployable
    if (node.type === 'group') {
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: 'Group nodes are organizational and not deployed',
      });
      continue;
    }

    const ice_type = node.data.iceType as string;
    if (!ice_type) {
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: 'No iceType defined on node',
      });
      continue;
    }

    // Skip groups — purely visual canvas grouping, never a real resource.
    // The group's `subtype` produces iceTypes like Group.Frontend / Group.
    // Monitoring; both are diagram-only and have no provider mapping.
    if (ice_type.startsWith('Group.')) {
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: `Visual group: ${ice_type}`,
      });
      continue;
    }

    // Skip UI-only types
    if (UI_ONLY_TYPES.has(ice_type)) {
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: `UI-only type: ${ice_type}`,
      });
      continue;
    }

    // Standalone Network.CustomDomain is UI-only (metadata for Pass 1.6
    // propagation). Nested inside a PrivateNetwork it becomes deployable
    // — see isCustomDomainStandalone + the dynamic type lookup below.
    if (isCustomDomainStandalone(node, nodes)) {
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: 'Standalone Network.CustomDomain is metadata-only (handled by Pass 1.6)',
      });
      continue;
    }

    // Skip external types
    if (EXTERNAL_TYPES.has(ice_type)) {
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: `External service not managed by ${provider}: ${ice_type}`,
      });
      continue;
    }

    // Look up the deployer type. Nested Network.CustomDomain inside a
    // PrivateNetwork compiles to the global forwarding rule (same as
    // Network.PublicEndpoint) — the nested case isn't in the type map
    // because standalone CDs are UI-only, so we resolve it inline here.
    const gcp_type = ice_type === 'Network.CustomDomain' ? 'gcp.compute.globalForwardingRule' : type_map[ice_type];
    if (!gcp_type) {
      warnings.push(`No ${provider} mapping for iceType "${ice_type}" (node: ${node.data.label || node.id}). Skipped.`);
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: `No ${provider} deployer mapping for ${ice_type}`,
      });
      continue;
    }

    // Extract deployment properties. A missing extractor used to silently
    // fall back to `{ region, labels: {} }`, which meant all block-level
    // config (cpu/memory/minInstances/env/image…) was dropped and the
    // deploy reported success on a misconfigured resource. Fail loudly
    // instead: if a type is in the map it MUST have an extractor.
    const extractor = PROPERTY_EXTRACTORS[gcp_type];
    if (!extractor) {
      const msg =
        `No property extractor registered for ${gcp_type} (iceType "${ice_type}", node: ${node.data.label || node.id}). ` +
        `All block-level config would be dropped — refusing to deploy. ` +
        `Register an extractor in PROPERTY_EXTRACTORS before adding a type to the deployer map.`;
      console.error('[card-translator]', msg);
      warnings.push(msg);
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: `Missing property extractor for ${gcp_type}`,
      });
      continue;
    }
    const properties = extractor(node.data, region, node.id);

    // Private Network ingress override.
    //
    // When a service backend (Scalable Backend / SSR Site / Worker /
    // Serverless Function) is nested inside a Network.PrivateNetwork,
    // emit the internal-only variant of the underlying compute resource.
    // A nested Custom Domain (if present) remains the sole external
    // entry point via its own LB chain; see isCustomDomainStandalone +
    // the backend-wiring at ~line 1100.
    if (SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS.has(ice_type) && hasPrivateNetworkAncestor(node, nodes)) {
      const props = properties as Record<string, unknown>;
      if (gcp_type === 'gcp.run.service') {
        // Internal Cloud Run — only reachable via VPC or internal LB.
        props.allow_unauthenticated = false;
        props.ingress = 'internal-and-cloud-load-balancing';
      } else if (gcp_type === 'aws.ecs.service') {
        props.assign_public_ip = false;
        props.internal = true;
      } else if (gcp_type === 'azure.containerapp.containerApp') {
        props.ingress_external = false;
      }
    }

    // Phase 1 — stable resource identity.
    //
    // Priority order:
    //   1. An existing name from the DeployedResourceMapping table (survives
    //      label renames + canvas moves).
    //   2. A fresh deterministic hash-based name for novel nodes.
    //
    // The old `sanitize_name(`${label}-${node.id.slice(-6)}`)` scheme was
    // replaced entirely: it leaked the user-facing label into the resource
    // name, so renaming a block produced a new name and triggered a
    // destroy-recreate cycle.
    const label = (node.data.label as string) || ice_type.split('.').pop() || 'resource';
    const existing = existing_names?.get(node.id);
    const name = existing ?? generate_stable_name(gcp_type, node.id, projectName, input.environment || 'dev');

    // Standard labels for every resource so deployed state is discoverable
    // in the GCP console via `gcloud ... --filter="labels.ice-managed=true"`.
    const baseLabels: Record<string, string> = {
      'ice-managed': 'true',
      'ice-source-id': sanitize_label_value(node.id),
      'ice-type': sanitize_label_value(ice_type),
      'ice-project': sanitize_label_value(projectName),
    };
    if (input.environment) baseLabels['ice-environment'] = sanitize_label_value(input.environment);
    if (cardId) baseLabels['ice-card-id'] = sanitize_label_value(cardId);

    // Merge with any user-provided labels from the property extractor.
    const existingPropLabels =
      properties && typeof properties === 'object' && 'labels' in (properties as any)
        ? ((properties as any).labels as Record<string, unknown>) || {}
        : {};
    (properties as any).labels = { ...baseLabels, ...existingPropLabels };

    // Add node to graph
    const result = graph.add_node({
      type: gcp_type,
      name,
      properties,
      labels: baseLabels,
    });

    if (result.success) {
      card_id_to_name.set(node.id, name);
      deployables.push({
        node_id: node.id,
        label,
        ice_type,
        resource_type: gcp_type,
        resource_name: name,
      });
      deployable_count++;
    } else {
      // Name collision (only possible for pre-existing names or hash
      // collisions — realistically never for new deploys). Append a short
      // secondary salt and retry.
      const alt_name = sanitize_name(`${name}-alt`);
      const alt_result = graph.add_node({
        type: gcp_type,
        name: alt_name,
        properties,
        labels: baseLabels,
      });
      if (alt_result.success) {
        card_id_to_name.set(node.id, alt_name);
        deployables.push({
          node_id: node.id,
          label,
          ice_type,
          resource_type: gcp_type,
          resource_name: alt_name,
        });
        deployable_count++;
      } else {
        warnings.push(`Failed to add node "${label}": ${alt_result.errors?.join(', ')}`);
      }
    }
  }

  // ─── Pass 1.4 — Source.Repository → compute block wiring ───────────────
  wire_source_repositories(edges, nodes, card_id_to_name, graph);

  // ─── Pass 1.45 — Network.CustomDomain → target host propagation ────────
  propagate_custom_domain_hosts(edges, nodes, card_id_to_name, graph);

  // ─── Pass 1.5 — PublicEndpoint semantic wiring ─────────────────────────
  //
  // The `Network.PublicEndpoint` block is the single "make my services
  // reachable from the internet" primitive. It compiles to a full load
  // balancer chain:
  //
  //   PublicEndpoint → forwarding rule → target proxy → URL map → backend bucket/service → bucket/service
  //                                              ↑
  //                                       managed SSL cert (auto-provisioned)
  //
  // The load balancer handler creates the full chain from a single
  // `gcp.compute.globalForwardingRule` node — this pass computes the
  // backend references, the list of hosts (root domain + each
  // subdomain from outgoing edges), and the URL map host rules, then
  // attaches them as properties on the forwarding rule node.
  //
  // Multi-subdomain support: each edge FROM the PublicEndpoint node to
  // a compute target can carry `edge.data.subdomain`. Blank = root.
  // Non-blank = a host rule like `api.example.com → api-backend-service`.
  // The managed SSL cert includes every unique host.

  // For each compute target connected to a PublicEndpoint, we create a
  // backend ref — either a `gcp.compute.backendBucket` (for static sites)
  // or a `gcp.compute.backendService` backed by a serverless NEG (for
  // Cloud Run / Container / SSRSite / ServerlessFunction). The actual
  // NEG + backend service resources are created inline by the load
  // balancer handler at deploy time because they need the runtime
  // region, which the translator doesn't have.
  const staticSiteToForwardingRule = new Map<string, string>(); // static site node id → forwarding rule resource name

  // Map every PublicEndpoint node to its connected backends.
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
        const targetGraphNode = graph.nodes.get(be.targetResourceName as any);
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
      const removed = graph.remove_node(forwardingResourceName as any);
      if (removed) {
        const idx = deployables.findIndex((d) => d.resource_name === forwardingResourceName);
        if (idx !== -1) {
          deployables.splice(idx, 1);
          deployable_count--;
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
    const frNode = graph.nodes.get(forwardingResourceName as any);
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
          deployable_count++;
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

  // Pass 2: Add edges between deployed nodes
  for (const edge of edges) {
    const source_name = card_id_to_name.get(edge.source);
    const target_name = card_id_to_name.get(edge.target);

    // Skip edges where either end was not deployed
    if (!source_name || !target_name) continue;

    const relationship = map_edge_relationship(edge.data?.relationship);

    graph.add_edge({
      source: source_name,
      target: target_name,
      relationship,
    });
  }

  return {
    graph: graph as Graph,
    skipped,
    warnings,
    deployable_count,
    deployables,
  };
}


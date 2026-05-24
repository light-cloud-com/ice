/**
 * Card-to-Graph Translation Layer
 *
 * Transforms desktop CardNode[] + CardEdge[] into a core MutableGraph
 * with GCP-typed nodes that the deploy pipeline understands.
 */

import {
  UI_ONLY_TYPES,
  SERVICE_BACKEND_ICE_TYPES_FOR_INGRESS,
  EXTERNAL_TYPES,
  hasPrivateNetworkAncestor,
  isCustomDomainStandalone,
  map_edge_relationship,
} from './edge-classifier';
import { create_mutable_graph } from '../graph/mutable-graph';
import { PROPERTY_EXTRACTORS } from './extractors/dispatch';
import { expand_deployable_per_entry } from './passes/deploy-expansion';
import { wire_source_repositories } from './passes/pass-1-4-repo-wiring';
import { propagate_custom_domain_hosts } from './passes/pass-1-45-domain-propagation';
import { propagate_socket_port_targets } from './passes/pass-1-46-socket-port-targeting';
import { wire_public_endpoints } from './passes/pass-1-5-endpoint-wiring';
import { DESIGN_ONLY_PROVIDERS, get_type_map } from './type-maps';
import { getHighLevelResourceByIceType } from '../resources/high-level-resources';
import { sanitize_name, sanitize_label_value } from './utils/name-utils';
import { generate_stable_name } from './utils/stable-name';
import type { Graph } from '../types/graph';

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

    // ─── Schema-declared 1→N deploy expansion ─────────────────────────
    //
    // When the canonical schema sets `deployExpansion`, partition the
    // extractor's output and emit one cloud resource per entry instead
    // of one per block. This branch is iceType-agnostic — Secret Store
    // happens to be the first user, but ANY future block whose schema
    // declares expansion goes through the same code path.
    //
    // No edge connections back to the source block — the canvas-side
    // propagation rules carry per-entry refs onto consumer nodes
    // (e.g. service `secretRefs`), and leaving the block out of
    // `card_id_to_name` makes the deferred edge pass drop any orphan
    // edges naturally.
    const schemaResource = getHighLevelResourceByIceType(ice_type);
    if (schemaResource?.deployExpansion) {
      const blockLabel = (node.data.label as string) || ice_type.split('.').pop() || 'resource';
      const baseLabels: Record<string, string> = {
        'ice-managed': 'true',
        'ice-source-id': sanitize_label_value(node.id),
        'ice-type': sanitize_label_value(ice_type),
        'ice-project': sanitize_label_value(projectName),
      };
      if (input.environment) baseLabels['ice-environment'] = sanitize_label_value(input.environment);
      if (cardId) baseLabels['ice-card-id'] = sanitize_label_value(cardId);

      const expansionResult = expand_deployable_per_entry({
        expansion: schemaResource.deployExpansion,
        nodeId: node.id,
        blockLabel,
        iceType: ice_type,
        // `gcp_type` is the provider-resolved type (legacy variable name
        // — covers AWS / Azure / GCP / K8s); it just gets forwarded.
        resourceType: gcp_type,
        properties: properties as Record<string, unknown>,
        baseLabels,
        graph,
        deployables,
        skipped,
        warnings,
        provider,
      });
      deployable_count += expansionResult.added;
      continue;
    }

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

  // ─── Pass 1.46 — Socket-driven target-port routing ─────────────────────
  // Reads `edge.data.targetSocket` / `sourceSocket` ids of shape
  // `port-<N>-(in|out)` and writes the encoded port onto the compute
  // node's `target_port` (and `port` if not user-set). Makes multi-port
  // containers' typed-socket choices actually drive what the LB
  // targets at deploy time.
  propagate_socket_port_targets(edges, nodes, card_id_to_name, graph);

  // ─── Pass 1.5 — PublicEndpoint semantic wiring ─────────────────────────
  const { deployable_count_delta } = wire_public_endpoints({
    edges,
    nodes,
    card_id_to_name,
    graph,
    deployables,
    warnings,
    projectName,
  });
  deployable_count += deployable_count_delta;

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

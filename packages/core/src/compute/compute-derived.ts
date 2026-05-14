/**
 * Computing Flows Engine — pure function, zero side effects.
 *
 * Takes the full canvas state (nodes + edges), applies all propagation
 * and aggregate rules, and returns a PatchSet of derived-property updates.
 *
 * The caller (useComputingFlows hook) is responsible for diffing against
 * current values and dispatching only changed patches to Redux.
 *
 * Design principles:
 * - Pure function: no Redux, no React, no side effects
 * - Idempotent: calling twice with the same input yields the same output
 * - Merge semantics: multiple rules can contribute to the same node;
 *   patches are shallow-merged in rule order (last write wins per key)
 */

import { PROPAGATION_RULES, AGGREGATE_RULES } from './propagation-rules';
import type {
  PropagationNode,
  PropagationEdge,
  PropagationRule,
  AggregateRule,
  PropagationContext,
  PatchSet,
  NodePatch,
} from './types';

// ─── Graph Index ────────────────────────────────────────────────────────────

interface GraphIndex {
  nodeById: Map<string, PropagationNode>;
  /** Edges grouped by source node ID */
  outbound: Map<string, { edge: PropagationEdge; targetNode: PropagationNode }[]>;
  /** Edges grouped by target node ID */
  inbound: Map<string, { edge: PropagationEdge; sourceNode: PropagationNode }[]>;
}

function buildIndex(nodes: PropagationNode[], edges: PropagationEdge[]): GraphIndex {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const outbound = new Map<string, { edge: PropagationEdge; targetNode: PropagationNode }[]>();
  const inbound = new Map<string, { edge: PropagationEdge; sourceNode: PropagationNode }[]>();

  for (const edge of edges) {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) continue;

    if (!outbound.has(edge.source)) outbound.set(edge.source, []);
    outbound.get(edge.source)!.push({ edge, targetNode: tgt });

    if (!inbound.has(edge.target)) inbound.set(edge.target, []);
    inbound.get(edge.target)!.push({ edge, sourceNode: src });
  }

  return { nodeById, outbound, inbound };
}

// ─── Edge Cleanup ───────────────────────────────────────────────────────────

/**
 * Detect orphan edges: CustomDomain edges whose routeId no longer exists.
 */
function detectOrphanEdges(edges: PropagationEdge[], index: GraphIndex): { edgeId: string }[] {
  const deletions: { edgeId: string }[] = [];

  for (const edge of edges) {
    const routeId = edge.data?.routeId as string | undefined;
    if (!routeId) continue;

    const src = index.nodeById.get(edge.source);
    const tgt = index.nodeById.get(edge.target);
    if (!src || !tgt) continue;

    const srcType = (src.data?.iceType as string) || '';
    const tgtType = (tgt.data?.iceType as string) || '';
    let domainNode: PropagationNode | null = null;
    if (srcType === 'Network.CustomDomain') domainNode = src;
    else if (tgtType === 'Network.CustomDomain') domainNode = tgt;
    if (!domainNode) continue;

    const routes = (domainNode.data?.routes as Array<{ id: string }>) || [];
    if (routes.length > 0 && !routes.some((r) => r.id === routeId)) {
      deletions.push({ edgeId: edge.id });
    }
  }

  return deletions;
}

// ─── Route ID Backfill ──────────────────────────────────────────────────────

/**
 * Detect CustomDomain edges missing routeIds and assign free route slots.
 */
function backfillRouteIds(
  edges: PropagationEdge[],
  index: GraphIndex,
): { edgeId: string; data: Record<string, unknown> }[] {
  const patches: { edgeId: string; data: Record<string, unknown> }[] = [];

  const cdNodes = new Map<string, PropagationNode>();
  for (const [, node] of index.nodeById) {
    if ((node.data?.iceType as string) === 'Network.CustomDomain') {
      cdNodes.set(node.id, node);
    }
  }

  for (const [cdId, cdNode] of cdNodes) {
    const routes = (cdNode.data?.routes as Array<{ id: string; subdomain: string }>) || [];
    if (routes.length === 0) continue;

    const touchingEdges = edges.filter((e) => e.source === cdId || e.target === cdId);
    const claimedRouteIds = new Set<string>();

    for (const e of touchingEdges) {
      const rid = e.data?.routeId as string | undefined;
      if (rid && routes.some((r) => r.id === rid)) claimedRouteIds.add(rid);
    }

    for (const e of touchingEdges) {
      const rid = e.data?.routeId as string | undefined;
      if (rid && routes.some((r) => r.id === rid)) continue;
      const freeRoute = routes.find((r) => !claimedRouteIds.has(r.id));
      if (!freeRoute) break;
      claimedRouteIds.add(freeRoute.id);
      patches.push({ edgeId: e.id, data: { routeId: freeRoute.id } });
    }
  }

  return patches;
}

// ─── Core Engine ────────────────────────────────────────────────────────────

export function computeDerived(
  nodes: PropagationNode[],
  edges: PropagationEdge[],
  rules: PropagationRule[] = PROPAGATION_RULES,
  aggregateRules: AggregateRule[] = AGGREGATE_RULES,
): PatchSet {
  const index = buildIndex(nodes, edges);
  const ctx: PropagationContext = { allNodes: nodes, allEdges: edges };

  // Accumulate patches per node: nodeId → merged data
  const nodePatchMap = new Map<string, Record<string, unknown>>();

  function mergeNodePatch(nodeId: string, data: Record<string, unknown>) {
    const existing = nodePatchMap.get(nodeId) || {};
    nodePatchMap.set(nodeId, { ...existing, ...data });
  }

  // ── Pass 1: Per-edge propagation rules ────────────────────────────────

  for (const edge of edges) {
    const srcNode = index.nodeById.get(edge.source);
    const tgtNode = index.nodeById.get(edge.target);
    if (!srcNode || !tgtNode) continue;

    const srcType = (srcNode.data?.iceType as string) || '';
    const tgtType = (tgtNode.data?.iceType as string) || '';

    for (const rule of rules) {
      if (rule.source(srcType) && rule.target(tgtType)) {
        const patch = rule.compute(srcNode, tgtNode, edge, ctx);
        if (patch) {
          const receiverId = rule.direction === 'source→target' ? tgtNode.id : srcNode.id;
          mergeNodePatch(receiverId, patch);
        }
      } else if (rule.source(tgtType) && rule.target(srcType)) {
        const patch = rule.compute(tgtNode, srcNode, edge, ctx);
        if (patch) {
          const receiverId = rule.direction === 'source→target' ? srcNode.id : tgtNode.id;
          mergeNodePatch(receiverId, patch);
        }
      }
    }
  }

  // ── Pass 2: Aggregate rules (per-node, all edges) ────────────────────

  for (const rule of aggregateRules) {
    for (const node of nodes) {
      const nodeType = (node.data?.iceType as string) || '';
      if (!rule.appliesTo(nodeType)) continue;

      const inbound = index.inbound.get(node.id) || [];
      const outbound = index.outbound.get(node.id) || [];
      const patch = rule.compute(node, inbound, outbound, ctx);
      if (patch) {
        mergeNodePatch(node.id, patch);
      }
    }
  }

  // ── Pass 3: Edge maintenance (routeId backfill + orphan cleanup) ──────

  const edgePatches = backfillRouteIds(edges, index).map((p) => ({
    edgeId: p.edgeId,
    data: p.data,
  }));

  const edgeDeletions = detectOrphanEdges(edges, index);

  // ── Build final PatchSet ──────────────────────────────────────────────

  const nodePatches: NodePatch[] = [];
  for (const [nodeId, data] of nodePatchMap) {
    nodePatches.push({ nodeId, data });
  }

  return { nodePatches, edgePatches, edgeDeletions };
}

// ─── Diff utility ───────────────────────────────────────────────────────────

/**
 * Filter a PatchSet to only include patches where the value actually differs
 * from the current node/edge data. This prevents infinite update loops.
 */
export function diffPatches(
  patchSet: PatchSet,
  currentNodes: PropagationNode[],
  currentEdges: PropagationEdge[],
): PatchSet {
  const nodeById = new Map(currentNodes.map((n) => [n.id, n]));
  const edgeById = new Map(currentEdges.map((e) => [e.id, e]));

  const filteredNodePatches = patchSet.nodePatches.filter((patch) => {
    const node = nodeById.get(patch.nodeId);
    if (!node) return false;
    return Object.entries(patch.data).some(([key, value]) => !deepEqual(node.data[key], value));
  });

  const filteredEdgePatches = patchSet.edgePatches.filter((patch) => {
    const edge = edgeById.get(patch.edgeId);
    if (!edge) return false;
    return Object.entries(patch.data).some(
      ([key, value]) => !deepEqual((edge.data as Record<string, unknown> | undefined)?.[key], value),
    );
  });

  return {
    nodePatches: filteredNodePatches,
    edgePatches: filteredEdgePatches,
    edgeDeletions: patchSet.edgeDeletions,
  };
}

// ─── Deep equality (shallow for primitives, JSON for objects/arrays) ────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

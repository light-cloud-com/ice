/**
 * Connection Validation Rules
 *
 * Validates all edges against CONNECTION_RULES from @ice/types.
 * Checks: invalid connections, anti-patterns, duplicates,
 * self-connections, cycles, missing critical connections.
 */

import { canConnect, isContainer, isFrontend, isDatabase, isQueue } from './classifiers.js';
import type { CanvasIssue, ValidatableNode, ValidatableEdge, ValidationContext } from './types.js';

/**
 * Validate all edges and connection patterns.
 */
export function validateConnections(
  nodes: readonly ValidatableNode[],
  edges: readonly ValidatableEdge[],
  _ctx: ValidationContext,
): CanvasIssue[] {
  const issues: CanvasIssue[] = [];
  const nodeMap = new Map<string, ValidatableNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Track seen edges for duplicate detection
  const edgePairs = new Set<string>();

  for (const edge of edges) {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);

    // Skip edges with dangling refs (caught by structure-rules)
    if (!srcNode || !tgtNode) continue;

    const srcIceType = (srcNode.data.iceType as string) ?? '';
    const tgtIceType = (tgtNode.data.iceType as string) ?? '';
    const relationship = edge.data?.relationship as string;

    // Skip containment edges — these are structural, not connections
    if (relationship === 'contains') continue;

    // ── Self-connection ───────────────────────────────────────────────
    if (edge.source === edge.target) {
      issues.push({
        id: `conn:${edge.id}:SELF_CONNECTION`,
        severity: 'error',
        category: 'connection',
        code: 'SELF_CONNECTION',
        message: 'A resource cannot connect to itself',
        edgeId: edge.id,
        nodeId: edge.source,
      });
      continue;
    }

    // ── Container connection ──────────────────────────────────────────
    if (isContainer(srcIceType, srcNode.type) || isContainer(tgtIceType, tgtNode.type)) {
      issues.push({
        id: `conn:${edge.id}:CONTAINER_CONNECTION`,
        severity: 'error',
        category: 'connection',
        code: 'CONTAINER_CONNECTION',
        message: 'Containers (VPC, Subnet, Group) cannot have connections — drop resources inside them',
        edgeId: edge.id,
      });
      continue;
    }

    // ── Invalid connection pair ───────────────────────────────────────
    if (srcIceType && tgtIceType && !canConnect(srcIceType, tgtIceType, srcNode.type, tgtNode.type)) {
      // findings.md #38 — the `'Source'` / `'Target'` literal
      // fallbacks were unreachable: the branch is already gated on
      // both iceTypes being truthy, and `split('.').pop()` on a
      // non-empty string always returns a non-empty segment unless
      // the iceType is exactly `'.'` (not a real iceType). Dropped.
      const srcLabel = (srcNode.data.label as string) || srcIceType.split('.').pop()!;
      const tgtLabel = (tgtNode.data.label as string) || tgtIceType.split('.').pop()!;
      issues.push({
        id: `conn:${edge.id}:INVALID_CONNECTION`,
        severity: 'error',
        category: 'connection',
        code: 'INVALID_CONNECTION',
        message: `${srcLabel} → ${tgtLabel} is not a valid connection`,
        edgeId: edge.id,
        suggestion: 'Remove this connection or add an intermediate service',
      });
    }

    // ── Duplicate edges ───────────────────────────────────────────────
    const pairKey = [edge.source, edge.target].sort().join('|');
    if (edgePairs.has(pairKey)) {
      issues.push({
        id: `conn:${edge.id}:DUPLICATE_EDGE`,
        severity: 'warning',
        category: 'connection',
        code: 'DUPLICATE_EDGE',
        message: 'These resources are already connected',
        edgeId: edge.id,
      });
    }
    edgePairs.add(pairKey);

    // ── Anti-patterns ─────────────────────────────────────────────────
    if (isFrontend(srcIceType) && isDatabase(tgtIceType)) {
      issues.push({
        id: `conn:${edge.id}:FRONTEND_DB_DIRECT`,
        severity: 'warning',
        category: 'connection',
        code: 'FRONTEND_DB_DIRECT',
        message: 'Direct database access from frontend is a security risk',
        edgeId: edge.id,
        suggestion: 'Add a Backend API between the frontend and database',
      });
    }

    if (isFrontend(srcIceType) && isQueue(tgtIceType)) {
      issues.push({
        id: `conn:${edge.id}:FRONTEND_QUEUE_DIRECT`,
        severity: 'warning',
        category: 'connection',
        code: 'FRONTEND_QUEUE_DIRECT',
        message: 'Frontend should not publish directly to message queues',
        edgeId: edge.id,
        suggestion: 'Route through a Backend API',
      });
    }
  }

  // ── Cycle detection ───────────────────────────────────────────────────
  // Only check non-containment edges
  // Only consider edges where both endpoints exist in the node map.
  // Without this filter, a dangling target (typically a half-deleted
  // node or stale edge) produced phantom-cycle reports like
  // `a → ghost → a` once an unrelated edge happened to point back at
  // `a`. The per-edge validation loop above already short-circuits on
  // missing endpoints; aligning the cycle detector with that contract
  // closes findings.md #20.
  const dataEdges = edges
    .filter(
      (e) =>
        e.data?.relationship !== 'contains' &&
        nodeMap.has(e.source) &&
        nodeMap.has(e.target),
    )
    .map((e) => ({ source: e.source, target: e.target }));

  // Check each edge for cycle creation potential
  // (A full cycle check on the entire graph)
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const adj = new Map<string, string[]>();

  for (const e of dataEdges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  function hasCycleDFS(nodeId: string): string[] | null {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    for (const neighbor of adj.get(nodeId) ?? []) {
      if (!visited.has(neighbor)) {
        const cycle = hasCycleDFS(neighbor);
        if (cycle) {
          cycle.unshift(nodeId);
          return cycle;
        }
      } else if (recursionStack.has(neighbor)) {
        return [nodeId, neighbor];
      }
    }

    recursionStack.delete(nodeId);
    return null;
  }

  for (const nodeId of adj.keys()) {
    if (!visited.has(nodeId)) {
      const cycle = hasCycleDFS(nodeId);
      if (cycle) {
        const cycleLabels = cycle.map((id) => {
          const n = nodeMap.get(id);
          return (n?.data.label as string) || id.slice(0, 8);
        });
        issues.push({
          id: `conn:cycle:${cycle.join('-')}`,
          severity: 'error',
          category: 'connection',
          code: 'CYCLE_DETECTED',
          message: `Dependency cycle: ${cycleLabels.join(' → ')}`,
          nodeId: cycle[0],
          suggestion: 'Remove one connection in the cycle to break it',
        });
        break; // Report first cycle only to avoid noise
      }
    }
  }

  return issues;
}

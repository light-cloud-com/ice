/**
 * Hierarchy helpers for auto-layout.
 *
 * Pure graph traversal:
 *  - `buildHierarchy` derives the parent/children maps from `contains`
 *    edges and the `parentId` field on every node.
 *  - `collectRootIds` returns the top-level node ids — those whose parent
 *    isn't in the working node set.
 *  - `buildPostOrder` walks the containment tree depth-first and emits
 *    inner containers before their parents (post-order). Layout passes
 *    use this to size containers bottom-up.
 */

import type { LayoutNode, LayoutEdge } from './types';

/**
 * Build parent/children maps from `contains` edges + `parentId` fields.
 *
 * `contains` edges take precedence on first match: if both an edge and a
 * `parentId` link a child to two different parents, the edge wins.
 * Both shapes are commonly present in the same graph because edges are
 * persisted but `parentId` is the working-state field that drag-into-
 * container actions update.
 */
export function buildHierarchy(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): { parentOf: Map<string, string>; childrenOf: Map<string, string[]> } {
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const e of edges) {
    if (e.relationship !== 'contains') continue;
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    parentOf.set(e.target, e.source);
    const list = childrenOf.get(e.source) ?? [];
    if (!list.includes(e.target)) list.push(e.target);
    childrenOf.set(e.source, list);
  }

  for (const n of nodes) {
    if (n.parentId && nodeIds.has(n.parentId)) {
      if (!parentOf.has(n.id)) parentOf.set(n.id, n.parentId);
      const list = childrenOf.get(n.parentId) ?? [];
      if (!list.includes(n.id)) list.push(n.id);
      childrenOf.set(n.parentId, list);
    }
  }

  return { parentOf, childrenOf };
}

/**
 * Top-level node ids — nodes whose `parentId` is missing or points to a
 * node not in `nodeMap` (orphaned reference).
 */
export function collectRootIds(nodes: LayoutNode[], nodeMap: Map<string, LayoutNode>): string[] {
  return nodes.filter((n) => !n.parentId || !nodeMap.has(n.parentId)).map((n) => n.id);
}

/**
 * Post-order traversal of the containment tree: inner containers are laid
 * out and sized before outer containers consume them as fixed-size nodes.
 * The synthetic root `null` is the final entry — owners surface inside it
 * after all real owners are emitted.
 */
export function buildPostOrder(rootIds: string[], childrenOf: Map<string, string[]>): (string | null)[] {
  const order: (string | null)[] = [];
  const visited = new Set<string | null>();
  const visit = (ownerId: string | null) => {
    if (visited.has(ownerId)) return;
    visited.add(ownerId);
    const kids = ownerId === null ? rootIds : (childrenOf.get(ownerId) ?? []);
    for (const kid of kids) {
      if ((childrenOf.get(kid) ?? []).length > 0) visit(kid);
    }
    order.push(ownerId);
  };
  visit(null);
  return order;
}

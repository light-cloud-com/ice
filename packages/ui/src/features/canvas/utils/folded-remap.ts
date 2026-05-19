/**
 * Pure tree walks for the canvas's folded-state machinery.
 *
 * The canvas lets a user collapse a container ("fold" it) so the children
 * disappear from the visual layer while their connections still need to
 * resolve to *something* on screen. Rather than mutate the underlying node
 * list, the orchestrator computes three derived facts for the current
 * frame:
 *
 *   1. `isNodeFolded(nodes, id)` — does `nodes[id].data.folded === true`?
 *   2. `hasCollapsedAncestor(nodes, id)` — recursively, is any ancestor folded?
 *   3. `buildFoldedRemap(canvasNodes, visibleNodes)` — for every node hidden
 *      behind a collapsed ancestor, where should its connections re-route to?
 *      The answer is the first ancestor that is NOT itself hidden.
 *   4. `descendants(nodes, parentId)` — flat list of every descendant id
 *      reachable from `parentId`, used by box selection / reparenting and
 *      by handleNodeMove (so hidden children at L1 also move with their
 *      parent).
 *
 * Lifted out of `svg-canvas.tsx` (rf-canv-3). The orchestrator's three
 * `useCallback` / `useMemo` blocks become thin wrappers that bind the
 * appropriate node array on each render — the recursive walks themselves
 * are React-free so they can be unit-tested directly without rendering
 * the canvas.
 *
 * Behavior is verbatim with the inline implementations: the same
 * `!node?.parentId` early-return, the same `if (ancestorId)` guard before
 * `Map.set`, the same `Array.find` (not Map index) on every step.
 */

import type { CanvasNode } from '../components/types';

/**
 * `true` when the node identified by `nodeId` is itself collapsed
 * (`node.data.folded === true`). Returns `false` if the node is not in
 * `nodes` at all.
 */
export function isNodeFolded(nodes: CanvasNode[], nodeId: string): boolean {
  const node = nodes.find((n) => n.id === nodeId);
  return node?.data?.folded === true;
}

/**
 * `true` when any ancestor of `nodeId` (parent, grandparent, ...) is
 * folded. Returns `false` for root nodes (no parentId) — they cannot have
 * a collapsed ancestor by definition. Recursion walks `nodes` until it
 * hits a folded ancestor (`true`) or a node with no parent (`false`).
 */
export function hasCollapsedAncestor(nodes: CanvasNode[], nodeId: string): boolean {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node?.parentId) return false;
  if (isNodeFolded(nodes, node.parentId)) return true;
  return hasCollapsedAncestor(nodes, node.parentId);
}

/**
 * For every node in `canvasNodes` hidden behind a collapsed ancestor,
 * map its id to the id of the first ancestor that is NOT hidden. The
 * result is a `Map<hiddenChildId, visibleAncestorId>` consumed by the
 * connection re-router so edges re-attach to whatever the user actually
 * sees.
 *
 * `visibleNodes` is the source of truth for `hasCollapsedAncestor` — the
 * inline predicate at the call site read `visibleNodes`, NOT
 * `canvasNodes`. Walking back up the chain, we look up parents in
 * `canvasNodes` (so we can climb past containers that are themselves
 * filtered out of `visibleNodes`).
 *
 * Edge case preserved verbatim from the inline implementation: if the
 * walk falls off the top (every ancestor is hidden, no visible root
 * exists), the entry is NOT added to the map — the `if (ancestorId)`
 * guard. Callers fall back to the original edge endpoint in that case.
 */
export function buildFoldedRemap(canvasNodes: CanvasNode[], visibleNodes: CanvasNode[]): Map<string, string> {
  const remap = new Map<string, string>();
  for (const node of canvasNodes) {
    if (hasCollapsedAncestor(visibleNodes, node.id)) {
      // Walk up to find the first ancestor that is NOT hidden.
      let ancestorId: string | null | undefined = node.parentId;
      while (ancestorId && hasCollapsedAncestor(visibleNodes, ancestorId)) {
        const ancestor = canvasNodes.find((n) => n.id === ancestorId);
        ancestorId = ancestor?.parentId || null;
      }
      if (ancestorId) {
        remap.set(node.id, ancestorId);
      }
    }
  }
  return remap;
}

/**
 * Flat list of every descendant id reachable from `parentId` within
 * `nodes`. Caller supplies the array — pass `visibleNodes` for the
 * original `getDescendantIds` behavior (box selection, reparenting),
 * pass `canvasNodes` for the original `getAllDescendantIds` behavior
 * (handleNodeMove translating hidden L1 children with their parent).
 *
 * Recurses depth-first; the ordering is "child, then child's
 * descendants, then next sibling, then its descendants" — verbatim with
 * the inline implementation.
 */
export function descendants(nodes: CanvasNode[], parentId: string): string[] {
  const out: string[] = [];
  const children = nodes.filter((n) => n.parentId === parentId);
  for (const child of children) {
    out.push(child.id);
    out.push(...descendants(nodes, child.id));
  }
  return out;
}

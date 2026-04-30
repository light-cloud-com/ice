/**
 * Pure container-bounds geometry for the canvas.
 *
 * Four exports lift the orchestrator's container-resize math out of
 * `svg-canvas.tsx` (rf-canv-4):
 *
 *   1. `calculateContainerBounds(visibleNodes, containerId, nodeStates)` —
 *      compute the bounding box for a container's children, expand the
 *      container to fit (union of current + required + padding), and clamp
 *      to MIN_CONTAINER_WIDTH / MIN_CONTAINER_HEIGHT. Returns `null` for
 *      missing / folded / childless containers, otherwise
 *      `{ width, height, x, y, changed }`.
 *   2. `recalculateAncestorBounds(visibleNodes, startNodeId, nodeStates)` —
 *      walk up the parent chain, applying `calculateContainerBounds` at
 *      every level. Mutates `nodeStates` so the next ancestor sees the
 *      already-expanded child. Returns the flat list of `{ id, position?,
 *      size? }` updates from leaf to root.
 *   3. `expandToFitChildren(parentBox, childBox, opts?)` — pure parent-box
 *      expansion that preserves the union-with-current-bounds shape from
 *      `calculateContainerBounds`. Designed for rf-canv-25 to fold the 4
 *      copy-pasted per-edge expansion loops in the container-resize
 *      handlers (the loops have subtly different semantics; this is the
 *      canonical version).
 *   4. `clampNodeToParent(nodePos, nodeSize, parentBox, opts?)` — pure
 *      child-position clamp keeping a node inside the parent's interior
 *      (parent.x + padding ≤ x ≤ parent.x + parent.width − padding − width;
 *      parent.y + headerH + padding ≤ y ≤ parent.y + parent.height −
 *      padding − height).
 *
 * The orchestrator's two `useCallback` hooks (`calculateContainerBounds`,
 * `recalculateAncestorBounds`) become thin wrappers that bind
 * `visibleNodes` on each render — the math itself is React-free so it can
 * be unit-tested directly without rendering the canvas.
 *
 * `CONTAINER_HEADER_H` and `CONTAINER_PAD` are re-exported as readability
 * aliases for `HEADER_HEIGHT` / `CONTAINER_PADDING`. The original lines in
 * `svg-canvas.tsx` (`const CONTAINER_HEADER_H = HEADER_HEIGHT`) move here
 * so consumers can import them from one place.
 *
 * Behavior is verbatim with the inline orchestrator implementations: same
 * folded short-circuit, same `Math.min` / `Math.max` union, same
 * `MIN_CONTAINER_*` floor.
 */

import {
  HEADER_HEIGHT,
  CONTAINER_PADDING,
  MIN_CONTAINER_WIDTH,
  MIN_CONTAINER_HEIGHT,
} from '../../../config/canvas-constants';
// rf-canv-1 / rf-canv-3 learning: `import type` brings the name into THIS
// module's lexical scope. Required because the function signatures below
// reference `CanvasNode` directly.
import type { CanvasNode } from '../components/types';

/**
 * Header height for a container's title bar (above the children area).
 * Re-exported as a readability alias of `HEADER_HEIGHT`.
 */
export const CONTAINER_HEADER_H = HEADER_HEIGHT;

/**
 * Padding around a container's children. Re-exported as a readability
 * alias of `CONTAINER_PADDING`.
 */
export const CONTAINER_PAD = CONTAINER_PADDING;

/**
 * Pending state for a single node (positions/sizes that have not yet been
 * committed to the store). Used by the resize/move handlers to share
 * intermediate state across an ancestor walk.
 */
export interface NodeBoundsState {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Output of `calculateContainerBounds`. `changed` is `true` when any of
 * x / y / width / height differs from the container's current state in
 * the supplied `nodeStates` map (or its underlying canvas-node entry, if
 * no pending state exists).
 */
export interface ContainerBoundsResult {
  width: number;
  height: number;
  x: number;
  y: number;
  changed: boolean;
}

/**
 * One entry in the ancestor-walk update list: position and/or size for a
 * single ancestor whose bounds expanded.
 */
export interface AncestorUpdate {
  id: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

/**
 * Optional padding overrides for `expandToFitChildren` /
 * `clampNodeToParent`. Defaults to `CONTAINER_HEADER_H` / `CONTAINER_PAD`.
 */
export interface BoundsOpts {
  headerH?: number;
  padding?: number;
}

/**
 * Calculate bounds for a container based on its children's absolute
 * positions, expanding the container when children extend beyond its
 * current bounds.
 *
 * Returns `null` when:
 * - the container is not in `visibleNodes`,
 * - the container is folded (`data.folded === true`), or
 * - the container has no children in `visibleNodes`.
 *
 * Otherwise returns the new `{ width, height, x, y }` plus a `changed`
 * flag indicating whether any of those four values differs from the
 * container's current state. `nodeStates` is consulted first for each
 * child / for the container itself (so pending updates from a sibling
 * walk are visible); the canvas-node fields are the fallback.
 *
 * The math: union of (current container bounds) and (required bounds =
 * child bounding box + padding + header). Then clamp width/height to
 * `MIN_CONTAINER_WIDTH` / `MIN_CONTAINER_HEIGHT`.
 */
export function calculateContainerBounds(
  visibleNodes: CanvasNode[],
  containerId: string,
  nodeStates: Map<string, NodeBoundsState>,
): ContainerBoundsResult | null {
  const container = visibleNodes.find((n) => n.id === containerId);
  if (!container) return null;

  // If container is folded, don't resize based on children
  if (container.data?.folded) return null;

  const children = visibleNodes.filter((n) => n.parentId === containerId);
  if (children.length === 0) return null;

  // Compute the bounding box of all children (absolute coords)
  let childMinX = Infinity;
  let childMinY = Infinity;
  let childMaxRight = -Infinity;
  let childMaxBottom = -Infinity;

  for (const child of children) {
    // Use pending state if available, otherwise current state
    const state = nodeStates.get(child.id) || {
      x: child.x,
      y: child.y,
      width: child.width,
      height: child.height,
    };

    childMinX = Math.min(childMinX, state.x);
    childMinY = Math.min(childMinY, state.y);
    childMaxRight = Math.max(childMaxRight, state.x + state.width);
    childMaxBottom = Math.max(childMaxBottom, state.y + state.height);
  }

  // Required container bounds to encompass all children + padding
  const requiredLeft = childMinX - CONTAINER_PAD;
  const requiredTop = childMinY - CONTAINER_PAD - CONTAINER_HEADER_H;
  const requiredRight = childMaxRight + CONTAINER_PAD;
  const requiredBottom = childMaxBottom + CONTAINER_PAD;

  // Current container bounds
  const currentState = nodeStates.get(containerId) || {
    x: container.x,
    y: container.y,
    width: container.width,
    height: container.height,
  };
  const curLeft = currentState.x;
  const curTop = currentState.y;
  const curRight = currentState.x + currentState.width;
  const curBottom = currentState.y + currentState.height;

  // Expand container to encompass children (union of current + required bounds)
  const newLeft = Math.min(curLeft, requiredLeft);
  const newTop = Math.min(curTop, requiredTop);
  const newRight = Math.max(curRight, requiredRight);
  const newBottom = Math.max(curBottom, requiredBottom);

  const newX = newLeft;
  const newY = newTop;
  const newWidth = Math.max(MIN_CONTAINER_WIDTH, newRight - newLeft);
  const newHeight = Math.max(MIN_CONTAINER_HEIGHT, newBottom - newTop);

  return {
    width: newWidth,
    height: newHeight,
    x: newX,
    y: newY,
    changed:
      newWidth !== currentState.width ||
      newHeight !== currentState.height ||
      newX !== currentState.x ||
      newY !== currentState.y,
  };
}

/**
 * Recursively recalculate all ancestor containers, starting from the
 * parent of `startNodeId` and walking up the chain. Each step applies
 * `calculateContainerBounds`, mutates `nodeStates` so the next ancestor
 * sees the already-expanded child, and pushes a `{ id, position, size }`
 * entry onto the result list.
 *
 * Returns an empty array when `startNodeId` is missing from
 * `visibleNodes`, has no parent, or when the parent's bounds did not
 * change (a non-overflowing move terminates the walk early).
 *
 * The walk is leaf-to-root order: the first entry is the immediate
 * parent, the last is the topmost ancestor that still needed an update.
 */
export function recalculateAncestorBounds(
  visibleNodes: CanvasNode[],
  startNodeId: string,
  nodeStates: Map<string, NodeBoundsState>,
): AncestorUpdate[] {
  const updates: AncestorUpdate[] = [];

  // Find the node and its parent
  const node = visibleNodes.find((n) => n.id === startNodeId);
  if (!node || !node.parentId) return updates;

  // Calculate new bounds for the parent
  const parentBounds = calculateContainerBounds(visibleNodes, node.parentId, nodeStates);
  if (!parentBounds || !parentBounds.changed) return updates;

  // Update the parent's state in our map
  nodeStates.set(node.parentId, {
    x: parentBounds.x,
    y: parentBounds.y,
    width: parentBounds.width,
    height: parentBounds.height,
  });

  // Add parent update
  updates.push({
    id: node.parentId,
    position: { x: parentBounds.x, y: parentBounds.y },
    size: { width: parentBounds.width, height: parentBounds.height },
  });

  // Recursively update grandparent, great-grandparent, etc.
  const ancestorUpdates = recalculateAncestorBounds(visibleNodes, node.parentId, nodeStates);
  updates.push(...ancestorUpdates);

  return updates;
}

/**
 * Expand `parentBox` so it contains `childBox` (plus the configured
 * `headerH` + `padding`). Preserves the union-with-current-bounds shape
 * from `calculateContainerBounds`: the result is the smallest box that
 * fits the existing parent AND the child + padding.
 *
 * Returns the new `{ x, y, width, height }` plus a `changed` flag
 * indicating whether any of those four values differs from the input
 * parent. Designed for rf-canv-25 to fold the 4 copy-pasted per-edge
 * expansion loops in the container-resize handlers.
 *
 * Note: this does NOT enforce `MIN_CONTAINER_WIDTH` / `MIN_CONTAINER_HEIGHT`
 * — its callers (the resize handlers) clamp separately, after the union
 * is known.
 */
export function expandToFitChildren(
  parentBox: { x: number; y: number; width: number; height: number },
  childBox: { x: number; y: number; width: number; height: number },
  opts?: BoundsOpts,
): { x: number; y: number; width: number; height: number; changed: boolean } {
  const headerH = opts?.headerH ?? CONTAINER_HEADER_H;
  const padding = opts?.padding ?? CONTAINER_PAD;

  // Required parent bounds to encompass the child + padding (top edge
  // also accounts for the header above the children area).
  const requiredLeft = childBox.x - padding;
  const requiredTop = childBox.y - padding - headerH;
  const requiredRight = childBox.x + childBox.width + padding;
  const requiredBottom = childBox.y + childBox.height + padding;

  const curLeft = parentBox.x;
  const curTop = parentBox.y;
  const curRight = parentBox.x + parentBox.width;
  const curBottom = parentBox.y + parentBox.height;

  // Union of current + required bounds
  const newLeft = Math.min(curLeft, requiredLeft);
  const newTop = Math.min(curTop, requiredTop);
  const newRight = Math.max(curRight, requiredRight);
  const newBottom = Math.max(curBottom, requiredBottom);

  const x = newLeft;
  const y = newTop;
  const width = newRight - newLeft;
  const height = newBottom - newTop;

  return {
    x,
    y,
    width,
    height,
    changed: x !== parentBox.x || y !== parentBox.y || width !== parentBox.width || height !== parentBox.height,
  };
}

/**
 * Clamp `nodePos` so a child of `nodeSize` stays within the interior of
 * `parentBox` (i.e. inside `parent.x + padding` … `parent.x + parent.width
 * − padding − nodeSize.width`, and below `parent.y + headerH + padding`).
 *
 * Returns the clamped `{ x, y }`. When the node already fits, returns the
 * input position unchanged. Designed for rf-canv-25 to consume after a
 * resize so a moved/expanded child never sits outside its (possibly
 * expanded) parent.
 *
 * Note: like `expandToFitChildren`, this does not coordinate with
 * `MIN_CONTAINER_*` floors — the caller is expected to enforce those at
 * the parent-side before clamping the child.
 */
export function clampNodeToParent(
  nodePos: { x: number; y: number },
  nodeSize: { width: number; height: number },
  parentBox: { x: number; y: number; width: number; height: number },
  opts?: BoundsOpts,
): { x: number; y: number } {
  const headerH = opts?.headerH ?? CONTAINER_HEADER_H;
  const padding = opts?.padding ?? CONTAINER_PAD;

  const minX = parentBox.x + padding;
  const minY = parentBox.y + padding + headerH;
  const maxX = parentBox.x + parentBox.width - padding - nodeSize.width;
  const maxY = parentBox.y + parentBox.height - padding - nodeSize.height;

  return {
    x: Math.max(minX, Math.min(maxX, nodePos.x)),
    y: Math.max(minY, Math.min(maxY, nodePos.y)),
  };
}

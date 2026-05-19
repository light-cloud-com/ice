/**
 * rf-cmove-1 — BND-1/BND-3 dragged-node clamp helper.
 *
 * After `handleNodeMove`'s ancestor walk has expanded the parent, the
 * dragged node may STILL sit outside the parent's interior — snap-to-grid
 * rounding plus the per-edge expansion math don't always agree on the
 * border. This helper re-clamps the dragged node into the (possibly
 * grown) parent's interior and propagates the clamp delta to all
 * descendants so their relative offsets stay intact.
 *
 * Behavior is preserved verbatim from rf-canv-25b.
 */

import { CONTAINER_HEADER_H, CONTAINER_PAD } from '../../utils/container-bounds';
import type { PositionUpdate, SizeUpdate } from './types';
import type { CanvasNode } from '../../components/types';

/**
 * Clamp the dragged node `node` to its parent's (post-expansion) bounds.
 *
 * Mutates `positionUpdates` in place. If a clamp delta is applied, also
 * shifts every descendant entry in `positionUpdates` (matching `descendantIds`)
 * by the same delta so the descendant translation stays rigid.
 *
 * No-op when (a) `node` has no parent, (b) the parent isn't in
 * `visibleNodes`, (c) the parent is folded, (d) the dragged node's update
 * is already inside the parent's interior.
 */
export function clampDraggedNodeToParent(args: {
  node: CanvasNode;
  visibleNodes: CanvasNode[];
  positionUpdates: PositionUpdate[];
  sizeUpdates: SizeUpdate[];
  descendantIds: string[];
}): void {
  const { node, visibleNodes, positionUpdates, sizeUpdates, descendantIds } = args;

  if (!node.parentId) return;
  const parent = visibleNodes.find((n) => n.id === node.parentId);
  if (!parent || parent.data?.folded) return;

  const parentPosUpdate = positionUpdates.find((u) => u.id === parent.id);
  const parentSizeUpdate = sizeUpdates.find((u) => u.id === parent.id);
  const px = parentPosUpdate?.position.x ?? parent.x;
  const py = parentPosUpdate?.position.y ?? parent.y;
  const pw = parentSizeUpdate?.width ?? parent.width;
  const ph = parentSizeUpdate?.height ?? parent.height;

  const minX = px + CONTAINER_PAD;
  const minY = py + CONTAINER_PAD + CONTAINER_HEADER_H;
  const maxX = px + pw - CONTAINER_PAD - node.width;
  const maxY = py + ph - CONTAINER_PAD - node.height;

  const nodeUpdate = positionUpdates.find((u) => u.id === node.id);
  if (!nodeUpdate) return;

  const clampedX = Math.max(minX, Math.min(maxX, nodeUpdate.position.x));
  const clampedY = Math.max(minY, Math.min(maxY, nodeUpdate.position.y));

  if (clampedX === nodeUpdate.position.x && clampedY === nodeUpdate.position.y) return;

  const adjustX = clampedX - nodeUpdate.position.x;
  const adjustY = clampedY - nodeUpdate.position.y;
  nodeUpdate.position.x = clampedX;
  nodeUpdate.position.y = clampedY;

  // Propagate the clamp delta to every descendant entry.
  for (const descId of descendantIds) {
    const descUpdate = positionUpdates.find((u) => u.id === descId);
    if (descUpdate) {
      descUpdate.position.x += adjustX;
      descUpdate.position.y += adjustY;
    }
  }
}

/**
 * Detect whether the dragged node sits within `margin` of any edge of
 * its parent and return the value to pass to `setExitingGroupId`.
 *
 * Tri-state result mirroring the original branching:
 *   - `{ call: false }` — node has parentId but parent NOT in
 *     visibleNodes → original code calls NEITHER branch (don't touch
 *     the setter).
 *   - `{ call: true, value: null }` — node has no parentId, OR parent
 *     present but node far from every edge.
 *   - `{ call: true, value: parent.id }` — parent present, node within
 *     `margin` of any edge.
 *
 * The original is at use-container-move.ts L359-372 (rf-canv-25b form).
 */
export function detectExitingGroupId(args: {
  node: CanvasNode;
  newX: number;
  newY: number;
  visibleNodes: CanvasNode[];
  margin?: number;
}): { call: false } | { call: true; value: string | null } {
  const { node, newX, newY, visibleNodes, margin = 30 } = args;

  if (!node.parentId) return { call: true, value: null };
  const parent = visibleNodes.find((n) => n.id === node.parentId);
  if (!parent) return { call: false };

  const isNearEdge =
    newX < parent.x + margin ||
    newY < parent.y + margin ||
    newX + node.width > parent.x + parent.width - margin ||
    newY + node.height > parent.y + parent.height - margin;
  return { call: true, value: isNearEdge ? parent.id : null };
}

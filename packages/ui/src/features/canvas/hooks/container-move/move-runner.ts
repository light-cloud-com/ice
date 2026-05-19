/**
 * rf-cmove-2 — Pure runner for `handleNodeMove`.
 *
 * Translates the dragged node + its descendants, walks ancestors via
 * `walkAncestorsAndExpand`, clamps the dragged node into the expanded
 * parent (BND-1/BND-3), and returns the position+size update payloads
 * plus the exit-indicator action (so the caller can dispatch + invoke
 * `setExitingGroupId` from React-land).
 *
 * Behavior is preserved verbatim from rf-canv-25b's `handleNodeMove`.
 *
 * Per blueprint risk #2 — `setExitingGroupId` is the rf-canv-25b/26
 * coupling point and stays a setter call out in the orchestrator. The
 * pure runner returns the {call, value} shape from `detectExitingGroupId`
 * so the orchestrator can be the one to invoke (or not invoke) the
 * setter.
 */

import { walkAncestorsAndExpand } from './ancestor-expansion';
import { clampDraggedNodeToParent, detectExitingGroupId } from './clamp';
import type { CanvasNode } from '../../components/types';
import type { PositionUpdate, SizeUpdate } from './types';

/**
 * Result of running a node-move pass. The orchestrator dispatches the
 * position/size updates (with the slice's skipClamp opt-in) and invokes
 * `setExitingGroupId` per the `exiting` tri-state.
 */
export interface NodeMoveResult {
  /** Position updates to dispatch via `updateCardNodePositions`. */
  positionUpdates: PositionUpdate[];
  /** Size updates to dispatch via `resizeCardNode` (per ancestor). */
  sizeUpdates: SizeUpdate[];
  /**
   * Whether the slice's child-clamp pass should be bypassed. True when
   * shift-drag (skipAncestorResize) OR the dragged node has descendants
   * (auto-layout uses different padding than the slice clamp).
   */
  skipClamp: boolean;
  /** Tri-state setter directive for the exit-indicator group id. */
  exiting: ReturnType<typeof detectExitingGroupId>;
}

/**
 * Pure runner — no React, no Redux. Returns the shape the orchestrator
 * should dispatch.
 *
 * Returns `null` when the node id is unknown (the orchestrator's `if
 * (!node) return;` early-out — caller must short-circuit so it does NOT
 * dispatch the no-op + does NOT touch setExitingGroupId).
 */
export function runNodeMove(args: {
  id: string;
  newX: number;
  newY: number;
  skipAncestorResize: boolean;
  visibleNodes: CanvasNode[];
  canvasNodes: CanvasNode[];
  getAllDescendantIds: (nodeId: string) => string[];
}): NodeMoveResult | null {
  const { id, newX, newY, skipAncestorResize, visibleNodes, canvasNodes, getAllDescendantIds } = args;

  const node = visibleNodes.find((n) => n.id === id);
  if (!node) return null;

  const deltaX = newX - node.x;
  const deltaY = newY - node.y;

  const positionUpdates: PositionUpdate[] = [];
  const sizeUpdates: SizeUpdate[] = [];

  // 1. Move the dragged node.
  positionUpdates.push({ id, position: { x: newX, y: newY } });

  // 2. Move ALL descendants (including hidden L1 children — getAllDescendantIds
  //    walks across canvasNodes, not visibleNodes).
  const descendantIds = getAllDescendantIds(id);
  for (const descId of descendantIds) {
    const desc = canvasNodes.find((n) => n.id === descId);
    if (desc) {
      positionUpdates.push({ id: descId, position: { x: desc.x + deltaX, y: desc.y + deltaY } });
    }
  }

  // 3. Expand ancestors if child overflows their bounds.
  //    Sibling positions read incrementally from positionUpdates so
  //    multi-step walks (parent → grandparent) see the parent's freshly
  //    moved siblings instead of stale visibleNodes coords.
  if (!skipAncestorResize && node.parentId) {
    walkAncestorsAndExpand({
      node,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => {
        const sibUpdate = positionUpdates.find((u) => u.id === sib.id);
        return {
          x: sibUpdate?.position.x ?? sib.x,
          y: sibUpdate?.position.y ?? sib.y,
        };
      },
    });
  }

  // 4. BND-1/BND-3: clamp dragged node + propagate clamp delta to descendants.
  if (!skipAncestorResize) {
    clampDraggedNodeToParent({
      node,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      descendantIds,
    });
  }

  // 5. skipClamp opt-in. Bypass the slice's clamp second-pass when:
  //    a) shift-drag (skipAncestorResize) — node needs to escape its container.
  //    b) dragging a container with descendants — children are rigidly
  //       translated; clamping would disturb their relative positions.
  const hasDescendants = descendantIds.length > 0;
  const skipClamp = skipAncestorResize || hasDescendants;

  // 6. Edge detection for the exit-indicator overlay.
  const exiting = detectExitingGroupId({ node, newX, newY, visibleNodes });

  return { positionUpdates, sizeUpdates, skipClamp, exiting };
}

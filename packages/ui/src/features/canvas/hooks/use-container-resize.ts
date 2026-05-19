/**
 * useContainerResize
 *
 * Owns the **container-resize half** (rf-canv-25a) of the
 * pre-extraction `useContainerResizing` hook the orchestrator
 * (`svg-canvas.tsx`) used to run inline:
 *
 *   1. `recalculateAncestorBounds(startNodeId, nodeStates)` — the thin
 *      `useCallback` wrapper around the rf-canv-4 pure util that walks
 *      up the parent chain, applying `calculateContainerBounds` at
 *      every level and pushing `{ id, position?, size? }` updates onto
 *      the result list.
 *   2. `calculateMinimumContainerSize(nodeId)` — computes the minimum
 *      `{ minWidth, minHeight }` for a container based on the bounding
 *      box of its children plus `CONTAINER_PAD`, clamped to
 *      `MIN_CONTAINER_WIDTH` / `MIN_CONTAINER_HEIGHT`. Returns the
 *      bare MIN floor when the node has no children or is missing.
 *   3. `handleNodeResize(id, newWidth, newHeight)` — clamps the
 *      requested size to the minimum, dispatches `resizeCardNode`,
 *      builds a `nodeStates` map carrying the resized node's pending
 *      state, then walks ancestors via `recalculateAncestorBounds` and
 *      dispatches `updateCardNodePosition` / `resizeCardNode` per
 *      returned ancestor entry.
 *
 * Behavior is preserved verbatim from the pre-rf-canv-25a inline form:
 *   - The `Math.max(minWidth, newWidth)` / `Math.max(minHeight, newHeight)`
 *     clamp shape.
 *   - The single `dispatch(resizeCardNode({ id, width, height }))` for
 *     the resized node BEFORE the ancestor walk.
 *   - The `nodeStates` map keyed by id, seeded with the resized node's
 *     `{ x, y, width: constrainedWidth, height: constrainedHeight }`.
 *   - The per-ancestor-update branches: `update.position` →
 *     `updateCardNodePosition`, `update.size` → `resizeCardNode`.
 *   - Missing-node short-circuit (`if (!node) return;`) before any
 *     dispatch.
 *
 * **Per blueprint risk #2** — the setState-during-drag concerns stay
 * OUT of this hook. `handleNodeMove` (which writes
 * `setExitingGroupId`) and `handleToggleFold` move into rf-canv-25b's
 * `use-container-move.ts`. Those handlers also consume
 * `recalculateAncestorBounds` and `calculateMinimumContainerSize`, so
 * the orchestrator keeps both in scope until the move-half lands.
 *
 * The orchestrator threads in:
 *   - `visibleNodes` — the LOD-filtered, parent-promoted node list
 *     used by the bound `recalculateAncestorBoundsUtil` and by
 *     `calculateMinimumContainerSize`'s child-bounds walk.
 *
 * rf-canv-25a.
 */

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { MIN_CONTAINER_WIDTH, MIN_CONTAINER_HEIGHT } from '../../../config/canvas-constants';
import { resizeCardNode, updateCardNodePosition } from '../../../store/slices/cards-slice';
import { recalculateAncestorBounds as recalculateAncestorBoundsUtil, CONTAINER_PAD } from '../utils/container-bounds';
import type { AppDispatch } from '../../../store';
import type { CanvasNode } from '../components/types';

export interface UseContainerResizeArgs {
  /** LOD-filtered, parent-promoted canvas nodes from the orchestrator. */
  visibleNodes: CanvasNode[];
}

export interface UseContainerResizeResult {
  /**
   * Thin wrapper around the rf-canv-4 `recalculateAncestorBounds` util
   * that binds `visibleNodes` so the caller only supplies the start
   * node and pending `nodeStates` map.
   */
  recalculateAncestorBounds: (
    startNodeId: string,
    nodeStates: Map<string, { x: number; y: number; width: number; height: number }>,
  ) => ReturnType<typeof recalculateAncestorBoundsUtil>;
  /**
   * Minimum size required for a container to encompass its children.
   * Returns `{ MIN_CONTAINER_WIDTH, MIN_CONTAINER_HEIGHT }` for nodes
   * with no children or when the node is missing.
   */
  calculateMinimumContainerSize: (nodeId: string) => { minWidth: number; minHeight: number };
  /**
   * Resize handler — clamps to minimum, dispatches `resizeCardNode` +
   * walks ancestors. No-op for unknown ids.
   */
  handleNodeResize: (id: string, newWidth: number, newHeight: number) => void;
}

export function useContainerResize(args: UseContainerResizeArgs): UseContainerResizeResult {
  const { visibleNodes } = args;
  const dispatch = useDispatch<AppDispatch>();

  // rf-canv-4: thin wrapper binding `visibleNodes` to the pure
  // recalculateAncestorBounds util.
  const recalculateAncestorBounds = useCallback(
    (startNodeId: string, nodeStates: Map<string, { x: number; y: number; width: number; height: number }>) =>
      recalculateAncestorBoundsUtil(visibleNodes, startNodeId, nodeStates),
    [visibleNodes],
  );

  // Calculate minimum size required for a container to fit its children
  const calculateMinimumContainerSize = useCallback(
    (nodeId: string): { minWidth: number; minHeight: number } => {
      const node = visibleNodes.find((n) => n.id === nodeId);
      const children = visibleNodes.filter((n) => n.parentId === nodeId);

      // If no children, use unified minimum
      if (!node || children.length === 0) {
        return { minWidth: MIN_CONTAINER_WIDTH, minHeight: MIN_CONTAINER_HEIGHT };
      }

      // Child positions are absolute, so convert to relative by subtracting parent position
      let maxRelativeRight = 0;
      let maxRelativeBottom = 0;

      for (const child of children) {
        const relativeX = child.x - node.x;
        const relativeY = child.y - node.y;
        maxRelativeRight = Math.max(maxRelativeRight, relativeX + child.width);
        maxRelativeBottom = Math.max(maxRelativeBottom, relativeY + child.height);
      }

      // Minimum size = children bounding box + padding
      const minWidth = Math.max(MIN_CONTAINER_WIDTH, maxRelativeRight + CONTAINER_PAD);
      const minHeight = Math.max(MIN_CONTAINER_HEIGHT, maxRelativeBottom + CONTAINER_PAD);

      return { minWidth, minHeight };
    },
    [visibleNodes],
  );

  // Handle resizing a node, then recursively update ancestors
  // Prevents resizing containers below the bounds of their children
  const handleNodeResize = useCallback(
    (id: string, newWidth: number, newHeight: number) => {
      const node = visibleNodes.find((n) => n.id === id);
      if (!node) return;

      // Check if this node has children (is a container)
      const { minWidth, minHeight } = calculateMinimumContainerSize(id);

      // Constrain resize to minimum bounds required by children
      const constrainedWidth = Math.max(minWidth, newWidth);
      const constrainedHeight = Math.max(minHeight, newHeight);

      // Resize the node with constrained dimensions
      dispatch(resizeCardNode({ id, width: constrainedWidth, height: constrainedHeight }));

      // Build a map of pending node states
      const nodeStates = new Map<string, { x: number; y: number; width: number; height: number }>();
      nodeStates.set(id, {
        x: node.x,
        y: node.y,
        width: constrainedWidth,
        height: constrainedHeight,
      });

      // Recursively calculate ancestor bounds
      const ancestorUpdates = recalculateAncestorBounds(id, nodeStates);

      // Apply ancestor updates
      for (const update of ancestorUpdates) {
        if (update.position) {
          dispatch(
            updateCardNodePosition({
              nodeId: update.id,
              x: update.position.x,
              y: update.position.y,
            }),
          );
        }
        if (update.size) {
          dispatch(resizeCardNode({ id: update.id, width: update.size.width, height: update.size.height }));
        }
      }
    },
    [visibleNodes, calculateMinimumContainerSize, recalculateAncestorBounds, dispatch],
  );

  return {
    recalculateAncestorBounds,
    calculateMinimumContainerSize,
    handleNodeResize,
  };
}

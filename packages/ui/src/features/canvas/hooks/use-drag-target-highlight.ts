/**
 * useDragTargetHighlight
 *
 * Owns the **drag-target highlight + reparent-on-Ctrl-drop** machinery
 * (rf-canv-26) the orchestrator (`svg-canvas.tsx`) used to run inline.
 *
 * Two callbacks + three pieces of state:
 *
 *   1. **State**
 *      - `exitingGroupId` — the parent-group id whose orange "exit"
 *        indicator should light up while the user shift-drags a child
 *        away from its current parent. Per blueprint risk #2 the setter
 *        is also threaded UP to rf-canv-25b's `useContainerMove` so the
 *        drag-time edge detection there stays in sync with this hook's
 *        rubber-band detection. Returned from this hook so the
 *        orchestrator can pass `setExitingGroupId` to `useContainerMove`.
 *      - `dragOverGroupId` — the (smallest, most-specific) container the
 *        user is currently hovering over while shift-dragging — used by
 *        the green "drop here" highlight overlay.
 *      - `shiftDraggingNodeIds` — the full set of node ids being shift-
 *        dragged in this gesture (the dragged node + every other selected
 *        node). Drives the lift-style border + shadow on the rendered
 *        nodes.
 *
 *   2. **`handleDragOverGroup(_groupId, draggedNodeId?, centerX?, centerY?)`**
 *      Called every frame by `useCanvasInteractions` while the user
 *      shift-drags. Steps:
 *        a) `draggedNodeId == null` (gesture ended) → clear all three
 *           pieces of state.
 *        b) Build `draggedIds = selectedNodes ∪ {draggedNodeId}` and write
 *           it to `shiftDraggingNodeIds` so every selected node gets the
 *           lift highlight.
 *        c) Find the FIRST `exitingParent` — a parent of any dragged node
 *           that is itself NOT in the dragged set. Used so the orange
 *           indicator follows wherever the gesture is "leaving from."
 *        d) When the caller supplies a center point, run a smallest-
 *           container hit-test at `(centerX, centerY)` excluding:
 *             - the dragged nodes,
 *             - every descendant (visible-tree) of any dragged node,
 *             - the current parent (shift-drag means "move to a NEW
 *               parent" — without this exclusion, dropping inside the
 *               current parent's bounds would re-pick the same parent and
 *               no reparent would happen).
 *           The result becomes `dragOverGroupId`.
 *        e) Final state-write rule — **green takes priority**: if a valid
 *           target was found, clear `exitingGroupId`; otherwise show the
 *           exit indicator on the source parent.
 *
 *   3. **`handleDragEnd(itemId, x, y, forceReparent?)`**
 *      Called by `useCanvasInteractions` when the gesture ends. Steps:
 *        a) `forceReparent === false` (regular drag, no Ctrl/Cmd) → clear
 *           all three pieces of state and return WITHOUT touching the
 *           parent. Normal drags never reparent.
 *        b) Re-run the smallest-container hit-test at the dragged node's
 *           center, with the same exclusion rule as above. Validate
 *           containment via `canContain` for non-`'container'` parents
 *           (groups bypass the validator since they accept anything).
 *        c) If the parent actually changed, dispatch
 *           `updateCardNodeParent({ nodeId, parentId })`.
 *        d) **Post-reparent ancestor expansion** (per-edge overflow):
 *           after the reparent, expand the new parent so the child fits
 *           inside. The dropped node's expanded height is recovered from
 *           Redux (`reduxNode.height`) and floored against
 *           `computeCompactNodeHeight(...)`, so a folded node still gets
 *           enough room when later unfolded. Each of the four edges
 *           (left/top/right/bottom) is tested independently; matching
 *           overflow shifts the parent's position and grows its
 *           dimensions. After expansion both `pw` and `ph` are clamped
 *           to `MIN_CONTAINER_WIDTH/HEIGHT`. This block has the SAME
 *           shape as `useContainerMove`'s ancestor-expansion walk — see
 *           the rf-canv-25b learning `min-container-floor-silently-masks-
 *           per-edge-expansion-deltas-in-tests` and pick test fixtures
 *           comfortably above the MIN floor.
 *        e) Always clear all three pieces of state at the end.
 *
 * The orchestrator threads in:
 *   - `visibleNodes` — the LOD-filtered, parent-promoted node list used
 *     for hit-testing, parent lookups, sibling-bbox walks.
 *   - `nodes` — the raw Redux node list, read by the post-reparent block
 *     to recover the dropped node's expanded (un-folded) height.
 *   - `selectedNodes` — for shift-drag we track every selected node so
 *     the highlight follows multi-selects.
 *   - `getDescendantIds` — the orchestrator's pure-walk wrapper that
 *     follows the parentId chain across `visibleNodes`. Used to expand
 *     the exclusion set so a parent never "drops onto itself" via one of
 *     its own descendants.
 *
 * Behavior is preserved verbatim from the pre-rf-canv-26 inline form.
 * The post-reparent expansion block has the SAME per-edge overflow shape
 * as `useContainerMove`'s walk and `handleToggleFold`'s walk — DO NOT
 * consolidate to `expandToFitChildren` from rf-canv-4 (subtly different
 * padding semantics per blueprint risk #2).
 *
 * rf-canv-26.
 */

import { useCallback, useState } from 'react';
import { useDispatch } from 'react-redux';
import { MIN_CONTAINER_WIDTH, MIN_CONTAINER_HEIGHT } from '../../../config/canvas-constants';
import { canContain } from '../../../config/containment-rules';
import {
  updateCardNodePositions,
  resizeCardNode,
  updateCardNodeParent,
  type CardNode,
} from '../../../store/slices/cards-slice';
import { computeCompactNodeHeight } from '../components/nodes/compact-node';
import { CONTAINER_HEADER_H, CONTAINER_PAD } from '../utils/container-bounds';
import { findSmallestContainerHit } from '../utils/drop-target';
import { isContainerNode as isContainerNodeUtil } from '../utils/node-classification';
import type { AppDispatch } from '../../../store';
import type { CanvasNode } from '../components/types';

export interface UseDragTargetHighlightArgs {
  /** LOD-filtered, parent-promoted canvas nodes from the orchestrator. */
  visibleNodes: CanvasNode[];
  /**
   * Raw Redux nodes — read by the post-reparent expansion to recover the
   * dropped node's stored expanded height (so a folded drop still gets
   * enough room when later unfolded).
   */
  nodes: CardNode[];
  /** Currently selected node ids — every one gets the shift-drag highlight. */
  selectedNodes: string[];
  /**
   * Pure-walk wrapper that follows `parentId` across `visibleNodes`. Used
   * to expand the hit-test exclusion set so a parent never drops onto
   * one of its own descendants.
   */
  getDescendantIds: (nodeId: string) => string[];
}

export interface UseDragTargetHighlightResult {
  /** Parent-group id with active orange exit indicator (or null). */
  exitingGroupId: string | null;
  /** Smallest container under the drag center with active green hover (or null). */
  dragOverGroupId: string | null;
  /** All node ids currently being shift-dragged (drives the lift highlight). */
  shiftDraggingNodeIds: Set<string>;
  /**
   * Setter for `exitingGroupId` exposed so rf-canv-25b's `useContainerMove`
   * can flip the indicator directly from drag-time edge detection. Per
   * blueprint risk #2 — both hooks need to read/write this so they stay
   * in sync.
   */
  setExitingGroupId: (id: string | null) => void;
  /** Drag-over handler — runs during shift-drag, updates the three state pieces. */
  handleDragOverGroup: (
    _groupId: string | null,
    draggedNodeId?: string | null,
    centerX?: number,
    centerY?: number,
  ) => void;
  /**
   * Drag-end handler — re-parents the dragged node only when `forceReparent`
   * is true (Ctrl/Cmd held). Always clears the three state pieces at the end.
   */
  handleDragEnd: (itemId: string, x: number, y: number, forceReparent?: boolean) => void;
}

export function useDragTargetHighlight(args: UseDragTargetHighlightArgs): UseDragTargetHighlightResult {
  const { visibleNodes, nodes, selectedNodes, getDescendantIds } = args;
  const dispatch = useDispatch<AppDispatch>();

  // Track which group has a child being dragged near its edge (exit indicator).
  // Per blueprint risk #2 the setter is exposed UP to rf-canv-25b's
  // `useContainerMove` so the hook there can flip the indicator from its
  // own edge-detection without owning the state itself.
  const [exitingGroupId, setExitingGroupId] = useState<string | null>(null);
  // Track which group is being hovered during drag (for visual feedback)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  // Track all nodes being Shift-dragged (reparent mode) — for visual highlight
  const [shiftDraggingNodeIds, setShiftDraggingNodeIds] = useState<Set<string>>(new Set());

  // Check if a node is a container type
  const isContainerNode = useCallback((node: CanvasNode) => isContainerNodeUtil(node), []);

  // Handle drag-over group detection + shift-drag visual state.
  // Uses the same smallest-container search as handleDragEnd so highlighting
  // matches the actual drop target at every nesting level.
  const handleDragOverGroup = useCallback(
    (_groupId: string | null, draggedNodeId?: string | null, centerX?: number, centerY?: number) => {
      // When Shift-drag ends (draggedNodeId becomes null), clear everything
      if (!draggedNodeId) {
        setShiftDraggingNodeIds(new Set());
        setExitingGroupId(null);
        setDragOverGroupId(null);
        return;
      }

      // Track all selected nodes being Shift-dragged (for highlight effect)
      const draggedIds = new Set(selectedNodes);
      draggedIds.add(draggedNodeId);
      setShiftDraggingNodeIds(draggedIds);

      // Find the parent group that dragged nodes are leaving
      let exitingParent: string | null = null;
      for (const nodeId of draggedIds) {
        const node = visibleNodes.find((n) => n.id === nodeId);
        if (node?.parentId && !draggedIds.has(node.parentId)) {
          exitingParent = node.parentId;
          break;
        }
      }

      // Find the best (smallest) container at the drag center position,
      // excluding dragged nodes, their descendants, and the current parent.
      // This mirrors the exact logic in handleDragEnd so the highlight always
      // matches what will actually happen on drop.
      let resolvedTargetId: string | null = null;

      if (centerX !== undefined && centerY !== undefined) {
        // Build full exclusion set: dragged nodes + all their descendants +
        // the current parent (Shift-drag means "move to a NEW parent").
        const excludeIds = new Set(draggedIds);
        for (const id of draggedIds) {
          for (const desc of getDescendantIds(id)) {
            excludeIds.add(desc);
          }
        }
        if (exitingParent) excludeIds.add(exitingParent);

        const hit = findSmallestContainerHit(visibleNodes, centerX, centerY, isContainerNode, excludeIds);
        resolvedTargetId = hit?.id ?? null;
      }

      setDragOverGroupId(resolvedTargetId);

      // Show orange exit indicator on parent group when dragging out,
      // but not when hovering over a different valid target (green takes priority)
      setExitingGroupId(resolvedTargetId ? null : exitingParent);
    },
    [visibleNodes, selectedNodes, isContainerNode, getDescendantIds],
  );

  // Handle drag end — re-parent node only when Ctrl/Cmd is held.
  // Normal drag: node stays at current parent (or becomes top-level if dragged out).
  // Ctrl/Cmd + drag: explicitly reparent into the container at drop position.
  const handleDragEnd = useCallback(
    (itemId: string, x: number, y: number, forceReparent?: boolean) => {
      const draggedNode = visibleNodes.find((n) => n.id === itemId);
      if (!draggedNode) return;

      let bestContainer: CanvasNode | null = null;

      // Only search for a container when Shift is held (explicit reparent)
      if (forceReparent) {
        const centerX = x + draggedNode.width / 2;
        const centerY = y + draggedNode.height / 2;

        // Find the best container at the drop position. Exclude the dragged
        // node, its descendants, all other selected nodes (multi-drag), and
        // the dragged node's current parent (Shift-drag means "move to a NEW
        // parent" — without this, dropping a child within the parent's bounds
        // would re-select the same parent and no reparent happens).
        const descendantIds = new Set(getDescendantIds(itemId));
        descendantIds.add(itemId);
        for (const id of selectedNodes) {
          descendantIds.add(id);
        }
        const currentParent = draggedNode.parentId || null;
        if (currentParent) descendantIds.add(currentParent);

        bestContainer = findSmallestContainerHit(visibleNodes, centerX, centerY, isContainerNodeUtil, descendantIds);
      }

      // Without Ctrl/Cmd, keep the node's current parent — no reparenting on normal drag
      if (!forceReparent) {
        setDragOverGroupId(null);
        setExitingGroupId(null);
        setShiftDraggingNodeIds(new Set());
        return;
      }

      const currentParentId = draggedNode.parentId || null;
      const newParentId = bestContainer?.id || null;

      // Only re-parent if the parent actually changed
      if (currentParentId !== newParentId) {
        // Validate containment if there's a new parent
        if (newParentId && bestContainer) {
          const parentIceType = (bestContainer.data.iceType as string) || '';
          const childIceType = (draggedNode.data.iceType as string) || '';
          // For groups, allow anything. For blocks/VPCs, validate via canContain.
          if (bestContainer.type !== 'container') {
            if (!canContain(parentIceType, childIceType)) {
              return; // Invalid containment, don't re-parent
            }
          }
        }

        dispatch(updateCardNodeParent({ nodeId: itemId, parentId: newParentId }));

        // After reparenting, expand the new parent to encompass the child.
        // Uses the stored (expanded) height for the dropped node — not the visual
        // (folded) height — so the container is large enough when the node is unfolded.
        if (newParentId && bestContainer) {
          // Get the full expanded height from Redux (not the visual folded height)
          const reduxNode = nodes.find((n: any) => n.id === itemId);
          const droppedIceType = (draggedNode.data?.iceType as string) || '';
          const droppedIsGroup = draggedNode.type === 'container' || droppedIceType.startsWith('Group.');
          const droppedIsBlock = draggedNode.type === 'block';
          const droppedDefaultH = computeCompactNodeHeight(
            draggedNode.data as Record<string, unknown>,
            droppedIsGroup || droppedIsBlock,
            false,
          );
          const droppedExpandedH = Math.max(reduxNode?.height || 0, droppedDefaultH);

          const existingChildren = visibleNodes.filter((n) => n.parentId === newParentId);

          // Compute bounding box including the dropped node at its expanded size
          let childMinX = x;
          let childMinY = y;
          let childMaxR = x + draggedNode.width;
          let childMaxB = y + droppedExpandedH;

          for (const child of existingChildren) {
            childMinX = Math.min(childMinX, child.x);
            childMinY = Math.min(childMinY, child.y);
            childMaxR = Math.max(childMaxR, child.x + child.width);
            childMaxB = Math.max(childMaxB, child.y + child.height);
          }

          // Per-edge overflow expansion (same logic as handleNodeMove)
          let px = bestContainer.x;
          let py = bestContainer.y;
          let pw = bestContainer.width;
          let ph = bestContainer.height;
          let changed = false;

          const overflowL = px + CONTAINER_PAD - childMinX;
          if (overflowL > 0) {
            px -= overflowL;
            pw += overflowL;
            changed = true;
          }

          const overflowT = py + CONTAINER_PAD + CONTAINER_HEADER_H - childMinY;
          if (overflowT > 0) {
            py -= overflowT;
            ph += overflowT;
            changed = true;
          }

          const overflowR = childMaxR - (px + pw - CONTAINER_PAD);
          if (overflowR > 0) {
            pw += overflowR;
            changed = true;
          }

          const overflowB = childMaxB - (py + ph - CONTAINER_PAD);
          if (overflowB > 0) {
            ph += overflowB;
            changed = true;
          }

          if (changed) {
            pw = Math.max(MIN_CONTAINER_WIDTH, pw);
            ph = Math.max(MIN_CONTAINER_HEIGHT, ph);
            dispatch(updateCardNodePositions([{ id: newParentId, position: { x: px, y: py } }]));
            dispatch(resizeCardNode({ id: newParentId, width: pw, height: ph }));
          }
        }
      }

      setDragOverGroupId(null);
      setExitingGroupId(null);
      setShiftDraggingNodeIds(new Set());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nodes/selectedNodes accessed via visibleNodes
    [visibleNodes, getDescendantIds, dispatch],
  );

  return {
    exitingGroupId,
    dragOverGroupId,
    shiftDraggingNodeIds,
    setExitingGroupId,
    handleDragOverGroup,
    handleDragEnd,
  };
}

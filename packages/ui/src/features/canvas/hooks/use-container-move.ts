/**
 * useContainerMove
 *
 * Owns the **drag-time + fold-time half** (rf-canv-25b) of the
 * pre-extraction `useContainerResizing` hook the orchestrator
 * (`svg-canvas.tsx`) used to run inline:
 *
 *   1. `handleNodeMove(id, newX, newY, skipAncestorResize?)` — translates
 *      the dragged node + descendants, expands ancestors, clamps to the
 *      expanded parent (BND-1/BND-3), dispatches positions/sizes, and
 *      flips the exit-indicator group id.
 *
 *   2. `handleToggleFold(nodeId)` — toggles the slice flag, then on
 *      UNFOLD expands self to encompass children (or recovers stored
 *      expanded height) and walks ancestors. Folding is a no-op beyond
 *      the slice toggle.
 *
 * **Per blueprint risk #2** — `setExitingGroupId` is the rf-canv-25b/26
 * coupling point. The state itself stays in the orchestrator
 * (`svg-canvas.tsx`'s `useState<string | null>(null)`) until rf-canv-26
 * lifts it into `useDragTargetHighlight`; this hook receives the setter
 * as a callback prop so the move-half stays loosely coupled to the
 * future highlight-ownership decision.
 *
 * **rf-cmove series (P3 cohort 6) — internal decomposition.** The
 * pre-extraction body (564 LOC, two large `useCallback` blocks) was
 * split into pure runners + helpers under `./container-move/`:
 *
 *   - `container-move/types.ts` — PositionUpdate / SizeUpdate.
 *   - `container-move/ancestor-expansion.ts` — `walkAncestorsAndExpand`
 *     and `expandAncestorOnce`, the per-edge child-overflow → parent-grow
 *     walk-step shared between both handlers (parameterized over how
 *     each handler reads sibling bounds).
 *   - `container-move/clamp.ts` — `clampDraggedNodeToParent` (BND-1/BND-3)
 *     + `detectExitingGroupId` (tri-state setter directive).
 *   - `container-move/move-runner.ts` — `runNodeMove` pure runner.
 *   - `container-move/toggle-fold-runner.ts` — `resolveToggleFoldDecision`
 *     + `runUnfoldExpansion` pure runner pair.
 *
 * The orchestrator hook (this file) is now a thin shell:
 *   - reads orchestrator-supplied args (visibleNodes, canvasNodes, ...)
 *   - calls the runners
 *   - dispatches the resulting payloads
 *   - invokes `setExitingGroupId` per the runner's tri-state directive
 *
 * Behavior is preserved verbatim from the rf-canv-25b form. The four
 * ancestor-expansion sites in this codebase (handleNodeMove walk,
 * handleToggleFold walk, plus the two outside this hook in handleDragEnd's
 * reparent branch) have subtly different rules per blueprint risk #2 —
 * DO NOT consolidate to `expandToFitChildren` from rf-canv-4.
 *
 * rf-canv-25b → rf-cmove-3.
 */

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { runNodeMove } from './container-move/move-runner';
import { resolveToggleFoldDecision, runUnfoldExpansion } from './container-move/toggle-fold-runner';
import {
  updateCardNodePositions,
  resizeCardNode,
  toggleCardNodeFold,
  type CardNode,
} from '../../../store/slices/cards-slice';
import type { AppDispatch } from '../../../store';
import type { CanvasNode } from '../components/types';

export interface UseContainerMoveArgs {
  /** LOD-filtered, parent-promoted canvas nodes from the orchestrator. */
  visibleNodes: CanvasNode[];
  /**
   * Full (unfiltered) canvas-shape nodes — needed so
   * `handleToggleFold`'s self-expansion can see children at their real
   * positions (visibleNodes carries the folded 38px height for any
   * folded ancestor, which would corrupt the per-edge overflow math).
   */
  canvasNodes: CanvasNode[];
  /**
   * Raw Redux nodes — read by `handleToggleFold` to recover the stored
   * expanded height of a no-children node on unfold. Typed as `CardNode[]`
   * (from `cards-slice`), the same shape `card.nodes` carries on the
   * orchestrator. The handler reads `.height` only.
   */
  nodes: CardNode[];
  /**
   * Pure-walk wrapper that follows `parentId` across `canvasNodes` —
   * NOT `visibleNodes` — so hidden L1 children translate with their
   * parent on drag.
   */
  getAllDescendantIds: (nodeId: string) => string[];
  /**
   * Setter for the exit-indicator group id. Per blueprint risk #2 the
   * state lives in the orchestrator until rf-canv-26 lifts it into
   * `useDragTargetHighlight`; this hook is intentionally agnostic to
   * who owns it.
   */
  setExitingGroupId: (id: string | null) => void;
}

export interface UseContainerMoveResult {
  /**
   * Drag handler — translates node + descendants, expands ancestors,
   * clamps to expanded parent, dispatches positions/sizes, and updates
   * the exit-indicator group id. `skipAncestorResize` (Shift+drag /
   * reparent mode) skips the ancestor walk + clamp.
   */
  handleNodeMove: (id: string, newX: number, newY: number, skipAncestorResize?: boolean) => void;
  /**
   * Fold/unfold handler — toggles the slice flag, then on UNFOLD
   * expands self to encompass children (or recovers stored expanded
   * height) and walks ancestors. Folding is a no-op beyond the toggle.
   */
  handleToggleFold: (nodeId: string) => void;
}

export function useContainerMove(args: UseContainerMoveArgs): UseContainerMoveResult {
  const { visibleNodes, canvasNodes, nodes, getAllDescendantIds, setExitingGroupId } = args;
  const dispatch = useDispatch<AppDispatch>();

  // Drag handler. `skipAncestorResize` is the Shift+drag (reparent mode)
  // opt-out for both the ancestor walk AND the post-walk clamp.
  const handleNodeMove = useCallback(
    (id: string, newX: number, newY: number, skipAncestorResize?: boolean) => {
      const result = runNodeMove({
        id,
        newX,
        newY,
        skipAncestorResize: !!skipAncestorResize,
        visibleNodes,
        canvasNodes,
        getAllDescendantIds,
      });
      if (!result) return;

      const { positionUpdates, sizeUpdates, skipClamp, exiting } = result;

      dispatch(updateCardNodePositions(skipClamp ? { updates: positionUpdates, skipClamp: true } : positionUpdates));
      for (const su of sizeUpdates) {
        dispatch(resizeCardNode(su));
      }

      if (exiting.call) {
        setExitingGroupId(exiting.value);
      }
    },
    [visibleNodes, canvasNodes, getAllDescendantIds, dispatch, setExitingGroupId],
  );

  // Fold/unfold handler. The slice toggle fires unconditionally (even
  // for missing-node ids — the slice handles the stale id) BEFORE any
  // expansion work runs, mirroring the rf-canv-25b ordering.
  const handleToggleFold = useCallback(
    (nodeId: string) => {
      const decision = resolveToggleFoldDecision({ nodeId, visibleNodes });
      if (!decision) {
        dispatch(toggleCardNodeFold(nodeId));
        return;
      }

      dispatch(toggleCardNodeFold(nodeId));

      // Folding is a no-op beyond the slice toggle.
      if (!decision.wasFolded) return;

      const { positionUpdates, sizeUpdates } = runUnfoldExpansion({
        node: decision.node,
        canvasNodes,
        visibleNodes,
        nodes,
      });

      if (positionUpdates.length > 0) {
        dispatch(updateCardNodePositions(positionUpdates));
      }
      for (const su of sizeUpdates) {
        dispatch(resizeCardNode(su));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canvasNodes derived from visibleNodes
    [visibleNodes, dispatch],
  );

  return {
    handleNodeMove,
    handleToggleFold,
  };
}

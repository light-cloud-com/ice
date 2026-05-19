/**
 * useCanvasTraversal
 *
 * Bundles the three node-set traversal callbacks the canvas orchestrator
 * exposes to its sibling sub-hooks:
 *
 *  - `getDescendantIds(nodeId)`     — descendants in `visibleNodes`,
 *                                      consumed by `useDragTargetHighlight`
 *                                      for shift-drag rubber-band selection
 *                                      and reparent-on-Ctrl-drop checks.
 *  - `getAllDescendantIds(nodeId)`  — descendants in `canvasNodes` (i.e.
 *                                      INCLUDING hidden block children),
 *                                      consumed by `useContainerMove` so a
 *                                      Level-1 group drag carries its
 *                                      hidden subtree along verbatim.
 *  - `findContainerAtPosition(x,y)` — point-in-rect container hit-test
 *                                      bound to `visibleNodes`, with the
 *                                      verbatim L1635 inline predicate
 *                                      (containment-rules `isContainer`
 *                                      OR iceType startsWith `Group.` OR
 *                                      `Network.`). Consumed by
 *                                      `useCanvasDrop` for palette-drop
 *                                      target resolution.
 *
 * Behavior preserved verbatim from the inline `useCallback` cluster
 * previously in `svg-canvas.tsx` L338-577 (rf-canv2-2).
 *
 * NOTE: a fourth traversal callback — `hasCollapsedAncestor` — exists in
 * the orchestrator's surface but is purely internal to the canvas-data
 * memos (effectiveNodes / canvasItems / sortedNodes), so it's owned by
 * `useCanvasData` rather than this hook. See the rf-canv2-1 head comment
 * for the rationale.
 *
 * rf-canv2-2.
 */

import { useCallback } from 'react';
import { isContainer } from '../../../config/containment-rules';
import { descendants } from '../utils/folded-remap';
import { findContainerAtPosition as findContainerAtPositionUtil } from '../utils/drop-target';
import type { CanvasNode } from '../components/types';

export interface UseCanvasTraversalArgs {
  visibleNodes: CanvasNode[];
  canvasNodes: CanvasNode[];
}

export interface UseCanvasTraversalResult {
  /**
   * Descendants of `nodeId` searched in `visibleNodes` only. Used by box
   * selection and reparenting paths where hidden children should not be
   * pulled along.
   */
  getDescendantIds: (nodeId: string) => string[];
  /**
   * Descendants of `nodeId` searched in `canvasNodes` (the full set,
   * including hidden block children). Used by `handleNodeMove` so a
   * Level-1 group drag carries its hidden subtree.
   */
  getAllDescendantIds: (nodeId: string) => string[];
  /**
   * Point-in-rect container hit-test. Returns the smallest visible container
   * whose bounds enclose `(x, y)`, where "container" means: passes the
   * containment-rules `isContainer` predicate, OR has an iceType starting
   * with `Group.` or `Network.`. Verbatim from the rf-canv2-pre L1635
   * inline rule.
   */
  findContainerAtPosition: (x: number, y: number) => CanvasNode | null;
}

export function useCanvasTraversal(args: UseCanvasTraversalArgs): UseCanvasTraversalResult {
  const { visibleNodes, canvasNodes } = args;

  // Get descendant IDs from VISIBLE nodes only (for box selection, reparenting).
  // Thin wrapper binding to the pure descendants() walk.
  const getDescendantIds = useCallback(
    (nodeId: string): string[] => descendants(visibleNodes, nodeId),
    [visibleNodes],
  );

  // Get ALL descendant IDs including hidden children (searches canvasNodes, not visibleNodes).
  // Used by handleNodeMove so hidden block children at L1 move with their parent.
  const getAllDescendantIds = useCallback(
    (nodeId: string): string[] => descendants(canvasNodes, nodeId),
    [canvasNodes],
  );

  // Find container at position for drop handling. Predicate matches the
  // verbatim L1635 inline rule: containment-rules `isContainer`, plus any
  // iceType beginning with `Group.` or `Network.` (broader than the
  // node-classification `isContainerNode` predicate other sites use).
  const findContainerAtPosition = useCallback(
    (x: number, y: number): CanvasNode | null =>
      findContainerAtPositionUtil(visibleNodes, x, y, (n) => {
        const iceType = (n.data.iceType as string) || '';
        return isContainer(iceType) || iceType.startsWith('Group.') || iceType.startsWith('Network.');
      }),
    [visibleNodes],
  );

  return {
    getDescendantIds,
    getAllDescendantIds,
    findContainerAtPosition,
  };
}

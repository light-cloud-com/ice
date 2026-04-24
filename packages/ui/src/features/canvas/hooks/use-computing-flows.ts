/**
 * useComputingFlows — reactive property propagation hook.
 *
 * Single hook that replaces all ad-hoc propagation effects in svg-canvas.tsx.
 * On every nodes/edges change:
 *   1. Runs computeDerived() to get the desired derived state
 *   2. Diffs against current values (prevents infinite loops)
 *   3. Dispatches only changed patches to Redux
 *
 * Max 2 render cycles per change: compute → dispatch → compute → no-op.
 */

import { computeDerived, diffPatches } from '@ice/core/compute';
import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectActiveCard,
  updateCardNodeData,
  updateCardEdgeData,
  deleteCardEdge,
} from '../../../store/slices/cards-slice';
import type { PropagationNode, PropagationEdge } from '@ice/core/compute';

export function useComputingFlows() {
  const dispatch = useDispatch();
  const activeCard = useSelector(selectActiveCard);
  const nodes = activeCard?.nodes;
  const edges = activeCard?.edges;

  // Track whether we're currently dispatching to avoid re-entrance
  const isDispatching = useRef(false);

  useEffect(() => {
    if (!nodes || !edges || nodes.length === 0) return;
    if (isDispatching.current) return;

    // Map CardNode/CardEdge to the minimal PropagationNode/PropagationEdge shape
    const propNodes: PropagationNode[] = nodes.map((n) => ({
      id: n.id,
      type: n.type,
      parentId: n.parentId,
      data: n.data,
    }));

    const propEdges: PropagationEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      data: e.data as PropagationEdge['data'],
    }));

    // Compute all derived properties
    const rawPatches = computeDerived(propNodes, propEdges);

    // Diff against current state — only dispatch what actually changed
    const patches = diffPatches(rawPatches, propNodes, propEdges);

    const hasWork =
      patches.nodePatches.length > 0 ||
      patches.edgePatches.length > 0 ||
      patches.edgeDeletions.length > 0;

    if (!hasWork) return;

    isDispatching.current = true;

    // Apply edge deletions first (orphan cleanup)
    for (const del of patches.edgeDeletions) {
      dispatch(deleteCardEdge(del.edgeId));
    }

    // Apply edge patches (routeId backfill)
    for (const patch of patches.edgePatches) {
      dispatch(updateCardEdgeData({ edgeId: patch.edgeId, data: patch.data }));
    }

    // Apply node patches (property propagation)
    for (const patch of patches.nodePatches) {
      dispatch(updateCardNodeData({ nodeId: patch.nodeId, data: patch.data }));
    }

    // Release the guard after a microtask to allow Redux to settle
    // before the next useEffect run can trigger.
    Promise.resolve().then(() => {
      isDispatching.current = false;
    });
  }, [nodes, edges, dispatch]);
}

/**
 * useRenderCtx
 *
 * Bundles the eighteen-field `RenderCtx` object the per-node renderer
 * dispatch consumes. The orchestrator previously assembled this inline
 * (rf-canv-12 originally moved the dispatch off-orchestrator but kept
 * the ctx-construction site as an inline literal).
 *
 * The only computed field is `getConnectedPipelineStatuses`, which
 * binds the pure util to the live `card` + `pipelineNodeStatus` slot
 * so renderers can call it as a single-arg function (per rf-canv2-5).
 * Every other field is a verbatim pass-through.
 *
 * No memoization — the hook recomputes on every render, matching the
 * inline-literal behavior. Memoizing would require a 17-element dep
 * array; the cost of a tiny object allocation per render is lower
 * than the deps-tracking overhead.
 *
 * rf-svgcv2-4.
 */

import { getConnectedPipelineStatuses } from '../utils/get-connected-pipeline-statuses';
import type { Card } from '../../../store/slices/cards-slice';
import type { RenderCtx } from '../components/canvas-renderer/node-renderer-registry';
import type { CanvasNode } from '../components/types';

/** Args passed through to the inline RenderCtx fields, plus the
 *  orchestrator-level state (`card`, `viewport.zoom`) needed to bind
 *  `getConnectedPipelineStatuses`. */
export interface UseRenderCtxArgs {
  // Pass-through to RenderCtx
  sortedNodes: RenderCtx['sortedNodes'];
  selectedNodes: RenderCtx['selectedNodes'];
  lod: RenderCtx['lod'];
  pipelineNodeStatus: RenderCtx['pipelineNodeStatus'];
  dragOverGroupId: RenderCtx['dragOverGroupId'];
  exitingGroupId: RenderCtx['exitingGroupId'];
  renamingNodeId: RenderCtx['renamingNodeId'];
  connectionDragTargets: RenderCtx['connectionDragTargets'];
  nodeValidationMap: RenderCtx['nodeValidationMap'];
  handleToggleFold: RenderCtx['handleToggleFold'];
  handleNodeHover: RenderCtx['handleNodeHover'];
  handleNodeDoubleClick: RenderCtx['handleNodeDoubleClick'];
  handleRenameCommit: RenderCtx['handleRenameCommit'];
  handleRenameCancel: RenderCtx['handleRenameCancel'];
  handleUpdateNodeData: RenderCtx['handleUpdateNodeData'];
  handlePipelineClick: RenderCtx['handlePipelineClick'];

  // Used for binding getConnectedPipelineStatuses
  zoom: number;
  card: Card | undefined;
}

export function useRenderCtx(args: UseRenderCtxArgs): RenderCtx {
  const {
    sortedNodes,
    selectedNodes,
    lod,
    zoom,
    pipelineNodeStatus,
    dragOverGroupId,
    exitingGroupId,
    renamingNodeId,
    connectionDragTargets,
    nodeValidationMap,
    handleToggleFold,
    handleNodeHover,
    handleNodeDoubleClick,
    handleRenameCommit,
    handleRenameCancel,
    handleUpdateNodeData,
    handlePipelineClick,
    card,
  } = args;

  return {
    sortedNodes,
    selectedNodes,
    lod,
    zoom,
    pipelineNodeStatus,
    dragOverGroupId,
    exitingGroupId,
    renamingNodeId,
    connectionDragTargets,
    nodeValidationMap,
    handleToggleFold,
    handleNodeHover,
    handleNodeDoubleClick,
    handleRenameCommit,
    handleRenameCancel,
    handleUpdateNodeData,
    handlePipelineClick,
    // The util's signature requires non-undefined values per key; the
    // RenderCtx record allows undefined as a sentinel for "no status
    // yet". Cast at the boundary — the util is undefined-tolerant in
    // practice (it does an `?? 'idle'` when reading the slot).
    getConnectedPipelineStatuses: (node: CanvasNode) =>
      getConnectedPipelineStatuses(
        node,
        card,
        pipelineNodeStatus as Parameters<typeof getConnectedPipelineStatuses>[2],
      ),
  };
}

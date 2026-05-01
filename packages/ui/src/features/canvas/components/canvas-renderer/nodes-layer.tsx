/**
 * NodesLayer
 *
 * The nodes-layer JSX block previously inlined in svg-canvas.tsx
 * (rf-canv2-7). Walks `sortedNodes`, builds the per-node
 * NodeLiftWrapper outer key from the same priority chain documented in
 * rf-canv-10 (lifted → bare id, parentId → clipped-id, animating →
 * anim-id, else per-call-site innerKey), and dispatches the per-node
 * renderer via `renderCanvasNode(node, renderCtx)`.
 *
 * The wrapper's behavior is preserved verbatim — no key rewrites, no
 * dep-shape changes. The only change vs the inline form is the
 * wrap-as-component split itself.
 *
 * rf-canv2-7.
 */

import React, { type CSSProperties } from 'react';
import { NodeLiftWrapper } from './lift-wrapper';
import { renderCanvasNode, type RenderCtx } from './node-renderer-registry';
import type { CanvasNode } from '../types';

export interface NodesLayerProps {
  sortedNodes: CanvasNode[];
  animatingNodes: Record<string, number>;
  shiftDraggingNodeIds: Set<string>;
  dragOverGroupId: string | null;
  renderCtx: RenderCtx;
}

export const NodesLayer: React.FC<NodesLayerProps> = ({
  sortedNodes,
  animatingNodes,
  shiftDraggingNodeIds,
  dragOverGroupId,
  renderCtx,
}) => {
  return (
    <g className="nodes-layer">
      {sortedNodes.map((node) => {
        // Entrance animation for AI-generated nodes
        const animDelay = animatingNodes[node.id];
        const isAnimating = animDelay !== undefined;
        const animStyle: CSSProperties | undefined = isAnimating
          ? {
              animation: `ice-node-entrance 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${animDelay}ms both`,
              transformOrigin: `${node.x + node.width / 2}px ${node.y + node.height / 2}px`,
            }
          : undefined;

        // Shift-drag highlight: colored border + shadow for all dragged nodes
        const isLifted = shiftDraggingNodeIds.has(node.id);

        const { element, innerKey } = renderCanvasNode(node, renderCtx);

        // Wrapper key derivation — mirrors the original `wrapLift` outer-key
        // priority chain so React reconciliation behavior is preserved when
        // the (isLifted, parentId, isAnimating) tuple changes between renders.
        // Falls back to the per-call-site inner key (e.g. `${id}-lod${lod}`)
        // when no wrapper-level branch applies (rf-canv-10).
        const wrapperKey = isLifted
          ? node.id
          : node.parentId
            ? `clipped-${node.id}`
            : isAnimating
              ? `anim-${node.id}`
              : innerKey;

        return (
          <NodeLiftWrapper
            key={wrapperKey}
            node={node}
            isAnimating={isAnimating}
            animStyle={animStyle}
            isLifted={isLifted}
            dragOverGroupId={dragOverGroupId}
          >
            {element}
          </NodeLiftWrapper>
        );
      })}
    </g>
  );
};

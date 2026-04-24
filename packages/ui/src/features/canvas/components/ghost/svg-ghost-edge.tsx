import React from 'react';
import { GHOST_NODE_HEIGHT, GHOST_NODE_WIDTH } from './svg-ghost-node';
import type { CardNode } from '../../../../store/slices/cards-slice';
import type { GhostNode } from '../../../../store/slices/ghost-slice';

interface SvgGhostEdgeProps {
  ghost: GhostNode;
  sourceNode: CardNode;
}

/**
 * Dashed, semi-transparent bezier edge between a source node and a ghost.
 * Direction is decided by ghost.edgeDirection ('from' = source→ghost,
 * 'to' = ghost→source). Bezier curvature matches typical canvas edges.
 */
export const SvgGhostEdge: React.FC<SvgGhostEdgeProps> = ({ ghost, sourceNode }) => {
  const srcCenterX = sourceNode.position.x + (sourceNode.width ?? 160) / 2;
  const srcCenterY = sourceNode.position.y + (sourceNode.height ?? 52) / 2;
  const ghostCenterX = ghost.position.x + GHOST_NODE_WIDTH / 2;
  const ghostCenterY = ghost.position.y + GHOST_NODE_HEIGHT / 2;

  const [x1, y1, x2, y2] =
    ghost.edgeDirection === 'to'
      ? [srcCenterX, srcCenterY, ghostCenterX, ghostCenterY]
      : [ghostCenterX, ghostCenterY, srcCenterX, srcCenterY];

  const midX = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

  return (
    <path
      d={d}
      fill="none"
      stroke="var(--ice-text-3, #9ca3af)"
      strokeWidth={1.25}
      strokeDasharray="6 3"
      opacity={0.35}
      pointerEvents="none"
    />
  );
};

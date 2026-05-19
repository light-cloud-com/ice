/**
 * GhostOverlay
 *
 * Renders the AI-Native ghost-mode suggestions: per-suggestion
 * ghost-edge from the source node + ghost-node at the target position.
 * The block is a no-op when `ghosts.length === 0`.
 *
 * Behavior preserved verbatim from the inline JSX block previously in
 * svg-canvas.tsx (rf-canv2-7).
 *
 * rf-canv2-7.
 */

import React from 'react';
import { SvgGhostEdge } from './svg-ghost-edge';
import { SvgGhostNode } from './svg-ghost-node';
import type { CardNode } from '../../../../store/slices/cards-slice';
import type { GhostNode } from '../../../../store/slices/ghost-slice';

export interface GhostOverlayProps {
  ghosts: GhostNode[];
  nodes: CardNode[];
  onAccept: (ghost: GhostNode) => void;
  onDismiss: (ghostId: string) => void;
}

export const GhostOverlay: React.FC<GhostOverlayProps> = ({
  ghosts,
  nodes,
  onAccept,
  onDismiss,
}) => {
  if (ghosts.length === 0) return null;
  return (
    <g pointerEvents="auto">
      {ghosts.map((ghost) => {
        const sourceNode = nodes.find((n) => n.id === ghost.sourceNodeId);
        return (
          <React.Fragment key={ghost.id}>
            {sourceNode && <SvgGhostEdge ghost={ghost} sourceNode={sourceNode} />}
            <SvgGhostNode ghost={ghost} onAccept={onAccept} onDismiss={onDismiss} />
          </React.Fragment>
        );
      })}
    </g>
  );
};

/**
 * Per-node wrapper that layers, in order: an entrance animation, a
 * shift-drag highlight (with lift shadow + animated dashed border), and a
 * parent-clip mask. Used by `svg-canvas.tsx`'s nodes-layer for every node so
 * the dispatched concept renderer (`SvgLogNode`, `SvgGroupNode`,
 * `SvgCompactNode`, the per-concept renderers, etc.) is wrapped consistently
 * regardless of which branch picked it.
 *
 * Three React `key` strings are load-bearing for reconciliation and MUST be
 * preserved verbatim across edits — see the rf-canv-1 / rf-canv-9 learnings
 * on key semantics. Changing them silently re-mounts the wrapped node and
 * resets per-render state in the dispatched renderer:
 *
 *   - `anim-${node.id}`     — when the node is in its entrance animation
 *   - `${node.id}` (bare)   — when the node is being shift-dragged (lifted)
 *   - `clipped-${node.id}`  — when the node has a parentId and is therefore
 *                             clipped to its parent's bounding box
 *
 * The wrapping order from the inside out is: animation → lift → clip. The
 * lift branch consumes the inner animated content but skips the parent-clip
 * (the user is reparenting; visualizing the lift outside the parent's clip
 * is the correct behaviour). When neither lift nor parent-clip applies, the
 * children are returned as-is — possibly still wrapped by the entrance
 * animation `<g>` if `isAnimating` is true.
 */

import React, { type CSSProperties } from 'react';
import type { CanvasNode } from '../types';

export interface NodeLiftWrapperProps {
  node: CanvasNode;
  isAnimating: boolean;
  animStyle?: CSSProperties;
  isLifted: boolean;
  dragOverGroupId: string | null;
  children: React.ReactNode;
}

export const NodeLiftWrapper: React.FC<NodeLiftWrapperProps> = ({
  node,
  isAnimating,
  animStyle,
  isLifted,
  dragOverGroupId,
  children,
}) => {
  // Wrap with entrance animation if needed
  const animated = isAnimating ? (
    <g key={`anim-${node.id}`} style={animStyle}>
      {children}
    </g>
  ) : (
    children
  );

  // Shift-dragged nodes: show lift shadow, skip clip (user is reparenting)
  if (isLifted) {
    // Determine highlight color: green if dragging INTO a group, orange if leaving
    const isEntering = !!dragOverGroupId;
    const highlightColor = isEntering ? '#22c55e' : '#f97316';

    return (
      <g key={node.id} filter="url(#shift-drag-shadow)" opacity={0.9}>
        {animated}
        {/* Highlight border around the dragged node */}
        <rect
          x={node.x - 2}
          y={node.y - 2}
          width={node.width + 4}
          height={node.height + 4}
          rx={8}
          fill="none"
          stroke={highlightColor}
          strokeWidth={2}
          strokeDasharray="6 3"
          opacity={0.8}
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="0.8s" repeatCount="indefinite" />
        </rect>
      </g>
    );
  }

  // BND-5/BND-6: Clip children to parent bounds so they never
  // visually overflow the parent group/block rectangle.
  if (node.parentId) {
    return (
      <g key={`clipped-${node.id}`} clipPath={`url(#parent-clip-${node.parentId})`}>
        {animated}
      </g>
    );
  }

  return animated;
};

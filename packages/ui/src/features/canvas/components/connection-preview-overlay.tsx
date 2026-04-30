/**
 * rf-canv-14 — `ConnectionPreviewOverlay` subcomponent.
 *
 * The in-flight connection drag preview: a temporary cubic-bezier from the
 * source port to the current cursor, plus two anchor circles (source + cursor)
 * shown while the user is dragging from a node port toward another node.
 *
 * This component is the JSX shell only. The bezier math
 * (`computeConnectionPreviewPath`) and color picker (`pickPreviewColor`) live
 * in `../utils/connection-preview.ts` (rf-canv-8) — keep them there.
 *
 * Both the path and the two anchor circles render with `pointer-events: none`
 * (set on the wrapping `<g>`) so the preview never intercepts the cursor —
 * the orchestrator's mouse-move handler must keep firing through it. The
 * stroke/fill color, dash pattern, opacities, and circle radii are verbatim
 * from the original orchestrator IIFE; do NOT tweak them under cover of an
 * extraction unit.
 */

import React from 'react';

import { computeConnectionPreviewPath, pickPreviewColor } from '../utils/connection-preview';
import type { CanvasNode } from './types';

export interface ConnectionPreviewOverlayProps {
  drawingConnection: {
    sourceId: string;
    sourcePoint: { x: number; y: number };
    currentPoint: { x: number; y: number };
  };
  effectiveNodes: CanvasNode[];
  connectionDragTargets: Map<string, string> | null;
}

export const ConnectionPreviewOverlay: React.FC<ConnectionPreviewOverlayProps> = ({
  drawingConnection,
  effectiveNodes,
  connectionDragTargets,
}) => {
  const { sourcePoint, currentPoint } = drawingConnection;
  const pathD = computeConnectionPreviewPath(sourcePoint, currentPoint);
  const previewColor = pickPreviewColor(
    currentPoint,
    effectiveNodes,
    drawingConnection.sourceId,
    connectionDragTargets,
  );
  return (
    <g className="connection-preview" style={{ pointerEvents: 'none' }}>
      <path
        d={pathD}
        stroke={previewColor}
        strokeWidth={2}
        fill="none"
        strokeDasharray="8 4"
        opacity={0.7}
      />
      <circle cx={sourcePoint.x} cy={sourcePoint.y} r={4} fill={previewColor} opacity={0.9} />
      <circle cx={currentPoint.x} cy={currentPoint.y} r={4} fill={previewColor} opacity={0.6} />
    </g>
  );
};

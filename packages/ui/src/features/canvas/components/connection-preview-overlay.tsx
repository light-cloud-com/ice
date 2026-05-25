/**
 * rf-canv-14 — `ConnectionPreviewOverlay` subcomponent.
 *
 * The in-flight connection drag preview. Two modes:
 *
 *   1. **Snapped (socket-to-socket)** — when the orchestrator has magnet-
 *      locked the cursor onto a compatible target port, render a solid
 *      bezier from the source socket to the target socket. This is the
 *      promise: release here and the wire lands here.
 *
 *   2. **Searching (no target)** — when the cursor is in free space, no
 *      preview line is drawn. The pulsing source-socket halo (rendered
 *      by TypedSockets) plus the per-port green halos on compatible
 *      targets are the only feedback. This matches the user mental
 *      model: "connections are socket ↔ socket only."
 *
 * Both modes use `pointer-events: none` so the preview never intercepts
 * the cursor — the orchestrator's mouse-move handler must keep firing
 * through it.
 */

import React from 'react';
import { computeConnectionPreviewPath } from '../utils/connection-preview';
import { getConnectionDragInfo } from './nodes/_shared/connection-drag-context';
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

export const ConnectionPreviewOverlay: React.FC<ConnectionPreviewOverlayProps> = ({ drawingConnection }) => {
  const { sourcePoint, currentPoint } = drawingConnection;
  const drag = getConnectionDragInfo();
  // Only render a line when the magnet has actually locked on to a
  // target socket. Until then, the source-socket pulse + per-port
  // halos are the user's feedback — no floating "block to cursor"
  // wire to confuse the eye.
  if (!drag || !drag.snap) return null;
  const pathD = computeConnectionPreviewPath(sourcePoint, currentPoint);
  return (
    <g className="connection-preview" style={{ pointerEvents: 'none' }}>
      <path d={pathD} stroke="#22c55e" strokeWidth={2.5} fill="none" opacity={0.9} />
      <circle cx={sourcePoint.x} cy={sourcePoint.y} r={4} fill="#22c55e" opacity={0.95} />
      <circle cx={currentPoint.x} cy={currentPoint.y} r={5} fill="#22c55e" opacity={0.95} />
    </g>
  );
};

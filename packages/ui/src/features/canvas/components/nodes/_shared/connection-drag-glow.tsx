import React, { memo } from 'react';
import { CORNER_RADIUS } from '../../../../../config/canvas-constants';

interface ConnectionDragGlowProps {
  x: number;
  y: number;
  width: number;
  height: number;
  reducedMotion?: boolean;
}

export const ConnectionDragGlow: React.FC<ConnectionDragGlowProps> = memo(
  ({ x, y, width, height, reducedMotion = false }) => (
    <rect
      x={x - 4}
      y={y - 4}
      width={width + 8}
      height={height + 8}
      rx={CORNER_RADIUS + 4}
      fill="none"
      stroke="#22c55e"
      strokeWidth={2}
      opacity={0.8}
    >
      {!reducedMotion && <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.5s" repeatCount="indefinite" />}
    </rect>
  ),
);

ConnectionDragGlow.displayName = 'ConnectionDragGlow';

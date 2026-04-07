import React, { memo } from 'react';
import { CORNER_RADIUS } from '../../../../../config/canvas-constants';

interface DragOverGlowProps {
  x: number;
  y: number;
  width: number;
  height: number;
  stroke?: string;
  strokeDasharray?: string;
  opacity?: number;
}

export const DragOverGlow: React.FC<DragOverGlowProps> = memo(
  ({ x, y, width, height, stroke = '#22d3ee', strokeDasharray = '6 3', opacity = 0.8 }) => (
    <rect
      x={x - 3}
      y={y - 3}
      width={width + 6}
      height={height + 6}
      rx={CORNER_RADIUS + 3}
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeDasharray={strokeDasharray}
      opacity={opacity}
    />
  ),
);

DragOverGlow.displayName = 'DragOverGlow';

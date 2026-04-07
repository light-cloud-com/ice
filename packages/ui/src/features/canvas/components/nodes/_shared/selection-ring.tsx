import React, { memo } from 'react';
import { CORNER_RADIUS } from '../../../../../config/canvas-constants';

interface SelectionRingProps {
  x: number;
  y: number;
  width: number;
  height: number;
  stroke?: string;
  strokeWidth?: number;
  padding?: number;
  opacity?: number;
  strokeDasharray?: string;
}

export const SelectionRing: React.FC<SelectionRingProps> = memo(
  ({
    x,
    y,
    width,
    height,
    stroke = 'var(--ice-text-secondary)',
    strokeWidth = 2,
    padding = 3,
    opacity = 0.6,
    strokeDasharray,
  }) => (
    <rect
      x={x - padding}
      y={y - padding}
      width={width + padding * 2}
      height={height + padding * 2}
      rx={CORNER_RADIUS + padding}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
      strokeDasharray={strokeDasharray}
    />
  ),
);

SelectionRing.displayName = 'SelectionRing';

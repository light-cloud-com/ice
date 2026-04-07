import React, { memo } from 'react';
import { CORNER_RADIUS } from '../../../../../config/canvas-constants';

interface ChildExitingIndicatorProps {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ChildExitingIndicator: React.FC<ChildExitingIndicatorProps> = memo(({ x, y, width, height }) => (
  <rect
    x={x - 3}
    y={y - 3}
    width={width + 6}
    height={height + 6}
    rx={CORNER_RADIUS + 3}
    fill="none"
    stroke="#f97316"
    strokeWidth={2}
    strokeDasharray="6 4"
    opacity={0.9}
  />
));

ChildExitingIndicator.displayName = 'ChildExitingIndicator';

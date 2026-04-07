/**
 * Canvas Grid Component
 *
 * Renders a grid background pattern for the SVG canvas.
 * Uses SVG pattern for efficient rendering at any zoom level.
 */

import React, { useMemo } from 'react';
import { GRID_SIZE } from '../../../config/canvas-constants';
import type { ViewState } from './svg-canvas';

interface CanvasGridProps {
  viewState: ViewState;
  width: number;
  height: number;
}

export const CanvasGrid: React.FC<CanvasGridProps> = ({ viewState, width, height }) => {
  // Calculate visible area in world coordinates
  const gridBounds = useMemo(() => {
    const padding = 1000; // Extra padding to prevent gaps during panning
    const worldLeft = -viewState.panX / viewState.scale - padding;
    const worldTop = -viewState.panY / viewState.scale - padding;
    const worldWidth = width / viewState.scale + padding * 2;
    const worldHeight = height / viewState.scale + padding * 2;

    return {
      x: worldLeft,
      y: worldTop,
      width: worldWidth,
      height: worldHeight,
    };
  }, [viewState, width, height]);

  const gridSize = GRID_SIZE;
  const patternId = 'canvas-grid-pattern';

  return (
    <>
      <defs>
        {/* Dot pattern */}
        <pattern id={patternId} width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
          {/* Small dot at intersections */}
          <circle cx={gridSize / 2} cy={gridSize / 2} r={1} fill="rgba(148, 163, 184, 0.6)" />
        </pattern>
      </defs>

      {/* Grid background rectangle */}
      <rect
        x={gridBounds.x}
        y={gridBounds.y}
        width={gridBounds.width}
        height={gridBounds.height}
        fill={`url(#${patternId})`}
        className="pointer-events-none"
      />
    </>
  );
};

/**
 * Selection Frame Component
 *
 * Renders the box selection rectangle on the canvas.
 * Reads from selectionSlice.selectionRect.
 */

import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';

export const SelectionFrame: React.FC = () => {
  const selectionRect = useSelector((state: RootState) => state.selection.selectionRect);

  if (!selectionRect) return null;

  return (
    <rect
      x={selectionRect.x}
      y={selectionRect.y}
      width={selectionRect.width}
      height={selectionRect.height}
      fill="rgba(59, 130, 246, 0.08)"
      stroke="#3b82f6"
      strokeWidth={1}
      strokeDasharray="6 3"
      pointerEvents="none"
    />
  );
};

export default SelectionFrame;

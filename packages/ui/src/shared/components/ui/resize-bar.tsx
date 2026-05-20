/**
 * ResizeBar — shared drag handle for resizable panels
 *
 * Works for both vertical bars (sidebar edges) and horizontal bars (stacked panels).
 * Highlights on hover to indicate draggability.
 */

import * as React from 'react';
import { cn } from '../../utils/cn';

interface ResizeBarProps {
  /** 'vertical' = tall thin bar (for side-by-side panels), 'horizontal' = wide thin bar (for stacked panels) */
  direction: 'vertical' | 'horizontal';
  className?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
}

export const ResizeBar: React.FC<ResizeBarProps> = ({
  direction,
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) => (
  <div
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    className={cn(
      'shrink-0 bg-ice-border transition-colors hover:bg-ice-accent',
      direction === 'vertical' ? 'w-1 h-full cursor-col-resize' : 'h-1 w-full cursor-row-resize',
      className,
    )}
  />
);

ResizeBar.displayName = 'ResizeBar';

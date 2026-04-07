/**
 * View Level Toggle Component
 *
 * 2-state toggle (1/2) for controlling visualization depth.
 * - Level 1 (Architecture): Services & data flow - for Developers & Architects
 * - Level 2 (Infrastructure): Full infrastructure - for DevOps & SREs
 */

import { LayoutGrid, Layers3 } from 'lucide-react';
import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { VIEW_LEVELS, type ViewLevel } from '../../../config/visualization-config';
import { cn } from '../../../shared/utils/cn';
import { setViewLevel } from '../../../store/slices/view-slice';
import type { RootState, AppDispatch } from '../../../store';

const VIEW_ICONS: Record<ViewLevel, React.ElementType> = {
  1: LayoutGrid, // Blocks - high-level cards
  2: Layers3, // Infrastructure - everything
};

export const ViewLevelToggle: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { viewLevel } = useSelector((state: RootState) => state.view);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // View level shortcuts (1, 2) - no modifiers
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (e.key === '1') {
          dispatch(setViewLevel(1));
          e.preventDefault();
        } else if (e.key === '2') {
          dispatch(setViewLevel(2));
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);

  return (
    <div data-testid="view-level-toggle" className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
      {([1, 2] as ViewLevel[]).map((level) => {
        const LevelIcon = VIEW_ICONS[level];
        const levelConfig = VIEW_LEVELS[level];
        const isActive = viewLevel === level;

        return (
          <button
            key={level}
            onClick={() => dispatch(setViewLevel(level))}
            title={`${levelConfig.tooltip}\n${levelConfig.description}`}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
              isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted-foreground/10 text-muted-foreground',
            )}
          >
            <LevelIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{levelConfig.name}</span>
            <span className="sm:hidden">{level}</span>
          </button>
        );
      })}
    </div>
  );
};

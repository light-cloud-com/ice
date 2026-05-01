/**
 * Column header sort button. Extracted from `inline-table-view.tsx`
 * (rf-itab-1). Pure presentation — receives the active sort column /
 * direction via props and dispatches `onToggleSort` when clicked.
 */
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import React from 'react';
import type { SortCol, SortDir } from './types';

export interface SortHeaderProps {
  col: SortCol;
  label: string;
  sortCol: SortCol;
  sortDir: SortDir;
  align?: 'left' | 'right';
  onToggleSort: (col: SortCol) => void;
}

export const SortHeader: React.FC<SortHeaderProps> = ({ col, label, sortCol, sortDir, align = 'left', onToggleSort }) => {
  const isActive = sortCol === col;
  return (
    <button
      onClick={() => onToggleSort(col)}
      className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''} text-ice-2xs font-medium uppercase tracking-wider transition-colors ${
        isActive ? 'text-ice-text-1' : 'text-ice-text-3 hover:text-ice-text-2'
      }`}
    >
      {label}
      {isActive ? (
        sortDir === 'asc' ? (
          <ArrowUp className="w-3 h-3" />
        ) : (
          <ArrowDown className="w-3 h-3" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
};

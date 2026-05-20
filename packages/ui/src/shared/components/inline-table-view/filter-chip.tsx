/**
 * Filter pill button used by the toolbar's status + provider filter
 * groups. Extracted from `inline-table-view.tsx` (rf-itab-1). Optional
 * leading dot color renders when provided (status filter); the
 * provider filter passes none.
 */
import React from 'react';

export interface FilterChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
  /** Optional CSS color string. When set, renders a leading 1.5×1.5 dot. */
  dot?: string;
}

export const FilterChip: React.FC<FilterChipProps> = ({ active, label, onClick, dot }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-ice-2xs border transition-colors ${
      active
        ? 'bg-ice-accent-muted border-ice-accent text-ice-text-1'
        : 'bg-ice-raised border-ice-border text-ice-text-3 hover:text-ice-text-1'
    }`}
  >
    {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
    {label}
  </button>
);

/**
 * rf-wgal-4 — FilterChip.
 *
 * The toggle pill used in the gallery page's filter rows (category,
 * provider, difficulty). Pure visual + onClick callback — no internal
 * state, no Redux. The "active" tone is driven by an inline style block
 * computed from the optional `color` prop, which falls through to the
 * `--ice-accent` CSS var when undefined. The inactive tone uses static
 * Tailwind classes.
 *
 * Has no equivalent in the rf-tgal panel-dialog (the panel uses bare
 * <button> elements with computed classes); the page's filter row is
 * a richer surface with three independent chip rows, so the
 * abstraction earns its own module.
 */

import { cn } from '@ui/shared/utils/cn';
import React from 'react';

export interface FilterChipProps {
  label: string;
  icon?: React.ElementType;
  color?: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}

export const FilterChip: React.FC<FilterChipProps> = ({ label, icon: Icon, color, active, count, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-ice-xs font-medium transition-colors',
      active ? 'ring-1 ring-opacity-40' : 'bg-ice-raised text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover',
    )}
    style={
      active
        ? {
            backgroundColor: (color || 'var(--ice-accent)') + '20',
            color: color || 'var(--ice-accent)',
            ['--tw-ring-color' as string]: (color || 'var(--ice-accent)') + '66',
          }
        : undefined
    }
  >
    {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
    {label}
    {count != null && <span className="text-ice-2xs opacity-60 font-variant-numeric tabular-nums">{count}</span>}
  </button>
);

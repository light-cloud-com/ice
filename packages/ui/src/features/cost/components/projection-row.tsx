/**
 * ProjectionRow — small label/value row for the time-projections section.
 *
 * Lifted from `cost-panel.tsx` (rf-cost-5). Renders a horizontal row with a
 * label on the left and a formatted dollar amount on the right. The suffix
 * appended after the value is hard-coded to a label-keyed lookup:
 *
 *   "Monthly"   → "/mo"
 *   "Quarterly" → "/qtr"
 *   "(other)"   → "/yr"
 *
 * Note this hard-coding by English label is a known fragility — when the
 * label arrives from `t('cost.monthly')` and the locale isn't English the
 * suffix falls through to "/yr". The orchestrator depends on this so we
 * preserve the behavior verbatim; downstream i18n cleanup is out of scope.
 */

import React from 'react';
import { formatCostRaw } from '../utils/cost-calculator';

export interface ProjectionRowProps {
  label: string;
  value: number;
}

export const ProjectionRow: React.FC<ProjectionRowProps> = ({ label, value }) => (
  <div className="flex items-center justify-between py-0.5">
    <span className="text-ice-xs text-ice-text-2">{label}</span>
    <span className="text-ice-sm text-ice-text-1 font-mono">
      {formatCostRaw(value)}
      {label === 'Monthly' ? '/mo' : label === 'Quarterly' ? '/qtr' : '/yr'}
    </span>
  </div>
);

/**
 * ScalingRangeBar — three-stop horizontal range bar for cost scaling.
 *
 * Lifted from `cost-panel.tsx` (rf-cost-6). Renders:
 *
 *   - "Min Instances" / "Max Instances" labels (i18n)
 *   - a green→amber→red gradient bar
 *   - a vertical white line + small handle anchored at the current cost's
 *     position within `[minCost, maxCost]`
 *   - a footer row with min cost, "Current: X", max cost
 *
 * `currentPos` is computed as `((currentCost - minCost) / (maxCost - minCost)) * 100`,
 * with a fallback of `50` when `maxCost - minCost <= 0`. The handle's `left`
 * uses `calc(${currentPos}% - 6px)` to recenter the 12px-wide handle.
 */

import React from 'react';
import { t } from '../../../i18n';
import { formatCost } from '../utils/cost-calculator';

export interface ScalingRangeBarProps {
  range: { minCost: number; currentCost: number; maxCost: number };
}

export const ScalingRangeBar: React.FC<ScalingRangeBarProps> = ({ range }) => {
  const { minCost, currentCost, maxCost } = range;
  const totalRange = maxCost - minCost;
  const currentPos = totalRange > 0 ? ((currentCost - minCost) / totalRange) * 100 : 50;

  return (
    <div>
      <div className="flex items-center justify-between text-ice-xs text-ice-text-3 mb-1">
        <span>{t('cost.minInstances')}</span>
        <span>{t('cost.maxInstances')}</span>
      </div>
      <div className="relative h-3 bg-ice-border rounded-full overflow-hidden">
        {/* Gradient from green to red */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/40 via-amber-500/40 to-red-500/40 rounded-full" />
        {/* Current position marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white shadow-sm shadow-black/30"
          style={{ left: `${currentPos}%` }}
        />
        <div
          className="absolute -top-0.5 w-3 h-4 bg-white rounded-sm border border-ice-border shadow-sm"
          style={{ left: `calc(${currentPos}% - 6px)` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-ice-xs text-emerald-400 font-mono">{formatCost(minCost)}</span>
        <span className="text-ice-xs text-ice-text-1 font-mono font-semibold">Current: {formatCost(currentCost)}</span>
        <span className="text-ice-xs text-red-400 font-mono">{formatCost(maxCost)}</span>
      </div>
    </div>
  );
};

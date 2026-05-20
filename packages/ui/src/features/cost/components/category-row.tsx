/**
 * CategoryRow — single row of the category breakdown section.
 *
 * Lifted from `cost-panel.tsx` (rf-cost-7). Renders a click-to-expand row
 * for one cost category:
 *
 *   [icon] [label]               $X.XX  XX%
 *   [percent-fill bar lookup]
 *   [expanded:]
 *     [n.label]   $n.monthlyCost
 *     ...
 *
 * Icon and bar color are looked up by `category.label` first then
 * `category.category`, falling through to a Package icon and `bg-gray-500`
 * when neither matches (cite `data/category-meta`).
 *
 * The percent calculation guards against `totalCost === 0` returning `0`
 * (the original division would otherwise be NaN).
 */

import { Package } from 'lucide-react';
import React, { useState } from 'react';
import { cn } from '../../../shared/utils/cn';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../data/category-meta';
import { formatCost, type CategoryCost } from '../utils/cost-calculator';

export interface CategoryRowProps {
  category: CategoryCost;
  totalCost: number;
}

export const CategoryRow: React.FC<CategoryRowProps> = ({ category, totalCost }) => {
  const [expanded, setExpanded] = useState(false);
  const percent = totalCost > 0 ? (category.totalCost / totalCost) * 100 : 0;

  return (
    <div>
      <button
        className="w-full flex items-center gap-2 py-0.5 hover:bg-ice-hover/50 rounded transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {CATEGORY_ICONS[category.label] || CATEGORY_ICONS[category.category] || <Package className="w-3.5 h-3.5" />}
        <span className="text-ice-xs text-ice-text-2 flex-1 text-left">{category.label}</span>
        <span className="text-ice-xs text-ice-text-1 font-mono">{formatCost(category.totalCost)}</span>
        <span className="text-ice-xs text-ice-text-3 font-mono w-8 text-right">{Math.round(percent)}%</span>
      </button>
      {/* Bar */}
      <div className="h-1 bg-ice-border/50 rounded-full overflow-hidden mt-0.5 ml-6">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            CATEGORY_COLORS[category.label] || CATEGORY_COLORS[category.category] || 'bg-gray-500',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {/* Expanded node list */}
      {expanded && (
        <div className="ml-6 mt-1 space-y-0.5">
          {category.nodes.map((n) => (
            <div key={n.nodeId} className="flex items-center justify-between text-ice-xs py-0.5">
              <span className="text-ice-text-3 truncate mr-2">{n.label}</span>
              <span className="text-ice-text-2 font-mono shrink-0">{formatCost(n.monthlyCost)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

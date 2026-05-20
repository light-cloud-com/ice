/**
 * EnvironmentComparison — environment-vs-production cost comparison rows.
 *
 * Lifted from `cost-panel.tsx` (rf-cost-8). For each project environment,
 * looks up its bound card, recomputes that card's cost summary against the
 * shared `resourceMap`, and renders a row with:
 *
 *   [type-color dot]  [name]  [🔒 if protected]   $cost   [+/- delta vs prod]
 *
 * The "active" environment (matching `activeCardId`) is highlighted with an
 * emerald background. Production env shows no delta; non-production envs
 * show a delta against the production baseline computed once at the top.
 *
 * `currentCost` is currently unused (kept on the props surface for parity
 * with the pre-refactor signature) — the underscore prefix is intentional.
 */

import React from 'react';
import { cn } from '../../../shared/utils/cn';
import { computeCostSummary, formatCost, formatCostRaw, type ResourceMap } from '../utils/cost-calculator';
import type { CardNode } from '../../../store/slices/cards-slice';
import type { Environment } from '../../../store/slices/environments-slice';

export interface EnvironmentComparisonProps {
  environments: Environment[];
  allCards: Array<{ id: string; name: string; nodes: CardNode[] }>;
  activeCardId: string | null;
  currentCost: number;
  resourceMap: ResourceMap | null;
}

export const EnvironmentComparison: React.FC<EnvironmentComparisonProps> = ({
  environments,
  allCards,
  activeCardId,
  currentCost: _currentCost,
  resourceMap,
}) => {
  // Compute production baseline once
  const prodEnv = environments.find((e) => e.type === 'production');
  const prodCard = prodEnv ? allCards.find((c) => c.id === prodEnv.card_id) : null;
  const prodCost = prodCard ? computeCostSummary(prodCard.nodes, resourceMap).totalMonthlyCost : 0;

  return (
    <div className="space-y-1.5">
      {environments.map((env) => {
        const card = allCards.find((c) => c.id === env.card_id);
        const envCost = card ? computeCostSummary(card.nodes, resourceMap).totalMonthlyCost : 0;
        const delta = env.type !== 'production' ? envCost - prodCost : 0;
        const isActive = card?.id === activeCardId;

        return (
          <div
            key={env.id}
            className={cn(
              'flex items-center justify-between py-1.5 px-2 rounded',
              isActive && 'bg-emerald-500/10 border border-emerald-500/20',
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  env.type === 'production'
                    ? 'bg-emerald-500'
                    : env.type === 'staging'
                      ? 'bg-amber-500'
                      : env.type === 'development'
                        ? 'bg-blue-500'
                        : 'bg-purple-500',
                )}
              />
              <span className="text-ice-xs text-ice-text-1">{env.name}</span>
              {env.is_protected && <span className="text-ice-xs text-ice-text-3">🔒</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-ice-xs text-ice-text-1 font-mono">{envCost > 0 ? formatCost(envCost) : '—'}</span>
              {env.type !== 'production' && delta !== 0 && (
                <span
                  className={cn(
                    'text-ice-xs font-mono',
                    delta < 0 ? 'text-emerald-400' : delta > 0 ? 'text-red-400' : 'text-ice-text-3',
                  )}
                >
                  {delta > 0 ? '+' : ''}
                  {formatCostRaw(delta)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

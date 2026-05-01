/**
 * Cost Estimation Panel — Right Sidebar
 *
 * Full cost analysis for the active card/environment:
 * - Category breakdown with bar chart
 * - Time projections (monthly/quarterly/annual)
 * - Scaling cost range (min → current → max)
 * - Environment comparison
 * - Data transfer estimates
 * - Provider comparison (AWS vs GCP vs Azure)
 * - AI-powered optimization suggestions
 * - Session cost delta tracking
 */

import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Zap,
  ArrowRightLeft,
  Globe,
  Package,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { t } from '../../../i18n';
import { PanelHeader } from '../../../shared/components/ui/panel-header';
import { cn } from '../../../shared/utils/cn';
import { selectActiveCard, type CardNode } from '../../../store/slices/cards-slice';
import { toggleCostPanel } from '../../../store/slices/ui-slice';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../data/category-meta';
import { useCostCalculation } from '../hooks/use-cost-calculation';
import {
  formatCost,
  formatCostRaw,
  computeCostSummary,
  type CategoryCost,
  type ResourceMap,
} from '../utils/cost-calculator';
import { generateSuggestions } from '../utils/generate-suggestions';
import { TRAFFIC_TIERS, EGRESS_RATES } from '../utils/provider-pricing';
import { loadTrafficTier, saveTrafficTier } from '../utils/traffic-tier-storage';
import { CategoryRow } from './category-row';
import { ProjectionRow } from './projection-row';
import { ScalingRangeBar } from './scaling-range-bar';
import { Section } from './section';
import type { RootState, AppDispatch } from '../../../store';
import type { Environment } from '../../../store/slices/environments-slice';

// Stable empty-array fallback (avoids creating new [] references in selectors)
const EMPTY_ENVIRONMENTS: Environment[] = [];

// ═════════════════════════════════════════════════════════════════════════════
// Cost Panel
// ═════════════════════════════════════════════════════════════════════════════

export const CostPanel: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const activeCard = useSelector((state: RootState) => selectActiveCard(state));
  const projectId = activeCard?.projectId;
  const environments = useSelector((state: RootState) => {
    if (!projectId) return EMPTY_ENVIRONMENTS;
    return state.environments.byProject[projectId] ?? EMPTY_ENVIRONMENTS;
  });
  const allCards = useSelector((state: RootState) => state.cards.cards);
  const activeCardId = useSelector((state: RootState) => state.cards.activeCardId);

  const [trafficTierIndex, setTrafficTierIndex] = useState(loadTrafficTier);

  // Session cost tracking
  const initialCostRef = useRef<number | null>(null);

  const { summary, dataTransfer, providerComparison, trafficConnectionCount, primaryProvider, hasNodes, resourceMap } =
    useCostCalculation(trafficTierIndex);

  // Track initial cost on mount
  useEffect(() => {
    if (initialCostRef.current === null && summary.totalMonthlyCost > 0) {
      initialCostRef.current = summary.totalMonthlyCost;
    }
  }, [summary.totalMonthlyCost]);

  const sessionDelta = initialCostRef.current !== null ? summary.totalMonthlyCost - initialCostRef.current : 0;

  const handleTrafficTierChange = useCallback((index: number) => {
    setTrafficTierIndex(index);
    saveTrafficTier(index);
  }, []);

  // ── Empty state ────────────────────────────────────────────────────────

  if (!activeCard || !hasNodes) {
    return (
      <div className="h-full flex flex-col bg-inherit border-l border-ice-border">
        <PanelHeader
          icon={<DollarSign aria-hidden="true" className="w-3.5 h-3.5 text-emerald-400" />}
          title={t('cost.title')}
          onClose={() => dispatch(toggleCostPanel())}
          closeLabel="Close"
        />
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-ice-sm text-ice-text-3 text-center leading-relaxed">{t('cost.empty')}</p>
        </div>
      </div>
    );
  }

  const { totalMonthlyCost: infraCost, categories, scalingRange, nodeCount, scalableNodeCount } = summary;

  // Total = infrastructure + data transfer
  const totalMonthlyCost = infraCost + dataTransfer.monthlyCost;

  const currentTier = TRAFFIC_TIERS[trafficTierIndex] ?? TRAFFIC_TIERS[2];

  // Optimization suggestions
  const suggestions = generateSuggestions(summary, activeCard.nodes, environments);

  return (
    <div className="h-full flex flex-col bg-inherit border-l border-ice-border">
      {/* Header */}
      <PanelHeader
        icon={<DollarSign aria-hidden="true" className="w-3.5 h-3.5 text-emerald-400" />}
        title={t('cost.title')}
        onClose={() => dispatch(toggleCostPanel())}
        closeLabel="Close"
      />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Total monthly cost hero ──────────────────────────────── */}
        <div className="px-3 py-3 border-b border-ice-border">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
              {formatCostRaw(totalMonthlyCost)}
            </span>
            <span className="text-ice-xs text-ice-text-3">/mo</span>
            {sessionDelta !== 0 && (
              <span
                className={cn(
                  'text-ice-xs font-mono ml-auto flex items-center gap-0.5 tabular-nums',
                  sessionDelta > 0 ? 'text-red-400' : 'text-emerald-400',
                )}
              >
                {sessionDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {sessionDelta > 0 ? '+' : ''}
                {formatCostRaw(sessionDelta)}
              </span>
            )}
          </div>
          <div className="text-ice-xs text-ice-text-3 mt-0.5">
            {nodeCount} resources{scalableNodeCount > 0 && ` · ${scalableNodeCount} scalable`}
          </div>
        </div>

        {/* ── 1. Category Breakdown ─────────────────────────────────── */}
        <Section title={t('cost.categoryBreakdown')} icon={<Package className="w-3 h-3" />}>
          <div className="space-y-2">
            {categories.map((cat) => (
              <CategoryRow key={cat.category} category={cat} totalCost={totalMonthlyCost} />
            ))}
          </div>
        </Section>

        {/* ── 2. Time Projections ───────────────────────────────────── */}
        <Section title={t('cost.timeProjections')} icon={<DollarSign className="w-3 h-3" />} defaultOpen={false}>
          <div className="space-y-1.5">
            <ProjectionRow label={t('cost.monthly')} value={totalMonthlyCost} />
            <ProjectionRow label={t('cost.quarterly')} value={totalMonthlyCost * 3} />
            <ProjectionRow label={t('cost.annual')} value={totalMonthlyCost * 12} />
            {scalableNodeCount > 0 && (
              <div className="mt-2 pt-2 border-t border-ice-border/50">
                <div className="text-ice-xs text-ice-text-3 mb-1.5">{t('cost.annualRange')}</div>
                <div className="flex items-center justify-between">
                  <span className="text-ice-xs text-ice-text-2">{t('cost.minAtBase')}</span>
                  <span className="text-ice-sm text-ice-text-1 font-mono">
                    {formatCostRaw((scalingRange.minCost + dataTransfer.monthlyCost) * 12)}/yr
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ice-xs text-ice-text-2">{t('cost.maxScaledUp')}</span>
                  <span className="text-ice-sm text-red-400 font-mono">
                    {formatCostRaw((scalingRange.maxCost + dataTransfer.monthlyCost) * 12)}/yr
                  </span>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* ── 3. Scaling Cost Range ─────────────────────────────────── */}
        {scalableNodeCount > 0 && (
          <Section title={t('cost.scalingRange')} icon={<Zap className="w-3 h-3" />} defaultOpen={false}>
            <ScalingRangeBar range={scalingRange} />
            <div className="mt-2 space-y-1">
              {summary.categories.map((cat) =>
                cat.nodes
                  .filter((n) => n.isScalable)
                  .map((n) => (
                    <div key={n.nodeId} className="flex items-center justify-between text-ice-xs">
                      <span className="text-ice-text-2 truncate mr-2">{n.label}</span>
                      <span className="text-ice-text-3 font-mono shrink-0">
                        {n.minInstances}–{n.maxInstances} inst · {formatCostRaw(n.perInstanceCost)}/ea
                      </span>
                    </div>
                  )),
              )}
            </div>
          </Section>
        )}

        {/* ── 4. Environment Comparison ─────────────────────────────── */}
        {environments.length > 1 && (
          <Section title={t('cost.envComparison')} icon={<ArrowRightLeft className="w-3 h-3" />} defaultOpen={false}>
            <EnvironmentComparison
              environments={environments}
              allCards={allCards}
              activeCardId={activeCardId}
              currentCost={totalMonthlyCost}
              resourceMap={resourceMap}
            />
          </Section>
        )}

        {/* ── 5. Data Transfer Costs ────────────────────────────────── */}
        <Section title={t('cost.dataTransfer')} icon={<Globe className="w-3 h-3" />} defaultOpen={false}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-ice-xs text-ice-text-3">{t('cost.trafficTier')}</span>
            </div>
            <input
              type="range"
              min={0}
              max={TRAFFIC_TIERS.length - 1}
              value={trafficTierIndex}
              onChange={(e) => handleTrafficTierChange(parseInt(e.target.value))}
              className="w-full h-1.5 bg-ice-border rounded-full appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-ice-xs text-ice-text-3">
              <span>{t('cost.dev')}</span>
              <span className="text-emerald-400 font-medium">{currentTier.label}</span>
              <span>{t('cost.veryHigh')}</span>
            </div>

            <div className="mt-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-ice-xs text-ice-text-2">{t('cost.estEgress')}</span>
                <span className="text-ice-xs text-ice-text-1 font-mono">
                  {dataTransfer.estimatedGb < 1
                    ? `${Math.round(dataTransfer.estimatedGb * 1024)} MB`
                    : dataTransfer.estimatedGb >= 1000
                      ? `${(dataTransfer.estimatedGb / 1000).toFixed(0)} TB`
                      : `${dataTransfer.estimatedGb} GB`}
                  /mo
                </span>
              </div>
              {dataTransfer.freeGb > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-ice-xs text-ice-text-2">Free tier</span>
                  <span className="text-ice-xs text-emerald-400 font-mono">
                    {dataTransfer.freeGb >= 1000
                      ? `${(dataTransfer.freeGb / 1000).toFixed(0)} TB`
                      : `${dataTransfer.freeGb} GB`}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-ice-xs text-ice-text-2">Transfer cost</span>
                <span className="text-ice-sm text-emerald-400 font-mono font-semibold">
                  {dataTransfer.monthlyCost === 0 ? 'Free' : `~$${Math.round(dataTransfer.monthlyCost)}/mo`}
                </span>
              </div>
              <div className="text-ice-xs text-ice-text-3 mt-1">
                {trafficConnectionCount} traffic connections · {EGRESS_RATES[primaryProvider]?.notes || ''}
              </div>
            </div>
          </div>
        </Section>

        {/* ── 6. Provider Comparison ────────────────────────────────── */}
        <Section title={t('cost.providerComparison')} icon={<ArrowRightLeft className="w-3 h-3" />} defaultOpen={false}>
          <div className="space-y-1.5">
            {providerComparison.map((pc) => (
              <div
                key={pc.provider}
                className={cn(
                  'flex items-center justify-between py-1 px-2 rounded',
                  pc.provider === primaryProvider && 'bg-emerald-500/10 border border-emerald-500/20',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-ice-sm text-ice-text-1 font-medium">{pc.label}</span>
                  {pc.provider === primaryProvider && <span className="text-ice-xs text-emerald-400">current</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ice-sm text-ice-text-1 font-mono">{formatCostRaw(pc.totalMonthlyCost)}/mo</span>
                  {pc.provider !== primaryProvider && pc.delta !== 0 && (
                    <span className={cn('text-ice-xs font-mono', pc.delta < 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {pc.delta > 0 ? '+' : ''}
                      {Math.round(pc.deltaPercent)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 7. Optimization Suggestions ───────────────────────────── */}
        {suggestions.length > 0 && (
          <Section title={t('cost.suggestions')} icon={<Lightbulb className="w-3 h-3" />} defaultOpen={false}>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded border px-2.5 py-2',
                    s.severity === 'high'
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : s.severity === 'medium'
                        ? 'border-blue-500/20 bg-blue-500/5'
                        : 'border-ice-border bg-ice-bg',
                  )}
                >
                  <div className="flex items-start gap-2">
                    {s.severity === 'high' ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <Lightbulb className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="text-ice-xs text-ice-text-1">{s.message}</div>
                      {s.savings && (
                        <div className="text-ice-xs text-emerald-400 font-mono mt-0.5">
                          Potential savings: {s.savings}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═════════════════════════════════════════════════════════════════════════════

// ── Environment Comparison ──────────────────────────────────────────────────

const EnvironmentComparison: React.FC<{
  environments: Environment[];
  allCards: Array<{ id: string; name: string; nodes: CardNode[] }>;
  activeCardId: string | null;
  currentCost: number;
  resourceMap: ResourceMap | null;
}> = ({ environments, allCards, activeCardId, currentCost: _currentCost, resourceMap }) => {
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


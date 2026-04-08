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
  ChevronRight,
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Zap,
  ArrowRightLeft,
  Globe,
  Server,
  Database,
  MessageSquare,
  Shield,
  Activity,
  BrainCircuit,
  Package,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { t } from '../../../i18n';
import { PanelHeader } from '../../../shared/components/ui/panel-header';
import { cn } from '../../../shared/utils/cn';
import { selectActiveCard, type CardNode } from '../../../store/slices/cards-slice';
import { toggleCostPanel } from '../../../store/slices/ui-slice';
import { useCostCalculation } from '../hooks/use-cost-calculation';
import {
  formatCost,
  formatCostRaw,
  parseCostRange,
  computeCostSummary,
  type CostSummary,
  type CategoryCost,
  type ResourceMap,
} from '../utils/cost-calculator';
import { TRAFFIC_TIERS, EGRESS_RATES } from '../utils/provider-pricing';
import type { RootState, AppDispatch } from '../../../store';
import type { Environment } from '../../../store/slices/environments-slice';

// ─── Section component ──────────────────────────────────────────────────────

const Section: React.FC<{
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, icon, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-ice-border">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-ice-xs uppercase tracking-wider text-ice-text-3 hover:bg-ice-hover transition-colors"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform', open && 'rotate-90')} />
        {icon}
        <span className="flex-1 text-left">{title}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
};

// ─── Category icon lookup ───────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Compute: <Server className="w-3.5 h-3.5" />,
  Data: <Database className="w-3.5 h-3.5" />,
  'Data Storage': <Database className="w-3.5 h-3.5" />,
  Messaging: <MessageSquare className="w-3.5 h-3.5" />,
  Networking: <Globe className="w-3.5 h-3.5" />,
  Security: <Shield className="w-3.5 h-3.5" />,
  Observability: <Activity className="w-3.5 h-3.5" />,
  Analytics: <Activity className="w-3.5 h-3.5" />,
  'AI / ML': <BrainCircuit className="w-3.5 h-3.5" />,
  Config: <Package className="w-3.5 h-3.5" />,
  Source: <Package className="w-3.5 h-3.5" />,
  Other: <Package className="w-3.5 h-3.5" />,
};

// ─── Category bar colors ────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Compute: 'bg-blue-500',
  Data: 'bg-emerald-500',
  'Data Storage': 'bg-emerald-500',
  Messaging: 'bg-purple-500',
  Networking: 'bg-cyan-500',
  Security: 'bg-amber-500',
  Observability: 'bg-pink-500',
  Analytics: 'bg-orange-500',
  'AI / ML': 'bg-violet-500',
  Config: 'bg-slate-500',
  Source: 'bg-slate-400',
  Other: 'bg-gray-500',
};

const TRAFFIC_TIER_KEY = 'ice-cost-traffic-tier';

function loadTrafficTier(): number {
  try {
    const v = localStorage.getItem(TRAFFIC_TIER_KEY);
    if (!v) return 2;
    const parsed = parseInt(v, 10);
    return Math.max(0, Math.min(TRAFFIC_TIERS.length - 1, parsed));
  } catch {
    return 2;
  }
}

function saveTrafficTier(value: number) {
  try {
    localStorage.setItem(TRAFFIC_TIER_KEY, String(value));
  } catch {
    /* ignore */
  }
}

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

// ── Category Row ────────────────────────────────────────────────────────────

const CategoryRow: React.FC<{
  category: CategoryCost;
  totalCost: number;
}> = ({ category, totalCost }) => {
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

// ── Projection Row ──────────────────────────────────────────────────────────

const ProjectionRow: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-0.5">
    <span className="text-ice-xs text-ice-text-2">{label}</span>
    <span className="text-ice-sm text-ice-text-1 font-mono">
      {formatCostRaw(value)}
      {label === 'Monthly' ? '/mo' : label === 'Quarterly' ? '/qtr' : '/yr'}
    </span>
  </div>
);

// ── Scaling Range Bar ───────────────────────────────────────────────────────

const ScalingRangeBar: React.FC<{ range: { minCost: number; currentCost: number; maxCost: number } }> = ({ range }) => {
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

// ── Environment Comparison ──────────────────────────────────────────────────

const EnvironmentComparison: React.FC<{
  environments: Environment[];
  allCards: Array<{ id: string; name: string; nodes: CardNode[] }>;
  activeCardId: string;
  currentCost: number;
  resourceMap: ResourceMap | null;
}> = ({ environments, allCards, activeCardId, currentCost, resourceMap }) => {
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

// ═════════════════════════════════════════════════════════════════════════════
// Optimization suggestion engine
// ═════════════════════════════════════════════════════════════════════════════

interface CostSuggestion {
  message: string;
  savings?: string;
  severity: 'high' | 'medium' | 'low';
}

function generateSuggestions(summary: CostSummary, nodes: CardNode[], environments: Environment[]): CostSuggestion[] {
  const suggestions: CostSuggestion[] = [];

  // Check for dev environments using production-tier instances
  const devEnvs = environments.filter((e) => e.type === 'development' || e.type === 'pr');
  if (devEnvs.length > 0 && summary.totalMonthlyCost > 50) {
    // Look for nodes with large instance sizes in what might be dev cards
    const expensiveNodes = nodes.filter((n) => {
      const cost = parseCostRange((n.data?.estimatedCost as string) || '');
      return cost > 50;
    });
    if (expensiveNodes.length > 0) {
      suggestions.push({
        message: `${expensiveNodes.length} resource(s) cost >$50/mo. Consider using "dev" scale preset for non-production environments.`,
        savings: `~${formatCostRaw(expensiveNodes.reduce((s, n) => s + parseCostRange((n.data?.estimatedCost as string) || '') * 0.6, 0))}/mo`,
        severity: 'medium',
      });
    }
  }

  // Check for scalable services not using autoscaling
  const scalableWithFixedInstances = nodes.filter((n) => {
    const behavior = (n.data?.behavior as string) || '';
    const min = (n.data?.minInstances as number) || 1;
    const max = (n.data?.maxInstances as number) || min;
    return behavior === 'scalable' && min === max && max > 1;
  });
  if (scalableWithFixedInstances.length > 0) {
    suggestions.push({
      message: `${scalableWithFixedInstances.length} scalable service(s) have min = max instances. Enable autoscaling to save during low-traffic periods.`,
      severity: 'medium',
    });
  }

  // Check for high max instance counts
  const highMaxInstances = nodes.filter((n) => {
    const max = (n.data?.maxInstances as number) || 0;
    return max > 10;
  });
  if (highMaxInstances.length > 0) {
    const maxCostDelta = summary.scalingRange.maxCost - summary.scalingRange.currentCost;
    if (maxCostDelta > 100) {
      suggestions.push({
        message: `At maximum scale, costs could reach ${formatCost(summary.scalingRange.maxCost)}. Set scaling caps to limit unexpected spend.`,
        savings: `Cap at ${formatCostRaw(maxCostDelta)}/mo max overage`,
        severity: 'high',
      });
    }
  }

  // Reserved instance savings hint
  if (summary.totalMonthlyCost > 200) {
    suggestions.push({
      message: 'For stable workloads, 1-year reserved instances or committed use discounts can save 25–40%.',
      savings: `~${formatCostRaw(summary.totalMonthlyCost * 0.3)}/mo`,
      severity: 'low',
    });
  }

  // Single availability zone warning
  const dbNodes = nodes.filter((n) => {
    const iceType = (n.data?.iceType as string) || '';
    return iceType.startsWith('Data.');
  });
  const nonHaDb = dbNodes.filter((n) => !(n.data?.multi_az as boolean));
  if (nonHaDb.length > 0 && summary.totalMonthlyCost > 100) {
    suggestions.push({
      message: `${nonHaDb.length} database(s) not using multi-AZ. Production workloads should enable HA — costs ~2x but prevents outages.`,
      severity: 'medium',
    });
  }

  return suggestions;
}

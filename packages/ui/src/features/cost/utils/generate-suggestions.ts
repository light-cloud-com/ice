/**
 * Cost optimization suggestion engine.
 *
 * Lifted from `cost-panel.tsx` (rf-cost-2). Given a `CostSummary`, the active
 * card's `nodes`, and the project's `environments`, returns a (possibly empty)
 * list of human-readable hints with optional savings estimates and a severity
 * tag.
 *
 * Each rule is independent — the function appends a suggestion when the rule
 * fires and never short-circuits, so multiple suggestions can stack. The
 * exposed rule set:
 *
 *   1. Dev environments using production-tier instances ($50+ resources)
 *   2. Scalable services with min == max (autoscaling not engaged)
 *   3. High max instance counts producing > $100 of headroom
 *   4. Reserved instance / committed-use savings hint at $200+/mo total
 *   5. Database nodes not configured for multi-AZ
 *
 * The original orchestrator imported `parseCostRange` and `formatCost(Raw)`
 * from `../utils/cost-calculator`; we re-import them here so the helper is
 * self-contained.
 */

import { parseCostRange, formatCost, formatCostRaw, type CostSummary } from './cost-calculator';
import type { CardNode } from '../../../store/slices/cards-slice';
import type { Environment } from '../../../store/slices/environments-slice';

export interface CostSuggestion {
  message: string;
  savings?: string;
  severity: 'high' | 'medium' | 'low';
}

export function generateSuggestions(
  summary: CostSummary,
  nodes: CardNode[],
  environments: Environment[],
): CostSuggestion[] {
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

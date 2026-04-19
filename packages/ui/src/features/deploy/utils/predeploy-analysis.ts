/**
 * Pre-Deploy Analysis (AI-Native #3)
 *
 * Combines security rules + static cost estimator into a single snapshot
 * rendered between Plan and Apply.
 */

import { analyzeSecurityWarnings, type PreDeployWarning } from './security-rules';
import { estimateCosts, type CostEstimate } from './cost-estimator';
import type { CardNode, CardEdge } from '../../../store/slices/cards-slice';

export type { PreDeployWarning } from './security-rules';
export type { CostEstimate } from './cost-estimator';

export interface PreDeployAnalysis {
  warnings: PreDeployWarning[];
  costEstimates: CostEstimate[];
  totalMonthlyCost: number;
  hasCritical: boolean;
}

export function analyzePreDeploy(nodes: CardNode[], edges: CardEdge[]): PreDeployAnalysis {
  const warnings = analyzeSecurityWarnings(nodes, edges);
  const { estimates, total } = estimateCosts(nodes);
  return {
    warnings,
    costEstimates: estimates,
    totalMonthlyCost: total,
    hasCritical: warnings.some((w) => w.severity === 'critical'),
  };
}

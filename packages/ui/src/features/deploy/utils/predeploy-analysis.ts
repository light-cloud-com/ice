/**
 * Pre-Deploy Analysis (AI-Native #3)
 *
 * Security-warnings snapshot rendered between Plan and Apply.
 *
 * Cost estimation deliberately does NOT live here. The Cost Estimation panel
 * (`features/cost/`) is the single source of truth for every cost number in
 * the app — its engine reads the live resource definitions, respects the
 * traffic-tier slider, and handles multi-provider canvases. A second parallel
 * estimator in the deploy panel used to exist but reported different numbers
 * for the same canvas, so it was removed.
 */

import { analyzeSecurityWarnings, type PreDeployWarning } from './security-rules';
import type { CardNode, CardEdge } from '../../../store/slices/cards-slice';

export type { PreDeployWarning } from './security-rules';

export interface PreDeployAnalysis {
  warnings: PreDeployWarning[];
  hasCritical: boolean;
}

export function analyzePreDeploy(nodes: CardNode[], edges: CardEdge[]): PreDeployAnalysis {
  const warnings = analyzeSecurityWarnings(nodes, edges);
  return {
    warnings,
    hasCritical: warnings.some((w) => w.severity === 'critical'),
  };
}

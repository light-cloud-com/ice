/**
 * Deploy-status → CSS class mapping for environment status dots.
 *
 * Now a thin wrapper over the canonical `deployStatusMeta` (IA4) so the env dots
 * share one vocabulary + colour map with the status bar and Deployments list.
 * Output is unchanged for the statuses this previously handled.
 */

import { deployStatusMeta } from '../../../shared/utils/deploy-status';

export interface DeployStatusInput {
  status?: string;
}

export function getDeployStatusDotColor(deployStatus: DeployStatusInput | undefined): string {
  return deployStatusMeta(deployStatus?.status).dotClass;
}

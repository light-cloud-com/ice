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

/** Canonical i18n label key for the dot — pairs the colour with an AT-reachable
 *  name so the status (incl. EI9's "fetch-error") isn't colour-only. */
export function getDeployStatusLabelKey(deployStatus: DeployStatusInput | undefined): string {
  return deployStatusMeta(deployStatus?.status).labelKey;
}

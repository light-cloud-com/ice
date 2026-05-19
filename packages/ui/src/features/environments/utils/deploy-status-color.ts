/**
 * Deploy-status → CSS class mapping for environment status dots.
 *
 * Extracted from `components/environment-tab-bar.tsx` during rf-etabs-1.
 * Keeps the chained ternary verbatim in classification logic, only swaps
 * the inline expression for a named pure function. Returns the Tailwind
 * class string for the dot color/animation; default falls back to a muted
 * grey/30 when no deploy status is available.
 */

export interface DeployStatusInput {
  status?: string;
}

export function getDeployStatusDotColor(deployStatus: DeployStatusInput | undefined): string {
  return deployStatus?.status === 'success'
    ? 'bg-emerald-500'
    : deployStatus?.status === 'deploying'
      ? 'bg-blue-500 animate-pulse'
      : deployStatus?.status === 'failed'
        ? 'bg-red-500'
        : deployStatus?.status === 'planning' || deployStatus?.status === 'queued'
          ? 'bg-amber-500 animate-pulse'
          : 'bg-ice-text-3/30';
}

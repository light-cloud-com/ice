import { t } from '../../../../../i18n';

/** Truncate text with ellipsis */
export function truncate(t: string, n: number) {
  return !t ? '' : t.length <= n ? t : t.slice(0, n) + '\u2026';
}

/** Extract owner/repo from full repo URL */
export function shortRepo(r: string) {
  if (!r) return '';
  const m = r.match(/(?:github|gitlab)\.com\/(.+?)(?:\.git)?$/);
  return m ? m[1] : r.includes('/') && !r.includes('://') ? r : r;
}

/** Extract hostname from URL */
export function shortDomain(d: string) {
  if (!d) return '';
  try {
    if (d.includes('://')) return new URL(d).hostname;
  } catch {
    /* */
  }
  return d;
}

/** Placeholder styling prefix — rendered with lower opacity in the SVG */
const PH = '\u00A0';

export function ph(text: string): string {
  return PH + text;
}

export function isPlaceholder(text: string): boolean {
  return text.startsWith(PH);
}

/** Count items in a list field */
export function listCount(val: unknown): number {
  return Array.isArray(val) ? val.length : 0;
}

/**
 * Inline badge config for a deploy overlay status — used by the LOD3 header
 * to show the user which lifecycle phase a block is in. Returns `null` for
 * idle / unknown statuses so the badge is omitted entirely (i.e. brand-new
 * blocks pre-deploy don't get an artificial "IDLE" pill).
 *
 * The six known overlay strings are produced by `mapWireStatusToOverlay`
 * in `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts`
 * and the matching server-side mapping in `services/deploy/.../deploy.service.ts`.
 * Colors here MUST stay in lock-step with the keys in `STATUS_COLORS`
 * (`packages/ui/src/config/canvas-constants.ts`) so the dot/border path
 * (which looks up by status string) and the badge color stay visually
 * coherent. See learning anchor `deploy-overlay-mapping-must-match-status-colors-keyset`.
 *
 * Label width budget: the existing pills sit inside a flex header next to
 * the provider pill + concept-info trigger. 'LIVE' (4) / 'DEPLOY' (6) /
 * 'ERR' (3) all fit; 'CANCELLED' (9) overflows visibly on small blocks,
 * so we shorten it to 'CANCEL'. 'QUEUED' (6) and 'SKIPPED' (7) fit.
 */
export interface DeployBadgeConfig {
  color: string;
  label: string;
}

export function getDeployBadge(deployStatus: string): DeployBadgeConfig | null {
  switch (deployStatus) {
    case 'active':
      return { color: '#22c55e', label: t('canvas.deployBadge.live') };
    case 'deploying':
      return { color: '#3b82f6', label: t('canvas.deployBadge.deploy') };
    case 'error':
      return { color: '#ef4444', label: t('canvas.deployBadge.err') };
    case 'queued':
      return { color: '#f59e0b', label: t('canvas.deployBadge.queued') };
    case 'cancelled':
      return { color: '#94a3b8', label: t('canvas.deployBadge.cancel') };
    case 'skipped':
      return { color: '#94a3b8', label: t('canvas.deployBadge.skipped') };
    default:
      return null;
  }
}

/**
 * Canonical deploy-status vocabulary (IA4).
 *
 * Deploy status was rendered in three places — the status bar, the Environments
 * page, and the Deployments list — each with its OWN switch, labels, and colors
 * (e.g. the status bar said "Deploy failed" off `error` while the others said
 * "Failed" off `failed`). This maps every raw status string the app produces
 * onto one canonical { tone, labelKey } pair (+ a dot class for the tailwind
 * surfaces), so the surfaces agree on what a deploy state is called and coloured.
 *
 * `tone` is the canonical bucket; surfaces that use a different colour system
 * (e.g. the status bar's ice-* tokens) can map the tone themselves while still
 * sharing the label.
 */

export type DeployStatusTone = 'success' | 'failed' | 'in-progress' | 'pending' | 'cancelled' | 'idle';

export interface DeployStatusMeta {
  tone: DeployStatusTone;
  /** Canonical i18n key for the human label. */
  labelKey: string;
  /** Tailwind dot class (bg colour + pulse for active/pending) for dot surfaces. */
  dotClass: string;
}

const TONE_DOT: Record<DeployStatusTone, string> = {
  success: 'bg-emerald-500',
  failed: 'bg-red-500',
  'in-progress': 'bg-blue-500 animate-pulse',
  pending: 'bg-amber-500 animate-pulse',
  cancelled: 'bg-ice-text-3/50',
  idle: 'bg-ice-text-3/30',
};

export function deployStatusTone(raw: string | undefined | null): DeployStatusTone {
  switch (raw) {
    case 'success':
      return 'success';
    case 'error':
    case 'failed':
      return 'failed';
    case 'deploying':
    case 'destroying':
      return 'in-progress';
    case 'planning':
    case 'planned':
    case 'queued':
    case 'authenticating':
      return 'pending';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'idle';
  }
}

const LABEL_KEY: Record<string, string> = {
  success: 'deployStatus.deployed',
  error: 'deployStatus.failed',
  failed: 'deployStatus.failed',
  deploying: 'deployStatus.deploying',
  destroying: 'deployStatus.destroying',
  planning: 'deployStatus.planning',
  planned: 'deployStatus.planReady',
  queued: 'deployStatus.queued',
  authenticating: 'deployStatus.connecting',
  cancelled: 'deployStatus.cancelled',
};

export function deployStatusMeta(raw: string | undefined | null): DeployStatusMeta {
  const tone = deployStatusTone(raw);
  const labelKey = (raw && LABEL_KEY[raw]) || 'deployStatus.notDeployed';
  return { tone, labelKey, dotClass: TONE_DOT[tone] };
}

/**
 * LiveAnnouncer — a single polite screen-reader live region (AX2).
 *
 * The deploy lifecycle was entirely silent to assistive tech: a low-vision user
 * triggered a deploy and heard nothing about whether it was running, succeeded,
 * or failed. This mounts one visually-hidden `aria-live="polite"` region in the
 * shell whose text mirrors the deploy status, so transitions are announced.
 *
 * Kept deliberately coarse (start / succeeded / failed) rather than per-node so
 * the announcements aren't chatty — the text only changes on status
 * transitions, which is exactly when a live region should speak.
 */

import React, { useMemo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { useTranslation } from '../../i18n';
import { deriveRollup, type DeployStatus } from '../../store/slices/deploy-slice';
import type { RootState } from '../../store';

// Visually hidden, but present in the accessibility tree.
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

type T = (key: string, vars?: Record<string, string | number>) => string;

/** Pure status → announcement mapping (exported for unit testing). */
export function deployAnnouncement(t: T, status: DeployStatus, rollup: { total: number; failed: number }): string {
  switch (status) {
    case 'authenticating':
      return t('a11y.announce.connecting');
    case 'planning':
      return t('a11y.announce.planning');
    case 'planned':
      return t('a11y.announce.planReady');
    case 'deploying':
      return rollup.total > 0
        ? t('a11y.announce.deployingCount', { total: rollup.total })
        : t('a11y.announce.deploying');
    case 'destroying':
      return t('a11y.announce.destroying');
    case 'success':
      return t('a11y.announce.deploySucceeded');
    case 'error':
      return rollup.failed > 0
        ? t('a11y.announce.deployFailedCount', { failed: rollup.failed })
        : t('a11y.announce.deployFailed');
    default:
      return '';
  }
}

export const LiveAnnouncer: React.FC = () => {
  const { t } = useTranslation();
  const status = useSelector((s: RootState) => s.deploy.status);
  const nodesById = useSelector((s: RootState) => s.deploy.nodesById, shallowEqual);
  const rollup = useMemo(() => deriveRollup(nodesById), [nodesById]);
  const message = deployAnnouncement(t, status, rollup);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY} data-testid="live-announcer">
      {message}
    </div>
  );
};

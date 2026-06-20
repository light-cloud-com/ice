/**
 * Drift-detection UI section for the right-hand properties panel.
 *
 * Two components live here, both extracted verbatim from `properties-panel.tsx`
 * during rf-props-10:
 *
 *  - `DriftIndicator` reads the per-node drift state from Redux
 *    (`s.deploy.driftByNode[nodeId]` + `s.deploy.driftCheckLoading`) and
 *    renders the visual badge — loading spinner, in-sync emerald dot,
 *    not-in-deployment amber dot, or drifted orange dot with the diff list.
 *
 *  - `DriftCheckButton` consumes the `useDriftCheck` hook (rf-props-8) to
 *    fire a re-check. Its loading state is the same Redux flag the indicator
 *    subscribes to, so the spinner inside the button and the spinner in the
 *    indicator share a single source of truth.
 *
 * Tailwind classes, i18n keys, and conditional render order are preserved
 * exactly as they were inside the orchestrator.
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { t } from '../../../../i18n';
import { useDriftCheck } from '../../hooks/use-drift-check';
import type { RootState } from '../../../../store';

// OS4 — a drift result is only as trustworthy as how recently it ran. Render
// the check timestamp under the indicator and flag it stale past the window so
// a green dot can't quietly age into a lie.
const STALE_AFTER_MS = 10 * 60 * 1000;

function formatChecked(checkedAt: string | null): { label: string; stale: boolean } | null {
  if (!checkedAt) return null;
  const then = new Date(checkedAt).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Math.max(0, Date.now() - then);
  const stale = diffMs > STALE_AFTER_MS;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return { label: t('properties.drift.justNow'), stale };
  if (mins < 60) return { label: t('properties.drift.checkedAgo', { ago: `${mins}m` }), stale };
  const hrs = Math.floor(mins / 60);
  return { label: t('properties.drift.checkedAgo', { ago: `${hrs}h` }), stale };
}

const CheckedFooter: React.FC<{ checkedAt: string | null }> = ({ checkedAt }) => {
  const info = formatChecked(checkedAt);
  if (!info) return null;
  return (
    <div className={`text-ice-2xs mt-1 ${info.stale ? 'text-amber-500/80' : 'text-ice-text-3/60'}`}>
      {info.label}
      {info.stale ? ` · ${t('properties.drift.stale')}` : ''}
    </div>
  );
};

export const DriftIndicator: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const driftInfo = useSelector((s: RootState) => s.deploy.driftByNode[nodeId]);
  const driftMeta = useSelector((s: RootState) => s.deploy.driftMeta);
  const isLoading = useSelector((s: RootState) => s.deploy.driftCheckLoading);

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-ice-xs text-ice-text-3 flex items-center gap-1.5">
        <div className="w-3 h-3 border border-ice-text-3 border-t-transparent rounded-full animate-spin" />
        {t('properties.drift.checking')}
      </div>
    );
  }

  if (!driftInfo) return null;

  const checkedAt = driftMeta?.checkedAt ?? null;

  // OS3 — the cloud was never actually queried (no creds / provider has no
  // describe path). NEVER present this as a verified "in sync"; show a
  // stored-state caveat regardless of the per-node status the fallback produced.
  if (driftMeta?.unsupported) {
    return (
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-ice-text-3/60" />
          <span className="text-ice-xs text-ice-text-3 font-medium">{t('properties.drift.unverified')}</span>
        </div>
        <CheckedFooter checkedAt={checkedAt} />
      </div>
    );
  }

  if (driftInfo.status === 'in_sync') {
    return (
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-ice-xs text-emerald-500 font-medium">{t('properties.drift.inSync')}</span>
        </div>
        <CheckedFooter checkedAt={checkedAt} />
      </div>
    );
  }

  if (driftInfo.status === 'missing') {
    return (
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-ice-xs text-amber-500 font-medium">{t('properties.drift.notInDeployment')}</span>
        </div>
        <CheckedFooter checkedAt={checkedAt} />
      </div>
    );
  }

  if (driftInfo.status === 'drifted' && driftInfo.changes.length > 0) {
    return (
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <span className="text-ice-xs text-orange-500 font-medium">
            {t('properties.drift.drifted')} ({driftInfo.changes.length}{' '}
            {driftInfo.changes.length === 1 ? t('properties.drift.change') : t('properties.drift.changes')})
          </span>
        </div>
        <div className="space-y-1.5 ml-3">
          {driftInfo.changes.map((change, i) => (
            <div key={i} className="text-ice-2xs">
              <span className="text-ice-text-3">{change.path}</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-red-400 line-through">{String(change.actual)}</span>
                <span className="text-ice-text-3">&rarr;</span>
                <span className="text-emerald-400">{String(change.desired)}</span>
              </div>
            </div>
          ))}
        </div>
        <CheckedFooter checkedAt={checkedAt} />
      </div>
    );
  }

  // OS7 — 'unknown' / 'extra' used to render as nothing (silent dead-ends).
  // Surface them honestly so the user knows the check ran but couldn't classify.
  if (driftInfo.status === 'unknown' || driftInfo.status === 'extra') {
    return (
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-ice-text-3/60" />
          <span className="text-ice-xs text-ice-text-3 font-medium">
            {driftInfo.status === 'extra' ? t('properties.drift.extra') : t('properties.drift.unknown')}
          </span>
        </div>
        <CheckedFooter checkedAt={checkedAt} />
      </div>
    );
  }

  return null;
};

export const DriftCheckButton: React.FC<{ cardId: string; nodes: any[] }> = ({ cardId, nodes }) => {
  const { isLoading, checkDrift } = useDriftCheck(cardId, nodes);

  return (
    <div className="px-3 py-2">
      <button
        onClick={() => checkDrift()}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-ice-xs font-medium rounded border border-ice-border text-ice-text-2 hover:bg-ice-hover transition-colors disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <div className="w-3 h-3 border border-ice-text-3 border-t-transparent rounded-full animate-spin" />
            {t('properties.drift.checkingButton')}
          </>
        ) : (
          t('properties.drift.checkButton')
        )}
      </button>
    </div>
  );
};

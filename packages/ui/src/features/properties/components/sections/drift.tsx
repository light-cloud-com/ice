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

export const DriftIndicator: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const driftInfo = useSelector((s: RootState) => s.deploy.driftByNode[nodeId]);
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

  if (driftInfo.status === 'in_sync') {
    return (
      <div className="px-3 py-2 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-ice-xs text-emerald-500 font-medium">{t('properties.drift.inSync')}</span>
      </div>
    );
  }

  if (driftInfo.status === 'missing') {
    return (
      <div className="px-3 py-2 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        <span className="text-ice-xs text-amber-500 font-medium">{t('properties.drift.notInDeployment')}</span>
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

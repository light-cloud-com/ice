/**
 * Repo Deploy List — recent deployment events for a Source.Repository card.
 *
 * Renders up to 8 most-recent `DeploymentEvent` rows (already aggregated by
 * the caller from per-service fetches via `fetchEventsForNode`). Each row is
 * a status-dot + commit-sha + commit-message + environment/branch + age stamp,
 * collapsible to reveal the per-event `deployment_logs`, an inline error,
 * elapsed duration, and a Retry button on `failed` events. Retry uses a
 * dynamic `getApi()` import + `pipeline.retryDeploy(id)` then re-dispatches
 * `fetchEventsForNode` for every connected service so the new attempt's
 * status replaces the failed one in-place.
 *
 * The `connectedServices` prop is the list of service nodes wired to the
 * repo card on the canvas — used only inside the retry handler to know which
 * service nodes' event lists to refresh, not for grouping/headers (the events
 * arrive pre-aggregated). A single callsite in `properties-panel.tsx` (the
 * SourceRepositorySection territory) renders this component when there are
 * any aggregated events to show.
 *
 * Extracted verbatim from `properties-panel.tsx` lines 1693–1801 during
 * rf-props-17. The expand/collapse toggle, the 8-row slice, the status-color
 * map, the `formatAge` call shape, the dynamic `getApi` import inside the
 * retry click handler, and the per-service `fetchEventsForNode` re-dispatch
 * loop are all preserved exactly.
 */

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { t } from '../../../../i18n';
import { fetchEventsForNode, type DeploymentEvent, type DeployStep } from '../../../../store/slices/pipeline-slice';
import { formatAge } from '../../utils/format-age';
import { Section } from '../fields';
import type { AppDispatch } from '../../../../store';

// ─── Repo Deploy List (grouped by service, expandable logs) ─────────────────

export const RepoDeployList: React.FC<{
  events: DeploymentEvent[];
  connectedServices: Array<{ id: string; label: string }>;
  cardId: string;
}> = ({ events, connectedServices, cardId }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Section title={t('pipeline.serviceDeploys')}>
      <div className="space-y-1">
        {events.slice(0, 8).map((ev) => {
          const isExpanded = expandedId === ev.id;
          const logs = (ev.deployment_logs || []) as DeployStep[];
          return (
            <div key={ev.id} className="rounded border border-ice-border overflow-hidden">
              <div
                className="flex items-center gap-1.5 text-ice-xs px-2 py-1.5 cursor-pointer hover:bg-ice-hover transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : ev.id)}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    ev.status === 'success'
                      ? 'bg-emerald-500'
                      : ev.status === 'failed'
                        ? 'bg-red-500'
                        : ev.status === 'building' || ev.status === 'deploying'
                          ? 'bg-blue-500 animate-pulse'
                          : 'bg-ice-text-3'
                  }`}
                />
                <span className="font-mono text-ice-text-2">{ev.commit_sha?.slice(0, 7)}</span>
                <span className="text-ice-text-3 truncate flex-1">{ev.commit_message}</span>
                <span className="text-ice-text-3 shrink-0">{ev.rule?.environment || ev.branch}</span>
                <span className="text-ice-text-3 shrink-0">{formatAge(ev.started_at)}</span>
                <span className={`shrink-0 text-ice-text-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  &#9662;
                </span>
              </div>

              {/* Expanded logs */}
              {isExpanded && (
                <div className="border-t border-ice-border bg-slate-950 px-2 py-1.5 space-y-0.5 max-h-28 overflow-y-auto">
                  {logs.length > 0 ? (
                    logs.map((log, i) => (
                      <div key={i} className="flex items-center gap-1 text-ice-2xs font-mono">
                        <span
                          className={`shrink-0 ${
                            log.status === 'completed'
                              ? 'text-emerald-500'
                              : log.status === 'failed'
                                ? 'text-red-400'
                                : 'text-blue-400'
                          }`}
                        >
                          {log.status === 'completed' ? '✓' : log.status === 'failed' ? '✗' : '●'}
                        </span>
                        <span className={log.status === 'failed' ? 'text-red-400' : 'text-slate-300'}>
                          {log.message}
                        </span>
                        {log.duration_ms != null && (
                          <span className="ml-auto text-slate-500">{(log.duration_ms / 1000).toFixed(1)}s</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-ice-2xs font-mono text-slate-500">{t('properties.noLogsRecorded')}</div>
                  )}
                  {ev.error && (
                    <div className="text-ice-2xs font-mono text-red-400 pt-1 border-t border-slate-800">{ev.error}</div>
                  )}
                  {ev.duration_seconds != null && (
                    <div className="text-ice-2xs font-mono text-slate-500 pt-0.5">
                      {ev.duration_seconds < 60
                        ? `${ev.duration_seconds}s`
                        : `${Math.floor(ev.duration_seconds / 60)}m ${ev.duration_seconds % 60}s`}
                    </div>
                  )}
                  {ev.status === 'failed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        import('../../../../shared/api/api-adapter').then(({ getApi }) => {
                          getApi()
                            .pipeline.retryDeploy(ev.id)
                            .then(() => {
                              // Refresh events for the relevant service nodes
                              for (const svc of connectedServices) {
                                dispatch(fetchEventsForNode({ cardId, nodeId: svc.id }));
                              }
                            });
                        });
                      }}
                      className="mt-1 px-2 py-0.5 text-ice-2xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                    >
                      {t('common.buttons.retry')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
};

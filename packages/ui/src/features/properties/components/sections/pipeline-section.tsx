/**
 * Pipeline Section — deployment-rule editor + recent-events list for a service node.
 *
 * Reads deployment rules and history from `state.pipeline` (keyed by
 * `${cardId}:${nodeId}`) and renders the inline trigger-rule editor plus
 * the most-recent five `DeploymentEvent` rows with expandable build logs.
 * Mounts dispatch `fetchRulesForNode` + `fetchEventsForNode` and, when a
 * repository is resolved (either directly via `nodeRepo` or by walking the
 * card's edges to a connected `Source.Repository` node), fires
 * `fetchGitHubBranches(repository)` so the branch picker has data. When
 * rules load empty (after the fetch resolves), an auto-create effect emits
 * a default `production`-environment rule for the repo's main/master branch.
 *
 * The Add-trigger button creates a new rule on a yet-unused branch (defaults
 * to `develop`); each row's enabled toggle, branch select, environment select,
 * and delete button dispatch `updatePipelineRule` / `deletePipelineRule`. The
 * recent-events list slices to the latest five and uses `formatAge` for the
 * relative-time stamp; failed events expose a Retry button whose handler
 * does a dynamic `import('../../../../shared/api/api-adapter')` then calls
 * `getApi().pipeline.retryDeploy(eventId)` and re-dispatches
 * `fetchEventsForNode` to refresh the row in-place.
 *
 * Extracted verbatim from `properties-panel.tsx` lines 896–1185 during
 * rf-props-20. The two dynamic imports inside `handleRetry` (the planner
 * flagged the double-import as a follow-up cleanup candidate, NOT in scope
 * here) are preserved exactly. Every `import('...')` string literal had its
 * relative-path bumped to the new file's depth (one extra `..` segment) —
 * see the rf-props blueprint behavior-risk flag #3.
 */

import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { t } from '../../../../i18n';
import { fetchGitHubBranches } from '../../../../store/slices/integrations-slice';
import {
  fetchRulesForNode,
  fetchEventsForNode,
  createPipelineRule,
  updatePipelineRule,
  deletePipelineRule,
  type DeployStep,
} from '../../../../store/slices/pipeline-slice';
import { formatAge } from '../../utils/format-age';
import { Section } from '../fields';
import type { RootState, AppDispatch } from '../../../../store';

// ─── Pipeline Section (inline in Properties panel) ──────────────────────────

export const PipelineSection: React.FC<{
  cardId: string;
  nodeId: string;
  nodeRepo: string;
  activeCard: any;
}> = ({ cardId, nodeId, nodeRepo, activeCard }) => {
  const dispatch = useDispatch<AppDispatch>();
  const key = `${cardId}:${nodeId}`;
  const rules = useSelector((s: RootState) => s.pipeline.rules[key] || []);
  const rulesLoaded = useSelector((s: RootState) => key in s.pipeline.rules);
  const rulesLoading = useSelector((s: RootState) => s.pipeline.rulesLoading);
  const events = useSelector((s: RootState) => s.pipeline.history[key] || []);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Resolve repository from this node or a connected Source.Repository block
  let repository = nodeRepo;
  if (!repository && activeCard && nodeId) {
    const edges = (activeCard.edges || []) as Array<{ source: string; target: string }>;
    const connectedEdges = edges.filter((e: any) => e.source === nodeId || e.target === nodeId);
    for (const edge of connectedEdges) {
      const otherId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = (activeCard.nodes || []).find((n: any) => n.id === otherId);
      if (otherNode?.data?.iceType === 'Source.Repository' || otherNode?.data?.behavior === 'source') {
        repository = (otherNode.data.repository as string) || '';
        break;
      }
    }
  }

  const branches = useSelector((s: RootState) => (repository ? s.integrations.github.branches[repository] || [] : []));

  // Fetch rules + branches on mount
  useEffect(() => {
    if (!cardId || !nodeId) return;
    dispatch(fetchRulesForNode({ cardId, nodeId }));
    dispatch(fetchEventsForNode({ cardId, nodeId }));
    if (repository && branches.length === 0) {
      dispatch(fetchGitHubBranches(repository));
    }
  }, [cardId, nodeId, repository, branches.length, dispatch]);

  // Auto-create default rule when rules load empty
  const [autoCreated, setAutoCreated] = useState(false);
  useEffect(() => {
    if (!repository || !rulesLoaded || autoCreated || rules.length > 0) return;
    setAutoCreated(true);
    const defaultBranch = branches.find((b) => b.name === 'main')
      ? 'main'
      : branches.find((b) => b.name === 'master')
        ? 'master'
        : branches[0]?.name || 'main';

    dispatch(
      createPipelineRule({
        cardId,
        nodeId,
        repository,
        branchPattern: defaultBranch,
        environment: 'production',
      }),
    )
      .then(() => dispatch(fetchRulesForNode({ cardId, nodeId })))
      .catch((err: any) => console.error('[Pipeline] Auto-create failed:', err));
  }, [repository, rulesLoaded, rules.length, autoCreated, branches, cardId, dispatch, nodeId]);

  // No repo connected → don't show the section
  if (!repository) return null;

  const handleAddRule = () => {
    const usedBranches = new Set(rules.map((r) => r.branch_pattern));
    const unused = branches.find((b) => !usedBranches.has(b.name));
    const branchName = unused?.name || 'develop';
    const env =
      branchName === 'main' || branchName === 'master'
        ? 'production'
        : branchName.includes('stag')
          ? 'staging'
          : 'development';

    dispatch(
      createPipelineRule({
        cardId,
        nodeId,
        repository,
        branchPattern: branchName,
        environment: env,
      }),
    ).then(() => dispatch(fetchRulesForNode({ cardId, nodeId })));
  };

  const handleRetry = (eventId: string) => {
    import('../../../../store/slices/pipeline-slice').then(({ default: _, ..._mod }) => {
      // retryDeploy is on the API adapter, not a thunk — call it directly
      import('../../../../shared/api/api-adapter').then(({ getApi }) => {
        getApi()
          .pipeline.retryDeploy(eventId)
          .then(() => {
            dispatch(fetchEventsForNode({ cardId, nodeId }));
          });
      });
    });
  };

  return (
    <Section title={t('pipeline.serviceDeploys')}>
      {/* Loading */}
      {(rulesLoading || (autoCreated && rules.length === 0)) && (
        <div className="text-ice-xs text-ice-text-3 py-1">{t('pipeline.settingUp')}</div>
      )}

      {/* Trigger rules */}
      {rules.length > 0 && (
        <div className="space-y-1.5">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center gap-1.5 text-ice-xs rounded border px-2 py-1.5 ${
                rule.enabled ? 'border-ice-border bg-ice-raised' : 'border-ice-border/50 opacity-50'
              }`}
            >
              {/* Toggle */}
              <button
                onClick={() => dispatch(updatePipelineRule({ ruleId: rule.id, updates: { enabled: !rule.enabled } }))}
                className={`w-6 h-3.5 rounded-full relative shrink-0 transition-colors ${rule.enabled ? 'bg-emerald-500' : 'bg-ice-border'}`}
              >
                <div
                  className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${rule.enabled ? 'left-3' : 'left-0.5'}`}
                />
              </button>

              <span className="text-ice-text-3">{t('pipeline.push')}</span>

              {/* Branch */}
              <select
                value={rule.branch_pattern}
                onChange={(e) =>
                  dispatch(updatePipelineRule({ ruleId: rule.id, updates: { branchPattern: e.target.value } }))
                }
                className="px-1 py-0.5 text-ice-xs rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono max-w-[80px]"
              >
                {branches.length > 0 ? (
                  <>
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                    <option value="*">*</option>
                  </>
                ) : (
                  <>
                    <option value={rule.branch_pattern}>{rule.branch_pattern}</option>
                    <option value="*">*</option>
                  </>
                )}
              </select>

              <span className="text-ice-text-3">&rarr;</span>

              {/* Environment */}
              <select
                value={rule.environment}
                onChange={(e) =>
                  dispatch(updatePipelineRule({ ruleId: rule.id, updates: { environment: e.target.value } }))
                }
                className="px-1 py-0.5 text-ice-xs rounded border border-ice-border bg-ice-base text-ice-text-1 max-w-[85px]"
              >
                <option value="production">{t('pipeline.envProduction')}</option>
                <option value="staging">{t('pipeline.envStaging')}</option>
                <option value="development">{t('pipeline.envDevelopment')}</option>
              </select>

              {/* Delete */}
              <button
                onClick={() =>
                  dispatch(deletePipelineRule({ ruleId: rule.id, cardId: rule.card_id, nodeId: rule.node_id }))
                }
                className="ml-auto text-ice-text-3 hover:text-red-400 transition-colors"
                title={t('pipeline.removeTrigger')}
              >
                &times;
              </button>
            </div>
          ))}

          {/* Add trigger */}
          <button onClick={handleAddRule} className="text-ice-xs text-ice-text-3 hover:text-blue-400 transition-colors">
            {t('pipeline.addTrigger')}
          </button>
        </div>
      )}

      {/* Recent deployments with expandable logs */}
      {events.length > 0 && (
        <div className="mt-2 pt-2 border-t border-ice-border space-y-1">
          <div className="text-ice-xs text-ice-text-3 font-semibold uppercase tracking-wider mb-1">
            {t('pipeline.recent')}
          </div>
          {events.slice(0, 5).map((ev) => {
            const isExpanded = expandedEventId === ev.id;
            const logs = (ev.deployment_logs || []) as DeployStep[];
            return (
              <div key={ev.id} className="rounded border border-ice-border overflow-hidden">
                <div
                  className="flex items-center gap-1.5 text-ice-xs px-2 py-1.5 cursor-pointer hover:bg-ice-hover transition-colors"
                  onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      ev.status === 'success'
                        ? 'bg-emerald-500'
                        : ev.status === 'failed'
                          ? 'bg-red-500'
                          : ev.status === 'building' || ev.status === 'deploying'
                            ? 'bg-blue-500 animate-pulse'
                            : ev.status === 'cancelled'
                              ? 'bg-ice-text-3'
                              : 'bg-ice-text-3'
                    }`}
                  />
                  <span className="font-mono text-ice-text-2">{ev.commit_sha?.slice(0, 7)}</span>
                  <span className="text-ice-text-3 truncate flex-1">{ev.commit_message}</span>
                  <span className="text-ice-text-3 shrink-0">{formatAge(ev.started_at)}</span>
                  <span className={`shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>&#9662;</span>
                </div>

                {/* Expanded log viewer */}
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
                            {log.status === 'completed' ? '\u2713' : log.status === 'failed' ? '\u2717' : '\u25CF'}
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
                      <div className="text-ice-2xs font-mono text-slate-500">{t('pipeline.noLogs')}</div>
                    )}
                    {ev.error && (
                      <div className="text-ice-2xs font-mono text-red-400 pt-1 border-t border-slate-800">
                        {ev.error}
                      </div>
                    )}
                    {ev.duration_seconds != null && (
                      <div className="text-ice-2xs font-mono text-slate-500 pt-0.5">
                        {ev.duration_seconds < 60
                          ? `${ev.duration_seconds}s`
                          : `${Math.floor(ev.duration_seconds / 60)}m ${ev.duration_seconds % 60}s`}
                      </div>
                    )}
                    {/* Retry button for failed deploys */}
                    {ev.status === 'failed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetry(ev.id);
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
      )}
    </Section>
  );
};

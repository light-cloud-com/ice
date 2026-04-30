/**
 * Source Repository Section — `Source.Repository` node configuration panel.
 *
 * Renders the right-sidebar editor for a Source.Repository card: the GitHub
 * repository picker, the branch dropdown (sourced from cached
 * `state.integrations.github.branches[<repo>]` or fallback to the current
 * value plus main/master), the build command + output directory text fields,
 * the per-connected-service trigger toggle row (manual/auto), the live
 * pipeline-status block, and the `RepoDeployList` (rf-props-17) for the
 * aggregated recent deployments across all connected service nodes.
 *
 * Reads multiple selectors against `state.integrations.github.branches`,
 * `state.pipeline.nodeStatus`, `state.pipeline.rules`, and
 * `state.pipeline.history`. Walks `activeCard.edges` to discover service
 * nodes wired to the source node and aggregates their rules + events.
 * Mount-time effects fetch branches when the repo is set but the branches
 * cache is empty, then fetch rules + events for every connected service;
 * a separate auto-create effect dispatches `createPipelineRule` once when
 * rules have loaded for at least one service and none exist yet.
 *
 * Per-control dispatches: the repo selector dispatches
 * `fetchGitHubBranches(repo)` after switching repos and resets `branch` to
 * `'main'`; the branch select / build / output controls call
 * `onUpdateField(field, value)` (the orchestrator-supplied node-data writer);
 * the trigger toggle dispatches `updatePipelineRule` (or `createPipelineRule`
 * via `handleAddRule` when no rule exists for the service); the manual
 * Deploy button uses a dynamic `import('../../../../store/slices/pipeline-slice')`
 * to call `triggerManualDeploy` without statically pulling the slice into
 * this module's import graph.
 *
 * Composes:
 *  - `RepoSelector` from `features/integrations/components/repo-selector` for
 *    repo picking.
 *  - `RepoDeployList` (rf-props-17 sibling section) for the per-service
 *    deployment-event display, fed pre-aggregated `events` +
 *    `connectedServices` + `cardId`.
 *  - `Section` and `TextField` from the shared `components/fields` bundle.
 *
 * Extracted verbatim from `properties-panel.tsx` lines 895–1243 during
 * rf-props-21. Every relative path was bumped one segment for the new
 * `components/sections/` depth: `'./fields'` → `'../fields'`,
 * `'./sections/repo-deploy-list'` → `'./repo-deploy-list'`,
 * `'../../integrations/components/repo-selector'` →
 * `'../../../integrations/components/repo-selector'`, store/slice paths +
 * `i18n` from three to four `..` segments. The dynamic
 * `import('../../../store/slices/pipeline-slice')` literal at L1167 of the
 * source becomes `'../../../../store/slices/pipeline-slice'` here — see the
 * rf-props blueprint behavior-risk flag #3 (wrong relative-path string
 * literals compile fine but throw at runtime).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { t } from '../../../../i18n';
import { fetchGitHubBranches } from '../../../../store/slices/integrations-slice';
import {
  fetchRulesForNode,
  fetchEventsForNode,
  createPipelineRule,
  updatePipelineRule,
  type DeploymentRule,
  type DeploymentEvent,
} from '../../../../store/slices/pipeline-slice';
import { RepoSelector } from '../../../integrations/components/repo-selector';
import { Section, TextField } from '../fields';
import { RepoDeployList } from './repo-deploy-list';
import type { RootState, AppDispatch } from '../../../../store';

// ─── Source.Repository Section (repo + branch + build + triggers) ────────────

export const SourceRepositorySection: React.FC<{
  nodeRepo: string;
  nodeBranch: string;
  buildCommand: string;
  outputDirectory: string;
  onUpdateField: (field: string, value: unknown) => void;
  sourceNodeId: string;
  activeCard: any;
  activeEnvName: string;
}> = ({
  nodeRepo,
  nodeBranch,
  buildCommand,
  outputDirectory,
  onUpdateField,
  sourceNodeId,
  activeCard,
  activeEnvName,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const branches = useSelector((s: RootState) => (nodeRepo ? s.integrations.github.branches[nodeRepo] || [] : []));
  const pipelineNodeStatus = useSelector((s: RootState) => s.pipeline.nodeStatus);

  // Find connected service nodes (deploy targets)
  const connectedServices = useMemo(() => {
    if (!activeCard || !sourceNodeId) return [];
    const edges = (activeCard.edges || []) as Array<{ source: string; target: string }>;
    const connected = edges.filter((e: any) => e.source === sourceNodeId || e.target === sourceNodeId);
    const services: Array<{ id: string; label: string }> = [];
    for (const edge of connected) {
      const otherId = edge.source === sourceNodeId ? edge.target : edge.source;
      const otherNode = (activeCard.nodes || []).find((n: any) => n.id === otherId);
      if (otherNode && otherNode.type === 'resource') {
        const otherIceType = (otherNode.data?.iceType as string) || '';
        if (!otherIceType.startsWith('Source.')) {
          services.push({
            id: otherNode.id,
            label: (otherNode.data?.label as string) || otherNode.id.slice(0, 8),
          });
        }
      }
    }
    return services;
  }, [activeCard, sourceNodeId]);

  // Fetch branches when repo changes
  useEffect(() => {
    if (nodeRepo && branches.length === 0) {
      dispatch(fetchGitHubBranches(nodeRepo));
    }
  }, [nodeRepo, branches.length, dispatch]);

  // Load rules for each connected service
  const cardId = activeCard?.id || '';
  useEffect(() => {
    for (const svc of connectedServices) {
      dispatch(fetchRulesForNode({ cardId, nodeId: svc.id }));
      dispatch(fetchEventsForNode({ cardId, nodeId: svc.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use .length to avoid re-firing on array reference changes
  }, [connectedServices.length, cardId, dispatch]);

  // Aggregate rules for all connected services
  const allRules = useSelector((s: RootState) => {
    const result: Array<DeploymentRule & { _serviceName: string }> = [];
    for (const svc of connectedServices) {
      const key = `${cardId}:${svc.id}`;
      const rules = s.pipeline.rules[key] || [];
      for (const r of rules) {
        result.push({ ...r, _serviceName: svc.label });
      }
    }
    return result;
  });

  const allEvents = useSelector((s: RootState) => {
    const result: DeploymentEvent[] = [];
    for (const svc of connectedServices) {
      const key = `${cardId}:${svc.id}`;
      const events = s.pipeline.history[key] || [];
      result.push(...events);
    }
    return result.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  });

  // Check if rules have loaded for at least one service
  const anyRulesLoaded = useSelector((s: RootState) =>
    connectedServices.some((svc) => `${cardId}:${svc.id}` in s.pipeline.rules),
  );

  // Auto-create default rule for first connected service if none exist
  const [autoCreated, setAutoCreated] = useState(false);
  useEffect(() => {
    if (!nodeRepo || !anyRulesLoaded || autoCreated || allRules.length > 0 || connectedServices.length === 0) return;
    setAutoCreated(true);
    const defaultBranch = branches.find((b) => b.name === 'main')
      ? 'main'
      : branches.find((b) => b.name === 'master')
        ? 'master'
        : branches[0]?.name || 'main';
    const targetService = connectedServices[0];

    dispatch(
      createPipelineRule({
        cardId,
        nodeId: targetService.id,
        repository: nodeRepo,
        branchPattern: defaultBranch,
        environment: activeEnvName,
        buildCommand: buildCommand || undefined,
        installCommand: undefined,
        outputDir: outputDirectory || undefined,
      }),
    )
      .then(() => dispatch(fetchRulesForNode({ cardId, nodeId: targetService.id })))
      .catch((err: any) => console.error('[Pipeline] Auto-create failed:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use .length for arrays to avoid re-firing on reference changes; autoCreated guard prevents loops
  }, [
    nodeRepo,
    anyRulesLoaded,
    allRules.length,
    autoCreated,
    branches.length,
    connectedServices.length,
    cardId,
    dispatch,
    activeEnvName,
    buildCommand,
    outputDirectory,
  ]);

  const handleAddRule = (serviceId: string) => {
    // Find branches not already used for this env + service
    const envRulesForService = allRules.filter((r) => r.node_id === serviceId && r.environment === activeEnvName);
    const usedBranches = new Set(envRulesForService.map((r) => r.branch_pattern));
    const unused = branches.find((b) => !usedBranches.has(b.name));
    const branchName = unused?.name || 'main';

    dispatch(
      createPipelineRule({
        cardId,
        nodeId: serviceId,
        repository: nodeRepo,
        branchPattern: branchName,
        environment: activeEnvName,
        buildCommand: buildCommand || undefined,
        outputDir: outputDirectory || undefined,
      }),
    ).then(() => dispatch(fetchRulesForNode({ cardId, nodeId: serviceId })));
  };

  return (
    <>
      {/* Repository */}
      <Section title={t('properties.source.repository')}>
        <RepoSelector
          value={nodeRepo}
          onChange={(repo) => {
            onUpdateField('repository', repo);
            if (repo && repo !== nodeRepo) {
              onUpdateField('branch', 'main');
              dispatch(fetchGitHubBranches(repo));
            }
          }}
        />
      </Section>

      {/* Branch */}
      {nodeRepo && (
        <Section title={t('properties.source.branch')}>
          <select
            value={nodeBranch}
            onChange={(e) => onUpdateField('branch', e.target.value)}
            data-prop-key="branch"
            className="w-full px-2 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {branches.length > 0 ? (
              branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                  {b.protected ? ` ${t('properties.source.branchProtected')}` : ''}
                </option>
              ))
            ) : (
              <>
                <option value={nodeBranch}>{nodeBranch}</option>
                {nodeBranch !== 'main' && <option value="main">main</option>}
                {nodeBranch !== 'master' && <option value="master">master</option>}
              </>
            )}
          </select>
        </Section>
      )}

      {/* Build */}
      {nodeRepo && (
        <Section title={t('properties.source.build')}>
          <div className="space-y-2">
            <TextField
              label={t('properties.source.buildCommand')}
              value={buildCommand}
              placeholder={t('properties.source.buildCommandPlaceholder')}
              onChange={(v) => onUpdateField('buildCommand', v)}
              propKey="buildCommand"
            />
            <TextField
              label={t('properties.source.outputDirectory')}
              value={outputDirectory}
              placeholder={t('properties.source.outputDirPlaceholder')}
              onChange={(v) => onUpdateField('outputDirectory', v)}
              propKey="outputDirectory"
            />
          </div>
        </Section>
      )}

      {/* Triggers — filtered to active environment only */}
      {nodeRepo &&
        connectedServices.length > 0 &&
        (() => {
          const envRules = allRules.filter((r) => r.environment === activeEnvName);

          return (
            <Section title={`Triggers · ${activeEnvName}`}>
              {envRules.length === 0 && autoCreated && (
                <div className="text-ice-xs text-ice-text-3 py-1">{t('pipeline.settingUp')}</div>
              )}

              {envRules.length === 0 && !autoCreated && (
                <div className="text-ice-xs text-ice-text-3 py-1">{t('pipeline.noTriggersForEnv')}</div>
              )}

              {/* One row per connected service — toggle + trigger type + branch (read-only) + service name */}
              {connectedServices.map((svc) => {
                const svcRule = envRules.find((r) => r.node_id === svc.id);
                return (
                  <div
                    key={svc.id}
                    className={`flex items-center gap-1.5 text-ice-xs rounded border px-2 py-1.5 ${
                      svcRule?.enabled ? 'border-ice-border bg-ice-raised' : 'border-ice-border/50 opacity-50'
                    }`}
                  >
                    <span className={`text-ice-xs ${!svcRule?.enabled ? 'text-ice-text-1' : 'text-ice-text-3'}`}>
                      {t('pipeline.manual')}
                    </span>

                    {/* Toggle */}
                    <button
                      onClick={() => {
                        if (svcRule) {
                          dispatch(updatePipelineRule({ ruleId: svcRule.id, updates: { enabled: !svcRule.enabled } }));
                        } else {
                          handleAddRule(svc.id);
                        }
                      }}
                      className={`w-6 h-3.5 rounded-full relative shrink-0 transition-colors ${svcRule?.enabled ? 'bg-emerald-500' : 'bg-ice-border'}`}
                    >
                      <div
                        className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${svcRule?.enabled ? 'left-3' : 'left-0.5'}`}
                      />
                    </button>

                    <span className={`text-ice-xs ${svcRule?.enabled ? 'text-emerald-500' : 'text-ice-text-3'}`}>
                      {t('pipeline.auto')}
                    </span>

                    {/* Deploy button — always visible for manual trigger */}
                    {svcRule && !svcRule.enabled && (
                      <button
                        onClick={() => {
                          import('../../../../store/slices/pipeline-slice').then(({ triggerManualDeploy }) => {
                            dispatch(triggerManualDeploy({ ruleId: svcRule.id }));
                          });
                        }}
                        className="ml-auto px-2 py-0.5 text-ice-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium"
                      >
                        {t('common.buttons.deploy')}
                      </button>
                    )}
                  </div>
                );
              })}
            </Section>
          );
        })()}

      {/* No services connected hint */}
      {nodeRepo && connectedServices.length === 0 && (
        <Section title={t('pipeline.triggers')}>
          <div className="text-ice-xs text-ice-text-3">{t('properties.noServiceHint')}</div>
        </Section>
      )}

      {/* Live build output — shows during active pipeline */}
      {connectedServices.length > 0 &&
        (() => {
          const activeStatuses = connectedServices
            .map((svc) => ({ svc, status: pipelineNodeStatus[svc.id] }))
            .filter(
              ({ status }) =>
                status && (status.status === 'building' || status.status === 'deploying' || status.status === 'queued'),
            );

          if (activeStatuses.length === 0) return null;

          return (
            <Section title={t('pipeline.liveBuild')}>
              <div className="rounded border border-ice-border bg-slate-950 p-2 max-h-32 overflow-y-auto font-mono text-ice-2xs leading-relaxed space-y-0.5">
                {activeStatuses.map(({ svc, status }) => {
                  // Elapsed time since build started
                  const elapsed = status!.startedAt
                    ? Math.round((Date.now() - new Date(status!.startedAt).getTime()) / 1000)
                    : 0;
                  const timeStr =
                    elapsed > 0 ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : '';
                  const timeoutWarn = elapsed > 240; // warn at 4 min (5 min limit)

                  return (
                    <div key={svc.id}>
                      <div className="text-blue-400 flex items-center gap-1 mb-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                        {svc.label} — {status!.stage || status!.status}
                        {timeStr && (
                          <span className={`ml-auto ${timeoutWarn ? 'text-amber-400' : 'text-slate-500'}`}>
                            {timeStr}
                            {timeoutWarn ? ` ${t('pipeline.timeoutSoon')}` : ''}
                          </span>
                        )}
                      </div>
                      {status!.stage && status!.stage.startsWith('[') && (
                        <div className="text-slate-400 pl-3">{status!.stage}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          );
        })()}

      {/* Recent service deployments — grouped by service, with expandable logs */}
      {allEvents.length > 0 && (
        <RepoDeployList events={allEvents} connectedServices={connectedServices} cardId={cardId} />
      )}
    </>
  );
};

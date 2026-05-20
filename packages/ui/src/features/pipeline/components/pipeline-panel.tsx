/**
 * Pipeline Panel — Slide-out panel for CI/CD configuration
 *
 * Shows: Source repo, Triggers (branch → env rules), Build config,
 * Deployment history with live log streaming.
 *
 * Opens from: clicking ⚡ badge on canvas node, right-click → Pipeline
 *
 * Sub-component splits (rf-ppanel series):
 *   - `../utils/format.ts`              — formatRelativeTime / formatDuration / formatFramework (rf-ppanel-1)
 *   - `./section.tsx`                   — Section collapsible wrapper (rf-ppanel-2)
 *   - `./status-pill.tsx`               — StatusPill status badge (rf-ppanel-3)
 *   - `./build-row.tsx`                 — BuildRow label/value row (rf-ppanel-4)
 *   - `./event-row.tsx`                 — EventRow deployment-history row (rf-ppanel-5)
 *   - `../sections/trigger-row.tsx`     — TriggerRow per-rule trigger config (rf-ppanel-6)
 *   - `../sections/active-deployment.tsx` — ActiveDeployment live progress (rf-ppanel-7)
 */

import { X, Zap, GitBranch, Plus, Loader2, Clock, Rocket } from 'lucide-react';
import React, { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import { BuildRow } from './build-row';
import { EventRow } from './event-row';
import { Section } from './section';
import { StatusPill } from './status-pill';
import { useTranslation } from '../../../i18n';
import { getApi } from '../../../shared/api/api-adapter';
import { selectActiveCard } from '../../../store/slices/cards-slice';
import { fetchGitHubBranches } from '../../../store/slices/integrations-slice';
import {
  closePipelinePanel,
  fetchRulesForNode,
  fetchEventsForNode,
  createPipelineRule,
  deletePipelineRule,
  updatePipelineRule,
  detectFramework,
  triggerManualDeploy,
  receivePipelineUpdate,
  receiveCardPipelineUpdate,
} from '../../../store/slices/pipeline-slice';
import { ActiveDeployment } from '../sections/active-deployment';
import { TriggerRow } from '../sections/trigger-row';
import { formatFramework } from '../utils/format';
import type { RootState, AppDispatch } from '../../../store';

// ─── Component ──────────────────────────────────────────────────────────────

export const PipelinePanel: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const isPanelOpen = useSelector((s: RootState) => s.pipeline.isPanelOpen);
  const nodeId = useSelector((s: RootState) => s.pipeline.activePanelNodeId);
  const cardId = useSelector((s: RootState) => s.pipeline.activePanelCardId);
  const activeCard = useSelector(selectActiveCard);

  const key = cardId && nodeId ? `${cardId}:${nodeId}` : '';
  const rules = useSelector((s: RootState) => (key ? s.pipeline.rules[key] || [] : []));
  const events = useSelector((s: RootState) => (key ? s.pipeline.history[key] || [] : []));
  const rulesLoading = useSelector((s: RootState) => s.pipeline.rulesLoading);
  const historyLoading = useSelector((s: RootState) => s.pipeline.historyLoading);
  const activeLogs = useSelector((s: RootState) => s.pipeline.activeLogs);
  const nodeStatus = useSelector((s: RootState) => (nodeId ? s.pipeline.nodeStatus[nodeId] : null));
  const detectedFrameworks = useSelector((s: RootState) => s.pipeline.detectedFrameworks);
  const detectingFramework = useSelector((s: RootState) => s.pipeline.detectingFramework);

  // Find the node on the card
  const node = activeCard?.nodes.find((n: any) => n.id === nodeId);
  const nodeName = (node?.data?.label as string) || 'Service';

  // Resolve repository: check this node first, then look for a connected Source.Repository
  let repository = (node?.data?.repository as string) || (node?.data?.repo as string) || '';
  let branch = (node?.data?.branch as string) || 'main';

  if (!repository && activeCard && nodeId) {
    // Search edges for a connected Source.Repository block
    const edges = activeCard.edges as Array<{ source: string; target: string }>;
    const connectedEdges = edges.filter((e) => e.source === nodeId || e.target === nodeId);
    for (const edge of connectedEdges) {
      const otherId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = activeCard.nodes.find((n: any) => n.id === otherId);
      const otherIceType = (otherNode?.data?.iceType as string) || '';
      if (otherIceType === 'Source.Repository' || otherNode?.data?.behavior === 'source') {
        repository = (otherNode?.data?.repository as string) || '';
        branch = (otherNode?.data?.branch as string) || 'main';
        break;
      }
    }
  }

  const detection = repository ? detectedFrameworks[repository] : null;

  // Branches from GitHub for this repo
  const branches = useSelector((s: RootState) => (repository ? s.integrations.github.branches[repository] || [] : []));

  // ── Load data on open ──
  useEffect(() => {
    if (!isPanelOpen || !cardId || !nodeId) return;
    dispatch(fetchRulesForNode({ cardId, nodeId }));
    dispatch(fetchEventsForNode({ cardId, nodeId }));
    if (repository) {
      if (!detection) dispatch(detectFramework({ repository, branch }));
      if (branches.length === 0) dispatch(fetchGitHubBranches(repository));
    }
  }, [isPanelOpen, cardId, nodeId, repository, detection, branches.length, dispatch, branch]);

  // ── Auto-create default pipeline rule when rules load empty for a repo ──
  const [autoCreated, setAutoCreated] = useState(false);
  const rulesLoadedOnce = useSelector((s: RootState) => (key ? key in s.pipeline.rules : false));

  useEffect(() => {
    if (!isPanelOpen || !cardId || !nodeId || !repository || autoCreated) return;
    if (!rulesLoadedOnce) return; // wait for rules to load first
    if (rules.length > 0) return; // already has rules

    setAutoCreated(true);
    const defaultBranch = branches.find((b) => b.name === 'main')
      ? 'main'
      : branches.find((b) => b.name === 'master')
        ? 'master'
        : branches[0]?.name || 'main';

    // Direct dispatch — don't go through handleAddRule to avoid stale closure
    dispatch(
      createPipelineRule({
        cardId,
        nodeId,
        repository,
        branchPattern: defaultBranch,
        environment: 'production',
        buildCommand: detection?.buildCommand || undefined,
        installCommand: detection?.installCommand || undefined,
        outputDir: detection?.outputDirectory || undefined,
        framework: detection?.framework || undefined,
      }),
    )
      .then(() => {
        dispatch(fetchRulesForNode({ cardId, nodeId }));
      })
      .catch((err: any) => {
        console.error('Auto-create pipeline rule failed:', err);
      });
  }, [
    isPanelOpen,
    cardId,
    nodeId,
    repository,
    rulesLoadedOnce,
    rules.length,
    autoCreated,
    branches,
    detection,
    dispatch,
  ]);

  // Reset auto-created flag when panel closes
  useEffect(() => {
    if (!isPanelOpen) setAutoCreated(false);
  }, [isPanelOpen]);

  // ── Socket.IO subscriptions ──
  useEffect(() => {
    if (!isPanelOpen || !nodeId || !cardId) return;

    const api = getApi();
    const unsubPipeline = api.subscribePipeline?.(nodeId);
    const unsubCard = api.subscribeCardPipeline?.(cardId);

    const cleanupPipeline = api.onPipelineUpdate((event: any) => {
      dispatch(receivePipelineUpdate(event));
    });
    const cleanupCard = api.onCardPipelineUpdate((event: any) => {
      dispatch(receiveCardPipelineUpdate(event));
    });

    return () => {
      unsubPipeline?.();
      unsubCard?.();
      cleanupPipeline();
      cleanupCard();
    };
  }, [isPanelOpen, nodeId, cardId, dispatch]);

  const handleClose = useCallback(() => {
    dispatch(closePipelinePanel());
  }, [dispatch]);

  const [error, setError] = useState<string | null>(null);

  const handleAddRule = useCallback(
    async (overrideBranch?: string, overrideEnv?: string) => {
      if (!cardId || !nodeId || !repository) {
        setError(!repository ? t('pipeline.noRepoShort') : t('pipeline.missingContext'));
        return;
      }
      setError(null);

      // Pick the first unused branch, or fall back to the override / default
      const usedBranches = new Set(rules.map((r) => r.branch_pattern));
      let targetBranch = overrideBranch || 'main';
      if (!overrideBranch && branches.length > 0) {
        const unused = branches.find((b) => !usedBranches.has(b.name));
        if (unused) targetBranch = unused.name;
      }

      // Auto-assign environment based on branch name
      let targetEnv = overrideEnv || 'production';
      if (!overrideEnv) {
        const branchLower = targetBranch.toLowerCase();
        if (branchLower === 'main' || branchLower === 'master') targetEnv = 'production';
        else if (branchLower.includes('stag')) targetEnv = 'staging';
        else targetEnv = 'development';
      }

      try {
        await dispatch(
          createPipelineRule({
            cardId,
            nodeId,
            repository,
            branchPattern: targetBranch,
            environment: targetEnv,
            buildCommand: detection?.buildCommand || undefined,
            installCommand: detection?.installCommand || undefined,
            outputDir: detection?.outputDirectory || undefined,
            framework: detection?.framework || undefined,
          }),
        ).unwrap();
        dispatch(fetchRulesForNode({ cardId, nodeId }));
      } catch (err: any) {
        setError(typeof err === 'string' ? err : err?.message || 'Failed to create pipeline rule');
      }
    },
    [cardId, nodeId, repository, detection, rules, branches, dispatch, t],
  );

  const handleTriggerDeploy = useCallback(
    (ruleId: string) => {
      dispatch(triggerManualDeploy({ ruleId }));
      // Refresh events after a short delay
      setTimeout(() => {
        if (cardId && nodeId) dispatch(fetchEventsForNode({ cardId, nodeId }));
      }, 1000);
    },
    [cardId, nodeId, dispatch],
  );

  if (!isPanelOpen) return null;

  return createPortal(
    <div className="fixed inset-y-0 right-0 z-[9998] flex" onClick={handleClose}>
      {/* Backdrop */}
      <div className="flex-1" />

      {/* Panel */}
      <div
        id="ice-pipeline-panel"
        className="w-[420px] h-full bg-ice-surface border-l border-ice-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ice-border">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-ice-text-1">{t('pipeline.panelTitle', { name: nodeName })}</h2>
            {nodeStatus && nodeStatus.status !== 'idle' && <StatusPill status={nodeStatus.status} />}
          </div>
          <button onClick={handleClose} className="p-1 rounded hover:bg-ice-hover transition-colors">
            <X className="w-4 h-4 text-ice-text-3" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Source Section */}
          <Section title={t('pipeline.source')} icon={GitBranch}>
            {repository ? (
              <div className="rounded-md border border-ice-border bg-ice-raised px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-ice-text-1">{repository}</span>
                </div>
                {detectingFramework ? (
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-ice-text-3">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t('pipeline.detecting')}
                  </div>
                ) : detection?.framework ? (
                  <div className="text-xs text-ice-text-2 mt-1">
                    {t('pipeline.detected', { framework: formatFramework(detection.framework) })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-ice-text-3 italic">{t('pipeline.noRepo')}</div>
            )}
          </Section>

          {/* Error display */}
          {error && (
            <div className="mx-4 mt-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Triggers Section */}
          <Section title={t('pipeline.triggers')} icon={Zap}>
            {rulesLoading || (autoCreated && rules.length === 0) ? (
              <div className="flex items-center gap-2 text-sm text-ice-text-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {repository ? t('pipeline.settingUp') : t('common.labels.loading')}
              </div>
            ) : rules.length === 0 ? (
              <div className="space-y-2">
                {repository ? (
                  <button
                    onClick={() => handleAddRule()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {t('pipeline.enablePipeline')}
                  </button>
                ) : (
                  <div className="text-xs text-ice-text-3">{t('pipeline.noRepoHint')}</div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <TriggerRow
                    key={rule.id}
                    rule={rule}
                    branches={branches}
                    onToggle={(enabled) =>
                      dispatch(
                        updatePipelineRule({
                          ruleId: rule.id,
                          updates: { enabled },
                        }),
                      )
                    }
                    onDelete={() =>
                      dispatch(
                        deletePipelineRule({
                          ruleId: rule.id,
                          cardId: rule.card_id,
                          nodeId: rule.node_id,
                        }),
                      )
                    }
                    onChangeBranch={(branchPattern) =>
                      dispatch(
                        updatePipelineRule({
                          ruleId: rule.id,
                          updates: { branchPattern },
                        }),
                      )
                    }
                    onChangeEnvironment={(environment) =>
                      dispatch(
                        updatePipelineRule({
                          ruleId: rule.id,
                          updates: { environment },
                        }),
                      )
                    }
                  />
                ))}
                {repository && (
                  <button
                    id="ice-pipeline-btn-add-rule"
                    onClick={() => handleAddRule()}
                    className="flex items-center gap-1 text-xs text-ice-text-3 hover:text-ice-text-2 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {t('pipeline.addTrigger')}
                  </button>
                )}
              </div>
            )}
          </Section>

          {/* Build Section */}
          {detection && (
            <Section title={t('pipeline.build')} icon={Rocket}>
              <div className="space-y-1.5">
                <BuildRow label={t('pipeline.installCommand')} value={detection.installCommand} />
                <BuildRow label={t('pipeline.buildCommand')} value={detection.buildCommand} />
                <BuildRow label={t('pipeline.outputDir')} value={detection.outputDirectory} />
              </div>
            </Section>
          )}

          {/* Live Deploy Progress */}
          {nodeStatus &&
            (nodeStatus.status === 'building' ||
              nodeStatus.status === 'deploying' ||
              nodeStatus.status === 'queued') && (
              <Section title={t('pipeline.activeDeployment')} icon={Loader2} iconClassName="animate-spin">
                <ActiveDeployment status={nodeStatus} logs={activeLogs} />
              </Section>
            )}

          {/* Deployment History */}
          <Section title={t('pipeline.deployments')} icon={Clock}>
            {historyLoading ? (
              <div className="flex items-center gap-2 text-sm text-ice-text-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('common.labels.loading')}
              </div>
            ) : events.length === 0 ? (
              <div className="text-sm text-ice-text-3">{t('pipeline.noDeployments')}</div>
            ) : (
              <div className="space-y-1">
                {events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-ice-border">
          {rules.length > 0 && (
            <button
              onClick={() => handleTriggerDeploy(rules[0].id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium"
            >
              <Rocket className="w-3.5 h-3.5" />
              {t('pipeline.deployNow')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

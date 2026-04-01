/**
 * Pipeline Panel — Slide-out panel for CI/CD configuration
 *
 * Shows: Source repo, Triggers (branch → env rules), Build config,
 * Deployment history with live log streaming.
 *
 * Opens from: clicking ⚡ badge on canvas node, right-click → Pipeline
 */

import {
  X,
  Zap,
  GitBranch,
  ChevronDown,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Rocket,
  Circle,
  ArrowRight,
} from 'lucide-react';
import React, { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from '../../../i18n';
import { getApi } from '../../../shared/api/api-adapter';
import { cn } from '../../../shared/utils/cn';
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
  type DeploymentRule,
  type DeploymentEvent,
  type DeployStep,
} from '../../../store/slices/pipeline-slice';
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
        setError(
          !repository
            ? t('pipeline.noRepoShort')
            : t('pipeline.missingContext'),
        );
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
    [cardId, nodeId, repository, detection, rules, branches, dispatch],
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
                  <div className="text-xs text-ice-text-3">
                    {t('pipeline.noRepoHint')}
                  </div>
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

// ─── Sub-components ─────────────────────────────────────────────────────────

const Section: React.FC<{
  title: string;
  icon: React.ElementType;
  iconClassName?: string;
  children: React.ReactNode;
}> = ({ title, icon: Icon, iconClassName, children }) => (
  <div className="px-4 py-3 border-b border-ice-border">
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className={cn('w-3.5 h-3.5 text-ice-text-3', iconClassName)} />
      <span className="text-xs font-semibold text-ice-text-2 uppercase tracking-wider">{title}</span>
    </div>
    {children}
  </div>
);

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const { t } = useTranslation();
  const config: Record<string, { label: string; className: string }> = {
    queued: { label: t('pipeline.status.queued'), className: 'bg-yellow-500/10 text-yellow-500' },
    building: { label: t('pipeline.status.building'), className: 'bg-blue-500/10 text-blue-500' },
    deploying: { label: t('pipeline.status.deploying'), className: 'bg-purple-500/10 text-purple-500' },
    success: { label: t('pipeline.status.success'), className: 'bg-emerald-500/10 text-emerald-500' },
    failed: { label: t('pipeline.status.failed'), className: 'bg-red-500/10 text-red-500' },
  };
  const c = config[status] || { label: status, className: 'bg-ice-hover text-ice-text-3' };
  return <span className={cn('px-1.5 py-0.5 text-ice-2xs font-semibold rounded-full', c.className)}>{c.label}</span>;
};

interface BranchInfo {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

const TriggerRow: React.FC<{
  rule: DeploymentRule;
  branches: BranchInfo[];
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onChangeBranch: (branch: string) => void;
  onChangeEnvironment: (env: string) => void;
}> = ({ rule, branches, onToggle, onDelete, onChangeBranch, onChangeEnvironment }) => {
  const { t } = useTranslation();
  // Ensure current branch_pattern is in the list
  const branchNames = branches.map((b) => b.name);
  const currentInList = branchNames.includes(rule.branch_pattern) || rule.branch_pattern === '*';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
        rule.enabled ? 'border-ice-border bg-ice-raised' : 'border-ice-border/50 bg-ice-base opacity-60',
      )}
    >
      {/* Toggle */}
      <button
        onClick={() => onToggle(!rule.enabled)}
        className={cn(
          'w-7 h-4 rounded-full relative transition-colors flex-shrink-0',
          rule.enabled ? 'bg-emerald-500' : 'bg-ice-border',
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
            rule.enabled ? 'left-3.5' : 'left-0.5',
          )}
        />
      </button>

      {/* Trigger type + branch */}
      <span className="text-ice-text-2 text-xs">
        {rule.trigger_type === 'merge' ? t('pipeline.mergeTo') : t('pipeline.pushTo')}
      </span>
      <select
        value={rule.branch_pattern}
        onChange={(e) => onChangeBranch(e.target.value)}
        className="px-1.5 py-0.5 text-xs rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono max-w-[100px]"
      >
        {branches.length > 0 ? (
          <>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
                {b.protected ? ' (protected)' : ''}
              </option>
            ))}
            <option value="*">* (any branch)</option>
          </>
        ) : (
          <>
            {/* Fallback while loading */}
            {!currentInList && rule.branch_pattern !== '*' && (
              <option value={rule.branch_pattern}>{rule.branch_pattern}</option>
            )}
            <option value="main">main</option>
            <option value="master">master</option>
            <option value="*">* (any branch)</option>
          </>
        )}
      </select>

      <ArrowRight className="w-3 h-3 text-ice-text-3 flex-shrink-0" />

      {/* Environment */}
      <select
        value={rule.environment}
        onChange={(e) => onChangeEnvironment(e.target.value)}
        className="px-1.5 py-0.5 text-xs rounded border border-ice-border bg-ice-base text-ice-text-1"
      >
        <option value="production">production</option>
        <option value="staging">staging</option>
        <option value="development">development</option>
      </select>

      {/* Delete */}
      <button onClick={onDelete} className="ml-auto p-0.5 text-ice-text-3 hover:text-red-500 transition-colors">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
};

const BuildRow: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-ice-text-3">{label}</span>
    <span className="font-mono text-ice-text-2">{value || '—'}</span>
  </div>
);

const ActiveDeployment: React.FC<{
  status: { status: string; stage?: string; progress?: number; commitSha?: string; commitMessage?: string };
  logs: DeployStep[];
}> = ({ status, logs }) => (
  <div className="space-y-2">
    {/* Progress bar */}
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ice-text-2">{status.stage || status.status}</span>
        <span className="font-mono text-ice-text-3">{status.progress || 0}%</span>
      </div>
      <div className="h-1.5 bg-ice-border rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            status.status === 'failed' ? 'bg-red-500' : 'bg-emerald-500',
          )}
          style={{ width: `${status.progress || 0}%` }}
        />
      </div>
    </div>

    {/* Commit info */}
    {status.commitSha && (
      <div className="text-xs text-ice-text-3 font-mono truncate">
        {status.commitSha.slice(0, 7)} {status.commitMessage}
      </div>
    )}

    {/* Log steps */}
    {logs.length > 0 && (
      <div className="rounded-md border border-ice-border bg-slate-950 p-2 space-y-0.5 max-h-40 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i} className="flex items-center gap-1.5 text-ice-xs font-mono">
            {log.status === 'completed' ? (
              <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
            ) : log.status === 'failed' ? (
              <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
            ) : (
              <Loader2 className="w-3 h-3 text-blue-400 animate-spin flex-shrink-0" />
            )}
            <span className={cn(log.status === 'failed' ? 'text-red-400' : 'text-slate-300')}>{log.message}</span>
            {log.duration_ms && <span className="ml-auto text-slate-500">{(log.duration_ms / 1000).toFixed(1)}s</span>}
          </div>
        ))}
      </div>
    )}
  </div>
);

const EventRow: React.FC<{ event: DeploymentEvent }> = ({ event }) => {
  const { t } = useTranslation();
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="rounded-md border border-ice-border overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-ice-hover transition-colors"
        onClick={() => setShowLogs(!showLogs)}
      >
        {/* Status icon */}
        {event.status === 'success' ? (
          <Circle className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500 flex-shrink-0" />
        ) : event.status === 'failed' ? (
          <Circle className="w-2.5 h-2.5 fill-red-500 text-red-500 flex-shrink-0" />
        ) : event.status === 'cancelled' ? (
          <Circle className="w-2.5 h-2.5 fill-ice-text-3 text-ice-text-3 flex-shrink-0" />
        ) : (
          <Loader2 className="w-2.5 h-2.5 text-blue-500 animate-spin flex-shrink-0" />
        )}

        {/* Commit */}
        <span className="font-mono text-ice-text-2">{event.commit_sha.slice(0, 7)}</span>
        <span className="text-ice-text-2 truncate flex-1">{event.commit_message}</span>

        {/* Metadata */}
        <span className="text-ice-text-3 flex-shrink-0">{event.rule?.environment || event.branch}</span>
        <span className="text-ice-text-3 flex-shrink-0">{formatRelativeTime(event.started_at)}</span>

        <ChevronDown
          className={cn('w-3 h-3 text-ice-text-3 transition-transform flex-shrink-0', showLogs && 'rotate-180')}
        />
      </div>

      {/* Expanded logs */}
      {showLogs && (
        <div className="border-t border-ice-border bg-slate-950 p-2 space-y-0.5 max-h-32 overflow-y-auto">
          {((event.deployment_logs || []) as DeployStep[]).map((log, i) => (
            <div key={i} className="flex items-center gap-1.5 text-ice-xs font-mono">
              {log.status === 'completed' ? (
                <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              ) : log.status === 'failed' ? (
                <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
              ) : (
                <Circle className="w-3 h-3 text-slate-500 flex-shrink-0" />
              )}
              <span className={cn(log.status === 'failed' ? 'text-red-400' : 'text-slate-300')}>{log.message}</span>
            </div>
          ))}
          {event.error && (
            <div className="text-ice-xs font-mono text-red-400 mt-1 pt-1 border-t border-slate-800">{event.error}</div>
          )}
          {event.duration_seconds && (
            <div className="text-ice-xs font-mono text-slate-500 mt-1">
              {t('pipeline.duration')} {formatDuration(event.duration_seconds)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatFramework(framework: string): string {
  const names: Record<string, string> = {
    nextjs: 'Next.js',
    nuxt: 'Nuxt',
    sveltekit: 'SvelteKit',
    react: 'React',
    vue: 'Vue',
    angular: 'Angular',
    express: 'Express',
    fastify: 'Fastify',
    docker: 'Docker',
    python: 'Python',
    go: 'Go',
    node: 'Node.js',
  };
  return names[framework] || framework;
}

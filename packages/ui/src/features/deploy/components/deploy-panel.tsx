/**
 * Deploy Panel
 *
 * Modal overlay for deploying the active card's infrastructure to GCP.
 * Flow: Configure → Plan → Review → Deploy → Results
 */

import {
  X,
  Rocket,
  Play,
  Eye,
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Trash2,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { DeployDiagnosis } from './deploy-diagnosis';
import { DeployInFlightPanel } from './deploy-in-flight-panel';
import { DestroyConfirmModal } from './destroy-confirm-modal';
import { PlanPreview } from './plan-preview';
import { PreDeployWarnings } from './predeploy-warnings';
import { RequirementsSection } from './requirements-section';
import { AuthBanner } from './sections/auth-banner';
import { DeployedResourcesList } from './sections/deployed-resources-list';
import { DnsRecordsSection } from './sections/dns-records-section';
import { LogPanel } from './sections/log-panel';
import { StatusBadge } from './status-badge';
import { useTranslation } from '../../../i18n';
import { getApi } from '../../../shared/api/api-adapter';
import { IceSelect } from '../../../shared/components/ui/ice-select';
import { PanelHeader } from '../../../shared/components/ui/panel-header';
import { cn } from '../../../shared/utils/cn';
import { isApiNotEnabledError, extractApiName, extractApiEnableUrl } from '../../../shared/utils/gcp-errors';
import { selectActiveCard, clearCardDeployOverlay } from '../../../store/slices/cards-slice';
import {
  closeDeployPanel,
  setProvider,
  setGcpProject,
  setRegion,
  setEnvironment,
  startAuthenticating,
  authSuccess,
  authFailed,
  startPlanning,
  setPlan,
  startDeploying,
  startDestroying,
  deploySuccess,
  deployError,
  hydrateDeployFromHistory,
  resetDeploy,
  appendLog,
  setDeployedResources,
  startRequirementsFetch,
  setRequirements,
  type DeployPlan,
  type DeployResourceResult,
} from '../../../store/slices/deploy-slice';
import { primaryOutput } from '../output-extractors';
import { classifyDeployError, collectApiEnableUrls, extractProjectIdFromError } from '../utils/error-classification';
import { openExternalUrl } from '../utils/open-external-url';
import { analyzePreDeploy } from '../utils/predeploy-analysis';
import { buildResultsSummaryText, summaryCounts } from '../utils/results-summary-text';
import {
  PROVIDER_REGIONS,
  PROVIDER_LABELS,
  PROVIDER_PROJECT_LABELS,
  detectDominantProvider,
} from '../utils/provider-regions';
import type { RootState, AppDispatch } from '../../../store';

// ─── Component ──────────────────────────────────────────────────────────────

export const DeployPanel: React.FC = () => {
  // Visibility is owned by the parent (main-layout) which only mounts
  // this component when state.deploy.isOpen is true. We still read isOpen
  // here so the side-effects below stay gated when the panel is mounted
  // but the user closes it via the close button (the parent unmounts on
  // the next render).
  const isOpen = useSelector((s: RootState) => s.deploy.isOpen);
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const activeCard = useSelector(selectActiveCard);
  const deploy = useSelector((state: RootState) => state.deploy);
  const logEndRef = useRef<HTMLDivElement>(null);

  // AI-Native #3 — security warnings + cost estimate, recomputed only when
  // the plan lands. Before plan there's nothing useful to show.
  const preDeployAnalysis = React.useMemo(() => {
    if (deploy.status !== 'planned' || !activeCard) return null;
    return analyzePreDeploy(activeCard.nodes, activeCard.edges);
  }, [deploy.status, activeCard]);
  const pendingRetryRef = useRef<'plan' | 'deploy' | null>(null);
  // Phase 5: in-panel destroy confirmation modal state.
  const [destroyModalOpen, setDestroyModalOpen] = React.useState(false);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [deploy.logs.length]);

  // Auto-detect provider + load deployed resources + auto-fill project from connected provider
  useEffect(() => {
    if (!isOpen || !activeCard) return;

    // Detect dominant provider from canvas nodes
    const detected = detectDominantProvider(activeCard.nodes);
    dispatch(setProvider(detected));

    // Set a sensible default region for the detected provider
    const regions = PROVIDER_REGIONS[detected];
    if (regions && !regions.includes(deploy.region)) {
      dispatch(setRegion(regions[0]));
    }

    (async () => {
      try {
        // Load deployed resources
        const res = await getApi().deploy.getResources(activeCard.id);
        if (res.success && res.resources) {
          dispatch(setDeployedResources(res.resources));
        }
      } catch {
        // silently ignore — non-critical
      }

      // Auto-fill GCP project from connected provider if not already set
      if (!deploy.gcpProject) {
        try {
          const isConnected = await getApi().provider.isConnected(detected);
          if (isConnected) {
            const projects = await getApi().provider.getProjects(detected);
            if (projects?.length > 0) {
              dispatch(setGcpProject(projects[0].id));
            }
          }
        } catch {
          // non-critical
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use activeCard?.id to avoid re-firing on card object reference changes
  }, [isOpen, activeCard?.id, deploy.gcpProject, deploy.region, dispatch]);

  // The deploy socket subscription and global progress listener now live
  // in `useDeploySubscription` at the app level (`packages/web/src/app/app.tsx`).
  // That hook runs whenever a card is active, regardless of whether this
  // panel is open — which is the whole point, because a new tab / closed
  // panel used to silently drop all progress events. The panel still
  // listens for `requirement_verified` events locally to refresh the
  // requirements section when the background poller flips one.
  useEffect(() => {
    if (!isOpen || !activeCard) return;
    const cleanup = getApi().onDeployEvent((event) => {
      if (event.type === 'requirement_verified') {
        fetchRequirements().catch(() => undefined);
      }
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeCard?.id]);

  // ─── Authenticate ─────────────────────────────────────────────────

  const handleAuthenticate = useCallback(
    async (retryAction?: 'plan' | 'deploy') => {
      dispatch(startAuthenticating());
      pendingRetryRef.current = retryAction ?? null;

      try {
        const result = await getApi().deploy.authenticate();

        if (result.success) {
          dispatch(authSuccess());
          // Auto-retry the original action after successful auth
          return true;
        } else {
          dispatch(authFailed(result.error || 'Authentication failed'));
          pendingRetryRef.current = null;
          return false;
        }
      } catch (err: any) {
        dispatch(authFailed(err.message || 'Authentication failed'));
        pendingRetryRef.current = null;
        return false;
      }
    },
    [dispatch],
  );

  // ─── Plan ───────────────────────────────────────────────────────────

  const fetchRequirements = useCallback(async () => {
    if (!activeCard) return;
    try {
      dispatch(startRequirementsFetch());
      const res = await getApi().deploy.requirements(activeCard.id, activeCard.nodes, {
        provider: deploy.provider,
        gcpProject: deploy.gcpProject,
        region: deploy.region,
        environment: deploy.environment,
      });
      if (res.success && Array.isArray(res.requirements)) {
        dispatch(setRequirements(res.requirements));
      } else {
        dispatch(setRequirements([]));
      }
    } catch (err: any) {
      dispatch(setRequirements([]));
      dispatch(appendLog(`Requirements check failed: ${err?.message || err}`));
    }
  }, [activeCard, deploy.provider, deploy.gcpProject, deploy.region, deploy.environment, dispatch]);

  const handleVerifyRequirement = useCallback(
    async (_definitionId: string, _nodeId: string | undefined) => {
      // Re-run the full resolver for now. A future refinement can hit a
      // single-requirement endpoint to avoid re-checking everything.
      await fetchRequirements();
    },
    [fetchRequirements],
  );

  // ─── Persist deploy results across reloads ──────────────────────────
  //
  // Deploy results live in canvas_deployment server-side. Without this
  // effect, opening the app after a deploy showed an empty deploy panel
  // because state.results is in-memory only. On every active-card change
  // we fetch the most-recent terminal apply for that card and hydrate
  // the slice — so the summary header (Copy summary / Copy errors) is
  // visible immediately, not just for the session that ran the deploy.
  //
  // Skip when a deploy is mid-flight (the slice's hydrate reducer also
  // guards this) and when the card hasn't actually changed (avoid a
  // network round-trip on every layout re-render).
  React.useEffect(() => {
    if (!activeCard) return;
    // Don't gate on slice status here. The app-level
    // useDeploySubscription's Phase 2 effect can flip the slice to
    // 'deploying' from a stale gateway snapshot (a deploy that crashed
    // without finalizing the in-memory snapshot looks live forever),
    // which would otherwise prevent hydrate from running and leave the
    // panel forever showing 99% with no results. The DB row is the
    // source of truth — the slice's hydrate reducer ignores non-terminal
    // statuses anyway, so it's safe to dispatch unconditionally and let
    // the reducer decide.
    let cancelled = false;
    (async () => {
      try {
        const history = (await getApi().deploy.getDeployments(activeCard.id)) as Array<{
          id: string;
          status: string;
          action_type: string;
          environment?: string;
          duration_ms?: number | null;
          error?: string | null;
          results?: { resources?: DeployResourceResult[] } | null;
        }>;
        if (cancelled) return;
        // eslint-disable-next-line no-console -- diagnostic: helps the user verify hydrate fired
        console.log('[deploy-panel] hydrate fetch', {
          cardId: activeCard.id,
          historyLen: Array.isArray(history) ? history.length : 0,
        });
        if (!Array.isArray(history) || history.length === 0) return;
        // Most-recent terminal apply (skip plan-only entries and any
        // mid-flight ones the gateway might report).
        const latest = history.find(
          (d) =>
            (d.action_type === 'apply' || d.action_type === 'rollback') &&
            ['success', 'partial', 'failed', 'cancelled'].includes(d.status),
        );
        if (!latest) {
          // eslint-disable-next-line no-console
          console.log('[deploy-panel] hydrate: no terminal apply in history', {
            statuses: history.map((d) => `${d.action_type}:${d.status}`),
          });
          return;
        }
        const resources = Array.isArray(latest.results?.resources) ? latest.results!.resources : [];
        // eslint-disable-next-line no-console
        console.log('[deploy-panel] hydrate dispatch', {
          status: latest.status,
          resourcesLen: resources.length,
          environment: latest.environment,
          duration_ms: latest.duration_ms,
          hasError: !!latest.error,
        });
        dispatch(
          hydrateDeployFromHistory({
            cardId: activeCard.id,
            status: latest.status,
            results: resources,
            error: latest.error,
            duration_ms: latest.duration_ms ?? undefined,
            environment: latest.environment ?? undefined,
          }),
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[deploy-panel] hydrate failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch
    //   when the active card actually changes; deploy.status flipping to
    //   'deploying' inside this effect would re-fetch unnecessarily.
  }, [activeCard?.id, dispatch]);

  const handlePlan = useCallback(async () => {
    if (!activeCard) return;

    dispatch(startPlanning());

    try {
      const result = await getApi().deploy.plan(activeCard.id, activeCard.nodes, activeCard.edges, {
        provider: deploy.provider,
        gcpProject: deploy.gcpProject,
        region: deploy.region,
        environment: deploy.environment,
      });

      if (result.success) {
        dispatch(setPlan(result.plan as DeployPlan));
        // Phase 8 — fetch requirements in parallel with the plan preview.
        fetchRequirements().catch(() => undefined);
      } else if (result.needsAuth) {
        // Auto-trigger auth flow, then retry plan
        const authed = await handleAuthenticate('plan');
        if (authed) {
          // Retry plan after successful auth
          dispatch(startPlanning());
          const retry = await getApi().deploy.plan(activeCard.id, activeCard.nodes, activeCard.edges, {
            provider: deploy.provider,
            gcpProject: deploy.gcpProject,
            region: deploy.region,
            environment: deploy.environment,
          });
          if (retry.success) {
            dispatch(setPlan(retry.plan as DeployPlan));
          } else {
            dispatch(deployError(retry.error || 'Planning failed'));
          }
        }
      } else {
        dispatch(deployError(result.error || 'Planning failed'));
      }
    } catch (err: any) {
      dispatch(deployError(err.message || 'Planning failed'));
    }
  }, [
    activeCard,
    deploy.provider,
    deploy.gcpProject,
    deploy.region,
    deploy.environment,
    dispatch,
    handleAuthenticate,
    fetchRequirements,
  ]);

  // ─── Deploy ─────────────────────────────────────────────────────────

  const handleDeploy = useCallback(async () => {
    if (!activeCard) return;

    dispatch(startDeploying({ cardId: activeCard.id }));

    try {
      const result = await getApi().deploy.apply(activeCard.id, activeCard.nodes, activeCard.edges, {
        provider: deploy.provider,
        gcpProject: deploy.gcpProject,
        region: deploy.region,
        environment: deploy.environment,
      });

      // Async path: the gateway now returns immediately with `async: true`
      // and `deploymentId`. Terminal state arrives via the socket
      // subscription's `complete` handler (which dispatches deploySuccess
      // or deployError based on the event payload). Don't touch the slice
      // here — doing so would race the socket events.
      if ((result as { async?: boolean }).async) {
        return;
      }

      // Sync fallback (queue worker, tests): the response carries the
      // full per-resource list at result.result.resources. Pass it
      // through to deploySuccess so the summary always renders even if
      // socket events come in late.
      const apiResources = (result as { result?: { resources?: DeployResourceResult[] } })?.result?.resources;
      const partialFailures = Array.isArray(apiResources) && apiResources.some((r) => !r.success);
      if (result.success) {
        if (partialFailures) {
          // Server returned 200 but some resources failed — surface as
          // an error so the red banner + Copy errors button appear.
          const failedSummary = apiResources!.filter((r) => !r.success).map((r) => `${r.type}/${r.name}`).join(', ');
          dispatch(deployError({ error: `${apiResources!.filter((r) => !r.success).length} resource(s) failed: ${failedSummary}`, results: apiResources }));
        } else {
          dispatch(deploySuccess({ duration_ms: result.duration_ms || 0, results: apiResources }));
        }
        try {
          const res = await getApi().deploy.getResources(activeCard.id);
          if (res.success && res.resources) {
            dispatch(setDeployedResources(res.resources));
          }
        } catch {}
      } else if (result.needsAuth) {
        // Auto-trigger auth flow, then retry deploy
        const authed = await handleAuthenticate('deploy');
        if (authed) {
          // Retry deploy after successful auth
          dispatch(startDeploying({ cardId: activeCard.id }));
          const retry = await getApi().deploy.apply(activeCard.id, activeCard.nodes, activeCard.edges, {
            provider: deploy.provider,
            gcpProject: deploy.gcpProject,
            region: deploy.region,
            environment: deploy.environment,
          });
          // Same async-path skip as the main handler — socket drives state.
          if ((retry as { async?: boolean }).async) {
            return;
          }
          if (retry.success) {
            const retryResources = (retry as { result?: { resources?: DeployResourceResult[] } })?.result?.resources;
            const retryPartial = Array.isArray(retryResources) && retryResources.some((r) => !r.success);
            if (retryPartial) {
              const failedSummary = retryResources!.filter((r) => !r.success).map((r) => `${r.type}/${r.name}`).join(', ');
              dispatch(deployError({ error: `${retryResources!.filter((r) => !r.success).length} resource(s) failed: ${failedSummary}`, results: retryResources }));
            } else {
              dispatch(deploySuccess({ duration_ms: retry.duration_ms || 0, results: retryResources }));
            }
            try {
              const res = await getApi().deploy.getResources(activeCard.id);
              if (res.success && res.resources) {
                dispatch(setDeployedResources(res.resources));
              }
            } catch {
              /* non-critical */
            }
          } else {
            dispatch(deployError(retry.error || 'Deployment failed'));
          }
        }
      } else {
        dispatch(deployError(result.error || 'Deployment failed'));
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Deployment failed';
      dispatch(deployError(msg));
    }
  }, [
    activeCard,
    deploy.provider,
    deploy.gcpProject,
    deploy.region,
    deploy.environment,
    dispatch,
    handleAuthenticate,
  ]);

  // ─── Close ──────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    if (deploy.status === 'deploying' || deploy.status === 'destroying' || deploy.status === 'authenticating') return;
    dispatch(closeDeployPanel());
    dispatch(resetDeploy());
  }, [deploy.status, dispatch]);

  if (!isOpen) return null;

  const resourceNodes = activeCard?.nodes.filter((n) => n.type === 'resource') ?? [];
  const providerNodes = resourceNodes.filter((n) => n.data?.provider === deploy.provider);
  // Keep gcpNodes alias for backward compat within this component
  const gcpNodes = providerNodes;

  const header = (
    <PanelHeader
      icon={<Rocket aria-hidden="true" className="w-3.5 h-3.5 text-emerald-400" />}
      title={t('deploy.title')}
      badge={<StatusBadge status={deploy.status} id="ice-deploy-status" />}
      onClose={handleClose}
      closeLabel="Close"
    />
  );

  const content = (
    <>
      {header}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Configuration */}
        <ConfigSection
          provider={deploy.provider}
          gcpProject={deploy.gcpProject}
          region={deploy.region}
          environment={deploy.environment}
          disabled={deploy.status === 'deploying'}
          projectId={activeCard?.projectId}
          onProviderChange={(v) => {
            dispatch(setProvider(v));
            const regions = PROVIDER_REGIONS[v];
            if (regions && !regions.includes(deploy.region)) {
              dispatch(setRegion(regions[0]));
            }
          }}
          onProjectChange={(v) => dispatch(setGcpProject(v))}
          onRegionChange={(v) => dispatch(setRegion(v))}
          onEnvironmentChange={(v) => dispatch(setEnvironment(v as 'production' | 'staging' | 'development'))}
        />

        {/* Canvas summary */}
        <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t('deploy.card.label')}{' '}
              <span className="text-foreground font-medium">{activeCard?.name || t('deploy.card.untitled')}</span>
            </span>
            <span className="text-muted-foreground">
              {providerNodes.length} deployable resource{providerNodes.length !== 1 ? 's' : ''} (
              {PROVIDER_LABELS[deploy.provider] || deploy.provider})
              {resourceNodes.length > providerNodes.length && (
                <span className="ml-1 text-yellow-600">
                  ({resourceNodes.length - providerNodes.length} skipped — non-
                  {PROVIDER_LABELS[deploy.provider] || deploy.provider})
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Previously deployed resources */}
        {deploy.deployedResources.length > 0 && deploy.status === 'idle' && (
          <DeployedResourcesList resources={deploy.deployedResources} />
        )}

        {/* Authenticating */}
        {deploy.status === 'authenticating' && <AuthBanner />}

        {/* Phase 8 — block requirements (DNS, verification, cert, GitHub repo, etc.) */}
        {(deploy.requirements.length > 0 || deploy.requirementsLoading) && (
          <RequirementsSection
            requirements={deploy.requirements}
            loading={deploy.requirementsLoading}
            onVerify={handleVerifyRequirement}
          />
        )}

        {/* Plan preview */}
        {deploy.plan && <PlanPreview plan={deploy.plan} />}

        {/* Pre-deploy security + cost analysis (AI-Native #3) */}
        {preDeployAnalysis && <PreDeployWarnings analysis={preDeployAnalysis} />}

        {/* Error */}
        {deploy.error && (
          <>
            <ApiErrorBanner error={deploy.error} results={deploy.results} onRetryDeploy={handleDeploy} />
            <DeployDiagnosis error={deploy.error} results={deploy.results} />
          </>
        )}

        <DnsRecordsSection results={deploy.results} />

        {/* Logs */}
        {deploy.logs.length > 0 && <LogPanel logs={deploy.logs} logEndRef={logEndRef} />}

        {/* In-flight progress (pdl-5) — rendered for both deploying and
              destroying. The legacy single-resource percentage and the
              bouncing-bar 59% → 0% bug are gone: every signal here derives
              from `nodesById` so no single number is "the active resource". */}
        {(deploy.status === 'deploying' || deploy.status === 'destroying') && (
          <DeployInFlightPanel nodesById={deploy.nodesById} status={deploy.status} />
        )}

        {/* Results — show whenever we have any (from current session or
              hydrated from DB), except while a deploy is actively running
              (the progress bar above takes that slot). Status can be
              'planning'/'planned'/'idle' when the user re-opens the panel
              or starts a new plan after a prior deploy; in those cases
              the prior summary should still be visible. */}
        {deploy.results.length > 0 && deploy.status !== 'deploying' && deploy.status !== 'destroying' && (
          <div id="ice-deploy-results">
            <ResultsSummary results={deploy.results} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30">
        <button
          onClick={() => dispatch(resetDeploy())}
          disabled={deploy.status === 'deploying' || deploy.status === 'destroying'}
          id="ice-deploy-btn-cancel"
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          title={
            deploy.status === 'deploying'
              ? 'Cannot clear while a deploy is running'
              : deploy.status === 'destroying'
                ? 'Cannot clear while a destroy is running'
                : 'Clear plan and results'
          }
        >
          {t('deploy.buttons.reset')}
        </button>
        <div className="flex items-center gap-2">
          {/* Phase 5: Stop button shown only while deploying. Calls the
                cancel endpoint which flips the deploy's AbortSignal. */}
          {deploy.status === 'deploying' && (
            <button
              onClick={async () => {
                if (!activeCard) return;
                try {
                  await fetch('/api/canvas/deploy/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ cardId: activeCard.id }),
                  });
                  dispatch(appendLog('Stop requested — deploy will wind down after the current resource.'));
                } catch (err: any) {
                  dispatch(appendLog(`Cancel failed: ${err?.message || err}`));
                }
              }}
              id="ice-deploy-btn-stop"
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors font-medium',
                'bg-amber-600 text-white hover:bg-amber-700',
              )}
              title="Request the in-flight deploy to stop"
            >
              <X className="w-3.5 h-3.5" />
              Stop
            </button>
          )}
          {/* Plan button */}
          <button
            onClick={handlePlan}
            disabled={
              !deploy.gcpProject ||
              gcpNodes.length === 0 ||
              deploy.status === 'planning' ||
              deploy.status === 'deploying' ||
              deploy.status === 'destroying' ||
              deploy.status === 'authenticating'
            }
            id="ice-deploy-btn-plan"
            title={
              !deploy.gcpProject
                ? 'Select a GCP project to continue'
                : gcpNodes.length === 0
                  ? 'Add at least one resource block to deploy'
                  : deploy.status === 'deploying'
                    ? 'Deploy in progress'
                    : deploy.status === 'planning'
                      ? 'Planning…'
                      : 'Generate a deploy plan'
            }
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors',
              'bg-muted hover:bg-muted/80 border border-border',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {deploy.status === 'planning' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            {t('deploy.buttons.plan')}
          </button>

          {/* Deploy button */}
          {(() => {
            const blockingUnmetReqs = deploy.requirements.filter(
              (r) => r.blocking && r.result.status !== 'met' && r.result.status !== 'verified',
            );
            const hasBlockingUnmet = blockingUnmetReqs.length > 0;
            const blockedByCritical = preDeployAnalysis?.hasCritical === true && !deploy.criticalAcknowledged;
            const deployDisabled =
              !deploy.gcpProject ||
              gcpNodes.length === 0 ||
              deploy.status === 'deploying' ||
              deploy.status === 'destroying' ||
              deploy.status === 'planning' ||
              deploy.status === 'authenticating' ||
              hasBlockingUnmet ||
              blockedByCritical;
            const deployTitle = !deploy.gcpProject
              ? 'Select a GCP project to continue'
              : gcpNodes.length === 0
                ? `Add at least one ${deploy.provider.toUpperCase()} resource block to deploy`
                : deploy.status === 'deploying'
                  ? 'Deploy in progress — click Stop to cancel'
                  : deploy.status === 'planning'
                    ? 'Waiting for plan to finish'
                    : hasBlockingUnmet
                      ? `Blocked by ${blockingUnmetReqs.length} requirement(s): ${blockingUnmetReqs.map((r) => r.title).join(', ')}`
                      : deploy.deployedResources.length > 0
                        ? 'Deploy updated infrastructure'
                        : 'Deploy to cloud';
            return (
              <button
                onClick={handleDeploy}
                disabled={deployDisabled}
                id="ice-deploy-btn-apply"
                title={deployTitle}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors font-medium',
                  'bg-emerald-600 text-white hover:bg-emerald-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {deploy.status === 'deploying' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {deploy.deployedResources.length > 0
                  ? t('deploy.buttons.updateInfrastructure')
                  : t('deploy.buttons.deploy')}
              </button>
            );
          })()}

          {/* Destroy button — only when resources are deployed */}
          {/* Destroy button — shown whenever there are deployed resources
                OR any historical deployment (even failed ones) might have
                leftover infrastructure. The destroy modal itself handles the
                "last deploy only" vs "everything ever" split via a toggle. */}
          {deploy.status !== 'deploying' && (
            <button
              onClick={() => setDestroyModalOpen(true)}
              id="ice-deploy-btn-destroy"
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors font-medium',
                'bg-red-600 text-white hover:bg-red-700',
              )}
              title="Destroy deployed resources — including orphaned leftovers from failed deploys"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('deploy.buttons.destroy')}
            </button>
          )}
        </div>
      </div>
      {destroyModalOpen && activeCard && (
        <DestroyConfirmModal
          cardName={activeCard.name}
          resources={deploy.deployedResources}
          onCancel={() => setDestroyModalOpen(false)}
          onConfirm={async (destroyEverything: boolean) => {
            setDestroyModalOpen(false);
            // Flip the slice into 'destroying' state BEFORE the API
            // call so progress events arriving via the socket
            // subscription don't auto-flip it back to 'deploying'.
            // The subscription hook's `startDeploying` dispatch is a
            // no-op while status === 'destroying'.
            dispatch(startDestroying({ cardId: activeCard.id }));
            try {
              if (destroyEverything) {
                console.log('[destroy] destroyAll starting', { cardId: activeCard.id, gcpProject: deploy.gcpProject });
                const res = await getApi().deploy.destroyAll(activeCard.id, {
                  gcpProject: deploy.gcpProject,
                });
                console.log('[destroy] destroyAll response', res);
                if (res.success === false && !res.deleted) {
                  dispatch(deployError(res.error || 'Destroy failed with no details'));
                  return;
                }
                if (res.success || res.deleted) {
                  dispatch(
                    appendLog(
                      `Destroyed ${res.deleted?.length || 0} resource${(res.deleted?.length || 0) === 1 ? '' : 's'} across all historical deploys.`,
                    ),
                  );
                  for (const f of res.failed || []) {
                    dispatch(appendLog(`Failed to delete ${f.type}/${f.name}: ${f.error}`));
                  }
                }
              } else {
                console.log('[destroy] destroy starting', {
                  cardId: activeCard.id,
                  provider: deploy.provider,
                  environment: deploy.environment,
                });
                const res = await getApi().deploy.destroy(activeCard.id, {
                  provider: deploy.provider,
                  region: deploy.region,
                  environment: deploy.environment,
                });
                console.log('[destroy] destroy response', res);
                if (res?.success === false) {
                  dispatch(deployError(res.error || 'Destroy failed'));
                  return;
                }
              }
              // Wipe deploy overlay from the canvas (provider_id, url,
              // deploy_status, custom domain fields, etc.) so blocks
              // and the properties panel stop showing "Live" / URL
              // pills for resources that no longer exist.
              dispatch(clearCardDeployOverlay({ cardId: activeCard.id }));
              // Drop the deploy panel's "previously deployed" list too
              // so the next deploy starts from a clean slate.
              dispatch(setDeployedResources([]));
              dispatch(resetDeploy());
            } catch (err: any) {
              console.error('[destroy] caught error', err);
              dispatch(deployError(err.message || 'Destroy failed'));
            }
          }}
        />
      )}
    </>
  );

  // Renders inline as a standard right-sidebar panel — same structure
  // and styling as Cost / Properties / Validation. The wrapping
  // ResizablePanel comes from main-layout.tsx, which mounts <DeployPanel />
  // alongside the other right-side panels when `state.deploy.isOpen` is true.
  return (
    <div id="ice-deploy-panel" className="h-full flex flex-col bg-inherit border-l border-ice-border">
      {content}
    </div>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────────

const ConfigSection: React.FC<{
  provider: string;
  gcpProject: string;
  region: string;
  environment: string;
  disabled: boolean;
  projectId?: string;
  onProviderChange: (v: string) => void;
  onProjectChange: (v: string) => void;
  onRegionChange: (v: string) => void;
  onEnvironmentChange: (v: string) => void;
}> = ({
  provider,
  gcpProject,
  region,
  environment: _environment,
  disabled,
  projectId: _projectId,
  onProviderChange: _onProviderChange,
  onProjectChange,
  onRegionChange,
  onEnvironmentChange: _onEnvironmentChange,
}) => {
  const { t } = useTranslation();
  const regions = PROVIDER_REGIONS[provider] || PROVIDER_REGIONS.gcp!;
  const projectMeta = PROVIDER_PROJECT_LABELS[provider] || PROVIDER_PROJECT_LABELS.gcp!;
  const [providerConnected, setProviderConnected] = React.useState(false);
  const [connectedProjects, setConnectedProjects] = React.useState<Array<{ id: string; name: string }>>([]);
  const [authType, setAuthType] = React.useState<string | null>(null);

  // Check provider connection status
  React.useEffect(() => {
    (async () => {
      try {
        const isConn = await getApi().provider.isConnected(provider);
        setProviderConnected(isConn);
        if (isConn) {
          const projects = await getApi().provider.getProjects(provider);
          setConnectedProjects(projects || []);
          // Get auth type
          const creds = await getApi().provider.getCredentials(provider);
          setAuthType(creds?.auth_type || null);
        } else {
          setConnectedProjects([]);
          setAuthType(null);
        }
      } catch {
        setProviderConnected(false);
        setConnectedProjects([]);
      }
    })();
  }, [provider]);

  return (
    <div className="space-y-3">
      {/* Connection status */}
      {providerConnected && (
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle className="w-3 h-3 text-emerald-500" />
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            {t('deploy.status.connected', { provider: PROVIDER_LABELS[provider] || provider })}
            {authType === 'oauth' ? ' via Google OAuth' : authType === 'service_account' ? ' via Service Account' : ''}
          </span>
        </div>
      )}
      {!providerConnected && (
        <div className="flex items-center gap-2 text-xs">
          <AlertCircle className="w-3 h-3 text-amber-500" />
          <span className="text-amber-600 dark:text-amber-400">
            {t('deploy.status.notConnected', { provider: PROVIDER_LABELS[provider] || provider })}
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {/* Provider — read-only, set in project settings */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('deploy.config.providerLabel')}</label>
          <div className="px-2 py-1.5 text-ice-sm text-ice-text-1 bg-ice-hover/50 rounded border border-ice-border/30">
            {PROVIDER_LABELS[provider] || provider || 'Not set'}
          </div>
        </div>

        {/* Project / Account — dropdown if connected projects available, text input otherwise */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{projectMeta.label}</label>
          {connectedProjects.length > 0 ? (
            <IceSelect
              value={gcpProject}
              onChange={onProjectChange}
              disabled={disabled}
              size="md"
              fullWidth
              placeholder={t('deploy.config.selectProject')}
              options={connectedProjects.map((p) => ({ value: p.id, label: p.name || p.id }))}
            />
          ) : (
            <input
              type="text"
              value={gcpProject}
              onChange={(e) => onProjectChange(e.target.value)}
              disabled={disabled}
              placeholder={projectMeta.placeholder}
              id="ice-deploy-input-project"
              className="w-full bg-transparent border-b border-ice-border/50 px-1 py-1 text-ice-sm text-ice-text-1 outline-none focus:border-ice-accent transition-colors"
            />
          )}
        </div>

        {/* Region */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('deploy.config.regionLabel')}</label>
          <IceSelect
            value={region}
            onChange={onRegionChange}
            disabled={disabled}
            size="md"
            fullWidth
            allowEmpty={false}
            options={regions}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Error banner that detects API-not-enabled errors and shows
 * actionable "Enable API" buttons with a retry option.
 */
/**
 * Specialized error banner for quota exhaustion — the common case where
 * repeated template deploys accumulate orphaned GCP resources and hit the
 * default backend-bucket limit (3 per project). Offers a one-click cleanup
 * action that calls the `/cleanup-orphans` endpoint and reports what was
 * deleted.
 */
const QuotaErrorBanner: React.FC<{
  error: string;
  results: Array<{ error?: string }>;
  onRetryDeploy: () => void;
}> = ({ error, results, onRetryDeploy }) => {
  const [state, setState] = React.useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [report, setReport] = React.useState<{
    deleted?: Array<{ type: string; name: string }>;
    errors?: Array<{ type: string; name: string; error: string }>;
  }>({});
  const [errorMsg, setErrorMsg] = React.useState<string>('');

  const fullError = [error, ...results.map((r) => r.error).filter(Boolean)].join(' ');
  const projectMatch = fullError.match(/project[=/]([a-z0-9-]+)/i);
  const projectId = projectMatch?.[1] || '';

  const runCleanup = async () => {
    setState('running');
    setErrorMsg('');
    try {
      const res = await getApi().deploy.cleanupOrphans({ gcpProject: projectId || undefined });
      if (res.success) {
        setReport(res.report || {});
        setState('done');
      } else {
        setErrorMsg(res.error || 'Cleanup failed');
        setState('failed');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
      setState('failed');
    }
  };

  const deletedCount = report.deleted?.length || 0;

  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
      <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">GCP quota exceeded</p>
          <p className="mt-1 text-amber-700 dark:text-amber-300 text-xs">
            Your project has reached a GCP quota limit (most commonly the default 3-backend-bucket ceiling). ICE can
            scan for orphaned resources from previous deploys and delete them, or you can request a quota increase in
            the GCP console.
          </p>
        </div>
      </div>
      {state === 'idle' && (
        <>
          <button
            onClick={runCleanup}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors font-medium',
              'bg-amber-600 text-white hover:bg-amber-700',
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clean up orphaned ICE resources
          </button>
          {projectId && (
            <button
              onClick={() =>
                openExternalUrl(
                  `https://console.cloud.google.com/iam-admin/quotas?project=${projectId}&filter=metric:BACKEND-BUCKETS-per-project`,
                )
              }
              className={cn(
                'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors',
                'bg-muted hover:bg-muted/80 border border-border',
              )}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Request quota increase in GCP
            </button>
          )}
        </>
      )}
      {state === 'running' && (
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
          <Loader2 className="w-4 h-4 animate-spin" />
          Scanning and deleting orphaned resources…
        </div>
      )}
      {state === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle className="w-4 h-4" />
            Cleanup complete — deleted {deletedCount} resource{deletedCount === 1 ? '' : 's'}
          </div>
          {deletedCount > 0 && (
            <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto font-mono space-y-0.5">
              {(report.deleted || []).map((d, i) => (
                <div key={i}>
                  <span className="text-emerald-500">✓</span> {d.type}/{d.name}
                </div>
              ))}
            </div>
          )}
          {(report.errors || []).length > 0 && (
            <div className="text-xs text-red-500 space-y-0.5">
              {(report.errors || []).map((e, i) => (
                <div key={i}>
                  ✗ {e.type}/{e.name}: {e.error}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={onRetryDeploy}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors font-medium',
              'bg-emerald-600 text-white hover:bg-emerald-700',
            )}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry deploy
          </button>
        </div>
      )}
      {state === 'failed' && (
        <div className="space-y-2">
          <div className="text-xs text-red-500">Cleanup failed: {errorMsg}</div>
          <button
            onClick={runCleanup}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors',
              'bg-muted hover:bg-muted/80 border border-border',
            )}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry cleanup
          </button>
        </div>
      )}
    </div>
  );
};

const ApiErrorBanner: React.FC<{
  error: string;
  results: Array<{ error?: string; api_enable_url?: string }>;
  onRetryDeploy: () => void;
}> = ({ error, results, onRetryDeploy }) => {
  const { t } = useTranslation();
  // Collect all unique enable URLs from results and error message, then
  // classify the error into one of five priority-cascade kinds. Both the
  // collection loop and the cascade live in `utils/error-classification`
  // (rf-pdpl-5); the regex, the OR-joined `includes()` checks, and the
  // priority order are preserved verbatim.
  const enableUrls = collectApiEnableUrls(error, results);
  const hasApiErrors = enableUrls.size > 0;
  const kind = classifyDeployError(error, results);

  if (kind === 'quota') {
    return <QuotaErrorBanner error={error} results={results} onRetryDeploy={onRetryDeploy} />;
  }

  if (kind === 'billing') {
    // Extract project ID from error or URL
    const projectId = extractProjectIdFromError(error);
    return (
      <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
        <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{t('deploy.errors.billingTitle')}</p>
            <p className="mt-1 text-amber-700 dark:text-amber-300 text-xs">{t('deploy.errors.billingDescription')}</p>
          </div>
        </div>
        <button
          onClick={() => openExternalUrl(`https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`)}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors font-medium',
            'bg-amber-600 text-white hover:bg-amber-700',
          )}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {t('deploy.errors.billingButton')}
        </button>
        <button
          onClick={onRetryDeploy}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors font-medium',
            'bg-emerald-600 text-white hover:bg-emerald-700',
          )}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t('deploy.buttons.retryDeploy')}
        </button>
      </div>
    );
  }

  if (kind === 'rapt') {
    return (
      <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
        <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{t('deploy.errors.raptTitle')}</p>
            <p className="mt-1 text-amber-700 dark:text-amber-300 text-xs">{t('deploy.errors.raptDescription')}</p>
          </div>
        </div>
        <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1 pl-6">
          <p className="font-medium">{t('deploy.errors.raptFixTitle')}</p>
          <p>
            1. <strong>{t('deploy.errors.raptOption1')}</strong> —{' '}
            <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-ice-2xs">
              iam.disableServiceAccountKeyCreation
            </code>{' '}
            →{' '}
            <a
              href="https://console.cloud.google.com/iam-admin/orgpolicies/iam-disableServiceAccountKeyCreation"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Organisation Policies
            </a>
          </p>
          <p>
            2. <strong>{t('deploy.errors.raptOption2')}</strong> —{' '}
            <a
              href="https://admin.google.com/ac/security/reauth"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Google Workspace Admin &rarr; Security &rarr; Google Cloud session control
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (!hasApiErrors) {
    // Standard error display
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }

  // API-not-enabled error with actionable buttons
  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
      <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">{t('deploy.errors.apiNotEnabledTitle')}</p>
          <p className="mt-1 text-amber-700 dark:text-amber-300 text-xs">{t('deploy.errors.apiNotEnabledHint')}</p>
          <p className="mt-1 text-amber-600 dark:text-amber-400 text-xs">
            {t('deploy.errors.autoEnableHint')} Add it in{' '}
            <a
              href="https://console.cloud.google.com/iam-admin/iam"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              IAM &amp; Admin
            </a>
            .
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {[...enableUrls].map((url, i) => {
          // Extract API name from URL for display
          const apiName = extractApiName(url) ?? 'API';

          return (
            <button
              key={i}
              onClick={() => openExternalUrl(url)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
                'bg-white dark:bg-amber-900/30 border border-amber-300 dark:border-amber-600',
                'hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-100',
              )}
            >
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="font-medium">{t('deploy.errors.enableApi', { api: apiName })}</span>
              <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">
                {t('deploy.errors.opensConsole')}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onRetryDeploy}
        className={cn(
          'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors font-medium',
          'bg-emerald-600 text-white hover:bg-emerald-700',
        )}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        {t('deploy.buttons.retryDeploy')}
      </button>
    </div>
  );
};

const ResultsSummary: React.FC<{
  results: Array<{
    name: string;
    type: string;
    action: string;
    success: boolean;
    error?: string;
    api_enable_url?: string;
    provider_id?: string;
    outputs?: Record<string, unknown>;
    duration_ms?: number;
  }>;
}> = ({ results }) => {
  const { t } = useTranslation();
  const { succeeded, failed, totalMs, allOk } = summaryCounts(results);

  // Plain-text dump for the "Copy summary" / "Copy errors" buttons.
  // Includes per-resource status, durations, and full error text — much
  // easier to paste into a bug report than scraping individual rows.
  // rf-pdpl-4: extracted to utils/results-summary-text.ts. Closure shim kept
  // so the `copy` call site below stays unchanged.
  const buildSummaryText = (errorsOnly: boolean) =>
    buildResultsSummaryText(results, { errorsOnly });

  const copy = (errorsOnly: boolean) => {
    navigator.clipboard.writeText(buildSummaryText(errorsOnly)).catch(() => undefined);
  };

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="px-4 py-3 bg-muted/40 border-b border-border space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {allOk ? (
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-500" />
          )}
          <span className={allOk ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>
            {allOk ? 'Deploy succeeded' : 'Deploy finished with errors'}
          </span>
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            {(totalMs / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-3 h-3" />
            {t('deploy.progress.succeeded', { count: succeeded })}
          </span>
          {failed > 0 && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <AlertCircle className="w-3 h-3" />
              {t('deploy.progress.failed', { count: failed })}
            </span>
          )}
          <button
            onClick={() => copy(false)}
            className="ml-auto px-2 py-0.5 rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Copy the full per-resource summary as plain text"
          >
            Copy summary
          </button>
          {failed > 0 && (
            <button
              onClick={() => copy(true)}
              className="px-2 py-0.5 rounded border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              title="Copy only the failed resources and their error messages"
            >
              Copy errors
            </button>
          )}
        </div>
      </div>
      <div className="divide-y divide-border max-h-48 overflow-y-auto">
        {results.map((r, i) => (
          <div key={i} className="px-4 py-2 text-sm space-y-1">
            <div className="flex items-center gap-2">
              {r.success ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className="font-medium">{r.name}</span>
              <span
                className={cn(
                  'text-xs font-medium px-1.5 py-0.5 rounded',
                  r.action === 'create'
                    ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20'
                    : r.action === 'update'
                      ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'
                      : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
                )}
              >
                {r.action}
              </span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-mono">{r.type}</span>
              {r.duration_ms && (
                <span className="ml-auto text-xs text-muted-foreground">{(r.duration_ms / 1000).toFixed(1)}s</span>
              )}
            </div>
            {r.provider_id && (
              <div className="flex items-center gap-1.5 pl-6">
                <span
                  className="text-ice-xs text-muted-foreground font-mono truncate max-w-[400px]"
                  title={r.provider_id}
                >
                  {r.provider_id}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(r.provider_id!)}
                  className="text-ice-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  title={t('deploy.copy.copyProviderId')}
                >
                  {t('deploy.copy.copy')}
                </button>
              </div>
            )}
            {(() => {
              // Phase 2: primary output pill + GCP console deep-link.
              // When a custom domain is the primary URL, also surface the
              // default URL underneath so the user can hit the always-live
              // internal endpoint (bucket HTTPS, run.app URL, LB IP).
              const po = primaryOutput(r.type, r.outputs, r.provider_id);
              if (!po) return null;
              const defaultUrl = (r.outputs?.default_url as string) || '';
              const showDefault = defaultUrl && defaultUrl !== po.value && defaultUrl !== po.url;

              // Click on URL text:
              //   - If it's an http(s) URL, open in a new tab (what users
              //     actually want — they click a URL to VISIT the site).
              //   - Shift+click or anything that's not an http URL copies
              //     to clipboard.
              const handleUrlClick = (text: string) => (e: React.MouseEvent) => {
                const isHttp = /^https?:\/\//.test(text);
                if (isHttp && !e.shiftKey) {
                  openExternalUrl(text);
                } else {
                  navigator.clipboard.writeText(text);
                }
              };
              const isHttp = (text: string) => /^https?:\/\//.test(text);

              return (
                <>
                  <div className="flex items-center gap-1.5 pl-6">
                    <span className="text-ice-xs font-medium text-muted-foreground">{po.label}:</span>
                    <span
                      className={cn(
                        'text-ice-xs font-mono truncate max-w-[400px] cursor-pointer hover:text-foreground',
                        isHttp(po.value) && 'text-blue-500 dark:text-blue-400 underline',
                      )}
                      title={
                        isHttp(po.value)
                          ? `Click to open · Shift+click to copy: ${po.value}`
                          : `Click to copy: ${po.value}`
                      }
                      onClick={handleUrlClick(po.value)}
                    >
                      {po.value}
                    </span>
                    {po.url && (
                      <button
                        onClick={() => openExternalUrl(po.url!)}
                        className="text-ice-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {showDefault && (
                    <div className="flex items-center gap-1.5 pl-6">
                      <span className="text-ice-xs font-medium text-muted-foreground">Default:</span>
                      <span
                        className={cn(
                          'text-ice-xs font-mono truncate max-w-[400px] cursor-pointer hover:text-foreground',
                          isHttp(defaultUrl) && 'text-blue-500 dark:text-blue-400 underline',
                        )}
                        title={
                          isHttp(defaultUrl)
                            ? `Click to open · Shift+click to copy: ${defaultUrl}`
                            : `Click to copy: ${defaultUrl}`
                        }
                        onClick={handleUrlClick(defaultUrl)}
                      >
                        {defaultUrl}
                      </span>
                      <button
                        onClick={() => openExternalUrl(defaultUrl)}
                        className="text-ice-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
            {r.error &&
              (() => {
                const enableUrl =
                  r.api_enable_url || (isApiNotEnabledError(r.error) ? extractApiEnableUrl(r.error) : null);
                if (enableUrl) {
                  return (
                    <div className="pl-6 flex items-center gap-2">
                      <button
                        onClick={() => openExternalUrl(enableUrl)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {t('deploy.buttons.enableApi')}
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="pl-6 text-xs text-red-500 break-words" title={r.error}>
                    <span>{r.error}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(r.error!)}
                      className="ml-2 text-muted-foreground hover:text-foreground"
                      title="Copy error"
                    >
                      [copy]
                    </button>
                  </div>
                );
              })()}
          </div>
        ))}
      </div>
    </div>
  );
};

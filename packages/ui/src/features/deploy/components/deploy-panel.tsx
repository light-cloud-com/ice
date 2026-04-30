/**
 * Deploy Panel
 *
 * Modal overlay for deploying the active card's infrastructure to GCP.
 * Flow: Configure → Plan → Review → Deploy → Results
 */

import { Rocket } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { ApiErrorBanner } from './banners/api-error-banner';
import { DeployControls } from './deploy-controls';
import { DeployDiagnosis } from './deploy-diagnosis';
import { DeployInFlightPanel } from './deploy-in-flight-panel';
import { DestroyConfirmModal } from './destroy-confirm-modal';
import { PlanPreview } from './plan-preview';
import { PreDeployWarnings } from './predeploy-warnings';
import { RequirementsSection } from './requirements-section';
import { ResultsSummary } from './results-summary';
import { AuthBanner } from './sections/auth-banner';
import { ConfigSection } from './sections/config-section';
import { DeployedResourcesList } from './sections/deployed-resources-list';
import { DnsRecordsSection } from './sections/dns-records-section';
import { LogPanel } from './sections/log-panel';
import { StatusBadge } from './status-badge';
import { useDeployActions } from '../hooks/use-deploy-actions';
import { useTranslation } from '../../../i18n';
import { getApi } from '../../../shared/api/api-adapter';
import { PanelHeader } from '../../../shared/components/ui/panel-header';
import { selectActiveCard, clearCardDeployOverlay } from '../../../store/slices/cards-slice';
import {
  setProvider,
  setGcpProject,
  setRegion,
  setEnvironment,
  startDestroying,
  deployError,
  hydrateDeployFromHistory,
  resetDeploy,
  appendLog,
  setDeployedResources,
  type DeployResourceResult,
} from '../../../store/slices/deploy-slice';
import { analyzePreDeploy } from '../utils/predeploy-analysis';
import {
  PROVIDER_REGIONS,
  PROVIDER_LABELS,
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

  // ─── Orchestrator-level deploy callbacks ────────────────────────────
  //
  // Auth, plan, deploy, fetchRequirements, handleVerifyRequirement, and
  // handleClose live in `useDeployActions`. The hook returns them as an
  // object with the same dispatch ordering and retry-after-auth re-dispatch
  // semantics as the inline source.
  const {
    fetchRequirements,
    handleVerifyRequirement,
    handlePlan,
    handleDeploy,
    handleClose,
  } = useDeployActions({ activeCard: activeCard ?? null, deploy, pendingRetryRef });

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
      <DeployControls
        status={deploy.status}
        provider={deploy.provider}
        gcpProject={deploy.gcpProject}
        gcpNodesCount={gcpNodes.length}
        deployedResourcesCount={deploy.deployedResources.length}
        requirements={deploy.requirements}
        preDeployHasCritical={preDeployAnalysis?.hasCritical === true}
        criticalAcknowledged={deploy.criticalAcknowledged}
        activeCardId={activeCard?.id ?? null}
        onPlan={handlePlan}
        onDeploy={handleDeploy}
        onReset={() => dispatch(resetDeploy())}
        onOpenDestroyModal={() => setDestroyModalOpen(true)}
        onAppendLog={(msg) => dispatch(appendLog(msg))}
      />
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


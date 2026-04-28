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
  Plus,
  RefreshCw,
  Trash2,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import { DeployDiagnosis } from './deploy-diagnosis';
import { PreDeployWarnings } from './predeploy-warnings';
import { RequirementsSection } from './requirements-section';
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
  type DeployStatus,
  type DeployResourceResult,
} from '../../../store/slices/deploy-slice';
import { primaryOutput } from '../output-extractors';
import { analyzePreDeploy } from '../utils/predeploy-analysis';
import type { RootState, AppDispatch } from '../../../store';

// ─── Provider regions ────────────────────────────────────────────────────────

const PROVIDER_REGIONS: Record<string, string[]> = {
  gcp: [
    'us-central1',
    'us-east1',
    'us-east4',
    'us-west1',
    'us-west2',
    'europe-west1',
    'europe-west2',
    'europe-west3',
    'europe-west4',
    'asia-east1',
    'asia-southeast1',
    'asia-northeast1',
    'australia-southeast1',
  ],
  aws: [
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'eu-west-1',
    'eu-west-2',
    'eu-central-1',
    'ap-southeast-1',
    'ap-northeast-1',
    'ap-south-1',
  ],
  azure: [
    'eastus',
    'eastus2',
    'westus',
    'westus2',
    'centralus',
    'northeurope',
    'westeurope',
    'uksouth',
    'southeastasia',
    'eastasia',
    'australiaeast',
  ],
};

const PROVIDER_LABELS: Record<string, string> = {
  gcp: 'GCP',
  aws: 'AWS',
  azure: 'Azure',
  kubernetes: 'Kubernetes',
};

const PROVIDER_PROJECT_LABELS: Record<string, { label: string; placeholder: string }> = {
  gcp: { label: 'GCP Project', placeholder: 'my-gcp-project' },
  aws: { label: 'AWS Account / Region', placeholder: '123456789012' },
  azure: { label: 'Azure Subscription', placeholder: 'my-subscription-id' },
  kubernetes: { label: 'Cluster Name', placeholder: 'my-k8s-cluster' },
};

/** Detect the dominant provider from canvas resource nodes */
function detectDominantProvider(nodes: Array<{ type: string; data?: Record<string, unknown> }>): string {
  const counts: Record<string, number> = {};
  for (const n of nodes) {
    if (n.type !== 'resource') continue;
    const p = (n.data?.provider as string) || '';
    if (p) counts[p] = (counts[p] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'gcp';
}

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
          <div className="rounded-md border border-border overflow-hidden">
            <div className="px-4 py-2 bg-muted/40 border-b border-border text-sm font-medium flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
              {deploy.deployedResources.length} deployed resource
              {deploy.deployedResources.length !== 1 ? 's' : ''} (from prior deploy)
            </div>
            <div className="divide-y divide-border max-h-32 overflow-y-auto">
              {deploy.deployedResources.map((r, i) => (
                <div key={i} className="px-4 py-1.5 text-xs flex items-center gap-2">
                  <span className="font-medium text-sm">{r.name}</span>
                  <span className="text-muted-foreground font-mono">{r.type}</span>
                  {r.provider_id && (
                    <span
                      className="ml-auto text-muted-foreground font-mono truncate max-w-[250px]"
                      title={r.provider_id}
                    >
                      {r.provider_id}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Authenticating */}
        {deploy.status === 'authenticating' && (
          <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-4 text-sm">
            <div className="flex items-center gap-2.5 text-orange-700 dark:text-orange-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="font-medium">{t('deploy.auth.connecting')}</span>
            </div>
            <p className="mt-2 text-orange-600 dark:text-orange-400 text-xs">{t('deploy.auth.browserPrompt')}</p>
          </div>
        )}

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

        {/* Custom domain DNS records — surfaced from any Firebase
              Hosting result that registered a custom domain. Each row
              is copyable so the user can paste straight into their
              registrar without digging through the Firebase Console. */}
        {(() => {
          type DnsRec = { type: string; domain: string; value: string; required_action?: string };
          const dnsResults = deploy.results.filter(
            (r) =>
              r.success &&
              Array.isArray((r.outputs as any)?.custom_domain_dns_records) &&
              (r.outputs as any).custom_domain_dns_records.length > 0,
          );
          if (dnsResults.length === 0) return null;

          const renderRecord = (
            rec: DnsRec,
            ridx: number,
            palette: { bg: string; type: string; chip: string; chipHover: string },
          ) => (
            <div key={ridx} className={cn('flex items-center gap-2 text-xs font-mono px-2 py-1.5 rounded', palette.bg)}>
              <span className={cn('font-semibold w-12 shrink-0', palette.type)}>{rec.type}</span>
              <span className="text-muted-foreground truncate flex-shrink min-w-0" title={rec.domain}>
                {rec.domain}
              </span>
              <span className="text-foreground truncate flex-1 min-w-0" title={rec.value}>
                {rec.value}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(rec.value).catch(() => undefined);
                }}
                className={cn('shrink-0 px-2 py-0.5 text-[10px] rounded', palette.chip, palette.chipHover)}
                title="Copy value to clipboard"
              >
                Copy
              </button>
            </div>
          );

          const renderHeader = () => (
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 pb-1">
              <span className="w-12 shrink-0">Type</span>
              <span className="flex-shrink min-w-0">Domain name</span>
              <span className="flex-1 min-w-0">Value</span>
              <span className="w-10 shrink-0" />
            </div>
          );

          return (
            <div className="space-y-2">
              {dnsResults.map((r, idx) => {
                const allRecords = ((r.outputs as any).custom_domain_dns_records || []) as DnsRec[];
                const addRecords = allRecords.filter((rec) => (rec.required_action || 'add') !== 'remove');
                const removeRecords = allRecords.filter((rec) => rec.required_action === 'remove');
                const customDomain = (r.outputs as any)?.custom_domain || r.name;
                return (
                  <div
                    key={`${r.name}-${idx}`}
                    className="rounded-md border border-blue-500/30 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-blue-700 dark:text-blue-300">
                        DNS records for {customDomain}
                      </span>
                    </div>

                    {addRecords.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[11px] font-medium text-blue-700 dark:text-blue-300">
                          Add the records below at your DNS provider to verify that you own {customDomain}
                        </div>
                        {renderHeader()}
                        {addRecords.map((rec, ridx) =>
                          renderRecord(rec, ridx, {
                            bg: 'bg-background/60',
                            type: 'text-blue-700 dark:text-blue-300',
                            chip: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
                            chipHover: 'hover:bg-blue-500/30',
                          }),
                        )}
                      </div>
                    )}

                    {removeRecords.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          Remove the records below from your DNS provider — they conflict with the new configuration and
                          block verification
                        </div>
                        {renderHeader()}
                        {removeRecords.map((rec, ridx) =>
                          renderRecord(rec, ridx, {
                            bg: 'bg-amber-50 dark:bg-amber-950/30',
                            type: 'text-amber-700 dark:text-amber-300',
                            chip: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
                            chipHover: 'hover:bg-amber-500/30',
                          }),
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Logs */}
        {deploy.logs.length > 0 && (
          <div
            id="ice-deploy-log"
            className="rounded-md border border-border bg-slate-950 text-slate-300 p-3 max-h-48 overflow-y-auto font-mono text-xs leading-relaxed"
          >
            {deploy.logs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-ice-text-3 select-none">{String(i + 1).padStart(3, ' ')}</span>
                <span>{log}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {/* Deploy progress */}
        {deploy.status === 'deploying' && (
          <div id="ice-deploy-progress" className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {deploy.currentResource || t('deploy.progress.deploying')}
              </span>
              <span className="font-mono text-xs">{deploy.progress}%</span>
            </div>
            {deploy.currentStep && (
              <div className="text-xs text-muted-foreground pl-5">
                └ {deploy.currentStep.label} ({deploy.currentStep.index}/{deploy.currentStep.total})
              </div>
            )}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${deploy.progress}%` }}
              />
            </div>
          </div>
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

const StatusBadge: React.FC<{ status: DeployStatus; id?: string }> = ({ status, id }) => {
  const { t } = useTranslation();
  if (status === 'idle') return null;

  const config: Record<string, { label: string; color: string }> = {
    authenticating: {
      label: t('deploy.status.authenticating'),
      color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    },
    planning: {
      label: t('deploy.status.planning'),
      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    },
    planned: {
      label: t('deploy.status.planned'),
      color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    },
    deploying: {
      label: t('deploy.status.deploying'),
      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
    destroying: {
      label: 'Destroying',
      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    },
    success: {
      label: t('deploy.status.success'),
      color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    },
    error: {
      label: t('deploy.status.error'),
      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    },
    cancelled: {
      label: t('deploy.status.cancelled'),
      color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
    },
  };

  const c = config[status];
  if (!c) return null;

  return (
    <span id={id} className={cn('px-2 py-0.5 text-xs font-medium rounded-full', c.color)}>
      {c.label}
    </span>
  );
};

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

const PlanPreview: React.FC<{ plan: DeployPlan }> = ({ plan }) => {
  const { t } = useTranslation();
  const creates = Array.isArray(plan.creates) ? plan.creates : [];
  const updates = Array.isArray(plan.updates) ? plan.updates : [];
  const deletes = Array.isArray(plan.deletes) ? plan.deletes : [];
  const skipped = Array.isArray(plan.skipped) ? plan.skipped : [];
  const total = creates.length + updates.length + deletes.length;

  if (total === 0 && skipped.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground text-center">
        {t('deploy.plan.noChanges')}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="px-4 py-2 bg-muted/40 border-b border-border text-sm font-medium flex items-center gap-2">
        <Eye className="w-3.5 h-3.5" />
        {t('deploy.plan.changes', { total })}
      </div>
      <div className="divide-y divide-border max-h-64 overflow-y-auto">
        {creates.map((r, i) => (
          <ChangeRow key={`c-${i}`} name={r.name} type={r.type} action="create" />
        ))}
        {updates.map((r, i) => (
          <ChangeRow key={`u-${i}`} name={r.name} type={r.type} action="update" />
        ))}
        {deletes.map((r, i) => (
          <ChangeRow key={`d-${i}`} name={r.name} type={r.type} action="delete" />
        ))}
        {skipped.map((s: any, i) => (
          <div key={`s-${i}`} className="px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <span className="w-16 text-gray-500">{t('deploy.plan.skip')}</span>
            <span>{s.name || s.label || s.nodeId}</span>
            <span className="ml-auto text-gray-500">{s.reason}</span>
          </div>
        ))}
      </div>
      {Array.isArray(plan.warnings) && plan.warnings.length > 0 && (
        <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/10 border-t border-border">
          {plan.warnings.map((w, i) => (
            <div key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ChangeRow: React.FC<{
  name: string;
  type: string;
  action: 'create' | 'update' | 'delete';
}> = ({ name, type, action }) => {
  const icons = {
    create: <Plus className="w-3 h-3 text-emerald-500" />,
    update: <RefreshCw className="w-3 h-3 text-blue-500" />,
    delete: <Trash2 className="w-3 h-3 text-red-500" />,
  };
  const labels = {
    create: 'text-emerald-600 dark:text-emerald-400',
    update: 'text-blue-600 dark:text-blue-400',
    delete: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="px-4 py-2 text-sm flex items-center gap-2.5">
      {icons[action]}
      <span className={cn('w-16 text-xs font-medium', labels[action])}>{action}</span>
      <span className="font-medium">{name}</span>
      <span className="ml-auto text-xs text-muted-foreground font-mono">{type}</span>
    </div>
  );
};

/**
 * Handle opening a URL in the user's default browser.
 * Tries IPC bridge first, falls back to window.open().
 */
function openExternalUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

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
  // Collect all unique enable URLs from results and error message
  const enableUrls = new Set<string>();
  for (const r of results) {
    if (r.api_enable_url) enableUrls.add(r.api_enable_url);
    if (r.error && isApiNotEnabledError(r.error)) {
      const url = extractApiEnableUrl(r.error);
      if (url) enableUrls.add(url);
    }
  }
  if (isApiNotEnabledError(error)) {
    const url = extractApiEnableUrl(error);
    if (url) enableUrls.add(url);
  }

  const hasApiErrors = enableUrls.size > 0;

  // Quota exhaustion. Matches the family of GCP quota errors: backend
  // buckets, in-use IP addresses, forwarding rules, URL maps, etc. —
  // all of which leak together when template deploys partially fail.
  const QUOTA_PATTERN =
    /QUOTA_EXCEEDED|quota.*exceeded|BACKEND_BUCKETS|IN_USE_ADDRESSES|IN-USE-ADDRESSES|FORWARDING_RULES|URL_MAPS|TARGET_(HTTPS?)_PROXIES|BACKEND_SERVICES|SSL_CERTIFICATES/i;
  const isQuotaError = QUOTA_PATTERN.test(error) || results.some((r) => r.error && QUOTA_PATTERN.test(r.error));

  if (isQuotaError) {
    return <QuotaErrorBanner error={error} results={results} onRetryDeploy={onRetryDeploy} />;
  }

  // Check for billing errors
  const isBillingError =
    error.includes('Billing') ||
    error.includes('billing') ||
    results.some((r) => r.error?.includes('Billing') || r.error?.includes('billing'));

  if (isBillingError) {
    // Extract project ID from error or URL
    const projectMatch = error.match(/project[=/]([a-z0-9-]+)/i);
    const projectId = projectMatch?.[1] || '';
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

  // Check for RAPT / re-authentication errors
  const isRaptError =
    error.includes('invalid_rapt') ||
    error.includes('reauth') ||
    results.some((r) => r.error?.includes('invalid_rapt') || r.error?.includes('reauth'));

  if (isRaptError) {
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

/**
 * Phase 5 — in-panel destroy confirmation.
 *
 * Replaces the old browser `confirm()` dialog with a modal that:
 *   - shows every deployed resource by name and type (users know exactly
 *     what's about to go away),
 *   - requires the user to type the card name to unlock the red button
 *     (deliberate high-friction for a destructive action),
 *   - is keyboard accessible (Esc cancels).
 */
const DestroyConfirmModal: React.FC<{
  cardName: string;
  resources: Array<{ name: string; type: string }>;
  onCancel: () => void;
  onConfirm: (destroyEverything: boolean) => void;
}> = ({ cardName, resources, onCancel, onConfirm }) => {
  const [typed, setTyped] = React.useState('');
  const [destroyEverything, setDestroyEverything] = React.useState(resources.length === 0);
  const canConfirm = typed.trim() === cardName;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-[560px] max-h-[85vh] bg-background rounded-lg shadow-xl overflow-hidden flex flex-col border border-red-500/30"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-center gap-2 bg-red-50 dark:bg-red-950/20">
          <Trash2 className="w-4 h-4 text-red-500" />
          <h2 className="text-base font-semibold text-red-700 dark:text-red-300">
            {destroyEverything ? 'Destroy all infrastructure?' : 'Destroy deployment?'}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {!destroyEverything && resources.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                This will permanently delete the following {resources.length} resource
                {resources.length === 1 ? '' : 's'} from the cloud:
              </p>
              <div className="rounded-md border border-border divide-y divide-border max-h-40 overflow-y-auto">
                {resources.map((r, i) => (
                  <div key={i} className="px-3 py-2 text-sm flex items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground font-mono ml-auto">{r.type}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {destroyEverything && (
            <>
              <p className="text-sm text-muted-foreground">
                This will scan every historical deployment for this card — including{' '}
                <span className="font-medium">failed and partial deploys</span> — and delete every ICE-managed resource
                it finds in GCP. Use this when a normal destroy can't find orphaned leftovers or you've hit a GCP quota
                from accumulated resources.
              </p>
              <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-300">
                Deletes in dependency order: forwarding rules → target proxies → URL maps → backend buckets → backend
                services → storage buckets → SSL certificates. Resources are destroyed in reverse creation order to
                avoid "still in use" errors.
              </div>
            </>
          )}

          {!destroyEverything && resources.length === 0 && (
            <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
              No resources tracked for this card. If you previously ran a deploy that failed, enable "Destroy
              everything" to scan for orphaned leftovers.
            </div>
          )}

          {/* Scope toggle */}
          <label className="flex items-start gap-2 p-3 rounded-md border border-border bg-muted/30 cursor-pointer">
            <input
              type="checkbox"
              checked={destroyEverything}
              onChange={(e) => setDestroyEverything(e.target.checked)}
              className="mt-0.5"
            />
            <div className="text-xs">
              <div className="font-medium text-foreground">Destroy everything for this project</div>
              <div className="text-muted-foreground mt-0.5">
                Walks every historical deployment (success, partial, failed) and the resource mapping table. Useful when
                the normal destroy misses orphans from failed deploys.
              </div>
            </div>
          </label>

          <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300">
              This cannot be undone. Any data stored in these resources will be lost.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">{cardName}</span> to confirm:
            </label>
            <input
              autoFocus
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-red-500/40"
              placeholder={cardName}
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(destroyEverything)}
            disabled={!canConfirm}
            className={cn(
              'px-4 py-1.5 text-sm rounded-md font-medium transition-colors',
              'bg-red-600 text-white hover:bg-red-700',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {destroyEverything ? 'Destroy everything' : 'Destroy'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalMs = results.reduce((acc, r) => acc + (r.duration_ms || 0), 0);
  const allOk = failed === 0;

  // Plain-text dump for the "Copy summary" / "Copy errors" buttons.
  // Includes per-resource status, durations, and full error text — much
  // easier to paste into a bug report than scraping individual rows.
  const buildSummaryText = (errorsOnly: boolean) => {
    const header = errorsOnly
      ? `Deploy errors (${failed} of ${results.length} resource(s) failed)`
      : `Deploy summary: ${succeeded}/${results.length} succeeded, ${failed} failed, ${(totalMs / 1000).toFixed(1)}s`;
    const lines: string[] = [header, ''];
    for (const r of results) {
      if (errorsOnly && r.success) continue;
      const flag = r.success ? '✓' : '✗';
      const dur = r.duration_ms ? ` (${(r.duration_ms / 1000).toFixed(1)}s)` : '';
      lines.push(`${flag} ${r.type} ${r.name} [${r.action}]${dur}`);
      if (r.error) lines.push(`  error: ${r.error}`);
      if (r.provider_id) lines.push(`  resource: ${r.provider_id}`);
    }
    return lines.join('\n');
  };

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

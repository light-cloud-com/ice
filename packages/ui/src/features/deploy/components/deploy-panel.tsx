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
import { IceSelect } from '../../../shared/components/ui/ice-select';
import { useTranslation } from '../../../i18n';
import { isApiNotEnabledError, extractApiName, extractApiEnableUrl } from '../../../shared/utils/gcp-errors';
import { getApi } from '../../../shared/api/api-adapter';
import { cn } from '../../../shared/utils/cn';
import { selectActiveCard, updateCardNodeData } from '../../../store/slices/cards-slice';
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
  setDeployProgress,
  addResourceResult,
  deploySuccess,
  deployError,
  resetDeploy,
  appendLog,
  setDeployedResources,
  type DeployPlan,
  type DeployStatus,
} from '../../../store/slices/deploy-slice';
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

export const DeployPanel: React.FC<{ isOpen: boolean }> = ({ isOpen }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const activeCard = useSelector(selectActiveCard);
  const deploy = useSelector((state: RootState) => state.deploy);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pendingRetryRef = useRef<'plan' | 'deploy' | null>(null);

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

  // Subscribe to deploy progress room for this card
  useEffect(() => {
    if (!isOpen || !activeCard) return;
    const api = getApi();
    const unsub = api.subscribeDeployProgress?.(activeCard.id);
    return () => {
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use activeCard?.id to avoid re-firing on card object reference changes
  }, [isOpen, activeCard?.id]);

  // Listen to deploy progress events from main process
  useEffect(() => {
    if (!isOpen) return;

    const cleanup = getApi().onDeployProgress((event: any) => {
      if (event.type === 'progress') {
        dispatch(
          setDeployProgress({
            progress: event.progress ?? 0,
            resource: event.resource ?? '',
            message: event.message ?? '',
          }),
        );
      } else if (event.type === 'resource_result') {
        dispatch(addResourceResult(event.result));
        // Sync deploy outputs back to the source card node
        if (event.result.success && event.result.source_node_id) {
          const nodeData: Record<string, unknown> = {
            provider_id: event.result.provider_id,
            status: 'active',
          };
          if (event.result.outputs) {
            Object.assign(nodeData, event.result.outputs);
          }
          dispatch(updateCardNodeData({ nodeId: event.result.source_node_id, data: nodeData }));
        }
      } else if (event.type === 'log') {
        dispatch(appendLog(event.message));
      } else if (event.type === 'complete') {
        // Deploy finished — update status and show results
        if (event.success) {
          dispatch(deploySuccess({ duration_ms: event.duration_ms || 0 }));
          // Reload deployed resources
          if (activeCard) {
            (async () => {
              try {
                const res = await getApi().deploy.getResources(activeCard.id);
                if (res.success && res.resources) {
                  dispatch(setDeployedResources(res.resources));
                }
              } catch {}
            })();
          }
        }
      }
    });

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use activeCard?.id to avoid re-firing on card object reference changes
  }, [isOpen, activeCard?.id, dispatch]);

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
  }, [activeCard, deploy.provider, deploy.gcpProject, deploy.region, deploy.environment, dispatch, handleAuthenticate]);

  // ─── Deploy ─────────────────────────────────────────────────────────

  const handleDeploy = useCallback(async () => {
    if (!activeCard) return;

    dispatch(startDeploying());

    try {
      const result = await getApi().deploy.apply(activeCard.id, activeCard.nodes, activeCard.edges, {
        provider: deploy.provider,
        gcpProject: deploy.gcpProject,
        region: deploy.region,
        environment: deploy.environment,
      });

      // Success/results are handled via socket events (resource_result + complete).
      // Only handle errors and auth here.
      if (result.success) {
        // Socket 'complete' event handles deploySuccess — but as fallback:
        if (deploy.status === 'deploying') {
          dispatch(deploySuccess({ duration_ms: result.duration_ms || 0 }));
          try {
            const res = await getApi().deploy.getResources(activeCard.id);
            if (res.success && res.resources) {
              dispatch(setDeployedResources(res.resources));
            }
          } catch {}
        }
      } else if (result.needsAuth) {
        // Auto-trigger auth flow, then retry deploy
        const authed = await handleAuthenticate('deploy');
        if (authed) {
          // Retry deploy after successful auth
          dispatch(startDeploying());
          const retry = await getApi().deploy.apply(activeCard.id, activeCard.nodes, activeCard.edges, {
            provider: deploy.provider,
            gcpProject: deploy.gcpProject,
            region: deploy.region,
            environment: deploy.environment,
          });
          if (retry.success) {
            dispatch(deploySuccess({ duration_ms: retry.duration_ms || 0 }));
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
    deploy.status,
    dispatch,
    handleAuthenticate,
  ]);

  // ─── Close ──────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    if (deploy.status === 'deploying' || deploy.status === 'authenticating') return;
    dispatch(closeDeployPanel());
    dispatch(resetDeploy());
  }, [deploy.status, dispatch]);

  if (!isOpen) return null;

  const resourceNodes = activeCard?.nodes.filter((n) => n.type === 'resource') ?? [];
  const providerNodes = resourceNodes.filter((n) => n.data?.provider === deploy.provider);
  // Keep gcpNodes alias for backward compat within this component
  const gcpNodes = providerNodes;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div
        id="ice-deploy-panel"
        className="w-[900px] max-h-[85vh] bg-background rounded-lg shadow-xl overflow-hidden flex flex-col border border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <Rocket className="w-5 h-5 text-emerald-500" />
            <h2 className="text-base font-semibold">{t('deploy.title')}</h2>
            <StatusBadge status={deploy.status} id="ice-deploy-status" />
          </div>
          <button
            onClick={handleClose}
            disabled={deploy.status === 'deploying' || deploy.status === 'authenticating'}
            id="ice-deploy-btn-close"
            className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
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
            onEnvironmentChange={(v) => dispatch(setEnvironment(v))}
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

          {/* Plan preview */}
          {deploy.plan && <PlanPreview plan={deploy.plan} />}

          {/* Error */}
          {deploy.error && (
            <ApiErrorBanner error={deploy.error} results={deploy.results} onRetryDeploy={handleDeploy} />
          )}

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
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${deploy.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {(deploy.status === 'success' || deploy.status === 'error') && deploy.results.length > 0 && (
            <div id="ice-deploy-results">
              <ResultsSummary results={deploy.results} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30">
          <button
            onClick={() => dispatch(resetDeploy())}
            disabled={deploy.status === 'deploying'}
            id="ice-deploy-btn-cancel"
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {t('deploy.buttons.reset')}
          </button>
          <div className="flex items-center gap-2">
            {/* Plan button */}
            <button
              onClick={handlePlan}
              disabled={
                !deploy.gcpProject ||
                gcpNodes.length === 0 ||
                deploy.status === 'planning' ||
                deploy.status === 'deploying' ||
                deploy.status === 'authenticating'
              }
              id="ice-deploy-btn-plan"
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
            <button
              onClick={handleDeploy}
              disabled={
                !deploy.gcpProject ||
                gcpNodes.length === 0 ||
                deploy.status === 'deploying' ||
                deploy.status === 'planning' ||
                deploy.status === 'authenticating'
              }
              id="ice-deploy-btn-apply"
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
              {deploy.deployedResources.length > 0 ? t('deploy.buttons.updateInfrastructure') : t('deploy.buttons.deploy')}
            </button>

            {/* Destroy button — only when resources are deployed */}
            {deploy.deployedResources.length > 0 && deploy.status !== 'deploying' && (
              <button
                onClick={async () => {
                  if (!activeCard || !confirm(t('deploy.errors.destroyConfirm'))) return;
                  try {
                    await getApi().deploy.destroy(activeCard.id, {
                      provider: deploy.provider,
                      region: deploy.region,
                      environment: deploy.environment,
                    });
                    dispatch(resetDeploy());
                  } catch (err: any) {
                    dispatch(deployError(err.message || 'Destroy failed'));
                  }
                }}
                id="ice-deploy-btn-destroy"
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors font-medium',
                  'bg-red-600 text-white hover:bg-red-700',
                )}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('deploy.buttons.destroy')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
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
  environment,
  disabled,
  projectId,
  onProviderChange,
  onProjectChange,
  onRegionChange,
  onEnvironmentChange,
}) => {
  const { t } = useTranslation();
  const environments = useSelector((s: RootState) => projectId ? (s.environments.byProject[projectId] || []) : []);
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

      <div className="grid grid-cols-4 gap-3">
        {/* Provider */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('deploy.config.providerLabel')}</label>
          <IceSelect
            value={provider}
            onChange={onProviderChange}
            disabled={disabled}
            size="md"
            fullWidth
            allowEmpty={false}
            options={[
              { value: 'gcp', label: 'GCP' },
              { value: 'aws', label: 'AWS' },
              { value: 'azure', label: 'Azure' },
              { value: 'kubernetes', label: 'Kubernetes' },
            ]}
          />
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

        {/* Environment */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('deploy.config.environmentLabel')}</label>
          <IceSelect
            value={environment}
            onChange={(v) => onEnvironmentChange(v)}
            disabled={disabled}
            size="md"
            fullWidth
            allowEmpty={false}
            options={environments.length > 0
              ? environments.map((env) => ({ value: env.name.toLowerCase(), label: env.name }))
              : [
                  { value: 'development', label: t('deploy.config.envDevelopment') },
                  { value: 'staging', label: t('deploy.config.envStaging') },
                  { value: 'production', label: t('deploy.config.envProduction') },
                ]
            }
          />
        </div>
      </div>
    </div>
  );
};

const PlanPreview: React.FC<{ plan: DeployPlan }> = ({ plan }) => {
  const { t } = useTranslation();
  const total = plan.creates.length + plan.updates.length + plan.deletes.length;

  if (total === 0 && plan.skipped.length === 0) {
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
        {plan.creates.map((r, i) => (
          <ChangeRow key={`c-${i}`} name={r.name} type={r.type} action="create" />
        ))}
        {plan.updates.map((r, i) => (
          <ChangeRow key={`u-${i}`} name={r.name} type={r.type} action="update" />
        ))}
        {plan.deletes.map((r, i) => (
          <ChangeRow key={`d-${i}`} name={r.name} type={r.type} action="delete" />
        ))}
        {plan.skipped.map((s, i) => (
          <div key={`s-${i}`} className="px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <span className="w-16 text-gray-500">{t('deploy.plan.skip')}</span>
            <span>{s.name}</span>
            <span className="ml-auto text-gray-500">{s.reason}</span>
          </div>
        ))}
      </div>
      {plan.warnings.length > 0 && (
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
            <p className="mt-1 text-amber-700 dark:text-amber-300 text-xs">
              {t('deploy.errors.billingDescription')}
            </p>
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
            <p className="mt-1 text-amber-700 dark:text-amber-300 text-xs">
              {t('deploy.errors.raptDescription')}
            </p>
          </div>
        </div>
        <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1 pl-6">
          <p className="font-medium">{t('deploy.errors.raptFixTitle')}</p>
          <p>
            1. <strong>Use a Service Account Key</strong> — disconnect the current OAuth connection, then reconnect with
            a service account JSON key (recommended). If key creation is blocked by org policy, ask an admin to allow{' '}
            <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-[10px]">
              iam.disableServiceAccountKeyCreation
            </code>{' '}
            in{' '}
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
            2. <strong>Disable RAPT</strong> —{' '}
            <a
              href="https://admin.google.com/ac/security/reauth"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Google Workspace Admin &rarr; Security &rarr; Google Cloud session control
            </a>{' '}
            &rarr; set Reauthentication policy to "Off"
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
              <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">{t('deploy.errors.opensConsole')}</span>
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
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="px-4 py-2 bg-muted/40 border-b border-border text-sm font-medium flex items-center gap-2">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
        Results: {t('deploy.progress.succeeded', { count: succeeded })}
        {failed > 0 && `, ${t('deploy.progress.failed', { count: failed })}`}
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
                  <div className="pl-6 text-xs text-red-500 truncate max-w-[500px]" title={r.error}>
                    {r.error}
                  </div>
                );
              })()}
          </div>
        ))}
      </div>
    </div>
  );
};

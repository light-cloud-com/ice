/**
 * useDeployActions — orchestrator-level callbacks for the deploy panel.
 *
 * Extracts the six load-bearing `useCallback`s (auth, plan, deploy, close,
 * fetchRequirements, handleVerifyRequirement) from `deploy-panel.tsx` so the
 * orchestrator stays focused on layout. Behavior is preserved verbatim;
 * dispatch ordering, the retry-after-auth re-dispatch of `startPlanning` /
 * `startDeploying`, and every `||` fallback chain match the inline source.
 *
 * RISK #2 (rf-pdpl blueprint): handlePlan/handleDeploy re-dispatch the
 * `startPlanning` / `startDeploying` action BEFORE the retry call after a
 * successful auth. The slice's reducers are idempotent on re-dispatch but
 * the rendered loading state during the auth-popup window depends on the
 * start-action being dispatched twice. Do not pull the retry block into a
 * helper — it must stay inline so the dispatch ordering is observable.
 */

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { getApi } from '../../../shared/api/api-adapter';
import {
  appendLog,
  authFailed,
  authSuccess,
  closeDeployPanel,
  deployError,
  deploySuccess,
  resetDeploy,
  setDeployedResources,
  setPlan,
  setRequirements,
  startAuthenticating,
  startDeploying,
  startPlanning,
  startRequirementsFetch,
  type DeployPlan,
  type DeployResourceResult,
  type DeployState,
} from '../../../store/slices/deploy-slice';
import type { Card } from '../../../store/slices/cards-slice';
import type { AppDispatch } from '../../../store';

export interface UseDeployActionsArgs {
  activeCard: Card | null | undefined;
  deploy: DeployState;
  pendingRetryRef: React.MutableRefObject<'plan' | 'deploy' | null>;
}

export interface UseDeployActionsReturn {
  handleAuthenticate: (retryAction?: 'plan' | 'deploy') => Promise<boolean>;
  fetchRequirements: () => Promise<void>;
  handleVerifyRequirement: (definitionId: string, nodeId?: string) => Promise<void>;
  handlePlan: () => Promise<void>;
  handleDeploy: () => Promise<void>;
  handleClose: () => void;
}

export function useDeployActions(args: UseDeployActionsArgs): UseDeployActionsReturn {
  const { activeCard, deploy, pendingRetryRef } = args;
  const dispatch = useDispatch<AppDispatch>();

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
    [dispatch, pendingRetryRef],
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
    async (_definitionId: string, _nodeId?: string) => {
      // Re-run the full resolver for now. A future refinement can hit a
      // single-requirement endpoint to avoid re-checking everything.
      await fetchRequirements();
    },
    [fetchRequirements],
  );

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

  return {
    handleAuthenticate,
    fetchRequirements,
    handleVerifyRequirement,
    handlePlan,
    handleDeploy,
    handleClose,
  };
}

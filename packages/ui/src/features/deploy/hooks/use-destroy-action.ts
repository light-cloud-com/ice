/**
 * useDestroyAction — orchestrator-level destroy callback for the deploy panel.
 *
 * Extracts the inline `onConfirm` handler from `<DestroyConfirmModal>` (the
 * 60-line async callback that previously lived inside `deploy-panel.tsx`).
 * The hook exposes a single `handleDestroyConfirm(destroyEverything)`
 * function whose behavior mirrors the inline source verbatim — same
 * dispatch ordering, same console diagnostics with `[destroy]` prefixes,
 * same fallback strings, and the same divergence between the
 * `destroyEverything` (cross-history) and single-card destroy paths.
 *
 * RISK #4 (rf-pdpl blueprint): the dispatch ordering is observable to the
 * canvas overlay. The sequence the inline source preserved is:
 *
 *   1. setDestroyModalOpen(false) — close the modal first.
 *   2. dispatch(startDestroying({ cardId })) — flip the slice into
 *      'destroying' state BEFORE the API call so progress events arriving
 *      via the socket subscription don't auto-flip it back to 'deploying'.
 *      The subscription hook's `startDeploying` dispatch is a no-op while
 *      status === 'destroying'.
 *   3. await getApi().deploy.destroyAll(...) OR getApi().deploy.destroy(...).
 *   4. dispatch(clearCardDeployOverlay({ cardId })) — wipe deploy overlay
 *      from the canvas (provider_id, url, deploy_status, custom domain
 *      fields, etc.) so blocks and the properties panel stop showing
 *      "Live" / URL pills for resources that no longer exist.
 *   5. dispatch(setDeployedResources([])) — drop the deploy panel's
 *      "previously deployed" list so the next deploy starts clean.
 *   6. dispatch(resetDeploy()) — final reset.
 *
 * Don't reorder. Don't pull `startDestroying` after the await. Don't merge
 * the three cleanup dispatches into a single dispatch.
 *
 * The two paths (destroyEverything vs single-card destroy) have slightly
 * different early-return error checks:
 *   - destroyAll: `if (res.success === false && !res.deleted)` →
 *     deployError + early return.
 *   - destroy: `if (res?.success === false)` → deployError + early return
 *     (the `?.` keeps null-safety on the response).
 * Both paths fall through to the cleanup dispatches when not erroring out.
 */

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { getApi } from '../../../shared/api/api-adapter';
import { clearCardDeployOverlay, type Card } from '../../../store/slices/cards-slice';
import {
  appendLog,
  deployError,
  resetDeploy,
  setDeployedResources,
  startDestroying,
  type DeployState,
} from '../../../store/slices/deploy-slice';
import type { AppDispatch } from '../../../store';

export interface UseDestroyActionArgs {
  activeCard: Card | null;
  deploy: DeployState;
  setDestroyModalOpen: (open: boolean) => void;
}

export interface UseDestroyActionReturn {
  handleDestroyConfirm: (destroyEverything: boolean) => Promise<void>;
}

export function useDestroyAction(args: UseDestroyActionArgs): UseDestroyActionReturn {
  const { activeCard, deploy, setDestroyModalOpen } = args;
  const dispatch = useDispatch<AppDispatch>();

  const handleDestroyConfirm = useCallback(
    async (destroyEverything: boolean) => {
      if (!activeCard) return;
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
    },
    [activeCard, deploy.gcpProject, deploy.provider, deploy.region, deploy.environment, setDestroyModalOpen, dispatch],
  );

  return { handleDestroyConfirm };
}

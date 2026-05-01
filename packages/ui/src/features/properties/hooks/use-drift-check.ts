/**
 * Drift-check orchestration hook for the drift-check button and indicator
 * inside the properties panel.
 *
 * Internally subscribes to Redux for the loading flag (`s.deploy.driftCheckLoading`)
 * and dispatches the result actions (`setDriftCheckLoading`, `setDriftResults`)
 * plus per-node status overlays (`updateCardNodeData`). The async POST to
 * `/canvas/deploy/drift-check` is exposed as a fire-and-forget callback —
 * the hook does NOT run the request eagerly; the button's `onClick` invokes it.
 *
 * Note on the asymmetric loading reset: only the catch path explicitly resets
 * `driftCheckLoading` to `false`. The success path relies on the
 * `setDriftResults` reducer doing it as a side-effect (see `deploy-slice.ts`
 * L724 — the reducer sets `state.driftCheckLoading = false` after writing
 * `driftByNode`). This behavior is preserved verbatim from the inline
 * implementation that lived in `properties-panel.tsx`.
 */

import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axiosInstance from '../../../shared/api/axios-instance';
import { updateCardNodeData } from '../../../store/slices/cards-slice';
import { setDriftCheckLoading, setDriftResults } from '../../../store/slices/deploy-slice';
import type { AppDispatch, RootState } from '../../../store';

/**
 * Map drift results onto canvas node statuses by dispatching
 * `updateCardNodeData` per result. Pure dispatcher — takes `dispatch` as
 * input so it's testable without rendering the hook.
 *
 * Status mapping (verbatim from inline implementation):
 *   `drifted` | `missing` -> set node `status` to `'drifted'`
 *   `in_sync`             -> set node `status` to `'active'`
 *   anything else         -> no dispatch
 */
export function applyDriftStatus(
  driftResults: Array<{ nodeId: string; status: string }>,
  dispatch: AppDispatch,
): void {
  for (const result of driftResults) {
    if (result.status === 'drifted' || result.status === 'missing') {
      // Per the `one-status-source-deploy-status` learning: drift state is
      // a deploy-state outcome, not a separate field. Write to deploy_status
      // so compact-node renders it through the same pipeline as live-deploy
      // statuses.
      dispatch(updateCardNodeData({ nodeId: result.nodeId, data: { deploy_status: 'drifted' } }));
    } else if (result.status === 'in_sync') {
      dispatch(updateCardNodeData({ nodeId: result.nodeId, data: { deploy_status: 'active' } }));
    }
  }
}

/**
 * Wire up drift-check state for a card. Returns:
 *   - `isLoading`: subscribes to `s.deploy.driftCheckLoading`.
 *   - `checkDrift`: fires a POST to `/canvas/deploy/drift-check` with `{ cardId, nodes }`
 *     and dispatches the resulting drift state plus per-node status overlays.
 */
export function useDriftCheck(
  cardId: string,
  nodes: any[],
): { isLoading: boolean; checkDrift: () => Promise<void> } {
  const dispatch = useDispatch<AppDispatch>();
  const isLoading = useSelector((s: RootState) => s.deploy.driftCheckLoading);

  const checkDrift = useCallback(async () => {
    dispatch(setDriftCheckLoading(true));
    try {
      const res = await axiosInstance.post('/canvas/deploy/drift-check', { cardId, nodes });
      if (res.data?.driftResults) {
        dispatch(setDriftResults(res.data.driftResults));
        // Update canvas node statuses to reflect drift
        applyDriftStatus(res.data.driftResults, dispatch);
      }
    } catch {
      dispatch(setDriftCheckLoading(false));
    }
  }, [cardId, nodes, dispatch]);

  return { isLoading, checkDrift };
}

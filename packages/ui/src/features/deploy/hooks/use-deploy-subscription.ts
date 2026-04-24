/**
 * useDeploySubscription — app-level hook that subscribes to the active
 * card's deploy socket room and hydrates Redux with the current state,
 * independent of whether the deploy panel is open.
 *
 * Previously the socket subscription + progress listener lived inside
 * `deploy-panel.tsx` and only ran while the panel was open. That meant a
 * user opening the same project in a second tab or closing the panel
 * mid-deploy would see nothing — no banner, no block status, no progress
 * bar, even though the deploy was still running.
 *
 * This hook moves both responsibilities out of the panel and into the
 * component tree that renders the active card (currently `app.tsx`),
 * where they live for the lifetime of the card view.
 *
 * Responsibilities:
 *   1. Subscribe to the socket room for the active card (via
 *      `api.subscribeDeployProgress`) so live events arrive.
 *   2. Install a global `deploy:progress` listener that dispatches status
 *      updates into Redux — the same dispatches the old panel handler did,
 *      just unconditional.
 *   3. On card change, call `/canvas/deploy/current/:cardId` to pull any
 *      in-flight deploy snapshot and hydrate the slice.
 *   4. On card change, call `/canvas/deploy/node-outputs/:cardId` to pull
 *      the overlay of deploy_status / deploy_outputs / provider_id per
 *      node and dispatch `updateCardNodeData` for each so the canvas
 *      shows URLs, domains, and status immediately.
 */

import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getApi } from '../../../shared/api/api-adapter';
import { updateCardNodeData } from '../../../store/slices/cards-slice';
import {
  addResourceResult,
  appendLog,
  deploySuccess,
  setDeployedResources,
  setDeployProgress,
  startDeploying,
} from '../../../store/slices/deploy-slice';
import type { AppDispatch, RootState } from '../../../store';

/**
 * Handle a single deploy event — used by both the live socket listener
 * and the replay loop. Centralizing this means the replay reproduces the
 * same Redux state a user would have seen live, byte for byte.
 */
function applyDeployEvent(dispatch: AppDispatch, event: any, cardId?: string): void {
  if (!event) return;
  if (event.type === 'progress') {
    // Auto-flip the slice into 'deploying' on the first incoming event
    // when no manual deploy is in flight. This is what makes a
    // GitHub-push-triggered redeploy show up in the UI immediately —
    // the user didn't click "Deploy" so the slice is idle, but events
    // are streaming in. We start the deploy session here so the deploy
    // panel and canvas pulse rings light up.
    if (cardId) {
      dispatch(startDeploying({ cardId }));
    }
    dispatch(
      setDeployProgress({
        progress: event.progress ?? 0,
        resource: event.resource ?? '',
        message: event.message ?? '',
        step: event.step,
      }),
    );
    if (event.source_node_id && event.status === 'running') {
      dispatch(
        updateCardNodeData({
          nodeId: event.source_node_id,
          data: {
            deploy_status: 'deploying',
            deploy_progress: event.step
              ? {
                  step_label: event.step.label,
                  step_index: event.step.index,
                  step_total: event.step.total,
                }
              : undefined,
          },
        }),
      );
    } else if (event.source_node_id && event.status === 'failed') {
      // Set a placeholder error immediately so the node tooltip isn't empty
      // during the gap between this event and the subsequent resource_result
      // that carries the full error text.
      const placeholder =
        event.error ||
        (event.message && !event.message.endsWith(': failed') ? event.message : null) ||
        'Deployment failed — see deploy panel logs';
      dispatch(
        updateCardNodeData({
          nodeId: event.source_node_id,
          data: { deploy_status: 'error', deploy_error: placeholder, deploy_progress: undefined },
        }),
      );
    }
  } else if (event.type === 'resource_result') {
    dispatch(addResourceResult(event.result));
    if (event.result?.source_node_id) {
      // Mirror the success path for failures: always populate `deploy_error`
      // with at least a non-empty string so the red dot has tooltip text.
      // `event.result.error` can be undefined when a handler throws without
      // returning a shaped error — the fallback keeps the UX usable.
      const errorText = event.result.success
        ? undefined
        : event.result.error || 'Deployment failed — see deploy panel logs';
      const nodeData: Record<string, unknown> = {
        provider_id: event.result.provider_id,
        deploy_status: event.result.success ? 'active' : 'error',
        deploy_progress: undefined,
        deploy_error: errorText,
        last_deployed_at: new Date().toISOString(),
      };
      if (event.result.outputs) {
        nodeData.deploy_outputs = event.result.outputs;
        Object.assign(nodeData, event.result.outputs);
      }
      dispatch(updateCardNodeData({ nodeId: event.result.source_node_id, data: nodeData }));
    }
  } else if (event.type === 'log') {
    dispatch(appendLog(event.message));
  } else if (event.type === 'requirement_verified') {
    // The requirement-poller emits this on every check (not only on
    // first verification). When the requirement is the managed cert
    // issuance one, mirror its status onto the source node so the
    // PublicEndpoint / Custom Domain block header shows live cert state
    // without waiting for a redeploy.
    if (event.requirement_id === 'managed-cert-issuance' && event.node_id) {
      const detailStatus = event.details?.managed_status as string | undefined;
      const finalStatus = event.verified ? 'ACTIVE' : detailStatus || 'PROVISIONING';
      dispatch(
        updateCardNodeData({
          nodeId: event.node_id,
          data: {
            cert_status: finalStatus,
            cert_domain_statuses: event.details?.domain_statuses,
          },
        }),
      );
    }
  } else if (event.type === 'complete') {
    if (event.success) {
      dispatch(deploySuccess({ duration_ms: event.duration_ms || 0 }));
    }
  }
}

export function useDeploySubscription(cardId: string | undefined): void {
  const dispatch = useDispatch<AppDispatch>();
  const deployEnvironment = useSelector((s: RootState) => s.deploy.environment);
  // Tracks the highest event seq applied so reconnects can resume without
  // losing or duplicating events. Keyed by card so switching cards resets.
  const lastSeqRef = useRef<{ cardId: string | undefined; seq: number }>({ cardId: undefined, seq: 0 });

  // Eager socket init on hook mount so the socket.io connection is
  // established as soon as the app loads, BEFORE the user clicks Deploy.
  // Without this, the socket is only opened when `subscribeDeployProgress`
  // is first called — which is fine for the subscription itself (emits
  // are buffered) but it means the very first live events of a deploy
  // can race the connection handshake. Calling `onDeployProgress` with a
  // no-op callback forces the module-level `getSocket()` to run and
  // start the handshake immediately.
  useEffect(() => {
    const api = getApi();
    if (!api.onDeployProgress) return;
    console.log('[ice-socket] eager-init');
    const cleanup = api.onDeployProgress(() => {
      // Swallowed — the real handler is installed in Phase 3 below.
    });
    return () => cleanup?.();
  }, []);

  // Phase 1 — hydrate the canvas block overlay from persisted deploy outputs.
  useEffect(() => {
    if (!cardId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getApi().deploy.getNodeOutputs(cardId, deployEnvironment);
        if (cancelled) return;
        const overlay = (res?.overlay || {}) as Record<string, any>;
        for (const [nodeId, data] of Object.entries(overlay)) {
          dispatch(updateCardNodeData({ nodeId, data }));
        }
      } catch {
        // Non-fatal — canvas will just show blocks without deploy overlay.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId, deployEnvironment, dispatch]);

  // Phase 2 — pull any in-flight deploy snapshot so a new tab / new window
  // sees the running deploy immediately without waiting for a socket event.
  useEffect(() => {
    if (!cardId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getApi().deploy.getCurrentDeploy(cardId);
        if (cancelled) return;
        const snapshot = res?.snapshot;
        if (!snapshot) return;
        if (snapshot.status === 'deploying' || snapshot.status === 'planning') {
          dispatch(startDeploying({ cardId }));
          dispatch(
            setDeployProgress({
              progress: Number(snapshot.progress || 0),
              resource: snapshot.currentResource || '',
              message: '',
              step: snapshot.currentStep,
            }),
          );
          // Mirror per-node status from the snapshot to the canvas blocks.
          const nodeStatuses = snapshot.nodeStatuses || {};
          for (const [nodeId, status] of Object.entries(nodeStatuses) as [string, any][]) {
            dispatch(
              updateCardNodeData({
                nodeId,
                data: {
                  deploy_status: status.deploy_status,
                  deploy_progress: status.step
                    ? {
                        step_label: status.step.label,
                        step_index: status.step.index,
                        step_total: status.step.total,
                      }
                    : undefined,
                },
              }),
            );
          }
        }
      } catch {
        // Non-fatal — no in-flight deploy or network error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId, dispatch]);

  // Phase 2.5 — replay the event tape so the logs, progress, and per-node
  // status all rehydrate to match the live state. This is what makes a
  // page refresh mid-deploy feel continuous: the client catches up to the
  // exact point the live socket would have delivered next.
  useEffect(() => {
    if (!cardId) return;
    let cancelled = false;
    // Reset resume counter ONLY on card switch. Staying on the same card
    // across re-renders (deploy env change, reconnect, etc.) should resume
    // from the last applied seq so we don't re-render hundreds of buffered
    // events on every replay.
    if (lastSeqRef.current.cardId !== cardId) {
      lastSeqRef.current = { cardId, seq: 0 };
    }
    const since = lastSeqRef.current.seq || 0;
    (async () => {
      try {
        const res = await getApi().deploy.getDeployStream(cardId, since);
        if (cancelled) return;
        const events = (res?.events || []) as Array<{ seq: number; type: string; payload: any }>;
        for (const row of events) {
          // The payload is the event object the server persisted — it
          // already has `type`, `progress`, `result`, etc.
          applyDeployEvent(dispatch, row.payload, cardId);
          if (row.seq > lastSeqRef.current.seq) {
            lastSeqRef.current = { cardId, seq: row.seq };
          }
        }
      } catch {
        // Non-fatal — no replay means we just show live events going forward.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId, dispatch]);

  // Phase 3 — subscribe to the socket room and install the progress listener.
  // Runs for the lifetime of the active card, independent of deploy panel
  // visibility, so new tabs / closed panels still receive live updates.
  useEffect(() => {
    if (!cardId) return;
    const api = getApi();
    const unsubRoom = api.subscribeDeployProgress?.(cardId);

    const cleanup = api.onDeployProgress((event: any) => {
      applyDeployEvent(dispatch, event, cardId);
      // On complete, also re-pull deployed resources + overlay so the
      // canvas reflects the final outputs (propagated custom domain URL
      // on compute blocks etc.).
      if (event?.type === 'complete' && event.success) {
        (async () => {
          try {
            const res = await api.deploy.getResources(cardId);
            if (res.success && res.resources) {
              dispatch(setDeployedResources(res.resources));
            }
          } catch {}
          try {
            const res = await api.deploy.getNodeOutputs(cardId, deployEnvironment);
            const overlay = (res?.overlay || {}) as Record<string, any>;
            for (const [nodeId, data] of Object.entries(overlay)) {
              dispatch(updateCardNodeData({ nodeId, data }));
            }
          } catch {}
        })();
      }
    });

    return () => {
      cleanup?.();
      unsubRoom?.();
    };
  }, [cardId, deployEnvironment, dispatch]);
}

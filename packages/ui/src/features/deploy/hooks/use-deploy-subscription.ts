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
 *   2. Install a global `deploy:event` listener (pdl-7 — flipped from the
 *      legacy `deploy:progress` channel) that routes the typed
 *      `DeployEvent` discriminated union into the slice's per-event
 *      reducers (`applyNodeStatusEvent` / `applyNodeProgressEvent` /
 *      `applyDeployCompleteEvent`) and mirrors per-block overlay onto
 *      the canvas via `updateCardNodeData`.
 *   3. On card change, call `/canvas/deploy/current/:cardId` to pull any
 *      in-flight deploy snapshot and hydrate the slice.
 *   4. On card change, call `/canvas/deploy/node-outputs/:cardId` to pull
 *      the overlay of deploy_status / deploy_outputs / provider_id per
 *      node and dispatch `updateCardNodeData` for each so the canvas
 *      shows URLs, domains, and status immediately.
 */

import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { DeployEvent } from '@ice/types';
import { mapStatusToOverlay, overlayToWireStatus } from '@ice/types';
import { getApi } from '../../../shared/api/api-adapter';
import { updateCardNodeData } from '../../../store/slices/cards-slice';
import {
  applyDeployCompleteEvent,
  applyNodeProgressEvent,
  applyNodeStatusEvent,
  appendLog,
  hydrateDeployFromHistory,
  setDeployedResources,
  startDeploying,
} from '../../../store/slices/deploy-slice';
import type {
  DeployNodeProgressEvent,
  DeployNodeStatusEvent,
} from '@ice/types';
import type { AppDispatch, RootState } from '../../../store';

/**
 * Re-exported from `@ice/types` (rf-0c dedup). Historically the
 * service-side and UI-side had separate copies of the wire→overlay
 * mapping, kept in sync by hand. The canonical home is now next to
 * {@link DeployNodeStatus} so drift is impossible.
 *
 * Old name `mapWireStatusToOverlay` kept as an alias here so the
 * existing UI consumers (deploy-node-row, etc.) don't have to all
 * migrate at once.
 */
export { mapStatusToOverlay as mapWireStatusToOverlay, overlayToWireStatus };

/**
 * Handle a single typed deploy event — used by both the live socket
 * listener and the replay loop. Centralising this means the replay
 * reproduces the same Redux state a user would have seen live, byte for
 * byte. Routes by `event.type` discriminator into the slice's per-event
 * reducers (pdl-7) and mirrors per-block overlay onto the canvas.
 *
 * `event.node_id` on `node_status` / `node_progress` is the CANVAS node
 * id (the service layer translates from the engine's graph node id via
 * `translation.deployables[]` before emitting — see learning anchor
 * `graph-id-vs-canvas-id-translation-is-service-layer-job`), so it goes
 * straight into `updateCardNodeData` without further translation.
 */
export function applyDeployEvent(
  dispatch: AppDispatch,
  event: DeployEvent | null | undefined,
  cardId?: string,
): void {
  if (!event) return;
  switch (event.type) {
    case 'node_status': {
      // Auto-flip the slice into 'deploying' on the first incoming event
      // when no manual deploy is in flight. This is what makes a
      // GitHub-push-triggered redeploy show up in the UI immediately —
      // the user didn't click "Deploy" so the slice is idle, but events
      // are streaming in. `startDeploying` is idempotent (no-op when
      // already deploying / destroying / planning) so the blind dispatch
      // is safe.
      if (cardId) dispatch(startDeploying({ cardId }));
      dispatch(applyNodeStatusEvent(event));
      // Mirror the per-block overlay onto the canvas. event.node_id is
      // the canvas node id (post-pdl-4 service-layer translation).
      const overlay = mapStatusToOverlay(event.status);
      const data: Record<string, unknown> = {
        deploy_status: overlay,
      };
      if (event.error?.message) {
        data.deploy_error = event.error.message;
      } else if (event.status === 'succeeded') {
        // Clear any stale error that might have been left over from a
        // previous failed attempt.
        data.deploy_error = undefined;
      }
      // Don't clobber `deploy_progress` on a status-only flip; the next
      // node_progress event can update it. On terminal statuses, clear
      // the lingering progress so the spinner ring stops.
      if (
        event.status === 'succeeded' ||
        event.status === 'failed' ||
        event.status === 'skipped' ||
        event.status === 'cancelled-due-to-dep'
      ) {
        data.deploy_progress = undefined;
      }
      if (event.status === 'succeeded') {
        data.last_deployed_at = event.at || new Date().toISOString();
      }
      dispatch(updateCardNodeData({ nodeId: event.node_id, data }));
      break;
    }
    case 'node_progress': {
      dispatch(applyNodeProgressEvent(event));
      dispatch(
        updateCardNodeData({
          nodeId: event.node_id,
          data: {
            deploy_progress: {
              step_label: event.step.label,
              step_index: event.step.index,
              step_total: event.step.total,
            },
          },
        }),
      );
      break;
    }
    case 'log':
      dispatch(appendLog(event.message));
      break;
    case 'complete':
      // pdl-7 — the typed `complete` event is the deploy-tape terminal.
      // The slice maps `outcome → status` and updates the panel header.
      // Authoritative per-resource results still arrive via the HTTP
      // response's `deploySuccess` / `deployError` payloads (kept) — the
      // wire's `complete` doesn't carry full `outputs` / `provider_id`,
      // only the rollup totals.
      dispatch(applyDeployCompleteEvent(event));
      break;
    case 'requirement_verified': {
      // The requirement-poller emits this on every check (not only on
      // first verification). When the requirement is the managed cert
      // issuance one, mirror its status onto the source node so the
      // PublicEndpoint / Custom Domain block header shows live cert state
      // without waiting for a redeploy.
      //
      // pdl-2's contract was widened in pdl-4's critic pass to carry
      // `node_id` + `environment` + an optional `details: unknown` blob,
      // so the disambiguation between two custom-domain blocks on the
      // same canvas (and one block across environments) lives on the
      // wire — the consumer no longer has to look it up.
      if (event.requirement === 'managed-cert-issuance') {
        const details = (event.details ?? {}) as Record<string, unknown>;
        const detailStatus = typeof details.managed_status === 'string' ? details.managed_status : undefined;
        const finalStatus =
          event.status === 'satisfied' ? 'ACTIVE' : detailStatus || 'PROVISIONING';
        dispatch(
          updateCardNodeData({
            nodeId: event.node_id,
            data: {
              cert_status: finalStatus,
              cert_domain_statuses: details.domain_statuses,
            },
          }),
        );
      }
      break;
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
  // can race the connection handshake. Calling `onDeployEvent` with a
  // no-op callback forces the module-level `getSocket()` to run and
  // start the handshake immediately.
  useEffect(() => {
    const api = getApi();
    if (!api.onDeployEvent) return;
    console.log('[ice-socket] eager-init');
    const cleanup = api.onDeployEvent(() => {
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
  //
  // Cross-checks against the DB history before applying. The gateway's
  // in-memory snapshot can outlive the actual deploy: if the worker
  // process exits or restarts mid-deploy without flipping the snapshot
  // to a terminal state, it stays stuck at 'deploying'@99% forever.
  // Meanwhile the DB row IS finalized on every terminal completion path.
  // So when both a "deploying" snapshot AND a terminal DB row for the
  // same card exist, the DB row wins and the snapshot is dropped.
  useEffect(() => {
    if (!cardId) return;
    let cancelled = false;
    (async () => {
      try {
        const [snapRes, history] = await Promise.all([
          getApi().deploy.getCurrentDeploy(cardId),
          getApi()
            .deploy.getDeployments(cardId)
            .catch(() => [] as any[]),
        ]);
        if (cancelled) return;
        const snapshot = snapRes?.snapshot;
        if (!snapshot) return;
        if (snapshot.status === 'deploying' || snapshot.status === 'planning') {
          // If the DB already has a terminal apply for this card, treat
          // the snapshot as stale and skip applying it. Without this guard
          // a crashed deploy keeps the UI pegged at 'deploying'@99%
          // indefinitely, hiding the actual results that were persisted.
          const hasTerminal =
            Array.isArray(history) &&
            history.some(
              (d: any) =>
                (d?.action_type === 'apply' || d?.action_type === 'rollback') &&
                ['success', 'partial', 'failed', 'cancelled'].includes(d?.status),
            );
          if (hasTerminal) {
            // eslint-disable-next-line no-console
            console.log('[deploy-subscription] dropping stale snapshot — DB has terminal row', { cardId });
            return;
          }
          dispatch(startDeploying({ cardId }));
          // pdl-5 critic finding #7 — warm-seed `nodesById` from the
          // snapshot's per-node overlay so the deploy panel's per-row
          // list renders immediately, instead of showing the
          // "Preparing…" sentinel for the brief window between this
          // Phase 2 hydrate and the Phase 2.5 replay loop. Each
          // synthetic event is dispatched with seq=0 so any live event
          // (or replayed event from the tape) with seq>0 dedup-wins on
          // the same node, overwriting the warm-seed entry with full
          // resource_name / resource_type / action / error fields.
          //
          // Resource name/type aren't in the snapshot — they live on
          // the deploy-event-log rows that the Phase 2.5 replay walks.
          // Empty strings are placeholder; the live or replayed
          // node_status will overwrite within the same tick once the
          // event-log fetch returns.
          const nodeStatuses = snapshot.nodeStatuses || {};
          const nowIso = new Date().toISOString();
          for (const [nodeId, status] of Object.entries(nodeStatuses) as [string, any][]) {
            // Mirror per-node status onto canvas blocks (existing behavior).
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

            // Warm-seed nodesById via a synthetic node_status event.
            const wireStatus = overlayToWireStatus(status.deploy_status);
            if (wireStatus === null) continue;
            const synthetic: DeployNodeStatusEvent = {
              type: 'node_status',
              card_id: cardId,
              node_id: nodeId,
              resource_name: '',
              resource_type: '',
              action: 'create',
              status: wireStatus,
              at: nowIso,
              seq: 0,
            };
            dispatch(applyNodeStatusEvent(synthetic));

            // Forward the snapshot's per-node step (when present) so the
            // panel's per-row "Step 2 of 5: foo" indicator survives the
            // tab join. applyNodeStatusEvent preserves `existing?.step`
            // when the slot is already populated, so dispatch order
            // doesn't matter.
            if (status.step && wireStatus === 'applying') {
              const progress: DeployNodeProgressEvent = {
                type: 'node_progress',
                card_id: cardId,
                node_id: nodeId,
                resource_name: '',
                step: {
                  label: status.step.label,
                  index: status.step.index,
                  total: status.step.total,
                },
                at: nowIso,
                seq: 0,
              };
              dispatch(applyNodeProgressEvent(progress));
            }
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

  // Phase 3 — subscribe to the socket room and install the deploy:event
  // listener. Runs for the lifetime of the active card, independent of
  // deploy panel visibility, so new tabs / closed panels still receive
  // live updates.
  //
  // The post-complete fetch (deployed resources + overlay refresh) only
  // fires here, NOT inside `applyDeployEvent`. The replay path also runs
  // through `applyDeployEvent`, and we don't want to refire the resource
  // fetch on every historical complete event during replay — only the
  // live one matters.
  useEffect(() => {
    if (!cardId) return;
    const api = getApi();
    const unsubRoom = api.subscribeDeployProgress?.(cardId);

    const cleanup = api.onDeployEvent((event: DeployEvent) => {
      applyDeployEvent(dispatch, event, cardId);
      if (event?.type !== 'complete') return;

      // Async deploys (the production default) emit terminal state ONLY via
      // this `complete` event — the HTTP response that fired off the deploy
      // returned `{ async: true }` minutes ago and never carried results.
      // The wire's complete event itself doesn't carry per-resource
      // outputs / provider_id / api_enable_url either (the contract is just
      // outcome + totals). So on EVERY complete (success, partial,
      // failure, cancelled), pull the just-finalized DB row and hydrate
      // the slice — that's where outputs / provider_id / error text /
      // duration_ms live. The DB row is written by the deploy service
      // BEFORE the complete event is emitted (see
      // `services/deploy/src/services/deploy.service.ts:emitDeployEvent`
      // ordering), so the read is safe.
      (async () => {
        try {
          const history = (await api.deploy.getDeployments(cardId)) as Array<{
            id: string;
            status: string;
            action_type: string;
            environment?: string;
            duration_ms?: number | null;
            error?: string | null;
            results?: { resources?: any[] } | null;
          }>;
          if (!Array.isArray(history) || history.length === 0) return;
          const latest = history.find(
            (d) =>
              (d.action_type === 'apply' || d.action_type === 'rollback') &&
              ['success', 'partial', 'failed', 'cancelled'].includes(d.status),
          );
          if (!latest) return;
          const resources = Array.isArray(latest.results?.resources) ? latest.results!.resources : [];
          dispatch(
            hydrateDeployFromHistory({
              cardId,
              status: latest.status,
              results: resources,
              error: latest.error,
              duration_ms: latest.duration_ms ?? undefined,
              environment: latest.environment ?? undefined,
            }),
          );
        } catch {}
      })();

      // On success, also re-pull deployed resources + per-node overlay so
      // the canvas reflects the final outputs (propagated custom domain
      // URL on compute blocks, etc.). Skipped on non-success outcomes
      // because partial / failure / cancelled rows have inconsistent
      // resource shapes — the hydrate call above is sufficient there.
      if (event.outcome === 'success') {
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

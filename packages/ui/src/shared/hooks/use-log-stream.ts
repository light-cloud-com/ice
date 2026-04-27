/**
 * useLogStream — Cloud Logging stream lifecycle for the on-canvas Log block.
 *
 * Owns the full subscribe → join → listen → unsubscribe path for one
 * `terminalNodeId`. Returns the slice state shaped for the SvgLogNode
 * component. The hook is the only writer to `logs-slice` for a given
 * terminalNodeId; never dispatch slice actions from outside.
 *
 * Lifecycle:
 *   1. Wait for cardId + environmentId to be defined (status: 'idle').
 *   2. POST /api/canvas/logs/subscribe → setSubscription + setSource.
 *   3. socket.emit('subscribe:logs', terminalNodeId) → joins the room.
 *   4. Register listeners: logs:entry, logs:error, logs:resumed,
 *      logs:source-resolved → dispatch slice updates.
 *   5. Cleanup on unmount or dep change: off all listeners, leave the
 *      room, POST /api/canvas/logs/unsubscribe, dispatch teardown.
 *
 * The handler closures capture `terminalNodeId` directly. We use a
 * stable `dispatch` reference and don't try to clean closures on every
 * entry — Socket.IO's room targeting plus a single listener per event
 * handles the common case correctly. The check inside `onEntry` is a
 * defensive sanity net for future broadcasts.
 */

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getApi } from '../api/api-adapter';
import {
  appendEntry,
  resumed,
  setError,
  setSource,
  setStatus,
  setSubscription,
  teardown,
  type LogEntry,
  type LogStreamMode,
  type LogStreamStatus,
  type LogsState,
  type SourceResolution,
} from '../../store/slices/logs-slice';
import { store, type AppDispatch, type RootState } from '../../store';

interface UseLogStreamReturn {
  status: LogStreamStatus;
  entries: LogEntry[];
  source: SourceResolution | null;
  lastError: string | null;
}

const EMPTY_ENTRIES: LogEntry[] = [];

/**
 * Pure fingerprint over inbound source candidates — exported so it's
 * unit-testable. Walks edges-into-`terminalNodeId`, projects each source
 * node to `<nodeId>><iceType>><deployStatus>`, sorts, and joins with `|`.
 *
 * Including `deploy_status` is what makes the hook re-subscribe when a
 * candidate source node transitions from undeployed (`'idle'` /
 * `undefined`) to deployed (`'active'`). Without it, a Log block opened
 * BEFORE the source's first deploy stays stuck in `pre-deploy` forever:
 * the backend resolved once at subscribe time and there's no signal to
 * re-resolve. With this projection in the dep, the cards-slice publish
 * that writes `deploy_status: 'active'` (see `deploy.service.ts:1880`)
 * changes the fingerprint string → the effect re-runs → the cleanup
 * tears the old subscription down → a fresh subscribe POST resolves the
 * source against the now-existing `deployedResourceMapping` row →
 * `{ state: 'resolved' }` → `connecting` → first entry → `streaming`.
 *
 * Deliberately NOT included: label, position, status, anything else
 * that mutates on unrelated edits — those would over-subscribe and
 * cause the same thrash documented in
 * `ux-log-stream-subscribe-thrash-on-mount`.
 */
export function computeCandidateFingerprint(
  edges: ReadonlyArray<{ source: string; target: string } | null | undefined>,
  nodes: ReadonlyArray<{ id: string; data?: Record<string, unknown> | undefined }>,
  terminalNodeId: string,
): string {
  const parts: string[] = [];
  for (const edge of edges) {
    if (!edge || edge.target !== terminalNodeId) continue;
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (!sourceNode) continue;
    const iceType = (sourceNode.data?.iceType as string) ?? '';
    const deployStatus = (sourceNode.data?.deploy_status as string) ?? '';
    parts.push(`${edge.source}>${iceType}>${deployStatus}`);
  }
  parts.sort();
  return parts.join('|');
}

export function useLogStream(terminalNodeId: string): UseLogStreamReturn {
  const dispatch = useDispatch<AppDispatch>();

  // Read inputs from Redux. The cards slice owns activeCardId; the
  // environments slice owns the active env per project; projects-slice
  // owns the active project. The hook waits for all three before posting.
  const cardId = useSelector((s: RootState) => s.cards.activeCardId) ?? null;
  const activeProjectId = useSelector((s: RootState) => s.projects.activeProjectId) ?? null;
  const environmentId = useSelector((s: RootState) =>
    activeProjectId ? s.environments.activeEnvId[activeProjectId] : undefined,
  );

  // The Monitoring.Log node carries `streamingMode` and (LT-6)
  // `sourceNodeIdOverride` in its `data` blob. Read each as a primitive
  // through its OWN useSelector so the effect's deps array can never
  // pick up a fresh object reference from the surrounding `node.data`
  // blob — the cards-slice publishes new node objects on every mutation
  // (via Immer), and lifting these values via an intermediate `node`
  // object would force the surrounding component to re-render on every
  // unrelated cards update. Reading the primitive directly means
  // `useSelector`'s default `Object.is` comparison stays true while the
  // value is unchanged. See learning `ux-log-stream-subscribe-thrash-on-mount`.
  const mode: LogStreamMode = useSelector((s: RootState) => {
    const card = s.cards.cards.find((c) => c.id === s.cards.activeCardId);
    const node = card?.nodes.find((n) => n.id === terminalNodeId);
    return ((node?.data?.streamingMode as LogStreamMode) ?? 'polling') as LogStreamMode;
  });
  const sourceNodeIdOverride: string | undefined = useSelector((s: RootState) => {
    const card = s.cards.cards.find((c) => c.id === s.cards.activeCardId);
    const node = card?.nodes.find((n) => n.id === terminalNodeId);
    const value = node?.data?.sourceNodeIdOverride;
    return typeof value === 'string' ? value : undefined;
  });

  // Edges-fingerprint of inbound supported sources. The full candidate
  // list is computed inside the effect from live Redux state — the
  // fingerprint is just the dep that triggers re-subscribe when the
  // user adds/removes an edge, changes a source iceType, OR a candidate
  // source's `deploy_status` flips (e.g. `undefined`/`'idle'` →
  // `'active'` after the user clicks Deploy). The deploy-status leg is
  // what unblocks the post-deploy re-resolution: subscribe time captured
  // `pre-deploy`, the cards-slice publish from `deploy.service.ts:1880`
  // mutates `data.deploy_status` to `'active'`, the fingerprint string
  // changes → effect re-runs → fresh subscribe sees the resource mapping
  // and returns `{ state: 'resolved' }`. Stringifying a small subset of
  // edge/node shape keeps the dep value-stable across unrelated cards
  // mutations. See learning `use-selector-primitive-projection-vs-derived`.
  const candidateFingerprint: string = useSelector((s: RootState) => {
    const card = s.cards.cards.find((c) => c.id === s.cards.activeCardId);
    if (!card) return '';
    return computeCandidateFingerprint(card.edges, card.nodes, terminalNodeId);
  });

  // Slice state — driven entirely by the effect below. Selectors return
  // sane defaults when the slot doesn't exist yet (idle / empty / null).
  const slot = useSelector((s: RootState & { logs: LogsState }) => s.logs.byTerminalNodeId[terminalNodeId]);
  const status = slot?.status ?? 'idle';
  const entries = slot?.entries ?? EMPTY_ENTRIES;
  const source = slot?.source ?? null;
  const lastError = slot?.lastError ?? null;

  useEffect(() => {
    // Wait for both cardId and environmentId — without them the POST
    // would fail validation server-side AND we'd churn re-mounting on
    // every redux hydration tick. Keep status at 'idle' so the
    // component shows nothing yet (LogContent renders a placeholder).
    if (!cardId || !environmentId || !terminalNodeId) {
      return;
    }

    const api = getApi();
    let cancelled = false;
    let subscriptionId: string | null = null;
    const listenerCleanups: Array<() => void> = [];
    let leaveRoom: (() => void) | null = null;

    dispatch(setStatus({ terminalNodeId, status: 'connecting' }));

    // Compute candidate sources from live Redux state. We do this INSIDE
    // the effect (not via useSelector) so the value reflects the store
    // at subscribe time — the effect re-runs when `candidateFingerprint`
    // changes, which is the right granularity. Walking edges/nodes here
    // touches the same data the fingerprint hashed, so it's cheap.
    const stateAtSubscribe = store.getState();
    const card = stateAtSubscribe.cards.cards.find((c) => c.id === cardId);
    const candidateSources: Array<{ nodeId: string; iceType: string; label?: string }> = [];
    if (card) {
      for (const edge of card.edges) {
        if (!edge || edge.target !== terminalNodeId) continue;
        const sourceNode = card.nodes.find((n) => n.id === edge.source);
        if (!sourceNode) continue;
        const iceType = (sourceNode.data?.iceType as string) ?? '';
        if (!iceType) continue;
        const label = sourceNode.data?.label;
        candidateSources.push({
          nodeId: sourceNode.id,
          iceType,
          ...(typeof label === 'string' ? { label } : {}),
        });
      }
    }

    (async () => {
      try {
        const result = await api.logs.subscribe({
          cardId,
          environmentId,
          terminalNodeId,
          mode,
          ...(sourceNodeIdOverride ? { sourceNodeIdOverride } : {}),
          ...(candidateSources.length > 0 ? { candidateSources } : {}),
        });
        if (cancelled) {
          // The effect cleanup ran while this request was in flight.
          // Tear down the server-side stream we just opened so we don't
          // leak a polling loop or quota.
          try {
            await api.logs.unsubscribe(result.subscriptionId, cardId);
          } catch {
            // Best-effort — already cancelled.
          }
          return;
        }
        subscriptionId = result.subscriptionId;
        dispatch(setSubscription({ terminalNodeId, subscriptionId, mode }));
        dispatch(setSource({ terminalNodeId, source: result.resolution }));
      } catch (err: any) {
        if (cancelled) return;
        const message = err?.message || 'Failed to open log stream.';
        dispatch(setError({ terminalNodeId, message }));
        return;
      }

      if (cancelled) return;

      // Join the Socket.IO room. The adapter's `joinRoom` re-joins on
      // reconnect, so a dropped socket transparently recovers.
      leaveRoom = api.logs.joinRoom(terminalNodeId);

      // Per-event listeners. Each handler is keyed to this hook's
      // `terminalNodeId` via closure capture — that's what makes the
      // dispatch target the right slot when multiple Log blocks are
      // open simultaneously. The room-targeting on the server scopes
      // events to the matching room, so cross-block leakage is already
      // prevented; the closure is a defensive belt-and-braces.
      listenerCleanups.push(
        api.logs.onEntry((entry: LogEntry) => {
          // Defensive: if the event doesn't carry a recognizable
          // LogEntry shape (e.g. malformed broadcast), drop it rather
          // than crashing the slice with a malformed entry.
          if (!entry || typeof entry.insertId !== 'string') return;
          dispatch(appendEntry({ terminalNodeId, entry }));
        }),
      );

      listenerCleanups.push(
        api.logs.onError(({ message }: { message: string; recoverable: boolean }) => {
          // v1 choice: flip to 'error' on every emitted error and let
          // the next `logs:entry` flip it back to 'streaming' via the
          // (eventual) source-resolved or resumed event. Recoverable
          // errors will self-heal in <1s under normal Cloud Logging
          // backoff. Non-recoverable errors stay terminal.
          dispatch(setError({ terminalNodeId, message }));
        }),
      );

      listenerCleanups.push(
        api.logs.onResumed(() => {
          // Gated promotion: the slice's `resumed` reducer no-ops unless
          // we previously promoted via `appendEntry` (entries.length > 0
          // AND source.state === 'resolved'). Without the gate, a
          // backend tail-reconnect retry would force the slot to
          // `'streaming'` even on a pre-deploy block whose subscribe
          // failed mid-flight — see learning
          // `ux-log-resumed-event-overrides-pre-deploy`.
          dispatch(resumed({ terminalNodeId }));
        }),
      );

      listenerCleanups.push(
        api.logs.onSourceResolved((resolution: SourceResolution) => {
          dispatch(setSource({ terminalNodeId, source: resolution }));
        }),
      );
    })();

    return () => {
      cancelled = true;
      // Order matters: stop receiving events first, then leave the
      // room (so any in-flight emit to this room is dropped on the
      // server before we send the unsubscribe), then tear down state.
      for (const off of listenerCleanups) {
        try {
          off();
        } catch {
          /* ignore */
        }
      }
      try {
        leaveRoom?.();
      } catch {
        /* ignore */
      }
      if (subscriptionId) {
        // Fire-and-forget — the unsubscribe is idempotent server-side
        // (LT-3 contract), so a dropped request is harmless. cardId is
        // required by the route's `requireProjectAccess` middleware.
        api.logs.unsubscribe(subscriptionId, cardId).catch(() => {
          /* idempotent, errors are non-fatal */
        });
      }
      dispatch(teardown({ terminalNodeId }));
    };
    // Re-run when any subscribe input changes. `dispatch` is stable per
    // store but included for exhaustive-deps lint. `candidateFingerprint`
    // is a string projection of inbound edges + source iceTypes for the
    // terminal — when the user wires/unwires an edge or changes a source
    // type, the fingerprint changes and the effect re-subscribes with
    // the fresh candidate list (instead of the backend reading a stale
    // Prisma row from before the canvas's 2s save debounce fired).
  }, [cardId, environmentId, terminalNodeId, mode, sourceNodeIdOverride, candidateFingerprint, dispatch]);

  return { status, entries, source, lastError };
}

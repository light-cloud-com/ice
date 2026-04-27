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
import type { AppDispatch, RootState } from '../../store';

interface UseLogStreamReturn {
  status: LogStreamStatus;
  entries: LogEntry[];
  source: SourceResolution | null;
  lastError: string | null;
}

const EMPTY_ENTRIES: LogEntry[] = [];

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
  // `sourceNodeIdOverride` in its `data` blob. Read defensively — the
  // properties panel for these fields ships in LT-6, so undefined is
  // expected today and handled by the default ('polling') and absent
  // override.
  const node = useSelector((s: RootState) => {
    const card = s.cards.cards.find((c) => c.id === s.cards.activeCardId);
    return card?.nodes.find((n) => n.id === terminalNodeId);
  });
  const mode: LogStreamMode = ((node?.data?.streamingMode as LogStreamMode) ?? 'polling') as LogStreamMode;
  const sourceNodeIdOverride = node?.data?.sourceNodeIdOverride as string | undefined;

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

    (async () => {
      try {
        const result = await api.logs.subscribe({
          cardId,
          environmentId,
          terminalNodeId,
          mode,
          ...(sourceNodeIdOverride ? { sourceNodeIdOverride } : {}),
        });
        if (cancelled) {
          // The effect cleanup ran while this request was in flight.
          // Tear down the server-side stream we just opened so we don't
          // leak a polling loop or quota.
          try {
            await api.logs.unsubscribe(result.subscriptionId);
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
          dispatch(setStatus({ terminalNodeId, status: 'streaming' }));
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
        // (LT-3 contract), so a dropped request is harmless.
        api.logs.unsubscribe(subscriptionId).catch(() => {
          /* idempotent, errors are non-fatal */
        });
      }
      dispatch(teardown({ terminalNodeId }));
    };
    // Re-run when any subscribe input changes. `dispatch` is stable per
    // store but included for exhaustive-deps lint.
  }, [cardId, environmentId, terminalNodeId, mode, sourceNodeIdOverride, dispatch]);

  return { status, entries, source, lastError };
}

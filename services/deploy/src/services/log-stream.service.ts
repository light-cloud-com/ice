/**
 * Log Stream Service
 *
 * Subscribes a canvas Log Terminal block to a live Cloud Logging feed for
 * the resource it is wired to. Resolves the source from the canvas + the
 * `deployedResourceMapping` table, runs an IAM probe, and either polls
 * `getEntries` every 2s (default) or opens a long-lived `tailEntries`
 * gRPC stream. Each entry is fanned out to a Socket.IO room keyed by the
 * Log node id so multiple browsers viewing the same canvas all see the
 * same feed without spawning multiple SDK connections.
 *
 * Routes + the `subscribe:logs` socket handler land in LT-4 — this module
 * is consumed by them but mounts nothing on its own.
 *
 * GCP-only for v1 (per `decisions.md` 2026-04-27 entry).
 */

import { randomUUID } from 'node:crypto';

import {
  emitToRoom,
  resetRegistry,
  streams,
  subscriptionIndex,
} from './log-stream/registry.js';
import { resolveSource } from './log-stream/source-resolution.js';
import { teardownStream } from './log-stream/stream-lifecycle.js';
import {
  openStreamForResolved,
  restartStreamWithMode,
} from './log-stream/stream-open.js';
import type {
  ActiveStream,
  SourceResolution,
  SubscribeArgs,
  SubscribeResult,
} from './log-stream/types.js';
import { IDLE_TEARDOWN_MS } from './log-stream/types.js';

export type {
  StreamingMode,
  SubscribeArgs,
  LogEntry,
  SourceResolution,
  SubscribeResult,
} from './log-stream/types.js';

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Resolve the source, run the IAM probe, and start (or join) the stream
 * for `terminalNodeId`. The Socket.IO room semantics fan an underlying
 * SDK stream out to N browser sockets, so a second `subscribe()` for
 * the same room reuses the existing stream rather than opening another.
 */
export async function subscribe(args: SubscribeArgs): Promise<SubscribeResult> {
  const subscriptionId = randomUUID();
  const { terminalNodeId } = args;

  // Reuse an existing stream for this room. The new subscriber inherits
  // the prior resolution (the room is keyed on terminalNodeId regardless
  // of card/environment — same canvas open in two tabs joins the same
  // room without re-resolving). Cancel any pending idle teardown.
  const existing = streams.get(terminalNodeId);
  if (existing && !existing.stopped) {
    if (existing.idleTeardownTimer) {
      clearTimeout(existing.idleTeardownTimer);
      existing.idleTeardownTimer = undefined;
    }
    // Mode change between subscribers: last-write-wins with restart.
    if (existing.mode !== args.mode) {
      await restartStreamWithMode(existing, args.mode);
    }
    existing.subscribers.set(subscriptionId, { subscriptionId, args });
    subscriptionIndex.set(subscriptionId, terminalNodeId);
    // Re-emit source-resolved so the joining client sees the room state
    // immediately (same shape as the LT-4 contract).
    emitToRoom(terminalNodeId, 'logs:source-resolved', existing.resolution);
    return { subscriptionId, resolution: existing.resolution };
  }

  // Fresh subscribe — resolve the source.
  const resolution = await resolveSource(args);

  // Open a placeholder stream entry even when we can't tail yet, so a
  // re-subscribe with an override can attach to a ready room.
  if (
    resolution.state === 'none' ||
    resolution.state === 'ambiguous' ||
    resolution.state === 'pre-deploy' ||
    resolution.state === 'unsupported-source' ||
    resolution.state === 'permission-denied'
  ) {
    // Holding state — no SDK stream opened. Emit the resolution event
    // so clients know why nothing is flowing. Do NOT register an
    // ActiveStream; on next subscribe with an override we re-resolve.
    emitToRoom(terminalNodeId, 'logs:source-resolved', resolution);
    if (resolution.state === 'permission-denied') {
      // Surface the actionable message to the room.
      emitToRoom(terminalNodeId, 'logs:error', {
        message: resolution.message,
        recoverable: false,
      });
    }
    // For non-resolved states we still wire a minimal record so a
    // subsequent subscribe with an override or after-deploy retry can
    // join. Track via subscriptionIndex against a sentinel terminal id
    // so unsubscribe is a no-op without crashing.
    subscriptionIndex.set(subscriptionId, terminalNodeId);
    streams.set(terminalNodeId, {
      terminalNodeId,
      mode: args.mode,
      filter: '',
      projectId: '',
      resolution,
      subscribers: new Map([[subscriptionId, { subscriptionId, args }]]),
      seenInsertIds: new Set(),
      insertIdOrder: [],
      consecutiveErrors: 0,
      stopped: false,
      loggingClient: null,
    });
    return { subscriptionId, resolution };
  }

  // resolved — open a stream.
  const stream = await openStreamForResolved(args, resolution);
  if (!stream) {
    // openStreamForResolved either created the stream + started it, or
    // returned null after IAM probe / SDK failure (in which case it
    // emitted permission-denied / error already).
    // Register the subscriber in a holding state so unsubscribe works.
    const denied: SourceResolution = {
      state: 'permission-denied',
      message: 'Cloud Logging access denied. Grant roles/logging.viewer to the deploy service account.',
    };
    streams.set(terminalNodeId, {
      terminalNodeId,
      mode: args.mode,
      filter: '',
      projectId: '',
      resolution: denied,
      subscribers: new Map([[subscriptionId, { subscriptionId, args }]]),
      seenInsertIds: new Set(),
      insertIdOrder: [],
      consecutiveErrors: 0,
      stopped: false,
      loggingClient: null,
    });
    subscriptionIndex.set(subscriptionId, terminalNodeId);
    return { subscriptionId, resolution: denied };
  }

  stream.subscribers.set(subscriptionId, { subscriptionId, args });
  subscriptionIndex.set(subscriptionId, terminalNodeId);
  emitToRoom(terminalNodeId, 'logs:source-resolved', resolution);
  return { subscriptionId, resolution };
}

/**
 * Decrement refcount; when no subscribers remain, schedule teardown
 * after a 60s idle window so a fast reconnect (page reload, tab switch)
 * can rejoin without re-running the IAM probe.
 *
 * Idempotent — calling unsubscribe on an unknown id is a no-op.
 */
export async function unsubscribe(subscriptionId: string): Promise<void> {
  const terminalNodeId = subscriptionIndex.get(subscriptionId);
  if (!terminalNodeId) return; // already gone — idempotent.
  subscriptionIndex.delete(subscriptionId);

  const stream = streams.get(terminalNodeId);
  if (!stream) return;
  stream.subscribers.delete(subscriptionId);
  if (stream.subscribers.size > 0) return;

  // No subscribers — start idle teardown timer.
  if (stream.idleTeardownTimer) {
    clearTimeout(stream.idleTeardownTimer);
  }
  stream.idleTeardownTimer = setTimeout(() => {
    teardownStream(stream);
  }, IDLE_TEARDOWN_MS);
}

/**
 * Read-only view of currently-active subscriptions. Useful for the
 * future diagnostics endpoint and for tests.
 */
export function getActiveSubscriptions(): ReadonlyMap<string, SubscribeArgs> {
  const out = new Map<string, SubscribeArgs>();
  for (const stream of streams.values()) {
    for (const ref of stream.subscribers.values()) {
      out.set(ref.subscriptionId, ref.args);
    }
  }
  return out;
}

// ── Test-only helpers ──────────────────────────────────────────────────
// Vitest runs each describe in isolation but the module-level Maps are
// shared. Expose a reset hook so test cases don't leak state.
export const __testing = {
  reset(): void {
    for (const stream of streams.values()) {
      teardownStream(stream);
    }
    resetRegistry();
  },
  getStream(terminalNodeId: string): ActiveStream | undefined {
    return streams.get(terminalNodeId);
  },
  getStreamCount(): number {
    return streams.size;
  },
};



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
} from './log-stream/registry';
import { resolveSource } from './log-stream/source-resolution';
import { teardownStream } from './log-stream/stream-lifecycle';
import {
  openStreamForResolved,
  registerPlaceholderStream,
  restartStreamWithMode,
} from './log-stream/stream-open';
import type {
  ActiveStream,
  SourceResolution,
  SubscribeArgs,
  SubscribeResult,
} from './log-stream/types';
import { IDLE_TEARDOWN_MS } from './log-stream/types';

export type {
  StreamingMode,
  SubscribeArgs,
  LogEntry,
  SourceResolution,
  SubscribeResult,
} from './log-stream/types';

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

  // Holding state — no SDK stream opened. Emit the resolution event so
  // clients know why nothing is flowing, then register a placeholder
  // ActiveStream so a subsequent subscribe with an override or
  // post-deploy retry can attach to a ready room.
  if (resolution.state !== 'resolved') {
    emitToRoom(terminalNodeId, 'logs:source-resolved', resolution);
    if (resolution.state === 'permission-denied') {
      // Surface the actionable message to the room.
      emitToRoom(terminalNodeId, 'logs:error', {
        message: resolution.message,
        recoverable: false,
      });
    }
    registerPlaceholderStream(args, subscriptionId, resolution);
    return { subscriptionId, resolution };
  }

  // resolved — open a stream.
  const stream = await openStreamForResolved(args, resolution);
  if (!stream) {
    // openStreamForResolved returned null after IAM probe / SDK failure
    // (it emitted permission-denied / error already). Register the
    // subscriber against a denied placeholder so unsubscribe works.
    const denied: SourceResolution = {
      state: 'permission-denied',
      message: 'Cloud Logging access denied. Grant roles/logging.viewer to the deploy service account.',
    };
    registerPlaceholderStream(args, subscriptionId, denied);
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



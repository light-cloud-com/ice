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

import prisma from '@ice/db';
import * as providerService from '@ice/service-credentials';

import {
  isPermissionDenied,
  mapEntry,
  probeErrorMessage,
} from './log-stream/entry-mapping.js';
import { resolveLogFilter } from './log-stream/filter-resolver.js';
import {
  emitToRoom,
  rememberInsertId,
  resetRegistry,
  streams,
  subscriptionIndex,
} from './log-stream/registry.js';
import { resolveSource } from './log-stream/source-resolution.js';
import type {
  ActiveStream,
  LogEntry,
  SourceResolution,
  StreamingMode,
  SubscribeArgs,
  SubscribeResult,
} from './log-stream/types.js';
import {
  IDLE_TEARDOWN_MS,
  MAX_CONSECUTIVE_ERRORS_POLLING,
  POLL_INTERVAL_MS,
  POLL_PAGE_SIZE,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
} from './log-stream/types.js';

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

// ── Stream lifecycle ──────────────────────────────────────────────────

async function openStreamForResolved(
  args: SubscribeArgs,
  resolution: SourceResolution & { state: 'resolved' },
): Promise<ActiveStream | null> {
  // Re-derive filter + projectId. resolveSource already validated all of
  // this — calling it here keeps the filter colocated with the stream
  // open. The cost is one extra DB roundtrip per fresh subscribe, which
  // is fine.
  const card = await prisma.canvasCard.findUnique({
    where: { id: args.cardId },
    select: { project_id: true },
  });
  if (!card) return null;

  const env = await prisma.environment.findUnique({
    where: { id: args.environmentId },
    select: { type: true, region: true },
  });
  const envType = env?.type ?? 'development';
  const region = env?.region ?? undefined;

  const mapping = await prisma.deployedResourceMapping.findFirst({
    where: { card_id: args.cardId, node_id: resolution.sourceNodeId, environment: envType },
    select: { resource_name: true, resource_type: true },
  });
  if (!mapping) return null;

  const credentials = await providerService.getDecryptedCredentials(args.organisationId, 'gcp');
  if (!credentials) return null;
  const projectId = credentials.project_id ?? '';

  const resolved = resolveLogFilter({
    iceType: resolution.iceType,
    resource: { name: mapping.resource_name, type: mapping.resource_type },
    projectId,
    region,
  });
  if (!resolved) return null;
  const filter = resolved.filter;

  // Construct the @google-cloud/logging client via the shared lazy loader.
  const core: any = await import('@ice/core');
  const loggingModule = await core.load_sdk('@google-cloud/logging');
  if (!loggingModule) {
    emitToRoom(args.terminalNodeId, 'logs:error', {
      message: '@google-cloud/logging SDK is not available in this build.',
      recoverable: false,
    });
    return null;
  }

  // Universal credential paths (see sdk-loader.ts comments).
  const loggingClient = new loggingModule.Logging({
    projectId,
    credentials: credentials as Record<string, unknown>,
  });

  // ─── IAM probe (R1). Cheap, runs once. ─────────────────────────────
  try {
    await loggingClient.getEntries({
      filter,
      pageSize: 1,
      resourceNames: [`projects/${projectId}`],
      orderBy: 'timestamp desc',
      autoPaginate: false,
    });
  } catch (err: any) {
    if (isPermissionDenied(err)) {
      const denied: SourceResolution = {
        state: 'permission-denied',
        message: 'Cloud Logging access denied. Grant roles/logging.viewer to the deploy service account.',
      };
      emitToRoom(args.terminalNodeId, 'logs:source-resolved', denied);
      emitToRoom(args.terminalNodeId, 'logs:error', { message: denied.message, recoverable: false });
      return null;
    }
    // Non-PERMISSION_DENIED probe errors are surfaced as recoverable —
    // the polling/tail loop has its own retry that may recover.
    emitToRoom(args.terminalNodeId, 'logs:error', {
      message: probeErrorMessage(err),
      recoverable: true,
    });
  }

  const stream: ActiveStream = {
    terminalNodeId: args.terminalNodeId,
    mode: args.mode,
    filter,
    projectId,
    resolution,
    subscribers: new Map(),
    seenInsertIds: new Set(),
    insertIdOrder: [],
    consecutiveErrors: 0,
    stopped: false,
    loggingClient,
  };
  streams.set(args.terminalNodeId, stream);

  if (args.mode === 'polling') {
    startPolling(stream);
  } else {
    startTail(stream);
  }

  return stream;
}

async function restartStreamWithMode(stream: ActiveStream, newMode: StreamingMode): Promise<void> {
  stopUnderlyingStream(stream);
  stream.mode = newMode;
  if (newMode === 'polling') {
    startPolling(stream);
  } else {
    startTail(stream);
  }
}

function stopUnderlyingStream(stream: ActiveStream): void {
  if (stream.pollTimer) {
    clearInterval(stream.pollTimer);
    stream.pollTimer = undefined;
  }
  if (stream.tailStream) {
    try {
      stream.tailStream.destroy?.();
    } catch {
      /* swallow */
    }
    try {
      stream.tailStream.cancel?.();
    } catch {
      /* swallow */
    }
    stream.tailStream = null;
  }
}

function teardownStream(stream: ActiveStream): void {
  stream.stopped = true;
  stopUnderlyingStream(stream);
  if (stream.idleTeardownTimer) {
    clearTimeout(stream.idleTeardownTimer);
    stream.idleTeardownTimer = undefined;
  }
  streams.delete(stream.terminalNodeId);
}

// ── Polling mode ──────────────────────────────────────────────────────

function startPolling(stream: ActiveStream): void {
  // Tick immediately, then every POLL_INTERVAL_MS.
  void pollOnce(stream);
  stream.pollTimer = setInterval(() => {
    void pollOnce(stream);
  }, POLL_INTERVAL_MS);
}

async function pollOnce(stream: ActiveStream): Promise<void> {
  if (stream.stopped) return;
  const filter = stream.lastTs
    ? `${stream.filter} AND timestamp > "${stream.lastTs}"`
    : stream.filter;
  try {
    const [entries] = (await stream.loggingClient.getEntries({
      filter,
      pageSize: POLL_PAGE_SIZE,
      resourceNames: [`projects/${stream.projectId}`],
      orderBy: 'timestamp asc',
      autoPaginate: false,
    })) as [any[]];
    stream.consecutiveErrors = 0;
    if (!entries || entries.length === 0) return;

    for (const raw of entries) {
      const mapped = mapEntry(raw);
      if (!mapped) continue;
      if (stream.seenInsertIds.has(mapped.insertId)) continue;
      rememberInsertId(stream, mapped.insertId);
      emitToRoom(stream.terminalNodeId, 'logs:entry', mapped);
      stream.lastTs = mapped.ts;
      stream.lastInsertId = mapped.insertId;
    }
  } catch (err: any) {
    stream.consecutiveErrors += 1;
    const recoverable = stream.consecutiveErrors < MAX_CONSECUTIVE_ERRORS_POLLING;
    emitToRoom(stream.terminalNodeId, 'logs:error', {
      message: probeErrorMessage(err),
      recoverable,
    });
    if (!recoverable) {
      // After 3 consecutive failures, stop the loop. The room stays
      // open so the client can re-subscribe to retry.
      stopUnderlyingStream(stream);
    }
  }
}

// ── Tail mode ─────────────────────────────────────────────────────────

function startTail(stream: ActiveStream): void {
  if (stream.stopped) return;
  let tailStream: any;
  try {
    tailStream = stream.loggingClient.tailEntries({
      resourceNames: [`projects/${stream.projectId}`],
      filter: stream.filter,
    });
  } catch (err: any) {
    emitToRoom(stream.terminalNodeId, 'logs:error', {
      message: probeErrorMessage(err),
      recoverable: true,
    });
    scheduleTailReconnect(stream);
    return;
  }
  stream.tailStream = tailStream;

  tailStream.on('data', (resp: any) => {
    if (stream.stopped) return;
    const entries = Array.isArray(resp?.entries) ? resp.entries : [];
    for (const raw of entries) {
      const mapped = mapEntry(raw);
      if (!mapped) continue;
      if (stream.seenInsertIds.has(mapped.insertId)) continue;
      rememberInsertId(stream, mapped.insertId);
      emitToRoom(stream.terminalNodeId, 'logs:entry', mapped);
      stream.lastTs = mapped.ts;
      stream.lastInsertId = mapped.insertId;
    }
  });

  tailStream.on('error', (err: any) => {
    if (stream.stopped) return;
    if (isPermissionDenied(err)) {
      const denied: SourceResolution = {
        state: 'permission-denied',
        message: 'Cloud Logging access denied. Grant roles/logging.viewer to the deploy service account.',
      };
      emitToRoom(stream.terminalNodeId, 'logs:source-resolved', denied);
      emitToRoom(stream.terminalNodeId, 'logs:error', {
        message: denied.message,
        recoverable: false,
      });
      stream.resolution = denied;
      stopUnderlyingStream(stream);
      return;
    }
    emitToRoom(stream.terminalNodeId, 'logs:error', {
      message: probeErrorMessage(err),
      recoverable: true,
    });
    scheduleTailReconnect(stream);
  });

  tailStream.on('end', () => {
    if (stream.stopped) return;
    // First clean end: try one more reconnect. A second clean end is
    // treated as terminal.
    if (stream.consecutiveErrors === -1) {
      // Already retried after a clean end and saw another — give up.
      emitToRoom(stream.terminalNodeId, 'logs:error', {
        message: 'Cloud Logging tail stream ended.',
        recoverable: false,
      });
      stopUnderlyingStream(stream);
      return;
    }
    stream.consecutiveErrors = -1;
    setTimeout(() => {
      if (stream.stopped) return;
      startTail(stream);
    }, 1000);
  });
}

function scheduleTailReconnect(stream: ActiveStream): void {
  stream.consecutiveErrors = Math.max(0, stream.consecutiveErrors) + 1;
  const delay = Math.min(
    RECONNECT_BASE_MS * 2 ** (stream.consecutiveErrors - 1),
    RECONNECT_MAX_MS,
  );
  stopUnderlyingStream(stream);
  setTimeout(() => {
    if (stream.stopped) return;
    startTail(stream);
    if (!stream.stopped) {
      emitToRoom(stream.terminalNodeId, 'logs:resumed', { at: new Date().toISOString() });
    }
  }, delay);
}


/**
 * Tail-mode loop for the Log Stream service.
 *
 * Extracted from `log-stream.service.ts` (rf-lstream-7). Opens a
 * long-lived `tailEntries` gRPC stream and fans entries to the room
 * as they arrive. Three event handlers register on the SDK stream:
 *
 *   - `data`: maps entries, dedupes, fans to the room.
 *   - `error`: a permission-denied error flips resolution to denied
 *     and tears down the underlying handle (terminal); other errors
 *     trigger an exponential-backoff reconnect.
 *   - `end`: a clean end with `consecutiveErrors === -1` is treated
 *     as terminal (we only retry one clean end). Otherwise, set the
 *     "saw clean end once" sentinel and try again after 1s.
 *
 * `scheduleTailReconnect` increments `consecutiveErrors` and schedules
 * a re-`startTail` at `min(BASE * 2^(n-1), MAX)` ms. After reconnect
 * succeeds the room receives a `logs:resumed` event so the client UI
 * can clear its disconnected indicator.
 *
 * The `consecutiveErrors === -1` sentinel value is reused from the
 * polling-mode counter — but for tails it specifically means "we just
 * retried after a clean end and want to bail if another clean end
 * happens immediately". The polling loop never sets it to -1.
 */

import {
  isPermissionDenied,
  mapEntry,
  probeErrorMessage,
} from './entry-mapping';
import { emitToRoom, rememberInsertId } from './registry';
import { stopUnderlyingStream } from './stream-lifecycle';
import {
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  type ActiveStream,
  type SourceResolution,
} from './types';

export function startTail(stream: ActiveStream): void {
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

export function scheduleTailReconnect(stream: ActiveStream): void {
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

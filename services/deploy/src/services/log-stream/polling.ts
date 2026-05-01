/**
 * Polling-mode loop for the Log Stream service.
 *
 * Extracted from `log-stream.service.ts` (rf-lstream-6). The loop runs
 * `getEntries` against the cached SDK client every POLL_INTERVAL_MS;
 * each tick advances the cursor (`stream.lastTs`), dedupes via
 * `seenInsertIds`, and fans entries out to the room.
 *
 * Error handling:
 *   - `consecutiveErrors` increments on each thrown call. The loop
 *     keeps emitting `logs:error` with `recoverable: true` until the
 *     cap (`MAX_CONSECUTIVE_ERRORS_POLLING`) is hit, after which it
 *     calls `stopUnderlyingStream` and lets the room idle. The room
 *     stays open so a client can re-subscribe to retry.
 *   - A successful tick resets `consecutiveErrors` to 0.
 *
 * The first tick is fired *immediately* (not after the interval)
 * because clients expect the first entries to flow within
 * sub-second of subscribe — a 2s wait would feel broken.
 */

import {
  mapEntry,
  probeErrorMessage,
} from './entry-mapping.js';
import { emitToRoom, rememberInsertId } from './registry.js';
import { stopUnderlyingStream } from './stream-lifecycle.js';
import {
  MAX_CONSECUTIVE_ERRORS_POLLING,
  POLL_INTERVAL_MS,
  POLL_PAGE_SIZE,
  type ActiveStream,
} from './types.js';

export function startPolling(stream: ActiveStream): void {
  // Tick immediately, then every POLL_INTERVAL_MS.
  void pollOnce(stream);
  stream.pollTimer = setInterval(() => {
    void pollOnce(stream);
  }, POLL_INTERVAL_MS);
}

export async function pollOnce(stream: ActiveStream): Promise<void> {
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

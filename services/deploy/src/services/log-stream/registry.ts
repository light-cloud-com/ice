/**
 * Module-level registry for the Log Stream service.
 *
 * Extracted from `log-stream.service.ts` (rf-lstream-2). The two Maps
 * (`streams` and `subscriptionIndex`) are SINGLETONS — keeping them in
 * a dedicated module preserves that singleton across all consumers
 * (orchestrator + every helper module). This is the same pattern as
 * the rf-cards-5 `_lastSnapshotAction` extraction: a `let`/Map at
 * module scope IS the cache, and any further-extraction module reaches
 * here rather than re-creating its own.
 *
 * Tests should clear the registry between cases via `resetRegistry()`
 * (the orchestrator's `__testing.reset` is the public alias).
 *
 * Also lives here:
 *   - `emitToRoom(terminalNodeId, event, payload)`: the only Socket.IO
 *     fanout used by the service. The Socket.IO server is module-scoped
 *     in `@ice/shared` (`getSocketServer()` returns null until setup),
 *     so the helper short-circuits when the server hasn't been
 *     initialized — this is what lets the polling loop run in tests
 *     without a real socket server.
 *   - `rememberInsertId(stream, insertId)`: capped insert-id memory
 *     for cross-reconnect dedupe. The cap (`SEEN_INSERT_ID_CAP`) is in
 *     types.ts because both the producer (this module) and the
 *     stream-lifecycle reset code reference it.
 */

import { getSocketServer } from '@ice/shared';
import { SEEN_INSERT_ID_CAP, type ActiveStream } from './types';

/** terminalNodeId -> ActiveStream. */
export const streams = new Map<string, ActiveStream>();
/** subscriptionId -> terminalNodeId so unsubscribe can find its stream. */
export const subscriptionIndex = new Map<string, string>();

/**
 * Drop every registry entry. Used by `__testing.reset` (test-only) and
 * by the v1 destroy path when a deploy is torn down outside the
 * idle-teardown window.
 *
 * NOTE: This does NOT call `teardownStream` on each entry — callers
 * that need to release Logging-SDK handles must walk `streams.values()`
 * themselves first. The orchestrator's `__testing.reset` does this.
 */
export function resetRegistry(): void {
  streams.clear();
  subscriptionIndex.clear();
}

/**
 * Emit a Socket.IO event to the room keyed by `terminalNodeId`. No-op
 * when the shared socket server hasn't been initialized (which is the
 * case in unit tests that exercise the streamer directly without
 * starting a real HTTP/socket server).
 */
export function emitToRoom(terminalNodeId: string, event: string, payload: unknown): void {
  const io = getSocketServer();
  if (!io) return;
  io.to(`logs:${terminalNodeId}`).emit(event, payload);
}

/**
 * Record an insertId in the stream's dedupe set, evicting the oldest
 * entry when the cap is hit. Both the polling loop and the tail loop
 * call this after a successful emit so a reconnect that re-sends the
 * trigger entry doesn't double-emit.
 */
export function rememberInsertId(stream: ActiveStream, insertId: string): void {
  stream.seenInsertIds.add(insertId);
  stream.insertIdOrder.push(insertId);
  if (stream.insertIdOrder.length > SEEN_INSERT_ID_CAP) {
    const evict = stream.insertIdOrder.shift();
    if (evict) stream.seenInsertIds.delete(evict);
  }
}

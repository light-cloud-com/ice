/**
 * Stream lifecycle primitives for the Log Stream service.
 *
 * Extracted from `log-stream.service.ts` (rf-lstream-5). Owns the
 * low-level "release SDK + registry handles" helpers used by the
 * polling and tail loops on terminal failures and by the orchestrator's
 * idle-teardown timer:
 *
 *   - stopUnderlyingStream: cancel poll timer + destroy/cancel tail
 *     stream. Idempotent.
 *   - teardownStream: stopUnderlyingStream + clear idle teardown timer
 *     + remove from registry.
 *
 * Deliberately small and dependency-free apart from the registry
 * binding. The richer setup helpers (openStreamForResolved,
 * restartStreamWithMode) live in `stream-open.ts` so that the polling
 * and tail modules can import these primitives without inheriting the
 * Prisma/credentials/SDK transitive imports.
 */

import { streams } from './registry';
import type { ActiveStream } from './types';

/**
 * Cancel the polling timer + destroy/cancel the tail stream. Idempotent
 * — both branches no-op if their handle is already nulled out. Each
 * destroy/cancel call is wrapped in try/catch because the SDK's
 * tail-stream object can throw if it's already cancelled (the gRPC
 * client surfaces "stream already closed" errors here).
 */
export function stopUnderlyingStream(stream: ActiveStream): void {
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

/**
 * Mark the stream stopped, release SDK handles, clear the idle teardown
 * timer, and remove the stream from the registry. After this returns,
 * a subsequent subscribe for the same terminalNodeId reopens from
 * scratch (re-resolves source, re-runs IAM probe).
 */
export function teardownStream(stream: ActiveStream): void {
  stream.stopped = true;
  stopUnderlyingStream(stream);
  if (stream.idleTeardownTimer) {
    clearTimeout(stream.idleTeardownTimer);
    stream.idleTeardownTimer = undefined;
  }
  streams.delete(stream.terminalNodeId);
}

/**
 * Stream lifecycle primitives for the Log Stream service.
 *
 * Extracted from `log-stream.service.ts` (rf-lstream-5). Concerned with
 * starting / stopping / restarting / tearing down the underlying SDK
 * connection bound to an `ActiveStream`. The polling and tail modules
 * (rf-lstream-6 / rf-lstream-7) depend on `stopUnderlyingStream` so it
 * lives here as the canonical place to release SDK handles.
 *
 * `openStreamForResolved` + `restartStreamWithMode` (which call into
 * `startPolling` / `startTail`) are added in rf-lstream-7b once those
 * helpers exist as their own modules; keeping them out of this initial
 * version avoids a circular import during the staged extraction.
 */

import { streams } from './registry.js';
import type { ActiveStream } from './types.js';

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

/**
 * Unit tests for `services/deploy/src/services/log-stream/stream-lifecycle.ts`.
 *
 * Cover the primitive lifecycle helpers in isolation — no SDK, no
 * Prisma, no socket server. Exercise:
 *   - stopUnderlyingStream clears the polling timer and nulls/destroys
 *     the tail handle. Idempotent: repeated calls don't crash.
 *   - destroy/cancel exceptions on the tail handle are swallowed
 *     (the gRPC client surfaces "stream already closed" errors here).
 *   - teardownStream sets stopped, clears idleTeardownTimer, and
 *     removes the stream from the registry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { resetRegistry, streams } from '../log-stream/registry.js';
import {
  stopUnderlyingStream,
  teardownStream,
} from '../log-stream/stream-lifecycle.js';
import type { ActiveStream } from '../log-stream/types.js';

function makeStream(overrides: Partial<ActiveStream> = {}): ActiveStream {
  return {
    terminalNodeId: 't1',
    mode: 'polling',
    filter: '',
    projectId: '',
    resolution: { state: 'none' },
    subscribers: new Map(),
    seenInsertIds: new Set(),
    insertIdOrder: [],
    consecutiveErrors: 0,
    stopped: false,
    loggingClient: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetRegistry();
});

describe('stopUnderlyingStream', () => {
  it('clears the polling timer and nulls the field', () => {
    const stream = makeStream();
    stream.pollTimer = setInterval(() => {}, 10_000);
    stopUnderlyingStream(stream);
    expect(stream.pollTimer).toBeUndefined();
  });

  it('destroys + cancels the tail stream and nulls the field', () => {
    const destroy = vi.fn();
    const cancel = vi.fn();
    const stream = makeStream({ mode: 'tail' });
    stream.tailStream = { destroy, cancel };
    stopUnderlyingStream(stream);
    expect(destroy).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.tailStream).toBeNull();
  });

  it('swallows exceptions thrown by destroy() and cancel()', () => {
    const stream = makeStream({ mode: 'tail' });
    stream.tailStream = {
      destroy: () => {
        throw new Error('already destroyed');
      },
      cancel: () => {
        throw new Error('already cancelled');
      },
    };
    expect(() => stopUnderlyingStream(stream)).not.toThrow();
    expect(stream.tailStream).toBeNull();
  });

  it('is a no-op when no timer or stream is set', () => {
    const stream = makeStream();
    expect(() => stopUnderlyingStream(stream)).not.toThrow();
    expect(stream.pollTimer).toBeUndefined();
    expect(stream.tailStream).toBeUndefined();
  });
});

describe('teardownStream', () => {
  it('marks stream stopped, releases timers/handles, and removes from registry', () => {
    const stream = makeStream();
    stream.pollTimer = setInterval(() => {}, 10_000);
    stream.idleTeardownTimer = setTimeout(() => {}, 10_000);
    streams.set(stream.terminalNodeId, stream);
    expect(streams.size).toBe(1);

    teardownStream(stream);

    expect(stream.stopped).toBe(true);
    expect(stream.pollTimer).toBeUndefined();
    expect(stream.idleTeardownTimer).toBeUndefined();
    expect(streams.size).toBe(0);
    expect(streams.has('t1')).toBe(false);
  });

  it('is safe when the stream is not in the registry', () => {
    const stream = makeStream({ terminalNodeId: 'orphan' });
    expect(() => teardownStream(stream)).not.toThrow();
    expect(stream.stopped).toBe(true);
  });
});

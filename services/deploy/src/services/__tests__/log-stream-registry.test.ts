/**
 * Unit tests for `services/deploy/src/services/log-stream/registry.ts`.
 *
 * Covers:
 *   - `streams` + `subscriptionIndex` are module-level singletons
 *     (the rf-cards-5 pattern: a single shared map across importers)
 *   - `resetRegistry()` clears both
 *   - `emitToRoom()` is a no-op when `getSocketServer()` returns null
 *     and forwards `to(...).emit(...)` when the server is set
 *   - `rememberInsertId()` enforces the SEEN_INSERT_ID_CAP eviction
 *     (oldest-first FIFO)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let socketServerImpl: any = null;
vi.mock('@ice/shared', () => ({
  getSocketServer: () => socketServerImpl,
}));

import {
  emitToRoom,
  rememberInsertId,
  resetRegistry,
  streams,
  subscriptionIndex,
} from '../log-stream/registry';
import { SEEN_INSERT_ID_CAP, type ActiveStream } from '../log-stream/types';

function makeStream(overrides: Partial<ActiveStream> = {}): ActiveStream {
  return {
    terminalNodeId: 't',
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
  socketServerImpl = null;
});

describe('registry — singletons', () => {
  it('streams and subscriptionIndex start empty', () => {
    expect(streams.size).toBe(0);
    expect(subscriptionIndex.size).toBe(0);
  });

  it('resetRegistry clears both Maps without re-creating the binding', () => {
    streams.set('t1', makeStream({ terminalNodeId: 't1' }));
    subscriptionIndex.set('s1', 't1');
    expect(streams.size).toBe(1);
    expect(subscriptionIndex.size).toBe(1);

    resetRegistry();
    expect(streams.size).toBe(0);
    expect(subscriptionIndex.size).toBe(0);
  });
});

describe('emitToRoom', () => {
  it('is a no-op when the shared socket server has not been initialized', () => {
    socketServerImpl = null;
    expect(() => emitToRoom('t1', 'logs:entry', { foo: 1 })).not.toThrow();
  });

  it('forwards the room.emit when the server is set', () => {
    const emit = vi.fn();
    socketServerImpl = {
      to: vi.fn(() => ({ emit })),
    };
    emitToRoom('t1', 'logs:entry', { x: 1 });
    expect(socketServerImpl.to).toHaveBeenCalledWith('logs:t1');
    expect(emit).toHaveBeenCalledWith('logs:entry', { x: 1 });
  });
});

describe('rememberInsertId', () => {
  it('records the insertId in seenInsertIds + insertIdOrder', () => {
    const stream = makeStream();
    rememberInsertId(stream, 'a');
    expect(stream.seenInsertIds.has('a')).toBe(true);
    expect(stream.insertIdOrder).toEqual(['a']);
  });

  it('evicts the oldest insertId once the cap is exceeded', () => {
    const stream = makeStream();
    // Fill the buffer up to the cap, then add one more.
    for (let i = 0; i < SEEN_INSERT_ID_CAP; i++) {
      rememberInsertId(stream, `id-${i}`);
    }
    expect(stream.insertIdOrder).toHaveLength(SEEN_INSERT_ID_CAP);
    expect(stream.seenInsertIds.size).toBe(SEEN_INSERT_ID_CAP);

    rememberInsertId(stream, 'overflow');
    expect(stream.insertIdOrder).toHaveLength(SEEN_INSERT_ID_CAP);
    expect(stream.insertIdOrder[stream.insertIdOrder.length - 1]).toBe('overflow');
    // The oldest entry got evicted from the dedupe set.
    expect(stream.seenInsertIds.has('id-0')).toBe(false);
    expect(stream.seenInsertIds.has('overflow')).toBe(true);
  });
});

/**
 * Unit tests for `services/deploy/src/services/log-stream/tail.ts`.
 *
 * Cover the tail-mode loop in isolation. Mock the logging client's
 * tailEntries to return a controllable EventEmitter-like stream that
 * lets tests fire data/error/end events in any order and inspect the
 * emitted Socket.IO traffic.
 *
 * Test cases:
 *   - data event: maps + dedupes entries, advances cursor
 *   - permission-denied error: emits source-resolved + error
 *     (recoverable=false), tears down the stream
 *   - other errors: schedule a reconnect with exponential backoff
 *     (1.5s base) and emit logs:resumed after re-startTail
 *   - clean end: first clean end retries after 1s, second is terminal
 *   - stopped guard: data/error/end handlers are no-ops once stopped
 *   - sync throw from tailEntries() also schedules a reconnect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ioEmits: [] as Array<{ room: string; event: string; payload: any }>,
}));

vi.mock('@ice/shared', () => ({
  getSocketServer: () => ({
    to(room: string) {
      return {
        emit(event: string, payload: any) {
          mocks.ioEmits.push({ room, event, payload });
        },
      };
    },
  }),
}));

import { resetRegistry } from '../log-stream/registry';
import { scheduleTailReconnect, startTail } from '../log-stream/tail';
import { RECONNECT_BASE_MS, RECONNECT_MAX_MS, type ActiveStream } from '../log-stream/types';

interface FakeTailStream {
  on(event: 'data' | 'error' | 'end', cb: (arg?: any) => void): FakeTailStream;
  destroy: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  fire(event: 'data' | 'error' | 'end', arg?: any): void;
}

function makeFakeTailStream(): FakeTailStream {
  const handlers = new Map<string, (arg?: any) => void>();
  const stream: FakeTailStream = {
    on(event, cb) {
      handlers.set(event, cb);
      return stream;
    },
    destroy: vi.fn(),
    cancel: vi.fn(),
    fire(event, arg) {
      handlers.get(event)?.(arg);
    },
  };
  return stream;
}

function makeStream(overrides: Partial<ActiveStream> = {}): ActiveStream {
  return {
    terminalNodeId: 't1',
    mode: 'tail',
    filter: 'resource.type="cloud_run_revision"',
    projectId: 'proj-1',
    resolution: { state: 'resolved', sourceNodeId: 's', iceType: 'Compute.Container' },
    subscribers: new Map(),
    seenInsertIds: new Set(),
    insertIdOrder: [],
    consecutiveErrors: 0,
    stopped: false,
    loggingClient: { tailEntries: vi.fn() },
    ...overrides,
  };
}

function makeEntry(opts: { ts: string; insertId: string }) {
  return {
    metadata: {
      timestamp: opts.ts,
      insertId: opts.insertId,
      severity: 'INFO',
      resource: { type: 'cloud_run_revision', labels: { service_name: 'api' } },
    },
    data: 'message',
  };
}

beforeEach(() => {
  mocks.ioEmits.length = 0;
  resetRegistry();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startTail — data path', () => {
  it('maps entries and dedupes via seenInsertIds', () => {
    const stream = makeStream();
    const fake = makeFakeTailStream();
    stream.loggingClient.tailEntries = vi.fn(() => fake);
    startTail(stream);
    fake.fire('data', {
      entries: [
        makeEntry({ ts: '2026-04-30T10:00:00.000Z', insertId: 'a' }),
        makeEntry({ ts: '2026-04-30T10:00:01.000Z', insertId: 'b' }),
      ],
    });
    fake.fire('data', {
      entries: [
        makeEntry({ ts: '2026-04-30T10:00:01.000Z', insertId: 'b' }),
        makeEntry({ ts: '2026-04-30T10:00:02.000Z', insertId: 'c' }),
      ],
    });
    const entries = mocks.ioEmits.filter((e) => e.event === 'logs:entry');
    expect(entries.map((e) => e.payload.insertId)).toEqual(['a', 'b', 'c']);
    expect(stream.lastTs).toBe('2026-04-30T10:00:02.000Z');
  });

  it('handles non-array data.entries gracefully', () => {
    const stream = makeStream();
    const fake = makeFakeTailStream();
    stream.loggingClient.tailEntries = vi.fn(() => fake);
    startTail(stream);
    fake.fire('data', { entries: null });
    fake.fire('data', { entries: undefined });
    fake.fire('data', {});
    const entries = mocks.ioEmits.filter((e) => e.event === 'logs:entry');
    expect(entries).toHaveLength(0);
  });
});

describe('startTail — error path', () => {
  it('treats permission-denied as terminal and tears down', () => {
    const stream = makeStream();
    const fake = makeFakeTailStream();
    stream.loggingClient.tailEntries = vi.fn(() => fake);
    startTail(stream);
    fake.fire('error', Object.assign(new Error('denied'), { code: 7 }));
    const events = mocks.ioEmits.map((e) => e.event);
    expect(events).toContain('logs:source-resolved');
    const errors = mocks.ioEmits.filter((e) => e.event === 'logs:error');
    expect(errors[0].payload.recoverable).toBe(false);
    expect(stream.resolution.state).toBe('permission-denied');
    expect(fake.destroy).toHaveBeenCalled();
  });

  it('reconnects on a non-permission-denied error and emits logs:resumed', () => {
    vi.useFakeTimers();
    const stream = makeStream();
    let attempt = 0;
    const fakes: FakeTailStream[] = [];
    stream.loggingClient.tailEntries = vi.fn(() => {
      attempt += 1;
      const fake = makeFakeTailStream();
      fakes.push(fake);
      return fake;
    });
    startTail(stream);
    fakes[0].fire('error', new Error('disconnected'));

    // 1.5s base.
    vi.advanceTimersByTime(RECONNECT_BASE_MS);
    expect(attempt).toBe(2);
    const resumed = mocks.ioEmits.filter((e) => e.event === 'logs:resumed');
    expect(resumed).toHaveLength(1);
    expect(resumed[0].payload).toHaveProperty('at');
  });
});

describe('startTail — clean end', () => {
  it('retries once after a clean end, treats a second clean end as terminal', () => {
    vi.useFakeTimers();
    const stream = makeStream();
    let attempt = 0;
    const fakes: FakeTailStream[] = [];
    stream.loggingClient.tailEntries = vi.fn(() => {
      attempt += 1;
      const fake = makeFakeTailStream();
      fakes.push(fake);
      return fake;
    });
    startTail(stream);

    // First clean end → retry after 1s.
    fakes[0].fire('end');
    expect(stream.consecutiveErrors).toBe(-1);
    vi.advanceTimersByTime(1000);
    expect(attempt).toBe(2);

    // Second clean end → terminal.
    fakes[1].fire('end');
    const errors = mocks.ioEmits.filter((e) => e.event === 'logs:error');
    expect(errors.some((e) => e.payload.recoverable === false)).toBe(true);
    expect(fakes[1].destroy).toHaveBeenCalled();
  });
});

describe('startTail — stopped guard', () => {
  it('returns immediately when stream is already stopped', () => {
    const stream = makeStream({ stopped: true });
    stream.loggingClient.tailEntries = vi.fn();
    startTail(stream);
    expect(stream.loggingClient.tailEntries).not.toHaveBeenCalled();
  });

  it('data handler is a no-op when stream is stopped post-startTail', () => {
    const stream = makeStream();
    const fake = makeFakeTailStream();
    stream.loggingClient.tailEntries = vi.fn(() => fake);
    startTail(stream);
    stream.stopped = true;
    fake.fire('data', {
      entries: [makeEntry({ ts: '2026-04-30T10:00:00.000Z', insertId: 'a' })],
    });
    const entries = mocks.ioEmits.filter((e) => e.event === 'logs:entry');
    expect(entries).toHaveLength(0);
  });
});

describe('startTail — sync throw on tailEntries()', () => {
  it('emits recoverable error and schedules a reconnect', () => {
    vi.useFakeTimers();
    const stream = makeStream();
    let attempt = 0;
    stream.loggingClient.tailEntries = vi.fn(() => {
      attempt += 1;
      if (attempt === 1) throw new Error('connect refused');
      return makeFakeTailStream();
    });
    startTail(stream);
    const errors = mocks.ioEmits.filter((e) => e.event === 'logs:error');
    expect(errors[0].payload.recoverable).toBe(true);
    // First retry happens at RECONNECT_BASE_MS (1.5s).
    vi.advanceTimersByTime(RECONNECT_BASE_MS);
    expect(attempt).toBe(2);
  });
});

describe('scheduleTailReconnect — backoff', () => {
  it('caps the backoff at RECONNECT_MAX_MS', () => {
    vi.useFakeTimers();
    const stream = makeStream();
    // Pretend many prior errors so the doubled backoff would exceed
    // the cap.
    stream.consecutiveErrors = 20;
    stream.loggingClient.tailEntries = vi.fn(() => makeFakeTailStream());
    scheduleTailReconnect(stream);
    // 21st error → 1500 * 2^20 = ~1.5GB ms; cap kicks in at RECONNECT_MAX_MS.
    vi.advanceTimersByTime(RECONNECT_MAX_MS);
    expect(stream.loggingClient.tailEntries).toHaveBeenCalled();
  });
});

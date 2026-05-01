/**
 * Unit tests for `services/deploy/src/services/log-stream/polling.ts`.
 *
 * Cover the polling loop in isolation — mock the logging client +
 * socket emitter; no Prisma, no source resolution. Exercise:
 *   - happy path: entries flow, cursor advances, dedupe works
 *   - first tick is immediate (no wait for setInterval)
 *   - error path: consecutiveErrors increments, recoverable=true
 *     until cap, then stopUnderlyingStream + recoverable=false
 *   - stopped guard short-circuits before the SDK call
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ioEmits: Array<{ room: string; event: string; payload: any }> = [];
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

import { pollOnce, startPolling } from '../log-stream/polling.js';
import { resetRegistry } from '../log-stream/registry.js';
import { MAX_CONSECUTIVE_ERRORS_POLLING, type ActiveStream } from '../log-stream/types.js';

function makeStream(overrides: Partial<ActiveStream> = {}): ActiveStream {
  return {
    terminalNodeId: 't1',
    mode: 'polling',
    filter: 'resource.type="cloud_run_revision"',
    projectId: 'proj-1',
    resolution: { state: 'resolved', sourceNodeId: 's', iceType: 'Compute.Container' },
    subscribers: new Map(),
    seenInsertIds: new Set(),
    insertIdOrder: [],
    consecutiveErrors: 0,
    stopped: false,
    loggingClient: { getEntries: vi.fn() },
    ...overrides,
  };
}

function makeEntry(opts: { ts: string; insertId: string; severity?: string; message?: string }) {
  return {
    metadata: {
      timestamp: opts.ts,
      insertId: opts.insertId,
      severity: opts.severity ?? 'INFO',
      resource: { type: 'cloud_run_revision', labels: { service_name: 'api' } },
    },
    data: opts.message ?? `entry-${opts.insertId}`,
  };
}

beforeEach(() => {
  mocks.ioEmits.length = 0;
  ioEmits.length = 0;
  resetRegistry();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pollOnce — happy path', () => {
  it('fans entries to the room, advances cursor, dedupes', async () => {
    const stream = makeStream();
    stream.loggingClient.getEntries = vi.fn(async () => [
      [
        makeEntry({ ts: '2026-04-30T10:00:00.000Z', insertId: 'a' }),
        makeEntry({ ts: '2026-04-30T10:00:01.000Z', insertId: 'b' }),
      ],
    ]);
    await pollOnce(stream);
    const entries = mocks.ioEmits.filter((e) => e.event === 'logs:entry');
    expect(entries.map((e) => e.payload.insertId)).toEqual(['a', 'b']);
    expect(stream.lastTs).toBe('2026-04-30T10:00:01.000Z');
    expect(stream.lastInsertId).toBe('b');

    // Second poll repeats one entry — should dedupe.
    stream.loggingClient.getEntries = vi.fn(async () => [
      [
        makeEntry({ ts: '2026-04-30T10:00:01.000Z', insertId: 'b' }),
        makeEntry({ ts: '2026-04-30T10:00:02.000Z', insertId: 'c' }),
      ],
    ]);
    await pollOnce(stream);
    const entries2 = mocks.ioEmits.filter((e) => e.event === 'logs:entry');
    expect(entries2.map((e) => e.payload.insertId)).toEqual(['a', 'b', 'c']);
  });

  it('appends the cursor predicate to the filter once lastTs is set', async () => {
    const stream = makeStream();
    const calls: any[] = [];
    stream.loggingClient.getEntries = vi.fn(async (req: any) => {
      calls.push(req.filter);
      return [[makeEntry({ ts: '2026-04-30T10:00:00.000Z', insertId: 'a' })]];
    });
    await pollOnce(stream);
    await pollOnce(stream);
    expect(calls[0]).toBe('resource.type="cloud_run_revision"');
    expect(calls[1]).toContain('timestamp > "2026-04-30T10:00:00.000Z"');
  });

  it('resets consecutiveErrors to 0 after a successful tick', async () => {
    const stream = makeStream();
    stream.consecutiveErrors = 2;
    stream.loggingClient.getEntries = vi.fn(async () => [[]]);
    await pollOnce(stream);
    expect(stream.consecutiveErrors).toBe(0);
  });
});

describe('pollOnce — error path', () => {
  it('emits recoverable=true and increments consecutiveErrors', async () => {
    const stream = makeStream();
    stream.loggingClient.getEntries = vi.fn(async () => {
      throw new Error('rate-limited');
    });
    await pollOnce(stream);
    expect(stream.consecutiveErrors).toBe(1);
    const errors = mocks.ioEmits.filter((e) => e.event === 'logs:error');
    expect(errors).toHaveLength(1);
    expect(errors[0].payload.recoverable).toBe(true);
  });

  it('flips to recoverable=false at the cap and calls stopUnderlyingStream', async () => {
    const stream = makeStream();
    stream.consecutiveErrors = MAX_CONSECUTIVE_ERRORS_POLLING - 1;
    // We need to pretend a previous setInterval is set so we can verify
    // the stop call clears it.
    stream.pollTimer = setInterval(() => {}, 60_000);
    stream.loggingClient.getEntries = vi.fn(async () => {
      throw new Error('persistent failure');
    });
    await pollOnce(stream);
    expect(stream.consecutiveErrors).toBe(MAX_CONSECUTIVE_ERRORS_POLLING);
    const errors = mocks.ioEmits.filter((e) => e.event === 'logs:error');
    expect(errors).toHaveLength(1);
    expect(errors[0].payload.recoverable).toBe(false);
    expect(stream.pollTimer).toBeUndefined();
  });
});

describe('pollOnce — stopped guard', () => {
  it('returns immediately when stream.stopped is true', async () => {
    const stream = makeStream({ stopped: true });
    stream.loggingClient.getEntries = vi.fn(async () => [[]]);
    await pollOnce(stream);
    expect(stream.loggingClient.getEntries).not.toHaveBeenCalled();
  });
});

describe('startPolling', () => {
  it('fires the first tick immediately and schedules subsequent ticks at 2s', async () => {
    vi.useFakeTimers();
    const stream = makeStream();
    let calls = 0;
    stream.loggingClient.getEntries = vi.fn(async () => {
      calls += 1;
      return [[]];
    });
    startPolling(stream);
    // The startPolling implementation kicks off pollOnce immediately
    // without awaiting it; let microtasks flush.
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(2);
    expect(stream.pollTimer).toBeDefined();
  });
});

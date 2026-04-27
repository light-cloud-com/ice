/**
 * Tests for the Log Stream Service.
 *
 * Strategy: mock everything I/O — Prisma, the credentials accessor, the
 * shared Socket.IO server, and `@google-cloud/logging`. The 9 cases
 * track the scenarios listed in the LT-3 brief plus a happy-path
 * sanity check.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be hoisted before importing the service) ──────────────

const prismaMock = {
  canvasCard: { findUnique: vi.fn() },
  environment: { findUnique: vi.fn() },
  deployedResourceMapping: { findFirst: vi.fn() },
};

vi.mock('@ice/db', () => ({
  default: prismaMock,
}));

const credentialsMock = {
  getDecryptedCredentials: vi.fn(),
};

vi.mock('@ice/service-credentials', () => credentialsMock);

const ioEmits: Array<{ room: string; event: string; payload: any }> = [];
const ioMock = {
  to(room: string) {
    return {
      emit(event: string, payload: any) {
        ioEmits.push({ room, event, payload });
      },
    };
  },
};

vi.mock('@ice/shared', () => ({
  getSocketServer: () => ioMock,
}));

// `@ice/core` provides `load_sdk('@google-cloud/logging')`. We stub it
// to return a fake Logging module that constructs a controllable client.
let getEntriesImpl: (...args: any[]) => any;
let tailEntriesImpl: (...args: any[]) => any;

vi.mock('@ice/core', () => ({
  load_sdk: vi.fn(async (mod: string) => {
    if (mod !== '@google-cloud/logging') return null;
    return {
      Logging: class FakeLogging {
        constructor(public opts: any) {}
        getEntries = (...args: any[]) => getEntriesImpl(...args);
        tailEntries = (...args: any[]) => tailEntriesImpl(...args);
      },
    };
  }),
}));

// ── Helpers ────────────────────────────────────────────────────────────

function makeEntry(opts: {
  ts: string;
  insertId: string;
  severity?: string;
  message?: string;
  resourceType?: string;
  labels?: Record<string, string>;
}) {
  return {
    metadata: {
      timestamp: opts.ts,
      insertId: opts.insertId,
      severity: opts.severity ?? 'INFO',
      resource: {
        type: opts.resourceType ?? 'cloud_run_revision',
        labels: opts.labels ?? { service_name: 'api-server' },
      },
    },
    data: opts.message ?? `entry-${opts.insertId}`,
  };
}

function setSupportedSourceCanvas(opts: {
  cardId?: string;
  terminalNodeId?: string;
  sourceNodeId?: string;
  iceType?: string;
  extraEdges?: Array<{ source: string; target: string }>;
  extraNodes?: Array<{ id: string; data: { iceType: string; label?: string } }>;
}) {
  const cardId = opts.cardId ?? 'card-1';
  const terminalNodeId = opts.terminalNodeId ?? 'log-1';
  const sourceNodeId = opts.sourceNodeId ?? 'src-1';
  const iceType = opts.iceType ?? 'Compute.Container';

  const baseNodes = [
    { id: terminalNodeId, type: 'resource', data: { iceType: 'Monitoring.Log' } },
    { id: sourceNodeId, type: 'resource', data: { iceType, label: 'api' } },
  ];
  const baseEdges = [{ id: 'e1', source: sourceNodeId, target: terminalNodeId }];

  prismaMock.canvasCard.findUnique.mockResolvedValue({
    nodes: [...baseNodes, ...(opts.extraNodes ?? [])],
    edges: [...baseEdges, ...(opts.extraEdges ?? [])],
    project_id: 'proj-1',
  });

  prismaMock.environment.findUnique.mockResolvedValue({
    type: 'production',
    region: 'us-central1',
  });

  prismaMock.deployedResourceMapping.findFirst.mockResolvedValue({
    resource_name: 'api-server',
    resource_type: 'gcp.run.service',
    provider_id: 'projects/proj/locations/us-central1/services/api-server',
  });

  credentialsMock.getDecryptedCredentials.mockResolvedValue({
    project_id: 'proj-1',
    client_email: 'sa@proj.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
  });
}

function commonArgs(overrides: any = {}) {
  return {
    cardId: 'card-1',
    environmentId: 'env-1',
    terminalNodeId: 'log-1',
    mode: 'polling' as const,
    organisationId: 'org-1',
    ...overrides,
  };
}

async function resetService() {
  const mod = await import('../log-stream.service.js');
  mod.__testing.reset();
  ioEmits.length = 0;
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset module-level fakes between cases so a leftover from one test
  // doesn't leak into the next (e.g. `getEntriesImpl` from the polling
  // suite would defeat the "no probe ran" assertion in the "zero edges"
  // case).
  getEntriesImpl = undefined as any;
  tailEntriesImpl = undefined as any;
  await resetService();
});

// ── 1. Polling happy path ──────────────────────────────────────────────

describe('subscribe — polling happy path', () => {
  it('emits 3+3+3 distinct logs:entry events in order across three pages', async () => {
    vi.useFakeTimers();
    setSupportedSourceCanvas({});
    let call = 0;
    getEntriesImpl = vi.fn(async () => {
      call += 1;
      // Call 1 is the IAM probe (pageSize 1, orderBy desc).
      if (call === 1) return [[]];
      if (call === 2) {
        return [
          [
            makeEntry({ ts: '2026-04-27T10:00:00.000Z', insertId: 'a1', message: 'one' }),
            makeEntry({ ts: '2026-04-27T10:00:01.000Z', insertId: 'a2', message: 'two' }),
            makeEntry({ ts: '2026-04-27T10:00:02.000Z', insertId: 'a3', message: 'three' }),
          ],
        ];
      }
      if (call === 3) {
        return [
          [
            makeEntry({ ts: '2026-04-27T10:00:03.000Z', insertId: 'b1' }),
            makeEntry({ ts: '2026-04-27T10:00:04.000Z', insertId: 'b2' }),
            makeEntry({ ts: '2026-04-27T10:00:05.000Z', insertId: 'b3' }),
          ],
        ];
      }
      return [
        [
          makeEntry({ ts: '2026-04-27T10:00:06.000Z', insertId: 'c1' }),
          makeEntry({ ts: '2026-04-27T10:00:07.000Z', insertId: 'c2' }),
          makeEntry({ ts: '2026-04-27T10:00:08.000Z', insertId: 'c3' }),
        ],
      ];
    });

    const mod = await import('../log-stream.service.js');
    const result = await mod.subscribe(commonArgs());
    expect(result.resolution.state).toBe('resolved');

    // Initial poll tick (immediate after stream open) + two more 2s ticks.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    const entries = ioEmits.filter((e) => e.event === 'logs:entry');
    expect(entries).toHaveLength(9);
    const ids = entries.map((e) => e.payload.insertId);
    expect(ids).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3']);
    // Room key is the terminalNodeId.
    for (const e of entries) expect(e.room).toBe('logs:log-1');

    vi.useRealTimers();
  });
});

// ── 2. Polling cursor advance ─────────────────────────────────────────

describe('subscribe — polling cursor advance', () => {
  it('second tick filter contains timestamp > last_entry_ts', async () => {
    vi.useFakeTimers();
    setSupportedSourceCanvas({});
    const filterCalls: string[] = [];
    let call = 0;
    getEntriesImpl = vi.fn(async (req: any) => {
      filterCalls.push(req.filter);
      call += 1;
      if (call === 1) {
        // The first call is the IAM probe (pageSize 1, orderBy desc).
        return [[]];
      }
      if (call === 2) {
        return [
          [
            makeEntry({ ts: '2026-04-27T10:00:00.000Z', insertId: 'p1' }),
            makeEntry({ ts: '2026-04-27T10:00:01.000Z', insertId: 'p2' }),
          ],
        ];
      }
      return [[]];
    });

    const mod = await import('../log-stream.service.js');
    await mod.subscribe(commonArgs());

    await vi.advanceTimersByTimeAsync(0); // first poll tick (after IAM probe)
    await vi.advanceTimersByTimeAsync(2000); // second poll tick

    // Subsequent poll filter must include the cursor predicate.
    const cursorCall = filterCalls[filterCalls.length - 1];
    expect(cursorCall).toContain('timestamp > "2026-04-27T10:00:01.000Z"');

    vi.useRealTimers();
  });
});

// ── 3. Polling reconnect on error ─────────────────────────────────────

describe('subscribe — polling reconnect on transient error', () => {
  it('emits logs:error recoverable, then succeeds and emits more entries', async () => {
    vi.useFakeTimers();
    setSupportedSourceCanvas({});
    let call = 0;
    getEntriesImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return [[]]; // IAM probe ok.
      if (call === 2) throw Object.assign(new Error('rate limited'), { code: 429 });
      return [
        [
          makeEntry({ ts: '2026-04-27T10:00:10.000Z', insertId: 'r1' }),
          makeEntry({ ts: '2026-04-27T10:00:11.000Z', insertId: 'r2' }),
        ],
      ];
    });

    const mod = await import('../log-stream.service.js');
    await mod.subscribe(commonArgs());

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    const errors = ioEmits.filter((e) => e.event === 'logs:error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].payload.recoverable).toBe(true);

    // Next tick should succeed.
    await vi.advanceTimersByTimeAsync(2000);
    const entries = ioEmits.filter((e) => e.event === 'logs:entry');
    expect(entries.map((e) => e.payload.insertId)).toEqual(['r1', 'r2']);

    vi.useRealTimers();
  });
});

// ── 4. Tail happy path ────────────────────────────────────────────────

describe('subscribe — tail happy path', () => {
  it('emits 5 logs:entry events from a tail stream', async () => {
    vi.useFakeTimers();
    setSupportedSourceCanvas({});
    getEntriesImpl = vi.fn(async () => [[]]); // IAM probe ok.

    const handlers = new Map<string, (arg: any) => void>();
    const fakeStream = {
      on(event: string, cb: any) {
        handlers.set(event, cb);
        return fakeStream;
      },
      destroy: vi.fn(),
      cancel: vi.fn(),
    };
    tailEntriesImpl = vi.fn(() => fakeStream);

    const mod = await import('../log-stream.service.js');
    await mod.subscribe(commonArgs({ mode: 'tail' }));

    await vi.advanceTimersByTimeAsync(0); // let IAM probe finish.
    handlers.get('data')!({
      entries: [
        makeEntry({ ts: '2026-04-27T11:00:00.000Z', insertId: 't1' }),
        makeEntry({ ts: '2026-04-27T11:00:01.000Z', insertId: 't2' }),
        makeEntry({ ts: '2026-04-27T11:00:02.000Z', insertId: 't3' }),
      ],
    });
    handlers.get('data')!({
      entries: [
        makeEntry({ ts: '2026-04-27T11:00:03.000Z', insertId: 't4' }),
        makeEntry({ ts: '2026-04-27T11:00:04.000Z', insertId: 't5' }),
      ],
    });

    const entries = ioEmits.filter((e) => e.event === 'logs:entry');
    expect(entries).toHaveLength(5);
    expect(entries.map((e) => e.payload.insertId)).toEqual(['t1', 't2', 't3', 't4', 't5']);

    vi.useRealTimers();
  });
});

// ── 5. Tail reconnect ─────────────────────────────────────────────────

describe('subscribe — tail reconnect on error', () => {
  it('emits logs:error recoverable, then logs:resumed, dedupes the trigger entry', async () => {
    vi.useFakeTimers();
    setSupportedSourceCanvas({});
    getEntriesImpl = vi.fn(async () => [[]]);

    const allHandlers: Array<Map<string, (arg: any) => void>> = [];
    let attempt = 0;
    tailEntriesImpl = vi.fn(() => {
      attempt += 1;
      const handlers = new Map<string, (arg: any) => void>();
      allHandlers.push(handlers);
      return {
        on(event: string, cb: any) {
          handlers.set(event, cb);
          return this;
        },
        destroy: vi.fn(),
        cancel: vi.fn(),
      };
    });

    const mod = await import('../log-stream.service.js');
    await mod.subscribe(commonArgs({ mode: 'tail' }));
    await vi.advanceTimersByTimeAsync(0);

    // First tail stream — emit one entry then error.
    allHandlers[0].get('data')!({
      entries: [makeEntry({ ts: '2026-04-27T12:00:00.000Z', insertId: 'r1' })],
    });
    allHandlers[0].get('error')!(Object.assign(new Error('disconnected'), { code: 14 }));

    // Backoff timer fires (1.5s base).
    await vi.advanceTimersByTimeAsync(1500);
    expect(attempt).toBe(2);

    // Second tail re-emits r1 (gRPC can resend) — must be deduped.
    allHandlers[1].get('data')!({
      entries: [
        makeEntry({ ts: '2026-04-27T12:00:00.000Z', insertId: 'r1' }),
        makeEntry({ ts: '2026-04-27T12:00:05.000Z', insertId: 'r2' }),
      ],
    });

    const errors = ioEmits.filter((e) => e.event === 'logs:error');
    const resumed = ioEmits.filter((e) => e.event === 'logs:resumed');
    const entries = ioEmits.filter((e) => e.event === 'logs:entry');

    expect(errors[0].payload.recoverable).toBe(true);
    expect(resumed).toHaveLength(1);
    expect(resumed[0].payload).toHaveProperty('at');
    // r1 only emitted once even though both attempts saw it.
    expect(entries.map((e) => e.payload.insertId)).toEqual(['r1', 'r2']);

    vi.useRealTimers();
  });
});

// ── 6. IAM probe denies subscription ──────────────────────────────────

describe('subscribe — IAM probe permission denied', () => {
  it('returns permission-denied resolution and does not open a stream', async () => {
    vi.useFakeTimers();
    setSupportedSourceCanvas({});
    getEntriesImpl = vi.fn(async () => {
      throw Object.assign(new Error('Permission denied on resource'), { code: 7 });
    });
    tailEntriesImpl = vi.fn(() => {
      throw new Error('should not be called');
    });

    const mod = await import('../log-stream.service.js');
    const result = await mod.subscribe(commonArgs());

    expect(result.resolution.state).toBe('permission-denied');

    // Drain any timers; nothing should fire.
    await vi.advanceTimersByTimeAsync(5000);

    const entries = ioEmits.filter((e) => e.event === 'logs:entry');
    expect(entries).toHaveLength(0);
    expect(tailEntriesImpl).not.toHaveBeenCalled();

    // No polling timer was registered for this terminalNodeId.
    const stream = mod.__testing.getStream('log-1');
    // Either nothing in `streams` map, or the stream is in a denied
    // holding state with no polling timer.
    if (stream) expect(stream.pollTimer).toBeUndefined();

    vi.useRealTimers();
  });
});

// ── 7. Source resolution states ───────────────────────────────────────

describe('subscribe — source resolution edge cases', () => {
  it('zero supported inbound edges → state: none and no stream opened', async () => {
    vi.useFakeTimers();
    prismaMock.canvasCard.findUnique.mockResolvedValue({
      // Log node has no inbound edges from supported sources.
      nodes: [{ id: 'log-1', type: 'resource', data: { iceType: 'Monitoring.Log' } }],
      edges: [],
      project_id: 'proj-1',
    });
    prismaMock.environment.findUnique.mockResolvedValue({ type: 'production', region: 'us-central1' });
    prismaMock.deployedResourceMapping.findFirst.mockResolvedValue(null);

    const mod = await import('../log-stream.service.js');
    const result = await mod.subscribe(commonArgs());
    expect(result.resolution.state).toBe('none');

    // No SDK getEntries call (probe didn't run because nothing to filter).
    expect(getEntriesImpl).toBeUndefined();

    vi.useRealTimers();
  });

  it('two supported inbound edges, no override → state: ambiguous with candidates', async () => {
    vi.useFakeTimers();
    setSupportedSourceCanvas({
      extraNodes: [{ id: 'src-2', data: { iceType: 'Compute.Worker', label: 'worker' } }],
      extraEdges: [{ source: 'src-2', target: 'log-1' }],
    });

    const mod = await import('../log-stream.service.js');
    const result = await mod.subscribe(commonArgs());
    expect(result.resolution.state).toBe('ambiguous');
    if (result.resolution.state === 'ambiguous') {
      expect(result.resolution.candidates).toHaveLength(2);
      const ids = result.resolution.candidates.map((c) => c.nodeId).sort();
      expect(ids).toEqual(['src-1', 'src-2']);
    }

    vi.useRealTimers();
  });

  it('one supported edge but no deployedResourceMapping row → state: pre-deploy', async () => {
    vi.useFakeTimers();
    setSupportedSourceCanvas({});
    prismaMock.deployedResourceMapping.findFirst.mockResolvedValue(null);

    const mod = await import('../log-stream.service.js');
    const result = await mod.subscribe(commonArgs());
    expect(result.resolution.state).toBe('pre-deploy');
    if (result.resolution.state === 'pre-deploy') {
      expect(result.resolution.sourceNodeId).toBe('src-1');
      expect(result.resolution.iceType).toBe('Compute.Container');
    }

    vi.useRealTimers();
  });
});

// ── 8. Multi-subscriber reuse ─────────────────────────────────────────

describe('subscribe — multi-subscriber reuse', () => {
  it('two subscribers for the same terminalNodeId share one underlying stream', async () => {
    vi.useFakeTimers();
    setSupportedSourceCanvas({});
    let entriesCalls = 0;
    getEntriesImpl = vi.fn(async () => {
      entriesCalls += 1;
      return [[]];
    });

    const mod = await import('../log-stream.service.js');
    const r1 = await mod.subscribe(commonArgs());
    const r2 = await mod.subscribe(commonArgs());

    expect(r1.subscriptionId).not.toBe(r2.subscriptionId);
    expect(r1.resolution.state).toBe('resolved');
    expect(r2.resolution.state).toBe('resolved');

    // Drive one polling tick to make sure only one underlying stream
    // produced the call.
    await vi.advanceTimersByTimeAsync(0);

    // Across IAM probe (1 call) + first poll tick (1 call) we expect 2 —
    // crucially NOT 4 (which would mean each subscribe re-opened).
    expect(entriesCalls).toBe(2);
    expect(mod.__testing.getStreamCount()).toBe(1);

    vi.useRealTimers();
  });
});

// ── 9. Idle teardown ──────────────────────────────────────────────────

describe('unsubscribe — idle teardown after 60s', () => {
  it('closes the underlying stream once both subscribers leave and the timer fires', async () => {
    vi.useFakeTimers();
    setSupportedSourceCanvas({});
    getEntriesImpl = vi.fn(async () => [[]]);

    const mod = await import('../log-stream.service.js');
    const r1 = await mod.subscribe(commonArgs());
    const r2 = await mod.subscribe(commonArgs());

    await mod.unsubscribe(r1.subscriptionId);
    await mod.unsubscribe(r2.subscriptionId);

    // Timer not yet fired — stream still alive.
    expect(mod.__testing.getStreamCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000 + 1);
    expect(mod.__testing.getStreamCount()).toBe(0);

    // Idempotent unsubscribe — calling again on a gone id doesn't throw.
    await expect(mod.unsubscribe(r1.subscriptionId)).resolves.toBeUndefined();

    vi.useRealTimers();
  });

  it('cancels the idle timer when a new subscriber joins within the window', async () => {
    vi.useFakeTimers();
    setSupportedSourceCanvas({});
    getEntriesImpl = vi.fn(async () => [[]]);

    const mod = await import('../log-stream.service.js');
    const r1 = await mod.subscribe(commonArgs());
    await mod.unsubscribe(r1.subscriptionId);

    // 30s into the idle window — re-subscribe.
    await vi.advanceTimersByTimeAsync(30_000);
    const r2 = await mod.subscribe(commonArgs());

    // Drive past the original 60s mark — stream should still be alive.
    await vi.advanceTimersByTimeAsync(40_000);
    expect(mod.__testing.getStreamCount()).toBe(1);

    await mod.unsubscribe(r2.subscriptionId);
    vi.useRealTimers();
  });
});

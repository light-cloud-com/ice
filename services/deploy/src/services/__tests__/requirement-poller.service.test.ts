/**
 * Unit tests for `services/deploy/src/services/requirement-poller.service.ts` —
 * the 30-second background poller that re-checks `block_requirement_status`
 * rows whose status is still `unmet`/`unknown`/`checking` and emits
 * `requirement_verified` socket events when a row flips.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest globals are
 * imported explicitly. Per `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * mocks are cleared in `beforeEach`. Per `fake-timers-plus-sync-useeffect-mock-needs-pertest-toggle`,
 * `vi.useRealTimers()` runs in `afterEach` so a stranded interval can't poison
 * downstream tests.
 *
 * The SUT depends on five external surfaces (`prisma`, `@ice/shared`,
 * `BUILT_IN_REQUIREMENTS`, `google-verification.service`, `resource-mapping.service`).
 * `BUILT_IN_REQUIREMENTS` is replaced with a captive list of fixture
 * definitions so the `def.check` callback is fully under our control — we
 * can return verified/unmet/throw and verify the downstream branching
 * without coupling to the real built-in DNS/certificate logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const findManyStatus = vi.fn();
  const updateStatus = vi.fn(async () => undefined);
  const findUniqueCard = vi.fn();
  const findUniqueProject = vi.fn();
  const emitDeployRequirementVerified = vi.fn();
  const getResourceMap = vi.fn();
  const checkSearchConsoleVerification = vi.fn();
  const fetchSslCertificateStatus = vi.fn();
  // Mutable container so individual tests can swap out which definitions
  // ship in the captive list. The vi.mock factory below reads through a
  // getter so the latest assignment wins per-test.
  const requirementsRef: { current: any[] } = { current: [] };
  return {
    findManyStatus,
    updateStatus,
    findUniqueCard,
    findUniqueProject,
    emitDeployRequirementVerified,
    getResourceMap,
    checkSearchConsoleVerification,
    fetchSslCertificateStatus,
    requirementsRef,
  };
});

vi.mock('@ice/db', () => ({
  default: {
    blockRequirementStatus: {
      findMany: mocks.findManyStatus,
      update: mocks.updateStatus,
    },
    canvasCard: { findUnique: mocks.findUniqueCard },
    canvasProject: { findUnique: mocks.findUniqueProject },
  },
}));

vi.mock('@ice/shared', () => ({
  emitDeployRequirementVerified: mocks.emitDeployRequirementVerified,
}));

vi.mock('@ice/blocks/requirements', () => ({
  get BUILT_IN_REQUIREMENTS() {
    return mocks.requirementsRef.current;
  },
}));

vi.mock('../google-verification.service', () => ({
  checkSearchConsoleVerification: mocks.checkSearchConsoleVerification,
  fetchSslCertificateStatus: mocks.fetchSslCertificateStatus,
}));

vi.mock('../resource-mapping.service', () => ({
  getResourceMap: mocks.getResourceMap,
}));

import { startRequirementPoller, stopRequirementPoller } from '../requirement-poller.service';

/**
 * Drive exactly one poll tick under fake timers and let any pending
 * promise chains settle. The SUT runs an unguarded setInterval, so we
 * must `stopRequirementPoller()` BEFORE advancing time again or we'd
 * trip vitest's "10000 timers, assuming an infinite loop" guard.
 */
async function runOneTick(): Promise<void> {
  // Advance to exactly the first interval boundary so the timer fires once.
  await vi.advanceTimersByTimeAsync(30_000);
  // Drain any pending microtasks (Promise.all batches inside runTick). The
  // deepest await chain in checkOne is roughly nine awaits; flush generously.
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
  stopRequirementPoller();
}

interface FakeRow {
  id: string;
  card_id: string;
  node_id: string;
  environment: string;
  requirement_id: string;
  status: string;
  last_checked_at: Date;
  verified_at: Date | null;
}

function makeRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: 'row-1',
    card_id: 'card-1',
    node_id: 'node-1',
    environment: 'production',
    requirement_id: 'public-endpoint-domain',
    status: 'unmet',
    last_checked_at: new Date(Date.now() - 120_000), // long-ago so default 60s interval matches
    verified_at: null,
    ...overrides,
  };
}

function makeDef(overrides: Partial<any> = {}) {
  return {
    id: 'public-endpoint-domain',
    timing: 'post-deploy' as const,
    scope: 'block' as const,
    blocking: false,
    title: () => 'fake',
    applies: () => true,
    verifyPollIntervalMs: 60_000,
    verifyTimeoutMs: undefined as number | undefined,
    check: vi.fn(async () => ({
      status: 'verified' as const,
      message: 'ok',
      details: { ip: '1.2.3.4' },
      lastCheckedAt: new Date().toISOString(),
    })),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: empty candidate list — tests opt in to non-empty results.
  mocks.findManyStatus.mockResolvedValue([]);
  mocks.updateStatus.mockResolvedValue(undefined);
  mocks.findUniqueCard.mockResolvedValue(null);
  mocks.findUniqueProject.mockResolvedValue(null);
  mocks.getResourceMap.mockResolvedValue(new Map());
  mocks.requirementsRef.current = [];
});

afterEach(() => {
  // Always tear down the singleton interval so the next test starts clean.
  stopRequirementPoller();
  vi.useRealTimers();
});

describe('startRequirementPoller / stopRequirementPoller', () => {
  it('registers a 30-second interval and stop clears it', () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(globalThis, 'setInterval');
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    startRequirementPoller();

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0]?.[1]).toBe(30_000);

    stopRequirementPoller();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — a second start while the timer is live is a no-op', () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(globalThis, 'setInterval');

    startRequirementPoller();
    startRequirementPoller();
    startRequirementPoller();

    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it('stop after a fresh start clears the interval; subsequent stop is a no-op', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    startRequirementPoller();
    stopRequirementPoller();
    stopRequirementPoller();

    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('logs when the poller starts', () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    startRequirementPoller();
    expect(logSpy).toHaveBeenCalledWith('[requirement-poller] started');
    logSpy.mockRestore();
  });

  it('unrefs the timer when unref is available so the interval does not pin the process', () => {
    vi.useFakeTimers();
    const unrefSpy = vi.fn();
    const setSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: any, _ms: any) => {
      const t: any = { unref: unrefSpy };
      return t as any;
    }) as any);

    startRequirementPoller();

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(unrefSpy).toHaveBeenCalledTimes(1);
    setSpy.mockRestore();
  });

  it('does not throw when unref is not a function (defensive guard)', () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((_fn: any, _ms: any) => {
      // Return a plain object — no `unref` method at all.
      return {} as any;
    }) as any);

    expect(() => startRequirementPoller()).not.toThrow();
    setSpy.mockRestore();
  });

  it('catches and warns when the tick callback rejects without crashing the interval', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.findManyStatus.mockRejectedValueOnce(new Error('db down'));

    startRequirementPoller();
    await runOneTick();

    expect(warnSpy).toHaveBeenCalled();
    const tag = String(warnSpy.mock.calls[0]?.[0]);
    const detail = String(warnSpy.mock.calls[0]?.[1] ?? '');
    expect(tag).toContain('[requirement-poller] tick failed:');
    expect(detail).toContain('db down');
    warnSpy.mockRestore();
  });

  it('falls back to String(err) when the rejected value is not an Error (no .message)', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.findManyStatus.mockRejectedValueOnce('plain-string-failure');

    startRequirementPoller();
    await runOneTick();

    expect(warnSpy).toHaveBeenCalled();
    const detail = String(warnSpy.mock.calls[0]?.[1] ?? '');
    expect(detail).toContain('plain-string-failure');
    warnSpy.mockRestore();
  });
});

describe('runTick — candidate selection', () => {
  it('does nothing when there are no candidates', async () => {
    vi.useFakeTimers();
    mocks.findManyStatus.mockResolvedValue([]);

    startRequirementPoller();
    await runOneTick();

    expect(mocks.findUniqueCard).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
    expect(mocks.emitDeployRequirementVerified).not.toHaveBeenCalled();
  });

  it('skips rows whose requirement id is unknown (no matching definition)', async () => {
    vi.useFakeTimers();
    mocks.requirementsRef.current = [makeDef({ id: 'public-endpoint-domain' })];
    mocks.findManyStatus.mockResolvedValue([
      makeRow({ requirement_id: 'unknown-thing' }),
    ]);

    startRequirementPoller();
    await runOneTick();

    expect(mocks.findUniqueCard).not.toHaveBeenCalled();
  });

  it('skips rows whose definition is not post-deploy timing', async () => {
    vi.useFakeTimers();
    mocks.requirementsRef.current = [makeDef({ timing: 'before-deploy' })];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);

    startRequirementPoller();
    await runOneTick();

    expect(mocks.findUniqueCard).not.toHaveBeenCalled();
  });

  it('uses the default 60s poll interval when verifyPollIntervalMs is undefined', async () => {
    vi.useFakeTimers();
    mocks.requirementsRef.current = [makeDef({ verifyPollIntervalMs: undefined })];
    // last_checked_at "now" — even after the 30s timer-tick the age is still
    // only 30s, well below the default 60s interval, so the row is skipped.
    mocks.findManyStatus.mockResolvedValue([
      makeRow({ last_checked_at: new Date(Date.now()) }),
    ]);

    startRequirementPoller();
    await runOneTick();

    expect(mocks.findUniqueCard).not.toHaveBeenCalled();
  });

  it('skips rows whose age is below the verifyPollIntervalMs threshold', async () => {
    vi.useFakeTimers();
    // 90s interval, last_checked_at 5s in the past pre-tick → 35s after the
    // 30s tick advance, well below the 90s threshold.
    mocks.requirementsRef.current = [makeDef({ verifyPollIntervalMs: 90_000 })];
    mocks.findManyStatus.mockResolvedValue([
      makeRow({ last_checked_at: new Date(Date.now() - 5_000) }),
    ]);

    startRequirementPoller();
    await runOneTick();

    expect(mocks.findUniqueCard).not.toHaveBeenCalled();
  });

  it('caps to 10 concurrent checks per batch when more than 10 rows are due', async () => {
    vi.useFakeTimers();
    const def = makeDef();
    let activeCount = 0;
    let peakActive = 0;
    def.check = vi.fn(async () => {
      activeCount += 1;
      peakActive = Math.max(peakActive, activeCount);
      // Yield once so other in-flight checks register before we resolve.
      await Promise.resolve();
      activeCount -= 1;
      return {
        status: 'verified' as const,
        message: 'ok',
        details: undefined as any,
        lastCheckedAt: new Date().toISOString(),
      };
    });
    mocks.requirementsRef.current = [def];

    const rows = Array.from({ length: 12 }, (_, i) =>
      makeRow({ id: `row-${i}`, card_id: `card-${i}` }),
    );
    mocks.findManyStatus.mockResolvedValue(rows);
    mocks.findUniqueCard.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      project_id: 'p',
      nodes: [{ id: 'node-1', data: {} }],
    }));
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });

    startRequirementPoller();
    await runOneTick();

    expect(def.check).toHaveBeenCalledTimes(12);
    expect(peakActive).toBeLessThanOrEqual(10);
    expect(peakActive).toBeGreaterThan(1);
  });
});

describe('checkOne — happy path & flip emit', () => {
  it('updates status, marks verified_at on flip, and emits requirement_verified', async () => {
    vi.useFakeTimers();
    const startWall = new Date('2026-05-02T10:00:00.000Z');
    vi.setSystemTime(startWall);
    // The 30s tick advance shifts wall-clock time; the SUT's `at`/`seq`
    // capture happens AFTER the advance, so reflect that in the expected
    // timestamp.
    const tickWall = new Date(startWall.getTime() + 30_000);

    const def = makeDef({
      check: vi.fn(async () => ({
        status: 'verified' as const,
        message: 'all good',
        details: { ip: '203.0.113.10' },
        lastCheckedAt: tickWall.toISOString(),
      })),
    });
    mocks.requirementsRef.current = [def];

    // Push last_checked_at far enough back that age > default 60s interval
    // even at the post-tick wall clock.
    mocks.findManyStatus.mockResolvedValue([
      makeRow({ last_checked_at: new Date(startWall.getTime() - 5 * 60_000) }),
    ]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: { domain: 'example.com' } }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });
    mocks.getResourceMap.mockResolvedValue(
      new Map([
        [
          'node-1',
          { name: 'forwarding-rule-x', type: 'gcp.compute.forwardingRule', providerId: 'projects/lc-ice/regions/us-central1/forwardingRules/forwarding-rule-x' },
        ],
      ]),
    );

    startRequirementPoller();
    await runOneTick();

    expect(def.check).toHaveBeenCalledTimes(1);
    const ctxArg = (def.check as any).mock.calls[0][0];
    expect(ctxArg.cardId).toBe('card-1');
    expect(ctxArg.environment).toBe('production');
    expect(ctxArg.org.id).toBe('org-1');
    expect(ctxArg.providerId).toBe('projects/lc-ice/regions/us-central1/forwardingRules/forwarding-rule-x');
    expect(ctxArg.gcpProject).toBe('lc-ice');
    expect(ctxArg.block).toEqual({ id: 'node-1', data: { domain: 'example.com' } });
    expect(ctxArg.googleVerifier.checkVerification).toBe(mocks.checkSearchConsoleVerification);
    expect(ctxArg.certStatusChecker.fetchStatus).toBe(mocks.fetchSslCertificateStatus);

    expect(mocks.updateStatus).toHaveBeenCalledTimes(1);
    expect(mocks.updateStatus).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: {
        status: 'verified',
        message: 'all good',
        last_checked_at: expect.any(Date),
        verified_at: expect.any(Date),
        details: { ip: '203.0.113.10' },
      },
    });

    expect(mocks.emitDeployRequirementVerified).toHaveBeenCalledTimes(1);
    expect(mocks.emitDeployRequirementVerified).toHaveBeenCalledWith('card-1', {
      type: 'requirement_verified',
      card_id: 'card-1',
      node_id: 'node-1',
      environment: 'production',
      requirement: 'public-endpoint-domain',
      status: 'satisfied',
      details: { ip: '203.0.113.10' },
      at: tickWall.toISOString(),
      seq: tickWall.getTime(),
    });
  });

  it('preserves prior verified_at and emits status: unsatisfied when result is not verified', async () => {
    vi.useFakeTimers();
    const priorVerifiedAt = new Date('2026-04-01T09:00:00.000Z');
    const def = makeDef({
      check: vi.fn(async () => ({
        status: 'unmet' as const,
        message: 'still pending',
        details: undefined,
        lastCheckedAt: new Date().toISOString(),
      })),
    });
    mocks.requirementsRef.current = [def];

    mocks.findManyStatus.mockResolvedValue([
      makeRow({ status: 'unmet', verified_at: priorVerifiedAt }),
    ]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });

    startRequirementPoller();
    await runOneTick();

    expect(mocks.updateStatus).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: expect.objectContaining({
        status: 'unmet',
        verified_at: priorVerifiedAt,
      }),
    });
    expect(mocks.emitDeployRequirementVerified).toHaveBeenCalledWith(
      'card-1',
      expect.objectContaining({ status: 'unsatisfied' }),
    );
  });

  it('serialises message as null when result.message is undefined', async () => {
    vi.useFakeTimers();
    mocks.requirementsRef.current = [
      makeDef({
        check: vi.fn(async () => ({
          status: 'verified' as const,
          // message intentionally omitted
          details: undefined,
          lastCheckedAt: new Date().toISOString(),
        })),
      }),
    ];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });

    startRequirementPoller();
    await runOneTick();

    expect(mocks.updateStatus).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: expect.objectContaining({ message: null, details: null }),
    });
  });

  it('does not crash when emitDeployRequirementVerified throws (event emit is best-effort)', async () => {
    vi.useFakeTimers();
    mocks.requirementsRef.current = [makeDef()];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });
    mocks.emitDeployRequirementVerified.mockImplementation(() => {
      throw new Error('socket dead');
    });

    startRequirementPoller();
    await runOneTick();

    // The status update still landed; only the wire emit was swallowed.
    expect(mocks.updateStatus).toHaveBeenCalled();
  });
});

describe('checkOne — early-return guards', () => {
  it('returns early when the definition has no check() function', async () => {
    vi.useFakeTimers();
    mocks.requirementsRef.current = [makeDef({ check: undefined as any })];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);

    startRequirementPoller();
    await runOneTick();

    expect(mocks.findUniqueCard).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
    expect(mocks.emitDeployRequirementVerified).not.toHaveBeenCalled();
  });

  it('returns early when the canvas card cannot be found', async () => {
    vi.useFakeTimers();
    mocks.requirementsRef.current = [makeDef()];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue(null);

    startRequirementPoller();
    await runOneTick();

    expect(mocks.findUniqueProject).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });

  it('returns early when the matching node cannot be found inside the card', async () => {
    vi.useFakeTimers();
    mocks.requirementsRef.current = [makeDef()];
    mocks.findManyStatus.mockResolvedValue([makeRow({ node_id: 'missing' })]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'other', data: {} }],
    });

    startRequirementPoller();
    await runOneTick();

    expect(mocks.findUniqueProject).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });

  it('treats null nodes as an empty array (defensive cast in the SUT)', async () => {
    vi.useFakeTimers();
    mocks.requirementsRef.current = [makeDef()];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: null,
    });

    startRequirementPoller();
    await runOneTick();

    expect(mocks.findUniqueProject).not.toHaveBeenCalled();
  });

  it('treats node.data missing as an empty object on the context block', async () => {
    vi.useFakeTimers();
    const def = makeDef();
    mocks.requirementsRef.current = [def];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1' }], // no `data`
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });

    startRequirementPoller();
    await runOneTick();

    expect(def.check).toHaveBeenCalledTimes(1);
    const ctx = (def.check as any).mock.calls[0][0];
    expect(ctx.block.data).toEqual({});
  });

  it('returns early when the project lookup yields no organisation_id', async () => {
    vi.useFakeTimers();
    mocks.requirementsRef.current = [makeDef()];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: null });

    startRequirementPoller();
    await runOneTick();

    expect(mocks.getResourceMap).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });

  it('returns early when the project lookup returns null entirely', async () => {
    vi.useFakeTimers();
    mocks.requirementsRef.current = [makeDef()];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue(null);

    startRequirementPoller();
    await runOneTick();

    expect(mocks.getResourceMap).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });

  it('passes undefined providerId/gcpProject when the resource map has no entry for the node', async () => {
    vi.useFakeTimers();
    const def = makeDef();
    mocks.requirementsRef.current = [def];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });
    mocks.getResourceMap.mockResolvedValue(new Map());

    startRequirementPoller();
    await runOneTick();

    const ctx = (def.check as any).mock.calls[0][0];
    expect(ctx.gcpProject).toBeUndefined();
    expect(ctx.providerId).toBeUndefined();
    expect(ctx.certResourceName).toBeUndefined();
  });
});

describe('checkOne — verifyTimeoutMs path', () => {
  it('marks the row expired and skips check() when ageSinceFirstCheck exceeds verifyTimeoutMs', async () => {
    vi.useFakeTimers();
    const def = makeDef({ verifyTimeoutMs: 5 * 60_000 }); // 5 minutes
    mocks.requirementsRef.current = [def];
    // last_checked_at is 1 hour ago — way past the 5-minute timeout window
    mocks.findManyStatus.mockResolvedValue([
      makeRow({ last_checked_at: new Date(Date.now() - 60 * 60_000) }),
    ]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });

    startRequirementPoller();
    await runOneTick();

    expect(def.check).not.toHaveBeenCalled();
    expect(mocks.updateStatus).toHaveBeenCalledTimes(1);
    expect(mocks.updateStatus).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: { status: 'expired', last_checked_at: expect.any(Date) },
    });
    expect(mocks.emitDeployRequirementVerified).not.toHaveBeenCalled();
  });

  it('swallows errors raised by the expired-update prisma call (best-effort write)', async () => {
    vi.useFakeTimers();
    const def = makeDef({ verifyTimeoutMs: 5 * 60_000 });
    mocks.requirementsRef.current = [def];
    mocks.findManyStatus.mockResolvedValue([
      makeRow({ last_checked_at: new Date(Date.now() - 60 * 60_000) }),
    ]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.updateStatus.mockRejectedValueOnce(new Error('db transient'));

    startRequirementPoller();
    await runOneTick();

    expect(def.check).not.toHaveBeenCalled();
  });

  it('still runs check() when verifyTimeoutMs is undefined regardless of how old last_checked_at is', async () => {
    vi.useFakeTimers();
    const def = makeDef({ verifyTimeoutMs: undefined });
    mocks.requirementsRef.current = [def];
    mocks.findManyStatus.mockResolvedValue([
      makeRow({ last_checked_at: new Date(Date.now() - 60 * 60_000) }),
    ]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });

    startRequirementPoller();
    await runOneTick();

    expect(def.check).toHaveBeenCalledTimes(1);
  });
});

describe('checkOne — error handling on check()', () => {
  it('marks status unmet with the error message and skips the verified emit when check throws', async () => {
    vi.useFakeTimers();
    const def = makeDef({
      check: vi.fn(async () => {
        throw new Error('timeout calling resolver');
      }),
    });
    mocks.requirementsRef.current = [def];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });

    startRequirementPoller();
    await runOneTick();

    expect(mocks.updateStatus).toHaveBeenCalledTimes(1);
    expect(mocks.updateStatus).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: {
        status: 'unmet',
        message: 'Check failed: timeout calling resolver',
        last_checked_at: expect.any(Date),
      },
    });
    expect(mocks.emitDeployRequirementVerified).not.toHaveBeenCalled();
  });

  it('falls back to String(err) when check throws a non-Error', async () => {
    vi.useFakeTimers();
    const def = makeDef({
      check: vi.fn(async () => {
        // eslint-disable-next-line no-throw-literal
        throw 'resolver vomited a string';
      }),
    });
    mocks.requirementsRef.current = [def];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });

    startRequirementPoller();
    await runOneTick();

    expect(mocks.updateStatus).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: expect.objectContaining({
        status: 'unmet',
        message: 'Check failed: resolver vomited a string',
      }),
    });
  });

  it('swallows a secondary failure when the error-path prisma update itself rejects', async () => {
    vi.useFakeTimers();
    const def = makeDef({
      check: vi.fn(async () => {
        throw new Error('first failure');
      }),
    });
    mocks.requirementsRef.current = [def];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });
    mocks.updateStatus.mockRejectedValueOnce(new Error('db dead'));

    startRequirementPoller();
    await runOneTick();

    // The error-handler caught both the check failure AND the secondary
    // prisma update rejection.
    expect(mocks.updateStatus).toHaveBeenCalledTimes(1);
  });
});

describe('extractProject (via providerId in context)', () => {
  it('extracts the project segment from a projects/<project>/... providerId', async () => {
    vi.useFakeTimers();
    const def = makeDef();
    mocks.requirementsRef.current = [def];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });
    mocks.getResourceMap.mockResolvedValue(
      new Map([['node-1', { name: 'cert-x', type: 'gcp.compute.sslCertificate', providerId: 'projects/my-proj/global/sslCertificates/cert-x' }]]),
    );

    startRequirementPoller();
    await runOneTick();

    const ctx = (def.check as any).mock.calls[0][0];
    expect(ctx.gcpProject).toBe('my-proj');
  });

  it('returns undefined for non-projects/... providerId shapes (e.g. gs://bucket)', async () => {
    vi.useFakeTimers();
    const def = makeDef();
    mocks.requirementsRef.current = [def];
    mocks.findManyStatus.mockResolvedValue([makeRow()]);
    mocks.findUniqueCard.mockResolvedValue({
      id: 'card-1',
      project_id: 'project-1',
      nodes: [{ id: 'node-1', data: {} }],
    });
    mocks.findUniqueProject.mockResolvedValue({ organisation_id: 'org-1' });
    mocks.getResourceMap.mockResolvedValue(
      new Map([['node-1', { name: 'mybucket', type: 'gcp.storage.bucket', providerId: 'gs://mybucket' }]]),
    );

    startRequirementPoller();
    await runOneTick();

    const ctx = (def.check as any).mock.calls[0][0];
    expect(ctx.gcpProject).toBeUndefined();
    // certResourceName still set even if project extraction failed.
    expect(ctx.certResourceName).toBe('mybucket');
  });
});

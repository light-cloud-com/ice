/**
 * Tests for `deploy-event-log.ts` — the append-only narrative tape and
 * monotonic seq counter that the live wire emit shares with the
 * persistent log row. Covers:
 *
 * - `nextDeploySeq` allocation when a snapshot is open + null when not.
 * - `recordDeployEvent` queue + scheduled flush + batch-size flush.
 * - `flushDeployEvents` happy path + error swallow.
 * - `loadDeployEvents` empty / non-empty result branches.
 * - `findLatestDeploymentId` row found / null branches.
 * - `forgetDeploymentSeq` cleanup.
 * - `drainDeployEvents` clears the pending timer.
 *
 * The prisma client and the deploy-locks snapshot accessor are mocked so
 * each test can drive the in-memory state precisely. fakeTimers are used
 * for the FLUSH_INTERVAL_MS scheduling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  drainDeployEvents,
  findLatestDeploymentId,
  flushDeployEvents,
  forgetDeploymentSeq,
  loadDeployEvents,
  nextDeploySeq,
  recordDeployEvent,
} from '../deploy-event-log';

// Hoisted mock holders — vi.mock factories hoist above imports, so any
// reference inside the factory must come from `vi.hoisted` or the
// runtime hits a TDZ ReferenceError.
const mocks = vi.hoisted(() => ({
  createManyMock: vi.fn(),
  findManyMock: vi.fn(),
  findFirstMock: vi.fn(),
  getDeploySnapshotMock: vi.fn(),
}));

vi.mock('@ice/db', () => ({
  default: {
    deployEvent: {
      createMany: mocks.createManyMock,
      findMany: mocks.findManyMock,
    },
    canvasDeployment: {
      findFirst: mocks.findFirstMock,
    },
  },
}));

vi.mock('../deploy-locks', () => ({
  getDeploySnapshot: (cardId: string) => mocks.getDeploySnapshotMock(cardId),
}));

const { createManyMock, findManyMock, findFirstMock, getDeploySnapshotMock } = mocks;

beforeEach(async () => {
  vi.clearAllMocks();
  createManyMock.mockResolvedValue(undefined);
  findManyMock.mockResolvedValue([]);
  findFirstMock.mockResolvedValue(null);
  // Drain any leftover queue/timer from a previous test.
  await drainDeployEvents();
});

afterEach(async () => {
  vi.useRealTimers();
});

describe('nextDeploySeq', () => {
  it('returns null when no snapshot exists for the card', () => {
    getDeploySnapshotMock.mockReturnValue(undefined);
    expect(nextDeploySeq('card-no-snap')).toBeNull();
  });

  it('returns null when the snapshot has no deploymentId', () => {
    getDeploySnapshotMock.mockReturnValue({ cardId: 'card-1' });
    expect(nextDeploySeq('card-1')).toBeNull();
  });

  it('allocates 1 on the first call for a deployment', () => {
    getDeploySnapshotMock.mockReturnValue({ cardId: 'card-1', deploymentId: 'deploy-fresh' });
    expect(nextDeploySeq('card-1')).toBe(1);
  });

  it('increments monotonically for the same deployment', () => {
    getDeploySnapshotMock.mockReturnValue({ cardId: 'card-1', deploymentId: 'deploy-mono' });
    expect(nextDeploySeq('card-1')).toBe(1);
    expect(nextDeploySeq('card-1')).toBe(2);
    expect(nextDeploySeq('card-1')).toBe(3);
    forgetDeploymentSeq('deploy-mono');
  });

  it('keeps separate counters per deployment id', () => {
    getDeploySnapshotMock.mockReturnValueOnce({ cardId: 'a', deploymentId: 'deploy-A' });
    expect(nextDeploySeq('a')).toBe(1);
    getDeploySnapshotMock.mockReturnValueOnce({ cardId: 'b', deploymentId: 'deploy-B' });
    expect(nextDeploySeq('b')).toBe(1);
    getDeploySnapshotMock.mockReturnValueOnce({ cardId: 'a', deploymentId: 'deploy-A' });
    expect(nextDeploySeq('a')).toBe(2);
    forgetDeploymentSeq('deploy-A');
    forgetDeploymentSeq('deploy-B');
  });
});

describe('recordDeployEvent', () => {
  it('does nothing when the card has no active snapshot', () => {
    getDeploySnapshotMock.mockReturnValue(undefined);
    recordDeployEvent('card-no-snap', 1, 'log', { msg: 'noop' });
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it('does nothing when the snapshot has no deploymentId', () => {
    getDeploySnapshotMock.mockReturnValue({ cardId: 'card-1' });
    recordDeployEvent('card-1', 1, 'log', {});
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it('queues an event and flushes after FLUSH_INTERVAL_MS', async () => {
    vi.useFakeTimers();
    getDeploySnapshotMock.mockReturnValue({ cardId: 'card-1', deploymentId: 'deploy-flush-1' });
    recordDeployEvent('card-1', 1, 'log', { msg: 'one' });
    expect(createManyMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    // Flush now resolved; data shape is the persisted row.
    expect(createManyMock).toHaveBeenCalledTimes(1);
    expect(createManyMock.mock.calls[0][0]).toMatchObject({
      data: [
        {
          deployment_id: 'deploy-flush-1',
          card_id: 'card-1',
          seq: 1,
          type: 'log',
          payload: { msg: 'one' },
        },
      ],
    });
  });

  it('flushes immediately when the queue hits the 100-event batch size', async () => {
    getDeploySnapshotMock.mockReturnValue({ cardId: 'card-1', deploymentId: 'deploy-batch' });
    for (let i = 0; i < 99; i++) {
      recordDeployEvent('card-1', i + 1, 'log', { i });
    }
    expect(createManyMock).not.toHaveBeenCalled();
    // 100th push triggers the immediate flush path.
    recordDeployEvent('card-1', 100, 'log', { i: 99 });
    // The flush is awaited via `void`, so we wait a microtask.
    await new Promise((r) => setTimeout(r, 0));
    expect(createManyMock).toHaveBeenCalledTimes(1);
    const rows = createManyMock.mock.calls[0][0].data;
    expect(rows).toHaveLength(100);
  });

  it('does not double-schedule a flush timer when called twice in a tick', async () => {
    vi.useFakeTimers();
    getDeploySnapshotMock.mockReturnValue({ cardId: 'card-1', deploymentId: 'deploy-double' });
    recordDeployEvent('card-1', 1, 'log', { i: 1 });
    recordDeployEvent('card-1', 2, 'log', { i: 2 });
    await vi.advanceTimersByTimeAsync(250);
    // Both events flushed in one createMany call (single timer fired).
    expect(createManyMock).toHaveBeenCalledTimes(1);
    expect(createManyMock.mock.calls[0][0].data).toHaveLength(2);
  });
});

describe('flushDeployEvents', () => {
  it('returns early when the queue is empty', async () => {
    await flushDeployEvents();
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it('swallows DB errors with a console.warn — never breaks the deploy', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createManyMock.mockRejectedValueOnce(new Error('DB down'));
    getDeploySnapshotMock.mockReturnValue({ cardId: 'card-1', deploymentId: 'deploy-err' });
    recordDeployEvent('card-1', 1, 'log', {});
    await flushDeployEvents();
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0])).toContain('flush failed');
    warnSpy.mockRestore();
  });
});

describe('loadDeployEvents', () => {
  it('returns the rows + the seq of the last row when results are non-empty', async () => {
    findManyMock.mockResolvedValueOnce([
      { seq: 5, type: 'log', payload: {}, created_at: new Date() },
      { seq: 6, type: 'node_status', payload: {}, created_at: new Date() },
      { seq: 7, type: 'complete', payload: {}, created_at: new Date() },
    ]);
    const out = await loadDeployEvents('deploy-1', 4);
    expect(out.events).toHaveLength(3);
    expect(out.latestSeq).toBe(7);
    // Verify the prisma where-clause matches the seq cursor.
    expect(findManyMock.mock.calls[0][0]).toMatchObject({
      where: { deployment_id: 'deploy-1', seq: { gt: 4 } },
    });
  });

  it('returns the `since` value when no rows match the cursor', async () => {
    findManyMock.mockResolvedValueOnce([]);
    const out = await loadDeployEvents('deploy-1', 9);
    expect(out.events).toHaveLength(0);
    expect(out.latestSeq).toBe(9);
  });

  it('defaults `since` to 0 when omitted', async () => {
    findManyMock.mockResolvedValueOnce([]);
    const out = await loadDeployEvents('deploy-1');
    expect(out.latestSeq).toBe(0);
    expect(findManyMock.mock.calls[0][0]).toMatchObject({
      where: { seq: { gt: 0 } },
    });
  });
});

describe('findLatestDeploymentId', () => {
  it('returns the row id when one exists', async () => {
    findFirstMock.mockResolvedValueOnce({ id: 'deploy-latest-7' });
    expect(await findLatestDeploymentId('card-1')).toBe('deploy-latest-7');
  });

  it('returns null when no rows exist for the card', async () => {
    findFirstMock.mockResolvedValueOnce(null);
    expect(await findLatestDeploymentId('card-1')).toBeNull();
  });

  it('returns null when the row id is empty (defensive)', async () => {
    findFirstMock.mockResolvedValueOnce({ id: '' });
    expect(await findLatestDeploymentId('card-1')).toBeNull();
  });
});

describe('forgetDeploymentSeq', () => {
  it('removes the deployment counter so future allocations restart at 1', () => {
    getDeploySnapshotMock.mockReturnValue({ cardId: 'a', deploymentId: 'deploy-recycle' });
    expect(nextDeploySeq('a')).toBe(1);
    expect(nextDeploySeq('a')).toBe(2);
    forgetDeploymentSeq('deploy-recycle');
    expect(nextDeploySeq('a')).toBe(1);
    forgetDeploymentSeq('deploy-recycle');
  });
});

describe('drainDeployEvents', () => {
  it('cancels the pending flush timer and forces a final flush', async () => {
    vi.useFakeTimers();
    getDeploySnapshotMock.mockReturnValue({ cardId: 'card-1', deploymentId: 'deploy-drain-1' });
    recordDeployEvent('card-1', 1, 'log', {});
    // Timer set; not yet fired.
    expect(createManyMock).not.toHaveBeenCalled();
    await drainDeployEvents();
    // drain forced an immediate flush.
    expect(createManyMock).toHaveBeenCalledTimes(1);
    // Advance past the original 250ms — the timer is gone, so no second flush.
    await vi.advanceTimersByTimeAsync(500);
    expect(createManyMock).toHaveBeenCalledTimes(1);
  });

  it('returns silently when no timer is pending and the queue is empty', async () => {
    await drainDeployEvents();
    expect(createManyMock).not.toHaveBeenCalled();
  });
});

/**
 * Unit tests for `services/deploy/src/services/snapshot-persister.ts` —
 * the throttled DB-write hook + on-demand flush extracted in rf-deploy-7
 * from the deploy.service.ts orchestrator.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 *
 * Per `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * console spies are torn down via `vi.restoreAllMocks()` in `afterEach`.
 *
 * Per `vi-fn-default-type-rejects-typed-callback-parameter`, the captured
 * callback variable is annotated with the explicit signature rather than
 * the bare `vi.Mock` shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type SnapshotCallback = (snapshot: any) => void;
let capturedCallback: SnapshotCallback | null = null;

vi.mock('../deploy-locks', () => ({
  setSnapshotPersister: vi.fn((cb: SnapshotCallback) => {
    capturedCallback = cb;
  }),
  getDeploySnapshot: vi.fn(),
}));

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      update: vi.fn(),
    },
  },
}));

import { installSnapshotPersister, flushSnapshotNow } from '../snapshot-persister';
import * as deployLocks from '../deploy-locks';
// @ts-ignore — resolved at runtime via pnpm workspace; mocked above
import prismaModule from '@ice/db';

const setSnapshotPersisterMock = (deployLocks as any).setSnapshotPersister as ReturnType<typeof vi.fn>;
const getDeploySnapshotMock = (deployLocks as any).getDeploySnapshot as ReturnType<typeof vi.fn>;
const updateMock = (prismaModule as any).canvasDeployment.update as ReturnType<typeof vi.fn>;

describe('snapshot-persister', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    capturedCallback = null;
    // Default success case for the prisma update (tests that need rejection
    // override per-call).
    updateMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('installSnapshotPersister', () => {
    it('registers a callback via setSnapshotPersister', () => {
      installSnapshotPersister();
      expect(setSnapshotPersisterMock).toHaveBeenCalledTimes(1);
      expect(setSnapshotPersisterMock).toHaveBeenCalledWith(expect.any(Function));
      expect(capturedCallback).toBeTypeOf('function');
    });
  });

  describe('throttled callback', () => {
    it('is a no-op when snapshot.deploymentId is undefined', () => {
      installSnapshotPersister();
      capturedCallback!({ cardId: 'card-1', deploymentId: undefined });
      // Advance well past the throttle window — nothing should fire.
      vi.advanceTimersByTime(1000);
      expect(updateMock).not.toHaveBeenCalled();
      expect(getDeploySnapshotMock).not.toHaveBeenCalled();
    });

    it('schedules a 500ms timer and calls prisma.canvasDeployment.update with the latest snapshot', async () => {
      installSnapshotPersister();
      const latest = {
        cardId: 'card-1',
        deploymentId: 'dep-1',
        nodeStatuses: { foo: 'queued' },
      };
      getDeploySnapshotMock.mockReturnValue(latest);

      capturedCallback!({ cardId: 'card-1', deploymentId: 'dep-1' });
      // Before the timer fires, no DB write yet.
      expect(updateMock).not.toHaveBeenCalled();

      // Advance just past the 500ms throttle window.
      await vi.advanceTimersByTimeAsync(500);

      expect(getDeploySnapshotMock).toHaveBeenCalledWith('card-1');
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'dep-1' },
        data: { snapshot: latest },
      });
    });

    it('does NOT schedule a second timer when called again within the throttle window', async () => {
      installSnapshotPersister();
      const latest = { cardId: 'card-1', deploymentId: 'dep-1' };
      getDeploySnapshotMock.mockReturnValue(latest);

      capturedCallback!({ cardId: 'card-1', deploymentId: 'dep-1' });
      // Second call within the window — should be a no-op (short-circuit on
      // pendingSnapshotWrites.has).
      capturedCallback!({ cardId: 'card-1', deploymentId: 'dep-1' });

      await vi.advanceTimersByTimeAsync(500);

      // Only ONE update should fire even though the callback was invoked twice.
      expect(updateMock).toHaveBeenCalledTimes(1);
    });

    it('schedules a fresh timer after the previous one fires (map cleanup at the start of the timer callback)', async () => {
      installSnapshotPersister();
      const latest = { cardId: 'card-1', deploymentId: 'dep-1' };
      getDeploySnapshotMock.mockReturnValue(latest);

      capturedCallback!({ cardId: 'card-1', deploymentId: 'dep-1' });
      await vi.advanceTimersByTimeAsync(500);
      expect(updateMock).toHaveBeenCalledTimes(1);

      // The map should be empty again — a second call schedules a fresh timer.
      capturedCallback!({ cardId: 'card-1', deploymentId: 'dep-1' });
      await vi.advanceTimersByTimeAsync(500);
      expect(updateMock).toHaveBeenCalledTimes(2);
    });

    it('emits the [snapshot-persist] write failed: console.warn when the DB update rejects', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      installSnapshotPersister();
      const latest = { cardId: 'card-1', deploymentId: 'dep-1' };
      getDeploySnapshotMock.mockReturnValue(latest);
      updateMock.mockRejectedValueOnce(new Error('boom'));

      capturedCallback!({ cardId: 'card-1', deploymentId: 'dep-1' });
      await vi.advanceTimersByTimeAsync(500);
      // Let the rejection's microtask settle.
      await vi.advanceTimersByTimeAsync(0);

      expect(warnSpy).toHaveBeenCalledWith('[snapshot-persist] write failed:', 'boom');
    });

    it('skips the DB write when the latest snapshot has no deploymentId', async () => {
      installSnapshotPersister();
      // The IIFE callback stores cardId from the inbound snapshot, but the
      // throttled timer reads `latest = getDeploySnapshot(cardId)` and
      // short-circuits on `latest?.deploymentId`. Simulate the deploy
      // finishing between the schedule and the timer firing — the snapshot
      // has been cleared/replaced and `deploymentId` is gone.
      getDeploySnapshotMock.mockReturnValue({ cardId: 'card-1' });

      capturedCallback!({ cardId: 'card-1', deploymentId: 'dep-1' });
      await vi.advanceTimersByTimeAsync(500);

      expect(getDeploySnapshotMock).toHaveBeenCalledWith('card-1');
      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  describe('flushSnapshotNow', () => {
    it('clears any pending timer and awaits a fresh DB write with the latest snapshot', async () => {
      installSnapshotPersister();
      const latest = { cardId: 'card-2', deploymentId: 'dep-2', nodeStatuses: {} };
      getDeploySnapshotMock.mockReturnValue(latest);

      // Schedule a throttled write — but flush before the timer fires.
      capturedCallback!({ cardId: 'card-2', deploymentId: 'dep-2' });

      await flushSnapshotNow('card-2');

      // The flush wrote ONCE.
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'dep-2' },
        data: { snapshot: latest },
      });

      // The pending timer was cleared — advancing time past the throttle
      // shouldn't trigger a second write.
      await vi.advanceTimersByTimeAsync(1000);
      expect(updateMock).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when there is no pending timer and getDeploySnapshot returns nothing', async () => {
      installSnapshotPersister();
      getDeploySnapshotMock.mockReturnValue(undefined);

      await flushSnapshotNow('card-3');

      expect(updateMock).not.toHaveBeenCalled();
    });

    it('swallows DB errors with the [snapshot-persist] final flush failed: console.warn', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      installSnapshotPersister();
      getDeploySnapshotMock.mockReturnValue({ cardId: 'card-4', deploymentId: 'dep-4' });
      updateMock.mockRejectedValueOnce(new Error('db down'));

      await flushSnapshotNow('card-4');

      expect(warnSpy).toHaveBeenCalledWith('[snapshot-persist] final flush failed:', 'db down');
    });
  });
});

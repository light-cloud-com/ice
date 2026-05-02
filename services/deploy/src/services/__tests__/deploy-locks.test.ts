/**
 * Tests for `deploy-locks.ts` — the in-memory per-card lock registry,
 * temp-dir registry, and progress snapshot. Each region of the file
 * is its own describe block: lock acquisition + release + cancel,
 * temp-dir registration + cleanup, and the snapshot lifecycle
 * (start → update → finish + grace-period delete via fakeTimers).
 *
 * The fs.rmSync calls are mocked so the temp-dir tests can drive
 * both the success path and the error-swallow path without touching
 * the real filesystem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const rmSyncMock = vi.fn();
vi.mock('fs', () => ({
  default: { rmSync: (...args: any[]) => rmSyncMock(...args) },
}));

import {
  acquireDeployLock,
  cancelDeploy,
  cleanupAllTempDirs,
  clearDeploySnapshot,
  DeployLockError,
  finishDeploySnapshot,
  getDeploySnapshot,
  isDeployInFlight,
  registerTempDir,
  releaseTempDir,
  setSnapshotPersister,
  startDeploySnapshot,
  updateDeploySnapshotNode,
  _getRegisteredTempDirs,
} from '../deploy-locks.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Drain the registries between tests — module-level Maps/Sets persist.
  for (const dir of _getRegisteredTempDirs()) releaseTempDir(dir);
  // Drain any leftover snapshots / locks: each card is per-test.
  // (Individual tests release their own locks; this guards against test crashes.)
});

afterEach(() => {
  setSnapshotPersister(null);
});

describe('acquireDeployLock', () => {
  it('returns a release function and abort signal for a new card+operation', () => {
    const lock = acquireDeployLock('card-A', 'apply');
    expect(typeof lock.release).toBe('function');
    expect(lock.signal).toBeInstanceOf(AbortSignal);
    expect(lock.signal.aborted).toBe(false);
    lock.release();
  });

  it('records the lock as in-flight until released', () => {
    const lock = acquireDeployLock('card-A', 'apply');
    expect(isDeployInFlight('card-A', 'apply')).toBe(true);
    lock.release();
    expect(isDeployInFlight('card-A', 'apply')).toBe(false);
  });

  it('throws DeployLockError when the same (card, operation) is already locked', () => {
    const lock = acquireDeployLock('card-A', 'apply');
    expect(() => acquireDeployLock('card-A', 'apply')).toThrow(DeployLockError);
    try {
      acquireDeployLock('card-A', 'apply');
    } catch (err) {
      expect(err).toBeInstanceOf(DeployLockError);
      expect((err as DeployLockError).code).toBe('DEPLOY_IN_FLIGHT');
      expect((err as Error).message).toContain('card-A');
      expect((err as Error).message).toContain('apply');
    }
    lock.release();
  });

  it('allows different operations on the same card concurrently', () => {
    const a = acquireDeployLock('card-A', 'apply');
    const b = acquireDeployLock('card-A', 'destroy');
    expect(isDeployInFlight('card-A', 'apply')).toBe(true);
    expect(isDeployInFlight('card-A', 'destroy')).toBe(true);
    a.release();
    b.release();
  });

  it('allows the same operation on different cards concurrently', () => {
    const a = acquireDeployLock('card-A', 'apply');
    const b = acquireDeployLock('card-B', 'apply');
    expect(isDeployInFlight('card-A', 'apply')).toBe(true);
    expect(isDeployInFlight('card-B', 'apply')).toBe(true);
    a.release();
    b.release();
  });

  it('release is idempotent — calling it twice does not break the next acquire', () => {
    const lock = acquireDeployLock('card-A', 'apply');
    lock.release();
    lock.release(); // no-op second call
    expect(isDeployInFlight('card-A', 'apply')).toBe(false);
    const second = acquireDeployLock('card-A', 'apply');
    second.release();
  });

  it('release does not delete a newer lock if one was acquired after release path raced', () => {
    // This guards the `entry.controller === controller` check — a stale
    // release must not delete a NEW lock entry that another acquire
    // installed under the same key.
    const first = acquireDeployLock('card-A', 'apply');
    first.release();
    const second = acquireDeployLock('card-A', 'apply');
    // Calling first.release() again must not delete `second`.
    first.release();
    expect(isDeployInFlight('card-A', 'apply')).toBe(true);
    second.release();
  });
});

describe('cancelDeploy', () => {
  it('aborts whichever apply, rollback, or destroy is in-flight and returns true', () => {
    const lock = acquireDeployLock('card-A', 'apply');
    expect(lock.signal.aborted).toBe(false);
    const cancelled = cancelDeploy('card-A');
    expect(cancelled).toBe(true);
    expect(lock.signal.aborted).toBe(true);
    lock.release();
  });

  it('cancels both apply and rollback when both are concurrently held', () => {
    const a = acquireDeployLock('card-A', 'apply');
    const r = acquireDeployLock('card-A', 'rollback');
    const cancelled = cancelDeploy('card-A');
    expect(cancelled).toBe(true);
    expect(a.signal.aborted).toBe(true);
    expect(r.signal.aborted).toBe(true);
    a.release();
    r.release();
  });

  it('returns false when no operation is in-flight for the card', () => {
    expect(cancelDeploy('nonexistent-card')).toBe(false);
  });
});

describe('registerTempDir / releaseTempDir', () => {
  it('registers a non-empty dir', () => {
    registerTempDir('/tmp/ice-1');
    expect(_getRegisteredTempDirs()).toContain('/tmp/ice-1');
  });

  it('ignores an empty-string dir (defensive guard)', () => {
    registerTempDir('');
    expect(_getRegisteredTempDirs()).not.toContain('');
  });

  it('releases a registered dir and rmSync is called once', () => {
    registerTempDir('/tmp/ice-2');
    releaseTempDir('/tmp/ice-2');
    expect(rmSyncMock).toHaveBeenCalledWith('/tmp/ice-2', { recursive: true, force: true });
    expect(_getRegisteredTempDirs()).not.toContain('/tmp/ice-2');
  });

  it('returns early on undefined input — rmSync is not called', () => {
    releaseTempDir(undefined);
    expect(rmSyncMock).not.toHaveBeenCalled();
  });

  it('swallows rmSync errors silently', () => {
    rmSyncMock.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });
    registerTempDir('/tmp/ice-3');
    expect(() => releaseTempDir('/tmp/ice-3')).not.toThrow();
    // Even when rmSync throws, the dir is removed from the registry.
    expect(_getRegisteredTempDirs()).not.toContain('/tmp/ice-3');
  });
});

describe('cleanupAllTempDirs', () => {
  it('removes every registered dir and clears the registry', () => {
    registerTempDir('/tmp/ice-A');
    registerTempDir('/tmp/ice-B');
    cleanupAllTempDirs();
    expect(rmSyncMock).toHaveBeenCalledTimes(2);
    expect(_getRegisteredTempDirs()).toEqual([]);
  });

  it('continues clearing dirs even when one rmSync throws', () => {
    rmSyncMock.mockImplementationOnce(() => {
      throw new Error('EACCES on first dir');
    });
    registerTempDir('/tmp/ice-C');
    registerTempDir('/tmp/ice-D');
    expect(() => cleanupAllTempDirs()).not.toThrow();
    // Both calls happened; both dirs cleared from the set.
    expect(rmSyncMock).toHaveBeenCalledTimes(2);
    expect(_getRegisteredTempDirs()).toEqual([]);
  });

  it('is a no-op when nothing is registered', () => {
    cleanupAllTempDirs();
    expect(rmSyncMock).not.toHaveBeenCalled();
  });
});

describe('snapshot lifecycle', () => {
  it('startDeploySnapshot creates a snapshot with status=deploying', () => {
    startDeploySnapshot('card-snap-1', 'deploy-1');
    const snap = getDeploySnapshot('card-snap-1');
    expect(snap?.status).toBe('deploying');
    expect(snap?.deploymentId).toBe('deploy-1');
    expect(snap?.nodeStatuses).toEqual({});
    expect(typeof snap?.startedAt).toBe('string');
    expect(snap?.updatedAt).toBe(snap?.startedAt);
    clearDeploySnapshot('card-snap-1');
  });

  it('startDeploySnapshot supports a missing deploymentId', () => {
    startDeploySnapshot('card-snap-no-id');
    expect(getDeploySnapshot('card-snap-no-id')?.deploymentId).toBeUndefined();
    clearDeploySnapshot('card-snap-no-id');
  });

  it('updateDeploySnapshotNode writes the per-node status and step', () => {
    startDeploySnapshot('card-snap-2', 'deploy-2');
    updateDeploySnapshotNode('card-snap-2', 'node-A', 'deploying', {
      label: 'Pushing image',
      index: 1,
      total: 3,
    });
    const snap = getDeploySnapshot('card-snap-2');
    expect(snap?.nodeStatuses['node-A']).toEqual({
      deploy_status: 'deploying',
      step: { label: 'Pushing image', index: 1, total: 3 },
    });
    clearDeploySnapshot('card-snap-2');
  });

  it('updateDeploySnapshotNode without a step writes step=undefined', () => {
    startDeploySnapshot('card-snap-2b', 'deploy-2b');
    updateDeploySnapshotNode('card-snap-2b', 'node-A', 'queued');
    expect(getDeploySnapshot('card-snap-2b')?.nodeStatuses['node-A']).toEqual({
      deploy_status: 'queued',
      step: undefined,
    });
    clearDeploySnapshot('card-snap-2b');
  });

  it('updateDeploySnapshotNode is a no-op when no snapshot exists for the card', () => {
    updateDeploySnapshotNode('nonexistent-card', 'node-A', 'deploying');
    expect(getDeploySnapshot('nonexistent-card')).toBeUndefined();
  });

  it('finishDeploySnapshot flips the status to the terminal value', () => {
    startDeploySnapshot('card-snap-3', 'deploy-3');
    finishDeploySnapshot('card-snap-3', 'success');
    expect(getDeploySnapshot('card-snap-3')?.status).toBe('success');
    clearDeploySnapshot('card-snap-3');
  });

  it('finishDeploySnapshot is a no-op when no snapshot exists', () => {
    expect(() => finishDeploySnapshot('nonexistent-card', 'failed')).not.toThrow();
    expect(getDeploySnapshot('nonexistent-card')).toBeUndefined();
  });

  it('finishDeploySnapshot deletes the snapshot 60s later (grace window)', () => {
    vi.useFakeTimers();
    startDeploySnapshot('card-snap-4', 'deploy-4');
    finishDeploySnapshot('card-snap-4', 'success');
    expect(getDeploySnapshot('card-snap-4')?.status).toBe('success');
    vi.advanceTimersByTime(60_000 + 1);
    expect(getDeploySnapshot('card-snap-4')).toBeUndefined();
    vi.useRealTimers();
  });

  it('grace-period cleanup leaves snapshots that have been re-opened (status flipped back to deploying)', () => {
    // The cleanup callback re-checks status before deleting; if a new
    // deploy started between finish and the timer firing, its snapshot
    // (status=deploying) must not be wiped. That guard is the
    // `still.status !== 'deploying'` check on line 214.
    vi.useFakeTimers();
    startDeploySnapshot('card-snap-5', 'deploy-5');
    finishDeploySnapshot('card-snap-5', 'success');
    // 30s in, a fresh deploy starts (snapshot reset to 'deploying').
    vi.advanceTimersByTime(30_000);
    startDeploySnapshot('card-snap-5', 'deploy-5b');
    expect(getDeploySnapshot('card-snap-5')?.status).toBe('deploying');
    // Original 60s timer fires — must NOT delete the new snapshot.
    vi.advanceTimersByTime(35_000);
    expect(getDeploySnapshot('card-snap-5')?.status).toBe('deploying');
    vi.useRealTimers();
    clearDeploySnapshot('card-snap-5');
  });

  it('grace-period cleanup leaves nothing to delete when card was already cleared', () => {
    vi.useFakeTimers();
    startDeploySnapshot('card-snap-6', 'deploy-6');
    finishDeploySnapshot('card-snap-6', 'failed');
    clearDeploySnapshot('card-snap-6');
    expect(() => vi.advanceTimersByTime(60_001)).not.toThrow();
    vi.useRealTimers();
  });

  it('clearDeploySnapshot drops the snapshot immediately', () => {
    startDeploySnapshot('card-snap-7', 'deploy-7');
    clearDeploySnapshot('card-snap-7');
    expect(getDeploySnapshot('card-snap-7')).toBeUndefined();
  });
});

describe('snapshot persister hook', () => {
  it('startDeploySnapshot calls the persister when one is set', () => {
    const persister = vi.fn();
    setSnapshotPersister(persister);
    startDeploySnapshot('card-persist-1', 'deploy-p1');
    expect(persister).toHaveBeenCalledTimes(1);
    expect(persister.mock.calls[0][0]).toMatchObject({
      cardId: 'card-persist-1',
      status: 'deploying',
      deploymentId: 'deploy-p1',
    });
    clearDeploySnapshot('card-persist-1');
  });

  it('updateDeploySnapshotNode and finishDeploySnapshot call the persister', () => {
    const persister = vi.fn();
    setSnapshotPersister(persister);
    startDeploySnapshot('card-persist-2', 'deploy-p2');
    updateDeploySnapshotNode('card-persist-2', 'node-A', 'deploying');
    finishDeploySnapshot('card-persist-2', 'success');
    expect(persister).toHaveBeenCalledTimes(3);
    clearDeploySnapshot('card-persist-2');
  });

  it('persister errors do not break the live emit path', () => {
    const persister = vi.fn(() => {
      throw new Error('DB down');
    });
    setSnapshotPersister(persister);
    expect(() => startDeploySnapshot('card-persist-3', 'deploy-p3')).not.toThrow();
    expect(getDeploySnapshot('card-persist-3')?.status).toBe('deploying');
    expect(() => updateDeploySnapshotNode('card-persist-3', 'node-A', 'failed')).not.toThrow();
    expect(() => finishDeploySnapshot('card-persist-3', 'failed')).not.toThrow();
    clearDeploySnapshot('card-persist-3');
  });

  it('setSnapshotPersister(null) clears the hook so subsequent writes do not call it', () => {
    const persister = vi.fn();
    setSnapshotPersister(persister);
    setSnapshotPersister(null);
    startDeploySnapshot('card-persist-4', 'deploy-p4');
    expect(persister).not.toHaveBeenCalled();
    clearDeploySnapshot('card-persist-4');
  });
});

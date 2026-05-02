/**
 * Unit tests for `services/deploy/src/services/deploy.service.ts` —
 * the thin orchestrator left behind after the rf-deploy2 series. The
 * file is now mostly a re-export shim plus four DB-touching helpers
 * (`getDeploymentStatus`, `getDeployedResources`, `getDeploymentHistory`)
 * and the in-memory snapshot accessors (`requestDeployCancel`,
 * `getCurrentDeploySnapshot`).
 *
 * The module-load side effect (`installSnapshotPersister()`) is mocked
 * out — we only assert that import time wires the persister exactly
 * once.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest
 * globals are imported explicitly. Per
 * `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * mocks are cleared in `beforeEach`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // prisma
  cdFindUnique: vi.fn(),
  cdFindFirst: vi.fn(),
  cdFindMany: vi.fn(),
  // deploy-locks
  cancelDeploy: vi.fn(),
  getDeploySnapshot: vi.fn(),
  // snapshot-persister — `installSnapshotPersister` runs at module load,
  // before vitest gives us a beforeEach hook to clear mocks. We track
  // import-time invocation in a stable boolean so the assertion isn't
  // wiped by `clearAllMocks`.
  installSnapshotPersister: vi.fn(),
  loadFlags: { installCalled: false },
}));

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      findUnique: mocks.cdFindUnique,
      findFirst: mocks.cdFindFirst,
      findMany: mocks.cdFindMany,
    },
  },
}));

vi.mock('../deploy-locks.js', () => ({
  cancelDeploy: mocks.cancelDeploy,
  getDeploySnapshot: mocks.getDeploySnapshot,
}));

vi.mock('../snapshot-persister.js', () => ({
  installSnapshotPersister: () => {
    mocks.loadFlags.installCalled = true;
    mocks.installSnapshotPersister();
  },
}));

// The re-exports are pulled from sibling modules — stub each so the
// import resolves without dragging in their dependency graphs. The
// re-export *identity* is what we assert against.
vi.mock('../plan-deployment.js', () => ({
  planDeployment: vi.fn(),
}));

vi.mock('../apply-deployment.js', () => ({
  applyDeployment: vi.fn(),
}));

vi.mock('../destroy-all-for-card.js', () => ({
  destroyAllForCard: vi.fn(),
}));

vi.mock('../destroy-deployment.js', () => ({
  destroyDeployment: vi.fn(),
}));

vi.mock('../rollback-deployment.js', () => ({
  rollbackDeployment: vi.fn(),
}));

vi.mock('../canvas-overlay.js', () => ({
  getNodeDeploymentOverlay: vi.fn(),
}));

vi.mock('../drift.service.js', () => ({
  checkDrift: vi.fn(),
}));

import * as deployService from '../deploy.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deploy.service module load', () => {
  it('installs the snapshot persister at import time so refreshed pages can read live progress', () => {
    // The module-load side effect ran when the test file imported the
    // SUT. The flag is set in the mock factory and survives
    // `clearAllMocks`.
    expect(mocks.loadFlags.installCalled).toBe(true);
  });
});

describe('requestDeployCancel', () => {
  it('returns true when the underlying lock-machinery cancels an in-flight deploy', () => {
    mocks.cancelDeploy.mockReturnValueOnce(true);
    expect(deployService.requestDeployCancel('card-A')).toBe(true);
    expect(mocks.cancelDeploy).toHaveBeenCalledWith('card-A');
  });

  it('returns false when there is no in-flight deploy to cancel', () => {
    mocks.cancelDeploy.mockReturnValueOnce(false);
    expect(deployService.requestDeployCancel('card-X')).toBe(false);
  });
});

describe('getCurrentDeploySnapshot', () => {
  it('returns the in-memory snapshot for the given card', () => {
    const snap = { deploymentId: 'd1', status: 'deploying' };
    mocks.getDeploySnapshot.mockReturnValueOnce(snap as any);
    expect(deployService.getCurrentDeploySnapshot('card-A')).toBe(snap);
    expect(mocks.getDeploySnapshot).toHaveBeenCalledWith('card-A');
  });

  it('returns undefined when no snapshot is registered', () => {
    mocks.getDeploySnapshot.mockReturnValueOnce(undefined);
    expect(deployService.getCurrentDeploySnapshot('card-X')).toBeUndefined();
  });
});

describe('getDeploymentStatus', () => {
  it('queries canvasDeployment by primary key', async () => {
    const row = { id: 'deploy-1', status: 'success' };
    mocks.cdFindUnique.mockResolvedValueOnce(row as any);
    const out = await deployService.getDeploymentStatus('deploy-1');
    expect(out).toBe(row);
    expect(mocks.cdFindUnique).toHaveBeenCalledWith({ where: { id: 'deploy-1' } });
  });

  it('returns null when the deployment does not exist', async () => {
    mocks.cdFindUnique.mockResolvedValueOnce(null);
    const out = await deployService.getDeploymentStatus('missing');
    expect(out).toBeNull();
  });
});

describe('getDeployedResources', () => {
  it('returns the results array of the most recent successful deployment for a card', async () => {
    const results = [{ name: 'r1', success: true }];
    mocks.cdFindFirst.mockResolvedValueOnce({ id: 'd1', results } as any);
    const out = await deployService.getDeployedResources('card-A');
    expect(out).toBe(results);
    expect(mocks.cdFindFirst).toHaveBeenCalledWith({
      where: { card_id: 'card-A', status: 'success' },
      orderBy: { created_at: 'desc' },
    });
  });

  it('returns [] when there is no successful deployment', async () => {
    mocks.cdFindFirst.mockResolvedValueOnce(null);
    const out = await deployService.getDeployedResources('card-A');
    expect(out).toEqual([]);
  });

  it('returns [] when the deployment row exists but results is null', async () => {
    mocks.cdFindFirst.mockResolvedValueOnce({ id: 'd1', results: null } as any);
    const out = await deployService.getDeployedResources('card-A');
    expect(out).toEqual([]);
  });

  it('returns [] when the deployment row exists but results is undefined', async () => {
    mocks.cdFindFirst.mockResolvedValueOnce({ id: 'd1' } as any);
    const out = await deployService.getDeployedResources('card-A');
    expect(out).toEqual([]);
  });
});

describe('getDeploymentHistory', () => {
  it('queries by card with default limit=100 when no options are provided', async () => {
    mocks.cdFindMany.mockResolvedValueOnce([]);
    await deployService.getDeploymentHistory('card-A');
    expect(mocks.cdFindMany).toHaveBeenCalledWith({
      where: { card_id: 'card-A' },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
  });

  it('passes through environment and actionType filters when provided', async () => {
    mocks.cdFindMany.mockResolvedValueOnce([]);
    await deployService.getDeploymentHistory('card-A', {
      environment: 'production',
      actionType: 'apply',
      limit: 50,
    });
    expect(mocks.cdFindMany).toHaveBeenCalledWith({
      where: { card_id: 'card-A', environment: 'production', action_type: 'apply' },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  });

  it('omits the environment filter when it is undefined', async () => {
    mocks.cdFindMany.mockResolvedValueOnce([]);
    await deployService.getDeploymentHistory('card-A', { actionType: 'plan' });
    const where = mocks.cdFindMany.mock.calls[0]![0].where;
    expect(where).not.toHaveProperty('environment');
    expect(where.action_type).toBe('plan');
  });

  it('omits the actionType filter when it is undefined', async () => {
    mocks.cdFindMany.mockResolvedValueOnce([]);
    await deployService.getDeploymentHistory('card-A', { environment: 'staging' });
    const where = mocks.cdFindMany.mock.calls[0]![0].where;
    expect(where).not.toHaveProperty('action_type');
    expect(where.environment).toBe('staging');
  });

  it('caps limit at 500 when the caller asks for more', async () => {
    mocks.cdFindMany.mockResolvedValueOnce([]);
    await deployService.getDeploymentHistory('card-A', { limit: 9999 });
    expect(mocks.cdFindMany.mock.calls[0]![0].take).toBe(500);
  });

  it('floors limit at 1 when the caller asks for less', async () => {
    mocks.cdFindMany.mockResolvedValueOnce([]);
    await deployService.getDeploymentHistory('card-A', { limit: 0 });
    expect(mocks.cdFindMany.mock.calls[0]![0].take).toBe(1);
  });

  it('floors negative limits at 1 (Math.max guard)', async () => {
    mocks.cdFindMany.mockResolvedValueOnce([]);
    await deployService.getDeploymentHistory('card-A', { limit: -10 });
    expect(mocks.cdFindMany.mock.calls[0]![0].take).toBe(1);
  });
});

describe('deploy.service re-exports', () => {
  it('re-exports planDeployment from ./plan-deployment.js so namespace imports keep resolving', () => {
    expect(typeof deployService.planDeployment).toBe('function');
  });

  it('re-exports applyDeployment from ./apply-deployment.js for queue.service callers', () => {
    expect(typeof deployService.applyDeployment).toBe('function');
  });

  it('re-exports destroyAllForCard from ./destroy-all-for-card.js for canvas-deploy routes', () => {
    expect(typeof deployService.destroyAllForCard).toBe('function');
  });

  it('re-exports destroyDeployment from ./destroy-deployment.js for canvas-deploy routes', () => {
    expect(typeof deployService.destroyDeployment).toBe('function');
  });

  it('re-exports rollbackDeployment from ./rollback-deployment.js for canvas-deploy routes', () => {
    expect(typeof deployService.rollbackDeployment).toBe('function');
  });

  it('re-exports getNodeDeploymentOverlay from ./canvas-overlay.js for canvas-deploy routes', () => {
    expect(typeof deployService.getNodeDeploymentOverlay).toBe('function');
  });

  it('re-exports checkDrift from ./drift.service.js for the public deploy index', () => {
    expect(typeof deployService.checkDrift).toBe('function');
  });
});

/**
 * Tests for `destroy-all-for-card.ts` — the "nuke" path. Validation
 * gates: empty targets short-circuit, no credentials, no resolvable
 * project. Loop branches: success / soft-failure / mixed outcome.
 * Catch path: post-loop prisma update throws → snapshot flips to
 * 'failed' and DB update fallback runs without the original error
 * being swallowed.
 *
 * The collaborators (collectDestroyAllTargets, resolveDestroyAllProject,
 * orderTargetsForDelete, attemptDestroy, emitDestroyLifecycle) are all
 * mocked, plus prisma + provider auth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cdCreate: vi.fn(),
  cdUpdate: vi.fn(),
  drmDeleteMany: vi.fn(),
  getDecryptedCredentials: vi.fn(),
  resolveProviderAuth: vi.fn(),
  createDeployer: vi.fn(),
  acquireWriteLock: vi.fn(() => vi.fn()),
  emitDeployEvent: vi.fn(),
  emitLog: vi.fn(),
  collectDestroyAllTargets: vi.fn(),
  orderTargetsForDelete: vi.fn(),
  resolveDestroyAllProject: vi.fn(),
  attemptDestroy: vi.fn(),
  emitDestroyLifecycle: vi.fn(),
  startDeploySnapshot: vi.fn(),
  finishDeploySnapshot: vi.fn(),
  releaseTempDir: vi.fn(),
}));

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      create: mocks.cdCreate,
      update: mocks.cdUpdate,
    },
    deployedResourceMapping: {
      deleteMany: mocks.drmDeleteMany,
    },
  },
}));

vi.mock('@ice/service-credentials', () => ({
  getDecryptedCredentials: mocks.getDecryptedCredentials,
}));

vi.mock('../../providers/registry.js', () => ({
  resolveProviderAuth: mocks.resolveProviderAuth,
}));

vi.mock('../deployer-factory.js', () => ({
  createDeployer: mocks.createDeployer,
}));

vi.mock('../deploy-lock-wrapper.js', () => ({
  acquireWriteLock: mocks.acquireWriteLock,
}));

vi.mock('../deploy-event-dispatcher.js', () => ({
  emitDeployEvent: mocks.emitDeployEvent,
  emitLog: mocks.emitLog,
}));

vi.mock('../destroy-targets.js', () => ({
  collectDestroyAllTargets: mocks.collectDestroyAllTargets,
  orderTargetsForDelete: mocks.orderTargetsForDelete,
  resolveDestroyAllProject: mocks.resolveDestroyAllProject,
}));

vi.mock('../destroy-runner.js', () => ({
  attemptDestroy: mocks.attemptDestroy,
  emitDestroyLifecycle: mocks.emitDestroyLifecycle,
}));

vi.mock('../deploy-locks.js', () => ({
  startDeploySnapshot: mocks.startDeploySnapshot,
  finishDeploySnapshot: mocks.finishDeploySnapshot,
  releaseTempDir: mocks.releaseTempDir,
}));

import { destroyAllForCard } from '../destroy-all-for-card.js';

const happyDeployer = {
  initialize: vi.fn(),
  cleanup: vi.fn(),
};

const targetA = {
  type: 'gcp.storage.bucket',
  name: 'bucket-a',
  providerId: 'gs://bucket-a',
  nodeId: 'canvas-id-a',
};
const targetB = {
  type: 'gcp.storage.bucket',
  name: 'bucket-b',
  providerId: 'gs://bucket-b',
  nodeId: 'canvas-id-b',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acquireWriteLock.mockReturnValue(vi.fn());
  // Two targets in the destroy-all set + a latest historical row
  mocks.collectDestroyAllTargets.mockResolvedValue({
    targets: new Map([
      ['k-a', targetA],
      ['k-b', targetB],
    ]),
    latestRow: {
      provider: 'gcp',
      region: 'us-central1',
      environment: 'development',
    },
  });
  mocks.orderTargetsForDelete.mockReturnValue([targetA, targetB]);
  mocks.resolveDestroyAllProject.mockReturnValue('gcp-test-project');
  mocks.cdCreate.mockResolvedValue({
    id: 'destroy-all-record-1',
    card_id: 'card-A',
    created_at: new Date('2026-04-29T00:00:00Z'),
  });
  mocks.cdUpdate.mockResolvedValue(undefined);
  mocks.drmDeleteMany.mockResolvedValue({ count: 0 });
  mocks.getDecryptedCredentials.mockResolvedValue({ project_id: 'gcp-test-project' });
  happyDeployer.initialize.mockResolvedValue(undefined);
  happyDeployer.cleanup.mockResolvedValue(undefined);
  mocks.createDeployer.mockResolvedValue(happyDeployer);
  mocks.resolveProviderAuth.mockResolvedValue({
    authClient: {},
    scope: { project: 'gcp-test-project' },
    keyFilePath: undefined,
    parsedCredentials: undefined,
    tempDir: '/tmp/ice-fake-destroy-all',
  });
  mocks.attemptDestroy.mockResolvedValue({ success: true });
});

describe('destroyAllForCard — short-circuits and validation gates', () => {
  it('returns success with empty arrays when there are no targets', async () => {
    mocks.collectDestroyAllTargets.mockResolvedValueOnce({
      targets: new Map(),
      latestRow: null,
    });
    const out = await destroyAllForCard('card-A', 'org-1');
    expect(out).toEqual({ success: true, deleted: [], failed: [], total: 0 });
    expect(mocks.cdCreate).not.toHaveBeenCalled();
    expect(mocks.attemptDestroy).not.toHaveBeenCalled();
  });

  it('throws "Provider not connected" when no credentials are present', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce(null);
    await expect(destroyAllForCard('card-A', 'org-1')).rejects.toThrow('Provider not connected');
    expect(mocks.cdCreate).not.toHaveBeenCalled();
  });

  it('throws when the project id cannot be resolved', async () => {
    mocks.resolveDestroyAllProject.mockReturnValueOnce(null);
    await expect(destroyAllForCard('card-A', 'org-1')).rejects.toThrow(
      /Cannot resolve GCP project id/,
    );
  });

  it('rethrows when the lock wrapper rejects', async () => {
    mocks.acquireWriteLock.mockImplementationOnce(() => {
      throw new Error('A destroy is already in progress for card card-A');
    });
    await expect(destroyAllForCard('card-A', 'org-1')).rejects.toThrow(/already in progress/);
  });

  it('falls back to provider="gcp" when latestRow has no provider', async () => {
    mocks.collectDestroyAllTargets.mockResolvedValueOnce({
      targets: new Map([['k-a', targetA]]),
      latestRow: { region: 'us-central1', environment: 'development' },
    });
    await destroyAllForCard('card-A', 'org-1');
    expect(mocks.resolveProviderAuth).toHaveBeenCalled();
    expect(mocks.resolveProviderAuth.mock.calls[0][0]).toBe('gcp');
  });

  it('falls back to default region/environment when latestRow has only partial fields', async () => {
    mocks.collectDestroyAllTargets.mockResolvedValueOnce({
      targets: new Map([['k-a', targetA]]),
      latestRow: null,
    });
    await destroyAllForCard('card-A', 'org-1');
    const createArgs = mocks.cdCreate.mock.calls[0][0];
    expect(createArgs.data.region).toBe('us-central1');
    expect(createArgs.data.environment).toBe('development');
  });
});

describe('destroyAllForCard — happy path', () => {
  it('returns success and emits a complete event with totals.succeeded for both targets', async () => {
    const out = await destroyAllForCard('card-A', 'org-1', 'user-1');
    expect(out.success).toBe(true);
    expect(out.deleted.length).toBe(2);
    expect(out.failed.length).toBe(0);
    expect(out.total).toBe(2);
    const evt = mocks.emitDeployEvent.mock.calls[0][1];
    expect(evt.outcome).toBe('success');
    expect(evt.totals.succeeded).toBe(2);
    expect(mocks.finishDeploySnapshot).toHaveBeenCalledWith('card-A', 'success');
  });

  it('emits queued + applying + succeeded for each target', async () => {
    await destroyAllForCard('card-A', 'org-1');
    const queued = mocks.emitDestroyLifecycle.mock.calls.filter(
      (c: any) => c[0]?.status === 'queued',
    );
    const applying = mocks.emitDestroyLifecycle.mock.calls.filter(
      (c: any) => c[0]?.status === 'applying',
    );
    const succeeded = mocks.emitDestroyLifecycle.mock.calls.filter(
      (c: any) => c[0]?.status === 'succeeded',
    );
    expect(queued.length).toBe(2);
    expect(applying.length).toBe(2);
    expect(succeeded.length).toBe(2);
  });

  it('cleans up the mapping row after a successful delete (deleteMany rejection swallowed)', async () => {
    mocks.drmDeleteMany.mockRejectedValueOnce(new Error('mapping gone'));
    const out = await destroyAllForCard('card-A', 'org-1');
    expect(out.success).toBe(true);
    expect(mocks.drmDeleteMany).toHaveBeenCalled();
  });

  it('uses target.name as the providerId fallback when target.providerId is missing', async () => {
    const targetNoPid = { type: 'gcp.foo', name: 'thing', nodeId: 'cid-x' };
    mocks.collectDestroyAllTargets.mockResolvedValueOnce({
      targets: new Map([['k', targetNoPid]]),
      latestRow: { provider: 'gcp', region: 'us-central1', environment: 'development' },
    });
    mocks.orderTargetsForDelete.mockReturnValueOnce([targetNoPid as any]);
    await destroyAllForCard('card-A', 'org-1');
    expect(mocks.attemptDestroy.mock.calls[0][0].providerId).toBe('thing');
  });
});

describe('destroyAllForCard — partial / failed outcomes', () => {
  it('marks the run partial when one target fails', async () => {
    mocks.attemptDestroy
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'BUCKET_NOT_EMPTY' });
    const out = await destroyAllForCard('card-A', 'org-1');
    expect(out.success).toBe(false);
    expect(out.deleted.length).toBe(1);
    expect(out.failed).toEqual([
      { type: 'gcp.storage.bucket', name: 'bucket-b', error: 'BUCKET_NOT_EMPTY' },
    ]);
    const evt = mocks.emitDeployEvent.mock.calls[0][1];
    expect(evt.outcome).toBe('partial');
    expect(evt.totals.failed).toBe(1);
    expect(mocks.finishDeploySnapshot).toHaveBeenCalledWith('card-A', 'partial');
  });

  it('uses the default error message when attemptDestroy returns success:false with no error', async () => {
    mocks.attemptDestroy
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });
    const out = await destroyAllForCard('card-A', 'org-1');
    expect(out.failed[0].error).toBe('delete returned non-success');
  });
});

describe('destroyAllForCard — engine catch path', () => {
  it('flips the snapshot to failed and rethrows when deployer.initialize throws', async () => {
    happyDeployer.initialize.mockRejectedValueOnce(new Error('init boom'));
    await expect(destroyAllForCard('card-A', 'org-1')).rejects.toThrow('init boom');
    expect(mocks.finishDeploySnapshot).toHaveBeenCalledWith('card-A', 'failed');
    const updateCall = mocks.cdUpdate.mock.calls.find(
      (c: any) => c[0]?.where?.id === 'destroy-all-record-1',
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall![0].data.status).toBe('failed');
    expect(updateCall![0].data.error).toBe('init boom');
  });

  it('flips the snapshot to failed and rethrows when deployer.cleanup throws post-loop', async () => {
    happyDeployer.cleanup.mockRejectedValueOnce(new Error('cleanup boom'));
    await expect(destroyAllForCard('card-A', 'org-1')).rejects.toThrow('cleanup boom');
    expect(mocks.finishDeploySnapshot).toHaveBeenCalledWith('card-A', 'failed');
  });

  it('handles a non-Error throw (the String(err) fallback in the catch update)', async () => {
    happyDeployer.initialize.mockImplementationOnce(() => {
      throw 'plain string';
    });
    await expect(destroyAllForCard('card-A', 'org-1')).rejects.toBe('plain string');
    const updateCall = mocks.cdUpdate.mock.calls.find(
      (c: any) => c[0]?.where?.id === 'destroy-all-record-1',
    );
    expect(updateCall![0].data.error).toBe('plain string');
  });

  it('swallows a follow-up DB update failure but still rethrows the original error', async () => {
    happyDeployer.initialize.mockRejectedValueOnce(new Error('init boom'));
    mocks.cdUpdate.mockRejectedValueOnce(new Error('db down too'));
    await expect(destroyAllForCard('card-A', 'org-1')).rejects.toThrow('init boom');
    expect(mocks.finishDeploySnapshot).toHaveBeenCalledWith('card-A', 'failed');
  });

  it('always releases temp credentials and the lock (finally semantics)', async () => {
    const release = vi.fn();
    mocks.acquireWriteLock.mockReturnValueOnce(release);
    happyDeployer.initialize.mockRejectedValueOnce(new Error('boom'));
    await expect(destroyAllForCard('card-A', 'org-1')).rejects.toThrow();
    expect(mocks.releaseTempDir).toHaveBeenCalledWith('/tmp/ice-fake-destroy-all');
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe('destroyAllForCard — collaborator option threading', () => {
  it('passes options.gcpProject through to resolveDestroyAllProject', async () => {
    await destroyAllForCard('card-A', 'org-1', undefined, { gcpProject: 'override-proj' });
    expect(mocks.resolveDestroyAllProject).toHaveBeenCalled();
    const arg = mocks.resolveDestroyAllProject.mock.calls[0][0];
    expect(arg.options).toEqual({ gcpProject: 'override-proj' });
  });

  it('drives the resolveProviderAuth onLog callback through emitLog', async () => {
    mocks.resolveProviderAuth.mockImplementationOnce(async (_p: string, opts: any) => {
      opts.onLog('auth log');
      return {
        authClient: {},
        scope: { project: 'p' },
        tempDir: undefined,
      };
    });
    await destroyAllForCard('card-A', 'org-1');
    const logs = mocks.emitLog.mock.calls.map((c: any) => c[1]);
    expect(logs).toContain('auth log');
  });

  it('drives the deployer.initialize on_log callback through emitLog', async () => {
    happyDeployer.initialize.mockImplementationOnce(async (cfg: any) => {
      cfg.on_log('init log');
    });
    await destroyAllForCard('card-A', 'org-1');
    const logs = mocks.emitLog.mock.calls.map((c: any) => c[1]);
    expect(logs).toContain('init log');
  });
});

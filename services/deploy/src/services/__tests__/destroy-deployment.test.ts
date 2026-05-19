/**
 * Tests for `destroy-deployment.ts` — the "destroy the latest applied
 * baseline for this card" orchestrator. The pdl-10 contract (per-resource
 * queued/applying/succeeded/failed wire emits) is already covered by
 * `__tests__/deploy-event-translation.test.ts` going through the
 * deploy.service.ts re-export. The gap that lands here:
 *
 *  - validation gates (no apply baseline, newer destroy already happened,
 *    no credentials, lock-acquire conflict)
 *  - inline `onLog` / `on_log` callbacks (lines 130 + 145) that don't
 *    fire from the existing happy-path tests
 *  - the engine-throw catch path (lines 336-359) where deployer.initialize
 *    or another await between try-open and the per-resource loop throws
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cdFindFirst: vi.fn(),
  cdCreate: vi.fn(),
  cdUpdate: vi.fn(),
  getDecryptedCredentials: vi.fn(),
  resolveProviderAuth: vi.fn(),
  createDeployer: vi.fn(),
  acquireWriteLock: vi.fn(() => vi.fn()),
  emitDeployEvent: vi.fn(),
  emitLog: vi.fn(),
  attemptDestroy: vi.fn(),
  emitDestroyLifecycle: vi.fn(),
  removeResourceMapping: vi.fn(),
  startDeploySnapshot: vi.fn(),
  finishDeploySnapshot: vi.fn(),
  releaseTempDir: vi.fn(),
}));

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      findFirst: mocks.cdFindFirst,
      create: mocks.cdCreate,
      update: mocks.cdUpdate,
    },
  },
}));

vi.mock('@ice/service-credentials', () => ({
  getDecryptedCredentials: mocks.getDecryptedCredentials,
}));

vi.mock('../../providers/registry', () => ({
  resolveProviderAuth: mocks.resolveProviderAuth,
}));

vi.mock('../deployer-factory', () => ({
  createDeployer: mocks.createDeployer,
}));

vi.mock('../deploy-lock-wrapper', () => ({
  acquireWriteLock: mocks.acquireWriteLock,
}));

vi.mock('../deploy-event-dispatcher', () => ({
  emitDeployEvent: mocks.emitDeployEvent,
  emitLog: mocks.emitLog,
}));

vi.mock('../destroy-runner', () => ({
  attemptDestroy: mocks.attemptDestroy,
  emitDestroyLifecycle: mocks.emitDestroyLifecycle,
}));

vi.mock('../resource-mapping.service', () => ({
  removeResourceMapping: mocks.removeResourceMapping,
}));

vi.mock('../deploy-locks', () => ({
  startDeploySnapshot: mocks.startDeploySnapshot,
  finishDeploySnapshot: mocks.finishDeploySnapshot,
  releaseTempDir: mocks.releaseTempDir,
}));

import { destroyDeployment } from '../destroy-deployment';

const APPLY_BASELINE = {
  id: 'apply-baseline-1',
  card_id: 'card-A',
  status: 'success',
  action_type: 'apply',
  provider: 'gcp',
  region: 'us-central1',
  environment: 'development',
  created_at: new Date('2026-04-28T00:00:00Z'),
  results: {
    resources: [
      {
        success: true,
        provider_id: 'gs://bucket-a',
        name: 'bucket-a',
        type: 'gcp.storage.bucket',
        source_node_id: 'canvas-id-a',
        resource_id: 'r1',
      },
    ],
  },
};

const happyDeployer = {
  initialize: vi.fn(),
  cleanup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acquireWriteLock.mockReturnValue(vi.fn());
  // First findFirst → latest apply; second findFirst → newer-destroy check
  mocks.cdFindFirst.mockResolvedValueOnce(APPLY_BASELINE).mockResolvedValueOnce(null);
  mocks.cdCreate.mockResolvedValue({
    id: 'destroy-record-1',
    card_id: 'card-A',
    region: 'us-central1',
    environment: 'development',
  });
  mocks.cdUpdate.mockResolvedValue(undefined);
  mocks.getDecryptedCredentials.mockResolvedValue({ project_id: 'gcp-test-project' });
  happyDeployer.initialize.mockResolvedValue(undefined);
  happyDeployer.cleanup.mockResolvedValue(undefined);
  mocks.createDeployer.mockResolvedValue(happyDeployer);
  mocks.resolveProviderAuth.mockResolvedValue({
    authClient: { projectId: 'gcp-test-project' },
    scope: { project: 'gcp-test-project' },
    keyFilePath: '/tmp/k.json',
    parsedCredentials: { type: 'service_account' },
    tempDir: '/tmp/ice-fake-destroy',
  });
  mocks.attemptDestroy.mockResolvedValue({ success: true, raw: { success: true } });
  mocks.removeResourceMapping.mockResolvedValue(undefined);
});

describe('destroyDeployment — validation gates', () => {
  it('rethrows when the lock wrapper rejects (concurrent destroy in flight)', async () => {
    mocks.acquireWriteLock.mockImplementationOnce(() => {
      throw new Error('A destroy is already in progress for card card-A');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(destroyDeployment('card-A', 'org-1')).rejects.toThrow(/already in progress/);
    warnSpy.mockRestore();
  });

  it('throws "No deployment found" when there is no apply baseline', async () => {
    mocks.cdFindFirst.mockReset().mockResolvedValueOnce(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(destroyDeployment('card-A', 'org-1')).rejects.toThrow(/No deployment found to destroy/);
    warnSpy.mockRestore();
  });

  it('throws "No deployment found" when results column is missing', async () => {
    mocks.cdFindFirst.mockReset().mockResolvedValueOnce({ ...APPLY_BASELINE, results: null });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(destroyDeployment('card-A', 'org-1')).rejects.toThrow(/No deployment found to destroy/);
    warnSpy.mockRestore();
  });

  it('throws "already destroyed" when a newer destroy row exists', async () => {
    mocks.cdFindFirst
      .mockReset()
      .mockResolvedValueOnce(APPLY_BASELINE)
      .mockResolvedValueOnce({ id: 'destroy-newer', created_at: new Date('2026-04-29T00:00:00Z') });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(destroyDeployment('card-A', 'org-1')).rejects.toThrow(/already destroyed/);
    warnSpy.mockRestore();
  });

  it('throws "Provider not connected" when no credentials are present', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(destroyDeployment('card-A', 'org-1')).rejects.toThrow(/Provider not connected/);
    warnSpy.mockRestore();
  });

  it('falls back to provider="gcp" when the apply baseline has no provider', async () => {
    mocks.cdFindFirst
      .mockReset()
      .mockResolvedValueOnce({ ...APPLY_BASELINE, provider: null })
      .mockResolvedValueOnce(null);
    await destroyDeployment('card-A', 'org-1');
    // resolveProviderAuth is the canonical call where provider lands; it
    // ran with 'gcp' because the OR-fallback fired.
    expect(mocks.resolveProviderAuth).toHaveBeenCalled();
    expect(mocks.resolveProviderAuth.mock.calls[0][0]).toBe('gcp');
  });
});

describe('destroyDeployment — happy path', () => {
  it('returns success=true and persists a success row + complete event', async () => {
    const out = await destroyDeployment('card-A', 'org-1', 'user-1');
    expect(out.success).toBe(true);
    expect(out.deploymentId).toBe('destroy-record-1');
    expect(typeof out.duration_ms).toBe('number');
    const evt = mocks.emitDeployEvent.mock.calls[0][1];
    expect(evt.type).toBe('complete');
    expect(evt.outcome).toBe('success');
    expect(evt.totals.succeeded).toBe(1);
    expect(mocks.finishDeploySnapshot).toHaveBeenCalledWith('card-A', 'success');
  });

  it('removes the resource mapping after a successful per-item delete', async () => {
    await destroyDeployment('card-A', 'org-1');
    expect(mocks.removeResourceMapping).toHaveBeenCalledWith({
      cardId: 'card-A',
      nodeId: 'canvas-id-a',
      environment: 'development',
    });
  });

  it('handles per-resource delete soft-failure with status=partial outcome', async () => {
    mocks.attemptDestroy.mockResolvedValueOnce({
      success: false,
      error: 'BUCKET_NOT_EMPTY',
      raw: { success: false, error: 'BUCKET_NOT_EMPTY' },
    });
    const out = await destroyDeployment('card-A', 'org-1');
    expect(out.success).toBe(false);
    const evt = mocks.emitDeployEvent.mock.calls[0][1];
    expect(evt.outcome).toBe('partial');
    expect(evt.totals.failed).toBe(1);
    expect(mocks.finishDeploySnapshot).toHaveBeenCalledWith('card-A', 'partial');
  });

  it('handles per-resource delete throw-path (raw missing) with status=partial', async () => {
    mocks.attemptDestroy.mockResolvedValueOnce({
      success: false,
      error: 'PERMISSION_DENIED',
    });
    const out = await destroyDeployment('card-A', 'org-1');
    expect(out.success).toBe(false);
    const evt = mocks.emitDeployEvent.mock.calls[0][1];
    expect(evt.outcome).toBe('partial');
    // Failed lifecycle emit on the throw-side branch.
    const failedEmits = mocks.emitDestroyLifecycle.mock.calls.filter((c: any) => c[0]?.status === 'failed');
    expect(failedEmits.length).toBe(1);
    // Per-resource log line ("Failed to delete X: Y") fires too.
    const logCalls = mocks.emitLog.mock.calls.map((c: any) => c[1]).join(' ');
    expect(logCalls).toContain('Failed to delete bucket-a');
    expect(logCalls).toContain('PERMISSION_DENIED');
  });

  it('uses the default error message when attemptDestroy returns success:false with no error', async () => {
    mocks.attemptDestroy.mockResolvedValueOnce({
      success: false,
      raw: { success: false }, // no error field
    });
    const out = await destroyDeployment('card-A', 'org-1');
    expect(out.success).toBe(false);
    const failedEmits = mocks.emitDestroyLifecycle.mock.calls.filter((c: any) => c[0]?.status === 'failed');
    expect(failedEmits.length).toBe(1);
    expect(failedEmits[0][0].error.message).toBe('delete returned non-success');
  });

  it('uses default "delete threw" when attemptDestroy returns success:false with no raw or error', async () => {
    mocks.attemptDestroy.mockResolvedValueOnce({ success: false });
    const out = await destroyDeployment('card-A', 'org-1');
    expect(out.success).toBe(false);
    const failedEmits = mocks.emitDestroyLifecycle.mock.calls.filter((c: any) => c[0]?.status === 'failed');
    expect(failedEmits[0][0].error.message).toBe('delete threw');
  });

  it('skips resources without provider_id (silently — never previously created)', async () => {
    mocks.cdFindFirst
      .mockReset()
      .mockResolvedValueOnce({
        ...APPLY_BASELINE,
        results: {
          resources: [
            { success: true, name: 'noop', type: 'gcp.storage.bucket' }, // no provider_id
            { success: true, provider_id: 'gs://b', name: 'b', type: 'gcp.storage.bucket' },
          ],
        },
      })
      .mockResolvedValueOnce(null);
    await destroyDeployment('card-A', 'org-1');
    // Only the second resource hit attemptDestroy.
    expect(mocks.attemptDestroy).toHaveBeenCalledTimes(1);
  });

  it('skips queued emit for legacy resources without source_node_id', async () => {
    mocks.cdFindFirst
      .mockReset()
      .mockResolvedValueOnce({
        ...APPLY_BASELINE,
        results: {
          resources: [
            // legacy: no source_node_id
            { success: true, provider_id: 'gs://legacy', name: 'legacy', type: 'gcp.storage.bucket' },
          ],
        },
      })
      .mockResolvedValueOnce(null);
    await destroyDeployment('card-A', 'org-1');
    // No queued emit happened (the loop's pre-loop `for` block guarded it
    // with `res.success && res.provider_id && res.source_node_id`).
    const queuedEmits = mocks.emitDestroyLifecycle.mock.calls.filter((c: any) => c[0]?.status === 'queued');
    expect(queuedEmits.length).toBe(0);
  });

  it('swallows removeResourceMapping rejection (mapping may not exist for older rows)', async () => {
    mocks.removeResourceMapping.mockRejectedValueOnce(new Error('mapping gone'));
    const out = await destroyDeployment('card-A', 'org-1');
    expect(out.success).toBe(true);
  });

  it('drives the resolveProviderAuth onLog callback through emitLog', async () => {
    mocks.resolveProviderAuth.mockImplementationOnce(async (_provider: string, opts: any) => {
      opts.onLog('hello from auth');
      return {
        authClient: {},
        scope: { project: 'p' },
        tempDir: undefined,
      };
    });
    await destroyDeployment('card-A', 'org-1');
    const logCalls = mocks.emitLog.mock.calls.map((c: any) => c[1]);
    expect(logCalls).toContain('hello from auth');
  });

  it('drives the deployer.initialize on_log callback through emitLog', async () => {
    happyDeployer.initialize.mockImplementationOnce(async (cfg: any) => {
      cfg.on_log('init log line');
    });
    await destroyDeployment('card-A', 'org-1');
    const logCalls = mocks.emitLog.mock.calls.map((c: any) => c[1]);
    expect(logCalls).toContain('init log line');
  });

  it('falls back to authClient.projectId when scope.project is missing', async () => {
    mocks.resolveProviderAuth.mockResolvedValueOnce({
      authClient: { projectId: 'fallback-proj' },
      scope: { project: null },
      tempDir: undefined,
    });
    await destroyDeployment('card-A', 'org-1');
    expect(happyDeployer.initialize).toHaveBeenCalled();
    expect(happyDeployer.initialize.mock.calls[0][0].project).toBe('fallback-proj');
  });

  it('falls back to authClient.project_id when both scope and projectId are missing', async () => {
    mocks.resolveProviderAuth.mockResolvedValueOnce({
      authClient: { project_id: 'snake-proj' },
      scope: {},
      tempDir: undefined,
    });
    await destroyDeployment('card-A', 'org-1');
    expect(happyDeployer.initialize.mock.calls[0][0].project).toBe('snake-proj');
  });
});

describe('destroyDeployment — engine catch path', () => {
  it('catches an initialize throw and persists status=failed with the message', async () => {
    happyDeployer.initialize.mockRejectedValueOnce(new Error('boom from initialize'));
    const out = await destroyDeployment('card-A', 'org-1');
    expect(out.success).toBe(false);
    expect(out.error).toBe('boom from initialize');
    const updateCall = mocks.cdUpdate.mock.calls.find((c: any) => c[0]?.where?.id === 'destroy-record-1');
    expect(updateCall![0].data.status).toBe('failed');
    expect(updateCall![0].data.error).toBe('boom from initialize');
    const evt = mocks.emitDeployEvent.mock.calls[0][1];
    expect(evt.outcome).toBe('failure');
    expect(mocks.finishDeploySnapshot).toHaveBeenCalledWith('card-A', 'failed');
  });

  it('catches a deployer.cleanup throw post-loop and surfaces failure outcome', async () => {
    happyDeployer.cleanup.mockRejectedValueOnce(new Error('cleanup boom'));
    const out = await destroyDeployment('card-A', 'org-1');
    expect(out.success).toBe(false);
    expect(out.error).toBe('cleanup boom');
  });

  it('always releases temp credentials and the lock (finally semantics)', async () => {
    const release = vi.fn();
    mocks.acquireWriteLock.mockReturnValueOnce(release);
    happyDeployer.initialize.mockRejectedValueOnce(new Error('throw inside try'));
    await destroyDeployment('card-A', 'org-1');
    expect(mocks.releaseTempDir).toHaveBeenCalledWith('/tmp/ice-fake-destroy');
    expect(release).toHaveBeenCalledTimes(1);
  });
});

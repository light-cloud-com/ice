/**
 * Tests for `rollback-deployment.ts` — the "roll a card back to deployment X"
 * orchestrator. The validation gates (lines 33-58: target not found,
 * wrong card, status != success, no resource data, no credentials) are
 * the simplest path; the long bodies under `try { … }` (lines 80-181)
 * and the catch-path on line 182 carry the real branch coverage gap.
 *
 * Strategy: mock every collaborator (prisma, credentials, core engine,
 * deployer factory, lock wrapper, event dispatcher, baseline graph,
 * deploy-locks helpers) and drive the four happy/sad outcomes:
 *   - successful rollback (result.success = true)
 *   - failed rollback (result.success = false with errors)
 *   - rollback with no errors arr (errors-fallback path)
 *   - engine throw (catch path)
 * Plus a pre-`try` validation gate test that confirms the
 * deploy-lock-wrapper rethrow on a contended card.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // prisma
  cdFindUnique: vi.fn(),
  cdCreate: vi.fn(),
  cdUpdate: vi.fn(),
  // credentials
  getDecryptedCredentials: vi.fn(),
  // providers/registry
  resolveProviderAuth: vi.fn(),
  // core engine
  deployGraph: vi.fn(),
  MutableGraph: vi.fn(function MutableGraphCtor(this: any) {
    this.add_node = vi.fn();
  }),
  // deployer-factory
  createDeployer: vi.fn(),
  // deploy-lock-wrapper
  acquireWriteLock: vi.fn(() => vi.fn()),
  // event dispatcher
  emitDeployEvent: vi.fn(),
  emitLog: vi.fn(),
  // baseline-graph
  buildBaselineGraph: vi.fn(),
  // deploy-locks
  releaseTempDir: vi.fn(),
}));

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      findUnique: mocks.cdFindUnique,
      create: mocks.cdCreate,
      update: mocks.cdUpdate,
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
  getCoreEngine: async () => ({
    MutableGraph: mocks.MutableGraph,
    deploy_graph: mocks.deployGraph,
  }),
}));

vi.mock('../deploy-lock-wrapper.js', () => ({
  acquireWriteLock: mocks.acquireWriteLock,
}));

vi.mock('../deploy-event-dispatcher.js', () => ({
  emitDeployEvent: mocks.emitDeployEvent,
  emitLog: mocks.emitLog,
}));

vi.mock('../baseline-graph.js', () => ({
  buildBaselineGraph: mocks.buildBaselineGraph,
}));

vi.mock('../deploy-locks.js', () => ({
  releaseTempDir: mocks.releaseTempDir,
}));

import { rollbackDeployment } from '../rollback-deployment.js';

const SUCCESSFUL_TARGET = {
  id: 'deploy-target-1',
  card_id: 'card-A',
  status: 'success',
  provider: 'gcp',
  region: 'us-central1',
  environment: 'development',
  results: {
    resources: [
      {
        success: true,
        resource_id: 'r1',
        name: 'bucket-a',
        type: 'gcp.storage.bucket',
        provider_id: 'gs://bucket-a',
        outputs: { url: 'https://bucket-a.example' },
      },
      {
        success: true,
        resource_id: 'r2',
        name: 'bucket-b',
        type: 'gcp.storage.bucket',
        provider_id: 'gs://bucket-b',
        outputs: {},
      },
    ],
  },
};

const happyDeployer = {
  authenticate: vi.fn(),
  cleanup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset every default to a happy-path shape.
  mocks.acquireWriteLock.mockReturnValue(vi.fn());
  mocks.cdFindUnique.mockResolvedValue(SUCCESSFUL_TARGET);
  mocks.cdCreate.mockResolvedValue({
    id: 'rollback-record-1',
    card_id: 'card-A',
    region: 'us-central1',
    environment: 'development',
  });
  mocks.cdUpdate.mockResolvedValue(undefined);
  mocks.getDecryptedCredentials.mockResolvedValue({ project_id: 'gcp-test-project' });
  happyDeployer.authenticate.mockResolvedValue(undefined);
  happyDeployer.cleanup.mockResolvedValue(undefined);
  mocks.createDeployer.mockResolvedValue(happyDeployer);
  mocks.resolveProviderAuth.mockResolvedValue({
    authClient: { projectId: 'gcp-test-project' },
    scope: { project: 'gcp-test-project' },
    accessToken: null,
    keyFilePath: undefined,
    parsedCredentials: undefined,
    tempDir: '/tmp/ice-fake-rollback',
  });
  mocks.buildBaselineGraph.mockResolvedValue({
    currentGraph: { nodes: { values: () => [] } },
    foundCount: 0,
    hasResults: false,
  });
  mocks.deployGraph.mockResolvedValue({
    success: true,
    resources: [
      { name: 'bucket-a', type: 'gcp.storage.bucket', success: true, action: 'create' },
    ],
    errors: [],
    summary: { total: 1, created: 1, updated: 0, deleted: 0, skipped: 0, failed: 0 },
  });
});

describe('rollbackDeployment — validation gates', () => {
  it('rejects when the lock wrapper rejects (concurrent rollback in flight)', async () => {
    mocks.acquireWriteLock.mockImplementationOnce(() => {
      throw new Error('A rollback is already in progress for card card-A');
    });
    await expect(rollbackDeployment('deploy-1', 'card-A', 'org-1')).rejects.toThrow(
      /already in progress/,
    );
  });

  it('throws "Target deployment not found" when findUnique returns null', async () => {
    mocks.cdFindUnique.mockResolvedValueOnce(null);
    await expect(rollbackDeployment('deploy-x', 'card-A', 'org-1')).rejects.toThrow(
      'Target deployment not found',
    );
  });

  it('throws "Deployment does not belong to this card" when card_id mismatches', async () => {
    mocks.cdFindUnique.mockResolvedValueOnce({ ...SUCCESSFUL_TARGET, card_id: 'card-OTHER' });
    await expect(rollbackDeployment('deploy-1', 'card-A', 'org-1')).rejects.toThrow(
      'does not belong to this card',
    );
  });

  it('throws when the target deployment was not successful', async () => {
    mocks.cdFindUnique.mockResolvedValueOnce({ ...SUCCESSFUL_TARGET, status: 'failed' });
    await expect(rollbackDeployment('deploy-1', 'card-A', 'org-1')).rejects.toThrow(
      'Can only roll back to a successful deployment',
    );
  });

  it('throws when the target deployment has no results.resources data', async () => {
    mocks.cdFindUnique.mockResolvedValueOnce({ ...SUCCESSFUL_TARGET, results: null });
    await expect(rollbackDeployment('deploy-1', 'card-A', 'org-1')).rejects.toThrow(
      'has no resource data',
    );
  });

  it('throws when no provider credentials are connected', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce(null);
    await expect(rollbackDeployment('deploy-1', 'card-A', 'org-1')).rejects.toThrow(
      'Provider not connected',
    );
  });

  it('release is called on every validation gate', async () => {
    const release = vi.fn();
    mocks.acquireWriteLock.mockReturnValueOnce(release);
    mocks.cdFindUnique.mockResolvedValueOnce(null);
    await expect(rollbackDeployment('deploy-x', 'card-A', 'org-1')).rejects.toThrow();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('falls back to provider="gcp" when target deployment has no provider', async () => {
    mocks.cdFindUnique.mockResolvedValueOnce({ ...SUCCESSFUL_TARGET, provider: null });
    await rollbackDeployment('deploy-1', 'card-A', 'org-1', 'user-1');
    expect(mocks.cdCreate).toHaveBeenCalled();
    const createArgs = mocks.cdCreate.mock.calls[0][0];
    expect(createArgs.data.provider).toBe('gcp');
  });
});

describe('rollbackDeployment — successful happy path', () => {
  it('returns success=true with the rollback record id and emits a complete event', async () => {
    const out = await rollbackDeployment('deploy-target-1', 'card-A', 'org-1', 'user-1');
    expect(out).toMatchObject({
      success: true,
      deploymentId: 'rollback-record-1',
      error: null,
    });
    expect(typeof out.duration_ms).toBe('number');
    expect(mocks.emitDeployEvent).toHaveBeenCalledTimes(1);
    const evt = mocks.emitDeployEvent.mock.calls[0][1];
    expect(evt.type).toBe('complete');
    expect(evt.outcome).toBe('success');
  });

  it('persists status=success on the rollback record when the deploy succeeds', async () => {
    await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    const updateCall = mocks.cdUpdate.mock.calls.find(
      (c: any) => c[0]?.where?.id === 'rollback-record-1',
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall![0].data.status).toBe('success');
    expect(updateCall![0].data.error).toBeNull();
  });

  it('builds the desired graph from successful resources only (skips ones missing resource_id)', async () => {
    mocks.cdFindUnique.mockResolvedValueOnce({
      ...SUCCESSFUL_TARGET,
      results: {
        resources: [
          { success: true, resource_id: 'r1', name: 'bucket-a', type: 'gcp.storage.bucket', outputs: {} },
          { success: false, resource_id: 'r2', name: 'failed', type: 'gcp.storage.bucket', outputs: {} },
          { success: true, name: 'no-id', type: 'gcp.storage.bucket', outputs: {} }, // missing resource_id
        ],
      },
    });
    let addNodeCalls = 0;
    mocks.MutableGraph.mockImplementationOnce(function MutableGraphCtor(this: any) {
      this.add_node = (..._args: any[]) => {
        addNodeCalls += 1;
      };
    });
    await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    // Only the first resource (success && resource_id) gets added.
    expect(addNodeCalls).toBe(1);
  });

  it('swallows duplicate-add throws from desiredGraph.add_node', async () => {
    // Two resources with the same name+type so the underlying graph
    // implementation might throw on the second add. The catch is
    // unconditional — both calls should still go through.
    mocks.cdFindUnique.mockResolvedValueOnce({
      ...SUCCESSFUL_TARGET,
      results: {
        resources: [
          { success: true, resource_id: 'r1', name: 'bucket-a', type: 'gcp.storage.bucket', outputs: {} },
          { success: true, resource_id: 'r2', name: 'bucket-a', type: 'gcp.storage.bucket', outputs: {} },
        ],
      },
    });
    let addNodeAttempts = 0;
    mocks.MutableGraph.mockImplementationOnce(function MutableGraphCtor(this: any) {
      this.add_node = (..._args: any[]) => {
        addNodeAttempts += 1;
        if (addNodeAttempts === 2) throw new Error('duplicate node');
      };
    });
    const out = await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    expect(addNodeAttempts).toBe(2);
    expect(out.success).toBe(true);
  });

  it('falls back to "us-central1" when the target deployment has no region', async () => {
    mocks.cdFindUnique.mockResolvedValueOnce({ ...SUCCESSFUL_TARGET, region: null });
    await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    expect(mocks.deployGraph).toHaveBeenCalled();
    const opts = mocks.deployGraph.mock.calls[0][3];
    expect(opts.regions).toEqual(['us-central1']);
  });

  it('uses authClient.projectId when scope.project is missing', async () => {
    mocks.resolveProviderAuth.mockResolvedValueOnce({
      authClient: { projectId: 'fallback-proj-id' },
      scope: { project: null },
      tempDir: undefined,
    });
    await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    const opts = mocks.deployGraph.mock.calls[0][3];
    expect(opts.project).toBe('fallback-proj-id');
  });

  it('uses authClient.project_id when scope.project and authClient.projectId both missing', async () => {
    mocks.resolveProviderAuth.mockResolvedValueOnce({
      authClient: { project_id: 'snake-case-proj' },
      scope: {},
      tempDir: undefined,
    });
    await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    const opts = mocks.deployGraph.mock.calls[0][3];
    expect(opts.project).toBe('snake-case-proj');
  });

  it('forwards _ice_key_file_path and _ice_parsed_credentials when present on authClient', async () => {
    mocks.resolveProviderAuth.mockResolvedValueOnce({
      authClient: {
        projectId: 'p',
        _ice_key_file_path: '/tmp/k.json',
        _ice_parsed_credentials: { type: 'service_account' },
      },
      scope: { project: 'p' },
      tempDir: undefined,
    });
    await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    const opts = mocks.deployGraph.mock.calls[0][3];
    expect(opts.auth_key_file).toBe('/tmp/k.json');
    expect(opts.auth_credentials).toEqual({ type: 'service_account' });
  });
});

describe('rollbackDeployment — failed deploy path', () => {
  it('returns success=false with the canned "Rollback failed" error when result.success=false', async () => {
    mocks.deployGraph.mockResolvedValueOnce({
      success: false,
      resources: [{ name: 'r1', success: false, action: 'create', error: 'boom' }],
      errors: [],
    });
    const out = await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    expect(out.success).toBe(false);
    expect(out.error).toBe('Rollback failed — check resource configuration');
  });

  it('joins multiple top-level errors into the persisted error column', async () => {
    mocks.deployGraph.mockResolvedValueOnce({
      success: false,
      resources: [],
      errors: [{ message: 'first error' }, { message: 'second error' }],
    });
    await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    const updateCall = mocks.cdUpdate.mock.calls.find(
      (c: any) => c[0]?.where?.id === 'rollback-record-1',
    );
    expect(updateCall![0].data.error).toBe('first error; second error');
    expect(updateCall![0].data.status).toBe('failed');
  });

  it('persists error=null when result.errors array is empty (or-fallback)', async () => {
    mocks.deployGraph.mockResolvedValueOnce({
      success: false,
      resources: [],
      errors: [],
    });
    await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    const updateCall = mocks.cdUpdate.mock.calls.find(
      (c: any) => c[0]?.where?.id === 'rollback-record-1',
    );
    expect(updateCall![0].data.error).toBeNull();
  });

  it('persists error=null when result.errors is missing entirely', async () => {
    mocks.deployGraph.mockResolvedValueOnce({
      success: false,
      resources: [],
    });
    await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    const updateCall = mocks.cdUpdate.mock.calls.find(
      (c: any) => c[0]?.where?.id === 'rollback-record-1',
    );
    expect(updateCall![0].data.error).toBeNull();
  });
});

describe('rollbackDeployment — engine throw path', () => {
  it('catches a throw, persists status=failed with the message, and emits a failure complete', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.deployGraph.mockRejectedValueOnce(new Error('engine exploded'));
    const out = await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    expect(out.success).toBe(false);
    expect(out.error).toBe('engine exploded');
    const updateCall = mocks.cdUpdate.mock.calls.find(
      (c: any) => c[0]?.where?.id === 'rollback-record-1',
    );
    expect(updateCall![0].data.status).toBe('failed');
    expect(updateCall![0].data.error).toBe('engine exploded');
    const evt = mocks.emitDeployEvent.mock.calls[0][1];
    expect(evt.outcome).toBe('failure');
    expect(evt.totals).toEqual({
      queued: 0,
      applying: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
    });
    errorSpy.mockRestore();
  });

  it('releases temp credentials and the lock even on the throw path', async () => {
    const release = vi.fn();
    mocks.acquireWriteLock.mockReturnValueOnce(release);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.deployGraph.mockRejectedValueOnce(new Error('boom'));
    await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    expect(mocks.releaseTempDir).toHaveBeenCalledWith('/tmp/ice-fake-rollback');
    expect(release).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('releases temp credentials and the lock on the success path too (finally semantics)', async () => {
    const release = vi.fn();
    mocks.acquireWriteLock.mockReturnValueOnce(release);
    await rollbackDeployment('deploy-target-1', 'card-A', 'org-1');
    expect(mocks.releaseTempDir).toHaveBeenCalledWith('/tmp/ice-fake-rollback');
    expect(release).toHaveBeenCalledTimes(1);
  });
});

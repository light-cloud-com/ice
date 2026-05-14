/**
 * Tests for `apply-deployment.ts` — the public `applyDeployment` 5-phase
 * pipeline (translate → auto-rules → auth → diff/baseline → deploy → persist).
 *
 * The existing `__tests__/deploy-event-translation.test.ts` covers the
 * pdl-4 graph→canvas translation through a full async run. This file
 * fills the validation-and-edge-branch gap: lock conflict, empty-canvas
 * short-circuit, no-credentials, zero-deployable-translation, the engine
 * catch path, the executeAsync default, and the various `||` fallback
 * paths in the resolve/auth section.
 *
 * Strategy: mock every collaborator (~15 modules) and drive each branch
 * through one synchronous `executeAsync: false` run.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // prisma
  cdCreate: vi.fn(),
  cdUpdate: vi.fn(),
  // credentials
  getDecryptedCredentials: vi.fn(),
  // deploy-locks
  acquireDeployLock: vi.fn(),
  startDeploySnapshot: vi.fn(),
  finishDeploySnapshot: vi.fn(),
  releaseTempDir: vi.fn(),
  // resource-mapping
  getExistingNameMap: vi.fn(),
  getResourceMap: vi.fn(),
  seedMappingsFromHistory: vi.fn(),
  // providers
  resolveProviderAuth: vi.fn(),
  // utils
  resolveProjectContext: vi.fn(),
  // deployer-factory
  createDeployer: vi.fn(),
  translateCardToGraph: vi.fn(),
  deployGraph: vi.fn(),
  // gcp-api-enabler
  autoEnableGCPApis: vi.fn(),
  // snapshot-persister
  flushSnapshotNow: vi.fn(),
  // event dispatcher
  emitDeployEvent: vi.fn(),
  emitLog: vi.fn(),
  // scheduler-callbacks
  makeSchedulerCallbacks: vi.fn(),
  // baseline-graph
  buildBaselineGraph: vi.fn(),
  // quota-retry
  retryAfterQuotaCleanup: vi.fn(),
  // apply-pipeline-helpers
  ensureAutoDeployRules: vi.fn(),
  logDiffForDebugging: vi.fn(),
  logSourceRepoDiagnostics: vi.fn(),
  normalizeIdempotentResultErrors: vi.fn(),
  persistResourceMappings: vi.fn(),
}));

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      create: mocks.cdCreate,
      update: mocks.cdUpdate,
    },
  },
}));

vi.mock('@ice/service-credentials', () => ({
  getDecryptedCredentials: mocks.getDecryptedCredentials,
}));

vi.mock('../deploy-locks', async () => {
  const actual = await vi.importActual<typeof import('../deploy-locks')>('../deploy-locks.js');
  return {
    acquireDeployLock: mocks.acquireDeployLock,
    DeployLockError: actual.DeployLockError,
    startDeploySnapshot: mocks.startDeploySnapshot,
    finishDeploySnapshot: mocks.finishDeploySnapshot,
    releaseTempDir: mocks.releaseTempDir,
  };
});

vi.mock('../resource-mapping.service', () => ({
  getExistingNameMap: mocks.getExistingNameMap,
  getResourceMap: mocks.getResourceMap,
  seedMappingsFromHistory: mocks.seedMappingsFromHistory,
}));

vi.mock('../../providers/registry', () => ({
  resolveProviderAuth: mocks.resolveProviderAuth,
}));

vi.mock('../../utils/find-source-node-id', () => ({
  buildResourceNameMaps: () => ({
    nameToNodeId: new Map(),
    graphIdToCanvasId: new Map(),
    persistedNameToNodeId: new Map(),
    persistedProviderIdToNodeId: new Map(),
  }),
  makeFindSourceNodeId: () => () => undefined,
}));

vi.mock('../../utils/project-context', () => ({
  resolveProjectContext: mocks.resolveProjectContext,
}));

vi.mock('../deployer-factory', () => ({
  createDeployer: mocks.createDeployer,
  getCoreEngine: async () => ({
    translate_card_to_graph: mocks.translateCardToGraph,
    deploy_graph: mocks.deployGraph,
  }),
}));

vi.mock('../gcp-api-enabler', () => ({
  autoEnableGCPApis: mocks.autoEnableGCPApis,
}));

vi.mock('../snapshot-persister', () => ({
  flushSnapshotNow: mocks.flushSnapshotNow,
}));

vi.mock('../deploy-event-dispatcher', () => ({
  emitDeployEvent: mocks.emitDeployEvent,
  emitLog: mocks.emitLog,
}));

vi.mock('../scheduler-callbacks', () => ({
  makeSchedulerCallbacks: (..._args: any[]) => ({
    on_node_status: vi.fn(),
    on_node_progress: vi.fn(),
    on_log: vi.fn(),
    on_resource_result: vi.fn(),
  }),
}));

vi.mock('../baseline-graph', () => ({
  buildBaselineGraph: mocks.buildBaselineGraph,
}));

vi.mock('../quota-retry', () => ({
  retryAfterQuotaCleanup: mocks.retryAfterQuotaCleanup,
}));

vi.mock('../apply-pipeline-helpers', () => ({
  ensureAutoDeployRules: mocks.ensureAutoDeployRules,
  logDiffForDebugging: mocks.logDiffForDebugging,
  logSourceRepoDiagnostics: mocks.logSourceRepoDiagnostics,
  normalizeIdempotentResultErrors: mocks.normalizeIdempotentResultErrors,
  persistResourceMappings: mocks.persistResourceMappings,
}));

import { applyDeployment } from '../apply-deployment';
import { DeployLockError } from '../deploy-locks';

const ONE_NODE = [{ id: 'canvas-id-A', type: 'resource', data: { iceType: 'Database.PostgreSQL' } }];
const HAPPY_TRANSLATION = {
  graph: { nodes: { values: () => [] } },
  deployable_count: 1,
  deployables: [
    {
      node_id: 'canvas-id-A',
      label: 'PG',
      ice_type: 'Database.PostgreSQL',
      resource_type: 'gcp.sql.databaseInstance',
      resource_name: 'ice-pg-aaa',
    },
  ],
  warnings: [],
  skipped: [],
};

const happyDeployer = {
  cleanup: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: lock acquisition succeeds.
  const abortController = new AbortController();
  mocks.acquireDeployLock.mockReturnValue({
    release: vi.fn(),
    signal: abortController.signal,
  });
  mocks.getDecryptedCredentials.mockResolvedValue({ project_id: 'gcp-test-project' });
  mocks.cdCreate.mockResolvedValue({ id: 'deploy-1', card_id: 'card-A' });
  mocks.cdUpdate.mockResolvedValue(undefined);
  mocks.resolveProjectContext.mockResolvedValue({
    projectId: 'p1',
    projectName: 'p1-name',
    environmentType: 'development',
  });
  mocks.seedMappingsFromHistory.mockResolvedValue(undefined);
  mocks.getExistingNameMap.mockResolvedValue(new Map());
  mocks.getResourceMap.mockResolvedValue(new Map());
  mocks.translateCardToGraph.mockReturnValue(HAPPY_TRANSLATION);
  mocks.ensureAutoDeployRules.mockResolvedValue(undefined);
  happyDeployer.cleanup.mockResolvedValue(undefined);
  mocks.createDeployer.mockResolvedValue(happyDeployer);
  mocks.resolveProviderAuth.mockResolvedValue({
    authClient: { projectId: 'gcp-test-project' },
    scope: { project: 'gcp-test-project' },
    accessToken: 'fake-token',
    tempDir: '/tmp/ice-fake-apply',
  });
  mocks.autoEnableGCPApis.mockResolvedValue(undefined);
  mocks.buildBaselineGraph.mockResolvedValue({
    currentGraph: { nodes: { values: () => [] } },
    foundCount: 0,
    hasResults: false,
  });
  mocks.deployGraph.mockResolvedValue({
    success: true,
    resources: [{ name: 'ice-pg-aaa', success: true, action: 'create' }],
    errors: [],
    summary: { total: 1, created: 1, updated: 0, deleted: 0, skipped: 0, failed: 0 },
  });
  mocks.persistResourceMappings.mockResolvedValue(undefined);
  mocks.retryAfterQuotaCleanup.mockResolvedValue(undefined);
  mocks.flushSnapshotNow.mockResolvedValue(undefined);
});

describe('applyDeployment — lock acquisition', () => {
  it('returns success:false with code DEPLOY_IN_FLIGHT when the lock is contended', async () => {
    mocks.acquireDeployLock.mockImplementationOnce(() => {
      throw new DeployLockError('card-A', 'apply');
    });
    const out = await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    expect(out).toEqual({
      success: false,
      error: expect.stringContaining('apply is already in progress'),
      code: 'DEPLOY_IN_FLIGHT',
    });
  });

  it('rethrows non-DeployLockError exceptions from acquireDeployLock', async () => {
    mocks.acquireDeployLock.mockImplementationOnce(() => {
      throw new Error('unrelated init failure');
    });
    await expect(
      applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1'),
    ).rejects.toThrow('unrelated init failure');
  });
});

describe('applyDeployment — pre-translation validation', () => {
  it('throws when no provider credentials are present', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce(null);
    await expect(
      applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1'),
    ).rejects.toThrow(/Provider not connected/);
  });

  it('returns EMPTY_CANVAS without touching the DB when no non-container nodes are present', async () => {
    const out = await applyDeployment(
      'card-A',
      [],
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    expect(out).toEqual({
      success: false,
      error: expect.stringContaining('Nothing to deploy'),
      code: 'EMPTY_CANVAS',
    });
    expect(mocks.cdCreate).not.toHaveBeenCalled();
  });

  it('returns EMPTY_CANVAS when nodes contains only container/group entries', async () => {
    const out = await applyDeployment(
      'card-A',
      [
        { id: 'g1', type: 'container', data: { iceType: 'Group.Container' } },
        { id: 'g2', type: 'group', data: { iceType: 'Group.Group' } },
        null,
        { id: 'noice', type: 'resource', data: {} }, // no iceType
        { id: 'startsg', type: 'resource', data: { iceType: 'Group.Something' } },
      ],
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    expect((out as { code?: string }).code).toBe('EMPTY_CANVAS');
  });

  it('returns EMPTY_CANVAS when nodes is missing entirely', async () => {
    const out = await applyDeployment(
      'card-A',
      undefined as any,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    expect((out as { code?: string }).code).toBe('EMPTY_CANVAS');
  });
});

describe('applyDeployment — translation outcomes', () => {
  it('throws when translation returns 0 deployables (with skipped detail)', async () => {
    mocks.translateCardToGraph.mockReturnValueOnce({
      graph: { nodes: { values: () => [] } },
      deployable_count: 0,
      deployables: [],
      warnings: [],
      skipped: [
        { nodeId: 'n1', label: 'A', reason: 'unsupported provider' },
        { nodeId: 'n2', reason: 'no label here' },
      ],
    });
    const out = await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/0 deployable resources/);
    expect(out.error).toMatch(/All 2 block/);
    expect(out.error).toMatch(/A: unsupported provider/);
  });

  it('throws when translation returns 0 deployables with no skipped detail', async () => {
    mocks.translateCardToGraph.mockReturnValueOnce({
      graph: { nodes: { values: () => [] } },
      deployable_count: 0,
      deployables: [],
      warnings: [],
      skipped: [],
    });
    const out = await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/0 deployable resources/);
  });

  it('emits translator warnings as log lines when translation produces them', async () => {
    mocks.translateCardToGraph.mockReturnValueOnce({
      ...HAPPY_TRANSLATION,
      warnings: ['anti-pattern detected', 'dropped backend'],
    });
    await applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1');
    const logs = mocks.emitLog.mock.calls.map((c: any) => c[1]);
    expect(logs).toContain('[translator] anti-pattern detected');
    expect(logs).toContain('[translator] dropped backend');
  });

  it('emits a "Found N existing resources" log when baseline has results', async () => {
    mocks.buildBaselineGraph.mockResolvedValueOnce({
      currentGraph: { nodes: { values: () => [] } },
      foundCount: 5,
      hasResults: true,
    });
    await applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1');
    const logs = mocks.emitLog.mock.calls.map((c: any) => c[1]);
    expect(logs.some((m: string) => m.includes('Found 5 existing'))).toBe(true);
  });
});

describe('applyDeployment — happy path persistence', () => {
  it('returns success and persists status=success when result.success=true', async () => {
    const out = await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
      'user-1',
    );
    expect(out.success).toBe(true);
    expect(out.deploymentId).toBe('deploy-1');
    const updateCall = mocks.cdUpdate.mock.calls.find((c: any) => c[0]?.where?.id === 'deploy-1');
    expect(updateCall![0].data.status).toBe('success');
    expect(mocks.finishDeploySnapshot).toHaveBeenCalledWith('card-A', 'success');
  });

  it('persists status=partial when some resources succeeded but result.success=false', async () => {
    mocks.deployGraph.mockResolvedValueOnce({
      success: false,
      resources: [
        { name: 'r1', success: true, action: 'create' },
        { name: 'r2', success: false, action: 'create', error: 'boom' },
      ],
      errors: [],
    });
    const out = await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    expect(out.success).toBe(false);
    const updateCall = mocks.cdUpdate.mock.calls.find((c: any) => c[0]?.where?.id === 'deploy-1');
    expect(updateCall![0].data.status).toBe('partial');
    expect(mocks.finishDeploySnapshot).toHaveBeenCalledWith('card-A', 'partial');
  });

  it('persists status=failed when result.success=false and no resource succeeded', async () => {
    mocks.deployGraph.mockResolvedValueOnce({
      success: false,
      resources: [{ name: 'r1', success: false, action: 'create', error: 'boom' }],
      errors: [],
    });
    const out = await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    expect(out.success).toBe(false);
    const updateCall = mocks.cdUpdate.mock.calls.find((c: any) => c[0]?.where?.id === 'deploy-1');
    expect(updateCall![0].data.status).toBe('failed');
    expect(out.error).toBe('boom');
  });

  it('aggregates top-level + per-resource errors into the response error string', async () => {
    mocks.deployGraph.mockResolvedValueOnce({
      success: false,
      resources: [
        { name: 'r1', success: false, action: 'create', error: 'res-err' },
      ],
      errors: [{ message: 'top-err-1' }, { error: 'top-err-2' }, 'top-err-3'],
    });
    const out = await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    expect(out.error).toContain('top-err-1');
    expect(out.error).toContain('top-err-2');
    expect(out.error).toContain('top-err-3');
    expect(out.error).toContain('res-err');
  });

  it('uses the canned error when result.success=false and no errors present', async () => {
    mocks.deployGraph.mockResolvedValueOnce({
      success: false,
      resources: [],
      errors: [],
    });
    const out = await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    expect(out.error).toBe('Deployment failed — check resource configuration');
  });

  it('persists error column with joined messages when result has top-level errors', async () => {
    mocks.deployGraph.mockResolvedValueOnce({
      success: false,
      resources: [],
      errors: [{ message: 'first' }, { message: 'second' }],
    });
    await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    const updateCall = mocks.cdUpdate.mock.calls.find((c: any) => c[0]?.where?.id === 'deploy-1');
    expect(updateCall![0].data.error).toBe('first; second');
  });

  it('persists error=null when errors is empty', async () => {
    await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    const updateCall = mocks.cdUpdate.mock.calls.find((c: any) => c[0]?.where?.id === 'deploy-1');
    expect(updateCall![0].data.error).toBeNull();
  });
});

describe('applyDeployment — option fallbacks', () => {
  it('uses default region "us-central1" when options.region is missing', async () => {
    await applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1');
    expect(mocks.deployGraph).toHaveBeenCalled();
    const opts = mocks.deployGraph.mock.calls[0][3];
    expect(opts.regions).toEqual(['us-central1']);
  });

  it('uses options.gcpProject when provided, else credentials.project_id', async () => {
    await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', gcpProject: 'override-proj', executeAsync: false },
      'org-1',
    );
    // resolveProviderAuth received the override.
    const authArgs = mocks.resolveProviderAuth.mock.calls[0][1];
    expect(authArgs.requestedScope.project).toBe('override-proj');
  });

  it('falls back to provider="gcp" when options.provider is missing', async () => {
    await applyDeployment('card-A', ONE_NODE, [], { executeAsync: false }, 'org-1');
    expect(mocks.resolveProviderAuth).toHaveBeenCalled();
    expect(mocks.resolveProviderAuth.mock.calls[0][0]).toBe('gcp');
  });

  it('falls back to projectId from authClient when scope.project is missing', async () => {
    mocks.resolveProviderAuth.mockResolvedValueOnce({
      authClient: { projectId: 'fallback-proj-id' },
      scope: { project: null },
      accessToken: 'tok',
      tempDir: undefined,
    });
    await applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1');
    const opts = mocks.deployGraph.mock.calls[0][3];
    expect(opts.project).toBe('fallback-proj-id');
  });

  it('falls back to authClient.project_id when both scope.project and projectId are missing', async () => {
    mocks.resolveProviderAuth.mockResolvedValueOnce({
      authClient: { project_id: 'snake-proj' },
      scope: {},
      accessToken: 'tok',
      tempDir: undefined,
    });
    await applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1');
    const opts = mocks.deployGraph.mock.calls[0][3];
    expect(opts.project).toBe('snake-proj');
  });

  it('skips autoEnableGCPApis when no access token is available', async () => {
    mocks.resolveProviderAuth.mockResolvedValueOnce({
      authClient: { projectId: 'p' },
      scope: { project: 'p' },
      accessToken: null,
      tempDir: undefined,
    });
    await applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1');
    expect(mocks.autoEnableGCPApis).not.toHaveBeenCalled();
  });

  it('skips autoEnableGCPApis when provider is non-GCP', async () => {
    await applyDeployment('card-A', ONE_NODE, [], { provider: 'aws', executeAsync: false }, 'org-1');
    expect(mocks.autoEnableGCPApis).not.toHaveBeenCalled();
  });

  it('drives the resolveProviderAuth onLog callback through emitLog', async () => {
    mocks.resolveProviderAuth.mockImplementationOnce(async (_p: string, opts: any) => {
      opts.onLog('auth log');
      return {
        authClient: {},
        scope: { project: 'p' },
        accessToken: null,
        tempDir: undefined,
      };
    });
    await applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1');
    expect(mocks.emitLog.mock.calls.some((c: any) => c[1] === 'auth log')).toBe(true);
  });

  it('drives the autoEnableGCPApis log callback through emitLog', async () => {
    mocks.autoEnableGCPApis.mockImplementationOnce(async (_p: string, _t: any, _n: any, log: any) => {
      log('api enable line');
    });
    await applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1');
    expect(mocks.emitLog.mock.calls.some((c: any) => c[1] === 'api enable line')).toBe(true);
  });
});

describe('applyDeployment — engine catch path', () => {
  it('catches a thrown engine error, persists status=failed, emits failure complete', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.deployGraph.mockRejectedValueOnce(new Error('engine boom'));
    const out = await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    expect(out.success).toBe(false);
    expect(out.error).toBe('engine boom');
    const updateCall = mocks.cdUpdate.mock.calls.find((c: any) => c[0]?.where?.id === 'deploy-1');
    expect(updateCall![0].data.status).toBe('failed');
    expect(updateCall![0].data.error).toBe('engine boom');
    const evt = mocks.emitDeployEvent.mock.calls[0][1];
    expect(evt.outcome).toBe('failure');
    expect(mocks.finishDeploySnapshot).toHaveBeenCalledWith('card-A', 'failed');
    errorSpy.mockRestore();
  });

  it('emits outcome=cancelled on the catch path when the abort signal is set', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const aborted = new AbortController();
    aborted.abort();
    mocks.acquireDeployLock.mockReturnValueOnce({ release: vi.fn(), signal: aborted.signal });
    mocks.deployGraph.mockRejectedValueOnce(new Error('aborted'));
    await applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1');
    const evt = mocks.emitDeployEvent.mock.calls[0][1];
    expect(evt.outcome).toBe('cancelled');
    errorSpy.mockRestore();
  });

  it('always releases temp credentials, flushes snapshot, and releases the lock', async () => {
    const release = vi.fn();
    mocks.acquireDeployLock.mockReturnValueOnce({
      release,
      signal: new AbortController().signal,
    });
    await applyDeployment('card-A', ONE_NODE, [], { provider: 'gcp', executeAsync: false }, 'org-1');
    expect(mocks.releaseTempDir).toHaveBeenCalledWith('/tmp/ice-fake-apply');
    expect(mocks.flushSnapshotNow).toHaveBeenCalledWith('card-A');
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe('applyDeployment — async vs sync execution', () => {
  it('returns immediately with async:true and runs the body in the background by default', async () => {
    // Slow the deploy_graph call so the test can observe the early-return shape.
    let resolveBody: () => void = () => {};
    const bodyDone = new Promise<void>((r) => {
      resolveBody = r;
    });
    mocks.deployGraph.mockImplementationOnce(async () => {
      await bodyDone;
      return { success: true, resources: [], errors: [], summary: {} };
    });
    const out = await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp' }, // no executeAsync — defaults to async true
      'org-1',
    );
    expect(out).toEqual({ success: true, async: true, deploymentId: 'deploy-1' });
    resolveBody();
    // Let the background task settle.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('logs uncaught background errors via console.error when async body rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Force an unhandled rejection out of the background body. Make
    // `flushSnapshotNow` reject (it's awaited inside the finally block,
    // so its rejection bubbles to the outer .catch on line 485).
    mocks.flushSnapshotNow.mockRejectedValueOnce(new Error('flush boom'));
    const out = await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp' }, // async
      'org-1',
    );
    expect((out as { async?: boolean }).async).toBe(true);
    // Allow background body + .catch to run.
    await new Promise((r) => setTimeout(r, 10));
    const wasLogged = errorSpy.mock.calls.some((c) =>
      String(c[0] ?? '').includes('background uncaught'),
    );
    expect(wasLogged).toBe(true);
    errorSpy.mockRestore();
  });
});

describe('applyDeployment — projectName fallback', () => {
  it('uses options.projectName when project context has no projectName', async () => {
    mocks.resolveProjectContext.mockResolvedValueOnce({
      projectId: 'p1',
      projectName: null,
      environmentType: 'development',
    });
    await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', projectName: 'override-name', executeAsync: false },
      'org-1',
    );
    expect(mocks.translateCardToGraph).toHaveBeenCalled();
    const arg = mocks.translateCardToGraph.mock.calls[0][0];
    expect(arg.projectName).toBe('override-name');
  });

  it('falls back to projectId when neither context.projectName nor options.projectName', async () => {
    mocks.resolveProjectContext.mockResolvedValueOnce({
      projectId: 'pid-fallback',
      projectName: null,
      environmentType: 'development',
    });
    await applyDeployment(
      'card-A',
      ONE_NODE,
      [],
      { provider: 'gcp', executeAsync: false },
      'org-1',
    );
    const arg = mocks.translateCardToGraph.mock.calls[0][0];
    expect(arg.projectName).toBe('pid-fallback');
  });
});

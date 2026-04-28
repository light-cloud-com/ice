/**
 * Tests for the pdl-4 service-layer wire migration:
 *
 * - graph_node_id → canvas_node_id translation in `on_node_status` /
 *   `on_node_progress` (the load-bearing pdl-4 contract).
 * - unknown graph_node_id drops the wire emit + logs a warn (drop is
 *   safer than miscorrelated; see the `scheduler-resource-name-vs-graph-
 *   node-id-vs-canvas-node-id` learning).
 * - seq is monotonically increasing within a single deploy.
 * - `emitDeployComplete` outcome derivation: success / partial /
 *   failure / cancelled.
 *
 * Strategy: mock `@ice/shared`, `@ice/db`, `@ice/service-credentials`,
 * and `@ice/core`. The `@ice/core` mock returns a `deploy_graph` stub
 * that captures the options passed in by `applyDeployment` and then
 * lets the test drive `on_node_status` / `on_node_progress` against
 * those captured callbacks. After the captured drives complete, the
 * stub returns a synthetic `DeployResult` so applyDeployment continues
 * to the `complete` event emission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mocks ──────────────────────────────────────────────────────────────────

const emitDeployNodeStatus = vi.fn();
const emitDeployNodeProgress = vi.fn();
const emitDeployComplete = vi.fn();
const emitDeployLog = vi.fn();
const emitDeployRequirementVerified = vi.fn();
const emitPipelineUpdate = vi.fn();

vi.mock('@ice/shared', () => ({
  emitDeployNodeStatus,
  emitDeployNodeProgress,
  emitDeployComplete,
  emitDeployLog,
  emitDeployRequirementVerified,
  emitPipelineUpdate,
  requireAuth: vi.fn(),
  requireProjectAccess: vi.fn(),
}));

const mockCanvasDeployment = {
  create: vi.fn().mockResolvedValue({ id: 'deploy-1', card_id: 'card-1' }),
  update: vi.fn().mockResolvedValue(undefined),
  findFirst: vi.fn().mockResolvedValue(null),
  findUnique: vi.fn().mockResolvedValue({
    id: 'card-1',
    project: { id: 'p1', name: 'p1-name' },
    environment: { type: 'development', name: 'dev' },
  }),
};

const mockCanvasCard = {
  findUnique: vi.fn().mockResolvedValue({
    id: 'card-1',
    project: { id: 'p1', name: 'p1-name' },
    environment: { type: 'development', name: 'dev' },
  }),
};

const mockDeployedResourceMapping = {
  findMany: vi.fn().mockResolvedValue([]),
  upsert: vi.fn().mockResolvedValue(undefined),
};

const mockDeployEvent = {
  createMany: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: mockCanvasDeployment,
    canvasCard: mockCanvasCard,
    deployedResourceMapping: mockDeployedResourceMapping,
    deployEvent: mockDeployEvent,
  },
}));

vi.mock('@ice/service-credentials', () => ({
  getDecryptedCredentials: vi.fn().mockResolvedValue({ project_id: 'gcp-test-project' }),
  getValidGCPAccessToken: vi.fn().mockResolvedValue(null),
}));

// Capture callbacks passed to `deploy_graph` so the test can drive them.
let capturedDeployOptions: any = null;
let nextDeployResult: any = {
  success: true,
  resources: [],
  errors: [],
  warnings: [],
  summary: { total: 0, created: 0, updated: 0, deleted: 0, skipped: 0, failed: 0 },
  provider: 'gcp',
  started_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
  duration_ms: 1,
};

const fakeTranslation = {
  graph: { nodes: { values: () => [] }, edges: { values: () => [] } },
  deployable_count: 2,
  deployables: [
    {
      node_id: 'canvas-id-A',
      label: 'Database A',
      ice_type: 'Database.PostgreSQL',
      resource_type: 'gcp.sql.databaseInstance',
      resource_name: 'ice-foo-prod-instance-aaa',
    },
    {
      node_id: 'canvas-id-B',
      label: 'Bucket B',
      ice_type: 'Storage.Bucket',
      resource_type: 'gcp.storage.bucket',
      resource_name: 'ice-foo-prod-bucket-bbb',
    },
  ],
  warnings: [],
  skipped: [],
};

vi.mock('@ice/core', () => {
  const fakeDeployer = {
    initialize: async () => undefined,
    cleanup: async () => undefined,
    create: () => undefined,
    update: () => undefined,
    delete: () => undefined,
  };
  // Plain functions (not vi.fn()) so vi.clearAllMocks() doesn't wipe
  // the implementation. The closure reads/writes the module-scoped
  // `capturedDeployOptions` and `nextDeployResult` so each test can
  // tweak the result before invoking applyDeployment.
  return {
    translate_card_to_graph: () => fakeTranslation,
    deploy_graph: async (_d: any, _c: any, _dpl: any, options: any) => {
      capturedDeployOptions = options;
      return nextDeployResult;
    },
    GCPDeployer: function GCPDeployer() {
      return fakeDeployer;
    },
    AWSDeployer: function AWSDeployer() {
      return fakeDeployer;
    },
    AzureDeployer: function AzureDeployer() {
      return fakeDeployer;
    },
    MutableGraph: class {
      add_node() {}
      get nodes() {
        return { values: () => [] };
      }
    },
  };
});

vi.mock('../providers/registry.js', () => ({
  resolveProviderAuth: vi.fn().mockResolvedValue({
    authClient: {},
    scope: { project: 'gcp-test-project' },
    accessToken: null,
    keyFilePath: undefined,
    parsedCredentials: undefined,
    tempDir: undefined,
  }),
  cleanupProviderAuth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/resource-mapping.service.js', () => ({
  getExistingNameMap: vi.fn().mockResolvedValue(new Map()),
  getResourceMap: vi.fn().mockResolvedValue(new Map()),
  seedMappingsFromHistory: vi.fn().mockResolvedValue(undefined),
  upsertResourceMapping: vi.fn().mockResolvedValue(undefined),
  removeResourceMapping: vi.fn().mockResolvedValue(undefined),
}));

// ── helpers ────────────────────────────────────────────────────────────────

async function getApplyDeployment() {
  const mod = await import('../services/deploy.service.js');
  return mod.applyDeployment;
}

async function getOutcomeHelpers() {
  const mod = await import('../services/deploy.service.js');
  return {
    deriveCompleteOutcome: mod.deriveCompleteOutcome,
    computeCompleteTotals: mod.computeCompleteTotals,
    mapStatusToOverlay: mod.mapStatusToOverlay,
  };
}

const ONE_NODE = [{ id: 'canvas-id-A', type: 'resource', data: { iceType: 'Database.PostgreSQL' } }];
const TWO_NODES = [
  { id: 'canvas-id-A', type: 'resource', data: { iceType: 'Database.PostgreSQL' } },
  { id: 'canvas-id-B', type: 'resource', data: { iceType: 'Storage.Bucket' } },
];

beforeEach(() => {
  // `vi.clearAllMocks` only resets call history; the
  // `mockResolvedValue` chains stay. But explicit re-application
  // protects against any test that overrides them.
  vi.clearAllMocks();
  capturedDeployOptions = null;
  nextDeployResult = {
    success: true,
    resources: [],
    errors: [],
    warnings: [],
    summary: { total: 0, created: 0, updated: 0, deleted: 0, skipped: 0, failed: 0 },
    provider: 'gcp',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: 1,
  };
  mockCanvasDeployment.create.mockResolvedValue({ id: 'deploy-1', card_id: 'card-1' });
  mockCanvasDeployment.update.mockResolvedValue(undefined);
  mockCanvasDeployment.findFirst.mockResolvedValue(null);
  mockCanvasDeployment.findUnique.mockResolvedValue({
    id: 'card-1',
    project: { id: 'p1', name: 'p1-name' },
    environment: { type: 'development', name: 'dev' },
  });
  mockCanvasCard.findUnique.mockResolvedValue({
    id: 'card-1',
    project: { id: 'p1', name: 'p1-name' },
    environment: { type: 'development', name: 'dev' },
  });
  mockDeployedResourceMapping.findMany.mockResolvedValue([]);
  mockDeployedResourceMapping.upsert.mockResolvedValue(undefined);
  mockDeployEvent.createMany.mockResolvedValue(undefined);
});

// ── tests ──────────────────────────────────────────────────────────────────

describe('pdl-4 graph→canvas id translation', () => {
  it('translates graph_node_id → canvas_node_id on on_node_status', async () => {
    const applyDeployment = await getApplyDeployment();
    await applyDeployment(
      'card-1',
      TWO_NODES,
      [],
      { provider: 'gcp', region: 'us-central1', executeAsync: false },
      'org-1',
      'user-1',
    );
    expect(capturedDeployOptions).toBeTruthy();
    expect(capturedDeployOptions.on_node_status).toBeTypeOf('function');

    // Drive the captured `on_node_status` with a graph_node_id that
    // matches one of the deployables. The wire emit should carry the
    // canvas id (`canvas-id-A`), NOT the graph id.
    capturedDeployOptions.on_node_status({
      node_id: 'gcp.sql.databaseInstance:ice-foo-prod-instance-aaa',
      resource_name: 'ice-foo-prod-instance-aaa',
      resource_type: 'gcp.sql.databaseInstance',
      action: 'create',
      status: 'applying',
      at: '2026-04-28T00:00:00Z',
    });

    const calls = emitDeployNodeStatus.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const lastCall = calls[calls.length - 1];
    const cardId = lastCall[0];
    const event = lastCall[1];
    expect(cardId).toBe('card-1');
    expect(event.type).toBe('node_status');
    expect(event.node_id).toBe('canvas-id-A');
    expect(event.resource_name).toBe('ice-foo-prod-instance-aaa');
    expect(event.resource_type).toBe('gcp.sql.databaseInstance');
    expect(event.action).toBe('create');
    expect(event.status).toBe('applying');
    expect(typeof event.seq).toBe('number');
  });

  it('drops wire emit + warns when graph_node_id has no canvas mapping', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const applyDeployment = await getApplyDeployment();
    await applyDeployment(
      'card-1',
      TWO_NODES,
      [],
      { provider: 'gcp', region: 'us-central1', executeAsync: false },
      'org-1',
      'user-1',
    );
    const beforeCount = emitDeployNodeStatus.mock.calls.length;

    capturedDeployOptions.on_node_status({
      node_id: 'gcp.unknown.type:not-a-real-resource',
      resource_name: 'not-a-real-resource',
      resource_type: 'gcp.unknown.type',
      action: 'create',
      status: 'applying',
      at: '2026-04-28T00:00:00Z',
    });

    expect(emitDeployNodeStatus.mock.calls.length).toBe(beforeCount);
    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls.join(' ');
    expect(warnArgs).toMatch(/no canvas id/);
    expect(warnArgs).toMatch(/gcp\.unknown\.type:not-a-real-resource/);
    warnSpy.mockRestore();
  });

  it('translates graph_node_id → canvas_node_id on on_node_progress', async () => {
    const applyDeployment = await getApplyDeployment();
    await applyDeployment(
      'card-1',
      TWO_NODES,
      [],
      { provider: 'gcp', region: 'us-central1', executeAsync: false },
      'org-1',
      'user-1',
    );
    capturedDeployOptions.on_node_progress({
      node_id: 'gcp.storage.bucket:ice-foo-prod-bucket-bbb',
      resource_name: 'ice-foo-prod-bucket-bbb',
      step: { label: 'Setting IAM', index: 1, total: 3 },
      at: '2026-04-28T00:00:00Z',
    });

    const calls = emitDeployNodeProgress.mock.calls;
    expect(calls.length).toBe(1);
    const event = calls[0][1];
    expect(event.type).toBe('node_progress');
    expect(event.node_id).toBe('canvas-id-B');
    expect(event.resource_name).toBe('ice-foo-prod-bucket-bbb');
    expect(event.step).toEqual({ label: 'Setting IAM', index: 1, total: 3 });
  });

  it('drops on_node_progress wire emit when graph_node_id has no canvas mapping (silent — no spam)', async () => {
    const applyDeployment = await getApplyDeployment();
    await applyDeployment(
      'card-1',
      TWO_NODES,
      [],
      { provider: 'gcp', region: 'us-central1', executeAsync: false },
      'org-1',
      'user-1',
    );
    capturedDeployOptions.on_node_progress({
      node_id: 'gcp.totally.unknown:x',
      resource_name: 'x',
      step: { label: 'unknown', index: 1, total: 1 },
      at: '2026-04-28T00:00:00Z',
    });
    expect(emitDeployNodeProgress).not.toHaveBeenCalled();
  });
});

describe('pdl-4 seq allocation', () => {
  it('emits monotonically increasing seq within a single deploy', async () => {
    const applyDeployment = await getApplyDeployment();
    await applyDeployment(
      'card-1',
      TWO_NODES,
      [],
      { provider: 'gcp', region: 'us-central1', executeAsync: false },
      'org-1',
      'user-1',
    );

    // Drive multiple events from the captured callbacks. After
    // applyDeployment returns, only the `complete` event has fired —
    // drive a few more events to verify seq behaviour while the deploy
    // is still notionally active. We rely on the snapshot being live
    // until a `setTimeout` clears it — well within this test's tick.
    capturedDeployOptions.on_node_status({
      node_id: 'gcp.sql.databaseInstance:ice-foo-prod-instance-aaa',
      resource_name: 'ice-foo-prod-instance-aaa',
      resource_type: 'gcp.sql.databaseInstance',
      action: 'create',
      status: 'applying',
      at: '2026-04-28T00:00:00Z',
    });
    capturedDeployOptions.on_node_progress({
      node_id: 'gcp.sql.databaseInstance:ice-foo-prod-instance-aaa',
      resource_name: 'ice-foo-prod-instance-aaa',
      step: { label: 'Provisioning', index: 1, total: 3 },
      at: '2026-04-28T00:00:01Z',
    });
    capturedDeployOptions.on_node_status({
      node_id: 'gcp.storage.bucket:ice-foo-prod-bucket-bbb',
      resource_name: 'ice-foo-prod-bucket-bbb',
      resource_type: 'gcp.storage.bucket',
      action: 'create',
      status: 'succeeded',
      at: '2026-04-28T00:00:02Z',
    });

    // Pull seqs from every wire mock — emits aren't ordered across
    // mocks (each `vi.fn()` keeps its own call list), so we just verify
    // the GLOBAL set is contiguous and unique. A single deploy's
    // events should all have unique seqs in a contiguous range — the
    // exact ordering is not guaranteed when reading from multiple
    // mocks in parallel.
    const allSeqs: number[] = [];
    for (const fn of [
      emitDeployNodeStatus,
      emitDeployNodeProgress,
      emitDeployLog,
      emitDeployComplete,
    ]) {
      for (const call of fn.mock.calls) {
        const ev = call[1];
        if (typeof ev?.seq === 'number') allSeqs.push(ev.seq);
      }
    }
    expect(allSeqs.length).toBeGreaterThanOrEqual(4);
    // No duplicates.
    const set = new Set(allSeqs);
    expect(set.size).toBe(allSeqs.length);
    // Contiguous: max - min + 1 should equal count, since all seqs
    // come from a single nextDeploySeq() counter.
    const sorted = allSeqs.slice().sort((a, b) => a - b);
    expect(sorted[sorted.length - 1] - sorted[0] + 1).toBe(allSeqs.length);
    // All positive integers (not Date.now() fallback). nextDeploySeq
    // should be live for every event in this deploy because the
    // snapshot is open for the duration of the test (seqs above are
    // small ints, e.g. 1..20, not 1.7e12).
    for (const s of allSeqs) {
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(1_000_000); // safely below Date.now()
    }
  });
});

describe('pdl-4 deriveCompleteOutcome', () => {
  it('all-succeed → success', async () => {
    const { deriveCompleteOutcome } = await getOutcomeHelpers();
    expect(
      deriveCompleteOutcome([
        { success: true, action: 'create' },
        { success: true, action: 'create' },
      ]),
    ).toBe('success');
  });

  it('mixed succeed+fail → partial', async () => {
    const { deriveCompleteOutcome } = await getOutcomeHelpers();
    expect(
      deriveCompleteOutcome([
        { success: true, action: 'create' },
        { success: false, action: 'create', error: 'boom' },
      ]),
    ).toBe('partial');
  });

  it('all-fail → failure', async () => {
    const { deriveCompleteOutcome } = await getOutcomeHelpers();
    expect(
      deriveCompleteOutcome([
        { success: false, action: 'create', error: 'boom' },
        { success: false, action: 'create', error: 'boom2' },
      ]),
    ).toBe('failure');
  });

  it('empty resources + engineSuccess true → success', async () => {
    const { deriveCompleteOutcome } = await getOutcomeHelpers();
    expect(deriveCompleteOutcome([], { engineSuccess: true })).toBe('success');
  });

  it('empty resources + engineSuccess false → failure', async () => {
    const { deriveCompleteOutcome } = await getOutcomeHelpers();
    expect(deriveCompleteOutcome([], { engineSuccess: false })).toBe('failure');
  });

  it('cancelled mid-deploy with no successes → cancelled', async () => {
    const { deriveCompleteOutcome } = await getOutcomeHelpers();
    expect(deriveCompleteOutcome([], { cancelled: true })).toBe('cancelled');
  });

  it('all-cancelled-due-to-dep with no success → cancelled', async () => {
    const { deriveCompleteOutcome } = await getOutcomeHelpers();
    expect(
      deriveCompleteOutcome([
        { success: false, action: 'create', error: 'cancelled-due-to-dep' },
        { success: false, action: 'create', error: 'cancelled-due-to-dep' },
      ]),
    ).toBe('cancelled');
  });

  it('cancelled mid-deploy with one success → partial (the user has artifact to clean up)', async () => {
    const { deriveCompleteOutcome } = await getOutcomeHelpers();
    expect(
      deriveCompleteOutcome(
        [
          { success: true, action: 'create' },
          { success: false, action: 'create', error: 'cancelled-due-to-dep' },
        ],
        { cancelled: true },
      ),
    ).toBe('partial');
  });
});

describe('pdl-4 computeCompleteTotals', () => {
  it('counts succeeded vs failed', async () => {
    const { computeCompleteTotals } = await getOutcomeHelpers();
    const totals = computeCompleteTotals([
      { success: true },
      { success: true },
      { success: false, action: 'create', error: 'oops' },
    ]);
    expect(totals.succeeded).toBe(2);
    expect(totals.failed).toBe(1);
    expect(totals.cancelled).toBe(0);
  });

  it('separates cancelled-due-to-dep from regular failures', async () => {
    const { computeCompleteTotals } = await getOutcomeHelpers();
    const totals = computeCompleteTotals([
      { success: false, action: 'create', error: 'cancelled-due-to-dep' },
      { success: false, action: 'create', error: 'real failure' },
    ]);
    expect(totals.cancelled).toBe(1);
    expect(totals.failed).toBe(1);
  });

  it('counts skip action as skipped', async () => {
    const { computeCompleteTotals } = await getOutcomeHelpers();
    const totals = computeCompleteTotals([
      { success: false, action: 'skip' },
    ]);
    expect(totals.skipped).toBe(1);
    expect(totals.failed).toBe(0);
  });
});

describe('pdl-4 mapStatusToOverlay', () => {
  it('maps applying / queued → deploying', async () => {
    const { mapStatusToOverlay } = await getOutcomeHelpers();
    expect(mapStatusToOverlay('applying')).toBe('deploying');
    expect(mapStatusToOverlay('queued')).toBe('deploying');
  });

  it('maps succeeded → active, failed → error, skipped/cancel → skipped', async () => {
    const { mapStatusToOverlay } = await getOutcomeHelpers();
    expect(mapStatusToOverlay('succeeded')).toBe('active');
    expect(mapStatusToOverlay('failed')).toBe('error');
    expect(mapStatusToOverlay('skipped')).toBe('skipped');
    expect(mapStatusToOverlay('cancelled-due-to-dep')).toBe('skipped');
  });
});

describe('pdl-4 complete-event emission', () => {
  it('emits a complete event with derived outcome on the wire', async () => {
    nextDeployResult = {
      success: true,
      resources: [
        { name: 'r1', type: 'gcp.storage.bucket', action: 'create', success: true, duration_ms: 1, resource_id: 'r1' },
      ],
      errors: [],
      warnings: [],
      summary: { total: 1, created: 1, updated: 0, deleted: 0, skipped: 0, failed: 0 },
      provider: 'gcp',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: 1,
    };
    const applyDeployment = await getApplyDeployment();
    await applyDeployment(
      'card-1',
      ONE_NODE,
      [],
      { provider: 'gcp', region: 'us-central1', executeAsync: false },
      'org-1',
      'user-1',
    );
    expect(emitDeployComplete).toHaveBeenCalled();
    const completeCall = emitDeployComplete.mock.calls[0];
    const event = completeCall[1];
    expect(event.type).toBe('complete');
    expect(event.outcome).toBe('success');
    expect(event.totals.succeeded).toBe(1);
    expect(typeof event.seq).toBe('number');
    expect(typeof event.at).toBe('string');
  });
});

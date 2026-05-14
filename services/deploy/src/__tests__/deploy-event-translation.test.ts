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
  // pdl-10 — destroyAllForCard reads historical deploys via findMany.
  findMany: vi.fn().mockResolvedValue([]),
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
  // pdl-10 — destroyAllForCard cleans up mapping rows after each
  // successful resource deletion.
  deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
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

// pdl-10 — destroy tests need to drive `deployer.delete(...)` per-call.
// Each test sets `nextDeleteHandler` (or leaves the default) to control
// the response shape; `recordedDeleteCalls` captures the arguments so
// tests can assert call counts and args.
let nextDeleteHandler: (
  type: string,
  name: string,
  providerId: string,
  ctx: any,
) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string } = () => ({
  success: true,
});
const recordedDeleteCalls: Array<{ type: string; name: string; providerId: string }> = [];

vi.mock('@ice/core', () => {
  const fakeDeployer = {
    initialize: async () => undefined,
    cleanup: async () => undefined,
    create: () => undefined,
    update: () => undefined,
    delete: async (type: string, name: string, providerId: string, ctx: any) => {
      recordedDeleteCalls.push({ type, name, providerId });
      return await nextDeleteHandler(type, name, providerId, ctx);
    },
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

vi.mock('../providers/registry', () => ({
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

vi.mock('../services/resource-mapping.service', () => ({
  getExistingNameMap: vi.fn().mockResolvedValue(new Map()),
  getResourceMap: vi.fn().mockResolvedValue(new Map()),
  seedMappingsFromHistory: vi.fn().mockResolvedValue(undefined),
  upsertResourceMapping: vi.fn().mockResolvedValue(undefined),
  removeResourceMapping: vi.fn().mockResolvedValue(undefined),
}));

// ── helpers ────────────────────────────────────────────────────────────────

async function getApplyDeployment() {
  const mod = await import('../services/deploy.service');
  return mod.applyDeployment;
}

// pdl-10 — destroy paths need access to `destroyDeployment` and
// `destroyAllForCard`. Both walk persisted deployment data and emit
// per-resource node_status events with `action: 'delete'`.
async function getDestroyDeployment() {
  const mod = await import('../services/deploy.service');
  return mod.destroyDeployment;
}

async function getDestroyAllForCard() {
  const mod = await import('../services/deploy.service');
  return mod.destroyAllForCard;
}

async function getOutcomeHelpers() {
  // rf-deploy-2 — `computeCompleteTotals` and `deriveCompleteOutcome` now
  // live in `../utils/deploy-outcome.js` (still re-exported from
  // deploy.service.ts for the public API). Tests bind to the canonical
  // home so they exercise the new module directly. `mapStatusToOverlay`
  // is in `../utils/deploy-event-formatter.js` (rf-deploy-1).
  const outcome = await import('../utils/deploy-outcome');
  const formatter = await import('../utils/deploy-event-formatter');
  return {
    deriveCompleteOutcome: outcome.deriveCompleteOutcome,
    computeCompleteTotals: outcome.computeCompleteTotals,
    mapStatusToOverlay: formatter.mapStatusToOverlay,
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
  // pdl-10 — reset destroy-side mock state so each test starts clean.
  // `nextDeleteHandler` defaults to "always succeed"; the `failed` /
  // `throw` tests below override it before driving destroy.
  nextDeleteHandler = () => ({ success: true });
  recordedDeleteCalls.length = 0;
  mockCanvasDeployment.create.mockResolvedValue({ id: 'deploy-1', card_id: 'card-1' });
  mockCanvasDeployment.update.mockResolvedValue(undefined);
  mockCanvasDeployment.findFirst.mockResolvedValue(null);
  mockCanvasDeployment.findMany.mockResolvedValue([]);
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

describe('pdl-8 seq roundtrip — wire emit + persistent log share one seq', () => {
  it('every wire-emitted event lands on the persistent log row with the same seq', async () => {
    // Critic-flagged gap from pdl-7 review: the seq monotonicity test
    // above only inspects wire mocks. The whole point of the
    // nextDeploySeq() split (per learning anchor
    // `seq-allocation-must-be-shared-between-wire-and-log`) is that the
    // wire emit and the persistent event log carry the SAME seq for
    // each logical event — so a frontend reconnecting and replaying
    // the persistent tape sees the same seq it would have via the live
    // socket. This test drives a few events, flushes the persistent
    // log, and asserts the seqs match.
    const applyDeployment = await getApplyDeployment();
    const { flushDeployEvents } = await import('../services/deploy-event-log');
    mockDeployEvent.createMany.mockClear();

    await applyDeployment(
      'card-1',
      TWO_NODES,
      [],
      { provider: 'gcp', region: 'us-central1', executeAsync: false },
      'org-1',
      'user-1',
    );

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
      step: { label: 'Creating instance', index: 1, total: 2 },
      at: '2026-04-28T00:00:01Z',
    });
    capturedDeployOptions.on_node_status({
      node_id: 'gcp.sql.databaseInstance:ice-foo-prod-instance-aaa',
      resource_name: 'ice-foo-prod-instance-aaa',
      resource_type: 'gcp.sql.databaseInstance',
      action: 'create',
      status: 'succeeded',
      duration_ms: 12_345,
      at: '2026-04-28T00:00:02Z',
    });

    // Flush the persistent log so createMany fires synchronously.
    await flushDeployEvents();

    // Pull the wire-emitted seqs (only the per-type mocks for the events
    // we drove — node_status fires through emitDeployNodeStatus, etc.).
    const wireSeqs: number[] = [];
    for (const fn of [emitDeployNodeStatus, emitDeployNodeProgress]) {
      for (const call of fn.mock.calls) {
        const ev = call[1];
        if (typeof ev?.seq === 'number') wireSeqs.push(ev.seq);
      }
    }

    // Pull the persistent-log rows from the createMany mock. Each call
    // batches `data: Array<{ seq, type, payload }>` rows.
    const persistedSeqs: number[] = [];
    for (const call of mockDeployEvent.createMany.mock.calls) {
      const arg = call[0];
      const rows = (arg?.data ?? []) as Array<{ seq: number }>;
      for (const row of rows) {
        if (typeof row.seq === 'number') persistedSeqs.push(row.seq);
      }
    }

    // Both sides must have at least the 3 events we drove. (The
    // applyDeployment call also fires a `complete` and one or more
    // `log` events — those go through different per-type emit mocks
    // than the wireSeqs we collected, but DO go through recordDeployEvent
    // and so will appear in persistedSeqs. So persistedSeqs.length >=
    // wireSeqs.length is the invariant; the converse isn't strict.)
    expect(wireSeqs.length).toBeGreaterThanOrEqual(3);
    expect(persistedSeqs.length).toBeGreaterThanOrEqual(wireSeqs.length);

    // Every wire-emit seq must appear in the persistent log — that's
    // the load-bearing claim of the nextDeploySeq() split.
    const persistedSet = new Set(persistedSeqs);
    for (const seq of wireSeqs) {
      expect(persistedSet.has(seq)).toBe(true);
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
  // Mapping aligned with the frontend's `mapWireStatusToOverlay` in
  // `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts`.
  // Both sides must produce the same overlay string for the same wire
  // status — divergence means the snapshot path and live-event path
  // disagree on color for the same node.
  it('maps queued → queued and applying → deploying', async () => {
    const { mapStatusToOverlay } = await getOutcomeHelpers();
    expect(mapStatusToOverlay('queued')).toBe('queued');
    expect(mapStatusToOverlay('applying')).toBe('deploying');
  });

  it('maps succeeded → active, failed → error, skipped → skipped, cancelled-due-to-dep → cancelled', async () => {
    const { mapStatusToOverlay } = await getOutcomeHelpers();
    expect(mapStatusToOverlay('succeeded')).toBe('active');
    expect(mapStatusToOverlay('failed')).toBe('error');
    expect(mapStatusToOverlay('skipped')).toBe('skipped');
    expect(mapStatusToOverlay('cancelled-due-to-dep')).toBe('cancelled');
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

describe('pdl-10 destroy emits per-resource node_status events', () => {
  // Build a `latestApply` row with persisted resources that have
  // `source_node_id` populated (the post-pdl-4 shape). The destroy path
  // uses these directly as the canvas correlation — no card-translator
  // translation needed.
  function buildAppliedDeployment(resources: any[]) {
    return {
      id: 'apply-baseline-1',
      card_id: 'card-destroy-1',
      provider: 'gcp',
      region: 'us-central1',
      environment: 'development',
      status: 'success',
      action_type: 'apply',
      results: { resources },
      created_at: new Date('2026-04-28T00:00:00Z'),
    };
  }

  it('emits queued → applying → succeeded for each resource with source_node_id', async () => {
    // Two buckets, both with source_node_id set (the pdl-4 stamp).
    const applied = buildAppliedDeployment([
      {
        name: 'ice-foo-prod-bucket-aaa',
        type: 'gcp.storage.bucket',
        success: true,
        provider_id: 'gs://ice-foo-prod-bucket-aaa',
        source_node_id: 'canvas-id-A',
      },
      {
        name: 'ice-foo-prod-bucket-bbb',
        type: 'gcp.storage.bucket',
        success: true,
        provider_id: 'gs://ice-foo-prod-bucket-bbb',
        source_node_id: 'canvas-id-B',
      },
    ]);
    // First findFirst → latestApply; second → newerDestroy (none).
    mockCanvasDeployment.findFirst.mockResolvedValueOnce(applied as any).mockResolvedValueOnce(null);
    mockCanvasDeployment.create.mockResolvedValueOnce({
      id: 'destroy-record-1',
      card_id: 'card-destroy-1',
      created_at: new Date(),
    });

    const destroyDeployment = await getDestroyDeployment();
    await destroyDeployment('card-destroy-1', 'org-1', 'user-1');

    // Pull all action='delete' node_status emits.
    const destroyEmits = emitDeployNodeStatus.mock.calls.filter((c) => c[1]?.action === 'delete');

    // 2 resources × 3 events each (queued, applying, succeeded) = 6 emits.
    expect(destroyEmits.length).toBe(6);

    // Group by canvas node id and verify the lifecycle order per node.
    const byNode = new Map<string, string[]>();
    for (const call of destroyEmits) {
      const ev = call[1];
      const list = byNode.get(ev.node_id) || [];
      list.push(ev.status);
      byNode.set(ev.node_id, list);
    }
    expect(byNode.get('canvas-id-A')).toEqual(['queued', 'applying', 'succeeded']);
    expect(byNode.get('canvas-id-B')).toEqual(['queued', 'applying', 'succeeded']);

    // The terminal `succeeded` event must carry duration_ms (wall-clock
    // elapsed since the `applying` emit) so the row UI can render the
    // "X.Ys" suffix for completed destroys.
    const terminalA = destroyEmits.find(
      (c) => c[1].node_id === 'canvas-id-A' && c[1].status === 'succeeded',
    )?.[1];
    expect(typeof terminalA.duration_ms).toBe('number');
    expect(terminalA.duration_ms).toBeGreaterThanOrEqual(0);

    // Every emit must carry action='delete' (NOT 'create') so the
    // frontend's action-aware row labels render DESTROY/GONE correctly.
    for (const call of destroyEmits) {
      expect(call[1].action).toBe('delete');
    }

    // Wire emits should also share contiguous seqs with the rest of the
    // destroy events (log lines, complete) — `startDeploySnapshot` opens
    // the seq counter for the destroy operation.
    const allDestroySeqs = destroyEmits.map((c) => c[1].seq);
    for (const seq of allDestroySeqs) {
      expect(typeof seq).toBe('number');
      expect(seq).toBeGreaterThan(0);
      // Must be a small integer from nextDeploySeq, not Date.now().
      expect(seq).toBeLessThan(1_000_000);
    }
    // No duplicate seqs.
    expect(new Set(allDestroySeqs).size).toBe(allDestroySeqs.length);
  });

  it('skips resources without source_node_id (legacy pre-pdl-4 rows) but still logs them', async () => {
    // One legacy resource (no source_node_id) + one modern (with).
    const applied = buildAppliedDeployment([
      {
        name: 'legacy-bucket',
        type: 'gcp.storage.bucket',
        success: true,
        provider_id: 'gs://legacy-bucket',
        // No source_node_id — this is the pre-pdl-4 shape.
      },
      {
        name: 'modern-bucket',
        type: 'gcp.storage.bucket',
        success: true,
        provider_id: 'gs://modern-bucket',
        source_node_id: 'canvas-id-modern',
      },
    ]);
    mockCanvasDeployment.findFirst.mockResolvedValueOnce(applied as any).mockResolvedValueOnce(null);
    mockCanvasDeployment.create.mockResolvedValueOnce({
      id: 'destroy-record-2',
      card_id: 'card-destroy-2',
      created_at: new Date(),
    });

    const destroyDeployment = await getDestroyDeployment();
    await destroyDeployment('card-destroy-2', 'org-1', 'user-1');

    const destroyEmits = emitDeployNodeStatus.mock.calls.filter((c) => c[1]?.action === 'delete');
    // Only the modern-bucket row should produce wire emits (3 events:
    // queued, applying, succeeded). The legacy row stays log-only.
    expect(destroyEmits.length).toBe(3);
    for (const call of destroyEmits) {
      expect(call[1].node_id).toBe('canvas-id-modern');
    }

    // Legacy row should still be visible on the log surface — both
    // resources should appear in the per-resource log line emit ("X:
    // delete completed/failed").
    const logMessages = emitDeployLog.mock.calls.map((c) => c[1]?.message || '');
    const legacyLogged = logMessages.some(
      (m) => typeof m === 'string' && m.includes('legacy-bucket') && m.includes('delete'),
    );
    expect(legacyLogged).toBe(true);

    // And both resources should have actually been deleted on the cloud
    // side — wire-emit gating must NOT affect the destroy mechanics.
    expect(recordedDeleteCalls.length).toBe(2);
    expect(recordedDeleteCalls.map((c) => c.name).sort()).toEqual(
      ['legacy-bucket', 'modern-bucket'].sort(),
    );
  });

  it('emits status=failed with error.message when deployer.delete throws', async () => {
    const applied = buildAppliedDeployment([
      {
        name: 'bucket-that-fails',
        type: 'gcp.storage.bucket',
        success: true,
        provider_id: 'gs://bucket-that-fails',
        source_node_id: 'canvas-id-fail',
      },
    ]);
    mockCanvasDeployment.findFirst.mockResolvedValueOnce(applied as any).mockResolvedValueOnce(null);
    mockCanvasDeployment.create.mockResolvedValueOnce({
      id: 'destroy-record-3',
      card_id: 'card-destroy-3',
      created_at: new Date(),
    });

    // Throw on delete to drive the catch path.
    nextDeleteHandler = () => {
      throw new Error('PERMISSION_DENIED: caller does not have storage.buckets.delete');
    };

    const destroyDeployment = await getDestroyDeployment();
    await destroyDeployment('card-destroy-3', 'org-1', 'user-1');

    const destroyEmits = emitDeployNodeStatus.mock.calls.filter((c) => c[1]?.action === 'delete');
    // queued + applying + failed = 3 emits.
    expect(destroyEmits.length).toBe(3);

    const failedEvent = destroyEmits.find((c) => c[1].status === 'failed')?.[1];
    expect(failedEvent).toBeTruthy();
    expect(failedEvent.node_id).toBe('canvas-id-fail');
    expect(failedEvent.action).toBe('delete');
    expect(failedEvent.error).toBeTruthy();
    expect(failedEvent.error.code).toBe('DESTROY_FAILED');
    expect(failedEvent.error.message).toContain('PERMISSION_DENIED');
  });

  it('emits status=failed with error.message when deployer.delete returns success: false', async () => {
    // Distinct from the throw path — the deployer can also return a
    // structured failure (deleteResult.success === false). Both must
    // wire through to a failed node_status with the error message.
    const applied = buildAppliedDeployment([
      {
        name: 'bucket-soft-fail',
        type: 'gcp.storage.bucket',
        success: true,
        provider_id: 'gs://bucket-soft-fail',
        source_node_id: 'canvas-id-soft-fail',
      },
    ]);
    mockCanvasDeployment.findFirst.mockResolvedValueOnce(applied as any).mockResolvedValueOnce(null);
    mockCanvasDeployment.create.mockResolvedValueOnce({
      id: 'destroy-record-4',
      card_id: 'card-destroy-4',
      created_at: new Date(),
    });

    nextDeleteHandler = () => ({ success: false, error: 'BUCKET_NOT_EMPTY' });

    const destroyDeployment = await getDestroyDeployment();
    await destroyDeployment('card-destroy-4', 'org-1', 'user-1');

    const destroyEmits = emitDeployNodeStatus.mock.calls.filter((c) => c[1]?.action === 'delete');
    expect(destroyEmits.length).toBe(3);
    const failedEvent = destroyEmits.find((c) => c[1].status === 'failed')?.[1];
    expect(failedEvent.error.code).toBe('DESTROY_FAILED');
    expect(failedEvent.error.message).toContain('BUCKET_NOT_EMPTY');
  });
});

describe('pdl-10 destroyAllForCard emits per-resource node_status events from mappings', () => {
  it('threads node_id from DeployedResourceMapping rows into the wire emit', async () => {
    // Two mapping rows — the destroy-all path doesn't need historical
    // deploys when mappings are populated.
    mockDeployedResourceMapping.findMany.mockResolvedValueOnce([
      {
        card_id: 'card-destroy-all-1',
        node_id: 'canvas-id-mapped-A',
        resource_type: 'gcp.storage.bucket',
        resource_name: 'bucket-mapped-a',
        provider_id: 'gs://bucket-mapped-a',
        environment: 'development',
      },
      {
        card_id: 'card-destroy-all-1',
        node_id: 'canvas-id-mapped-B',
        resource_type: 'gcp.storage.bucket',
        resource_name: 'bucket-mapped-b',
        provider_id: 'gs://bucket-mapped-b',
        environment: 'development',
      },
    ] as any);
    // No historical deploys needed for correlation — mappings cover both
    // resources. But destroyAllForCard reads `historicalDeploys[0]?.region`
    // etc. for the destroy record's row; seed one entry so the metadata
    // resolves cleanly.
    mockCanvasDeployment.findMany.mockResolvedValueOnce([
      {
        provider: 'gcp',
        region: 'us-central1',
        environment: 'development',
        results: { resources: [] },
      },
    ] as any);
    mockCanvasDeployment.create.mockResolvedValueOnce({
      id: 'destroy-all-record-1',
      card_id: 'card-destroy-all-1',
      created_at: new Date(),
    });

    const destroyAllForCard = await getDestroyAllForCard();
    await destroyAllForCard('card-destroy-all-1', 'org-1', 'user-1', { gcpProject: 'gcp-test-project' });

    const destroyEmits = emitDeployNodeStatus.mock.calls.filter((c) => c[1]?.action === 'delete');
    // 2 resources × 3 events (queued + applying + succeeded) = 6 emits.
    expect(destroyEmits.length).toBe(6);

    // Verify both canvas ids landed on the wire — the mapping table is
    // the correlation source for destroy-all.
    const ids = new Set(destroyEmits.map((c) => c[1].node_id));
    expect(ids.has('canvas-id-mapped-A')).toBe(true);
    expect(ids.has('canvas-id-mapped-B')).toBe(true);

    // resource_type + resource_name should match the mapping row.
    const eventA = destroyEmits.find(
      (c) => c[1].node_id === 'canvas-id-mapped-A' && c[1].status === 'succeeded',
    )?.[1];
    expect(eventA.resource_name).toBe('bucket-mapped-a');
    expect(eventA.resource_type).toBe('gcp.storage.bucket');
    expect(eventA.action).toBe('delete');
  });

  it('falls back to historical results.source_node_id when mapping row is missing', async () => {
    // No mapping rows — fall back to historical deploys' source_node_id.
    mockDeployedResourceMapping.findMany.mockResolvedValueOnce([] as any);
    mockCanvasDeployment.findMany.mockResolvedValueOnce([
      {
        provider: 'gcp',
        region: 'us-central1',
        environment: 'development',
        results: {
          resources: [
            {
              name: 'bucket-from-history',
              type: 'gcp.storage.bucket',
              provider_id: 'gs://bucket-from-history',
              source_node_id: 'canvas-id-from-history',
            },
          ],
        },
      },
    ] as any);
    mockCanvasDeployment.create.mockResolvedValueOnce({
      id: 'destroy-all-record-2',
      card_id: 'card-destroy-all-2',
      created_at: new Date(),
    });

    const destroyAllForCard = await getDestroyAllForCard();
    await destroyAllForCard('card-destroy-all-2', 'org-1', 'user-1', { gcpProject: 'gcp-test-project' });

    const destroyEmits = emitDeployNodeStatus.mock.calls.filter((c) => c[1]?.action === 'delete');
    // 1 resource × 3 events = 3 emits.
    expect(destroyEmits.length).toBe(3);
    expect(destroyEmits[0][1].node_id).toBe('canvas-id-from-history');
  });

  // pdl-10 critic finding B2 — destroyAllForCard's snapshot lifecycle on
  // engine throw. Per-resource `deployer.delete` errors are caught
  // INSIDE the loop (treated as `failed.push(...)`), so they don't leak
  // the snapshot. The leak happens when something OUTSIDE the loop
  // throws: `deployer.cleanup`, the prisma update, or the `complete`
  // emit. Simulate by making the post-loop prisma update throw — without
  // the catch path closing the snapshot, the next destroy attempt would
  // see a stranded `nextSeqByDeployment` entry and the emits get the
  // wrong correlation.
  it('closes the snapshot and re-throws when a post-loop step throws', async () => {
    mockDeployedResourceMapping.findMany.mockResolvedValueOnce([
      {
        card_id: 'card-destroy-all-throw',
        node_id: 'canvas-id-mapped-X',
        resource_type: 'gcp.storage.bucket',
        resource_name: 'bucket-x',
        provider_id: 'gs://bucket-x',
        environment: 'development',
      },
    ] as any);
    mockCanvasDeployment.findMany.mockResolvedValueOnce([
      {
        provider: 'gcp',
        region: 'us-central1',
        environment: 'development',
        results: { resources: [] },
      },
    ] as any);
    mockCanvasDeployment.create.mockResolvedValueOnce({
      id: 'destroy-all-record-throw',
      card_id: 'card-destroy-all-throw',
      created_at: new Date(),
    });

    // Pre-arrange the per-resource delete to succeed so the loop runs
    // cleanly through to the post-loop prisma update — that's where we
    // want the throw to land.
    nextDeleteHandler = async () => ({ success: true });

    // The post-loop prisma update is the FIRST canvasDeployment.update
    // call that happens after `deployer.cleanup` returns. Make it throw.
    mockCanvasDeployment.update.mockRejectedValueOnce(new Error('prisma boom'));

    const destroyAllForCard = await getDestroyAllForCard();
    let caught: Error | null = null;
    try {
      await destroyAllForCard('card-destroy-all-throw', 'org-1', 'user-1', {
        gcpProject: 'gcp-test-project',
      });
    } catch (err: any) {
      caught = err;
    }
    // The error must have re-thrown out so the route handler can return
    // a 500 — silently swallowing it would leave the user staring at a
    // success-shaped UI for a destroy that didn't finalize.
    expect(caught).toBeTruthy();
    expect(caught?.message).toContain('prisma boom');

    // The snapshot must be flipped to 'failed' (the catch path's call to
    // `finishDeploySnapshot(cardId, 'failed')`). The snapshot itself
    // sticks around for a 60s grace window so late-joining tabs can read
    // the terminal state — that's intentional. What matters here is that
    // the STATUS field reflects the failure, not 'deploying'.
    const { getDeploySnapshot } = await import('../services/deploy-locks');
    expect(getDeploySnapshot('card-destroy-all-throw')?.status).toBe('failed');
  });
});

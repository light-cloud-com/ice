/**
 * Unit tests for `services/deploy/src/services/plan-deployment.ts` —
 * the `planDeployment` public entry point + private `fallbackPlan`
 * degraded-mode planner. The fallback fires when the core engine's
 * translator throws (typically when `@ice/core` source/dist is out of
 * sync).
 *
 * Strategy: mock every collaborator (prisma, getCoreEngine, project
 * context, resource-mapping). Drive both the happy translation path
 * AND the catch-arm fallback. Branch coverage focuses on the
 * `||` fallbacks, the `graph_summary` shape variants
 * (`nodes.length` vs `get_nodes()`), and the fallback's provider /
 * skipped / non-resource node filter behavior.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest
 * globals are imported explicitly. Per
 * `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * mocks are cleared in `beforeEach`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // prisma
  cdCreate: vi.fn(),
  // resource-mapping
  seedMappingsFromHistory: vi.fn(),
  getExistingNameMap: vi.fn(),
  // utils/project-context
  resolveProjectContext: vi.fn(),
  // deployer-factory
  translateCardToGraph: vi.fn(),
  getCoreEngine: vi.fn(),
}));

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      create: mocks.cdCreate,
    },
  },
}));

vi.mock('../resource-mapping.service', () => ({
  seedMappingsFromHistory: mocks.seedMappingsFromHistory,
  getExistingNameMap: mocks.getExistingNameMap,
}));

vi.mock('../../utils/project-context', () => ({
  resolveProjectContext: mocks.resolveProjectContext,
}));

vi.mock('../deployer-factory', () => ({
  getCoreEngine: () => mocks.getCoreEngine(),
}));

import { planDeployment } from '../plan-deployment';

const HAPPY_TRANSLATION = {
  graph: {
    nodes: [{ id: 'n1' }, { id: 'n2' }],
    edges: [{ id: 'e1' }],
  },
  deployable_count: 2,
  deployables: [
    {
      node_id: 'card-id-A',
      label: 'Postgres',
      resource_type: 'gcp.sql.databaseInstance',
      resource_name: 'ice-pg-aaa',
    },
    {
      node_id: 'card-id-B',
      label: 'Bucket',
      resource_type: 'gcp.storage.bucket',
      resource_name: 'ice-bkt-bbb',
    },
  ],
  warnings: ['watch out'],
  skipped: [{ nodeId: 'card-id-C', reason: 'unsupported' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy path
  mocks.resolveProjectContext.mockResolvedValue({
    projectId: 'pid-1',
    projectName: 'My Project',
    environmentType: 'development',
  });
  mocks.seedMappingsFromHistory.mockResolvedValue(undefined);
  mocks.getExistingNameMap.mockResolvedValue(new Map());
  mocks.translateCardToGraph.mockReturnValue(HAPPY_TRANSLATION);
  mocks.getCoreEngine.mockResolvedValue({
    translate_card_to_graph: mocks.translateCardToGraph,
  });
  mocks.cdCreate.mockResolvedValue({ id: 'plan-1' });
});

describe('planDeployment — core-engine happy path', () => {
  it('returns success with deploymentId and the constructed plan when translation succeeds', async () => {
    const out = await planDeployment(
      'card-A',
      [{ id: 'n1', type: 'block', data: { iceType: 'X' } }],
      [],
      { provider: 'gcp', region: 'europe-west1' },
      'user-1',
    );
    expect(out.success).toBe(true);
    expect(out.deploymentId).toBe('plan-1');
    expect(out.plan.creates).toHaveLength(2);
    expect(out.plan.creates[0]).toEqual({
      name: 'ice-pg-aaa',
      type: 'gcp.sql.databaseInstance',
      action: 'create',
      source_node_id: 'card-id-A',
      label: 'Postgres',
    });
    expect(out.plan.deployable_count).toBe(2);
    expect(out.plan.skipped).toEqual([{ nodeId: 'card-id-C', reason: 'unsupported' }]);
    expect(out.plan.warnings).toEqual(['watch out']);
  });

  it('persists the plan row with action_type=plan and status=planned', async () => {
    await planDeployment(
      'card-A',
      [{ id: 'n1', type: 'block', data: {} }],
      [],
      { provider: 'gcp', region: 'us-east1', environment: 'production' },
      'user-99',
    );
    const data = mocks.cdCreate.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      card_id: 'card-A',
      user_id: 'user-99',
      status: 'planned',
      action_type: 'plan',
      provider: 'gcp',
      region: 'us-east1',
      environment: 'production',
    });
    expect(data.plan).toBeDefined();
  });

  it('seeds resource mappings from history before reading the existing-name map', async () => {
    await planDeployment('card-A', [{ id: 'n1', type: 'block', data: {} }], [], {}, 'u1');
    // Both run in sequence — both must have been awaited.
    expect(mocks.seedMappingsFromHistory).toHaveBeenCalledWith('card-A', 'development');
    expect(mocks.getExistingNameMap).toHaveBeenCalledWith('card-A', 'development');
  });

  it('passes the existing-name map through to the translator so resource names stay stable', async () => {
    const names = new Map([['gcp.sql.databaseInstance:Postgres', 'ice-pg-pinned']]);
    mocks.getExistingNameMap.mockResolvedValueOnce(names);
    await planDeployment('card-A', [{ id: 'n1', type: 'block', data: {} }], [], { provider: 'gcp' }, 'u1');
    expect(mocks.translateCardToGraph).toHaveBeenCalled();
    const arg = mocks.translateCardToGraph.mock.calls[0]![0];
    expect(arg.existing_names).toBe(names);
  });

  it('normalizes node fields with sensible defaults (n.type → "block", n.data → {})', async () => {
    await planDeployment(
      'card-A',
      [
        { id: 'n1' }, // no type, no data
        { id: 'n2', type: 'resource', data: { iceType: 'X' } },
      ],
      [{ id: 'e1', source: 'n1', target: 'n2', data: { kind: 'control' } }],
      {},
      'u1',
    );
    const arg = mocks.translateCardToGraph.mock.calls[0]![0];
    expect(arg.nodes).toEqual([
      { id: 'n1', type: 'block', data: {} },
      { id: 'n2', type: 'resource', data: { iceType: 'X' } },
    ]);
    expect(arg.edges).toEqual([{ id: 'e1', source: 'n1', target: 'n2', data: { kind: 'control' } }]);
  });

  it('uses options.projectName when project context returns null projectName', async () => {
    mocks.resolveProjectContext.mockResolvedValueOnce({
      projectId: 'pid-1',
      projectName: null,
      environmentType: 'development',
    });
    await planDeployment(
      'card-A',
      [{ id: 'n1', type: 'block', data: {} }],
      [],
      { projectName: 'caller-supplied' },
      'u1',
    );
    const arg = mocks.translateCardToGraph.mock.calls[0]![0];
    expect(arg.projectName).toBe('caller-supplied');
  });

  it('falls back to projectId when neither context.projectName nor options.projectName are present', async () => {
    mocks.resolveProjectContext.mockResolvedValueOnce({
      projectId: 'pid-FALLBACK',
      projectName: null,
      environmentType: 'development',
    });
    await planDeployment('card-A', [{ id: 'n1', type: 'block', data: {} }], [], {}, 'u1');
    const arg = mocks.translateCardToGraph.mock.calls[0]![0];
    expect(arg.projectName).toBe('pid-FALLBACK');
  });

  it('defaults provider to "gcp" when options.provider is missing', async () => {
    await planDeployment('card-A', [{ id: 'n1', type: 'block', data: {} }], [], {}, 'u1');
    const arg = mocks.translateCardToGraph.mock.calls[0]![0];
    expect(arg.provider).toBe('gcp');
  });

  it('defaults region to "us-central1" when options.region is missing', async () => {
    await planDeployment('card-A', [{ id: 'n1', type: 'block', data: {} }], [], {}, 'u1');
    const arg = mocks.translateCardToGraph.mock.calls[0]![0];
    expect(arg.region).toBe('us-central1');
    expect(mocks.cdCreate.mock.calls[0]![0].data.region).toBe('us-central1');
  });

  it('defaults environment to "development" on the persisted row when options.environment is missing', async () => {
    await planDeployment('card-A', [{ id: 'n1', type: 'block', data: {} }], [], {}, 'u1');
    expect(mocks.cdCreate.mock.calls[0]![0].data.environment).toBe('development');
  });

  it('forwards options.gcpProject to the translator', async () => {
    await planDeployment(
      'card-A',
      [{ id: 'n1', type: 'block', data: {} }],
      [],
      { gcpProject: 'gcp-proj-explicit' },
      'u1',
    );
    const arg = mocks.translateCardToGraph.mock.calls[0]![0];
    expect(arg.gcpProject).toBe('gcp-proj-explicit');
  });

  it('emits empty creates and 0 deployable_count when the translator returns no deployables', async () => {
    mocks.translateCardToGraph.mockReturnValueOnce({
      graph: { nodes: [], edges: [] },
      deployable_count: 0,
      deployables: [],
      warnings: [],
      skipped: [],
    });
    const out = await planDeployment('card-A', [{ id: 'n1', type: 'block', data: {} }], [], {}, 'u1');
    expect(out.plan.creates).toEqual([]);
    expect(out.plan.deployable_count).toBe(0);
  });

  it('handles missing deployables/skipped/warnings arrays defensively', async () => {
    mocks.translateCardToGraph.mockReturnValueOnce({
      graph: { nodes: [], edges: [] },
      deployable_count: 0,
      // no deployables / skipped / warnings keys
    } as any);
    const out = await planDeployment('card-A', [{ id: 'n1', type: 'block', data: {} }], [], {}, 'u1');
    expect(out.plan.creates).toEqual([]);
    expect(out.plan.skipped).toEqual([]);
    expect(out.plan.warnings).toEqual([]);
  });
});

describe('planDeployment — graph_summary shape resolution', () => {
  it('reads node/edge counts via .length when the graph exposes plain arrays', async () => {
    mocks.translateCardToGraph.mockReturnValueOnce({
      graph: {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        edges: [{ id: 'e1' }, { id: 'e2' }],
      },
      deployable_count: 1,
      deployables: [{ node_id: 'a', label: 'A', resource_type: 't', resource_name: 'n' }],
      warnings: [],
      skipped: [],
    });
    const out = await planDeployment('card-A', [{ id: 'n1', type: 'block', data: {} }], [], {}, 'u1');
    expect(out.plan.graph_summary).toEqual({ nodes: 3, edges: 2 });
  });

  it('falls back to get_nodes()/get_edges() accessors when .length is unavailable', async () => {
    mocks.translateCardToGraph.mockReturnValueOnce({
      graph: {
        nodes: { get_nodes: () => undefined } as any, // length undefined
        edges: { get_edges: () => undefined } as any,
        get_nodes: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
        get_edges: () => [{ id: 'e1' }],
      },
      deployable_count: 0,
      deployables: [],
      warnings: [],
      skipped: [],
    });
    const out = await planDeployment('card-A', [{ id: 'n1', type: 'block', data: {} }], [], {}, 'u1');
    expect(out.plan.graph_summary).toEqual({ nodes: 4, edges: 1 });
  });

  it('reports zeros when the graph object has neither .length nor get_*() helpers', async () => {
    mocks.translateCardToGraph.mockReturnValueOnce({
      graph: {}, // bare object
      deployable_count: 0,
      deployables: [],
      warnings: [],
      skipped: [],
    });
    const out = await planDeployment('card-A', [{ id: 'n1', type: 'block', data: {} }], [], {}, 'u1');
    expect(out.plan.graph_summary).toEqual({ nodes: 0, edges: 0 });
  });
});

describe('planDeployment — fallback when core engine throws', () => {
  it('logs the engine error and falls back to the basic planner when getCoreEngine rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getCoreEngine.mockRejectedValueOnce(new Error('core unavailable'));
    const out = await planDeployment(
      'card-A',
      [{ id: 'n1', type: 'resource', data: { provider: 'gcp', label: 'A' } }],
      [],
      { provider: 'gcp' },
      'u1',
    );
    expect(out.success).toBe(true);
    expect(out.plan.creates).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalledWith('Core engine plan error, falling back:', 'core unavailable');
    errorSpy.mockRestore();
  });

  it('falls back when the translator itself throws synchronously', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.translateCardToGraph.mockImplementationOnce(() => {
      throw new Error('translate boom');
    });
    const out = await planDeployment(
      'card-A',
      [{ id: 'n1', type: 'resource', data: { provider: 'gcp' } }],
      [],
      { provider: 'gcp' },
      'u1',
    );
    expect(out.success).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('falls back when seedMappingsFromHistory rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.seedMappingsFromHistory.mockRejectedValueOnce(new Error('seed boom'));
    const out = await planDeployment(
      'card-A',
      [{ id: 'n1', type: 'resource', data: { provider: 'gcp' } }],
      [],
      { provider: 'gcp' },
      'u1',
    );
    expect(out.success).toBe(true);
    expect(out.plan.creates).toHaveLength(1);
    errorSpy.mockRestore();
  });
});

describe('fallbackPlan (via core-engine throw path)', () => {
  beforeEach(() => {
    // Force the core path to fail so every test in this block exercises
    // the fallback. Console noise is suppressed.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getCoreEngine.mockRejectedValue(new Error('core down'));
  });

  it('filters creates to resource nodes whose data.provider matches the requested provider', async () => {
    const out = await planDeployment(
      'card-A',
      [
        { id: 'n1', type: 'resource', data: { provider: 'gcp', label: 'PG' } },
        { id: 'n2', type: 'resource', data: { provider: 'aws', label: 'S3' } },
        { id: 'n3', type: 'group', data: { provider: 'gcp', label: 'grp' } },
        { id: 'n4', type: 'resource', data: { provider: 'gcp' } }, // no label → uses id
      ],
      [],
      { provider: 'gcp' },
      'u1',
    );
    expect(out.plan.creates.map((c: any) => c.source_node_id)).toEqual(['n1', 'n4']);
    expect(out.plan.creates[1].name).toBe('n4'); // label fallback
  });

  it('records skipped entries for non-matching-provider resource nodes', async () => {
    const out = await planDeployment(
      'card-A',
      [
        { id: 'n1', type: 'resource', data: { provider: 'gcp' } },
        { id: 'n2', type: 'resource', data: { provider: 'aws', label: 'S3' } },
      ],
      [],
      { provider: 'gcp' },
      'u1',
    );
    expect(out.plan.skipped).toEqual([{ nodeId: 'n2', label: 'S3', reason: 'Non-matching provider' }]);
  });

  it('falls back to node.id for the skipped label when data.label is absent', async () => {
    const out = await planDeployment(
      'card-A',
      [{ id: 'unlabelled-skip', type: 'resource', data: { provider: 'aws' } }],
      [],
      { provider: 'gcp' },
      'u1',
    );
    expect(out.plan.skipped).toEqual([
      { nodeId: 'unlabelled-skip', label: 'unlabelled-skip', reason: 'Non-matching provider' },
    ]);
  });

  it('uses node.id as both name and label when data.label is absent', async () => {
    const out = await planDeployment(
      'card-A',
      [{ id: 'lonely-node', type: 'resource', data: { provider: 'gcp' } }],
      [],
      { provider: 'gcp' },
      'u1',
    );
    expect(out.plan.creates[0]).toMatchObject({
      name: 'lonely-node',
      label: 'lonely-node',
      type: 'unknown',
    });
  });

  it('uses data.iceType when present for the create.type field', async () => {
    const out = await planDeployment(
      'card-A',
      [
        {
          id: 'n1',
          type: 'resource',
          data: { provider: 'gcp', iceType: 'Database.PostgreSQL', label: 'My DB' },
        },
      ],
      [],
      { provider: 'gcp' },
      'u1',
    );
    expect(out.plan.creates[0]).toMatchObject({
      type: 'Database.PostgreSQL',
      label: 'My DB',
    });
  });

  it('defaults provider to "gcp" when options.provider is missing on the fallback path', async () => {
    const out = await planDeployment(
      'card-A',
      [
        { id: 'n1', type: 'resource', data: { provider: 'gcp', label: 'X' } },
        { id: 'n2', type: 'resource', data: { provider: 'aws', label: 'Y' } },
      ],
      [],
      {},
      'u1',
    );
    expect(out.plan.creates).toHaveLength(1);
    expect(out.plan.creates[0].source_node_id).toBe('n1');
  });

  it('defaults provider to "gcp" when options is null/undefined on the fallback path', async () => {
    const out = await planDeployment(
      'card-A',
      [{ id: 'n1', type: 'resource', data: { provider: 'gcp', label: 'X' } }],
      [],
      undefined as any,
      'u1',
    );
    expect(out.success).toBe(true);
    expect(out.plan.creates).toHaveLength(1);
  });

  it('treats nodes as [] when the caller passed undefined', async () => {
    const out = await planDeployment('card-A', undefined as any, [], { provider: 'gcp' }, 'u1');
    expect(out.plan.creates).toEqual([]);
    expect(out.plan.skipped).toEqual([]);
  });

  it('treats edges as [] when the caller passed undefined', async () => {
    const out = await planDeployment(
      'card-A',
      [{ id: 'n1', type: 'resource', data: { provider: 'gcp', label: 'X' } }],
      undefined as any,
      { provider: 'gcp' },
      'u1',
    );
    expect(out.plan.graph_summary.edges).toBe(0);
  });

  it('persists the plan row with status=planned and action_type=plan on the fallback path', async () => {
    await planDeployment(
      'card-A',
      [{ id: 'n1', type: 'resource', data: { provider: 'gcp', label: 'X' } }],
      [],
      { provider: 'gcp', region: 'us-west1', environment: 'staging' },
      'user-22',
    );
    const data = mocks.cdCreate.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      card_id: 'card-A',
      user_id: 'user-22',
      status: 'planned',
      action_type: 'plan',
      provider: 'gcp',
      region: 'us-west1',
      environment: 'staging',
    });
  });

  it('defaults region/environment in the fallback path when options omits them', async () => {
    await planDeployment('card-A', [{ id: 'n1', type: 'resource', data: { provider: 'gcp' } }], [], {}, 'u1');
    const data = mocks.cdCreate.mock.calls[0]![0].data;
    expect(data.region).toBe('us-central1');
    expect(data.environment).toBe('development');
  });

  it('handles userId being undefined on the fallback path', async () => {
    const out = await planDeployment(
      'card-A',
      [{ id: 'n1', type: 'resource', data: { provider: 'gcp' } }],
      [],
      {},
      // userId omitted
    );
    expect(out.success).toBe(true);
    expect(mocks.cdCreate.mock.calls[0]![0].data.user_id).toBeUndefined();
  });
});

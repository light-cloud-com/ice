/**
 * Tests for `services/plan-deployment.ts` — extracted from `deploy.service.ts`
 * in rf-deploy2-1. Covers:
 *
 * - happy path: core engine returns translation → plan shape mirrors
 *   `translation.deployables` + `creates: [...]` + persisted row.
 * - core throw → `fallbackPlan` filters by `n.type === 'resource'` +
 *   provider match, surfaces non-matching as `skipped`.
 *
 * Mocks `@ice/db` for `canvasDeployment.create`, `@ice/core` for the
 * translator, and the resource-mapping helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCanvasDeployment = {
  create: vi.fn().mockResolvedValue({ id: 'plan-id-1' }),
};

const mockCanvasCard = {
  findUnique: vi.fn().mockResolvedValue({
    id: 'card-1',
    name: 'My Project',
    project_id: 'proj-1',
    environment_type: 'development',
    project: { id: 'proj-1', name: 'My Project', environment_type: 'development' },
  }),
};

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: mockCanvasDeployment,
    canvasCard: mockCanvasCard,
  },
}));

let translatorImpl: (input: any) => any = () => ({
  graph: { nodes: { values: () => [] }, edges: { values: () => [] } },
  deployable_count: 1,
  deployables: [
    {
      node_id: 'node-A',
      label: 'A',
      resource_type: 'gcp.storage.bucket',
      resource_name: 'ice-x-prod-bucket-aaa',
    },
  ],
  warnings: [],
  skipped: [],
});

vi.mock('@ice/core', () => ({
  translate_card_to_graph: (input: any) => translatorImpl(input),
}));

vi.mock('../services/resource-mapping.service.js', () => ({
  getExistingNameMap: vi.fn().mockResolvedValue(new Map()),
  seedMappingsFromHistory: vi.fn().mockResolvedValue(undefined),
}));

async function getPlanDeployment() {
  const mod = await import('../services/plan-deployment.js');
  return mod.planDeployment;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCanvasDeployment.create.mockResolvedValue({ id: 'plan-id-1' });
  mockCanvasCard.findUnique.mockResolvedValue({
    id: 'card-1',
    name: 'My Project',
    project_id: 'proj-1',
    environment_type: 'development',
    project: { id: 'proj-1', name: 'My Project', environment_type: 'development' },
  });
  translatorImpl = () => ({
    graph: { nodes: { values: () => [] }, edges: { values: () => [] } },
    deployable_count: 1,
    deployables: [
      {
        node_id: 'node-A',
        label: 'A',
        resource_type: 'gcp.storage.bucket',
        resource_name: 'ice-x-prod-bucket-aaa',
      },
    ],
    warnings: [],
    skipped: [],
  });
});

describe('planDeployment', () => {
  it('happy path: maps deployables to creates + persists planned row', async () => {
    const planDeployment = await getPlanDeployment();
    const result = await planDeployment(
      'card-1',
      [{ id: 'node-A', type: 'resource', data: { iceType: 'Storage.Bucket' } }],
      [],
      { provider: 'gcp', region: 'us-central1' },
      'user-1',
    );

    expect(result.success).toBe(true);
    expect(result.deploymentId).toBe('plan-id-1');
    expect(result.plan.creates).toHaveLength(1);
    expect(result.plan.creates[0]).toMatchObject({
      name: 'ice-x-prod-bucket-aaa',
      type: 'gcp.storage.bucket',
      action: 'create',
      source_node_id: 'node-A',
      label: 'A',
    });

    expect(mockCanvasDeployment.create).toHaveBeenCalledTimes(1);
    const createCall = mockCanvasDeployment.create.mock.calls[0][0];
    expect(createCall.data.action_type).toBe('plan');
    expect(createCall.data.status).toBe('planned');
    expect(createCall.data.card_id).toBe('card-1');
  });

  it('falls back when translator throws — keeps degraded plan with skipped detail', async () => {
    translatorImpl = () => {
      throw new Error('core engine sync issue');
    };

    const planDeployment = await getPlanDeployment();
    const result = await planDeployment(
      'card-1',
      [
        { id: 'node-A', type: 'resource', data: { iceType: 'Storage.Bucket', provider: 'gcp', label: 'A' } },
        { id: 'node-B', type: 'resource', data: { iceType: 'Storage.Bucket', provider: 'aws', label: 'B' } },
        // Group nodes are filtered out by the resource-only filter.
        { id: 'group-1', type: 'group', data: {} },
      ],
      [],
      { provider: 'gcp' },
      'user-1',
    );

    expect(result.success).toBe(true);
    expect(result.plan.creates).toHaveLength(1);
    expect(result.plan.creates[0]).toMatchObject({
      name: 'A',
      type: 'Storage.Bucket',
      action: 'create',
      source_node_id: 'node-A',
    });
    expect(result.plan.skipped).toHaveLength(1);
    expect(result.plan.skipped[0]).toMatchObject({
      nodeId: 'node-B',
      label: 'B',
      reason: 'Non-matching provider',
    });
    expect(result.plan.deployable_count).toBe(1);
  });
});

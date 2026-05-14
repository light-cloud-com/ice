/**
 * Unit tests for `services/deploy/src/services/baseline-graph.ts` —
 * the apply + rollback baseline-graph builder extracted in rf-deploy-10.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's typecheck
 * stays green.
 *
 * The behavior-risk on this unit (planner-flagged) is the divergent
 * `statusFilter` between apply (`['success', 'partial']`) and rollback
 * (`['success']`). The forwarding tests below assert both shapes round-trip
 * verbatim into the prisma where clause.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      findFirst: vi.fn(),
    },
  },
}));

// The mock factory must declare its `MutableGraph` class INSIDE the
// closure — vitest's `vi.mock` factories run before module import and
// cannot reference top-level names from the test file scope (else
// `vi-mock-factory-hoist-blocks-top-level-class-references`).
vi.mock('@ice/core/graph', () => {
  class MockMutableGraph {
    name: string;
    nodes: any[] = [];
    constructor(name: string) {
      this.name = name;
    }
    add_node(spec: any) {
      if (this.nodes.find((n) => n.name === spec.name)) {
        throw new Error('duplicate');
      }
      this.nodes.push(spec);
    }
  }
  return { MutableGraph: MockMutableGraph };
});

import { buildBaselineGraph } from '../baseline-graph';
// @ts-ignore — resolved at runtime via pnpm workspace; mocked above
import prismaModule from '@ice/db';

const findFirstMock = (prismaModule as any).canvasDeployment.findFirst as ReturnType<typeof vi.fn>;

describe('buildBaselineGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty graph + foundCount 0 + hasResults false when findFirst returns null', async () => {
    findFirstMock.mockResolvedValueOnce(null);

    const { currentGraph, foundCount, hasResults } = await buildBaselineGraph({
      cardId: 'card-1',
      environment: 'production',
      excludeDeploymentId: 'dep-current',
      statusFilter: ['success', 'partial'],
    });

    expect(currentGraph.nodes).toEqual([]);
    expect(currentGraph.name).toBe('current');
    expect(foundCount).toBe(0);
    expect(hasResults).toBe(false);
  });

  it('returns an empty graph + foundCount 0 + hasResults false when findFirst returns a row but `results` is null', async () => {
    findFirstMock.mockResolvedValueOnce({ id: 'prev', results: null });

    const { currentGraph, foundCount, hasResults } = await buildBaselineGraph({
      cardId: 'card-1',
      environment: 'production',
      excludeDeploymentId: 'dep-current',
      statusFilter: ['success'],
    });

    expect(currentGraph.nodes).toEqual([]);
    expect(foundCount).toBe(0);
    expect(hasResults).toBe(false);
  });

  it('includes only `res.success === true && res.resource_id` rows; skips failures and unmapped successes', async () => {
    findFirstMock.mockResolvedValueOnce({
      id: 'prev',
      results: {
        resources: [
          { name: 'a', type: 'gcp.storage.bucket', success: true, resource_id: 'r-a', outputs: { url: 'gs://a' }, provider_id: 'p-a' },
          { name: 'b', type: 'gcp.storage.bucket', success: false, resource_id: 'r-b' }, // skipped: not success
          { name: 'c', type: 'gcp.storage.bucket', success: true /* no resource_id */ }, // skipped: no resource_id
          { name: 'd', type: 'gcp.storage.bucket', success: true, resource_id: 'r-d', outputs: {}, provider_id: 'p-d' },
        ],
      },
    });

    const { currentGraph, hasResults } = await buildBaselineGraph({
      cardId: 'card-1',
      environment: 'production',
      excludeDeploymentId: 'dep-current',
      statusFilter: ['success', 'partial'],
    });

    expect(hasResults).toBe(true);
    expect(currentGraph.nodes.map((n: any) => n.name)).toEqual(['a', 'd']);
  });

  it('adds each qualifying resource via add_node({ name, type, properties: { ...outputs, provider_id } })', async () => {
    findFirstMock.mockResolvedValueOnce({
      id: 'prev',
      results: {
        resources: [
          {
            name: 'ice-foo-prod-bucket-aaa',
            type: 'gcp.storage.bucket',
            success: true,
            resource_id: 'gs://ice-foo-prod-bucket-aaa',
            outputs: { region: 'us-central1', url: 'gs://ice-foo-prod-bucket-aaa' },
            provider_id: 'gs://ice-foo-prod-bucket-aaa',
          },
        ],
      },
    });

    const { currentGraph } = await buildBaselineGraph({
      cardId: 'card-1',
      environment: 'production',
      excludeDeploymentId: 'dep-current',
      statusFilter: ['success', 'partial'],
    });

    expect(currentGraph.nodes).toHaveLength(1);
    expect(currentGraph.nodes[0]).toEqual({
      name: 'ice-foo-prod-bucket-aaa',
      type: 'gcp.storage.bucket',
      properties: {
        region: 'us-central1',
        url: 'gs://ice-foo-prod-bucket-aaa',
        provider_id: 'gs://ice-foo-prod-bucket-aaa',
      },
    });
  });

  it('swallows add_node throws (duplicate-resource case) without bubbling up', async () => {
    findFirstMock.mockResolvedValueOnce({
      id: 'prev',
      results: {
        resources: [
          { name: 'dup', type: 't', success: true, resource_id: 'r-1', outputs: {}, provider_id: 'p-1' },
          // The mock's add_node throws on a second insert with the same name.
          { name: 'dup', type: 't', success: true, resource_id: 'r-2', outputs: {}, provider_id: 'p-2' },
          { name: 'unique', type: 't', success: true, resource_id: 'r-3', outputs: {}, provider_id: 'p-3' },
        ],
      },
    });

    // Must not throw — the duplicate is silently ignored, the unique row
    // continues to be added.
    const { currentGraph, foundCount, hasResults } = await buildBaselineGraph({
      cardId: 'card-1',
      environment: 'production',
      excludeDeploymentId: 'dep-current',
      statusFilter: ['success', 'partial'],
    });

    expect(currentGraph.nodes.map((n: any) => n.name)).toEqual(['dup', 'unique']);
    // foundCount counts ALL res.success === true rows regardless of
    // whether add_node accepted them — matches the apply-path's original
    // log-line semantics (count was always taken pre-add_node).
    expect(foundCount).toBe(3);
    expect(hasResults).toBe(true);
  });

  it('foundCount reflects success-count of `results.resources` (not the number of nodes added)', async () => {
    // 4 successes, 1 failure. Only 3 successes have `resource_id` so only
    // 3 are added to the graph — but `foundCount` should be 4 to match
    // the original `prevResources.filter(r => r.success).length` log.
    findFirstMock.mockResolvedValueOnce({
      id: 'prev',
      results: {
        resources: [
          { name: 'a', type: 't', success: true, resource_id: 'r-a' },
          { name: 'b', type: 't', success: true, resource_id: 'r-b' },
          { name: 'c', type: 't', success: true /* no resource_id, NOT added */ },
          { name: 'd', type: 't', success: true, resource_id: 'r-d' },
          { name: 'e', type: 't', success: false, resource_id: 'r-e' /* failure */ },
        ],
      },
    });

    const { currentGraph, foundCount } = await buildBaselineGraph({
      cardId: 'card-1',
      environment: 'production',
      excludeDeploymentId: 'dep-current',
      statusFilter: ['success', 'partial'],
    });

    expect(currentGraph.nodes).toHaveLength(3);
    expect(foundCount).toBe(4);
  });

  it('forwards cardId, environment, excludeDeploymentId, statusFilter to the prisma where clause + sorts by created_at desc', async () => {
    findFirstMock.mockResolvedValueOnce(null);

    await buildBaselineGraph({
      cardId: 'card-xyz',
      environment: 'staging',
      excludeDeploymentId: 'dep-in-flight',
      statusFilter: ['success', 'partial'],
    });

    expect(findFirstMock).toHaveBeenCalledTimes(1);
    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        card_id: 'card-xyz',
        environment: 'staging',
        status: { in: ['success', 'partial'] },
        id: { not: 'dep-in-flight' },
      },
      orderBy: { created_at: 'desc' },
    });
  });

  it("apply-path filter set ['success', 'partial'] round-trips through verbatim", async () => {
    findFirstMock.mockResolvedValueOnce(null);

    await buildBaselineGraph({
      cardId: 'card-1',
      environment: 'production',
      excludeDeploymentId: 'dep-current',
      statusFilter: ['success', 'partial'],
    });

    const where = findFirstMock.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['success', 'partial'] });
  });

  it("rollback-path filter set ['success'] round-trips through verbatim", async () => {
    findFirstMock.mockResolvedValueOnce(null);

    await buildBaselineGraph({
      cardId: 'card-1',
      environment: 'production',
      excludeDeploymentId: 'rollback-record-id',
      statusFilter: ['success'],
    });

    const where = findFirstMock.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['success'] });
  });

  it('sorts by created_at desc to pick the most recent qualifying deployment', async () => {
    findFirstMock.mockResolvedValueOnce(null);

    await buildBaselineGraph({
      cardId: 'card-1',
      environment: 'production',
      excludeDeploymentId: 'dep-current',
      statusFilter: ['success', 'partial'],
    });

    expect(findFirstMock.mock.calls[0][0].orderBy).toEqual({ created_at: 'desc' });
  });

  it('handles a `results` object whose `resources` field is missing (treats as empty list)', async () => {
    findFirstMock.mockResolvedValueOnce({ id: 'prev', results: {} });

    const { currentGraph, foundCount, hasResults } = await buildBaselineGraph({
      cardId: 'card-1',
      environment: 'production',
      excludeDeploymentId: 'dep-current',
      statusFilter: ['success'],
    });

    // `results` is truthy so `hasResults` is true even with no resources;
    // this mirrors the original apply-path's "log Found 0 ..." behavior
    // when the previous deploy had a results envelope but no resources.
    expect(hasResults).toBe(true);
    expect(currentGraph.nodes).toEqual([]);
    expect(foundCount).toBe(0);
  });
});

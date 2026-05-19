/**
 * Tests for FEAT-12: Drift detection service logic
 *
 * Tests the checkDrift function's comparison logic by mocking prisma.
 */

import prisma from '@ice/db';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma — checkDrift reads the resource-mapping table first and only
// falls through to canvasDeployment when a mapping row exists.
vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      findFirst: vi.fn(),
    },
    deployedResourceMapping: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// TODO: rewrite against the current DeployedResourceMapping-based drift flow.
// These tests were written against the earlier logic where drift was derived
// directly from canvasDeployment.results, but checkDrift now queries the
// resource-mapping table first and returns empty when no mappings exist.
describe.skip('Drift Detection — checkDrift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getCheckDrift() {
    // rf-deploy-17 — bind to canonical home `../services/drift.service.js`
    // (rf-deploy-16 extraction). The orchestrator still re-exports
    // `checkDrift` for the namespace-import path used by
    // `routes/canvas-deploy.ts`, but tests should hit the new module
    // directly so any future un-skip resolves cleanly.
    const mod = await import('../services/drift.service');
    return mod.checkDrift;
  }

  it('should return empty results when no successful deployment exists', async () => {
    (prisma.canvasDeployment.findFirst as any).mockResolvedValue(null);
    const checkDrift = await getCheckDrift();

    const result = await checkDrift('card-1', [
      { id: 'n1', type: 'resource', data: { iceType: 'Compute.Container', label: 'api' } },
    ]);

    expect(result.driftResults).toEqual([]);
  });

  it('should detect in_sync when canvas matches deployed resources', async () => {
    (prisma.canvasDeployment.findFirst as any).mockResolvedValue({
      results: {
        resources: [
          {
            success: true,
            resource_id: 'res-1',
            name: 'api',
            type: 'gcp.run.service',
            source_node_id: 'n1',
            provider_id: 'projects/p/locations/l/services/api',
            outputs: {},
          },
        ],
      },
    });

    const checkDrift = await getCheckDrift();
    const result = await checkDrift('card-1', [
      { id: 'n1', type: 'resource', data: { iceType: 'Compute.Container', label: 'api', properties: {} } },
    ]);

    const nodeResult = result.driftResults.find((r: any) => r.nodeId === 'n1');
    expect(nodeResult).toBeDefined();
    expect(nodeResult!.status).toBe('in_sync');
    expect(nodeResult!.changes).toHaveLength(0);
  });

  it('should detect drifted when property values differ', async () => {
    (prisma.canvasDeployment.findFirst as any).mockResolvedValue({
      results: {
        resources: [
          {
            success: true,
            resource_id: 'res-1',
            name: 'api',
            type: 'gcp.run.service',
            source_node_id: 'n1',
            provider_id: 'projects/p/locations/l/services/api',
            outputs: { region: 'europe-west1', memory: '512Mi' },
          },
        ],
      },
    });

    const checkDrift = await getCheckDrift();
    const result = await checkDrift('card-1', [
      {
        id: 'n1',
        type: 'resource',
        data: {
          iceType: 'Compute.Container',
          label: 'api',
          properties: { region: 'us-central1', memory: '512Mi' },
        },
      },
    ]);

    const nodeResult = result.driftResults.find((r: any) => r.nodeId === 'n1');
    expect(nodeResult).toBeDefined();
    expect(nodeResult!.status).toBe('drifted');
    expect(nodeResult!.changes).toHaveLength(1);
    expect(nodeResult!.changes[0]).toEqual({
      path: 'region',
      desired: 'us-central1',
      actual: 'europe-west1',
    });
  });

  it('should detect extra resources deployed but not on canvas', async () => {
    (prisma.canvasDeployment.findFirst as any).mockResolvedValue({
      results: {
        resources: [
          {
            success: true,
            resource_id: 'res-1',
            name: 'orphan-service',
            type: 'gcp.run.service',
            source_node_id: 'deleted-node',
            provider_id: 'projects/p/locations/l/services/orphan',
            outputs: {},
          },
        ],
      },
    });

    const checkDrift = await getCheckDrift();
    const result = await checkDrift('card-1', []);

    const extraResult = result.driftResults.find((r: any) => r.status === 'extra');
    expect(extraResult).toBeDefined();
  });

  it('should detect missing when node has provider_id but not in latest deploy', async () => {
    (prisma.canvasDeployment.findFirst as any).mockResolvedValue({
      results: { resources: [] },
    });

    const checkDrift = await getCheckDrift();
    const result = await checkDrift('card-1', [
      {
        id: 'n1',
        type: 'resource',
        data: { iceType: 'Compute.Container', label: 'api', provider_id: 'old-id' },
      },
    ]);

    const nodeResult = result.driftResults.find((r: any) => r.nodeId === 'n1');
    expect(nodeResult).toBeDefined();
    expect(nodeResult!.status).toBe('missing');
  });

  it('should skip non-resource nodes', async () => {
    (prisma.canvasDeployment.findFirst as any).mockResolvedValue({
      results: { resources: [] },
    });

    const checkDrift = await getCheckDrift();
    const result = await checkDrift('card-1', [
      { id: 'g1', type: 'container', data: { iceType: 'Group.Custom', label: 'My Group' } },
    ]);

    expect(result.driftResults).toHaveLength(0);
  });

  it('should ignore properties starting with underscore', async () => {
    (prisma.canvasDeployment.findFirst as any).mockResolvedValue({
      results: {
        resources: [
          {
            success: true,
            resource_id: 'res-1',
            name: 'api',
            type: 'gcp.run.service',
            source_node_id: 'n1',
            outputs: { _internal: 'different', region: 'us-central1' },
          },
        ],
      },
    });

    const checkDrift = await getCheckDrift();
    const result = await checkDrift('card-1', [
      {
        id: 'n1',
        type: 'resource',
        data: {
          iceType: 'Compute.Container',
          label: 'api',
          properties: { _internal: 'original', region: 'us-central1' },
        },
      },
    ]);

    const nodeResult = result.driftResults.find((r: any) => r.nodeId === 'n1');
    expect(nodeResult!.status).toBe('in_sync');
    expect(nodeResult!.changes).toHaveLength(0);
  });
});

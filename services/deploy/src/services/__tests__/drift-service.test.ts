/**
 * Unit tests for `services/deploy/src/services/drift.service.ts` —
 * the `checkDrift` extraction in rf-deploy-16.
 *
 * The legacy `services/deploy/src/__tests__/drift-detection.test.ts` is
 * a `describe.skip` block (its assertions were written against the
 * pre-Phase-7 canvas-deployment-results comparison and never updated).
 * That file's import path stays unchanged and resolves through the
 * orchestrator's re-export — these tests assert the canonical path is
 * `./drift.service.js` and exercise the Phase-7 mapping-table flow.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck stays green.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    deployedResourceMapping: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@ice/service-credentials', () => ({
  getDecryptedCredentials: vi.fn(),
}));

vi.mock('../../providers/registry.js', () => ({
  resolveProviderAuth: vi.fn(),
  cleanupProviderAuth: vi.fn(),
}));

vi.mock('../deployer-factory.js', () => ({
  createDeployer: vi.fn(),
}));

import { checkDrift } from '../drift.service.js';
// @ts-ignore — resolved at runtime via pnpm workspace; mocked above
import prismaModule from '@ice/db';
// @ts-ignore — resolved at runtime via pnpm workspace; mocked above
import * as credentialsModule from '@ice/service-credentials';
import { resolveProviderAuth, cleanupProviderAuth } from '../../providers/registry.js';
import { createDeployer } from '../deployer-factory.js';

const findManyMock = (prismaModule as any).deployedResourceMapping.findMany as ReturnType<typeof vi.fn>;
const getDecryptedCredentialsMock = (credentialsModule as any).getDecryptedCredentials as ReturnType<typeof vi.fn>;
const resolveProviderAuthMock = resolveProviderAuth as unknown as ReturnType<typeof vi.fn>;
const cleanupProviderAuthMock = cleanupProviderAuth as unknown as ReturnType<typeof vi.fn>;
const createDeployerMock = createDeployer as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkDrift — canonical export path', () => {
  it('resolves through ./drift.service.js (not legacy deploy.service.js path)', async () => {
    expect(typeof checkDrift).toBe('function');
  });

  it('also re-exports from deploy.service.js for the orchestrator barrel', async () => {
    const orch = await import('../deploy.service.js');
    expect(orch.checkDrift).toBe(checkDrift);
  });
});

describe('checkDrift — empty-mapping early return', () => {
  it('returns empty driftResults + unsupported:false when no mapping rows exist', async () => {
    findManyMock.mockResolvedValueOnce([]);

    const result = await checkDrift('card-1', [
      { id: 'n1', type: 'resource', data: { iceType: 'Compute.Container' } },
    ]);

    expect(result.driftResults).toEqual([]);
    expect(result.unsupported).toBe(false);
    expect(typeof result.checkedAt).toBe('string');
    expect(new Date(result.checkedAt).toString()).not.toBe('Invalid Date');
  });

  it('defaults environment to "development" when omitted', async () => {
    findManyMock.mockResolvedValueOnce([]);
    await checkDrift('card-1', []);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { card_id: 'card-1', environment: 'development' },
    });
  });

  it('forwards explicit environment to the prisma where clause', async () => {
    findManyMock.mockResolvedValueOnce([]);
    await checkDrift('card-1', [], { environment: 'production' });
    expect(findManyMock).toHaveBeenCalledWith({
      where: { card_id: 'card-1', environment: 'production' },
    });
  });
});

describe('checkDrift — stored-state fallback (no orgId)', () => {
  it('returns in_sync for mapped nodes still present on canvas', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 'gcp.storage.bucket', resource_name: 'b-1', provider_id: 'p-1' },
    ]);

    const result = await checkDrift('card-1', [
      { id: 'n1', type: 'resource', data: { iceType: 'Storage.Bucket' } },
    ]);

    expect(result.unsupported).toBe(true); // no deployer was constructed
    expect(result.driftResults).toEqual([{ nodeId: 'n1', status: 'in_sync', changes: [] }]);
    // No deployer was created — none of the GCP-side mocks should fire.
    expect(getDecryptedCredentialsMock).not.toHaveBeenCalled();
    expect(createDeployerMock).not.toHaveBeenCalled();
  });

  it('returns extra for mapped resources that are no longer on the canvas', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'orphan', resource_type: 'gcp.storage.bucket', resource_name: 'b-1', provider_id: 'p-1' },
    ]);

    const result = await checkDrift('card-1', []);

    expect(result.driftResults).toEqual([{ nodeId: 'orphan', status: 'extra', changes: [] }]);
  });

  it('treats canvas resource nodes with iceType but no mapping as unknown (new/never-deployed)', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'mapped', resource_type: 'gcp.storage.bucket', resource_name: 'b-1', provider_id: 'p-1' },
    ]);

    const result = await checkDrift('card-1', [
      { id: 'mapped', type: 'resource', data: { iceType: 'Storage.Bucket' } },
      { id: 'new-node', type: 'resource', data: { iceType: 'Compute.Container' } },
    ]);

    expect(result.driftResults).toContainEqual({ nodeId: 'mapped', status: 'in_sync', changes: [] });
    expect(result.driftResults).toContainEqual({ nodeId: 'new-node', status: 'unknown', changes: [] });
  });

  it('does NOT flag canvas resource nodes lacking iceType as unknown', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'mapped', resource_type: 'gcp.storage.bucket', resource_name: 'b-1', provider_id: 'p-1' },
    ]);

    const result = await checkDrift('card-1', [
      { id: 'mapped', type: 'resource', data: { iceType: 'Storage.Bucket' } },
      { id: 'no-icetype', type: 'resource', data: {} },
    ]);

    expect(result.driftResults).toEqual([{ nodeId: 'mapped', status: 'in_sync', changes: [] }]);
  });

  it('does NOT consider non-resource nodes (containers/groups) for canvasById/unknown', async () => {
    findManyMock.mockResolvedValueOnce([]);

    const result = await checkDrift('card-1', [
      { id: 'g1', type: 'container', data: { iceType: 'Group.Custom' } },
    ]);

    expect(result.driftResults).toEqual([]);
  });
});

describe('checkDrift — GCP describe path (orgId present)', () => {
  function fakeDeployer(overrides: Partial<{ describe: (...args: any[]) => Promise<any>; cleanup: () => Promise<void> }> = {}) {
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      describe: overrides.describe ?? vi.fn(),
      cleanup: overrides.cleanup ?? vi.fn().mockResolvedValue(undefined),
    };
  }

  function setupDeployerHappyPath(describeFn: (...args: any[]) => Promise<any>) {
    const deployer = fakeDeployer({ describe: describeFn });
    getDecryptedCredentialsMock.mockResolvedValueOnce({ project_id: 'proj-1' });
    createDeployerMock.mockResolvedValueOnce(deployer);
    resolveProviderAuthMock.mockResolvedValueOnce({
      scope: { project: 'proj-1' },
      authClient: { projectId: 'proj-1' },
      parsedCredentials: { client_email: 'x@y' },
      keyFilePath: '/tmp/key.json',
    });
    return deployer;
  }

  it('reports unsupported for the entry when deployer.describe returns supported:false', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 'gcp.exotic', resource_name: 'foo', provider_id: 'p-foo' },
    ]);
    setupDeployerHappyPath(async () => ({ supported: false }));

    const result = await checkDrift('card-1', [], { orgId: 'org-1' });

    expect(result.unsupported).toBe(false); // deployer was successfully built
    expect(result.driftResults).toEqual([{ nodeId: 'n1', status: 'unknown', changes: [] }]);
    expect(cleanupProviderAuthMock).toHaveBeenCalled();
  });

  it('reports missing when describe returns exists:false (resource deleted externally)', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 'gcp.storage.bucket', resource_name: 'b', provider_id: 'p-b' },
    ]);
    setupDeployerHappyPath(async () => ({ exists: false }));

    const result = await checkDrift(
      'card-1',
      [{ id: 'n1', type: 'resource', data: { iceType: 'Storage.Bucket' } }],
      { orgId: 'org-1' },
    );

    expect(result.driftResults).toEqual([{ nodeId: 'n1', status: 'missing', changes: [] }]);
  });

  it('compares canvas desired props vs describe.properties and reports drifted with diff entries', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 'gcp.storage.bucket', resource_name: 'b', provider_id: 'p-b' },
    ]);
    setupDeployerHappyPath(async () => ({
      exists: true,
      properties: { region: 'europe-west1', memory: '512Mi' },
    }));

    const result = await checkDrift(
      'card-1',
      [
        {
          id: 'n1',
          type: 'resource',
          data: {
            iceType: 'Storage.Bucket',
            properties: { region: 'us-central1', memory: '512Mi' },
          },
        },
      ],
      { orgId: 'org-1' },
    );

    expect(result.driftResults).toHaveLength(1);
    expect(result.driftResults[0].nodeId).toBe('n1');
    expect(result.driftResults[0].status).toBe('drifted');
    expect(result.driftResults[0].changes).toEqual([
      { path: 'region', desired: 'us-central1', actual: 'europe-west1' },
    ]);
  });

  it('reports in_sync when canvas props equal describe.properties via JSON.stringify comparison', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 'gcp.storage.bucket', resource_name: 'b', provider_id: 'p-b' },
    ]);
    setupDeployerHappyPath(async () => ({
      exists: true,
      properties: { tags: ['a', 'b'] },
    }));

    const result = await checkDrift(
      'card-1',
      [{ id: 'n1', type: 'resource', data: { iceType: 'Storage.Bucket', properties: { tags: ['a', 'b'] } } }],
      { orgId: 'org-1' },
    );

    expect(result.driftResults).toEqual([{ nodeId: 'n1', status: 'in_sync', changes: [] }]);
  });

  it('skips desired keys that start with _ (internal) or are null/empty-string', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 'gcp.storage.bucket', resource_name: 'b', provider_id: 'p-b' },
    ]);
    setupDeployerHappyPath(async () => ({
      exists: true,
      properties: { _internal: 'differs', region: 'us-central1', empty: 'has-value', nullable: 'has-value' },
    }));

    const result = await checkDrift(
      'card-1',
      [
        {
          id: 'n1',
          type: 'resource',
          data: {
            iceType: 'Storage.Bucket',
            properties: {
              _internal: 'mine',
              region: 'us-central1',
              empty: '',
              nullable: null,
            },
          },
        },
      ],
      { orgId: 'org-1' },
    );

    // The only key that survives the filter (region) matches → in_sync.
    expect(result.driftResults).toEqual([{ nodeId: 'n1', status: 'in_sync', changes: [] }]);
  });

  it('skips actual props that are undefined (ICE does not manage that field for this type)', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 'gcp.storage.bucket', resource_name: 'b', provider_id: 'p-b' },
    ]);
    setupDeployerHappyPath(async () => ({
      exists: true,
      properties: { region: 'us-central1' /* no `memory` */ },
    }));

    const result = await checkDrift(
      'card-1',
      [
        {
          id: 'n1',
          type: 'resource',
          data: { iceType: 'Storage.Bucket', properties: { region: 'us-central1', memory: '512Mi' } },
        },
      ],
      { orgId: 'org-1' },
    );

    // memory is undefined on the actual side → skipped → no diff reported.
    expect(result.driftResults).toEqual([{ nodeId: 'n1', status: 'in_sync', changes: [] }]);
  });

  it('returns extra when describe.exists but no canvas node corresponds to the mapping', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'orphan', resource_type: 'gcp.storage.bucket', resource_name: 'b', provider_id: 'p-b' },
    ]);
    setupDeployerHappyPath(async () => ({
      exists: true,
      properties: { region: 'us-central1' },
    }));

    const result = await checkDrift('card-1', [], { orgId: 'org-1' });
    expect(result.driftResults).toEqual([{ nodeId: 'orphan', status: 'extra', changes: [] }]);
  });

  it('passes provider_id to deployer.describe (or falls back to resource_name when absent)', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'a', resource_type: 't', resource_name: 'res-a', provider_id: 'pid-a' },
      { node_id: 'b', resource_type: 't', resource_name: 'res-b', provider_id: null },
    ]);
    const describe = vi.fn().mockResolvedValue({ exists: true, properties: {} });
    setupDeployerHappyPath(describe);

    await checkDrift(
      'card-1',
      [
        { id: 'a', type: 'resource', data: { iceType: 'X', properties: {} } },
        { id: 'b', type: 'resource', data: { iceType: 'X', properties: {} } },
      ],
      { orgId: 'org-1' },
    );

    expect(describe).toHaveBeenNthCalledWith(1, 't', 'res-a', 'pid-a');
    // No provider_id → falls back to resource_name as the third arg.
    expect(describe).toHaveBeenNthCalledWith(2, 't', 'res-b', 'res-b');
  });

  it('falls back to authClient.projectId when scope.project is absent in initialize()', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 't', resource_name: 'r', provider_id: 'p' },
    ]);
    const deployer = fakeDeployer({ describe: async () => ({ exists: true, properties: {} }) });
    getDecryptedCredentialsMock.mockResolvedValueOnce({ project_id: 'proj-1' });
    createDeployerMock.mockResolvedValueOnce(deployer);
    resolveProviderAuthMock.mockResolvedValueOnce({
      scope: {}, // no project here
      authClient: { projectId: 'fallback-proj' },
      parsedCredentials: {},
      keyFilePath: '/tmp/k.json',
    });

    await checkDrift(
      'card-1',
      [{ id: 'n1', type: 'resource', data: { iceType: 'X', properties: {} } }],
      { orgId: 'org-1' },
    );

    expect(deployer.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'fallback-proj' }),
    );
  });

  it('falls back to stored-state path when getDecryptedCredentials returns null', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 't', resource_name: 'r', provider_id: 'p' },
    ]);
    getDecryptedCredentialsMock.mockResolvedValueOnce(null);

    const result = await checkDrift(
      'card-1',
      [{ id: 'n1', type: 'resource', data: { iceType: 'X' } }],
      { orgId: 'org-1' },
    );

    expect(createDeployerMock).not.toHaveBeenCalled();
    expect(result.unsupported).toBe(true);
    expect(result.driftResults).toEqual([{ nodeId: 'n1', status: 'in_sync', changes: [] }]);
  });

  it('logs a warning + falls through to stored-state when deployer init throws', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 't', resource_name: 'r', provider_id: 'p' },
    ]);
    getDecryptedCredentialsMock.mockResolvedValueOnce({ project_id: 'proj-1' });
    createDeployerMock.mockRejectedValueOnce(new Error('init blew up'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await checkDrift(
      'card-1',
      [{ id: 'n1', type: 'resource', data: { iceType: 'X' } }],
      { orgId: 'org-1' },
    );

    expect(warnSpy).toHaveBeenCalled();
    expect(result.unsupported).toBe(true);
    expect(result.driftResults).toEqual([{ nodeId: 'n1', status: 'in_sync', changes: [] }]);
    warnSpy.mockRestore();
  });

  it('always cleans up deployer + scoped auth even when describe throws mid-loop', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 't', resource_name: 'r', provider_id: 'p' },
    ]);
    const deployer = fakeDeployer({
      describe: async () => {
        throw new Error('describe failed');
      },
    });
    getDecryptedCredentialsMock.mockResolvedValueOnce({ project_id: 'proj-1' });
    createDeployerMock.mockResolvedValueOnce(deployer);
    resolveProviderAuthMock.mockResolvedValueOnce({
      scope: { project: 'proj-1' },
      authClient: {},
      parsedCredentials: {},
      keyFilePath: '/tmp/k.json',
    });

    await expect(
      checkDrift(
        'card-1',
        [{ id: 'n1', type: 'resource', data: { iceType: 'X', properties: {} } }],
        { orgId: 'org-1' },
      ),
    ).rejects.toThrow('describe failed');

    expect(deployer.cleanup).toHaveBeenCalledTimes(1);
    expect(cleanupProviderAuthMock).toHaveBeenCalledWith(
      'gcp',
      expect.objectContaining({ scope: { project: 'proj-1' } }),
    );
  });

  it('swallows errors from deployer.cleanup() and cleanupProviderAuth() in the finally block', async () => {
    findManyMock.mockResolvedValueOnce([
      { node_id: 'n1', resource_type: 't', resource_name: 'r', provider_id: 'p' },
    ]);
    const deployer = fakeDeployer({
      describe: async () => ({ exists: true, properties: {} }),
      cleanup: vi.fn().mockRejectedValue(new Error('cleanup-fail')),
    });
    getDecryptedCredentialsMock.mockResolvedValueOnce({ project_id: 'proj-1' });
    createDeployerMock.mockResolvedValueOnce(deployer);
    resolveProviderAuthMock.mockResolvedValueOnce({
      scope: { project: 'proj-1' },
      authClient: {},
      parsedCredentials: {},
      keyFilePath: '/tmp/k.json',
    });
    cleanupProviderAuthMock.mockRejectedValueOnce(new Error('auth-cleanup-fail'));

    // Both cleanup paths throw, but checkDrift returns normally.
    const result = await checkDrift(
      'card-1',
      [{ id: 'n1', type: 'resource', data: { iceType: 'X', properties: {} } }],
      { orgId: 'org-1' },
    );

    expect(result.driftResults).toEqual([{ nodeId: 'n1', status: 'in_sync', changes: [] }]);
  });
});

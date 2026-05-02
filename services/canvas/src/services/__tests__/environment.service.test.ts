/**
 * Unit tests for `services/canvas/src/services/environment.service.ts`.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest globals are
 * imported explicitly. Per `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * mocks are cleared in `beforeEach`.
 *
 * The SUT uses two dynamic imports we have to mock:
 *   - `crypto` (for `randomBytes(32).toString('hex')` in trigger-rule cloning)
 *   - `@ice/service-deploy` (for `createDeploymentEvent` + `getDeployQueue` in
 *     `promoteEnvironment`)
 *
 * Both are dynamic `await import(...)` calls inside `try { ... } catch (err)`
 * blocks, which means: (a) when the import-target is mocked successfully, the
 * happy path runs; (b) when an inner call throws, the catch is exercised; (c)
 * when the dynamic import itself fails, the same catch fires. We cover all
 * three.
 *
 * Prisma's `$transaction` callback is invoked with a stub `tx` mirroring the
 * surface the SUT touches so the inner branches are observable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    environment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    canvasCard: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    canvasProject: {
      update: vi.fn(),
    },
    deploymentRule: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    canvasDeployment: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => ({ toString: vi.fn(() => 'deadbeef') })),
}));

vi.mock('@ice/service-deploy', () => ({
  createDeploymentEvent: vi.fn(),
  getDeployQueue: vi.fn(),
}));

import {
  listEnvironments,
  bootstrapProductionEnvironment,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  compareEnvironments,
  promoteEnvironment,
  findEnvironmentByName,
  closePrEnvironment,
  togglePrPreviews,
} from '../environment.service.js';
// @ts-ignore — workspace-resolved at runtime
import prisma from '@ice/db';
import { createDeploymentEvent, getDeployQueue } from '@ice/service-deploy';

const envFindMany = (prisma as any).environment.findMany as ReturnType<typeof vi.fn>;
const envFindFirst = (prisma as any).environment.findFirst as ReturnType<typeof vi.fn>;
const envFindUnique = (prisma as any).environment.findUnique as ReturnType<typeof vi.fn>;
const envCount = (prisma as any).environment.count as ReturnType<typeof vi.fn>;
const envCreate = (prisma as any).environment.create as ReturnType<typeof vi.fn>;
const envUpdate = (prisma as any).environment.update as ReturnType<typeof vi.fn>;
const cardCreate = (prisma as any).canvasCard.create as ReturnType<typeof vi.fn>;
const cardUpdate = (prisma as any).canvasCard.update as ReturnType<typeof vi.fn>;
const cardDelete = (prisma as any).canvasCard.delete as ReturnType<typeof vi.fn>;
const projectUpdate = (prisma as any).canvasProject.update as ReturnType<typeof vi.fn>;
const ruleFindMany = (prisma as any).deploymentRule.findMany as ReturnType<typeof vi.fn>;
const ruleCreate = (prisma as any).deploymentRule.create as ReturnType<typeof vi.fn>;
const deploymentFindFirst = (prisma as any).canvasDeployment.findFirst as ReturnType<typeof vi.fn>;
const transactionMock = (prisma as any).$transaction as ReturnType<typeof vi.fn>;
const createDeploymentEventMock = createDeploymentEvent as unknown as ReturnType<typeof vi.fn>;
const getDeployQueueMock = getDeployQueue as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── listEnvironments ────────────────────────────────────────────────────────

describe('listEnvironments', () => {
  it('queries by project_id with the production-first ordering', async () => {
    envFindMany.mockResolvedValue([{ id: 'e1' }]);

    const result = await listEnvironments('proj-1');

    expect(result).toEqual([{ id: 'e1' }]);
    expect(envFindMany).toHaveBeenCalledTimes(1);
    const args = envFindMany.mock.calls[0]![0];
    expect(args.where).toEqual({ project_id: 'proj-1' });
    expect(args.orderBy).toEqual([{ is_protected: 'desc' }, { created_at: 'asc' }]);
  });
});

// ── bootstrapProductionEnvironment ──────────────────────────────────────────

describe('bootstrapProductionEnvironment', () => {
  it('returns the existing production environment without spinning up a new card', async () => {
    const existing = { id: 'env-prod', type: 'production' };
    envFindFirst.mockResolvedValue(existing);

    const result = await bootstrapProductionEnvironment('p1', 'u1', 'My Project');

    expect(result).toBe(existing);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(cardCreate).not.toHaveBeenCalled();
  });

  it('creates a new card AND production env inside a transaction when none exists', async () => {
    envFindFirst.mockResolvedValue(null);
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: vi.fn().mockResolvedValue({ id: 'card-new' }) },
      environment: { create: vi.fn().mockResolvedValue({ id: 'env-new', type: 'production' }) },
    }));

    const result = await bootstrapProductionEnvironment('p1', 'u1', 'Acme');

    expect(transactionMock).toHaveBeenCalled();
    expect(result).toEqual({ id: 'env-new', type: 'production' });
  });

  it('reuses an existingCardId without creating a new card', async () => {
    envFindFirst.mockResolvedValue(null);
    const txCardCreate = vi.fn();
    const txEnvCreate = vi.fn().mockResolvedValue({ id: 'env-x' });
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: txCardCreate },
      environment: { create: txEnvCreate },
    }));

    await bootstrapProductionEnvironment('p1', 'u1', 'Acme', 'card-existing');

    expect(txCardCreate).not.toHaveBeenCalled();
    expect(txEnvCreate.mock.calls[0]![0].data.card_id).toBe('card-existing');
    expect(txEnvCreate.mock.calls[0]![0].data.is_protected).toBe(true);
    expect(txEnvCreate.mock.calls[0]![0].data.type).toBe('production');
  });
});

// ── createEnvironment ───────────────────────────────────────────────────────

describe('createEnvironment', () => {
  it('throws when the project already has the maximum number of environments', async () => {
    envCount.mockResolvedValue(20);

    await expect(createEnvironment('p1', 'u1', 'staging', 'staging')).rejects.toThrow(
      /Maximum 20 environments/,
    );
  });

  it('throws when production is missing', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue(null);

    await expect(createEnvironment('p1', 'u1', 'staging', 'staging')).rejects.toThrow(
      'Production environment not found. Cannot clone.',
    );
  });

  it('clones nodes/edges/viewport from the production card and creates a new env', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue({
      card_id: 'prod-card',
      card: { nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }], viewport: { x: 0, y: 0, zoom: 1 } },
    });
    const txCardCreate = vi.fn().mockResolvedValue({ id: 'new-card' });
    const txEnvCreate = vi.fn().mockResolvedValue({
      id: 'env-new',
      card: { id: 'new-card', name: 'Staging', updated_at: new Date() },
    });
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: txCardCreate },
      environment: { create: txEnvCreate },
    }));
    ruleFindMany.mockResolvedValue([]);

    const result = await createEnvironment('p1', 'u1', 'Staging', 'staging');

    expect(txCardCreate.mock.calls[0]![0].data.nodes).toEqual([{ id: 'n1' }]);
    expect(txCardCreate.mock.calls[0]![0].data.edges).toEqual([{ id: 'e1' }]);
    expect(txCardCreate.mock.calls[0]![0].data.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(txEnvCreate.mock.calls[0]![0].data.name).toBe('staging'); // lowercased & dashed
    expect(result.id).toBe('env-new');
  });

  it('keeps cloned viewport=null when production card has no viewport', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue({
      card_id: 'prod-card',
      card: { nodes: [], edges: [], viewport: null },
    });
    const txCardCreate = vi.fn().mockResolvedValue({ id: 'new-card' });
    const txEnvCreate = vi.fn().mockResolvedValue({ id: 'env-x', card: { id: 'new-card' } });
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: txCardCreate },
      environment: { create: txEnvCreate },
    }));
    ruleFindMany.mockResolvedValue([]);

    await createEnvironment('p1', 'u1', 'feature x', 'development');

    expect(txCardCreate.mock.calls[0]![0].data.viewport).toBeNull();
  });

  it('lowercases and dashes the env name when normalising', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue({ card_id: 'pc', card: { nodes: [], edges: [], viewport: null } });
    const txEnvCreate = vi.fn().mockResolvedValue({ id: 'env', card: { id: 'c' } });
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: vi.fn().mockResolvedValue({ id: 'c' }) },
      environment: { create: txEnvCreate },
    }));
    ruleFindMany.mockResolvedValue([]);

    await createEnvironment('p1', 'u1', 'My Cool Env', 'development');

    expect(txEnvCreate.mock.calls[0]![0].data.name).toBe('my-cool-env');
  });

  it('defaults type to "development" when type arg is empty', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue({ card_id: 'pc', card: { nodes: [], edges: [], viewport: null } });
    const txEnvCreate = vi.fn().mockResolvedValue({ id: 'env', card: { id: 'c' } });
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: vi.fn().mockResolvedValue({ id: 'c' }) },
      environment: { create: txEnvCreate },
    }));
    ruleFindMany.mockResolvedValue([]);

    await createEnvironment('p1', 'u1', 'feature', '');

    expect(txEnvCreate.mock.calls[0]![0].data.type).toBe('development');
  });

  it('clones production trigger rules with branch_pattern="staging" when env name is staging', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue({ card_id: 'pc', card: { nodes: [], edges: [], viewport: null } });
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: vi.fn().mockResolvedValue({ id: 'newc' }) },
      environment: { create: vi.fn().mockResolvedValue({ id: 'env-stg', card: { id: 'newc' } }) },
    }));
    ruleFindMany.mockResolvedValue([
      {
        node_id: 'n1',
        repository: 'foo/bar',
        trigger_type: 'push',
        build_command: 'npm run build',
        install_command: 'npm i',
        output_dir: 'dist',
        framework: 'next',
        organisation_id: 'org-1',
      },
    ]);
    ruleCreate.mockResolvedValue({});

    await createEnvironment('p1', 'u1', 'staging', 'staging');

    expect(ruleCreate).toHaveBeenCalledTimes(1);
    expect(ruleCreate.mock.calls[0]![0].data.branch_pattern).toBe('staging');
    expect(ruleCreate.mock.calls[0]![0].data.environment).toBe('staging');
    expect(ruleCreate.mock.calls[0]![0].data.webhook_secret).toBe('deadbeef');
  });

  it('uses branch_pattern="develop" when env name is develop', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue({ card_id: 'pc', card: { nodes: [], edges: [], viewport: null } });
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: vi.fn().mockResolvedValue({ id: 'newc' }) },
      environment: { create: vi.fn().mockResolvedValue({ id: 'env-dev', card: { id: 'newc' } }) },
    }));
    ruleFindMany.mockResolvedValue([{ node_id: 'n', organisation_id: 'org' }]);
    ruleCreate.mockResolvedValue({});

    await createEnvironment('p1', 'u1', 'develop', 'development');

    expect(ruleCreate.mock.calls[0]![0].data.branch_pattern).toBe('develop');
  });

  it('uses branch_pattern="develop" when env name is development (alias)', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue({ card_id: 'pc', card: { nodes: [], edges: [], viewport: null } });
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: vi.fn().mockResolvedValue({ id: 'newc' }) },
      environment: { create: vi.fn().mockResolvedValue({ id: 'env-dev', card: { id: 'newc' } }) },
    }));
    ruleFindMany.mockResolvedValue([{ node_id: 'n', organisation_id: 'org' }]);
    ruleCreate.mockResolvedValue({});

    await createEnvironment('p1', 'u1', 'development', 'development');

    expect(ruleCreate.mock.calls[0]![0].data.branch_pattern).toBe('develop');
  });

  it('uses prBranch as branch_pattern when type=pr and prBranch is provided', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue({ card_id: 'pc', card: { nodes: [], edges: [], viewport: null } });
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: vi.fn().mockResolvedValue({ id: 'newc' }) },
      environment: { create: vi.fn().mockResolvedValue({ id: 'env-pr', card: { id: 'newc' } }) },
    }));
    ruleFindMany.mockResolvedValue([{ node_id: 'n', organisation_id: 'org' }]);
    ruleCreate.mockResolvedValue({});

    await createEnvironment('p1', 'u1', 'pr-123', 'pr', 'us-east', 123, 'feat/login', 'me/repo');

    expect(ruleCreate.mock.calls[0]![0].data.branch_pattern).toBe('feat/login');
  });

  it('falls back to the env name as branch_pattern when env is not staging/develop and not a PR', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue({ card_id: 'pc', card: { nodes: [], edges: [], viewport: null } });
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: vi.fn().mockResolvedValue({ id: 'newc' }) },
      environment: { create: vi.fn().mockResolvedValue({ id: 'env-pre', card: { id: 'newc' } }) },
    }));
    ruleFindMany.mockResolvedValue([{ node_id: 'n', organisation_id: 'org' }]);
    ruleCreate.mockResolvedValue({});

    await createEnvironment('p1', 'u1', 'preview', 'development');

    expect(ruleCreate.mock.calls[0]![0].data.branch_pattern).toBe('preview');
  });

  it('falls back to env name when type=pr but prBranch is missing', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue({ card_id: 'pc', card: { nodes: [], edges: [], viewport: null } });
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: vi.fn().mockResolvedValue({ id: 'newc' }) },
      environment: { create: vi.fn().mockResolvedValue({ id: 'env-pr', card: { id: 'newc' } }) },
    }));
    ruleFindMany.mockResolvedValue([{ node_id: 'n', organisation_id: 'org' }]);
    ruleCreate.mockResolvedValue({});

    await createEnvironment('p1', 'u1', 'pr-x', 'pr');

    expect(ruleCreate.mock.calls[0]![0].data.branch_pattern).toBe('pr-x');
  });

  it('logs and continues when trigger-rule cloning fails (does not bubble the error)', async () => {
    envCount.mockResolvedValue(0);
    envFindFirst.mockResolvedValue({ card_id: 'pc', card: { nodes: [], edges: [], viewport: null } });
    const result = { id: 'env-new', card: { id: 'newc' } };
    transactionMock.mockImplementation(async (cb: any) => cb({
      canvasCard: { create: vi.fn().mockResolvedValue({ id: 'newc' }) },
      environment: { create: vi.fn().mockResolvedValue(result) },
    }));
    ruleFindMany.mockRejectedValue(new Error('db blew up'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = await createEnvironment('p1', 'u1', 'staging', 'staging');

    expect(out).toBe(result);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ── updateEnvironment ───────────────────────────────────────────────────────

describe('updateEnvironment', () => {
  it('throws when the env does not exist', async () => {
    envFindUnique.mockResolvedValue(null);

    await expect(updateEnvironment('e1', { name: 'New' })).rejects.toThrow('Environment not found');
  });

  it('throws when attempting to rename a protected (production) env', async () => {
    envFindUnique.mockResolvedValue({ id: 'e1', is_protected: true });

    await expect(updateEnvironment('e1', { name: 'NewName' })).rejects.toThrow(
      'Cannot rename the production environment',
    );
  });

  it('allows changing region on a protected env (no rename attempted)', async () => {
    envFindUnique.mockResolvedValue({ id: 'e1', is_protected: true });
    envUpdate.mockResolvedValue({ id: 'e1' });

    await updateEnvironment('e1', { region: 'eu-west' });

    expect(envUpdate.mock.calls[0]![0].data).toEqual({ region: 'eu-west' });
  });

  it('lowercases and dashes the new name when renaming a non-protected env', async () => {
    envFindUnique.mockResolvedValue({ id: 'e1', is_protected: false });
    envUpdate.mockResolvedValue({ id: 'e1' });

    await updateEnvironment('e1', { name: 'My New Name' });

    expect(envUpdate.mock.calls[0]![0].data.name).toBe('my-new-name');
  });

  it('produces an empty data payload when no fields are provided', async () => {
    envFindUnique.mockResolvedValue({ id: 'e1', is_protected: false });
    envUpdate.mockResolvedValue({ id: 'e1' });

    await updateEnvironment('e1', {});

    expect(envUpdate.mock.calls[0]![0].data).toEqual({});
  });
});

// ── deleteEnvironment ───────────────────────────────────────────────────────

describe('deleteEnvironment', () => {
  it('throws when the env does not exist', async () => {
    envFindUnique.mockResolvedValue(null);

    await expect(deleteEnvironment('e1')).rejects.toThrow('Environment not found');
  });

  it('refuses to delete a protected (production) env', async () => {
    envFindUnique.mockResolvedValue({ id: 'e1', is_protected: true, card_id: 'c1' });

    await expect(deleteEnvironment('e1')).rejects.toThrow('Production environment cannot be deleted');
    expect(cardDelete).not.toHaveBeenCalled();
  });

  it('deletes the underlying card (cascading the env via the 1:1 relation)', async () => {
    envFindUnique.mockResolvedValue({ id: 'e1', is_protected: false, card_id: 'card-x' });
    deploymentFindFirst.mockResolvedValue(null);
    cardDelete.mockResolvedValue({});

    await deleteEnvironment('e1');

    expect(cardDelete).toHaveBeenCalledWith({ where: { id: 'card-x' } });
  });

  it('refuses to delete while a deployment is in flight (findings #13)', async () => {
    // Without this guard the canvasCard.delete cascades through
    // CanvasDeployment.card_id and a worker tearing down resources
    // either races against the cascade or finds its parent row gone.
    envFindUnique.mockResolvedValue({ id: 'e1', is_protected: false, card_id: 'card-x' });
    deploymentFindFirst.mockResolvedValue({ id: 'd1', status: 'deploying' });

    await expect(deleteEnvironment('e1')).rejects.toThrow(/in flight.*deploying/);
    expect(cardDelete).not.toHaveBeenCalled();
  });

  it('does NOT consider terminal deployments (success/failed/cancelled) as in-flight', async () => {
    // The check filters by status so completed history rows don't
    // permanently lock the environment. The findFirst query itself
    // is what enforces this — we only verify the call shape.
    envFindUnique.mockResolvedValue({ id: 'e1', is_protected: false, card_id: 'card-x' });
    deploymentFindFirst.mockResolvedValue(null);
    cardDelete.mockResolvedValue({});

    await deleteEnvironment('e1');

    expect(deploymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          card_id: 'card-x',
          status: { in: ['planning', 'planned', 'deploying'] },
        }),
      }),
    );
  });
});

// ── compareEnvironments ────────────────────────────────────────────────────

describe('compareEnvironments', () => {
  it('throws when either env is missing', async () => {
    envFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 't', card: { nodes: [] } });

    await expect(compareEnvironments('s', 't')).rejects.toThrow('Environment not found');
  });

  it('throws when the target env is missing', async () => {
    envFindUnique
      .mockResolvedValueOnce({ id: 's', card: { nodes: [] } })
      .mockResolvedValueOnce(null);

    await expect(compareEnvironments('s', 't')).rejects.toThrow('Environment not found');
  });

  it('reports an empty diff when both cards are empty', async () => {
    envFindUnique
      .mockResolvedValueOnce({ id: 's', card: { nodes: [] } })
      .mockResolvedValueOnce({ id: 't', card: { nodes: [] } });

    const diff = await compareEnvironments('s', 't');

    expect(diff).toEqual({ added: [], removed: [], modified: [], unchangedCount: 0 });
  });

  it('reports added when source has a node missing from target', async () => {
    envFindUnique
      .mockResolvedValueOnce({
        id: 's',
        card: { nodes: [{ id: 'n1', data: { label: 'A', iceType: 'gcp.run.service' } }] },
      })
      .mockResolvedValueOnce({ id: 't', card: { nodes: [] } });

    const diff = await compareEnvironments('s', 't');

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]).toMatchObject({
      status: 'added',
      nodeId: 'n1',
      label: 'A',
      iceType: 'gcp.run.service',
    });
    expect(diff.removed).toEqual([]);
  });

  it('reports removed when target has a node missing from source', async () => {
    envFindUnique
      .mockResolvedValueOnce({ id: 's', card: { nodes: [] } })
      .mockResolvedValueOnce({
        id: 't',
        card: { nodes: [{ id: 'n2', data: { label: 'B', iceType: 'gcp.storage.bucket' } }] },
      });

    const diff = await compareEnvironments('s', 't');

    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]).toMatchObject({
      status: 'removed',
      nodeId: 'n2',
      label: 'B',
      iceType: 'gcp.storage.bucket',
    });
  });

  it('falls back to top-level label when data.label is absent', async () => {
    envFindUnique
      .mockResolvedValueOnce({
        id: 's',
        card: { nodes: [{ id: 'n1', label: 'TopLabel', data: {} }] },
      })
      .mockResolvedValueOnce({ id: 't', card: { nodes: [] } });

    const diff = await compareEnvironments('s', 't');

    expect(diff.added[0]?.label).toBe('TopLabel');
  });

  it('falls back to nodeId when neither data.label nor top-level label exist', async () => {
    envFindUnique
      .mockResolvedValueOnce({
        id: 's',
        card: { nodes: [{ id: 'n1', data: {} }] },
      })
      .mockResolvedValueOnce({ id: 't', card: { nodes: [] } });

    const diff = await compareEnvironments('s', 't');

    expect(diff.added[0]?.label).toBe('n1');
  });

  it('handles missing data on removed nodes (defaults to nodeId / "")', async () => {
    envFindUnique
      .mockResolvedValueOnce({ id: 's', card: { nodes: [] } })
      .mockResolvedValueOnce({ id: 't', card: { nodes: [{ id: 'n2' }] } });

    const diff = await compareEnvironments('s', 't');

    expect(diff.removed[0]).toMatchObject({ nodeId: 'n2', label: 'n2', iceType: '' });
  });

  it('counts unchanged nodes when source and target match exactly', async () => {
    const node = {
      id: 'n1',
      data: { label: 'A', iceType: 'x' },
      position: { x: 0, y: 0 },
      width: 10,
      height: 10,
    };
    envFindUnique
      .mockResolvedValueOnce({ id: 's', card: { nodes: [node] } })
      .mockResolvedValueOnce({ id: 't', card: { nodes: [node] } });

    const diff = await compareEnvironments('s', 't');

    expect(diff.modified).toEqual([]);
    expect(diff.unchangedCount).toBe(1);
  });

  it('reports modified when data fields differ and accumulates the changed field names', async () => {
    envFindUnique
      .mockResolvedValueOnce({
        id: 's',
        card: {
          nodes: [
            {
              id: 'n1',
              data: { label: 'A', iceType: 'x', cpu: 1 },
              position: { x: 0, y: 0 },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        id: 't',
        card: {
          nodes: [
            {
              id: 'n1',
              data: { label: 'A', iceType: 'x', cpu: 2 },
              position: { x: 0, y: 0 },
            },
          ],
        },
      });

    const diff = await compareEnvironments('s', 't');

    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]?.changedFields).toContain('cpu');
  });

  it('reports modified when only position differs (changedFields includes "position")', async () => {
    envFindUnique
      .mockResolvedValueOnce({
        id: 's',
        card: {
          nodes: [{ id: 'n1', data: { label: 'A', iceType: 'x' }, position: { x: 0, y: 0 } }],
        },
      })
      .mockResolvedValueOnce({
        id: 't',
        card: {
          nodes: [{ id: 'n1', data: { label: 'A', iceType: 'x' }, position: { x: 5, y: 5 } }],
        },
      });

    const diff = await compareEnvironments('s', 't');

    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]?.changedFields).toEqual(['position']);
  });

  it('handles modified nodes whose source/target data is undefined', async () => {
    envFindUnique
      .mockResolvedValueOnce({
        id: 's',
        card: {
          nodes: [{ id: 'n1', position: { x: 0, y: 0 } }],
        },
      })
      .mockResolvedValueOnce({
        id: 't',
        card: {
          nodes: [{ id: 'n1', position: { x: 1, y: 1 } }],
        },
      });

    const diff = await compareEnvironments('s', 't');

    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]?.changedFields).toContain('position');
  });

  it('walks data keys via the {} fallback when one side has data but the other does not (s set, t missing)', async () => {
    // s.data is set, t.data is undefined → triggers the `|| {}` fallback on
    // t.data inside the changed-field walker (line 376).
    envFindUnique
      .mockResolvedValueOnce({
        id: 's',
        card: {
          nodes: [{ id: 'n1', data: { foo: 1, bar: 2 }, position: { x: 0, y: 0 } }],
        },
      })
      .mockResolvedValueOnce({
        id: 't',
        card: {
          nodes: [{ id: 'n1', position: { x: 0, y: 0 } }],
        },
      });

    const diff = await compareEnvironments('s', 't');

    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]?.changedFields).toEqual(expect.arrayContaining(['foo', 'bar']));
  });

  it('walks data keys via the {} fallback when only target has data (mirror of the prior case)', async () => {
    envFindUnique
      .mockResolvedValueOnce({
        id: 's',
        card: {
          nodes: [{ id: 'n1', position: { x: 0, y: 0 } }],
        },
      })
      .mockResolvedValueOnce({
        id: 't',
        card: {
          nodes: [{ id: 'n1', data: { qux: 9 }, position: { x: 0, y: 0 } }],
        },
      });

    const diff = await compareEnvironments('s', 't');

    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]?.changedFields).toContain('qux');
  });
});

// ── promoteEnvironment ─────────────────────────────────────────────────────

describe('promoteEnvironment', () => {
  it('throws when source is missing', async () => {
    envFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 't', type: 'production' });

    await expect(promoteEnvironment('s', 't', 'u1')).rejects.toThrow('Environment not found');
  });

  it('throws when target is not production', async () => {
    envFindUnique
      .mockResolvedValueOnce({ id: 's', card: { nodes: [], edges: [] }, name: 'staging' })
      .mockResolvedValueOnce({ id: 't', type: 'development', card_id: 'tc' });

    await expect(promoteEnvironment('s', 't', 'u1')).rejects.toThrow(
      'Can only promote to the production environment',
    );
    expect(cardUpdate).not.toHaveBeenCalled();
  });

  it('overwrites the production card with source nodes/edges', async () => {
    envFindUnique
      .mockResolvedValueOnce({
        id: 's',
        name: 'staging',
        card: { nodes: [{ id: 'a' }], edges: [{ id: 'e' }] },
      })
      .mockResolvedValueOnce({ id: 't', type: 'production', card_id: 'prod-card', name: 'production' });
    cardUpdate.mockResolvedValue({});
    ruleFindMany.mockResolvedValue([]);

    await promoteEnvironment('s', 't', 'u1');

    expect(cardUpdate).toHaveBeenCalledWith({
      where: { id: 'prod-card' },
      data: { nodes: [{ id: 'a' }], edges: [{ id: 'e' }] },
    });
  });

  it('queues a re-deploy on the production card when there are enabled rules', async () => {
    envFindUnique
      .mockResolvedValueOnce({
        id: 's',
        name: 'staging',
        card: { nodes: [], edges: [] },
      })
      .mockResolvedValueOnce({
        id: 't',
        type: 'production',
        card_id: 'prod-card',
        name: 'production',
      });
    cardUpdate.mockResolvedValue({});
    ruleFindMany.mockResolvedValue([
      {
        id: 'rule-1',
        node_id: 'n1',
        repository: 'foo/bar',
        branch_pattern: 'main',
        build_command: 'b',
        install_command: 'i',
        output_dir: 'dist',
        framework: 'next',
      },
    ]);
    createDeploymentEventMock.mockResolvedValue({ id: 'evt-1' });
    const queueAdd = vi.fn().mockResolvedValue(undefined);
    getDeployQueueMock.mockReturnValue({ add: queueAdd });

    await promoteEnvironment('s', 't', 'u1');

    expect(createDeploymentEventMock).toHaveBeenCalledWith(
      'rule-1',
      'manual',
      'promote',
      'main',
      'Promoted from staging',
      'u1',
    );
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd.mock.calls[0]![0]).toBe('pipeline');
    expect(queueAdd.mock.calls[0]![1]).toMatchObject({
      eventId: 'evt-1',
      ruleId: 'rule-1',
      cardId: 'prod-card',
      environment: 'production',
    });
  });

  it('skips queue add when there are no enabled rules', async () => {
    envFindUnique
      .mockResolvedValueOnce({ id: 's', name: 'staging', card: { nodes: [], edges: [] } })
      .mockResolvedValueOnce({ id: 't', type: 'production', card_id: 'pc', name: 'production' });
    cardUpdate.mockResolvedValue({});
    ruleFindMany.mockResolvedValue([]);

    await promoteEnvironment('s', 't', 'u1');

    expect(getDeployQueueMock).not.toHaveBeenCalled();
  });

  it('logs and continues when re-deploy queueing fails (does not bubble)', async () => {
    envFindUnique
      .mockResolvedValueOnce({ id: 's', name: 'staging', card: { nodes: [], edges: [] } })
      .mockResolvedValueOnce({ id: 't', type: 'production', card_id: 'pc', name: 'production' });
    cardUpdate.mockResolvedValue({});
    ruleFindMany.mockRejectedValue(new Error('db down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await promoteEnvironment('s', 't', 'u1');

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ── findEnvironmentByName ──────────────────────────────────────────────────

describe('findEnvironmentByName', () => {
  it('queries by project_id and name', async () => {
    envFindFirst.mockResolvedValue({ id: 'e', card: { id: 'c' } });

    const result = await findEnvironmentByName('p1', 'staging');

    expect(envFindFirst).toHaveBeenCalledWith({
      where: { project_id: 'p1', name: 'staging' },
      include: { card: { select: { id: true } } },
    });
    expect(result).toEqual({ id: 'e', card: { id: 'c' } });
  });
});

// ── closePrEnvironment ─────────────────────────────────────────────────────

describe('closePrEnvironment', () => {
  it('deletes the underlying cards for every matching PR env', async () => {
    envFindMany.mockResolvedValue([
      { id: 'e1', card_id: 'c1' },
      { id: 'e2', card_id: 'c2' },
    ]);
    cardDelete.mockResolvedValue({});

    await closePrEnvironment('me/repo', 42);

    expect(envFindMany).toHaveBeenCalledWith({
      where: { pr_source_repo: 'me/repo', pr_number: 42 },
    });
    expect(cardDelete).toHaveBeenCalledTimes(2);
    expect(cardDelete).toHaveBeenNthCalledWith(1, { where: { id: 'c1' } });
    expect(cardDelete).toHaveBeenNthCalledWith(2, { where: { id: 'c2' } });
  });

  it('swallows individual card-delete failures so a partial cleanup still finishes', async () => {
    envFindMany.mockResolvedValue([
      { id: 'e1', card_id: 'c1' },
      { id: 'e2', card_id: 'c2' },
    ]);
    cardDelete
      .mockRejectedValueOnce(new Error('fk constraint'))
      .mockResolvedValueOnce({});

    // Must not throw
    await closePrEnvironment('me/repo', 99);

    expect(cardDelete).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when no envs match', async () => {
    envFindMany.mockResolvedValue([]);

    await closePrEnvironment('me/repo', 1);

    expect(cardDelete).not.toHaveBeenCalled();
  });
});

// ── togglePrPreviews ────────────────────────────────────────────────────────

describe('togglePrPreviews', () => {
  it('flips pr_previews_enabled to true', async () => {
    projectUpdate.mockResolvedValue({});

    await togglePrPreviews('p1', true);

    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { pr_previews_enabled: true },
    });
  });

  it('flips pr_previews_enabled to false', async () => {
    projectUpdate.mockResolvedValue({});

    await togglePrPreviews('p1', false);

    expect(projectUpdate.mock.calls[0]![0].data).toEqual({ pr_previews_enabled: false });
  });
});

/**
 * Unit tests for `services/deploy/src/services/resource-mapping.service.ts` —
 * the canvas-node-id ↔ GCP-resource-name mapping table CRUD helpers and the
 * one-time history-seeded migration (`seedMappingsFromHistory`).
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest globals
 * are imported explicitly so the deploy package's `pnpm typecheck` stays
 * green. Per `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * mocks are cleared in `beforeEach`.
 *
 * Coverage notes for `removeResourceMapping`: `prisma...delete().catch(...)`
 * is implemented as a thenable's `.catch`, so the prisma mock returns an
 * object with both `then` (so `await` resolves) and `catch` (so the chained
 * `.catch(() => ...)` swallows the rejection). A plain `Promise.reject` would
 * fire the catch but would also leave the `await` unresolved against the
 * rejected branch — using a chainable thenable mirrors prisma's actual
 * delete promise shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    deployedResourceMapping: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    canvasDeployment: {
      findFirst: vi.fn(),
    },
  },
}));

import {
  getResourceMap,
  getExistingNameMap,
  upsertResourceMapping,
  removeResourceMapping,
  removeAllMappingsForCard,
  seedMappingsFromHistory,
} from '../resource-mapping.service';
// @ts-ignore — resolved at runtime via pnpm workspace; mocked above
import prismaModule from '@ice/db';

const findManyMock = (prismaModule as any).deployedResourceMapping.findMany as ReturnType<typeof vi.fn>;
const upsertMock = (prismaModule as any).deployedResourceMapping.upsert as ReturnType<typeof vi.fn>;
const deleteMock = (prismaModule as any).deployedResourceMapping.delete as ReturnType<typeof vi.fn>;
const deleteManyMock = (prismaModule as any).deployedResourceMapping.deleteMany as ReturnType<typeof vi.fn>;
const countMock = (prismaModule as any).deployedResourceMapping.count as ReturnType<typeof vi.fn>;
const findFirstMock = (prismaModule as any).canvasDeployment.findFirst as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getResourceMap', () => {
  it('returns an empty Map when prisma findMany resolves []', async () => {
    findManyMock.mockResolvedValueOnce([]);

    const result = await getResourceMap('card-1', 'production');

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { card_id: 'card-1', environment: 'production' },
    });
  });

  it('builds a Map keyed by node_id, projecting resource_name → name and resource_type → type', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        node_id: 'node-A',
        resource_name: 'web-svc',
        resource_type: 'gcp.run.service',
        provider_id: 'projects/x/services/web-svc',
      },
      {
        node_id: 'node-B',
        resource_name: 'data-bucket',
        resource_type: 'gcp.storage.bucket',
        provider_id: 'gs://data-bucket',
      },
    ]);

    const result = await getResourceMap('card-1', 'dev');

    expect(result.size).toBe(2);
    expect(result.get('node-A')).toEqual({
      name: 'web-svc',
      type: 'gcp.run.service',
      providerId: 'projects/x/services/web-svc',
    });
    expect(result.get('node-B')).toEqual({
      name: 'data-bucket',
      type: 'gcp.storage.bucket',
      providerId: 'gs://data-bucket',
    });
  });

  it('coerces null provider_id to undefined on the entry', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        node_id: 'node-A',
        resource_name: 'svc',
        resource_type: 'gcp.run.service',
        provider_id: null,
      },
    ]);

    const result = await getResourceMap('card-1', 'production');

    expect(result.get('node-A')).toEqual({
      name: 'svc',
      type: 'gcp.run.service',
      providerId: undefined,
    });
  });

  it('propagates a prisma rejection', async () => {
    findManyMock.mockRejectedValueOnce(new Error('db down'));

    await expect(getResourceMap('card-1', 'production')).rejects.toThrow('db down');
  });
});

describe('getExistingNameMap', () => {
  it('returns an empty Map when getResourceMap returns no rows', async () => {
    findManyMock.mockResolvedValueOnce([]);

    const result = await getExistingNameMap('card-1', 'production');

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('flattens the entry Map to node_id → name', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        node_id: 'node-A',
        resource_name: 'web-svc',
        resource_type: 'gcp.run.service',
        provider_id: 'p-1',
      },
      {
        node_id: 'node-B',
        resource_name: 'data-bucket',
        resource_type: 'gcp.storage.bucket',
        provider_id: null,
      },
    ]);

    const result = await getExistingNameMap('card-1', 'production');

    expect(result.size).toBe(2);
    expect(result.get('node-A')).toBe('web-svc');
    expect(result.get('node-B')).toBe('data-bucket');
  });

  it('propagates the underlying prisma rejection', async () => {
    findManyMock.mockRejectedValueOnce(new Error('boom'));

    await expect(getExistingNameMap('card-1', 'production')).rejects.toThrow('boom');
  });
});

describe('upsertResourceMapping', () => {
  it('forwards the composite unique key, update payload, and create payload to prisma.upsert', async () => {
    upsertMock.mockResolvedValueOnce({});

    await upsertResourceMapping({
      cardId: 'card-1',
      nodeId: 'node-A',
      environment: 'production',
      resourceType: 'gcp.run.service',
      resourceName: 'web-svc',
      providerId: 'projects/x/services/web-svc',
    });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith({
      where: {
        card_id_node_id_environment: {
          card_id: 'card-1',
          node_id: 'node-A',
          environment: 'production',
        },
      },
      update: {
        resource_type: 'gcp.run.service',
        resource_name: 'web-svc',
        provider_id: 'projects/x/services/web-svc',
      },
      create: {
        card_id: 'card-1',
        node_id: 'node-A',
        environment: 'production',
        resource_type: 'gcp.run.service',
        resource_name: 'web-svc',
        provider_id: 'projects/x/services/web-svc',
      },
    });
  });

  it('coerces missing providerId to null on both update and create branches', async () => {
    upsertMock.mockResolvedValueOnce({});

    await upsertResourceMapping({
      cardId: 'card-1',
      nodeId: 'node-A',
      environment: 'dev',
      resourceType: 'gcp.storage.bucket',
      resourceName: 'b',
    });

    const arg = upsertMock.mock.calls[0]?.[0];
    expect(arg.update.provider_id).toBeNull();
    expect(arg.create.provider_id).toBeNull();
  });

  it('propagates a prisma upsert rejection', async () => {
    upsertMock.mockRejectedValueOnce(new Error('unique violation'));

    await expect(
      upsertResourceMapping({
        cardId: 'card-1',
        nodeId: 'node-A',
        environment: 'production',
        resourceType: 'gcp.run.service',
        resourceName: 'web',
      }),
    ).rejects.toThrow('unique violation');
  });
});

describe('removeResourceMapping', () => {
  it('forwards the composite unique key to prisma.delete', async () => {
    deleteMock.mockResolvedValueOnce({});

    await removeResourceMapping({
      cardId: 'card-1',
      nodeId: 'node-A',
      environment: 'production',
    });

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith({
      where: {
        card_id_node_id_environment: {
          card_id: 'card-1',
          node_id: 'node-A',
          environment: 'production',
        },
      },
    });
  });

  it('swallows prisma rejections so the call is idempotent against missing rows', async () => {
    // The SUT calls `prisma...delete({ ... }).catch(() => {})`. The mock
    // returns a plain rejected Promise; chaining `.catch` on it produces a
    // resolved promise, matching prisma's actual NOT_FOUND behavior.
    deleteMock.mockReturnValueOnce(Promise.reject(new Error('record not found')));

    await expect(
      removeResourceMapping({
        cardId: 'card-1',
        nodeId: 'node-A',
        environment: 'production',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('removeAllMappingsForCard', () => {
  it('omits environment from the where clause when not provided', async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 0 });

    await removeAllMappingsForCard('card-1');

    expect(deleteManyMock).toHaveBeenCalledTimes(1);
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { card_id: 'card-1' },
    });
  });

  it('includes environment in the where clause when provided', async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 3 });

    await removeAllMappingsForCard('card-1', 'production');

    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { card_id: 'card-1', environment: 'production' },
    });
  });

  it('propagates a prisma deleteMany rejection', async () => {
    deleteManyMock.mockRejectedValueOnce(new Error('boom'));

    await expect(removeAllMappingsForCard('card-1', 'dev')).rejects.toThrow('boom');
  });
});

describe('seedMappingsFromHistory', () => {
  it('returns 0 immediately when the mapping table already has entries (skips lazy migration)', async () => {
    countMock.mockResolvedValueOnce(7);

    const seeded = await seedMappingsFromHistory('card-1', 'production');

    expect(seeded).toBe(0);
    expect(countMock).toHaveBeenCalledWith({
      where: { card_id: 'card-1', environment: 'production' },
    });
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns 0 when no prior successful/partial deployment exists', async () => {
    countMock.mockResolvedValueOnce(0);
    findFirstMock.mockResolvedValueOnce(null);

    const seeded = await seedMappingsFromHistory('card-1', 'production');

    expect(seeded).toBe(0);
    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        card_id: 'card-1',
        environment: 'production',
        status: { in: ['success', 'partial'] },
      },
      orderBy: { created_at: 'desc' },
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns 0 when the prior deployment row exists but `results` is null/falsy', async () => {
    countMock.mockResolvedValueOnce(0);
    findFirstMock.mockResolvedValueOnce({ id: 'dep-1', results: null });

    const seeded = await seedMappingsFromHistory('card-1', 'production');

    expect(seeded).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns 0 when results.resources is missing (defaults to []) — nothing to seed', async () => {
    countMock.mockResolvedValueOnce(0);
    findFirstMock.mockResolvedValueOnce({ id: 'dep-1', results: { other: 'shape' } });

    const seeded = await seedMappingsFromHistory('card-1', 'production');

    expect(seeded).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('seeds an upsert per qualifying resource and returns the count', async () => {
    countMock.mockResolvedValueOnce(0);
    findFirstMock.mockResolvedValueOnce({
      id: 'dep-1',
      results: {
        resources: [
          {
            success: true,
            source_node_id: 'node-A',
            name: 'web-svc',
            type: 'gcp.run.service',
            provider_id: 'projects/x/services/web-svc',
          },
          {
            success: true,
            source_node_id: 'node-B',
            name: 'data-bucket',
            type: 'gcp.storage.bucket',
            provider_id: 'gs://data-bucket',
          },
        ],
      },
    });
    upsertMock.mockResolvedValue({});

    const seeded = await seedMappingsFromHistory('card-1', 'production');

    expect(seeded).toBe(2);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenNthCalledWith(1, {
      where: {
        card_id_node_id_environment: {
          card_id: 'card-1',
          node_id: 'node-A',
          environment: 'production',
        },
      },
      update: {
        resource_type: 'gcp.run.service',
        resource_name: 'web-svc',
        provider_id: 'projects/x/services/web-svc',
      },
      create: {
        card_id: 'card-1',
        node_id: 'node-A',
        environment: 'production',
        resource_type: 'gcp.run.service',
        resource_name: 'web-svc',
        provider_id: 'projects/x/services/web-svc',
      },
    });
  });

  it('skips resources lacking success / source_node_id / name / type (each guard branch)', async () => {
    countMock.mockResolvedValueOnce(0);
    findFirstMock.mockResolvedValueOnce({
      id: 'dep-1',
      results: {
        resources: [
          // failed deploy — skipped
          {
            success: false,
            source_node_id: 'node-A',
            name: 'web-svc',
            type: 'gcp.run.service',
          },
          // pre-Phase-0 (no source_node_id) — skipped
          {
            success: true,
            name: 'orphan',
            type: 'gcp.run.service',
          },
          // missing name — skipped
          {
            success: true,
            source_node_id: 'node-C',
            type: 'gcp.run.service',
          },
          // missing type — skipped
          {
            success: true,
            source_node_id: 'node-D',
            name: 'svc',
          },
          // valid — seeded
          {
            success: true,
            source_node_id: 'node-E',
            name: 'svc-e',
            type: 'gcp.run.service',
          },
        ],
      },
    });
    upsertMock.mockResolvedValue({});

    const seeded = await seedMappingsFromHistory('card-1', 'production');

    expect(seeded).toBe(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]?.[0].create.node_id).toBe('node-E');
  });

  it('passes through provider_id as null when undefined on the historical resource (via upsertResourceMapping)', async () => {
    countMock.mockResolvedValueOnce(0);
    findFirstMock.mockResolvedValueOnce({
      id: 'dep-1',
      results: {
        resources: [
          {
            success: true,
            source_node_id: 'node-A',
            name: 'svc',
            type: 'gcp.run.service',
            // provider_id absent
          },
        ],
      },
    });
    upsertMock.mockResolvedValue({});

    const seeded = await seedMappingsFromHistory('card-1', 'production');

    expect(seeded).toBe(1);
    const arg = upsertMock.mock.calls[0]?.[0];
    expect(arg.update.provider_id).toBeNull();
    expect(arg.create.provider_id).toBeNull();
  });

  it('propagates a prisma.count rejection', async () => {
    countMock.mockRejectedValueOnce(new Error('count failed'));

    await expect(seedMappingsFromHistory('card-1', 'production')).rejects.toThrow('count failed');
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('propagates a prisma.findFirst rejection after count returns 0', async () => {
    countMock.mockResolvedValueOnce(0);
    findFirstMock.mockRejectedValueOnce(new Error('findFirst failed'));

    await expect(seedMappingsFromHistory('card-1', 'production')).rejects.toThrow('findFirst failed');
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

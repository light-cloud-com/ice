/**
 * Unit tests for `services/deploy/src/utils/project-context.ts` —
 * the DB-backed projectId/name/environment-type resolver extracted in
 * rf-deploy-4 from the deploy.service.ts orchestrator.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@ice/db';
import { resolveProjectContext } from '../project-context';

vi.mock('@ice/db', () => ({
  default: {
    canvasCard: {
      findUnique: vi.fn(),
    },
  },
}));

const findUniqueMock = prisma.canvasCard.findUnique as unknown as ReturnType<typeof vi.fn>;

describe('resolveProjectContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    findUniqueMock.mockReset();
  });

  it('returns the project triple when the card has a project and a typed environment', async () => {
    findUniqueMock.mockResolvedValueOnce({
      project: { id: 'proj-123', name: 'fullstack-webapp' },
      environment: { type: 'production', name: 'prod' },
    });

    const result = await resolveProjectContext('card-abc');

    expect(result).toEqual({
      projectId: 'proj-123',
      projectName: 'fullstack-webapp',
      environmentType: 'production',
    });
  });

  it("falls back to environmentType 'development' when the card has a project but no environment row", async () => {
    findUniqueMock.mockResolvedValueOnce({
      project: { id: 'proj-456', name: 'static-site' },
      environment: null,
    });

    const result = await resolveProjectContext('card-xyz');

    expect(result).toEqual({
      projectId: 'proj-456',
      projectName: 'static-site',
      environmentType: 'development',
    });
  });

  it('returns the cardId-derived stub when the card has no project', async () => {
    findUniqueMock.mockResolvedValueOnce({
      project: null,
      environment: { type: 'staging', name: 'stage' },
    });

    const result = await resolveProjectContext('detached-card-id-2026');

    expect(result).toEqual({
      projectId: 'detached-card-id-2026',
      projectName: 'detached-car', // first 12 chars
      environmentType: 'development',
    });
  });

  it('returns the stub when findUnique returns null (card not found)', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const result = await resolveProjectContext('missing-card-id-xyz');

    expect(result).toEqual({
      projectId: 'missing-card-id-xyz',
      projectName: 'missing-card', // first 12 chars
      environmentType: 'development',
    });
  });

  it('swallows DB errors and returns the stub when findUnique throws', async () => {
    findUniqueMock.mockRejectedValueOnce(new Error('connection refused'));

    const result = await resolveProjectContext('flaky-db-card-id');

    expect(result).toEqual({
      projectId: 'flaky-db-card-id',
      projectName: 'flaky-db-car', // first 12 chars
      environmentType: 'development',
    });
  });

  it('does not truncate projectName when cardId is shorter than 12 chars (stub path)', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const result = await resolveProjectContext('short');

    expect(result).toEqual({
      projectId: 'short',
      projectName: 'short',
      environmentType: 'development',
    });
  });
});

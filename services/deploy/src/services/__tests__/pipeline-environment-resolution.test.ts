/**
 * Unit tests for `services/deploy/src/services/pipeline/environment-resolution.ts` —
 * the Canvas Branching environment-name → card-id resolver extracted
 * from pipeline.service.ts in rf-pipe-7.
 *
 * The whole point of this helper is fault tolerance: any DB error or
 * missing row should fall back to the original cardId so the deploy
 * still happens. The four it-blocks pin this contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    canvasCard: { findUnique: vi.fn() },
    environment: { findFirst: vi.fn() },
  },
}));

import prisma from '@ice/db';
import { resolveEnvironmentCardId } from '../pipeline/environment-resolution';

const cardFindUnique = (prisma as any).canvasCard.findUnique as ReturnType<typeof vi.fn>;
const envFindFirst = (prisma as any).environment.findFirst as ReturnType<typeof vi.fn>;

beforeEach(() => {
  cardFindUnique.mockReset();
  envFindFirst.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveEnvironmentCardId', () => {
  it('falls back to the rule cardId when the rule card is not found', async () => {
    cardFindUnique.mockResolvedValue(null);
    const result = await resolveEnvironmentCardId('rule-card', 'production');
    expect(result).toBe('rule-card');
    expect(envFindFirst).not.toHaveBeenCalled();
  });

  it('falls back to the rule cardId when no environment matches by name', async () => {
    cardFindUnique.mockResolvedValue({ project_id: 'p1' });
    envFindFirst.mockResolvedValue(null);
    const result = await resolveEnvironmentCardId('rule-card', 'production');
    expect(result).toBe('rule-card');
    expect(envFindFirst).toHaveBeenCalledWith({
      where: { project_id: 'p1', name: 'production' },
      select: { card_id: true },
    });
  });

  it("returns the environment's card_id when the named environment exists in the same project", async () => {
    cardFindUnique.mockResolvedValue({ project_id: 'p1' });
    envFindFirst.mockResolvedValue({ card_id: 'env-card' });
    const result = await resolveEnvironmentCardId('rule-card', 'staging');
    expect(result).toBe('env-card');
  });

  it('falls back on any DB error (try/catch envelope)', async () => {
    cardFindUnique.mockRejectedValue(new Error('connection refused'));
    const result = await resolveEnvironmentCardId('rule-card', 'production');
    expect(result).toBe('rule-card');
  });
});

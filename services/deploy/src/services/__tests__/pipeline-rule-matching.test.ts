/**
 * Unit tests for `services/deploy/src/services/pipeline/rule-matching.ts` —
 * the webhook → rule matchers and the duplicate-failure suppressor
 * extracted from pipeline.service.ts in rf-pipe-4.
 *
 * The `branchMatches` helper is module-private; we exercise its three
 * pattern forms (`*`, `prefix/*`, exact) indirectly through the
 * `matchRulesForPush` / `matchRulesForMerge` filter step. The tests
 * register multiple rules in the Prisma mock and assert which ones
 * survive the in-memory filter.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    deploymentRule: {
      findMany: vi.fn(),
    },
    deploymentEvent: {
      findFirst: vi.fn(),
    },
  },
}));

import prisma from '@ice/db';
import { matchRulesForPush, matchRulesForMerge, shouldSkipDuplicate } from '../pipeline/rule-matching';

const ruleFindMany = (prisma as any).deploymentRule.findMany as ReturnType<typeof vi.fn>;
const eventFindFirst = (prisma as any).deploymentEvent.findFirst as ReturnType<typeof vi.fn>;

beforeEach(() => {
  ruleFindMany.mockReset();
  eventFindFirst.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('matchRulesForPush', () => {
  it('queries enabled push rules for the repository', async () => {
    ruleFindMany.mockResolvedValue([]);
    await matchRulesForPush('owner/repo', 'main', 'sha');
    expect(ruleFindMany).toHaveBeenCalledWith({
      where: {
        repository: 'owner/repo',
        enabled: true,
        trigger_type: 'push',
      },
    });
  });

  it('keeps rules whose branch_pattern is "*" (wildcard) regardless of branch', async () => {
    ruleFindMany.mockResolvedValue([
      { id: 'r1', branch_pattern: '*' },
      { id: 'r2', branch_pattern: 'main' },
    ]);
    const matched = await matchRulesForPush('o/r', 'feature/x', 'sha');
    expect(matched.map((r) => r.id)).toEqual(['r1']);
  });

  it('keeps rules whose branch_pattern is an exact match', async () => {
    ruleFindMany.mockResolvedValue([
      { id: 'main-rule', branch_pattern: 'main' },
      { id: 'develop-rule', branch_pattern: 'develop' },
    ]);
    const matched = await matchRulesForPush('o/r', 'develop', 'sha');
    expect(matched.map((r) => r.id)).toEqual(['develop-rule']);
  });

  it('keeps rules whose branch_pattern is a prefix glob ("feature/*")', async () => {
    ruleFindMany.mockResolvedValue([
      { id: 'feat', branch_pattern: 'feature/*' },
      { id: 'main', branch_pattern: 'main' },
      { id: 'release', branch_pattern: 'release/*' },
    ]);
    const matched = await matchRulesForPush('o/r', 'feature/login', 'sha');
    expect(matched.map((r) => r.id)).toEqual(['feat']);
  });

  it('returns an empty array when no rule pattern matches the branch', async () => {
    ruleFindMany.mockResolvedValue([
      { id: 'r1', branch_pattern: 'main' },
      { id: 'r2', branch_pattern: 'release/*' },
    ]);
    const matched = await matchRulesForPush('o/r', 'develop', 'sha');
    expect(matched).toEqual([]);
  });

  it('does not partial-match — "feature" without trailing slash is not a feature/* match', async () => {
    ruleFindMany.mockResolvedValue([{ id: 'r', branch_pattern: 'feature/*' }]);
    const matched = await matchRulesForPush('o/r', 'feature', 'sha');
    // pattern.slice(0, -1) = "feature/" — does not match "feature".
    expect(matched).toEqual([]);
  });
});

describe('matchRulesForMerge', () => {
  it('queries enabled merge rules and applies the same branch matcher', async () => {
    ruleFindMany.mockResolvedValue([
      { id: 'r1', branch_pattern: 'main' },
      { id: 'r2', branch_pattern: 'staging' },
    ]);
    const matched = await matchRulesForMerge('o/r', 'main');
    expect(ruleFindMany).toHaveBeenCalledWith({
      where: {
        repository: 'o/r',
        enabled: true,
        trigger_type: 'merge',
      },
    });
    expect(matched.map((r) => r.id)).toEqual(['r1']);
  });
});

describe('shouldSkipDuplicate', () => {
  it('returns false when there is no prior event', async () => {
    eventFindFirst.mockResolvedValue(null);
    const skip = await shouldSkipDuplicate('rule-1', 'sha-abc');
    expect(skip).toBe(false);
  });

  it('returns false when the prior event was for a different commit', async () => {
    eventFindFirst.mockResolvedValue({ commit_sha: 'sha-other', status: 'failed' });
    expect(await shouldSkipDuplicate('rule-1', 'sha-abc')).toBe(false);
  });

  it('returns false when the prior event for the same commit succeeded', async () => {
    eventFindFirst.mockResolvedValue({ commit_sha: 'sha-abc', status: 'success' });
    expect(await shouldSkipDuplicate('rule-1', 'sha-abc')).toBe(false);
  });

  it('returns true when the prior event for the same commit failed (loop guard)', async () => {
    eventFindFirst.mockResolvedValue({ commit_sha: 'sha-abc', status: 'failed' });
    expect(await shouldSkipDuplicate('rule-1', 'sha-abc')).toBe(true);
  });

  it('orders by started_at desc to find the most recent event', async () => {
    eventFindFirst.mockResolvedValue(null);
    await shouldSkipDuplicate('rule-1', 'sha');
    expect(eventFindFirst).toHaveBeenCalledWith({
      where: { rule_id: 'rule-1' },
      orderBy: { started_at: 'desc' },
    });
  });
});

/**
 * Webhook → rule matchers + the duplicate-failure suppressor.
 *
 * Extracted from `pipeline.service.ts` (rf-pipe-4). When a GitHub
 * webhook arrives, the route handler asks this module which rules to
 * fire. The matchers query the DB by repository + trigger type, then
 * filter in-memory using `branchMatches` so the SQL stays simple
 * (Prisma can't express our glob-ish patterns natively).
 *
 * `shouldSkipDuplicate` exists to break infinite-retry loops when a
 * push event keeps firing for a commit that's failed before — the
 * webhook handler short-circuits without queueing a new event.
 */

import prisma from '@ice/db';

export async function matchRulesForPush(repository: string, branch: string, _commitSha: string) {
  const rules = await prisma.deploymentRule.findMany({
    where: {
      repository,
      enabled: true,
      trigger_type: 'push',
    },
  });

  return rules.filter((rule) => branchMatches(branch, rule.branch_pattern));
}

export async function matchRulesForMerge(repository: string, targetBranch: string) {
  const rules = await prisma.deploymentRule.findMany({
    where: {
      repository,
      enabled: true,
      trigger_type: 'merge',
    },
  });

  return rules.filter((rule) => branchMatches(targetBranch, rule.branch_pattern));
}

/**
 * Check if the last deployment for this rule had the same commit SHA and failed.
 * If so, skip to prevent infinite retry loops (same as platform pattern).
 */
export async function shouldSkipDuplicate(ruleId: string, commitSha: string): Promise<boolean> {
  const lastEvent = await prisma.deploymentEvent.findFirst({
    where: { rule_id: ruleId },
    orderBy: { started_at: 'desc' },
  });

  return !!(lastEvent && lastEvent.commit_sha === commitSha && lastEvent.status === 'failed');
}

/**
 * Match a concrete branch (e.g. "feature/login") against a stored
 * pattern. Three forms are supported:
 *   - "*"           → matches every branch
 *   - "feature/*"   → prefix glob; matches every branch under feature/
 *   - "main"        → exact match
 *
 * Module-private. The matchers above are the only callers.
 */
function branchMatches(branch: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1); // "feature/"
    return branch.startsWith(prefix);
  }
  return branch === pattern;
}

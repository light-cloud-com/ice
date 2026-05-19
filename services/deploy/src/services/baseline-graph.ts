/**
 * Baseline-graph helper extracted from `deploy.service.ts` in rf-deploy-10.
 *
 * Both the apply path and the rollback path build a "current"-state
 * `MutableGraph` from a previous deployment's persisted resources, then hand
 * it to `deploy_graph(desired, current, …)` so the engine can compute a
 * create/update/skip/delete diff. Without this baseline every deploy
 * degenerates to "create all" (or, on rollback, would re-create resources
 * that already exist).
 *
 * The two callers differ in exactly one place — which deployment statuses
 * qualify as a baseline source:
 *
 *   - **Apply** (`status: { in: ['success', 'partial'] }`) — partial
 *     deploys land real resources that the next plan must respect; ignoring
 *     them would re-create what's already there and risk duplicates.
 *   - **Rollback** (`status: 'success'`) — rolling forward to a partial
 *     state would compound the failure, so only fully-successful
 *     deployments qualify.
 *
 * Both paths exclude the in-flight row via `id: { not: excludeDeploymentId }`.
 * The row inserted before this query has `status='deploying'` but a retry
 * or concurrent read could see it flipped to `'partial'` first; without
 * the exclude it would pick itself up as the baseline and the next plan
 * would re-create the resources it hadn't yet finished.
 *
 * The cross-environment `environment` filter prevents a dev deploy from
 * influencing a prod diff (or vice-versa).
 *
 * The dynamic `import('@ice/core/graph')` matches the apply-path's
 * pre-extraction pattern; the rollback path used to construct
 * `MutableGraph` from a `core` destructure earlier in the function — both
 * shapes resolve at runtime via the pnpm workspace.
 */

import prisma from '@ice/db';

export interface BuildBaselineGraphArgs {
  cardId: string;
  environment: string;
  excludeDeploymentId: string;
  /**
   * Apply uses `['success', 'partial']`; rollback uses `['success']`. Pass
   * the literal set per the calling path — the helper does not assume.
   */
  statusFilter: string[];
}

export interface BuildBaselineGraphResult {
  currentGraph: any;
  /**
   * Count of `res.success === true` rows on the matching deployment's
   * `results.resources`, matching the apply path's pre-extraction emitLog
   * number. Note: this is the success-only count, NOT the count of nodes
   * actually added — a few may have lacked `resource_id` and been skipped.
   * The original log line counted successes regardless, so the helper
   * returns that number for caller compatibility.
   */
  foundCount: number;
  /**
   * True when the matching deployment had a non-null `results` field. The
   * apply path logs whenever `lastDeploy?.results` was truthy (even with
   * zero successful resources); the gate is exposed as a boolean so the
   * caller can preserve that exact behavior.
   */
  hasResults: boolean;
}

export async function buildBaselineGraph(
  args: BuildBaselineGraphArgs,
): Promise<BuildBaselineGraphResult> {
  const { cardId, environment, excludeDeploymentId, statusFilter } = args;

  // @ts-ignore — resolved at runtime via pnpm workspace
  const { MutableGraph } = await import('@ice/core/graph');
  const currentGraph = new MutableGraph('current');

  const lastDeploy = await prisma.canvasDeployment.findFirst({
    where: {
      card_id: cardId,
      environment,
      status: { in: statusFilter },
      id: { not: excludeDeploymentId },
    },
    orderBy: { created_at: 'desc' },
  });

  if (!lastDeploy?.results) {
    return { currentGraph, foundCount: 0, hasResults: false };
  }

  const prevResults = lastDeploy.results as any;
  const prevResources = prevResults.resources || [];
  for (const res of prevResources) {
    if (res.success && res.resource_id) {
      try {
        currentGraph.add_node({
          name: res.name,
          type: res.type,
          properties: {
            ...res.outputs,
            provider_id: res.provider_id,
          },
        });
      } catch {
        // Ignore duplicate or invalid nodes
      }
    }
  }

  const foundCount = prevResources.filter((r: any) => r.success).length;
  return { currentGraph, foundCount, hasResults: true };
}

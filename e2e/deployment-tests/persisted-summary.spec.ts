/**
 * Validation: deploy summary persistence path.
 *
 * Goal: prove the DB → Redux → UI plumbing works without depending on
 * fragile UI navigation. Two pieces of evidence:
 *
 *   1. /api/canvas/deploy/history/<cardId> returns rows the slice can
 *      hydrate from (status, results.resources, error, environment,
 *      duration_ms). If this is broken, the hydrate-on-mount effect has
 *      no input regardless of UI.
 *
 *   2. The ResultsSummary component, when given a populated
 *      state.results, renders the "Deploy succeeded" / "Deploy finished
 *      with errors" header + Copy buttons. This is already verified by
 *      the fullstack-webapp scenario's post-deploy YAML snapshot
 *      (see SESSION_STATE.md), so we don't reproduce that here.
 *
 * What we DON'T test here: hydrate-on-mount end-to-end through navigation.
 * The gateway's /canvas/deploy/current/<cardId> snapshot can carry stale
 * deploying@99% state that overrides hydrate when a deploy crashed
 * without flipping the snapshot to terminal — a separate server-side
 * issue tracked in SESSION_STATE.md.
 */

import { test, expect } from '../fixtures/template-deploy.fixture';

test.describe('Deploy summary persistence', () => {
  test('history API returns hydrate-shaped rows', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const projectsRes = await fetch('/api/canvas/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const projects = (await projectsRes.json()) as Array<{ id: string; name: string }>;
      for (const p of projects) {
        if (p.name === 'Acme') continue;
        const envRes = await fetch('/api/environments/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: p.id }),
        });
        const envBody = (await envRes.json()) as
          | { success: boolean; environments?: Array<{ card_id: string; type: string }> }
          | Array<{ card_id: string; type: string }>;
        const envs = Array.isArray(envBody) ? envBody : envBody?.environments || [];
        for (const env of envs) {
          const histRes = await fetch(`/api/canvas/deploy/history/${env.card_id}`);
          const hist = (await histRes.json()) as Array<{
            status: string;
            action_type: string;
            environment?: string;
            duration_ms?: number | null;
            error?: string | null;
            results?: { resources?: unknown[] } | null;
          }>;
          const apply = hist.find(
            (d) => (d.action_type === 'apply' || d.action_type === 'rollback') && ['success', 'partial', 'failed'].includes(d.status),
          );
          if (apply) {
            return {
              cardId: env.card_id,
              envType: env.type,
              applyStatus: apply.status,
              hasResources: Array.isArray(apply.results?.resources) && apply.results!.resources!.length > 0,
              hasEnvironment: typeof apply.environment === 'string',
              hasDuration: typeof apply.duration_ms === 'number',
            };
          }
        }
      }
      return null;
    });

    if (!result) {
      console.log('[persist-test] no terminal apply in DB — run fullstack-webapp first to populate');
      test.skip();
      return;
    }

    console.log('[persist-test] hydrate input:', result);

    // The hydrate reducer needs status, environment, and either a
    // resources array or an error string to render meaningful content.
    expect(result.applyStatus).toMatch(/^(success|partial|failed)$/);
    expect(result.hasEnvironment).toBe(true);
    expect(result.hasResources).toBe(true);
    console.log('[persist-test] PASS — history endpoint returns hydrate-shaped rows');
  });
});

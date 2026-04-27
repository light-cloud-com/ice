/**
 * UI validation: deploy summary actually renders after reload.
 *
 * Companion to persisted-summary.spec.ts (which only validates the API
 * shape). This spec exercises the full DB → Redux → UI path:
 *
 *   1. Find a project + card with terminal apply history (via API).
 *   2. Navigate to that project's canvas in the browser.
 *   3. Open the deploy panel.
 *   4. Assert #ice-deploy-results is visible (summary header + per-resource
 *      list rendered from the hydrated state).
 *   5. Capture the [deploy-panel] hydrate console logs as evidence the
 *      effect actually ran.
 *
 * If the dev DB has no terminal apply for any project, the test skips —
 * run a deployment scenario first to populate.
 */
import { test, expect } from '../fixtures/template-deploy.fixture';
test.describe('Deploy summary UI hydration', () => {
    test('panel shows hydrated results after reload', async ({ authenticatedPage: page }) => {
        // ─── Step 1: discover a card with terminal history ─────────────────
        const target = await page.evaluate(async () => {
            const projectsRes = await fetch('/api/canvas/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const projects = (await projectsRes.json());
            for (const p of projects) {
                if (p.name === 'Acme')
                    continue;
                const envs = p.environments || [];
                for (const env of envs) {
                    const histRes = await fetch(`/api/canvas/deploy/history/${env.card_id}`);
                    const hist = (await histRes.json());
                    const apply = hist.find((d) => (d.action_type === 'apply' || d.action_type === 'rollback') &&
                        ['success', 'partial', 'failed', 'cancelled'].includes(d.status));
                    if (apply && Array.isArray(apply.results?.resources) && apply.results.resources.length > 0) {
                        return {
                            projectSlug: p.slug,
                            projectId: p.id,
                            cardId: env.card_id,
                            envType: env.type,
                            applyStatus: apply.status,
                            resourceCount: apply.results.resources.length,
                        };
                    }
                }
            }
            return null;
        });
        if (!target) {
            console.log('[ui-persist-test] no terminal apply in DB — run a scenario first');
            test.skip();
            return;
        }
        console.log('[ui-persist-test] target:', target);
        // ─── Step 2: capture console logs and navigate to canvas ───────────
        const consoleLines = [];
        page.on('console', (msg) => {
            const text = msg.text();
            if (text.includes('[deploy-panel]') || text.includes('[deploy-subscription]')) {
                consoleLines.push(`${msg.type()}: ${text}`);
            }
        });
        await page.goto(`/${target.projectSlug}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000); // let card load + subscription hooks fire
        // ─── Step 3: open the deploy panel ─────────────────────────────────
        // The right-strip "Deploy" button is rendered by SidebarStrip with
        // `title={tab.label}` — so we locate by title text. The label comes
        // from i18n key `deploy.title` ("Infrastructure Deploy" in English).
        const deployBtn = page.locator('button[title="Infrastructure Deploy"]').first();
        await expect(deployBtn).toBeVisible({ timeout: 10000 });
        await deployBtn.click();
        await page.waitForTimeout(2500); // let hydrate fetch + dispatch complete
        // ─── Step 4: assert results panel is visible ───────────────────────
        const results = page.locator('#ice-deploy-results');
        await expect(results).toBeVisible({ timeout: 10000 });
        // The summary contains either "Deploy succeeded" or "Deploy finished
        // with errors" depending on the apply status. Grep for both.
        const summaryText = await results.textContent();
        console.log('[ui-persist-test] summary text:', summaryText?.slice(0, 200));
        expect(summaryText).toMatch(/Deploy succeeded|Deploy finished with errors/);
        // ─── Step 5: confirm hydrate console log fired ─────────────────────
        console.log('[ui-persist-test] captured logs:');
        for (const line of consoleLines)
            console.log('  ', line);
        const hydrateFired = consoleLines.some((l) => l.includes('[deploy-panel] hydrate fetch'));
        const hydrateDispatched = consoleLines.some((l) => l.includes('[deploy-panel] hydrate dispatch'));
        expect(hydrateFired, 'hydrate fetch effect did not run').toBe(true);
        expect(hydrateDispatched, 'hydrate did not dispatch — DB row missing or filtered').toBe(true);
        console.log('[ui-persist-test] PASS — DB → Redux → UI summary rendered');
    });
});

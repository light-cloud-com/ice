/**
 * setup phase — make sure GCP + GitHub are connected and the user lands on
 * a fresh canvas.
 *
 * Reuses `selectTemplate` from template-deploy fixture for the "empty"
 * starting point. If a non-default `baseTemplate` is set on the scenario,
 * uses that template name as-is.
 */
import { readFileSync } from 'fs';
const SA_KEY_PATH = process.env.ICE_TEST_SA_KEY_PATH || '';
const GITHUB_TOKEN = process.env.ICE_TEST_GITHUB_TOKEN || '';
export async function runSetup(ctx) {
    const { fixture, logger, scenario } = ctx;
    try {
        // Connect GCP
        if (!SA_KEY_PATH) {
            return { status: 'fail', error: 'ICE_TEST_SA_KEY_PATH env var required' };
        }
        logger.note('Connecting GCP via UI');
        const saKeyJson = readFileSync(SA_KEY_PATH, 'utf-8');
        await fixture.connectGCPViaUI(saKeyJson);
        // Connect GitHub (optional but expected for repo-based scenarios)
        if (GITHUB_TOKEN) {
            logger.note('Connecting GitHub via UI');
            await fixture.connectGitHubViaUI(GITHUB_TOKEN);
        }
        else {
            logger.note('ICE_TEST_GITHUB_TOKEN not set; skipping GitHub connect', 'warn');
        }
        // Land on a canvas. scenario.baseTemplate is the user-facing template
        // name as shown on /templates (e.g. "Static Site", "Full-Stack Web App").
        // There is no "Empty"/blank template in /templates today; scenarios that
        // need extra blocks should add them in the design phase on top of
        // whatever the chosen template provides.
        logger.note(`Selecting template "${scenario.baseTemplate}"`);
        await fixture.selectTemplate(scenario.baseTemplate);
        // Wait for at least one resource node with both data-node-id AND
        // data-ice-type to appear on the canvas. Templates can take a few
        // seconds to expand and stamp ice-types on freshly-mounted nodes.
        try {
            await ctx.page.waitForFunction(() => {
                const els = Array.from(document.querySelectorAll('[data-node-id]'));
                return els.some((el) => !!el.getAttribute('data-ice-type'));
            }, undefined, { timeout: 20_000 });
        }
        catch {
            logger.note('No iceType-tagged nodes appeared within 20s — template may have only groups', 'warn');
        }
        // Snapshot existing nodes so design phase can detect new additions.
        const existing = await ctx.canvas.getNodes();
        logger.note(`Canvas loaded with ${existing.length} preset node(s) from template`);
        return { status: 'pass' };
    }
    catch (err) {
        return { status: 'fail', error: stringErr(err) };
    }
}
function stringErr(err) {
    if (err instanceof Error)
        return err.message;
    try {
        return JSON.stringify(err);
    }
    catch {
        return String(err);
    }
}

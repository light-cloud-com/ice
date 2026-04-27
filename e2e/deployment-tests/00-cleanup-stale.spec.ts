/**
 * Pre-test cleanup — wipes leftover projects from previous test runs so
 * each round of `pnpm test:scenarios` starts from a clean slate.
 *
 * Runs first because of the leading `00-` prefix (Playwright executes
 * spec files in alphabetical order within a project). Naming change here
 * affects ordering — keep the prefix.
 *
 * For every project that's not the org folder ("Acme"):
 *   1. Open canvas, click destroy → destroy-everything → confirm.
 *      Any orphaned GCP resources still tagged ICE get removed too.
 *   2. Delete the project DB row via the canvas API.
 *
 * Both steps are best-effort: if either fails, log and continue. We don't
 * want a flaky cleanup to block the actual scenario tests from running.
 */

import { test, expect } from '../fixtures/template-deploy.fixture';

const ORG_FOLDER_NAME = 'Acme';

test.describe('Pre-test cleanup', () => {
  test.skip(!process.env.ICE_TEST_GCP_PROJECT, 'ICE_TEST_GCP_PROJECT env var required');
  test.skip(!process.env.ICE_TEST_SA_KEY_PATH, 'ICE_TEST_SA_KEY_PATH env var required');
  test.setTimeout(30 * 60_000);

  test('destroy + delete every stale project', async ({ page, templateDeploy }) => {
    // Connect creds (idempotent — closes the modal if already connected)
    const { readFileSync } = await import('fs');
    if (process.env.ICE_TEST_SA_KEY_PATH) {
      try {
        await templateDeploy.connectGCPViaUI(readFileSync(process.env.ICE_TEST_SA_KEY_PATH, 'utf-8'));
      } catch {
        /* ignore */
      }
    }

    // 1. Enumerate stale projects via API (faster than walking the sidebar
    // and avoids any rendering / ordering surprises).
    const projects = await listProjects(page);
    const stale = projects.filter((p) => p.name !== ORG_FOLDER_NAME);
    console.log(`[cleanup-stale] found ${projects.length} project(s); ${stale.length} stale to clean`);

    if (stale.length === 0) {
      console.log('[cleanup-stale] nothing to do');
      return;
    }

    // 2. Per-project: destroy resources via UI, then delete DB row.
    let destroyed = 0;
    let destroySkipped = 0;
    let deleted = 0;
    let deleteFailed = 0;

    for (const proj of stale) {
      console.log(`[cleanup-stale] → "${proj.name}" (${proj.id})`);

      // 2a. Destroy via UI (best-effort)
      const ok = await destroyViaUI(page, templateDeploy, proj);
      if (ok) destroyed++;
      else destroySkipped++;

      // 2b. Delete DB row via API (independent of destroy success — even
      // if there were no resources, we still want the row gone).
      const delOk = await deleteProjectViaApi(page, proj.id);
      if (delOk) deleted++;
      else deleteFailed++;

      // Small breath between projects so the panel/modal animations settle.
      await page.waitForTimeout(300);
    }

    console.log(
      `[cleanup-stale] done — destroyed=${destroyed} skipped=${destroySkipped} deleted=${deleted} delete-failed=${deleteFailed}`,
    );
    // Always pass: cleanup is best-effort, scenarios shouldn't block on it.
    expect(true).toBe(true);
  });
});

interface ProjectRow {
  id: string;
  name: string;
}

async function listProjects(page: import('@playwright/test').Page): Promise<ProjectRow[]> {
  return page.evaluate(async () => {
    const res = await fetch('/api/canvas/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = (await res.json()) as Array<{ id: string; name: string }>;
    return Array.isArray(data) ? data.map((p) => ({ id: p.id, name: p.name })) : [];
  });
}

async function destroyViaUI(
  page: import('@playwright/test').Page,
  templateDeploy: import('../fixtures/template-deploy.fixture').TemplateDeployHelper,
  proj: ProjectRow,
): Promise<boolean> {
  // Navigate via row click in the /local browser. Using the project list's
  // outer button (anchored on its inner aria-label="More options"
  // sub-button) — same pattern as the destroy-all / delete-projects specs
  // already use successfully.
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const row = page
    .locator('button:has(button[aria-label="More options"])', { hasText: proj.name })
    .first();
  if (!(await row.isVisible({ timeout: 3_000 }).catch(() => false))) {
    console.log(`[cleanup-stale]   "${proj.name}" row not visible, skipping destroy`);
    return false;
  }
  await row.click({ force: true });
  await page.waitForTimeout(800);

  // No canvas → nothing to destroy
  const onCanvas = await page
    .locator('#ice-canvas-svg, [data-testid="svg-canvas"]')
    .isVisible()
    .catch(() => false);
  if (!onCanvas) return false;

  try {
    await templateDeploy.openDeployPanel();
  } catch {
    return false;
  }
  try {
    await templateDeploy.configureDeploy(
      process.env.ICE_TEST_GCP_PROJECT || '',
      process.env.ICE_TEST_GCP_REGION || 'us-central1',
    );
  } catch {
    /* tolerate already-configured */
  }

  const destroyBtn = page.locator('#ice-deploy-btn-destroy');
  if (!(await destroyBtn.isVisible({ timeout: 2_000 }).catch(() => false))) {
    await templateDeploy.closeDeployPanel();
    return false; // nothing deployed
  }
  await destroyBtn.click();

  const confirmLabel = page.locator('label').filter({ hasText: /Type .+ to confirm/i }).first();
  try {
    await confirmLabel.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    await templateDeploy.closeDeployPanel();
    return false;
  }
  const labelText = (await confirmLabel.textContent()) || '';
  const cardName = labelText.match(/Type\s+(.+?)\s+to confirm/i)?.[1]?.trim() || '';
  if (!cardName) {
    await page.keyboard.press('Escape');
    return false;
  }
  // Always destroy-everything for cleanup — handles both fresh and
  // already-destroyed cards (the API rejects the basic destroy on
  // already-destroyed cards with 400).
  const everythingCheckbox = page.locator('input[type="checkbox"]').first();
  try {
    if (!(await everythingCheckbox.isChecked())) await everythingCheckbox.check({ force: true });
  } catch {
    /* tolerate checkbox issues; the basic-destroy may still work for
       fresh projects */
  }
  const confirmInput = confirmLabel.locator('xpath=..').locator('input[type="text"]').first();
  await confirmInput.fill(cardName);
  const confirmBtn = page
    .locator(
      'button:has-text("Destroy"):not(#ice-deploy-btn-destroy), button:has-text("Destroy everything"):not(#ice-deploy-btn-destroy)',
    )
    .last();
  await confirmBtn.click();

  // Wait for the destroy API to land in the action log
  const ok = await page
    .waitForFunction(
      () => {
        const log = (window as { __ICE_ACTION_LOG__?: Array<Record<string, unknown>> }).__ICE_ACTION_LOG__ || [];
        return log.some(
          (e) =>
            typeof e.target === 'string' &&
            e.target.includes('/canvas/deploy/destroy') &&
            (e.action === 'api_response' || e.action === 'api_error'),
        );
      },
      {},
      { timeout: 300_000 },
    )
    .then(() => true)
    .catch(() => false);

  // Reset action log so the next iteration's poll sees a fresh stream
  await page.evaluate(() => {
    const w = window as { __ICE_ACTION_LOG__?: unknown[] };
    w.__ICE_ACTION_LOG__ = [];
  });
  await templateDeploy.closeDeployPanel().catch(() => undefined);
  return ok;
}

async function deleteProjectViaApi(page: import('@playwright/test').Page, projectId: string): Promise<boolean> {
  return page.evaluate(async (id: string) => {
    try {
      const res = await fetch('/api/canvas/projects/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, projectId);
}

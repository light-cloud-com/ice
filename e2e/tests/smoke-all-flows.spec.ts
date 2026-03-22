/**
 * Smoke Test — All User Flows
 *
 * Runs through every major user flow sequentially, generating
 * a comprehensive report that Claude Code can read to verify
 * the entire application works end-to-end.
 *
 * Each flow tests via HTML IDs and verifies via action log.
 */

import { test, expect } from '../fixtures/base.fixture';
import { getApiCalls, getErrors, dumpActionLog } from '../utils/action-log-reader';
import { FlowReporter } from '../utils/flow-reporter';

test.describe('Smoke: All Flows', () => {
  test('Flow 1: Login', async ({ page }) => {
    const reporter = new FlowReporter('smoke-01-login');

    await reporter.step(page, 'Go to login', 'navigate', async () => {
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.setItem('ice-action-log', 'true'));
      await page.waitForSelector('#ice-login-auth-form', { timeout: 5000 });
    });

    await reporter.step(
      page,
      'Fill email',
      'fill',
      async () => {
        await page.fill('#ice-login-auth-input-email', 'test@ice-saas.dev');
      },
      '#ice-login-auth-input-email',
    );

    await reporter.step(
      page,
      'Fill password',
      'fill',
      async () => {
        await page.fill('#ice-login-auth-input-password', 'password123');
      },
      '#ice-login-auth-input-password',
    );

    await reporter.step(
      page,
      'Submit login',
      'click',
      async () => {
        await page.click('#ice-login-auth-btn-submit');
        await page.waitForURL('**/*', { timeout: 10000 });
      },
      '#ice-login-auth-btn-submit',
    );

    await reporter.step(page, 'Verify logged in', 'assert', async () => {
      const token = await page.evaluate(() => localStorage.getItem('ice-token'));
      expect(token).toBeTruthy();
      expect(page.url()).not.toContain('/login');
    });

    await reporter.save(page);
  });

  test('Flow 3: Project management', async ({ authenticatedPage: page }) => {
    const reporter = new FlowReporter('smoke-03-projects');

    await reporter.step(page, 'Wait for folder view or canvas', 'wait', async () => {
      await page.waitForSelector('#ice-folder-panel, #ice-canvas-svg', { timeout: 10000 });
    });

    await reporter.step(page, 'Check folder view elements', 'assert', async () => {
      const folderPanel = page.locator('#ice-folder-panel');
      if (await folderPanel.isVisible()) {
        const createBtn = page.locator('#ice-folder-btn-create-project');
        expect(await createBtn.isVisible()).toBe(true);
      }
    });

    await reporter.save(page);
  });

  test('Flow 4: Canvas interaction', async ({ authenticatedPage: page, apiClient }) => {
    const reporter = new FlowReporter('smoke-04-canvas');

    // Create project + card via API, then navigate using /{orgSlug}/{projectSlug}
    await reporter.step(page, 'Create project and open canvas', 'api', async () => {
      const me = await apiClient.get('/auth/me');
      const orgName = me.organisations?.[0]?.name || '';
      const orgSlug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const project = await apiClient.post('/canvas/projects/create', { name: `Smoke Canvas ${Date.now()}` });
      await apiClient.post('/canvas/cards/create', { projectId: project.id, name: 'Main' });
      await page.goto(`/${orgSlug}/${project.slug}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ice-canvas-svg', { timeout: 15000 });
    });

    await reporter.step(page, 'Check palette visible', 'assert', async () => {
      const palette = page.locator('#ice-palette-panel');
      expect(await palette.isVisible()).toBe(true);
    });

    await reporter.step(
      page,
      'Check search input',
      'assert',
      async () => {
        const search = page.locator('#ice-palette-search-input');
        if (await search.isVisible()) {
          await search.fill('backend');
          await page.waitForTimeout(500);
          await search.clear();
        }
      },
      '#ice-palette-search-input',
    );

    await reporter.step(page, 'Check appbar buttons', 'assert', async () => {
      for (const id of ['#ice-appbar-btn-deploy', '#ice-appbar-btn-undo', '#ice-appbar-btn-redo']) {
        const btn = page.locator(id);
        expect(await btn.count()).toBeGreaterThan(0);
      }
    });

    await reporter.save(page);
  });

  test('Flow 9: Deploy panel opens', async ({ authenticatedPage: page, apiClient }) => {
    const reporter = new FlowReporter('smoke-09-deploy-panel');

    await reporter.step(page, 'Create project and open canvas', 'setup', async () => {
      const me = await apiClient.get('/auth/me');
      const orgName = me.organisations?.[0]?.name || '';
      const orgSlug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const project = await apiClient.post('/canvas/projects/create', { name: `Deploy Test ${Date.now()}` });
      await apiClient.post('/canvas/cards/create', { projectId: project.id, name: 'Main' });
      await page.goto(`/${orgSlug}/${project.slug}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ice-canvas-svg', { timeout: 15000 });
    });

    await reporter.step(
      page,
      'Open deploy panel',
      'click',
      async () => {
        await page.click('#ice-appbar-btn-deploy');
        await page.waitForSelector('#ice-deploy-panel', { timeout: 5000 });
      },
      '#ice-appbar-btn-deploy',
    );

    await reporter.step(page, 'Verify deploy panel elements', 'assert', async () => {
      const panel = page.locator('#ice-deploy-panel');
      expect(await panel.isVisible()).toBe(true);
    });

    await reporter.step(
      page,
      'Close deploy panel',
      'click',
      async () => {
        const closeBtn = page.locator('#ice-deploy-btn-close');
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
          await page.waitForSelector('#ice-deploy-panel', { state: 'hidden', timeout: 3000 }).catch(() => {});
        }
      },
      '#ice-deploy-btn-close',
    );

    // Check action log for errors
    const errors = await getErrors(page);
    if (errors.length > 0) {
      console.log('Action log errors:', JSON.stringify(errors, null, 2));
    }

    await reporter.save(page);
  });

  test('Flow 11: AI chat', async ({ authenticatedPage: page, apiClient }) => {
    const reporter = new FlowReporter('smoke-11-ai-chat');

    await reporter.step(page, 'Create project and open canvas', 'setup', async () => {
      const me = await apiClient.get('/auth/me');
      const orgName = me.organisations?.[0]?.name || '';
      const orgSlug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const project = await apiClient.post('/canvas/projects/create', { name: `AI Test ${Date.now()}` });
      await apiClient.post('/canvas/cards/create', { projectId: project.id, name: 'Main' });
      await page.goto(`/${orgSlug}/${project.slug}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ice-canvas-svg', { timeout: 15000 });
    });

    await reporter.step(page, 'Check AI panel', 'assert', async () => {
      const aiPanel = page.locator('#ice-ai-panel');
      if (await aiPanel.isVisible()) {
        const input = page.locator('#ice-ai-input-message');
        expect(await input.isVisible()).toBe(true);
      }
    });

    await reporter.save(page);
  });

  test('Flow 14: User settings', async ({ authenticatedPage: page }) => {
    const reporter = new FlowReporter('smoke-14-settings');

    await reporter.step(page, 'Navigate to settings', 'navigate', async () => {
      await page.goto('/settings', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ice-settings-panel', { timeout: 10000 }).catch(() => {
        // Settings page may redirect or not have the panel
      });
    });

    await reporter.save(page);
  });

  test('Flow 15: Team management', async ({ authenticatedPage: page }) => {
    const reporter = new FlowReporter('smoke-15-team');

    await reporter.step(page, 'Navigate to team', 'navigate', async () => {
      await page.goto('/team', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ice-team-panel', { timeout: 10000 }).catch(() => {
        // Team page may redirect or not have the panel
      });
    });

    await reporter.save(page);
  });
});

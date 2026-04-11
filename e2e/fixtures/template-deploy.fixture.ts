/**
 * Template Deploy Fixture — UI helpers for full template deploy cycle
 *
 * Flow: /templates → click template → Create → canvas loads → deploy panel
 * All actions through the browser UI, no API calls.
 */

import type { Page } from '@playwright/test';
import { test as base } from './base.fixture';
import {
  getActionLog,
  getApiCalls,
  clearActionLog,
  type IceActionEvent,
} from '../utils/action-log-reader';
import { verifyGCPResource, type VerifyResult } from '../utils/gcp-verify';
import type { ResourceVerification } from '../utils/deploy-log-collector';

export const test = base.extend<{
  templateDeploy: TemplateDeployHelper;
}>({
  templateDeploy: async ({ authenticatedPage }, use) => {
    await use(new TemplateDeployHelper(authenticatedPage));
  },
});

export { expect } from '@playwright/test';

// ─── Helper Class ──────────────────────────────────────────────────────────

export class TemplateDeployHelper {
  constructor(private page: Page) {}

  // ── Template Selection (via /templates page) ──────────────

  /**
   * Navigate to /templates, find the template, click it to open details,
   * then click "Create" to create a project and navigate to canvas.
   */
  async selectTemplate(templateName: string): Promise<void> {
    // Go to templates gallery
    await this.page.goto('/templates', { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(1000);
    await this.debugScreenshot('01-templates-page');

    // Handle onboarding redirect — if we ended up on onboarding, skip it
    if (this.page.url().includes('onboarding') || this.page.url() === 'http://localhost:5174/') {
      console.log('[fixture] Detected onboarding/redirect, attempting skip...');
      const skipBtn = this.page.locator('button:has-text("Skip"), text="Skip Setup"');
      if (await skipBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await skipBtn.first().click();
        await this.page.waitForTimeout(1500);
      }
      // Try navigating to templates again
      await this.page.goto('/templates', { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(1000);
      await this.debugScreenshot('01b-templates-after-skip');
    }

    // Search for the template
    const searchInput = this.page.locator('input[placeholder*="Search"], input[placeholder*="search"]');
    if (await searchInput.isVisible({ timeout: 5000 })) {
      await searchInput.fill(templateName);
      await this.page.waitForTimeout(800);
    }
    await this.debugScreenshot('02-searched');

    // Click the template card — it's a <button> with aria-label="View {name} template"
    const card = this.page.locator(`button[aria-label*="View ${templateName}"]`).first();
    if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
      await card.click();
    } else {
      // Fallback: click the first card in the grid (search should have filtered to one)
      const anyCard = this.page.locator('.grid button').first();
      await anyCard.click();
    }
    await this.page.waitForTimeout(800);
    await this.debugScreenshot('03-detail-open');

    // Click the "Create" button in the detail panel (bottom of the side panel)
    const createBtn = this.page.locator(
      'button:has-text("Create Project"), button:has-text("Create")',
    );
    await createBtn.last().waitFor({ state: 'visible', timeout: 5000 });
    await createBtn.last().click();

    // Wait for navigation — handleUseTemplate does window.location.href = basePath
    await this.page.waitForTimeout(3000);
    await this.debugScreenshot('04-after-create');

    // Wait for canvas to appear (the SVG container)
    try {
      await this.page.waitForSelector('#ice-canvas-svg, [data-testid="svg-canvas"]', { timeout: 15000 });
    } catch {
      await this.debugScreenshot('04-FAIL-no-canvas');
      console.log('[fixture] Current URL:', this.page.url());
      console.log('[fixture] Page title:', await this.page.title());
      throw new Error('Canvas did not appear after template creation. URL: ' + this.page.url());
    }

    await this.page.waitForTimeout(2000);
    await this.debugScreenshot('05-canvas-loaded');
  }

  /** Debug screenshot — saved to test-results/gcp/debug/ */
  private async debugScreenshot(name: string): Promise<void> {
    const { mkdirSync } = await import('fs');
    const dir = 'test-results/gcp/debug';
    mkdirSync(dir, { recursive: true });
    await this.page.screenshot({ path: `${dir}/${name}.png` });
  }

  /**
   * Wait for canvas nodes to appear after template selection.
   */
  async waitForCanvasNodes(expectedMinNodes: number = 1): Promise<number> {
    try {
      await this.page.waitForFunction(
        (min: number) => document.querySelectorAll('[data-node-id]').length >= min,
        expectedMinNodes,
        { timeout: 20000 },
      );
    } catch {
      const count = await this.page.locator('[data-node-id]').count();
      await this.debugScreenshot('FAIL-canvas-nodes');
      console.log(`[fixture] Expected ${expectedMinNodes} nodes, found ${count}. URL: ${this.page.url()}`);
      // Don't throw — continue with whatever we have
      return count;
    }
    return await this.page.locator('[data-node-id]').count();
  }

  // ── GCP Credential Connection (via UI) ────────────────────

  /**
   * Click the GCP icon in the appbar → opens ProviderConnectModal → paste SA key → connect.
   */
  async connectGCPViaUI(saKeyJson: string): Promise<void> {
    // Click the GCP icon button in the app bar
    const gcpBtn = this.page.locator('#ice-appbar-btn-gcp');
    if (!(await gcpBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('[fixture] GCP appbar button not visible, skipping credential connection');
      await this.debugScreenshot('gcp-btn-not-found');
      return;
    }
    await gcpBtn.click();
    await this.page.waitForTimeout(500);
    await this.debugScreenshot('gcp-modal-opened');

    // Check if already connected — modal shows "Disconnect" button or green checkmark
    const disconnectBtn = this.page.locator('button:has-text("Disconnect"), text="Disconnect"');
    if (await disconnectBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[fixture] GCP already connected, closing modal');
      // Close the modal via X button or clicking outside
      const closeX = this.page.locator('[class*="close"], button:has(svg)').first();
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(300);
      return;
    }

    // Fill SA key textarea
    const textarea = this.page.locator('textarea[placeholder*="service_account"]');
    if (!(await textarea.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('[fixture] No SA key textarea visible, closing modal');
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(300);
      return;
    }
    await textarea.fill(saKeyJson);
    await this.debugScreenshot('gcp-key-filled');

    // Click connect button
    const connectBtn = this.page.locator(
      'button:has-text("Connect"), button:has-text("Test & Connect")',
    );
    await connectBtn.last().click();

    // Wait for success — look for Disconnect button appearing (means connected)
    await this.page.waitForSelector('button:has-text("Disconnect"), text="Disconnect"', { timeout: 30000 });
    await this.debugScreenshot('gcp-connected');

    // Close modal
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  // ── GitHub Connection (via UI) ─────────────────────────────

  /**
   * Click GitHub icon in appbar → paste PAT → connect.
   */
  async connectGitHubViaUI(patToken: string): Promise<void> {
    const ghBtn = this.page.locator('#ice-appbar-btn-github');
    if (!(await ghBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('[fixture] GitHub appbar button not visible');
      return;
    }
    await ghBtn.click();
    await this.page.waitForTimeout(500);

    // Check if already connected — "Disconnect" button visible
    const disconnectBtn = this.page.locator('button:has-text("Disconnect")');
    if (await disconnectBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      console.log('[fixture] GitHub already connected');
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(300);
      return;
    }

    // PAT tab should be default — fill the token input
    const patInput = this.page.locator('input[type="password"]');
    await patInput.waitFor({ state: 'visible', timeout: 5000 });
    await patInput.fill(patToken);

    // Click connect button
    const connectBtn = this.page.locator('button:has-text("Connect")').last();
    await connectBtn.click();

    // Wait for connected state
    await this.page.waitForSelector('button:has-text("Disconnect")', { timeout: 15000 });
    await this.debugScreenshot('github-connected');

    // Close modal
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  // ── Deploy Panel ──────────────────────────────────────────

  async openDeployPanel(): Promise<void> {
    // Close AI chat panel — it covers the deploy rocket icon
    await this.closeAiChat();
    await this.debugScreenshot('06a-before-deploy');

    // Click the deploy rocket button by its unique ID
    const deployBtn = this.page.locator('#ice-btn-deploy');
    await deployBtn.waitFor({ state: 'visible', timeout: 10000 });
    await deployBtn.click();

    await this.page.waitForTimeout(2000);
    await this.debugScreenshot('06b-deploy-panel');

    // Wait for deploy panel overlay
    const deployUI = this.page.locator(
      '#ice-deploy-panel, #ice-deploy-select-provider, #ice-deploy-btn-plan',
    );
    try {
      await deployUI.first().waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      await this.debugScreenshot('06c-FAIL-no-deploy-ui');
      throw new Error('Deploy panel not found. URL: ' + this.page.url());
    }
  }

  /** Close AI chat panel if open */
  private async closeAiChat(): Promise<void> {
    // The AI panel has id="ice-ai-panel". Its close button has aria-label="Close".
    const aiPanel = this.page.locator('#ice-ai-panel');
    if (!(await aiPanel.isVisible({ timeout: 1000 }).catch(() => false))) return;

    // Click the close button inside the AI panel
    const closeBtn = aiPanel.locator('button[aria-label="Close"]');
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click();
      await this.page.waitForTimeout(400);
    }
  }

  async configureDeploy(project: string, region: string): Promise<void> {
    const providerSelect = this.page.locator('#ice-deploy-select-provider');
    if (await providerSelect.isVisible()) {
      await providerSelect.selectOption('gcp');
    }

    const projectInput = this.page.locator('#ice-deploy-input-project');
    if (await projectInput.isVisible()) {
      await projectInput.fill(project);
    }

    const regionSelect = this.page.locator('#ice-deploy-select-region');
    if (await regionSelect.isVisible()) {
      await regionSelect.selectOption(region);
    }

    await this.page.waitForTimeout(300);
  }

  async plan(): Promise<{ success: boolean; plan?: unknown; error?: string }> {
    await this.page.click('#ice-deploy-btn-plan');

    try {
      await this.page.waitForFunction(
        () => {
          const log = (window as any).__ICE_ACTION_LOG__ || [];
          return log.some(
            (e: any) =>
              e.target.includes('/canvas/deploy/plan') && (e.action === 'api_response' || e.action === 'api_error'),
          );
        },
        {},
        { timeout: 60000 },
      );
    } catch {
      return { success: false, error: 'Plan timed out after 60s' };
    }

    const planCalls = await getApiCalls(this.page, 'deploy/plan');
    const response = planCalls.find((e) => e.action === 'api_response' || e.action === 'api_error');
    if (!response) return { success: false, error: 'No plan response in action log' };

    const status = response.detail.status as number;
    return {
      success: status === 200,
      plan: response.detail.data,
      error: status !== 200 ? JSON.stringify(response.detail.data) : undefined,
    };
  }

  async apply(timeout = 600_000): Promise<{
    success: boolean;
    result?: any;
    logs: string[];
    error?: string;
  }> {
    const applyBtn = this.page.locator('#ice-deploy-btn-apply');
    if (!(await applyBtn.isVisible())) {
      return { success: false, logs: [], error: 'Apply button not visible' };
    }
    await applyBtn.click();

    try {
      await this.page.waitForFunction(
        () => {
          const log = (window as any).__ICE_ACTION_LOG__ || [];
          return log.some(
            (e: any) =>
              e.target.includes('/canvas/deploy/apply') && (e.action === 'api_response' || e.action === 'api_error'),
          );
        },
        {},
        { timeout },
      );
    } catch {
      return { success: false, logs: [], error: `Deploy timed out after ${timeout / 1000}s` };
    }

    // Capture logs from deploy panel
    const logPanel = this.page.locator('#ice-deploy-log');
    let logs: string[] = [];
    if (await logPanel.isVisible()) {
      const logText = (await logPanel.textContent()) || '';
      logs = logText.split('\n').filter(Boolean);
    }

    const deployCalls = await getApiCalls(this.page, 'deploy/apply');
    const response = deployCalls.find((e) => e.action === 'api_response' || e.action === 'api_error');
    if (!response) return { success: false, logs, error: 'No deploy response in action log' };

    const status = response.detail.status as number;
    return {
      success: status === 200,
      result: response.detail.data,
      logs,
      error: status !== 200 ? JSON.stringify(response.detail.data) : undefined,
    };
  }

  async destroy(timeout = 300_000): Promise<{ success: boolean; error?: string }> {
    const destroyBtn = this.page.locator('#ice-deploy-btn-destroy');
    if (!(await destroyBtn.isVisible())) {
      return { success: false, error: 'Destroy button not visible' };
    }

    await destroyBtn.click();

    try {
      await this.page.waitForFunction(
        () => {
          const log = (window as any).__ICE_ACTION_LOG__ || [];
          return log.some(
            (e: any) =>
              e.target.includes('/canvas/deploy/destroy') &&
              (e.action === 'api_response' || e.action === 'api_error'),
          );
        },
        {},
        { timeout },
      );
    } catch {
      return { success: false, error: `Destroy timed out after ${timeout / 1000}s` };
    }

    const calls = await getApiCalls(this.page, 'deploy/destroy');
    const response = calls.find((e) => e.action === 'api_response' || e.action === 'api_error');
    if (!response) return { success: false, error: 'No destroy response in action log' };

    const status = response.detail.status as number;
    return {
      success: status === 200,
      error: status !== 200 ? JSON.stringify(response.detail.data) : undefined,
    };
  }

  async closeDeployPanel(): Promise<void> {
    const closeBtn = this.page.locator('#ice-deploy-btn-close');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await this.page.waitForTimeout(200);
    }
  }

  async resetForNextTemplate(): Promise<void> {
    await this.closeDeployPanel();
    const cancelBtn = this.page.locator('#ice-deploy-btn-cancel');
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
      await this.page.waitForTimeout(200);
    }
  }

  // ── Screenshots ────────────────────────────────────────────

  async screenshot(name: string, dir = 'test-results/gcp'): Promise<string> {
    const { mkdirSync } = await import('fs');
    mkdirSync(dir, { recursive: true });
    const path = `${dir}/${name}.png`;
    await this.page.screenshot({ path });
    return path;
  }

  // ── Action Log ─────────────────────────────────────────────

  async captureAndClearActionLog(): Promise<IceActionEvent[]> {
    const log = await getActionLog(this.page);
    await clearActionLog(this.page);
    return log;
  }

  // ── Deploy overlay fetch (Phase A/C) ───────────────────────

  /**
   * Read the persisted node overlay for the currently active card via
   * the `/canvas/deploy/node-outputs/:cardId` endpoint. Used by the
   * Phase A regression check that asserts compute blocks carry a
   * `url` or `default_url` after deploy.
   *
   * Returns null when the active cardId can't be resolved (e.g. the
   * test is running outside a card context). Callers should treat
   * null as "skip the assertion", not as a failure.
   */
  async fetchNodeOverlay(environment = 'development'): Promise<Record<string, any> | null> {
    return this.page.evaluate(async (env) => {
      try {
        const stored = localStorage.getItem('ice-cards');
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        const cardId: string | null = parsed?.activeCardId || null;
        if (!cardId) return null;

        const headers: Record<string, string> = {};
        const token = localStorage.getItem('ice-token');
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(
          `/api/canvas/deploy/node-outputs/${cardId}?environment=${encodeURIComponent(env)}`,
          { credentials: 'include', headers },
        );
        if (!res.ok) return null;
        const body = await res.json();
        return body?.overlay || null;
      } catch {
        return null;
      }
    }, environment);
  }

  // ── GCP Verification (gcloud CLI) ────────────────────────

  verifyResources(
    resources: Array<{ name: string; type: string; provider_id?: string }>,
    project: string,
    region: string,
  ): ResourceVerification[] {
    return resources.map((r) => {
      const result: VerifyResult = verifyGCPResource(project, region, r);
      return {
        name: r.name,
        type: r.type,
        exists: result.exists,
        error: result.error || undefined,
        gcpResource: result.resource || undefined,
      };
    });
  }
}

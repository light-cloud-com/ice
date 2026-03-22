import { type Page } from '@playwright/test';

export class CanvasPageObject {
  constructor(private page: Page) {}

  get canvas() {
    return this.page.locator('[data-testid="svg-canvas"]');
  }
  get palette() {
    return this.page.locator('[data-testid="resource-palette"]');
  }
  get toolbar() {
    return this.page.locator('[data-testid="toolbar"]');
  }

  async goto(projectId?: string) {
    await this.page.goto(projectId ? `/project/${projectId}` : '/');
  }

  async waitForReady() {
    await this.canvas.waitFor({ state: 'visible' });
  }

  async getNodeByType(iceType: string) {
    return this.page.locator(`[data-node-id][data-ice-type="${iceType}"]`);
  }

  async getAllNodes() {
    return this.page.locator('[data-node-id]').all();
  }

  async openDeployPanel() {
    await this.toolbar.locator('button[title="Deploy"]').click();
  }
}

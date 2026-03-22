import { type Page } from '@playwright/test';

export class DeployPageObject {
  constructor(private page: Page) {}

  get panel() {
    return this.page.locator('[data-testid="deploy-panel"]');
  }
  get deployButton() {
    return this.page.locator('[data-testid="deploy-button"]');
  }
  get status() {
    return this.page.locator('[data-testid="deploy-status"]');
  }
  get log() {
    return this.page.locator('[data-testid="deploy-log"]');
  }

  async selectProject(projectId: string) {
    await this.page.fill('input[placeholder*="project"]', projectId);
  }

  async clickDeploy() {
    await this.deployButton.click();
  }

  async waitForComplete() {
    await this.page.waitForSelector('[data-testid="deploy-status"]:has-text("success")', {
      timeout: 30_000,
    });
  }

  async getStatus() {
    return this.status.textContent();
  }
}
